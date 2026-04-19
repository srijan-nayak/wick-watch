import pytest
import pandas as pd
import numpy as np
from executor.aggregator import aggregate_ticks, from_kite_historical, SUPPORTED_INTERVALS


def make_ticks(prices: list[float], times: list[str], volume: float = 100.0) -> pd.DataFrame:
    idx = pd.DatetimeIndex(times)
    return pd.DataFrame({"price": prices, "volume": [volume] * len(prices)}, index=idx)


class TestAggregateIntervals:
    def test_supported_intervals_defined(self):
        assert "5minute" in SUPPORTED_INTERVALS
        assert "15minute" in SUPPORTED_INTERVALS

    def test_unsupported_interval_raises(self):
        ticks = make_ticks([100.0], ["2024-01-01 09:15:00"])
        with pytest.raises(ValueError, match="Unsupported interval"):
            aggregate_ticks(ticks, "2minute")

    def test_5min_ohlcv(self):
        # 3 ticks within a 5-minute window → single candle
        ticks = make_ticks(
            prices=[100.0, 102.0, 101.0],
            times=[
                "2024-01-01 09:15:00",
                "2024-01-01 09:16:00",
                "2024-01-01 09:17:00",
            ],
            volume=200.0,
        )
        df = aggregate_ticks(ticks, "5minute")
        assert len(df) == 1
        row = df.iloc[0]
        assert row["open"] == 100.0
        assert row["high"] == 102.0
        assert row["low"] == 100.0
        assert row["close"] == 101.0
        assert row["volume"] == 600.0

    def test_two_separate_candles(self):
        ticks = make_ticks(
            prices=[100.0, 105.0],
            times=[
                "2024-01-01 09:15:00",
                "2024-01-01 09:20:00",
            ],
        )
        df = aggregate_ticks(ticks, "5minute")
        assert len(df) == 2

    def test_output_columns(self):
        ticks = make_ticks([100.0], ["2024-01-01 09:15:00"])
        df = aggregate_ticks(ticks, "minute")  # Kite uses "minute" not "1minute"
        assert set(df.columns) == {"open", "high", "low", "close", "volume"}

    def test_empty_buckets_dropped(self):
        # Two ticks 30 min apart with 5min interval → no phantom candles in between
        ticks = make_ticks(
            prices=[100.0, 110.0],
            times=["2024-01-01 09:15:00", "2024-01-01 09:45:00"],
        )
        df = aggregate_ticks(ticks, "5minute")
        assert len(df) == 2  # only the 2 buckets that have data

    def test_sorted_ascending(self):
        ticks = make_ticks(
            prices=[110.0, 100.0],
            times=["2024-01-01 09:20:00", "2024-01-01 09:15:00"],
        )
        df = aggregate_ticks(ticks, "5minute")
        assert df.index.is_monotonic_increasing


class TestFromKiteHistorical:
    def test_basic_conversion(self):
        records = [
            {"date": "2024-01-01 09:15:00+05:30", "open": 100, "high": 105, "low": 98, "close": 103, "volume": 1000},
            {"date": "2024-01-01 09:20:00+05:30", "open": 103, "high": 108, "low": 101, "close": 106, "volume": 1200},
        ]
        df = from_kite_historical(records)
        assert len(df) == 2
        assert list(df.columns) == ["open", "high", "low", "close", "volume"]
        assert df.index.is_monotonic_increasing

    def test_sorted_even_if_input_unordered(self):
        records = [
            {"date": "2024-01-01 09:20:00", "open": 103, "high": 108, "low": 101, "close": 106, "volume": 1200},
            {"date": "2024-01-01 09:15:00", "open": 100, "high": 105, "low": 98, "close": 103, "volume": 1000},
        ]
        df = from_kite_historical(records)
        assert df.index[0] < df.index[1]
