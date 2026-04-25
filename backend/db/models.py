from datetime import datetime, timezone
from typing import Optional
from sqlmodel import Field, SQLModel, create_engine, Session
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine
from sqlmodel.ext.asyncio.session import AsyncSession

def _db_url() -> str:
    """
    In production (Tauri sets WICKWATCH_DB_PATH to the OS app-data dir)
    the DB lives in a persistent, writable location.
    In development it falls back to ./wickwatch.db next to the backend source.
    """
    import os
    path = os.environ.get("WICKWATCH_DB_PATH")
    if path:
        return f"sqlite+aiosqlite:///{path}"
    return "sqlite+aiosqlite:///./wickwatch.db"


DATABASE_URL = _db_url()
engine: AsyncEngine = create_async_engine(DATABASE_URL)


class UserSession(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    access_token: str
    user_id: str
    user_name: str
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Pattern(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    dsl: str
    interval: str  # e.g. "5minute", "15minute"
    is_active: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class Ticker(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    symbol: str           # trading symbol, e.g. "INFY"
    exchange: str         # "NSE" | "BSE" | "NFO" etc.
    instrument_token: int
    is_active: bool = True
    added_at: datetime = Field(default_factory=datetime.utcnow)


class Alert(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    pattern_id: int = Field(foreign_key="pattern.id")
    ticker_symbol: str
    candle_time: datetime
    triggered_at: datetime = Field(default_factory=datetime.utcnow)


class PatternMatch(SQLModel, table=True):
    id:            Optional[int]  = Field(default=None, primary_key=True)
    # Denormalised so records survive pattern/ticker deletion
    pattern_id:    Optional[int]  = Field(default=None, foreign_key="pattern.id", index=True)
    pattern_name:  str
    interval:      str
    ticker_symbol: str            = Field(index=True)
    exchange:      str
    candle_time:   datetime       # UTC — the candle whose close triggered the match
    detected_at:   datetime       = Field(
                                       default_factory=lambda: datetime.now(timezone.utc),
                                       index=True,
                                   )


async def create_db():
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)


async def get_session():
    async with AsyncSession(engine) as session:
        yield session
