import math
import pytest
import pandas as pd
import numpy as np
from dsl.parser import parse
from dsl.compiler import compile_pattern
from executor.engine import run, EvalError


# ------------------------------------------------------------------ helpers

def make_df(rows: list[tuple]) -> pd.DataFrame:
    """rows: list of (open, high, low, close, volume), oldest first."""
    idx = pd.date_range("2024-01-01 09:15", periods=len(rows), freq="5min")
    return pd.DataFrame(rows, columns=["open", "high", "low", "close", "volume"], index=idx)


def run_pattern(dsl: str, rows: list[tuple]) -> list[pd.Timestamp]:
    ast = parse(dsl)
    compiled = compile_pattern(ast)
    df = make_df(rows)
    return run(compiled, df)


def match_indices(dsl: str, rows: list[tuple]) -> list[int]:
    """Return 0-based row indices where the pattern matched."""
    df = make_df(rows)
    ast = parse(dsl)
    compiled = compile_pattern(ast)
    timestamps = run(compiled, df)
    return [df.index.get_loc(ts) for ts in timestamps]


# ------------------------------------------------------------------ bool props

class TestBoolProps:
    def test_is_green_matches(self):
        # open=10, close=12 → green
        idxs = match_indices("c1.is_green", [(10, 15, 9, 12, 100)])
        assert idxs == [0]

    def test_is_green_no_match(self):
        # open=12, close=10 → red
        idxs = match_indices("c1.is_green", [(12, 15, 9, 10, 100)])
        assert idxs == []

    def test_is_red_matches(self):
        idxs = match_indices("c1.is_red", [(12, 15, 9, 10, 100)])
        assert idxs == [0]

    def test_is_doji(self):
        # body = |11 - 10| = 1, wick = 20 - 5 = 15, ratio = 0.067 < 0.1 → doji
        idxs = match_indices("c1.is_doji", [(10, 20, 5, 11, 100)])
        assert idxs == [0]

    def test_is_doji_not_matched(self):
        # body = |20 - 10| = 10, wick = 25 - 5 = 20, ratio = 0.5 → not doji
        idxs = match_indices("c1.is_doji", [(10, 25, 5, 20, 100)])
        assert idxs == []


# ------------------------------------------------------------------ comparisons

class TestComparisons:
    def test_high_lt_other_high(self):
        # c1.high < c2.high: row0.high=20 (c2), row1.high=15 (c1) → 15 < 20 ✓
        rows = [(10, 20, 9, 11, 100), (10, 15, 9, 11, 100)]
        idxs = match_indices("c1.high < c2.high", rows)
        assert idxs == [1]

    def test_close_gt_number(self):
        rows = [(10, 15, 9, 50, 100), (10, 15, 9, 30, 100)]
        idxs = match_indices("c1.close > 40", rows)
        assert idxs == [0]

    def test_all_comparison_ops(self):
        rows = [(10, 15, 9, 10, 100)]  # open == close
        assert match_indices("c1.close = c1.open", rows) == [0]
        assert match_indices("c1.close != c1.high", rows) == [0]
        assert match_indices("c1.close <= c1.open", rows) == [0]
        assert match_indices("c1.close >= c1.open", rows) == [0]


# ------------------------------------------------------------------ sliding window

class TestSlidingWindow:
    def test_pattern_matches_at_correct_positions(self):
        # c1.is_green AND c2.is_red: look for red then green (oldest→newest)
        rows = [
            (12, 15, 9, 10, 100),   # row0: red (c2 when row1 is c1)
            (10, 15, 9, 14, 100),   # row1: green ← match here
            (10, 15, 9, 8,  100),   # row2: red  (c2 when row3 is c1... but no row3)
        ]
        idxs = match_indices("c1.is_green AND c2.is_red", rows)
        assert idxs == [1]

    def test_multiple_matches(self):
        # alternating red/green → matches at every even index (starting from 1)
        rows = [
            (12, 15, 9, 10, 100),  # red
            (10, 15, 9, 14, 100),  # green ← match
            (12, 15, 9, 10, 100),  # red
            (10, 15, 9, 14, 100),  # green ← match
            (12, 15, 9, 10, 100),  # red
            (10, 15, 9, 14, 100),  # green ← match
        ]
        idxs = match_indices("c1.is_green AND c2.is_red", rows)
        assert idxs == [1, 3, 5]

    def test_insufficient_data_returns_empty(self):
        # pattern needs 3 candles but only 2 provided
        rows = [(10, 15, 9, 14, 100), (10, 15, 9, 14, 100)]
        idxs = match_indices("c1.is_green\nc2.is_green\nc3.is_green", rows)
        assert idxs == []


