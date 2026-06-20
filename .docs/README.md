# Remi Code Documentation

This directory contains the source of truth for Remi Code's developer
documentation. The marketing site at
[`apps/marketing`](../../apps/marketing) mirrors a subset of these docs in
[`/docs`](../../apps/marketing/src/pages/docs.astro).

The intended audience is **contributors and integrators** of the Rust backend,
the React desktop frontend, and the JSON-RPC control plane.

## Layout

| Path | Purpose |
|------|---------|
| [`architecture.md`](./architecture.md) | High-level system architecture, crate responsibilities, and runtime topology. |
| [`orchestration.md`](./orchestration.md) | How the CQRS + event-sourcing engine works, and how to add commands. |
| [`providers.md`](./providers.md) | Provider adapter contract, supported providers, and how to add your own. |
| [`persistence.md`](./persistence.md) | SQLite schema, projection tables, migrations, and event store invariants. |
| [`api/rpc.md`](./api/rpc.md) | JSON-RPC 2.0 method catalog, push channels, and envelope conventions. |
| [`api/tauri-commands.md`](./api/tauri-commands.md) | Tauri IPC command reference and the renderer bridge. |
| [`operations/release.md`](./operations/release.md) | Release engineering, signing, and distribution matrix. |

## Reading order

If you are new to the codebase, read the files in this order:

1. [`architecture.md`](./architecture.md) — start here to understand the moving
   parts.
2. [`orchestration.md`](./orchestration.md) — the engine is the heart of
   everything.
3. [`persistence.md`](./persistence.md) — events and projections are the
   substrate of the engine.
4. [`providers.md`](./providers.md) — adapter shape, so you can plug a new
   provider.
5. [`api/rpc.md`](./api/rpc.md) — wire format between the renderer and the
   server.

## Conventions

- All examples assume the project root is the current working directory.
- File paths are workspace-relative (`remi-orchestration/src/engine.rs`).
- Code fences use the language tag that matches the file. For Rust snippets
  inside TypeScript files we use ` ```rust ` to keep syntax highlighting
  meaningful.
- "Thread" refers to a chat session. "Turn" is a single round-trip inside a
  thread. See the glossary in the main [README](../../README.md#a-术语表).

## Contributing to these docs

Docs are written in Markdown. PRs that change behavior **must** also update
the relevant file in this directory. CI fails if a public Rust type, JSON-RPC
method, or Tauri command is changed without a corresponding docs change — see
[`.github/workflows/docs.yml`](../workflows/docs.yml).
