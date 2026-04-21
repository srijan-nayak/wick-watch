import os
import logging
from contextlib import asynccontextmanager
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import select

from api.routes import router as api_router
from api.ws import router as ws_router
from api.auth import router as auth_router
from api.backtest import router as backtest_router
from api.live import router as live_router
from db.models import create_db, get_session, UserSession
from kite.client import KiteClient
from api.state import set_kite_client

log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await create_db()
    await _restore_kite_session()
    yield


async def _restore_kite_session():
    """If a session was persisted from a previous run, restore the KiteClient."""
    async for session in get_session():
        existing = (await session.exec(select(UserSession))).first()
        if existing:
            api_key = os.getenv("KITE_API_KEY", "")
            if api_key:
                set_kite_client(KiteClient(api_key=api_key, access_token=existing.access_token))
                log.info("Restored Kite session for %s", existing.user_id)


app = FastAPI(title="WickWatch", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",   # Vite dev server
        "tauri://localhost",       # macOS / Linux Tauri webview
        "http://tauri.localhost",  # Windows Tauri webview
        "http://localhost",        # fallback
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router,      prefix="/api")
app.include_router(auth_router,     prefix="/api")
app.include_router(backtest_router, prefix="/api")
app.include_router(live_router,     prefix="/api")
app.include_router(ws_router)
