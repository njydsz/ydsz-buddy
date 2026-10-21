# Architecture

Ydsz Worker 是云顶数字工作台 — 会思考，会干活，陪企业成长的智能伙伴。它是自托管的多用户、多智能体 AI 助手平台，以单一 Python 进程交付，将 LangGraph 对话运行时、IM Channel Gateway（即时通讯渠道管线）和 React 前端整合为一个可安装包，内置 CLI、HTTP/WebSocket API 与 Web 控制台。

> 寻找面向贡献者的导航指南（模块边界、变更流程、硬性约束）？参见仓库根目录的 [AGENTS.md](../AGENTS.md)。本文档是面向人类的架构概览，AGENTS.md 是面向 AI 助手的开发手册。

## 1. Layering

```
┌──────────────────────────────────────────────────────────────────┐
│  Surface          │  Dashboard (React)   CLI (click)   HTTP API │
├──────────────────────────────────────────────────────────────────┤
│  API layer        │  FastAPI routers       WS / SSE / JSON        │
├──────────────────────────────────────────────────────────────────┤
│  Domain layer     │  AgentManager   Gateway   GlobalProcessor     │
│                   │  CronManager    UserManager   SharedServices │
├──────────────────────────────────────────────────────────────────┤
│  Reusable libs    │  LangGraph       IM Channel Gateway     │
├──────────────────────────────────────────────────────────────────┤
│  Storage          │  SQLite or PostgreSQL control plane + file workspaces│
└──────────────────────────────────────────────────────────────────┘
```

The whole stack is one process. There is no separate worker, no
external queue, no required external services beyond whatever LLM
provider the user configures.

## 2. Process model

`YdszServer.start()` wires the runtime tree in dependency order. The
composition root lives in `src/octop/infra/server.py`; FastAPI/uvicorn
is attached from `src/octop/launch.py` (the only module that may import
both `infra/server` and `api/app`).

```
YdszServer.start()
 ├─ PathLayout.from_env()            (root + DB + secrets dirs)
 ├─ load_config(config.json)        (env overrides on top)
 ├─ open_database()                  (SQLite WAL or PostgreSQL via PostgresPool)
 ├─ run_migrations()                 (infra/db/migrations/*.sql, versioned)
 ├─ SharedServices (repos + factories)
 ├─ WizardTokenStore                 (5-min TTL setup tokens)
 ├─ ExpertCatalog  / SubagentCatalog (bundled MD libraries)
 ├─ PluginManager.seed_bundled() then load_installed()  (~/.octop/plugins/*; bundled default off)
 ├─ AgentManager (global registry — one per process)
 │    └─ for each agent row: builds HarnessAgentRuntime on demand
 │       ├─ HarnessAgent (LangGraph)
 │       ├─ GlobalProcessor (slash dispatch + chunk projection)
 │       └─ BackendWorkspace (filesystem or remote storage adapter)
 ├─ Gateway                         (IM channels + WS hub + cron trigger source)
 │    ├─ ChannelManager (one per agent that has a channel row)
 │    └─ WebSocketHub  (dashboard + CLI channel)
 ├─ CronManager (process-wide APScheduler)
 └─ UserManager (auth + per-user lookups)
```

The `AppRuntime` dataclass holds the four live singletons that
`api/routers/*` reach via `server.app_runtime.<thing>`.

### Per-user isolation

Every request is authenticated via JWT and resolved to a `User` row.
Agent ownership is enforced at the **row** level (`agents.user_id`
matched against the caller; admin bypass allowed) — there is no longer
a separate per-user `AgentManager`. The single global registry
dispatches to whichever harness runtime matches the row, which keeps
admin tooling (`/api/admin/*`) and cross-user diagnostics simple.

The dashboard always talks to Ydsz Worker over `/api` HTTP/WebSocket; the
React SPA never imports a Python module and never opens the SQLite
file directly.

## 3. Conversation surfaces

Three surfaces share the same agent runtime:

