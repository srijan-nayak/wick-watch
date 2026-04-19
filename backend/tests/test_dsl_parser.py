import pytest
from dsl.parser import parse, ParseError
from dsl.ast_nodes import (
    PatternAST, BoolProp, Comparison, LogicalAnd, LogicalOr,
    CandleField, IndicatorCall, NumberLiteral,
)


class TestBoolProps:
    def test_is_green(self):
        ast = parse("c1.is_green")
        assert len(ast.conditions) == 1
        node = ast.conditions[0]
        assert isinstance(node, BoolProp)
        assert node.candle_index == 1
        assert node.prop == "is_green"

    def test_is_red(self):
        node = parse("c2.is_red").conditions[0]
        assert isinstance(node, BoolProp)
        assert node.candle_index == 2

    def test_is_doji(self):
        node = parse("c3.is_doji").conditions[0]
        assert isinstance(node, BoolProp)
        assert node.candle_index == 3


class TestComparisons:
    def test_candle_field_vs_candle_field(self):
        node = parse("c1.high < c3.low").conditions[0]
        assert isinstance(node, Comparison)
        assert node.op == "<"
        assert isinstance(node.left, CandleField)
        assert node.left.candle_index == 1
        assert node.left.field == "high"
        assert isinstance(node.right, CandleField)
        assert node.right.candle_index == 3
        assert node.right.field == "low"

    def test_candle_field_vs_number(self):
        node = parse("c1.close > 100").conditions[0]
        assert isinstance(node, Comparison)
        assert isinstance(node.right, NumberLiteral)
        assert node.right.value == 100.0

    def test_all_ops(self):
        for op in ("<", ">", "<=", ">=", "!=", "="):
            node = parse(f"c1.close {op} c2.open").conditions[0]
            assert isinstance(node, Comparison)
            assert node.op == op

    def test_indicator_on_left(self):
        node = parse("ema(candle=1, period=20) > c1.close").conditions[0]
        assert isinstance(node, Comparison)
        assert isinstance(node.left, IndicatorCall)
        assert node.left.name == "ema"
        assert node.left.params == {"candle": 1, "period": 20}

    def test_indicator_on_right(self):
        node = parse("c1.high < bb_upper(candle=1, period=20, std=2.0)").conditions[0]
        assert isinstance(node, Comparison)
        assert isinstance(node.right, IndicatorCall)
        assert node.right.params["std"] == 2.0


class TestIndicatorCall:
    def test_named_params_parsed(self):
        node = parse("rsi(candle=1, period=14) < 30").conditions[0]
        call = node.left
        assert isinstance(call, IndicatorCall)
        assert call.name == "rsi"
        assert call.params == {"candle": 1, "period": 14}

    def test_float_param(self):
        node = parse("bb_upper(candle=1, period=20, std=2.5) > c1.high").conditions[0]
        assert node.left.params["std"] == 2.5


class TestLogic:
    def test_implicit_and_across_lines(self):
        ast = parse("c1.is_green\nc2.is_red")
        assert len(ast.conditions) == 2

    def test_explicit_and(self):
        node = parse("c1.is_green AND c2.is_red").conditions[0]
        assert isinstance(node, LogicalAnd)
        assert isinstance(node.left, BoolProp)
        assert isinstance(node.right, BoolProp)

    def test_explicit_or(self):
        node = parse("c1.is_green OR c2.is_green").conditions[0]
        assert isinstance(node, LogicalOr)

    def test_parenthesized_or(self):
        node = parse("(c1.is_green OR c2.is_green) AND c3.is_red").conditions[0]
        assert isinstance(node, LogicalAnd)
        assert isinstance(node.left, LogicalOr)
        assert isinstance(node.right, BoolProp)

    def test_or_lower_precedence_than_and(self):
        # a AND b OR c AND d  →  (a AND b) OR (c AND d)
        node = parse("c1.is_green AND c2.is_red OR c3.is_green AND c1.is_red").conditions[0]
        assert isinstance(node, LogicalOr)
        assert isinstance(node.left, LogicalAnd)
        assert isinstance(node.right, LogicalAnd)


class TestMultiLinePattern:
    def test_full_bullish_engulfing(self):
        src = """
c2.is_red
c1.is_green
c1.open < c2.close
c1.close > c2.open
"""
        ast = parse(src)
        assert len(ast.conditions) == 4

    def test_comments_ignored(self):
        src = """
# check for reversal
c1.is_green
# volume spike
c1.volume > avg_volume(candle=1, period=10)
"""
        ast = parse(src)
        assert len(ast.conditions) == 2


class TestErrors:
    def test_empty_pattern(self):
        with pytest.raises(ParseError, match="empty"):
            parse("")

    def test_unknown_candle_attr(self):
        with pytest.raises(ParseError, match="not a valid candle attribute"):
            parse("c1.color")

    def test_missing_rparen(self):
        with pytest.raises(ParseError):
            parse("(c1.is_green AND c2.is_red")

    def test_candle_index_zero(self):
        with pytest.raises(ParseError, match="candle index must be >= 1"):
            parse("c0.high > c1.low")
