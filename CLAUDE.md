# WickWatch — Claude Instructions

## What this project is
Intraday trading pattern detection and backtesting desktop app. Users define multi-candle patterns in a custom DSL, backtest them against historical data, and run them live during market hours. Built on Zerodha's Kite API.

## Architecture

```
wick-watch/
├── frontend/         # React app — UI, Monaco DSL editor, TradingView charts
└── backend/          # Python FastAPI — Kite API, pattern execution, data pipeline
    ├── indicators/
    │   └── registry.py   # Single source of truth for all indicators
    ├── dsl/              # DSL parser, validator, compiler
    ├── executor/         # Pattern matching engine
    ├── kite/             # Kite API + WebSocket wrappers
    ├── api/              # FastAPI routers
    │   ├── routes.py     # patterns, tickers, indicators endpoints
    │   ├── auth.py       # Kite OAuth flow
    │   ├── backtest.py   # Backtest endpoint
    │   ├── live.py       # Live detection start/stop/status
    │   ├── history.py    # Paginated match history
    │   ├── data.py       # Export / import backup
    │   ├── state.py      # Shared app state (kite client, live stream, seeding task, active tickers)
    │   └── ws.py         # WebSocket broadcast
    └── db/               # SQLite models (SQLModel)
        └── models.py     # Pattern, Ticker, UserSession, Alert, PatternMatch
```

## Key architectural decisions

- **Indicator registry** (`backend/indicators/registry.py`) is the single source of truth. Every indicator's label, description, params, lookback, and compute function lives here. Adding an indicator = one registry entry only.
- **DSL candle indexing**: `c1` = most recent candle, `c2` = one before, etc.
- **Indicator params are always explicit and named**: `ema(candle=1, period=20)` — no positional args, no defaults applied silently.
- **Lookback budget**: at pattern compile time, compute `max(indicator.lookback(params) for all indicators in pattern)` to determine extra historical candles to pre-fetch.
- **Frontend gets indicator metadata via API** (`GET /indicators`) — drives Monaco autocomplete and hover docs. Never hardcode indicator names in the frontend.
- **Live detection**: all active patterns run against all configured tickers. Patterns and tickers are configured independently.
- **Shared executor**: `executor/engine.py` is the single pattern evaluation path used by both backtest and live detection — no duplicated logic.
- **History is live-only**: `PatternMatch` rows are written only from live detection alerts, not from backtest runs.

## Tech stack
| Layer | Choice |
|---|---|
| Frontend | React 19 + TradingView Lightweight Charts v5 + Monaco Editor |
| State | Zustand |
| Backend | Python 3.11+, FastAPI, WebSocket |
| Indicators | ta (pure pandas; pandas-ta dropped — no Python 3.14 support via numba) |
| DB | SQLite via SQLModel + aiosqlite |
| Kite integration | kiteconnect Python SDK |

## DSL quick reference
```
# OHLC
c1.high  c1.low  c1.open  c1.close  c1.volume

# Boolean properties
c1.is_green  c1.is_red  c1.is_doji

# Indicators (always named params)
ema(candle=1, period=20)
rsi(candle=1, period=14)
bb_upper(candle=1, period=20, std=2.0)
bb_lower(candle=1, period=20, std=2.0)
bb_mid(candle=1, period=20, std=2.0)
avg_volume(candle=1, period=10)
atr(candle=1, period=14)
macd(candle=1, fast=12, slow=26, signal=9)
macd_signal(candle=1, fast=12, slow=26, signal=9)
stoch_k(candle=1, period=14)
stoch_d(candle=1, period=14)

# Standard floor pivot points (previous trading day OHLC, IST day boundary)
pivot_pp(candle=1)
pivot_r1(candle=1)   pivot_r2(candle=1)   pivot_r3(candle=1)
pivot_s1(candle=1)   pivot_s2(candle=1)   pivot_s3(candle=1)

# Logic
# Newline = implicit AND
# Explicit AND / OR supported
# Parentheses for grouping
(c1.is_green OR c2.is_green) AND c3.is_red
```

## Frontend pages
| Page | Route | Description |
|---|---|---|
| Login | `/login` | Kite OAuth entry point |
| Patterns | `/patterns` | Create / edit / delete DSL patterns, Monaco editor |
| Tickers | `/tickers` | Search instruments, add to watchlist |
| Backtest | `/backtest` | Run pattern against ticker + date range, view chart overlay |
| Live | `/live` | Start/stop live detection; Alerts tab + Logs tab |
| History | `/history` | Paginated match history with SearchableSelect filters |
| Docs | `/docs` | DSL reference with sticky TOC and dynamic indicator cards |
| Settings | `/settings` | Export / import all data as JSON backup |

## Frontend components
- **DslEditor** — Monaco Editor with custom DSL language, autocomplete, hover docs. Completion regex `\\([^)]*` triggers inside any open indicator call.
- **CandleChart** — TradingView Lightweight Charts wrapper; candle times shifted to IST display (`IST_OFFSET_S = 19800`).
- **SearchableSelect** — Combobox with live filtering, keyboard nav (↑↓ Enter Esc), outside-click close. Used in Backtest pattern/ticker selects and History filters.
- **NavBar** — Sticky left sidebar; shows live-running dot on the Live nav item.
- **ErrorBoundary** — Per-page error boundary wrapping every route.

