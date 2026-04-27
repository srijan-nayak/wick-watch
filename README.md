# WickWatch

Intraday trading pattern detection and backtesting for Zerodha Kite. Define multi-candle patterns in a custom DSL, backtest them against historical data, and run them live during market hours with real-time alerts.

---

## Features

- **Custom DSL** — Write readable multi-candle conditions with full indicator support and IDE-quality autocomplete
- **Backtest** — Run any pattern against any ticker over a date range; results overlay on an interactive candlestick chart
- **Live detection** — Stream live ticks from Kite WebSocket, match patterns on candle close, get instant alerts with audio cue; enable or disable individual patterns while the stream is running without a restart
- **Match history** — Every live alert is persisted; browse, filter, and paginate the full history table
- **Data backup** — Export all patterns, tickers, and match history to JSON; import on a new machine or after a volume wipe
- **Light / dark mode** — System-respecting theme toggle, applied everywhere including charts
- **Web app** — Runs fully in the browser; deploy with Docker or run the dev server locally

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite |
| Charts | TradingView Lightweight Charts v5 |
| Editor | Monaco Editor with custom DSL language |
| State | Zustand |
| Backend | Python 3.11+, FastAPI, WebSocket |
| Indicators | `ta` library (pure pandas) |
| Database | SQLite via SQLModel + aiosqlite |
| Kite integration | `kiteconnect` Python SDK |

---

## Project structure

```
wick-watch/
├── frontend/           # React app
│   └── src/
│       ├── pages/      # Backtest, History, Live, Patterns, Settings, Tickers, Docs
│       ├── components/ # NavBar, DslEditor, CandleChart, SearchableSelect, …
│       ├── hooks/      # useWebSocket
│       ├── store/      # Zustand store (auth, patterns, tickers, alerts, logs, theme)
│       └── api/        # Fetch client + TypeScript types
└── backend/
    ├── api/            # FastAPI routers (auth, patterns, tickers, backtest, live, history, data)
    ├── db/             # SQLModel models + async engine
    ├── dsl/            # Lexer → parser → validator → compiler
    ├── executor/       # Pattern engine + tick aggregator
    ├── indicators/     # Registry — single source of truth for all indicators
    └── kite/           # REST client + WebSocket stream wrapper
```

---

## Running locally

### Prerequisites

- Python 3.11+
- Node.js 20+
- A Zerodha Kite Connect API key and secret (set in `backend/.env`)

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Create backend/.env
echo "KITE_API_KEY=your_api_key" > .env
echo "KITE_API_SECRET=your_api_secret" >> .env

.venv/bin/uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev       # Vite dev server at http://localhost:5173
```

The frontend proxies API calls to `localhost:8000` in dev mode.

---

## Docker (web mode)

```bash
docker-compose up --build
```

The app is served at `http://localhost:8000`. The Vite output is embedded in the FastAPI static mount — no separate container needed.

```yaml
# docker-compose.yml highlights
services:
  app:
    build: .
    ports: ["8000:8000"]
    volumes:
      - ./data:/data          # SQLite DB persists here
    environment:
      WICKWATCH_DB_PATH: /data/wickwatch.db
      KITE_API_KEY: ${KITE_API_KEY}
      KITE_API_SECRET: ${KITE_API_SECRET}
```

> **Important**: Mount a named volume or host directory at `/data` — otherwise the DB is lost on container restart.

---

## DSL quick reference

```
# Candle indexing: c1 = most recent, c2 = one before, cN = Nth most recent
# OHLC fields
c1.open   c1.high   c1.low   c1.close   c1.volume

# Boolean shorthand
c1.is_green   # close > open
c1.is_red     # close < open
c1.is_doji    # body/range < 10%

# Indicators — always named params, no positional args
ema(candle=1, period=20)
rsi(candle=1, period=14)
bb_upper(candle=1, period=20, std=2.0)
bb_lower(candle=1, period=20, std=2.0)
bb_mid(candle=1, period=20, std=2.0)
atr(candle=1, period=14)
avg_volume(candle=1, period=10)
macd(candle=1, fast=12, slow=26, signal=9)
macd_signal(candle=1, fast=12, slow=26, signal=9)
stoch_k(candle=1, period=14)
stoch_d(candle=1, period=14)

# Standard floor pivot points (based on previous trading day)
pivot_pp(candle=1)
pivot_r1(candle=1)   pivot_r2(candle=1)   pivot_r3(candle=1)
pivot_s1(candle=1)   pivot_s2(candle=1)   pivot_s3(candle=1)

# Logic: newline = implicit AND; explicit AND/OR with parens
c1.is_green
c2.is_red
c1.close > ema(candle=1, period=20)

# OR requires explicit keyword
(c1.is_green OR c2.is_green) AND c3.is_red

# Comments
# This line is ignored
```

### Example — Hammer near daily S1

```
c1.is_green
c1.low < pivot_s1(candle=1)
c1.close > pivot_s1(candle=1)
rsi(candle=1, period=14) < 40
```

### Example — EMA crossover with volume

```
c2.close < ema(candle=2, period=20)
c1.close > ema(candle=1, period=20)
c1.is_green
c1.volume > avg_volume(candle=1, period=20)
```

---

## API overview

| Method | Path | Description |
|---|---|---|
| GET | `/api/auth/login-url` | Get Kite OAuth URL |
| GET | `/api/auth/status` | Check authentication status |
| POST | `/api/auth/logout` | Clear session |
| GET | `/api/indicators` | All indicator metadata (drives autocomplete) |
| GET/POST | `/api/patterns` | List / create patterns |
| PATCH/DELETE | `/api/patterns/{id}` | Update / delete pattern |
| GET/POST | `/api/tickers` | List / add tickers |
| DELETE | `/api/tickers/{id}` | Remove ticker |
| POST | `/api/backtest` | Run backtest |
| GET | `/api/live/status` | Live detection running state |
| POST | `/api/live/start` | Start live detection |
| POST | `/api/live/stop` | Stop live detection |
| GET | `/api/history` | Paginated match history (filterable) |
| DELETE | `/api/history` | Clear all history |
| GET | `/api/data/export` | Export all data as JSON |
| POST | `/api/data/import` | Import from backup JSON |
| WS | `/ws` | Real-time alerts and live detection logs |

---

## WebSocket message types

Messages sent from backend → frontend over `/ws`:

```jsonc
{ "type": "alert",  "pattern": "Hammer",  "symbol": "INFY", "candle_time": "2024-01-15T04:05:00+00:00" }
{ "type": "log",    "level": "info",       "message": "Seeding… 42/414 done" }
{ "type": "log",    "level": "warn",       "message": "Could not seed XYZB: invalid instrument token" }
```

---

## Data backup

All patterns, tickers, and match history can be exported to a portable JSON file from **Settings → Download backup**. The file can be imported on any instance — duplicates are skipped automatically.

```json
{
  "version": 1,
  "exported_at": "2024-01-15T10:30:00+00:00",
  "patterns": [...],
  "tickers": [...],
  "history": [...]
}
```

---

## Architecture

See [`docs/architecture.md`](docs/architecture.md) for the full system design.

## DSL specification

See [`docs/dsl-spec.md`](docs/dsl-spec.md) for the complete language reference.
