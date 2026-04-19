"""Tests for arithmetic expression support in the DSL."""
import pytest
import pandas as pd
from dsl.parser import parse, ParseError
from dsl.ast_nodes import (
    BinaryArith, CandleField, NumberLiteral, Comparison, BoolProp,
    LogicalAnd,
)
from dsl.validator import validate
from dsl.compiler import compile_pattern
from executor.engine import run
from dsl.compiler import CompiledPattern


# ─── helpers ──────────────────────────────────────────────────────────────────

def _candles(rows: list[dict]) -> pd.DataFrame:
    df = pd.DataFrame(rows)
    df.index = pd.date_range("2024-01-01", periods=len(df), freq="1min", tz="UTC")
    return df


def _run_expr(dsl: str, rows: list[dict]) -> list:
    ast = parse(dsl)
    validate(ast)
    compiled = compile_pattern(ast)
    return run(compiled, _candles(rows))


# ─── lexer ────────────────────────────────────────────────────────────────────

class TestArithLexer:
    def test_arith_tokens_tokenized(self):
        from dsl.lexer import tokenize, TokenType
        tokens = tokenize("c1.close - c1.open")
        types = [t.type for t in tokens if t.type != TokenType.EOF]
        assert TokenType.ARITH in types

    def test_all_arith_ops(self):
        from dsl.lexer import tokenize, TokenType
        for op in ('+', '-', '*', '/'):
            tokens = tokenize(f"c1.close {op} 2")
            arith = [t for t in tokens if t.type == TokenType.ARITH]
            assert len(arith) == 1
            assert arith[0].value == op


# ─── parser ───────────────────────────────────────────────────────────────────

class TestArithParser:
    def test_subtraction_left(self):
        ast = parse("c3.close - c3.open < 10")
        cmp = ast.conditions[0]
        assert isinstance(cmp, Comparison)
        assert isinstance(cmp.left, BinaryArith)
        assert cmp.left.op == '-'
        assert isinstance(cmp.left.left, CandleField)
        assert isinstance(cmp.left.right, CandleField)
        assert isinstance(cmp.right, NumberLiteral)

    def test_multiply_right(self):
        ast = parse("c1.close > c1.open * 1.02")
        cmp = ast.conditions[0]
        assert isinstance(cmp.right, BinaryArith)
        assert cmp.right.op == '*'

    def test_parens_arith_group(self):
        ast = parse("(c3.close - c3.open) * 2 < (c3.open - c3.low)")
        cmp = ast.conditions[0]
        assert isinstance(cmp, Comparison)
        # left: BinaryArith(BinaryArith(close-open), *, 2)
        assert isinstance(cmp.left, BinaryArith)
        assert cmp.left.op == '*'
        assert isinstance(cmp.left.left, BinaryArith)  # (close - open)
        assert cmp.left.left.op == '-'
        # right: BinaryArith(open - low)
        assert isinstance(cmp.right, BinaryArith)
        assert cmp.right.op == '-'

    def test_operator_precedence_mul_before_add(self):
        # c1.close + c1.open * 2  →  close + (open * 2)
        ast = parse("c1.close + c1.open * 2 > 100")
        cmp = ast.conditions[0]
        left = cmp.left
        assert isinstance(left, BinaryArith)
        assert left.op == '+'
        assert isinstance(left.right, BinaryArith)
        assert left.right.op == '*'

    def test_operator_precedence_parens_override(self):
        # (c1.close + c1.open) * 2
        ast = parse("(c1.close + c1.open) * 2 > 100")
        cmp = ast.conditions[0]
        left = cmp.left
        assert isinstance(left, BinaryArith)
        assert left.op == '*'
        assert isinstance(left.left, BinaryArith)
        assert left.left.op == '+'

    def test_boolean_group_still_works(self):
        ast = parse("(c1.is_green OR c2.is_green) AND c3.is_red")
        from dsl.ast_nodes import LogicalAnd, LogicalOr
        node = ast.conditions[0]
        assert isinstance(node, LogicalAnd)
        assert isinstance(node.left, LogicalOr)

    def test_parens_bool_comparison_still_works(self):
        ast = parse("(c1.close > c2.close) AND c1.is_green")
        node = ast.conditions[0]
        assert isinstance(node, LogicalAnd)
        assert isinstance(node.left, Comparison)

    def test_arith_with_indicator(self):
        ast = parse("c1.close - ema(candle=1, period=20) > 0")
        cmp = ast.conditions[0]
        assert isinstance(cmp.left, BinaryArith)
        assert cmp.left.op == '-'

    def test_division(self):
        ast = parse("c1.close / c1.open > 1.02")
        cmp = ast.conditions[0]
        assert isinstance(cmp.left, BinaryArith)
        assert cmp.left.op == '/'

    def test_chained_arithmetic(self):
        ast = parse("c1.high - c1.low - c1.close > 0")
        cmp = ast.conditions[0]
        # left-associative: (high - low) - close
        left = cmp.left
        assert isinstance(left, BinaryArith)
        assert left.op == '-'
        assert isinstance(left.left, BinaryArith)

    def test_arithmetic_both_sides(self):
        ast = parse("c1.high - c1.low > c1.close - c1.open")
        cmp = ast.conditions[0]
        assert isinstance(cmp.left, BinaryArith)
        assert isinstance(cmp.right, BinaryArith)


