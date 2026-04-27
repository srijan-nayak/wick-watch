# WickWatch Architecture

## System overview

```
┌───────────────────┐  ┌─────────────────────────┐
│  React Frontend   │  │    Python Backend        │
│                   │◄─┤    (FastAPI)             │
│  Monaco Editor    │  │                          │
│  TV LW Charts     │  │  Kite WebSocket          │
│  Toast + Audio    │  │  Pattern Executor        │
│  Zustand store    │  │  Indicator Registry      │
└───────────────────┘  │  SQLite DB               │
                        └─────────────────────────┘
                                   │
                          Kite API / WebSocket
                          (Zerodha)
```

The React build is served as static files by FastAPI — no separate web server needed. In dev mode, Vite runs on port 5173 and proxies API calls to the FastAPI server on port 8000.

---

## Data flows

### Auth
1. User clicks "Login with Kite"
2. Frontend opens Kite OAuth URL in a new browser tab (`window.open`)
3. Kite redirects to local callback URL (`/callback`)
4. Backend exchanges request token for access token, stores in `UserSession` table
5. Callback tab calls `window.close()` to dismiss itself; the opener tab detects auth completion and navigates to `/patterns`

### Backtest
1. User selects pattern + ticker + date range and submits
2. Backend fetches historical candles from Kite REST API
3. Compute lookback budget from compiled pattern → fetch `window + lookback` extra candles
4. Run pattern executor (`executor/engine.py`) over sliding window → list of match timestamps
5. Return candle data + match timestamps to frontend as JSON
6. Frontend renders interactive candlestick chart (TradingView) with match overlays

### Live detection
1. User clicks "Start" → `POST /api/live/start`
2. Backend compiles all active patterns (fails fast on DSL errors), then **returns immediately**
3. Seeding runs in a background `asyncio.Task` — groups patterns by interval, seeds each `(ticker, interval)` buffer with recent historical candles via Kite REST API, rate-limited to 2.5 req/s with exponential-backoff retry
4. Seeding progress broadcast as `{"type":"log",...}` WebSocket messages to the Live → Logs tab
5. After seeding, `LiveStream` subscribes to Kite WebSocket for all configured tickers
6. Incoming ticks are aggregated into candles per interval by `executor/aggregator.py`
7. On each new candle close, all matching patterns for that interval are evaluated
8. On match: broadcast `{"type":"alert",...}` over `/ws` AND write a `PatternMatch` row to SQLite
9. Frontend receives alert → shows toast + plays audio cue
10. User can click "Stop" at any time — cancels the seeding task if still running, or stops the stream if already started

---

## Backend module responsibilities

| Module | Responsibility |
|---|---|
| `indicators/registry.py` | Single source of truth for all indicator definitions (label, description, params, lookback fn, compute fn) |
| `dsl/parser.py` | Tokenize + parse DSL text into an AST |
| `dsl/validator.py` | Validate AST against indicator registry (param names, types) |
| `dsl/compiler.py` | Walk AST → compute lookback budget, produce executable form |
| `executor/engine.py` | Evaluate compiled pattern against a candle DataFrame window |
| `executor/aggregator.py` | Aggregate raw ticks → OHLCV candles by interval; normalises timestamps to UTC |
| `kite/client.py` | Kite REST API wrapper (historical data, instrument search) |
| `kite/stream.py` | Kite WebSocket tick stream; deduplicates alerts against last-seen candle time; thread-safe `add_pattern()` / `remove_pattern()` for dynamic toggling while running |
| `db/models.py` | SQLModel tables: Pattern, Ticker, UserSession, Alert, PatternMatch |
| `api/routes.py` | REST endpoints: patterns, tickers, indicators; PATCH `/patterns/{id}` syncs `is_active` changes into the running stream without restart |
| `api/auth.py` | Kite OAuth login-url + callback + logout |
| `api/backtest.py` | Single POST endpoint; fetches candles, runs executor, returns results |
| `api/live.py` | Start/stop/status; seeding runs in a background task (cancellable); rate limiter; alert handler queries DB for pattern/ticker info |
| `api/history.py` | Paginated `GET /history` (filters: pattern_id, ticker_symbol) + `DELETE /history` |
| `api/data.py` | `GET /data/export` + `POST /data/import` for full data backup/restore |
| `api/state.py` | Module-level singletons: KiteClient ref, LiveStream ref, seeding Task ref, active tickers list; `is_live_running()` returns true during seeding or streaming |
| `api/ws.py` | `/ws` WebSocket endpoint + `broadcast()` helper |