# ------------------------------------------------------------------ indicators

class TestIndicators:
    def _trending_close(self, n: int, start: float = 100.0, step: float = 1.0) -> list[tuple]:
        """Steadily rising candles — useful for EMA tests."""
        return [(s, s + 2, s - 1, s, 1000) for s in (start + i * step for i in range(n))]

    def test_ema_comparison(self):
        # Rising prices: after warmup, close should be above a short EMA
        # with enough steady rise, close > ema(period=3)
        rows = self._trending_close(30, start=100.0, step=1.0)
        df = make_df(rows)
        ast = parse("c1.close > ema(candle=1, period=3)")
        compiled = compile_pattern(ast)
        matches = run(compiled, df)
        # At least some matches expected after warmup
        assert len(matches) > 0

    def test_rsi_below_threshold(self):
        # Falling prices → RSI should go below 50
        rows = [(s, s + 1, s - 1, s, 1000) for s in reversed(range(50, 80))]
        df = make_df(rows)
        ast = parse("rsi(candle=1, period=14) < 50")
        compiled = compile_pattern(ast)
        matches = run(compiled, df)
        assert len(matches) > 0

    def test_nan_indicator_skipped(self):
        # Only 2 rows but EMA period=20 → all NaN → no matches, no crash
        rows = self._trending_close(2)
        df = make_df(rows)
        ast = parse("ema(candle=1, period=20) > c1.close")
        compiled = compile_pattern(ast)
        matches = run(compiled, df)
        assert matches == []


# ------------------------------------------------------------------ logic

class TestLogic:
    def test_implicit_and(self):
        # Both conditions must hold
        rows = [
            (12, 15, 9, 10, 100),   # red: matches is_red but not is_doji-body
            (10, 10, 10, 10, 100),  # doji + not is_red (equal)
            (12, 25, 5, 10, 1000),  # red + doji (body=2, wick=20 → 0.1 → boundary)
        ]
        # A clear doji-red: body=1, wick=15 → 0.067
        rows2 = [(11, 20, 5, 10, 100)]
        idxs = match_indices("c1.is_red\nc1.is_doji", rows2)
        assert idxs == [0]

    def test_explicit_or(self):
        rows = [
            (10, 15, 9, 14, 100),  # green
            (14, 15, 9, 10, 100),  # red
        ]
        idxs = match_indices("c1.is_green OR c1.is_red", rows)
        assert idxs == [0, 1]

    def test_grouped_or_with_and(self):
        # (c1.is_green OR c2.is_green) AND c1.close > 12
        rows = [
            (10, 15, 9, 11, 100),  # green c2
            (10, 15, 9, 15, 100),  # green c1 with close=15 > 12 ← match
        ]
        idxs = match_indices("(c1.is_green OR c2.is_green) AND c1.close > 12", rows)
        assert idxs == [1]


# ------------------------------------------------------------------ full pattern

class TestFullPattern:
    def test_bullish_engulfing(self):
        dsl = """
c2.is_red
c1.is_green
c1.open < c2.close
c1.close > c2.open
"""
        rows = [
            (14, 16, 9, 10, 500),   # c2: red, open=14 close=10
            (9,  17, 8, 15, 800),   # c1: green, open=9 < c2.close=10 ✓, close=15 > c2.open=14 ✓
        ]
        idxs = match_indices(dsl, rows)
        assert idxs == [1]

    def test_bullish_engulfing_no_match_wrong_direction(self):
        dsl = "c2.is_red\nc1.is_green\nc1.open < c2.close\nc1.close > c2.open"
        rows = [
            (10, 16, 9, 14, 500),   # c2: green (not red)
            (9,  17, 8, 15, 800),   # c1: green
        ]
        idxs = match_indices(dsl, rows)
        assert idxs == []
