# WickWatch Architecture

## System overview

```
┌─────────────────────────────────────────────┐
│                  Tauri Shell                │
│  (Rust — manages window + sidecar process)  │
│                                             │
│  ┌─────────────────┐  ┌───────────────────┐ │
│  │  React Frontend │  │  Python Backend   │ │
│  │                 │◄─┤  (FastAPI sidecar)│ │
│  │  Monaco Editor  │  │                   │ │
│  │  TV LW Charts   │  │  Kite WebSocket   │ │
│  │  Toast + Audio  │  │  Pattern Executor │ │
│  └─────────────────┘  │  Indicator Reg.   │ │
│                        │  SQLite DB        │ │
│                        └───────────────────┘ │
└─────────────────────────────────────────────┘
                         │
                    Kite API / WebSocket
                    (Zerodha)
```

## Data flows

### Auth
1. User clicks "Login with Kite"
2. Frontend opens Kite OAuth URL in system browser
3. Kite redirects to local callback URL (`localhost:PORT/auth/callback`)
4. Backend exchanges code for access token, stores in SQLite
5. Frontend polls for auth completion, proceeds to dashboard

### Backtest
1. User submits pattern + ticker + date range
2. Backend fetches historical candles from Kite REST API
3. Compute lookback budget from pattern → fetch `window + lookback` candles
4. Run pattern executor over sliding window → list of match timestamps
5. Stream candle data + match points to frontend over WebSocket
6. Frontend renders candlestick chart with match overlays

### Live detection
1. On market open (or when user enables), backend subscribes to Kite WebSocket for all configured tickers
2. Incoming ticks are aggregated into candles per configured interval (per pattern)
3. On each new candle close, run all active patterns against all subscribed tickers
4. On match: backend emits `{ type: "alert", pattern, ticker, candle_time }` over internal WebSocket
5. Frontend receives event → shows toast + plays audio cue

## Backend module responsibilities

| Module | Responsibility |
|---|---|
| `indicators/registry.py` | Source of truth for all indicator definitions |
| `dsl/parser.py` | Tokenize + parse DSL text into an AST |
| `dsl/validator.py` | Validate AST against indicator registry (param types, names) |
| `dsl/compiler.py` | Walk AST → compute lookback budget, produce executable form |
| `executor/engine.py` | Evaluate compiled pattern against a candle window |
| `executor/aggregator.py` | Aggregate raw ticks → OHLCV candles by interval |
| `kite/client.py` | Kite REST API wrapper (historical data, instrument list) |
| `kite/stream.py` | Kite WebSocket tick stream handler |
| `db/models.py` | SQLModel models: Pattern, Ticker, UserSession, Alert |
| `api/routes.py` | FastAPI REST endpoints |
| `api/ws.py` | FastAPI WebSocket endpoint for frontend communication |

## Frontend module responsibilities

| Module | Responsibility |
|---|---|
| `editor/` | Monaco Editor with custom DSL language + completion provider |
| `charts/` | TradingView Lightweight Charts wrapper, backtest overlay renderer |
| `live/` | WebSocket client, alert toast handler, audio cue |
| `config/` | Pattern management UI, ticker config UI |
| `auth/` | Login flow, session state |

## Key invariants
- Backtest and live detection use the **same executor** — `executor/engine.py` is the single pattern evaluation path
- Frontend **never** hardcodes indicator names or params — all metadata comes from `GET /indicators`
- Kite access token lives only in SQLite — never in frontend state or localStorage
- Each pattern stores its **raw DSL text** in the DB; compilation happens at runtime
