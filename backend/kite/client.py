from __future__ import annotations
import math
from datetime import date, timedelta
from typing import Any

import pandas as pd
from kiteconnect import KiteConnect

from executor.aggregator import from_kite_historical

# Approximate intraday candles per trading day per interval
_CANDLES_PER_DAY: dict[str, int] = {
    "minute":   375,
    "3minute":  125,
    "5minute":  75,
    "10minute": 38,
    "15minute": 25,
    "30minute": 13,
    "60minute": 7,
}


class KiteClient:
    def __init__(self, api_key: str, access_token: str | None = None) -> None:
        self._kite = KiteConnect(api_key=api_key)
        if access_token:
            self._kite.set_access_token(access_token)

    # ------------------------------------------------------------------ auth

    def login_url(self) -> str:
        return self._kite.login_url()

    def generate_session(self, request_token: str, api_secret: str) -> dict[str, Any]:
        return self._kite.generate_session(request_token, api_secret=api_secret)

    def profile(self) -> dict[str, Any]:
        return self._kite.profile()

    # ------------------------------------------------------------------ instruments

    def search_instruments(self, exchange: str | None = None) -> list[dict]:
        instruments = self._kite.instruments(exchange=exchange)
        return [
            {
                "instrument_token": i["instrument_token"],
                "tradingsymbol": i["tradingsymbol"],
                "name": i["name"],
                "exchange": i["exchange"],
            }
            for i in instruments
        ]

    # ------------------------------------------------------------------ historical data

    def historical_data(
        self,
        instrument_token: int,
        from_date: date,
        to_date: date,
        interval: str,
        lookback_candles: int = 0,
    ) -> pd.DataFrame:
        """
        Fetch OHLCV candles from Kite.

        If lookback_candles > 0, extends from_date backwards by enough
        calendar days to cover the indicator warmup period.
        """
        actual_from = from_date
        if lookback_candles > 0:
            candles_per_day = _CANDLES_PER_DAY.get(interval, 75)
            extra_days = math.ceil(lookback_candles / candles_per_day)
            # add 40% buffer to account for weekends and holidays
            extra_days = math.ceil(extra_days * 1.4)
            actual_from = from_date - timedelta(days=extra_days)

        records = self._kite.historical_data(
            instrument_token=instrument_token,
            from_date=actual_from,
            to_date=to_date,
            interval=interval,
            continuous=False,
        )
        return from_kite_historical(records)
