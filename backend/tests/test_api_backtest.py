from datetime import date
from unittest.mock import AsyncMock, MagicMock
import pandas as pd
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlmodel.ext.asyncio.session import AsyncSession

import api.state as state
from api.backtest import router as backtest_router
from db.models import get_session, Pattern


# ------------------------------------------------------------------ fixtures

@pytest.fixture(autouse=True)
def reset_state():
    state.clear_kite_client()
    yield
    state.clear_kite_client()


def make_app(pattern: Pattern | None = None):
    app = FastAPI()
    app.include_router(backtest_router, prefix="/api")

    async def _session_dep():
        session = AsyncMock(spec=AsyncSession)
        session.get = AsyncMock(return_value=pattern)
        yield session

    app.dependency_overrides[get_session] = _session_dep
    return app


def make_pattern(dsl: str = "c1.is_green", interval: str = "5minute") -> Pattern:
    return Pattern(id=1, name="Test", dsl=dsl, interval=interval, is_active=True)


def make_ohlcv_df(n: int = 10) -> pd.DataFrame:
    idx = pd.date_range("2024-01-10 09:15", periods=n, freq="5min")
    return pd.DataFrame({
        "open":   [100.0] * n,
        "high":   [105.0] * n,
        "low":    [98.0]  * n,
        "close":  [102.0] * n,
        "volume": [1000.0] * n,
    }, index=idx)


_PAYLOAD = {
    "pattern_id": 1,
    "instrument_token": 12345,
    "symbol": "NSE:INFY",
    "from_date": "2024-01-10",
    "to_date": "2024-01-15",
}


# ------------------------------------------------------------------ tests

class TestBacktestNotAuthenticated:
    def test_returns_401(self):
        app = make_app(pattern=make_pattern())
        resp = TestClient(app, raise_server_exceptions=False).post("/api/backtest", json=_PAYLOAD)
        assert resp.status_code == 401


class TestBacktestPatternNotFound:
    def test_returns_404(self):
        state.set_kite_client(MagicMock())
        app = make_app(pattern=None)
        resp = TestClient(app, raise_server_exceptions=False).post("/api/backtest", json=_PAYLOAD)
        assert resp.status_code == 404


class TestBacktestDslError:
    def test_invalid_dsl_returns_422(self):
        state.set_kite_client(MagicMock())
        app = make_app(pattern=make_pattern(dsl="c0.high > c1.low"))  # c0 is invalid
        resp = TestClient(app, raise_server_exceptions=False).post("/api/backtest", json=_PAYLOAD)
        assert resp.status_code == 422

    def test_unknown_indicator_returns_422(self):
        state.set_kite_client(MagicMock())
        app = make_app(pattern=make_pattern(dsl="fake_ind(candle=1, period=5) > c1.close"))
        resp = TestClient(app, raise_server_exceptions=False).post("/api/backtest", json=_PAYLOAD)
        assert resp.status_code == 422


class TestBacktestSuccess:
    def test_all_green_candles_all_match(self):
        mock_kite = MagicMock()
        mock_kite.historical_data.return_value = make_ohlcv_df(20)
        state.set_kite_client(mock_kite)

        app = make_app(pattern=make_pattern(dsl="c1.is_green"))
        resp = TestClient(app).post("/api/backtest", json=_PAYLOAD)

        assert resp.status_code == 200
        data = resp.json()
        assert len(data["candles"]) == 20
        assert len(data["matches"]) == 20
        assert all(c["match"] for c in data["candles"])

    def test_no_match_returns_empty_matches(self):
        mock_kite = MagicMock()
        mock_kite.historical_data.return_value = make_ohlcv_df(10)
        state.set_kite_client(mock_kite)

        # open > close in our df → c1.is_red would match, c1.is_green won't
        # but our df has open=100 < close=102 so is_red never matches
        app = make_app(pattern=make_pattern(dsl="c1.is_red"))
        resp = TestClient(app).post("/api/backtest", json=_PAYLOAD)

        assert resp.status_code == 200
        assert resp.json()["matches"] == []

    def test_candle_shape(self):
        mock_kite = MagicMock()
        mock_kite.historical_data.return_value = make_ohlcv_df(5)
        state.set_kite_client(mock_kite)

        app = make_app(pattern=make_pattern())
        resp = TestClient(app).post("/api/backtest", json=_PAYLOAD)

        candle = resp.json()["candles"][0]
        assert set(candle.keys()) == {"time", "open", "high", "low", "close", "volume", "match"}

    def test_kite_called_with_correct_token(self):
        mock_kite = MagicMock()
        mock_kite.historical_data.return_value = make_ohlcv_df(5)
        state.set_kite_client(mock_kite)

        app = make_app(pattern=make_pattern())
        TestClient(app).post("/api/backtest", json=_PAYLOAD)

        call_kwargs = mock_kite.historical_data.call_args.kwargs
        assert call_kwargs["instrument_token"] == 12345
        assert call_kwargs["interval"] == "5minute"
