from fastapi import APIRouter, Depends
from sqlmodel.ext.asyncio.session import AsyncSession
from db.models import get_session, Pattern, Ticker
from indicators.registry import indicator_metadata
from sqlmodel import select

router = APIRouter()


@router.get("/indicators")
async def get_indicators():
    return indicator_metadata()


@router.get("/patterns")
async def list_patterns(session: AsyncSession = Depends(get_session)):
    result = await session.exec(select(Pattern))
    return result.all()


@router.post("/patterns")
async def create_pattern(pattern: Pattern, session: AsyncSession = Depends(get_session)):
    session.add(pattern)
    await session.commit()
    await session.refresh(pattern)
    return pattern


@router.patch("/patterns/{pattern_id}")
async def update_pattern(pattern_id: int, data: dict, session: AsyncSession = Depends(get_session)):
    pattern = await session.get(Pattern, pattern_id)
    for k, v in data.items():
        setattr(pattern, k, v)
    session.add(pattern)
    await session.commit()
    await session.refresh(pattern)
    return pattern


@router.delete("/patterns/{pattern_id}")
async def delete_pattern(pattern_id: int, session: AsyncSession = Depends(get_session)):
    pattern = await session.get(Pattern, pattern_id)
    await session.delete(pattern)
    await session.commit()


@router.get("/tickers")
async def list_tickers(session: AsyncSession = Depends(get_session)):
    result = await session.exec(select(Ticker))
    return result.all()


@router.post("/tickers")
async def add_ticker(ticker: Ticker, session: AsyncSession = Depends(get_session)):
    session.add(ticker)
    await session.commit()
    await session.refresh(ticker)
    return ticker


@router.delete("/tickers/{ticker_id}")
async def remove_ticker(ticker_id: int, session: AsyncSession = Depends(get_session)):
    ticker = await session.get(Ticker, ticker_id)
    await session.delete(ticker)
    await session.commit()
