from unittest.mock import MagicMock, patch, AsyncMock
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlmodel.ext.asyncio.session import AsyncSession

import api.state as state
from api.auth import router as auth_router
from db.models import get_session, UserSession


# ------------------------------------------------------------------ fixtures

@pytest.fixture(autouse=True)
def reset_state():
    state.clear_kite_client()
    yield
    state.clear_kite_client()


def make_app(session_override=None):
    app = FastAPI()
    app.include_router(auth_router, prefix="/api")
    if session_override is not None:
        app.dependency_overrides[get_session] = session_override
    return app


def mock_session_dep(result=None):
    """Returns a dependency override that yields a mock AsyncSession."""
    async def _dep():
        session = AsyncMock(spec=AsyncSession)
        exec_result = MagicMock()
        exec_result.first.return_value = result
        session.exec = AsyncMock(return_value=exec_result)
        yield session
    return _dep


# ------------------------------------------------------------------ tests

class TestLoginUrl:
    def test_returns_url(self):
        app = make_app()
        with (
            patch.dict("os.environ", {"KITE_API_KEY": "testkey", "KITE_API_SECRET": "secret"}),
            patch("api.auth.KiteClient") as MockKC,
        ):
            MockKC.return_value.login_url.return_value = "https://kite.zerodha.com/connect/login"
            resp = TestClient(app).get("/api/auth/login-url")
        assert resp.status_code == 200
        assert "url" in resp.json()

    def test_missing_api_key_returns_500(self):
        app = make_app()
        with patch.dict("os.environ", {}, clear=True):
            resp = TestClient(app).get("/api/auth/login-url")
        assert resp.status_code == 500


class TestAuthStatus:
    def test_unauthenticated(self):
        app = make_app(session_override=mock_session_dep(result=None))
        resp = TestClient(app).get("/api/auth/status")
        assert resp.status_code == 200
        assert resp.json()["authenticated"] is False

    def test_authenticated(self):
        fake = UserSession(access_token="tok", user_id="AB1234", user_name="Test User")
        app = make_app(session_override=mock_session_dep(result=fake))
        resp = TestClient(app).get("/api/auth/status")
        assert resp.status_code == 200
        data = resp.json()
        assert data["authenticated"] is True
        assert data["user_id"] == "AB1234"
        assert data["user_name"] == "Test User"


class TestLogout:
    def test_clears_kite_client(self):
        state.set_kite_client(MagicMock())
        app = make_app(session_override=mock_session_dep(result=None))
        resp = TestClient(app).post("/api/auth/logout")
        assert resp.status_code == 200
        with pytest.raises(RuntimeError):
            state.get_kite_client()