| Surface | Wire | Session key (default) | Notes |
|---------|------|-----------------------|-------|
| Web UI | WebSocket `/api/agents/{aid}/chat/ws` | `<aid>:dashboard:<user_id>:dm` | Dashboard turn endpoint |
| CLI | Embedded `YdszServer` (REPL) or WebSocket | `<aid>:cli:<user_id>:dm` | `ydsz-worker chats send` / `chats repl` |
| IM channel | gateway `ChannelManager` | `<aid>:<channel_kind>:<platform_session>:<dm\|group>` | See `infra/gateway/process/message_keys.py` |
| Cron job | APScheduler trigger → `Gateway.push_text_from_session` | row's `session_key` (defaults to `dashboard_key` of the owner) | `task_type=text\|agent` chooses direct-push vs run-AI-then-push |

`thread_id` itself encodes no origin; origin is a column on
`chat_sessions` / `threads`. Thread reuse / archival is a row update —
see `infra/gateway/threads.py` for the full state machine.

> **Streaming chat is now WebSocket.** Legacy SSE on
> `POST /api/agents/{aid}/chat/stream` has been replaced by a
> bidirectional WS endpoint that lets the dashboard also send
> slash/`/compact` mid-turn. `POST /api/agents/{aid}/chat/hitl/resume`
> is the one route that still uses SSE — it streams the resumed turn
> back to the client.

## 4. Storage

The **control plane** (users, agents, providers, channels, cron,
sessions, audit, JWT secret) lives in either:

* SQLite — default file under `~/.octop/` (legacy `octop.db` or
  `config.json` → `database.sqlite_path`), or
* PostgreSQL — `config.json` / `YDSZ_DATABASE_*` / Setup wizard database step.

Migrations: `src/octop/infra/db/migrations/NNN_*.sql` (SQLite) and
`NNN_*.pg.sql` (PostgreSQL). Connection PRAGMAs live on the SQLite pool;
PostgreSQL extensions (e.g. `vector`) are docker/ops init, not app
migrations. Agent memory DDL is owned by the built-in memory module. See
[ADR 002](./adr/002-database-backends.md).

The wheel ships the built dashboard SPA, so the entire stack is one
`pip install`.

Per-agent workspace files (Markdown, skills, expert templates) are
read and written through the agent's `BackendWorkspace`
(`octop.infra.backend` → `ydsz_harness.backends`). The default
backend is a `filesystem` adapter rooted at
`~/.octop/agents/<agent_id>/`; remote backends (S3, COS) are mounted
on top of the same root_dir and the Ydsz Worker service never reads
content files via `Path.write_text` / `read_text` (see
[agent-backend-file-io.md](./agent-backend-file-io.md) for the full
rules). Checkpointing, langgraph state, and the
`sessions/*.jsonl` fallbacks stay on the local workspace dir because
they are harness-managed.

## 5. Internationalization (i18n)

Server-owned strings (slash replies, IM status, API error messages,
tool display names, CLI output) come from the bundles in
`src/octop/i18n/{en,zh}.json` and helpers under
`src/octop/i18n/domains/`. Locale resolution lives in
`infra/utils/locale.py`: stored user preference → `Accept-Language`
header → channel-type hint. The dashboard mirrors the codes under
`dashboard/src/locales/{en,zh}.json → apiErrors.*` and may hydrate
tool labels from `GET /api/i18n/tools`.

## 6. Multi-agent interactions (harness teams)

`@Agent` and `ask_agent` flow through the harness `TeamManager`
(InboxManager + GlobalProcessor) — see
[agent-interop-mailbox.md](./agent-interop-mailbox.md) for the queue
contract and [agent-call-agent.md](./agent-call-agent.md) /
[agent-delegation.md](./agent-delegation.md) for the two user-side
entry points. Ydsz Worker's `GlobalProcessor` implements the
`TeamProcessor` protocol so replies land back in the parent thread
checkpoint and are pushed to the dashboard / IM channel by
`on_reply`.

## See also

- [AGENTS.md](../AGENTS.md) — module boundaries, hard bans, change workflow
- [Architecture Decision Records](./adr/) — single-process, no queue (ADR 001)
- [Configuration](configuration.md) — `~/.octop/` layout + env vars
- [API reference](api.md) — every route, body, and error
- [CLI reference](cli.md) — every subcommand
- [Personas](personas.md) — MBTI templates and the mbti_profiles data module
- [ACP integration](acp.md) — in/out ACP server and runner tool
- [Agent interop](agent-interop-mailbox.md),
  [agent call](agent-call-agent.md),
  [agent delegation](agent-delegation.md)
- [Agent backend file I/O](agent-backend-file-io.md) — content file rules
