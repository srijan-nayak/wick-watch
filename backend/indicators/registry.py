from dataclasses import dataclass
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


# ------------------------------------------------------------------ compute fns

def _ema(df: pd.DataFrame, p: dict) -> pd.Series:
    return df["close"].ewm(span=p["period"], adjust=False).mean()


def _rsi(df: pd.DataFrame, p: dict) -> pd.Series:
    import ta
    return ta.momentum.RSIIndicator(df["close"], window=p["period"]).rsi()


def _bb_bands(df: pd.DataFrame, p: dict):
    import ta
    return ta.volatility.BollingerBands(df["close"], window=p["period"], window_dev=p["std"])


def _atr(df: pd.DataFrame, p: dict) -> pd.Series:
    import ta
    return ta.volatility.AverageTrueRange(df["high"], df["low"], df["close"], window=p["period"]).average_true_range()


def _avg_volume(df: pd.DataFrame, p: dict) -> pd.Series:
    return df["volume"].rolling(window=p["period"]).mean()


def _macd_indicator(df: pd.DataFrame, p: dict):
    import ta
    return ta.trend.MACD(df["close"], window_fast=p["fast"], window_slow=p["slow"], window_sign=p["signal"])


def _stoch(df: pd.DataFrame, p: dict):
    import ta
    return ta.momentum.StochasticOscillator(df["high"], df["low"], df["close"], window=p["period"])


# ------------------------------------------------------------------ registry

INDICATORS: dict[str, Indicator] = {
    "ema": Indicator(
        label="EMA",
        description="Exponential Moving Average of close price.",
        params={
            "candle": Param(type=int, description="Candle index (1 = most recent)"),
            "period": Param(type=int, description="Lookback period"),
        },
        lookback=lambda p: p["period"],
        compute=_ema,
    ),
    "rsi": Indicator(
        label="RSI",
        description="Relative Strength Index. Values range 0–100; below 30 = oversold, above 70 = overbought.",
        params={
            "candle": Param(type=int, description="Candle index (1 = most recent)"),
            "period": Param(type=int, description="Lookback period", default=14),
        },
        lookback=lambda p: p["period"],
        compute=_rsi,
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
        compute=lambda df, p: _bb_bands(df, p).bollinger_hband(),
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
        compute=lambda df, p: _bb_bands(df, p).bollinger_lband(),
    ),
    "bb_mid": Indicator(
        label="Bollinger Band Mid",
        description="Middle Bollinger Band: SMA of close over the period.",
        params={
            "candle": Param(type=int, description="Candle index (1 = most recent)"),
            "period": Param(type=int, description="SMA lookback period", default=20),
        },
        lookback=lambda p: p["period"],
        compute=lambda df, p: _bb_bands(df, {**p, "std": 2.0}).bollinger_mavg(),
    ),
    "atr": Indicator(
        label="ATR",
        description="Average True Range. Measures market volatility.",
        params={
            "candle": Param(type=int, description="Candle index (1 = most recent)"),
            "period": Param(type=int, description="Lookback period", default=14),
        },
        lookback=lambda p: p["period"],
        compute=_atr,
    ),
    "avg_volume": Indicator(
        label="Average Volume",
        description="Simple moving average of volume over the period.",
        params={
            "candle": Param(type=int, description="Candle index (1 = most recent)"),
            "period": Param(type=int, description="Lookback period"),
        },
        lookback=lambda p: p["period"],
        compute=_avg_volume,
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
        compute=lambda df, p: _macd_indicator(df, p).macd(),
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
        compute=lambda df, p: _macd_indicator(df, p).macd_signal(),
    ),
    "stoch_k": Indicator(
        label="Stochastic %K",
        description="Stochastic oscillator %K line.",
        params={
            "candle": Param(type=int, description="Candle index (1 = most recent)"),
            "period": Param(type=int, description="Lookback period", default=14),
        },
        lookback=lambda p: p["period"],
        compute=lambda df, p: _stoch(df, p).stoch(),
    ),
    "stoch_d": Indicator(
        label="Stochastic %D",
        description="Stochastic oscillator %D line (smoothed %K).",
        params={
            "candle": Param(type=int, description="Candle index (1 = most recent)"),
            "period": Param(type=int, description="Lookback period", default=14),
        },
        lookback=lambda p: p["period"],
        compute=lambda df, p: _stoch(df, p).stoch_signal(),
    ),
}


def get_indicator(name: str) -> Indicator:
    if name not in INDICATORS:
        raise KeyError(f"Unknown indicator: '{name}'")
    return INDICATORS[name]


def indicator_metadata() -> list[dict]:
    """Serializable metadata for the frontend autocomplete provider."""
    return [
        {
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
        }
        for name, ind in INDICATORS.items()
    ]
