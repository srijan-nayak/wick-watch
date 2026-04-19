from datetime import date, timedelta
from unittest.mock import MagicMock, patch
import pandas as pd
import pytest
from kite.client import KiteClient, _CANDLES_PER_DAY


def make_client(access_token="tok") -> tuple[KiteClient, MagicMock]:
    with patch("kite.client.KiteConnect") as MockKC:
        instance = MockKC.return_value
        client = KiteClient(api_key="key", access_token=access_token)
        return client, instance


class TestLoginUrl:
    def test_returns_kite_login_url(self):
        client, mock_kc = make_client()
        mock_kc.login_url.return_value = "https://kite.zerodha.com/connect/login?..."
        assert "zerodha" in client.login_url()


class TestGenerateSession:
    def test_passes_through(self):
        client, mock_kc = make_client()
        mock_kc.generate_session.return_value = {"access_token": "tok123", "user_id": "AB1234"}
        result = client.generate_session("req_token", "secret")
        mock_kc.generate_session.assert_called_once_with("req_token", api_secret="secret")
        assert result["access_token"] == "tok123"


class TestHistoricalData:
    def _kite_records(self, n: int = 5) -> list[dict]:
        base = pd.Timestamp("2024-01-01 09:15")
        return [
            {
                "date": str(base + pd.Timedelta(minutes=5 * i)),
                "open": 100 + i, "high": 102 + i,
                "low": 99 + i,  "close": 101 + i, "volume": 1000,
            }
            for i in range(n)
        ]

    def test_no_lookback_uses_exact_dates(self):
        client, mock_kc = make_client()
        mock_kc.historical_data.return_value = self._kite_records()
        from_dt = date(2024, 1, 10)
        to_dt = date(2024, 1, 15)
        client.historical_data(12345, from_dt, to_dt, "5minute", lookback_candles=0)
        call_kwargs = mock_kc.historical_data.call_args
        assert call_kwargs.kwargs["from_date"] == from_dt

    def test_lookback_extends_from_date(self):
        client, mock_kc = make_client()
        mock_kc.historical_data.return_value = self._kite_records()
        from_dt = date(2024, 1, 10)
        # 75 candles/day for 5minute; 20 candles lookback → 1 extra trading day + 40% buffer
        client.historical_data(12345, from_dt, date(2024, 1, 15), "5minute", lookback_candles=20)
        call_kwargs = mock_kc.historical_data.call_args
        actual_from = call_kwargs.kwargs["from_date"]
        assert actual_from < from_dt

    def test_large_lookback_fetches_more_days(self):
        client, mock_kc = make_client()
        mock_kc.historical_data.return_value = self._kite_records()
        from_dt = date(2024, 1, 10)
        # period=50 for 5minute → ceil(50/75)=1 day * 1.4 = 2 days
        client.historical_data(12345, from_dt, date(2024, 1, 15), "5minute", lookback_candles=50)
        small_lookback_call = mock_kc.historical_data.call_args.kwargs["from_date"]

        mock_kc.historical_data.return_value = self._kite_records()
        client.historical_data(12345, from_dt, date(2024, 1, 15), "5minute", lookback_candles=300)
        large_lookback_call = mock_kc.historical_data.call_args.kwargs["from_date"]

        assert large_lookback_call < small_lookback_call

    def test_returns_dataframe_with_ohlcv(self):
        client, mock_kc = make_client()
        mock_kc.historical_data.return_value = self._kite_records(3)
        df = client.historical_data(12345, date(2024, 1, 10), date(2024, 1, 15), "5minute")
        assert set(df.columns) == {"open", "high", "low", "close", "volume"}
        assert len(df) == 3


class TestCandlesPerDay:
    def test_all_intervals_defined(self):
        for interval in ["minute", "3minute", "5minute", "10minute", "15minute", "30minute", "60minute"]:
            assert interval in _CANDLES_PER_DAY

    def test_longer_interval_fewer_candles(self):
        assert _CANDLES_PER_DAY["5minute"] > _CANDLES_PER_DAY["15minute"]
        assert _CANDLES_PER_DAY["15minute"] > _CANDLES_PER_DAY["60minute"]
