# Claude Code Instructions

**Read `COMMON.md` first.** It contains all universal rules, coding principles, and AI behavior requirements. If `COMMON.md` is not found at the expected path, search for it in the repo. If still not found, stop and inform the user immediately -- do not proceed without it.

This is the development and oversight context. You are at the project root. Do not run application code from here -- go into the appropriate subfolder (`nuutrader/` or `nuubt/`) to run anything.

## Scope

Claude owns backtest development in `nuubt/`. Codex (see `AGENTS.md`) owns improvements to `backend/nuubot` and `nuutrader/`. When working from this root, you are in oversight/planning mode.

## Project Structure

```
nuutrader/                    # <-- you are here (development root)
|
+-- COMMON.md                 # shared rules (all agents read first)
+-- CLAUDE.md                 # this file (project overview, development context)
+-- AGENTS.md                 # codex agent notes
+-- CONTEXT.md                # current task scratchpad
+-- PLAN.md                   # extraction plan from stingray
+-- .planning/                # GSD workflow artifacts (roadmap, state, phases)
+-- docs/                     # design, architecture, reflections
|
+-- backend/                  # nuubot engine (pip-installable)
|   +-- pyproject.toml
|   +-- nuubot/               # the engine package
|       +-- core/             # domain types, precision, logger, errors, cloid, clock, symbols, meta, formatters, telegram, scheduler
|       +-- bus/              # MessageBus pub/sub (bus.py, channels.py, transport.py)
|       +-- exchange/         # ExchangeProtocol, live (HL SDK), simulator
|       +-- db/               # all DB classes (app, ohlcv, signals, coinglass, oi, indicators, meta, vp, scheduler)
|       +-- collectors/       # collectscan pipeline (ohlcv, oi, coinglass, calc_indicators, meta)
|       +-- scanners/         # vp, regime, indicators, types
|       +-- bots/             # gridhedgebot, grid_component, hedge_component
|       +-- backtest/         # backtest engine (backtest.py, storage, contracts, variant_b, buckets, methodology, correlation_report, cli)
|       +-- server.py         # aiohttp server on :6903
|       +-- routes.py         # API routes (aiohttp)
|       +-- cli.py            # nuubot CLI (start/stop/status/collectscan)
|       +-- collector_cli.py  # ephemeral collectscan runner (cron entry point)
|       +-- manager.py        # BotManager (signal -> bot lifecycle)
|       +-- botbase.py        # abstract BotBase (lifecycle hooks)
|       +-- account.py        # Account (wraps exchange)
|       +-- journal.py        # TradeJournal (WAC, PnL, DB persistence)
|       +-- data_engine.py    # WS connection to Hyperliquid, publishes BBO
|       +-- pnl.py            # PnL computation
|       +-- app.py            # global context (app.config, app.bus, app.dbs)
|       +-- config_loader.py  # JSON5 config loading
|       +-- storage.py        # DB initialization
|       +-- dispatcher.py     # TelegramDispatcher
|       +-- chart.py          # chart data helpers
|       +-- runtime_env.py    # runtime environment detection
|       +-- scaffold.py       # nuubot init
|
+-- nuutrader/                # user project (runtime)
|   +-- CLAUDE.md             # runtime instructions (start/stop/test)
|   +-- .env                  # ports: SERVER_PORT, FRONTEND_PORT, COLLECTSCAN_PORT
|   +-- collectscan.sh        # cron runner script
|   +-- signal.sh             # test signal wrapper
|   +-- frontend/             # React/Mantine UI (Vite)
|   |   +-- src/
|   |       +-- pages/        # page components (data providers)
|   |       +-- components/   # shared components (StandardChart, SortTh, LogViewer)
|   |       +-- nuuchartkit/  # chart rendering library
|   |       +-- api/          # API client
|   |       +-- hooks/        # React hooks
|   |       +-- themes/       # shadcn/mantine theme presets
|   +-- workspace/            # runtime data
|   |   +-- config/           # settings.json5, credentials.json5, telegram.json5
|   |   +-- db/               # operational DBs (mainnet/testnet/simnet/backtest.db, meta.db, signals.db, scheduler.db)
|   |   +-- data/             # market data (ohlcv/, oi/, indicators/, vp/, backtest/)
|   |   +-- logs/             # server and collectscan logs
|   |   +-- bots/             # user custom bots
|   |   +-- scanners/         # user custom scanners
|   |   +-- cache/            # simulator cache
|   +-- scripts/              # utility scripts
|   +-- .venv/                # Python virtual environment
|
+-- nuubt/                    # backtest development (Claude's scope)
|   +-- CLAUDE.md             # backtest instructions
|   (reads data from nuutrader/workspace/data/)
|
+-- ss/                       # screenshots
```

## Architecture

Two processes, shared SQLite (WAL mode):
- **Server** -- long-running: API on :6903, DataEngine (WS), BotManager, signal polling
- **Collectscan** -- ephemeral: cron-driven, status on :6904 while running, writes to DBs, exits

Engine serves API only. No static files, no frontend serving. Frontend runs separately on Vite dev server.

## Key Separations

| Concern | Owner | Location |
|---------|-------|----------|
| Engine code | `backend/nuubot/` | pip-installable package, `nuubot` CLI |
| Runtime config + data | `nuutrader/workspace/` | settings, DBs, market data, logs |
| Frontend | `nuutrader/frontend/` | React/Mantine, talks to API on :6903 |
| Backtest dev | `nuubt/` | reads data from `nuutrader/workspace/data/` |
| Planning/oversight | root `.planning/` | roadmap, phases, state |

## Key Patterns

- **aiohttp only.** No FastAPI, no uvicorn. Pydantic kept for request validation only.
- **Config is a plain dict.** Loaded from `workspace/config/*.json5`, merged alphabetically.
- **Port is from .env**, not config. SERVER_PORT=6999, FRONTEND_PORT=5174, COLLECTSCAN_PORT=7000.
- **API contract must match stingray exactly.** Frontend depends on response shapes. Reference: `~/python/stingray/nuubot/api_routes.py`.
- **Bot lifecycle:** `create_bot` and `start_bot` are always separate. No `create_and_start_bot`. Stopped/Error are terminal. Clone to create new.
- **Fill routing:** uses CLOID decode, not account name. Fill flow: exchange -> bus -> bot (manager not in chain).
- **BotBase owns PnL cache.** Computed every 10s from BBO + journal. API reads cache only.
- **Backtest data isolation.** Binance data at `workspace/data/backtest/{raw,clean}/binance/`. Never mixed with HL collector data at `workspace/data/ohlcv/`.

## Context Window Hygiene

At ~300k tokens, remind user: "Approaching 300k tokens. Good time to `/clear` or `/compact`."
Repeat at 400k.

## Read Order (before writing code)

1. `COMMON.md` -- universal rules
2. This file -- project structure and patterns
3. `CONTEXT.md` -- current task, what's done, what's next
4. `PLAN.md` -- extraction plan and architecture decisions
5. The relevant subfolder's `CLAUDE.md` if working in `nuutrader/` or `nuubt/`
