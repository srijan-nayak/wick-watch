from __future__ import annotations
import pandas as pd

# Kite interval strings → pandas resample frequency aliases
_INTERVAL_MAP: dict[str, str] = {
    "minute":    "1min",
    "3minute":   "3min",
    "5minute":   "5min",
    "10minute":  "10min",
    "15minute":  "15min",
    "30minute":  "30min",
    "60minute":  "60min",
}

SUPPORTED_INTERVALS = list(_INTERVAL_MAP.keys())


def aggregate_ticks(ticks: pd.DataFrame, interval: str) -> pd.DataFrame:
    """
    Aggregate a tick DataFrame into OHLCV candles.

    ticks must have:
      - DatetimeIndex (UTC or IST, consistent)
      - columns: price (float), volume (int/float)

    Returns a DataFrame with columns: open, high, low, close, volume
    indexed by candle open time, sorted ascending, NaN rows dropped.
    """
    if interval not in _INTERVAL_MAP:
        raise ValueError(
            f"Unsupported interval {interval!r}. Choose from: {SUPPORTED_INTERVALS}"
        )

    freq = _INTERVAL_MAP[interval]
    price = ticks["price"]
    volume = ticks["volume"]

    ohlcv = price.resample(freq, label="left", closed="left").ohlc()
    ohlcv["volume"] = volume.resample(freq, label="left", closed="left").sum()
    ohlcv = ohlcv.rename(columns={"open": "open", "high": "high", "low": "low", "close": "close"})
    ohlcv = ohlcv.dropna(subset=["open", "high", "low", "close"])

    return ohlcv


def from_kite_historical(records: list[dict]) -> pd.DataFrame:
    """
    Convert Kite historical candle records (list of dicts with date, open,
    high, low, close, volume) into a standard OHLCV DataFrame.
    """
    df = pd.DataFrame(records)
    df["date"] = pd.to_datetime(df["date"])
    df = df.set_index("date").sort_index()
    df = df[["open", "high", "low", "close", "volume"]]
    return df
