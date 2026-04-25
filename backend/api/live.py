from __future__ import annotations
import asyncio
import logging
from collections import defaultdict
from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select

from db.models import get_session, Pattern, Ticker
from dsl.parser import parse, ParseError
from dsl.validator import validate, ValidationError
from dsl.compiler import compile_pattern
from kite.stream import LiveStream
from api.state import (
    get_kite_client, get_live_stream, set_live_stream,
    clear_live_stream, is_live_running,
)
from api.ws import broadcast

log = logging.getLogger(__name__)

router = APIRouter(prefix="/live")

# Max concurrent Kite historical-data requests during seeding.
_SEED_CONCURRENCY = 10


async def _log(level: str, message: str) -> None:
    """Broadcast a structured log entry to all connected frontend clients."""
    log.info("[live/%s] %s", level, message)
    await broadcast({"type": "log", "level": level, "message": message})


@router.get("/status")
async def live_status():
    return {"running": is_live_running()}


@router.post("/start")
async def start_live(session: AsyncSession = Depends(get_session)):
    if is_live_running():
        return {"ok": True, "message": "already running"}

    try:
        kite = get_kite_client()
    except RuntimeError:
        raise HTTPException(401, "Not authenticated")

    active_patterns = (
        await session.exec(select(Pattern).where(Pattern.is_active == True))
    ).all()
    active_tickers = (
        await session.exec(select(Ticker).where(Ticker.is_active == True))
    ).all()

    if not active_patterns:
        raise HTTPException(400, "No active patterns — enable at least one pattern first")
    if not active_tickers:
        raise HTTPException(400, "No active tickers — add at least one ticker first")

    # Compile all patterns up front so we fail fast on DSL errors
    compiled_patterns: list[tuple[Pattern, object]] = []
    for p in active_patterns:
        try:
            ast = parse(p.dsl)
            validate(ast)
            compiled = compile_pattern(ast)
            compiled_patterns.append((p, compiled))
        except (ParseError, ValidationError) as exc:
            raise HTTPException(422, f"Pattern '{p.name}' DSL error: {exc}")

    # Group patterns by interval; track max lookback per interval so we fetch
    # seed data once per (ticker, interval) instead of once per (ticker, pattern).
    interval_patterns: dict[str, list[tuple[Pattern, object]]] = defaultdict(list)
    interval_lookback: dict[str, int] = {}
    for pattern, compiled in compiled_patterns:
        interval_patterns[pattern.interval].append((pattern, compiled))
        interval_lookback[pattern.interval] = max(
            interval_lookback.get(pattern.interval, 0),
            compiled.lookback,
        )

    total_jobs = len(active_tickers) * len(interval_lookback)
    intervals_str = ", ".join(sorted(interval_lookback))
    await _log("info", (
        f"Starting live detection — {len(compiled_patterns)} pattern(s), "
        f"{len(active_tickers)} ticker(s), interval(s): {intervals_str}"
    ))
    await _log("info", (
        f"Seeding {total_jobs} buffer(s) "
        f"({len(active_tickers)} tickers × {len(interval_lookback)} interval(s)), "
        f"concurrency={_SEED_CONCURRENCY}…"
    ))

    stream = LiveStream(
        api_key=kite._kite.api_key,
        access_token=kite._kite.access_token,
    )

    loop = asyncio.get_running_loop()
    stream.set_alert_callback(
        lambda name, token, symbol, ts: asyncio.run_coroutine_threadsafe(
            broadcast({
                "type": "alert",
                "pattern": name,
                "instrument_token": token,
                "symbol": symbol,
                "candle_time": ts.isoformat(),
            }),
            loop,
        )
    )

    # Shared progress counter (mutable via list so the closure can write it)
    progress = [0]
    progress_step = max(1, total_jobs // 10)   # emit ~10 progress updates
    sem = asyncio.Semaphore(_SEED_CONCURRENCY)

    async def _fetch_seed(ticker: Ticker, interval: str, lookback: int):
        async with sem:
            try:
                result = await asyncio.to_thread(
                    kite.historical_data,
                    instrument_token=ticker.instrument_token,
                    from_date=_today() - timedelta(days=5),
                    to_date=_today(),
                    interval=interval,
                    lookback_candles=lookback,
                )
                progress[0] += 1
                if progress[0] % progress_step == 0 or progress[0] == total_jobs:
                    await _log("info", f"Seeding… {progress[0]}/{total_jobs} done")
                return result
            except Exception as exc:
                progress[0] += 1
                await _log("warn", f"Could not seed {ticker.symbol} ({interval}): {exc}")
                return None

    jobs = [
        (ticker, interval, _fetch_seed(ticker, interval, interval_lookback[interval]))
        for ticker in active_tickers
        for interval in interval_lookback
    ]

    seed_results = await asyncio.gather(*[job[2] for job in jobs])

    seeded = failed = 0
    for (ticker, interval, _), seed_df in zip(jobs, seed_results):
        if seed_df is None:
            failed += 1
            continue
        for pattern, compiled in interval_patterns[interval]:
            stream.register(
                instrument_token=ticker.instrument_token,
                symbol=ticker.symbol,
                interval=interval,
                pattern_name=pattern.name,
                compiled=compiled,
                seed_df=seed_df,
            )
        seeded += 1

    await _log(
        "warn" if failed else "info",
        f"Seeding complete — {seeded} seeded, {failed} failed"
        + (f" ({failed} tickers have stale/invalid tokens — remove and re-add them)" if failed else ""),
    )

    stream.start()
    set_live_stream(stream)
    await _log("info", f"Stream started — watching {seeded} buffer(s) for pattern matches")

    return {"ok": True, "patterns": len(compiled_patterns), "tickers": len(active_tickers)}


@router.post("/stop")
async def stop_live():
    stream = get_live_stream()
    if stream:
        stream.stop()
        clear_live_stream()
        await _log("info", "Live detection stopped")
    return {"ok": True}


def _today():
    from datetime import date
    return date.today()
