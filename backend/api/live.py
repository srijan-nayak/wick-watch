from __future__ import annotations
import asyncio
import logging
from collections import defaultdict
from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select

from db.models import get_session, Pattern, Ticker, PatternMatch, engine
from sqlmodel.ext.asyncio.session import AsyncSession as _AsyncSession
from dsl.parser import parse, ParseError
from dsl.validator import validate, ValidationError
from dsl.compiler import compile_pattern
from kite.stream import LiveStream
from api.state import (
    get_kite_client, get_live_stream, set_live_stream,
    clear_live_stream, is_live_running,
    set_active_tickers, clear_active_tickers,
    get_seeding_task, set_seeding_task, clear_seeding_task,
)
from api.ws import broadcast

log = logging.getLogger(__name__)

router = APIRouter(prefix="/live")

# Kite's historical-data API is rate-limited to ~3 req/s per user.
# We target 2.5 to stay safely under that limit.
_KITE_RATE   = 2.5   # requests per second
_MAX_RETRIES = 3     # retries on rate-limit responses before giving up


# ── Token-bucket rate limiter ────────────────────────────────────────────────

class _RateLimiter:
    """
    Simple async token-bucket. Allows at most `rate` acquire() calls per second.
    Excess callers sleep just long enough to stay within the budget.
    """
    def __init__(self, rate: float) -> None:
        self._rate    = rate
        self._tokens  = rate       # start full so first requests are instant
        self._updated = 0.0        # initialised on first acquire()
        self._lock    = asyncio.Lock()

    async def acquire(self) -> None:
        async with self._lock:
            now = asyncio.get_running_loop().time()
            if self._updated == 0.0:
                self._updated = now
            elapsed = now - self._updated
            self._tokens  = min(self._rate, self._tokens + elapsed * self._rate)
            self._updated = now

            if self._tokens >= 1.0:
                self._tokens -= 1.0
            else:
                wait = (1.0 - self._tokens) / self._rate
                self._tokens  = 0.0
                self._updated += wait
                await asyncio.sleep(wait)


# ── Error helpers ────────────────────────────────────────────────────────────

def _is_rate_limited(exc: Exception) -> bool:
    msg = str(exc).lower()
    return "too many" in msg or "429" in msg or "rate" in msg

def _is_invalid_token(exc: Exception) -> bool:
    msg = str(exc).lower()
    return (
        ("invalid" in msg and ("token" in msg or "instrument" in msg))
        or "no data" in msg
    )


# ── Broadcast helper ─────────────────────────────────────────────────────────

async def _log(level: str, message: str) -> None:
    log.info("[live/%s] %s", level, message)
    await broadcast({"type": "log", "level": level, "message": message})


# ── Routes ───────────────────────────────────────────────────────────────────

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

    # One fetch per (ticker, interval) — use max lookback across patterns sharing
    # the same interval so we never fetch the same data twice.
    interval_patterns: dict[str, list[tuple[Pattern, object]]] = defaultdict(list)
    interval_lookback: dict[str, int] = {}
    for pattern, compiled in compiled_patterns:
        interval_patterns[pattern.interval].append((pattern, compiled))
        interval_lookback[pattern.interval] = max(
            interval_lookback.get(pattern.interval, 0),
            compiled.lookback,
        )

    total_jobs   = len(active_tickers) * len(interval_lookback)
    intervals_str = ", ".join(sorted(interval_lookback))
    await _log("info", (
        f"Starting live detection — {len(compiled_patterns)} pattern(s), "
        f"{len(active_tickers)} ticker(s), interval(s): {intervals_str}"
    ))
    await _log("info", (
        f"Seeding {total_jobs} buffer(s) at {_KITE_RATE} req/s "
        f"(~{total_jobs / _KITE_RATE:.0f}s estimated)…"
    ))

    stream = LiveStream(
        api_key=kite._kite.api_key,
        access_token=kite._kite.access_token,
    )

    async def _handle_alert(name: str, token: int, symbol: str, ts) -> None:
        await broadcast({
            "type": "alert",
            "pattern": name,
            "instrument_token": token,
            "symbol": symbol,
            "candle_time": ts.isoformat(),
        })
        candle_dt = ts.to_pydatetime() if hasattr(ts, "to_pydatetime") else ts
        async with _AsyncSession(engine) as db:
            pat    = (await db.exec(select(Pattern).where(Pattern.name == name))).first()
            ticker = (await db.exec(select(Ticker).where(Ticker.instrument_token == token))).first()
            db.add(PatternMatch(
                pattern_id=pat.id if pat else None,
                pattern_name=name,
                interval=pat.interval if pat else "",
                ticker_symbol=symbol,
                exchange=ticker.exchange if ticker else "",
                candle_time=candle_dt,
            ))
            await db.commit()

    loop = asyncio.get_running_loop()
    stream.set_alert_callback(
        lambda name, token, symbol, ts: asyncio.run_coroutine_threadsafe(
            _handle_alert(name, token, symbol, ts), loop
        )
    )

    limiter       = _RateLimiter(_KITE_RATE)
    progress      = [0]
    progress_step = max(1, total_jobs // 10)

    async def _fetch_seed(ticker: Ticker, interval: str, lookback: int):
        for attempt in range(_MAX_RETRIES + 1):
            await limiter.acquire()
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

            except asyncio.CancelledError:
                raise

            except Exception as exc:
                if _is_rate_limited(exc) and attempt < _MAX_RETRIES:
                    backoff = 2 ** attempt
                    await asyncio.sleep(backoff)
                    continue

                progress[0] += 1
                if progress[0] % progress_step == 0 or progress[0] == total_jobs:
                    await _log("info", f"Seeding… {progress[0]}/{total_jobs} done")

                if _is_invalid_token(exc):
                    await _log("warn",
                        f"Could not seed {ticker.symbol} ({interval}): "
                        "invalid instrument token — remove and re-add this ticker")
                else:
                    await _log("warn",
                        f"Could not seed {ticker.symbol} ({interval}): {exc}")
                return None

    async def _seed_and_start():
        try:
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

            summary = f"Seeding complete — {seeded} seeded, {failed} failed"
            await _log("warn" if failed else "info", summary)

            stream.start()
            set_live_stream(stream)
            await _log("info", f"Stream started — watching {seeded} buffer(s) for pattern matches")

        except asyncio.CancelledError:
            await _log("warn", "Live detection cancelled during seeding")

        finally:
            clear_seeding_task()

    set_active_tickers(list(active_tickers))
    task = asyncio.create_task(_seed_and_start())
    set_seeding_task(task)

    return {"ok": True, "patterns": len(compiled_patterns), "tickers": len(active_tickers)}


@router.post("/stop")
async def stop_live():
    task = get_seeding_task()
    if task:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    stream = get_live_stream()
    if stream:
        stream.stop()
        clear_live_stream()

    clear_active_tickers()

    if task or stream:
        await _log("info", "Live detection stopped")

    return {"ok": True}


def _today():
    from datetime import date
    return date.today()
