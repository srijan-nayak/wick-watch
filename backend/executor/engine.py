from __future__ import annotations
import math
import pandas as pd
from dsl.ast_nodes import (
    PatternAST, BoolNode, BoolProp, Comparison, LogicalAnd, LogicalOr,
    CandleField, IndicatorCall, NumberLiteral, ValueNode,
)
from dsl.compiler import CompiledPattern
from indicators.registry import INDICATORS


class EvalError(Exception):
    pass


def run(compiled: CompiledPattern, df: pd.DataFrame) -> list[pd.Timestamp]:
    """
    Slide the pattern window across df and return timestamps of candles (c1)
    where the pattern matched.

    df must have columns: open, high, low, close, volume
    and a DatetimeIndex sorted ascending (oldest first).

    Extra lookback candles must already be included in df — the caller is
    responsible for fetching window_size + lookback rows.
    """
    required = compiled.window_size + compiled.lookback
    if len(df) < required:
        return []

    matches: list[pd.Timestamp] = []

    # Slide: the window's newest candle (c1) moves from index `required-1` to end
    for end_idx in range(required - 1, len(df)):
        start_idx = end_idx - required + 1
        slice_df = df.iloc[start_idx : end_idx + 1]

        try:
            if _eval_pattern(compiled.ast, slice_df, compiled.window_size):
                matches.append(df.index[end_idx])
        except EvalError:
            # NaN in indicator or degenerate candle — skip this window
            continue

    return matches


def _eval_pattern(ast: PatternAST, slice_df: pd.DataFrame, window_size: int) -> bool:
    return all(_eval_bool(cond, slice_df, window_size) for cond in ast.conditions)


def _eval_bool(node: BoolNode, df: pd.DataFrame, ws: int) -> bool:
    if isinstance(node, BoolProp):
        return _eval_bool_prop(node, df, ws)
    if isinstance(node, Comparison):
        left = _eval_value(node.left, df, ws)
        right = _eval_value(node.right, df, ws)
        return _compare(left, node.op, right)
    if isinstance(node, LogicalAnd):
        return _eval_bool(node.left, df, ws) and _eval_bool(node.right, df, ws)
    if isinstance(node, LogicalOr):
        return _eval_bool(node.left, df, ws) or _eval_bool(node.right, df, ws)
    raise EvalError(f"Unknown bool node type: {type(node)}")


def _eval_bool_prop(node: BoolProp, df: pd.DataFrame, ws: int) -> bool:
    row = _candle_row(df, node.candle_index)
    if node.prop == "is_green":
        return float(row["close"]) > float(row["open"])
    if node.prop == "is_red":
        return float(row["close"]) < float(row["open"])
    if node.prop == "is_doji":
        body = abs(float(row["close"]) - float(row["open"]))
        wick = float(row["high"]) - float(row["low"])
        return (body / wick < 0.1) if wick > 0 else True
    raise EvalError(f"Unknown bool prop: {node.prop}")


def _eval_value(node: ValueNode, df: pd.DataFrame, ws: int) -> float:
    if isinstance(node, NumberLiteral):
        return node.value
    if isinstance(node, CandleField):
        row = _candle_row(df, node.candle_index)
        return float(row[node.field])
    if isinstance(node, IndicatorCall):
        return _eval_indicator(node, df)
    raise EvalError(f"Unknown value node type: {type(node)}")


def _eval_indicator(call: IndicatorCall, df: pd.DataFrame) -> float:
    indicator = INDICATORS[call.name]

    # resolve defaults for params not explicitly provided
    resolved = dict(call.params)
    for key, param in indicator.params.items():
        if key not in resolved and param.has_default():
            resolved[key] = param.default

    candle_idx = int(resolved.get("candle", 1))
    series: pd.Series = indicator.compute(df, resolved)

    # candle_idx=1 → last row, candle_idx=2 → second-to-last, etc.
    pos = len(series) - candle_idx
    if pos < 0 or pos >= len(series):
        raise EvalError(f"Candle index {candle_idx} out of range for series of length {len(series)}")

    value = series.iloc[pos]
    if _is_nan(value):
        raise EvalError(f"Indicator '{call.name}' returned NaN at candle {candle_idx} — insufficient data")

    return float(value)


def _candle_row(df: pd.DataFrame, candle_index: int) -> pd.Series:
    """candle_index=1 → last row (most recent), 2 → second-to-last, etc."""
    pos = len(df) - candle_index
    if pos < 0:
        raise EvalError(f"Candle index {candle_index} out of range for DataFrame of length {len(df)}")
    return df.iloc[pos]


def _compare(left: float, op: str, right: float) -> bool:
    if op == "<":  return left < right
    if op == ">":  return left > right
    if op == "<=": return left <= right
    if op == ">=": return left >= right
    if op == "=":  return math.isclose(left, right, rel_tol=1e-9)
    if op == "!=": return not math.isclose(left, right, rel_tol=1e-9)
    raise EvalError(f"Unknown operator: {op!r}")


def _is_nan(value) -> bool:
    try:
        return math.isnan(float(value))
    except (TypeError, ValueError):
        return True