## WebSocket message protocol
All real-time events flow over `/ws`. Backend → frontend message shapes:
```jsonc
{ "type": "alert", "pattern": "Hammer", "symbol": "INFY", "candle_time": "ISO" }
{ "type": "log",   "level": "info"|"warn"|"error", "message": "..." }
```
Frontend store keeps `alerts[]` (newest-first, max 50) and `logs[]` (newest-first, max 500).

## Live detection internals
- `POST /api/live/start` validates + compiles patterns, then returns immediately. Seeding + `stream.start()` run in a background `asyncio.Task` stored in `state._seeding_task`. `is_live_running()` returns True during seeding too (checks both `_seeding_task` and `_live_stream`).
- `POST /api/live/stop` cancels the seeding task if still running (via `task.cancel()` + await), then stops the stream — works at any phase.
- Patterns are grouped by interval; one historical seed fetch per `(ticker, interval)` — not per `(ticker, pattern)`. Lookback is the max across all patterns sharing that interval.
- Kite historical API is rate-limited to ~3 req/s. A `_RateLimiter` token-bucket at 2.5 req/s with exponential-backoff retries (`_MAX_RETRIES = 3`, backoff = 2^attempt seconds) guards all seed fetches.
- `stream.set_alert_callback` runs in a KiteTicker background thread; the callback uses `asyncio.run_coroutine_threadsafe(coro, loop)` — `loop` is captured with `asyncio.get_running_loop()` inside the async endpoint before the stream starts.
- On alert: `_handle_alert` queries the DB for pattern/ticker info (not from a closure map), broadcasts `{"type":"alert",...}` over WebSocket, and writes a `PatternMatch` row via a fresh `AsyncSession(engine)`.
- Seeding progress is broadcast as `{"type":"log",...}` messages so the Live → Logs tab shows real-time progress.

## Dynamic pattern toggling during live detection
Patterns can be enabled or disabled while live detection is running without a stream restart:
- **Disable** (`is_active: false`): `stream.remove_pattern(name)` atomically replaces each `_patterns[key]` list with a filtered copy under a `threading.Lock`. Takes effect on the next candle close.
- **Enable** (`is_active: true`): DSL is compiled, then for each active ticker: if `(token, interval)` buffer already exists → `stream.add_pattern()` under the lock (instant, no API call); if the interval is new → seed via Kite historical API first, then register.
- `state._active_tickers` stores the ticker list captured at stream start so the PATCH endpoint knows which tickers to register the newly-enabled pattern for.
- `LiveStream` uses a `threading.Lock` around all reads/writes to `_patterns` and `_buffers` to avoid races between the KiteTicker background thread and the async PATCH handler. `_evaluate()` takes a list snapshot under the lock before iterating.

## Database models
| Model | Key fields |
|---|---|
| `Pattern` | id, name, dsl, interval, is_active |
| `Ticker` | id, symbol, exchange, instrument_token, is_active |
| `UserSession` | id, access_token, user_id, user_name |
| `Alert` | id, pattern_id, ticker_symbol, candle_time, triggered_at |
| `PatternMatch` | id, pattern_id, pattern_name, interval, ticker_symbol, exchange, candle_time (UTC), detected_at (UTC) |

`create_all` on startup is non-destructive — safe for live deployments with an existing DB.

## Data export / import
`GET /api/data/export` returns a JSON blob with all patterns, tickers, and history.
`POST /api/data/import` ingests it, deduplicating by:
- patterns → `name`
- tickers → `instrument_token`
- history → `(pattern_name, ticker_symbol, candle_time)`

## Timezone handling
- Kite returns IST timestamps. `aggregator.py` normalises to UTC with `pd.to_datetime(..., utc=True)`.
- All datetimes stored in the DB are UTC.
- TradingView Lightweight Charts expects Unix timestamps. `CandleChart.tsx` adds `IST_OFFSET_S = 19800` (5h30m) to shift display back to IST wall-clock time.
- History page formats candle times via `toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })`.
- Pivot indicators use `df.index.tz_convert("Asia/Kolkata").normalize()` so day boundaries reset at IST midnight.

## Development conventions
- All real-time data flows over WebSocket (`/ws`); REST endpoints are for config and backtest requests
- Never hardcode Kite credentials — always read from the DB/session after OAuth login
- Backtest and live detection share the same pattern executor — no duplicated matching logic
- Toast alerts + Web Audio API cue are frontend-only concerns; backend emits a structured event over WebSocket
- History page fetches its own patterns/tickers from the API on mount — do not rely on the Zustand store being pre-populated by another page

## Git workflow
- Commit after every successful change
- Use a single commit message line only — no description body, no Co-Authored-By trailer

## Running locally (dev mode)
```bash
# Terminal 1 — backend (use the venv at backend/.venv)
cd backend && .venv/bin/uvicorn main:app --reload

# Terminal 2 — frontend
cd frontend && npm run dev        # Vite dev server at http://localhost:5173
```
