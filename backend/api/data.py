from __future__ import annotations
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from db.models import get_session, Pattern, Ticker

router = APIRouter(prefix="/data")


# ─── Export ───────────────────────────────────────────────────────────────────

@router.get("/export")
async def export_data(session: AsyncSession = Depends(get_session)):
    patterns = (await session.exec(select(Pattern))).all()
    tickers  = (await session.exec(select(Ticker))).all()

    return {
        "version":     1,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "patterns": [
            {
                "name":      p.name,
                "dsl":       p.dsl,
                "interval":  p.interval,
                "is_active": p.is_active,
            }
            for p in patterns
        ],
        "tickers": [
            {
                "symbol":           t.symbol,
                "exchange":         t.exchange,
                "instrument_token": t.instrument_token,
                "is_active":        t.is_active,
            }
            for t in tickers
        ],
    }


# ─── Import ───────────────────────────────────────────────────────────────────

class ImportPattern(BaseModel):
    name:      str
    dsl:       str
    interval:  str
    is_active: bool = False


class ImportTicker(BaseModel):
    symbol:           str
    exchange:         str
    instrument_token: int
    is_active:        bool = True


class ImportPayload(BaseModel):
    version:  int = 1
    patterns: list[ImportPattern] = []
    tickers:  list[ImportTicker]  = []


class ImportResult(BaseModel):
    patterns_added:   int
    patterns_skipped: int
    tickers_added:    int
    tickers_skipped:  int


@router.post("/import", response_model=ImportResult)
async def import_data(
    payload: ImportPayload,
    session: AsyncSession  = Depends(get_session),
):
    if payload.version != 1:
        raise HTTPException(400, f"Unsupported backup version: {payload.version}")

    # Existing keys for deduplication
    existing_pattern_names = {
        p.name
        for p in (await session.exec(select(Pattern))).all()
    }
    existing_tokens = {
        t.instrument_token
        for t in (await session.exec(select(Ticker))).all()
    }

    patterns_added = patterns_skipped = 0
    for p in payload.patterns:
        if p.name in existing_pattern_names:
            patterns_skipped += 1
            continue
        session.add(Pattern(
            name=p.name,
            dsl=p.dsl,
            interval=p.interval,
            is_active=p.is_active,
        ))
        existing_pattern_names.add(p.name)
        patterns_added += 1

    tickers_added = tickers_skipped = 0
    for t in payload.tickers:
        if t.instrument_token in existing_tokens:
            tickers_skipped += 1
            continue
        session.add(Ticker(
            symbol=t.symbol.upper(),
            exchange=t.exchange.upper(),
            instrument_token=t.instrument_token,
            is_active=t.is_active,
        ))
        existing_tokens.add(t.instrument_token)
        tickers_added += 1

    await session.commit()

    return ImportResult(
        patterns_added=patterns_added,
        patterns_skipped=patterns_skipped,
        tickers_added=tickers_added,
        tickers_skipped=tickers_skipped,
    )
