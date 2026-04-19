from datetime import datetime, timezone
import pandas as pd
import pytest
from kite.stream import CandleBuffer, _floor_to_interval, _new_candle, _update_candle


# ------------------------------------------------------------------ helpers

def ts(h: int, m: int, s: int = 0) -> datetime:
    return datetime(2024, 1, 1, h, m, s, tzinfo=timezone.utc)


def make_seed_df(rows: list[tuple]) -> pd.DataFrame:
    """rows: (open, high, low, close, volume), oldest first."""
    idx = pd.date_range("2024-01-01 09:15", periods=len(rows), freq="5min")
    return pd.DataFrame(rows, columns=["open", "high", "low", "close", "volume"], index=idx)


# ------------------------------------------------------------------ floor_to_interval

class TestFloorToInterval:
    def test_5minute(self):
        result = _floor_to_interval(ts(9, 17, 30), "5minute")
        assert result == ts(9, 15)

    def test_15minute(self):
        result = _floor_to_interval(ts(9, 28, 0), "15minute")
        assert result == ts(9, 15)

    def test_60minute(self):
        result = _floor_to_interval(ts(10, 45, 0), "60minute")
        assert result == ts(10, 0)

    def test_on_boundary(self):
        result = _floor_to_interval(ts(9, 20, 0), "5minute")
        assert result == ts(9, 20)


# ------------------------------------------------------------------ CandleBuffer

class TestCandleBuffer:
    def test_first_tick_does_not_emit(self):
        buf = CandleBuffer("5minute", capacity=5)
        result = buf.on_tick(100.0, 500, ts(9, 15, 10))
        assert result is None

    def test_ticks_within_same_candle_do_not_emit(self):
        buf = CandleBuffer("5minute", capacity=5)
        buf.on_tick(100.0, 500, ts(9, 15, 0))
        buf.on_tick(102.0, 300, ts(9, 16, 0))
        result = buf.on_tick(99.0, 200, ts(9, 17, 0))
        assert result is None

    def test_candle_closes_on_boundary_cross(self):
        buf = CandleBuffer("5minute", capacity=5)
        buf.on_tick(100.0, 500, ts(9, 15, 0))
        buf.on_tick(102.0, 300, ts(9, 17, 0))
        result = buf.on_tick(105.0, 400, ts(9, 20, 0))  # new bucket → emits
        assert result is not None
        assert isinstance(result, pd.DataFrame)

    def test_closed_candle_ohlcv_correct(self):
        buf = CandleBuffer("5minute", capacity=5)
        buf.on_tick(100.0, 500, ts(9, 15, 0))
        buf.on_tick(103.0, 300, ts(9, 16, 0))
        buf.on_tick(98.0,  200, ts(9, 17, 0))
        buf.on_tick(101.0, 100, ts(9, 18, 0))
        result = buf.on_tick(110.0, 600, ts(9, 20, 0))  # close previous candle

        row = result.iloc[-1]
        assert row["open"]   == 100.0
        assert row["high"]   == 103.0
        assert row["low"]    == 98.0
        assert row["close"]  == 101.0
        assert row["volume"] == 1100

    def test_capacity_limits_buffer_length(self):
        buf = CandleBuffer("5minute", capacity=3)
        # generate 5 candles by crossing 5 boundaries
        for i in range(5):
            buf.on_tick(100.0 + i, 100, ts(9, 15 + i * 5, 0))
        # cross into 6th candle → emits
        result = buf.on_tick(200.0, 100, ts(9, 40 + 5, 0))
        # result should have at most `capacity` rows
        assert len(result) <= 3

    def test_seed_preloads_closed_candles(self):
        buf = CandleBuffer("5minute", capacity=5)
        seed = make_seed_df([(100, 105, 99, 103, 1000), (103, 108, 102, 106, 1200)])
        buf.seed(seed)
        # open a live candle, then close it
        buf.on_tick(106.0, 500, ts(9, 25, 0))
        result = buf.on_tick(110.0, 300, ts(9, 30, 0))
        # should see seeded candles + the one that just closed
        assert result is not None
        assert len(result) >= 2

    def test_no_emit_before_first_close(self):
        buf = CandleBuffer("5minute", capacity=5)
        seed = make_seed_df([(100, 105, 99, 103, 1000)])
        buf.seed(seed)
        # still no emit until a candle closes
        result = buf.on_tick(106.0, 500, ts(9, 25, 0))
        assert result is None


# ------------------------------------------------------------------ candle helpers

class TestCandleHelpers:
    def test_new_candle(self):
        bucket = ts(9, 15)
        c = _new_candle(bucket, 100.0, 500)
        assert c == {"time": bucket, "open": 100.0, "high": 100.0, "low": 100.0, "close": 100.0, "volume": 500}

    def test_update_candle_high(self):
        c = _new_candle(ts(9, 15), 100.0, 500)
        _update_candle(c, 105.0, 200)
        assert c["high"] == 105.0
        assert c["close"] == 105.0

    def test_update_candle_low(self):
        c = _new_candle(ts(9, 15), 100.0, 500)
        _update_candle(c, 95.0, 200)
        assert c["low"] == 95.0

    def test_update_candle_volume_accumulates(self):
        c = _new_candle(ts(9, 15), 100.0, 500)
        _update_candle(c, 101.0, 300)
        _update_candle(c, 102.0, 200)
        assert c["volume"] == 1000
