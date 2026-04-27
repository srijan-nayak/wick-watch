from __future__ import annotations
import asyncio
import logging
import threading
from collections import defaultdict
from datetime import datetime, timezone
from typing import Callable

import pandas as pd
from kiteconnect import KiteTicker

from dsl.compiler import CompiledPattern
from executor.engine import run

log = logging.getLogger(__name__)

AlertCallback = Callable[[str, int, str, pd.Timestamp], None]
# callback(pattern_name, instrument_token, symbol, matched_candle_time)


class CandleBuffer:
    """
    Builds live OHLCV candles from ticks for a single (instrument_token, interval) pair
    and maintains a rolling window of closed candles for pattern evaluation.
    """

    def __init__(self, interval: str, capacity: int) -> None:
        self.interval = interval
        self.capacity = capacity
        self._closed: list[dict] = []   # oldest first
        self._live: dict | None = None  # currently open candle

    def seed(self, df: pd.DataFrame) -> None:
        """Pre-load historical closed candles (oldest first)."""
        rows = df.tail(self.capacity).to_dict("records")
        timestamps = list(df.tail(self.capacity).index)
        self._closed = [
            {"time": ts, "open": r["open"], "high": r["high"],
             "low": r["low"], "close": r["close"], "volume": r["volume"]}
            for ts, r in zip(timestamps, rows)
        ]

    def on_tick(self, price: float, volume: int, ts: datetime) -> pd.DataFrame | None:
        """
        Process one tick. Returns a DataFrame of the last `capacity` closed candles
        when a new candle closes; returns None otherwise.
        """
        bucket = _floor_to_interval(ts, self.interval)

        if self._live is None:
            self._live = _new_candle(bucket, price, volume)
            return None

        if bucket == self._live["time"]:
            _update_candle(self._live, price, volume)
            return None

        # candle boundary crossed — close current, open new
        self._closed.append(self._live)
        if len(self._closed) > self.capacity:
            self._closed.pop(0)
        self._live = _new_candle(bucket, price, volume)

        return self._to_df() if len(self._closed) >= 1 else None

    def _to_df(self) -> pd.DataFrame:
        df = pd.DataFrame(self._closed)
        df = df.set_index("time")
        df.index = pd.to_datetime(df.index, utc=True)
        return df[["open", "high", "low", "close", "volume"]]


