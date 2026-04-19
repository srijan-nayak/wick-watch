# WickWatch — Claude Instructions

## What this project is
Intraday trading pattern detection and backtesting desktop app. Users define multi-candle patterns in a custom DSL, backtest them against historical data, and run them live during market hours. Built on Zerodha's Kite API.

## Architecture

```
wick-watch/
├── src-tauri/        # Tauri shell (Rust) — desktop packaging, sidecar lifecycle
├── frontend/         # React app — UI, Monaco DSL editor, TradingView charts
└── backend/          # Python FastAPI — Kite API, pattern execution, data pipeline
    ├── indicators/
    │   └── registry.py   # Single source of truth for all indicators
    ├── dsl/              # DSL parser, validator, compiler
    ├── executor/         # Pattern matching engine
    ├── kite/             # Kite API + WebSocket wrappers
    └── db/               # SQLite models (SQLModel)
```

## Key architectural decisions

- **Indicator registry** (`backend/indicators/registry.py`) is the single source of truth. Every indicator's label, description, params, lookback, and compute function lives here. Adding an indicator = one registry entry only.
- **DSL candle indexing**: `c1` = most recent candle, `c2` = one before, etc.
- **Indicator params are always explicit and named**: `ema(candle=1, period=20)` — no positional args, no defaults applied silently.
- **Lookback budget**: at pattern compile time, compute `max(indicator.lookback(params) for all indicators in pattern)` to determine extra historical candles to pre-fetch.
- **Frontend gets indicator metadata via API** (`GET /indicators`) — drives Monaco autocomplete and hover docs. Never hardcode indicator names in the frontend.
- **Live detection**: all active patterns run against all configured tickers. Patterns and tickers are configured independently.

## Tech stack
| Layer | Choice |
|---|---|
| Desktop shell | Tauri (Rust, native webview) |
| Frontend | React + TradingView Lightweight Charts + Monaco Editor |
| Backend | Python 3.11+, FastAPI, WebSocket |
| Indicators | pandas-ta |
| DB | SQLite via SQLModel |
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
avg_volume(candle=1, period=10)
atr(candle=1, period=14)

# Logic
# Newline = implicit AND
# Explicit AND / OR supported
# Parentheses for grouping
(c1.is_green OR c2.is_green) AND c3.is_red
```

## Development conventions
- Backend is a FastAPI sidecar — Tauri manages its process lifecycle via `src-tauri/sidecar`
- All real-time data flows over WebSocket (`/ws`); REST endpoints are for config and backtest requests
- Never hardcode Kite credentials — always read from the DB/session after OAuth login
- Backtest and live detection share the same pattern executor — no duplicated matching logic
- Toast alerts + Web Audio API cue are frontend-only concerns; backend emits a structured event over WebSocket

## Git workflow
- Commit after every successful change
- Use a single commit message line only — no description body

## Running locally (dev mode)
```bash
# Terminal 1 — backend
cd backend && uvicorn main:app --reload

# Terminal 2 — frontend + Tauri
cd frontend && npm run dev        # or inside Tauri: cargo tauri dev
```
