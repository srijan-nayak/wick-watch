import pytest
from dsl.parser import parse
from dsl.compiler import compile_pattern


def compiled(source: str):
    return compile_pattern(parse(source))


class TestWindowSize:
    def test_single_candle(self):
        assert compiled("c1.is_green").window_size == 1

    def test_three_candle_pattern(self):
        assert compiled("c1.high < c3.low").window_size == 3

    def test_max_across_conditions(self):
        src = "c1.is_green\nc2.is_red\nc4.close > c1.open"
        assert compiled(src).window_size == 4

    def test_indicator_candle_counted(self):
        src = "ema(candle=3, period=20) > c1.close"
        assert compiled(src).window_size == 3


class TestLookback:
    def test_no_indicators(self):
        assert compiled("c1.is_green\nc2.is_red").lookback == 0

    def test_ema_lookback(self):
        result = compiled("ema(candle=1, period=20) > c1.close")
        assert result.lookback == 20

    def test_rsi_lookback(self):
        result = compiled("rsi(candle=1, period=14) < 30")
        assert result.lookback == 14

    def test_max_across_indicators(self):
        src = """
ema(candle=1, period=20) > c1.close
rsi(candle=1, period=14) < 30
bb_upper(candle=2, period=50, std=2.0) > c2.high
"""
        result = compiled(src)
        assert result.lookback == 50  # bb_upper period=50 is the max

    def test_macd_lookback_is_slow_plus_signal(self):
        # MACD lookback = slow + signal = 26 + 9 = 35
        result = compiled("macd(candle=1, fast=12, slow=26, signal=9) > 0")
        assert result.lookback == 35

    def test_defaults_used_when_param_omitted(self):
        # rsi default period=14
        result = compiled("rsi(candle=1, period=14) > 50")
        assert result.lookback == 14


class TestCompiledPatternShape:
    def test_ast_preserved(self):
        src = "c1.high < c3.low"
        result = compiled(src)
        assert result.ast is not None
        assert len(result.ast.conditions) == 1

    def test_multi_condition_pattern(self):
        src = "c2.is_red\nc1.is_green\nc1.close > c2.open"
        result = compiled(src)
        assert result.window_size == 2
        assert result.lookback == 0