class LiveStream:
    """
    Manages a KiteTicker WebSocket connection, routes ticks to per-interval
    CandleBuffers, and fires pattern evaluation on each candle close.
    """

    def __init__(self, api_key: str, access_token: str) -> None:
        self._api_key = api_key
        self._access_token = access_token
        self._ticker: KiteTicker | None = None

        # (instrument_token, interval) → CandleBuffer
        self._buffers: dict[tuple[int, str], CandleBuffer] = {}

        # (instrument_token, interval) → list of (pattern_name, CompiledPattern)
        self._patterns: dict[tuple[int, str], list[tuple[str, CompiledPattern]]] = defaultdict(list)

        # instrument_token → trading symbol (for alert messages)
        self._symbols: dict[int, str] = {}

        self._on_alert: AlertCallback | None = None
        self._lock = threading.Lock()

    def set_alert_callback(self, cb: AlertCallback) -> None:
        self._on_alert = cb

    def register(
        self,
        instrument_token: int,
        symbol: str,
        interval: str,
        pattern_name: str,
        compiled: CompiledPattern,
        seed_df: pd.DataFrame,
    ) -> None:
        """
        Register a pattern to run against a specific ticker.
        seed_df must contain enough historical candles (window + lookback).
        """
        key = (instrument_token, interval)
        capacity = compiled.window_size + compiled.lookback
        self._symbols[instrument_token] = symbol

        with self._lock:
            if key not in self._buffers:
                buf = CandleBuffer(interval=interval, capacity=capacity)
                buf.seed(seed_df)
                self._buffers[key] = buf
            else:
                existing = self._buffers[key]
                if capacity > existing.capacity:
                    existing.capacity = capacity
            self._patterns[key].append((pattern_name, compiled))

    def has_buffer(self, instrument_token: int, interval: str) -> bool:
        return (instrument_token, interval) in self._buffers

    def add_pattern(
        self,
        instrument_token: int,
        symbol: str,
        interval: str,
        pattern_name: str,
        compiled: CompiledPattern,
        seed_df: pd.DataFrame | None = None,
    ) -> bool:
        """Add a pattern to a running stream. Returns False if buffer is missing and no seed_df provided."""
        key = (instrument_token, interval)
        capacity = compiled.window_size + compiled.lookback
        self._symbols[instrument_token] = symbol
        with self._lock:
            if key not in self._buffers:
                if seed_df is None:
                    return False
                buf = CandleBuffer(interval=interval, capacity=capacity)
                buf.seed(seed_df)
                self._buffers[key] = buf
            else:
                existing = self._buffers[key]
                if capacity > existing.capacity:
                    existing.capacity = capacity
            self._patterns[key].append((pattern_name, compiled))
        return True

    def remove_pattern(self, pattern_name: str) -> None:
        """Remove all registrations of a named pattern from the stream."""
        with self._lock:
            for key in list(self._patterns.keys()):
                self._patterns[key] = [
                    (name, compiled) for name, compiled in self._patterns[key]
                    if name != pattern_name
                ]

    def start(self) -> None:
        tokens = list({token for token, _ in self._buffers})
        if not tokens:
            return

        self._ticker = KiteTicker(self._api_key, self._access_token)
        self._ticker.on_connect = lambda ws, r: ws.subscribe(tokens)
        self._ticker.on_ticks = self._on_ticks
        self._ticker.on_error = lambda ws, code, reason: log.error("KiteTicker error %s: %s", code, reason)
        self._ticker.on_close = lambda ws, code, reason: log.warning("KiteTicker closed %s: %s", code, reason)
        self._ticker.connect(threaded=True)

    def stop(self) -> None:
        if self._ticker:
            self._ticker.close()
            self._ticker = None

    def _on_ticks(self, ws, ticks: list[dict]) -> None:
        for tick in ticks:
            token: int = tick["instrument_token"]
            price: float = tick.get("last_price", 0.0)
            volume: int = tick.get("volume_traded", 0)
            ts: datetime = tick.get("timestamp") or datetime.now(timezone.utc)

            for interval, buf in list(self._buffers.items()):
                if interval[0] != token:
                    continue
                closed_df = buf.on_tick(price, volume, ts)
                if closed_df is not None:
                    self._evaluate(token, interval[1], closed_df)

    def _evaluate(self, token: int, interval: str, df: pd.DataFrame) -> None:
        key = (token, interval)
        latest_candle_time = df.index[-1]
        with self._lock:
            patterns = list(self._patterns.get(key, []))
        for pattern_name, compiled in patterns:
            try:
                matches = run(compiled, df)
                if matches and matches[-1] == latest_candle_time:
                    symbol = self._symbols.get(token, str(token))
                    if self._on_alert:
                        self._on_alert(pattern_name, token, symbol, matches[-1])
            except Exception:
                log.exception("Pattern evaluation error for %s on %s", pattern_name, token)


# ------------------------------------------------------------------ helpers

def _floor_to_interval(ts: datetime, interval: str) -> datetime:
    minutes = {
        "minute": 1, "3minute": 3, "5minute": 5,
        "10minute": 10, "15minute": 15, "30minute": 30, "60minute": 60,
    }.get(interval, 5)
    floored_minute = (ts.minute // minutes) * minutes
    return ts.replace(minute=floored_minute, second=0, microsecond=0)


def _new_candle(bucket: datetime, price: float, volume: int) -> dict:
    return {"time": bucket, "open": price, "high": price, "low": price, "close": price, "volume": volume}


def _update_candle(candle: dict, price: float, volume: int) -> None:
    candle["high"] = max(candle["high"], price)
    candle["low"] = min(candle["low"], price)
    candle["close"] = price
    candle["volume"] += volume