---

## Frontend page responsibilities

| Page | Route | Responsibility |
|---|---|---|
| Login | `/login` | Shows "Login with Kite" button; opens OAuth URL via `window.open` |
| Callback | `/callback` | Handles OAuth redirect; closes popup tab after successful auth |
| Patterns | `/patterns` | Monaco editor for DSL; create / update / delete / activate patterns |
| Tickers | `/tickers` | Instrument search (API or client-side filter); add/remove tickers |
| Backtest | `/backtest` | SearchableSelect for pattern + ticker; date pickers; chart overlay |
| Live | `/live` | Start/stop toggle; Alerts tab (real-time list); Logs tab (seeding progress) |
| History | `/history` | Paginated `PatternMatch` table; SearchableSelect filters; fetches own data |
| Docs | `/docs` | Sticky TOC; DSL reference; dynamic indicator cards from `GET /indicators` |
| Settings | `/settings` | Export backup to JSON; import from JSON with dedup summary toast |

---

## Frontend component responsibilities

| Component | Responsibility |
|---|---|
| `DslEditor` | Monaco Editor; custom DSL language; autocomplete on OHLC fields, indicators, and params; hover docs |
| `CandleChart` | TradingView Lightweight Charts wrapper; match markers; IST time offset (`+19800s`) |
| `SearchableSelect` | Combobox with live filter, keyboard nav, outside-click close |
| `NavBar` | Sticky left sidebar; live-running dot on Live item; theme toggle; sign-out |
| `ErrorBoundary` | Per-page boundary; prevents full-app crash on page errors |

---

## Key invariants

- Backtest and live detection use the **same executor** — `executor/engine.py` is the single pattern evaluation path
- Frontend **never** hardcodes indicator names or params — all metadata comes from `GET /indicators`
- Kite access token lives only in SQLite — never in frontend state or localStorage
- Each pattern stores its **raw DSL text** in the DB; compilation happens at runtime
- All timestamps stored in the DB are **UTC**; IST conversion is a display-layer concern
- `PatternMatch` history records are written only from live detection, not from backtests
- `create_all` on startup is non-destructive — existing tables and data are preserved

---

## Database schema

```
Pattern          Ticker              UserSession
────────         ──────────          ─────────────
id (PK)          id (PK)             id (PK)
name             symbol              access_token
dsl              exchange            user_id
interval         instrument_token    user_name
is_active        is_active           created_at
created_at       added_at
updated_at

Alert            PatternMatch
────────         ─────────────────────────────────
id (PK)          id (PK)
pattern_id (FK)  pattern_id (FK, nullable)
ticker_symbol    pattern_name        ← denormalised
candle_time      interval            ← denormalised
triggered_at     ticker_symbol
                 exchange
                 candle_time (UTC)
                 detected_at (UTC)
```

`PatternMatch` denormalises `pattern_name` and `interval` so records survive pattern deletion.

---

## Live detection rate limiting

Kite historical API allows ~3 requests/second per user. With many tickers, naive parallel fetching causes HTTP 429 errors. The solution is a token-bucket rate limiter:

```
_RateLimiter(rate=2.5)      # 2.5 req/s — safely under the 3 req/s limit
_MAX_RETRIES = 3             # on 429: retry with 2^attempt second backoff (1s, 2s, 4s)
```

Fetches are parallelised with `asyncio.gather` but each one must acquire a token before calling the Kite API. This gives maximum throughput without busting the rate limit.
