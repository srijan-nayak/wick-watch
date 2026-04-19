from __future__ import annotations
from .ast_nodes import (
    PatternAST, BoolNode, BoolProp, Comparison, LogicalAnd, LogicalOr,
    CandleField, IndicatorCall, NumberLiteral, BinaryArith, ValueNode,
)
from indicators.registry import INDICATORS, Param


class ValidationError(Exception):
    pass


def validate(ast: PatternAST) -> None:
    """Raise ValidationError if the AST references unknown indicators or invalid params."""
    for condition in ast.conditions:
        _validate_bool(condition)


def _validate_bool(node: BoolNode) -> None:
    if isinstance(node, BoolProp):
        return
    if isinstance(node, Comparison):
        _validate_value(node.left)
        _validate_value(node.right)
    elif isinstance(node, (LogicalAnd, LogicalOr)):
        _validate_bool(node.left)
        _validate_bool(node.right)


def _validate_value(node: ValueNode) -> None:
    if isinstance(node, (CandleField, NumberLiteral)):
        return
    if isinstance(node, IndicatorCall):
        _validate_indicator(node)
    elif isinstance(node, BinaryArith):
        _validate_value(node.left)
        _validate_value(node.right)


def _validate_indicator(call: IndicatorCall) -> None:
    if call.name not in INDICATORS:
        raise ValidationError(
            f"Unknown indicator '{call.name}'. "
            f"Available: {sorted(INDICATORS.keys())}"
        )

    indicator = INDICATORS[call.name]
    expected_params: dict[str, Param] = indicator.params

    # check for unknown param names
    for key in call.params:
        if key not in expected_params:
            raise ValidationError(
                f"Indicator '{call.name}' has no param '{key}'. "
                f"Valid params: {sorted(expected_params.keys())}"
            )

    # check all required params are provided
    for key, param in expected_params.items():
        if key == "candle":
            # candle is always provided via the AST candle_index, not in params dict
            continue
        if key not in call.params and not param.has_default():
            raise ValidationError(
                f"Indicator '{call.name}' requires param '{key}' but it was not provided"
            )

    # check param types
    for key, value in call.params.items():
        expected_type = expected_params[key].type
        if expected_type == int and not isinstance(value, int):
            raise ValidationError(
                f"Indicator '{call.name}' param '{key}' must be an int, got {value!r}"
            )
        if expected_type == float and not isinstance(value, (int, float)):
            raise ValidationError(
                f"Indicator '{call.name}' param '{key}' must be a number, got {value!r}"
            )
