from __future__ import annotations
import math
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlalchemy import func, select as sa_select

from db.models import get_session, PatternMatch

router = APIRouter(prefix="/history")


@router.get("")
async def get_history(
    page:          int           = Query(default=1, ge=1),
    page_size:     int           = Query(default=50, ge=1, le=200),
    pattern_id:    Optional[int] = Query(default=None),
    ticker_symbol: Optional[str] = Query(default=None),
    source:        Optional[str] = Query(default=None),
    session:       AsyncSession  = Depends(get_session),
):
    count_q = sa_select(func.count(PatternMatch.id))
    if pattern_id is not None:
        count_q = count_q.where(PatternMatch.pattern_id == pattern_id)
    if ticker_symbol:
        count_q = count_q.where(PatternMatch.ticker_symbol == ticker_symbol)
    if source:
        count_q = count_q.where(PatternMatch.source == source)
    total = (await session.execute(count_q)).scalar() or 0

    items_q = select(PatternMatch).order_by(PatternMatch.detected_at.desc())
    if pattern_id is not None:
        items_q = items_q.where(PatternMatch.pattern_id == pattern_id)
    if ticker_symbol:
        items_q = items_q.where(PatternMatch.ticker_symbol == ticker_symbol)
    if source:
        items_q = items_q.where(PatternMatch.source == source)
    items_q = items_q.offset((page - 1) * page_size).limit(page_size)
    items = (await session.exec(items_q)).all()

    return {
        "items":     items,
        "total":     total,
        "page":      page,
        "page_size": page_size,
        "pages":     max(1, math.ceil(total / page_size)),
    }


@router.delete("")
async def clear_history(session: AsyncSession = Depends(get_session)):
    count_q = sa_select(func.count(PatternMatch.id))
    total = (await session.execute(count_q)).scalar() or 0

    all_q = select(PatternMatch)
    rows = (await session.exec(all_q)).all()
    for row in rows:
        await session.delete(row)
    await session.commit()

    return {"deleted": total}
