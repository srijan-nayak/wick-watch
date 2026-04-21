from __future__ import annotations
import os
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select

# True when the built React SPA is present (Docker / web mode).
# In Tauri mode there is no static/ dir; the desktop app polls /api/auth/status.
_WEB_MODE = (Path(__file__).parent.parent / "static").is_dir()

from db.models import get_session, UserSession
from kite.client import KiteClient
from api.state import set_kite_client, clear_kite_client, get_kite_client

router = APIRouter(prefix="/auth")

_API_KEY_ENV = "KITE_API_KEY"
_API_SECRET_ENV = "KITE_API_SECRET"


def _api_key() -> str:
    key = os.getenv(_API_KEY_ENV)
    if not key:
        raise HTTPException(500, f"{_API_KEY_ENV} not set")
    return key


def _api_secret() -> str:
    secret = os.getenv(_API_SECRET_ENV)
    if not secret:
        raise HTTPException(500, f"{_API_SECRET_ENV} not set")
    return secret


@router.get("/login-url")
async def login_url():
    client = KiteClient(api_key=_api_key())
    return {"url": client.login_url()}


@router.get("/callback")
async def auth_callback(
    request_token: str,
    session: AsyncSession = Depends(get_session),
):
    """
    Kite redirects here after the user logs in.
    Exchange request_token for an access token and persist the session.
    """
    client = KiteClient(api_key=_api_key())
    try:
        data = client.generate_session(request_token, _api_secret())
    except Exception as exc:
        raise HTTPException(400, f"Kite session exchange failed: {exc}")

    access_token: str = data["access_token"]
    user_id: str = data["user_id"]
    user_name: str = data.get("user_name", "")

    # replace any existing session
    existing = (await session.exec(select(UserSession))).first()
    if existing:
        await session.delete(existing)

    user_session = UserSession(
        access_token=access_token,
        user_id=user_id,
        user_name=user_name,
    )
    session.add(user_session)
    await session.commit()

    set_kite_client(KiteClient(api_key=_api_key(), access_token=access_token))

    # Web mode: redirect the browser back to the SPA callback page so the user
    # doesn't see raw JSON.  Tauri mode: return JSON; the desktop app polls
    # /api/auth/status and never renders this response in its own webview.
    if _WEB_MODE:
        return RedirectResponse(url="/callback?status=success", status_code=302)
    return {"user_id": user_id, "user_name": user_name}


@router.get("/status")
async def auth_status(session: AsyncSession = Depends(get_session)):
    existing = (await session.exec(select(UserSession))).first()
    if not existing:
        return {"authenticated": False}
    return {
        "authenticated": True,
        "user_id": existing.user_id,
        "user_name": existing.user_name,
    }


@router.post("/logout")
async def logout(session: AsyncSession = Depends(get_session)):
    existing = (await session.exec(select(UserSession))).first()
    if existing:
        await session.delete(existing)
        await session.commit()
    clear_kite_client()
    return {"ok": True}
