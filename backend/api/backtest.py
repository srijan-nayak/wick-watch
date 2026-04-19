from __future__ import annotations
from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel.ext.asyncio.session import AsyncSession

from db.models import get_session, Pattern
from dsl.parser import parse, ParseError
from dsl.validator import validate, ValidationError
from dsl.compiler import compile_pattern
from executor.engine import run
from api.state import get_kite_client

router = APIRouter(prefix="/backtest")


class BacktestRequest(BaseModel):
    pattern_id: int
    instrument_token: int
    symbol: str
    from_date: date
    to_date: date


class BacktestResponse(BaseModel):
    candles: list[dict]       # OHLCV rows for the chart
    matches: list[str]        # ISO timestamps of c1 candles where pattern fired


@router.post("", response_model=BacktestResponse)
async def run_backtest(
    req: BacktestRequest,
    session: AsyncSession = Depends(get_session),
):
    pattern = await session.get(Pattern, req.pattern_id)
    if not pattern:
        raise HTTPException(404, f"Pattern {req.pattern_id} not found")

    try:
        ast = parse(pattern.dsl)
        validate(ast)
        compiled = compile_pattern(ast)
    except ParseError as exc:
        raise HTTPException(422, f"DSL parse error: {exc}")
    except ValidationError as exc:
        raise HTTPException(422, f"DSL validation error: {exc}")

    try:
        kite = get_kite_client()
    except RuntimeError:
        raise HTTPException(401, "Not authenticated — log in with Kite first")

    try:
        df = kite.historical_data(
            instrument_token=req.instrument_token,
            from_date=req.from_date,
            to_date=req.to_date,
            interval=pattern.interval,
            lookback_candles=compiled.lookback,
        )
    except Exception as exc:
        raise HTTPException(502, f"Kite historical data error: {exc}")

    match_timestamps = run(compiled, df)
    match_set = set(match_timestamps)

    candles = [
        {
            "time": idx.isoformat(),
            "open": float(row["open"]),
            "high": float(row["high"]),
            "low":  float(row["low"]),
            "close": float(row["close"]),
            "volume": float(row["volume"]),
            "match": idx in match_set,
        }
        for idx, row in df.iterrows()
    ]

    return BacktestResponse(
        candles=candles,
        matches=[ts.isoformat() for ts in match_timestamps],
    )
