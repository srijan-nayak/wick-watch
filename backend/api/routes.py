from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlmodel.ext.asyncio.session import AsyncSession
from db.models import get_session, Pattern, Ticker
from indicators.registry import indicator_metadata
from api.state import get_kite_client
from sqlmodel import select

router = APIRouter()


@router.get("/indicators")
async def get_indicators():
    return indicator_metadata()


@router.get("/instruments")
async def search_instruments(
    query: str = Query(..., min_length=1),
    exchange: str = Query("NSE"),
):
    try:
        kite = get_kite_client()
    except RuntimeError:
        raise HTTPException(401, "Not authenticated")
    instruments = kite.search_instruments(exchange=exchange)
    q = query.lower()
    return [
        {
            "symbol": i["tradingsymbol"],
            "name": i["name"],
            "exchange": i["exchange"],
            "instrument_token": i["instrument_token"],
        }
        for i in instruments
        if q in i["tradingsymbol"].lower() or q in i["name"].lower()
    ][:30]


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


class AddTickerRequest(BaseModel):
    symbol: str
    exchange: str


@router.post("/tickers")
async def add_ticker(req: AddTickerRequest, session: AsyncSession = Depends(get_session)):
    symbol = req.symbol.strip().upper()
    exchange = req.exchange.strip().upper()

    try:
        kite = get_kite_client()
    except RuntimeError:
        raise HTTPException(401, "Not authenticated")

    # Resolve instrument token from Kite's instrument dump
    instruments = kite.search_instruments(exchange=exchange)
    match = next(
        (i for i in instruments if i["tradingsymbol"].upper() == symbol),
        None,
    )
    if match is None:
        raise HTTPException(
            404,
            f"Symbol '{symbol}' not found on {exchange}. "
            "Check the symbol spelling or try a different exchange.",
        )

    token: int = match["instrument_token"]

    # Deduplicate: return existing row if already tracked
    existing = (
        await session.exec(
            select(Ticker).where(Ticker.instrument_token == token)
        )
    ).first()
    if existing:
        return existing

    ticker = Ticker(symbol=symbol, exchange=exchange, instrument_token=token)
    session.add(ticker)
    await session.commit()
    await session.refresh(ticker)
    return ticker


@router.delete("/tickers/{ticker_id}")
async def remove_ticker(ticker_id: int, session: AsyncSession = Depends(get_session)):
    ticker = await session.get(Ticker, ticker_id)
    await session.delete(ticker)
    await session.commit()