# ─── executor ─────────────────────────────────────────────────────────────────

ROWS = [
    {"open": 100.0, "high": 115.0, "low": 95.0,  "close": 110.0, "volume": 1000},
    {"open": 105.0, "high": 120.0, "low": 100.0, "close": 108.0, "volume": 1200},
    {"open": 108.0, "high": 125.0, "low": 102.0, "close": 118.0, "volume": 900},
]


class TestArithExecutor:
    def test_subtraction_match(self):
        # c1.close - c1.open = 110 - 100 = 10 > 5 → match
        matches = _run_expr("c1.close - c1.open > 5", ROWS)
        assert len(matches) >= 1

    def test_subtraction_no_match(self):
        # c1.close - c1.open = 10, not > 50
        matches = _run_expr("c1.close - c1.open > 50", ROWS)
        assert len(matches) == 0

    def test_multiplication(self):
        # c1.open * 1.05 = 105 < c1.close = 110 → match on first row
        matches = _run_expr("c1.close > c1.open * 1.05", ROWS)
        assert len(matches) >= 1

    def test_parens_arith(self):
        # (c1.close - c1.open) * 2 < (c1.high - c1.low)
        # row 0: (110-100)*2=20  vs  115-95=20  → 20 < 20 is False
        # row 1: (108-105)*2=6   vs  120-100=20 → 6 < 20  is True
        matches = _run_expr("(c1.close - c1.open) * 2 < (c1.high - c1.low)", ROWS)
        assert len(matches) >= 1

    def test_division(self):
        # c1.close / c1.open > 1.05: 110/100=1.1 > 1.05 → match
        matches = _run_expr("c1.close / c1.open > 1.05", ROWS)
        assert len(matches) >= 1

    def test_division_by_zero_skipped(self):
        # Force open=0 so division by zero is hit; should be skipped gracefully
        rows = [{"open": 0.0, "high": 10.0, "low": 0.0, "close": 5.0, "volume": 100}]
        matches = _run_expr("c1.close / c1.open > 1", rows)
        assert matches == []

    def test_exact_user_example(self):
        # (c3.close - c3.open) * 2 < (c3.open - c3.low)
        # Need at least 3 candles; use row index 2 as c1, row 1 as c2, row 0 as c3
        # Here c1=row2, c2=row1, c3=row0:
        #   c3.close=110, c3.open=100, c3.low=95
        #   (110-100)*2=20,  (100-95)=5  → 20 < 5 is False
        # Try rows where the condition is True:
        rows = [
            {"open": 100.0, "high": 115.0, "low": 99.0,  "close": 101.0, "volume": 1000},
            {"open": 105.0, "high": 120.0, "low": 100.0, "close": 108.0, "volume": 1200},
            {"open": 108.0, "high": 125.0, "low": 102.0, "close": 118.0, "volume": 900},
        ]
        # c3=rows[0]: close=101, open=100, low=99
        # (101-100)*2=2 < (100-99)=1 → False
        # Let's try a row where it IS true:
        rows_true = [
            {"open": 100.0, "high": 115.0, "low": 97.0,  "close": 101.0, "volume": 1000},
            {"open": 105.0, "high": 120.0, "low": 100.0, "close": 108.0, "volume": 1200},
            {"open": 108.0, "high": 125.0, "low": 102.0, "close": 118.0, "volume": 900},
        ]
        # c3=rows_true[0]: close=101, open=100, low=97
        # (101-100)*2=2 < (100-97)=3 → True ✓
        matches = _run_expr(
            "(c3.close - c3.open) * 2 < (c3.open - c3.low)", rows_true
        )
        assert len(matches) >= 1

    def test_arith_combined_with_bool_prop(self):
        matches = _run_expr(
            "c1.is_green AND c1.close - c1.open > 5",
            ROWS,
        )
        assert len(matches) >= 1
