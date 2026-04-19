from datetime import datetime
from typing import Optional
from sqlmodel import Field, SQLModel, create_engine, Session
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine
from sqlmodel.ext.asyncio.session import AsyncSession

DATABASE_URL = "sqlite+aiosqlite:///./wickwatch.db"

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
    symbol: str          # e.g. "NSE:INFY"
    instrument_token: int
    is_active: bool = True
    added_at: datetime = Field(default_factory=datetime.utcnow)


class Alert(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    pattern_id: int = Field(foreign_key="pattern.id")
    ticker_symbol: str
    candle_time: datetime
    triggered_at: datetime = Field(default_factory=datetime.utcnow)


async def create_db():
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)


async def get_session():
    async with AsyncSession(engine) as session:
        yield session
