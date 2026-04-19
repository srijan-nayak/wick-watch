from dataclasses import dataclass, field
from typing import Any, Callable
import pandas as pd


@dataclass
class Param:
    type: type
    description: str
    default: Any = None

    def has_default(self) -> bool:
        return self.default is not None


@dataclass
class Indicator:
    label: str
    description: str
    params: dict[str, Param]
    lookback: Callable[[dict[str, Any]], int]
    compute: Callable[[pd.DataFrame, dict[str, Any]], pd.Series]


def _ema_compute(df: pd.DataFrame, p: dict) -> pd.Series:
    import pandas_ta as ta
    return ta.ema(df["close"], length=p["period"])


def _rsi_compute(df: pd.DataFrame, p: dict) -> pd.Series:
    import pandas_ta as ta
    return ta.rsi(df["close"], length=p["period"])


def _bb_compute(df: pd.DataFrame, p: dict) -> pd.DataFrame:
    import pandas_ta as ta
    return ta.bbands(df["close"], length=p["period"], std=p["std"])


def _atr_compute(df: pd.DataFrame, p: dict) -> pd.Series:
    import pandas_ta as ta
    return ta.atr(df["high"], df["low"], df["close"], length=p["period"])


def _avg_volume_compute(df: pd.DataFrame, p: dict) -> pd.Series:
    return df["volume"].rolling(p["period"]).mean()


def _macd_compute(df: pd.DataFrame, p: dict) -> pd.DataFrame:
    import pandas_ta as ta
    return ta.macd(df["close"], fast=p["fast"], slow=p["slow"], signal=p["signal"])


def _stoch_compute(df: pd.DataFrame, p: dict) -> pd.DataFrame:
    import pandas_ta as ta
    return ta.stoch(df["high"], df["low"], df["close"], k=p["period"])


INDICATORS: dict[str, Indicator] = {
    "ema": Indicator(
        label="EMA",
        description="Exponential Moving Average of close price.",
        params={
            "candle": Param(type=int, description="Candle index (1 = most recent)"),
            "period": Param(type=int, description="Lookback period"),
        },
        lookback=lambda p: p["period"],
        compute=_ema_compute,
    ),
    "rsi": Indicator(
        label="RSI",
        description="Relative Strength Index. Values range 0–100; below 30 = oversold, above 70 = overbought.",
        params={
            "candle": Param(type=int, description="Candle index (1 = most recent)"),
            "period": Param(type=int, description="Lookback period", default=14),
        },
        lookback=lambda p: p["period"],
        compute=_rsi_compute,
    ),
    "bb_upper": Indicator(
        label="Bollinger Band Upper",
        description="Upper Bollinger Band: SMA + (std × σ) over the period.",
        params={
            "candle": Param(type=int, description="Candle index (1 = most recent)"),
            "period": Param(type=int, description="SMA lookback period", default=20),
            "std": Param(type=float, description="Standard deviation multiplier", default=2.0),
        },
        lookback=lambda p: p["period"],
        compute=lambda df, p: _bb_compute(df, p).filter(like="BBU").iloc[:, 0],
    ),
    "bb_lower": Indicator(
        label="Bollinger Band Lower",
        description="Lower Bollinger Band: SMA - (std × σ) over the period.",
        params={
            "candle": Param(type=int, description="Candle index (1 = most recent)"),
            "period": Param(type=int, description="SMA lookback period", default=20),
            "std": Param(type=float, description="Standard deviation multiplier", default=2.0),
        },
        lookback=lambda p: p["period"],
        compute=lambda df, p: _bb_compute(df, p).filter(like="BBL").iloc[:, 0],
    ),
    "bb_mid": Indicator(
        label="Bollinger Band Mid",
        description="Middle Bollinger Band: SMA of close over the period.",
        params={
            "candle": Param(type=int, description="Candle index (1 = most recent)"),
            "period": Param(type=int, description="SMA lookback period", default=20),
        },
        lookback=lambda p: p["period"],
        compute=lambda df, p: _bb_compute(df, {**p, "std": 2.0}).filter(like="BBM").iloc[:, 0],
    ),
    "atr": Indicator(
        label="ATR",
        description="Average True Range. Measures market volatility.",
        params={
            "candle": Param(type=int, description="Candle index (1 = most recent)"),
            "period": Param(type=int, description="Lookback period", default=14),
        },
        lookback=lambda p: p["period"],
        compute=_atr_compute,
    ),
    "avg_volume": Indicator(
        label="Average Volume",
        description="Simple moving average of volume over the period.",
        params={
            "candle": Param(type=int, description="Candle index (1 = most recent)"),
            "period": Param(type=int, description="Lookback period"),
        },
        lookback=lambda p: p["period"],
        compute=_avg_volume_compute,
    ),
    "macd": Indicator(
        label="MACD",
        description="MACD line: difference between fast and slow EMAs.",
        params={
            "candle": Param(type=int, description="Candle index (1 = most recent)"),
            "fast": Param(type=int, description="Fast EMA period", default=12),
            "slow": Param(type=int, description="Slow EMA period", default=26),
            "signal": Param(type=int, description="Signal line period", default=9),
        },
        lookback=lambda p: p["slow"] + p["signal"],
        compute=lambda df, p: _macd_compute(df, p).filter(like="MACD_").iloc[:, 0],
    ),
    "macd_signal": Indicator(
        label="MACD Signal",
        description="MACD signal line: EMA of the MACD line.",
        params={
            "candle": Param(type=int, description="Candle index (1 = most recent)"),
            "fast": Param(type=int, description="Fast EMA period", default=12),
            "slow": Param(type=int, description="Slow EMA period", default=26),
            "signal": Param(type=int, description="Signal line period", default=9),
        },
        lookback=lambda p: p["slow"] + p["signal"],
        compute=lambda df, p: _macd_compute(df, p).filter(like="MACDs_").iloc[:, 0],
    ),
    "stoch_k": Indicator(
        label="Stochastic %K",
        description="Stochastic oscillator %K line.",
        params={
            "candle": Param(type=int, description="Candle index (1 = most recent)"),
            "period": Param(type=int, description="Lookback period", default=14),
        },
        lookback=lambda p: p["period"],
        compute=lambda df, p: _stoch_compute(df, p).filter(like="STOCHk_").iloc[:, 0],
    ),
    "stoch_d": Indicator(
        label="Stochastic %D",
        description="Stochastic oscillator %D line (smoothed %K).",
        params={
            "candle": Param(type=int, description="Candle index (1 = most recent)"),
            "period": Param(type=int, description="Lookback period", default=14),
        },
        lookback=lambda p: p["period"],
        compute=lambda df, p: _stoch_compute(df, p).filter(like="STOCHd_").iloc[:, 0],
    ),
}


def get_indicator(name: str) -> Indicator:
    if name not in INDICATORS:
        raise KeyError(f"Unknown indicator: '{name}'")
    return INDICATORS[name]


def indicator_metadata() -> list[dict]:
    """Serializable metadata for the frontend autocomplete provider."""
    result = []
    for name, ind in INDICATORS.items():
        result.append({
            "name": name,
            "label": ind.label,
            "description": ind.description,
            "params": {
                k: {
                    "type": v.type.__name__,
                    "description": v.description,
                    "default": v.default,
                }
                for k, v in ind.params.items()
            },
        })
    return result
