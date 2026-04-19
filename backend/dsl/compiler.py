from __future__ import annotations
from dataclasses import dataclass
from .ast_nodes import (
    PatternAST, BoolNode, BoolProp, Comparison, LogicalAnd, LogicalOr,
    CandleField, IndicatorCall, NumberLiteral, ValueNode,
)
from indicators.registry import INDICATORS


@dataclass
class CompiledPattern:
    ast: PatternAST
    window_size: int    # number of candles the pattern looks at (max candle index)
    lookback: int       # extra historical candles needed for indicator warmup


def compile_pattern(ast: PatternAST) -> CompiledPattern:
    """
    Walk the AST to determine:
    - window_size: the highest candle index referenced (e.g. c3 → 3)
    - lookback: max indicator lookback across all indicator calls
    """
    indicator_calls: list[IndicatorCall] = []
    max_candle_index = 0

    for condition in ast.conditions:
        _collect(condition, indicator_calls, lambda idx: None)

    # re-collect candle indices
    indices: list[int] = []
    for condition in ast.conditions:
        _collect_indices(condition, indices)

    max_candle_index = max(indices) if indices else 1

    lookback = 0
    for call in indicator_calls:
        indicator = INDICATORS[call.name]
        # resolve params: fill in defaults for anything not explicitly provided
        resolved = _resolve_params(call, indicator)
        lb = indicator.lookback(resolved)
        lookback = max(lookback, lb)

    return CompiledPattern(
        ast=ast,
        window_size=max_candle_index,
        lookback=lookback,
    )


def _resolve_params(call: IndicatorCall, indicator) -> dict:
    resolved = {}
    for key, param in indicator.params.items():
        if key == "candle":
            resolved[key] = call.params.get("candle", 1)
        elif key in call.params:
            resolved[key] = call.params[key]
        elif param.has_default():
            resolved[key] = param.default
    return resolved


def _collect(node: BoolNode, calls: list[IndicatorCall], _) -> None:
    if isinstance(node, BoolProp):
        return
    if isinstance(node, Comparison):
        _collect_value(node.left, calls)
        _collect_value(node.right, calls)
    elif isinstance(node, (LogicalAnd, LogicalOr)):
        _collect(node.left, calls, _)
        _collect(node.right, calls, _)


def _collect_value(node: ValueNode, calls: list[IndicatorCall]) -> None:
    if isinstance(node, IndicatorCall):
        calls.append(node)


def _collect_indices(node: BoolNode, indices: list[int]) -> None:
    if isinstance(node, BoolProp):
        indices.append(node.candle_index)
    elif isinstance(node, Comparison):
        _collect_value_indices(node.left, indices)
        _collect_value_indices(node.right, indices)
    elif isinstance(node, (LogicalAnd, LogicalOr)):
        _collect_indices(node.left, indices)
        _collect_indices(node.right, indices)


def _collect_value_indices(node: ValueNode, indices: list[int]) -> None:
    if isinstance(node, CandleField):
        indices.append(node.candle_index)
    elif isinstance(node, IndicatorCall):
        candle = node.params.get("candle", 1)
        indices.append(int(candle))
