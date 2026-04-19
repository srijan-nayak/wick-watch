import pytest
from dsl.parser import parse
from dsl.validator import validate, ValidationError


def assert_valid(source: str) -> None:
    validate(parse(source))


def assert_invalid(source: str, match: str = "") -> None:
    with pytest.raises(ValidationError, match=match):
        validate(parse(source))


class TestValidIndicators:
    def test_ema(self):
        assert_valid("ema(candle=1, period=20) > c1.close")

    def test_rsi(self):
        assert_valid("rsi(candle=1, period=14) < 30")

    def test_bb_upper_with_std(self):
        assert_valid("bb_upper(candle=1, period=20, std=2.0) > c1.high")

    def test_avg_volume(self):
        assert_valid("c1.volume > avg_volume(candle=1, period=10)")

    def test_bool_props_always_valid(self):
        assert_valid("c1.is_green\nc2.is_red\nc3.is_doji")


class TestUnknownIndicator:
    def test_bad_name(self):
        assert_invalid("supertrend(candle=1, period=7) > c1.close", match="Unknown indicator")

    def test_typo(self):
        assert_invalid("bb_upp(candle=1, period=20) > c1.high", match="Unknown indicator")


class TestInvalidParams:
    def test_unknown_param(self):
        assert_invalid("ema(candle=1, period=20, window=5) > c1.close", match="no param 'window'")

    def test_missing_required_param(self):
        # ema requires 'period' (no default)
        assert_invalid("ema(candle=1) > c1.close", match="requires param 'period'")

    def test_wrong_type_float_for_int(self):
        assert_invalid("ema(candle=1, period=20.5) > c1.close", match="must be an int")


class TestNestedIndicators:
    def test_indicator_in_logical_and(self):
        assert_valid("c1.is_green AND rsi(candle=1, period=14) < 30")

    def test_indicator_in_logical_or(self):
        assert_valid("rsi(candle=1, period=14) < 30 OR rsi(candle=2, period=14) < 30")

    def test_invalid_nested(self):
        assert_invalid(
            "c1.is_green AND fake_ind(candle=1, period=5) > c1.close",
            match="Unknown indicator",
        )
