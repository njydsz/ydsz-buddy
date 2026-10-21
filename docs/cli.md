# CLI Reference

> Ydsz Worker 基于 Tencent Octop（MIT 协议）二开。CLI 命令已更名为 `ydsz-worker`。

`ydsz-worker` is a single Click app installed as `ydsz-worker` on `pip install ydsz-worker`.
It is registered in `src/octop/cli/main.py`; commands are loaded
lazily from `src/octop/cli/registry.py`.

```
$ ydsz-worker --help
Usage: ydsz-worker [OPTIONS] COMMAND [ARGS]...

  Octop command-line interface.

Options:
  -v, --version           Show the installed ydsz-worker version.
  --user TEXT             Default --user for subcommands (admin acting on behalf
                          of a user). [env: OCTOP_USER]
  --agent TEXT            Default --agent for subcommands. [env: OCTOP_AGENT]
  --json                  Emit machine-readable JSON for list-style commands.
  -h, --help              Show this message and exit.

Commands:
  acp        Run Octop agent as ACP server (stdio).
  admin      Admin commands.
  agent      Agent lifecycle commands.
  backup     Export and restore Octop backups.
  bridge     Manage remote Ydsz Worker bridge peers.
  chat       [deprecated] Alias for `ydsz-worker chats`.
  chats      Chat REPL and session management.
  channel    Channel management commands.
  clean      Remove CLI state or wipe all of ~/.octop.
  completion Shell completion utilities.
  config     CLI state (base URL, defaults).
  cron       Cron job management commands.
  init       Bootstrap a Ydsz Worker server install.
  models     Model catalog and active-model settings.
  plugin     Install and manage plugins.
  provider   Provider management (admin write).
  run        Run ydsz-worker-server in the foreground.
  service    System service lifecycle (start/stop/restart/status).
  skills     Per-agent skill enable/disable.
  update     Check for and install a newer Ydsz Worker release.
  user       User management commands.
  version    Show the installed ydsz-worker version.
```

> **Tip.** Regenerate the per-subcommand listings below with
> `make docs-cli` (each `ydsz-worker <cmd> --help` is captured to stdout).

## Global options

| Option | Env | Effect |
|--------|-----|--------|
| `--user NAME` | `OCTOP_USER` | Default `--user` for subcommands (admin acting on behalf of a user) |
| `--agent ID` | `OCTOP_AGENT` | Default `--agent` for subcommands |
| `--json` | — | Emit machine-readable JSON for list-style commands |
| `-v, --version` | — | Print version and exit |

## Transport layers

Octop commands pick one of these transports:

| Layer | When | Login? | Examples |
|-------|------|--------|----------|
| **Offline** (local DB only) | Need to read/write `~/.octop` without a running server | No | `init`, `backup`, `plugin`, `agent list`, `chats list/get/create/update/delete`, `cron list`, `user *`, `admin overview/audit`, `models presets/list/active`, `bridge list/get` |
| **Attach** (HTTP / WS) | Need a live `ydsz-worker run` process (IM, streams, model pulls) | Yes (`ydsz-worker user login`) | `chats send/repl`, `channel test/probe`, `models ollama-*`, `skills enable/disable`, `provider test` |
| **Embedded** (in-process) | CLI boots `OctopServer` for a single command | No | `ydsz-worker acp`, `ydsz-worker chats repl`, `ydsz-worker chats send` (defaults to embedded), `ydsz-worker agent create/from-expert/start/stop/reload` |
| **Embedded (bridge)** | In-process `BridgeManager` (no full server); CLI cannot keep the WS after exit | No | `bridge probe/create/patch/delete/connect/disconnect/agents` |

The dashboards and HTTP callers manage their own JWTs and do **not**
share `~/.octop/cli_state.json`.

## `ydsz-worker init`

Bootstrap a fresh install (DB migrations, JWT secret, first admin).
Idempotent on the DB; pass `--force` to wipe `~/.octop` first.

```
Usage: ydsz-worker init [OPTIONS]

  Bootstrap an Octop server (~/.octop dir, DB migrations, JWT secret, first admin).

Options:
  --admin-username TEXT       [env: OCTOP_ADMIN_USERNAME]
  --admin-password TEXT       [env: OCTOP_ADMIN_PASSWORD]
  --admin-display-name TEXT   [env: OCTOP_ADMIN_DISPLAY_NAME]
  --force                     Wipe existing ~/.octop contents before bootstrapping.
  --yes                       Skip all interactive prompts.
  -h, --help                  Show this message and exit.
```

## `ydsz-worker run`

Start the FastAPI app in the foreground (delegates to
`octop.launch.run_foreground_blocking`).

```
Usage: ydsz-worker run [OPTIONS]

  Start the Ydsz Worker server (foreground; uvicorn).

Options:
  --host TEXT                 Override OCTOP_BIND_HOST.
  --port INTEGER RANGE        Override OCTOP_PORT (0-65535, 0 = OS-assigned).
  --reload / --no-reload      Enable uvicorn auto-reload (dev only).
  --ssl / --no-ssl            Enable HTTPS with a self-signed cert (or a real one).
  --certfile PATH             TLS certificate (PEM).
  --keyfile PATH              TLS private key (PEM).
  --log-level [debug|info|warning|error]
  -h, --help                  Show this message and exit.
```

## `ydsz-worker service`

Install and manage the Octop system service. The backend is detected
automatically (systemd on Linux, launchd on macOS); the scope
(`user` vs `system`) can be forced via `--scope` or
`OCTOP_SERVICE_SCOPE`.

```
Usage: ydsz-worker service [OPTIONS] COMMAND [ARGS]...

  Manage the Ydsz Worker system service (systemd on Linux, launchd on macOS).

Commands:
  start     Install (if missing) and start the service.
  stop      Stop the service.
  restart   Restart the service.
  status    Print whether the service is installed / running / healthy.
```

`status` probes the HTTP health endpoint and prints journal/log hints
on failure.

On Linux, `start` and `restart` install a systemd drop-in
(`ydsz-worker.service.d/10-nofile.conf`) with `LimitNOFILE=65535` (user
units are capped to the process hard rlimit so systemd cannot fail to
spawn). The main unit file is not rewritten unless it is missing or
you pass `--force-install`. `restart` always runs `systemctl restart`
even if writing the drop-in fails, so an upgrade that only restarts
still comes back. To undo: delete the drop-in, then
`systemctl daemon-reload && systemctl restart ydsz-worker`.

## `ydsz-worker user`

Local-DB user management. `login` requires a running server; the
rest are offline.

```
Usage: ydsz-worker user [OPTIONS] COMMAND [ARGS]...

  User management commands (local DB; no server login required).

Commands:
  create    Create a new user.
  list      List all users.
  passwd    Reset a user's password (admin).
  role      Set a user's role.
  disable   Disable a user.
  delete    Delete a user.
  login     Login against a running server; stores JWT for optional remote HTTP attach.
```

## `ydsz-worker agent`

Lifecycle and templates. Most commands boot an embedded
`OctopServer` to operate on the local DB without a remote round-trip.

```
Usage: ydsz-worker agent [OPTIONS] COMMAND [ARGS]...

  Agent lifecycle commands.

Commands:
  create        Create a new agent.
  from-expert   Create an agent from a bundled expert template.
  list          List agents.
  use           Pin this agent as the default for subsequent commands.
  start         Start the agent runtime.
  stop          Stop the agent runtime.
  reload        Reload the agent runtime.
  delete        Delete the agent row (and runtime).
  experts       List bundled expert templates.
```

`create` and `from-expert` accept `--user` (admin only) to create
agents on behalf of another user. `use` writes the agent id into
`~/.octop/cli_state.json` so subsequent commands default to it.

## `octop chats`

Thread CRUD + interactive REPL. The REPL and `send` use an embedded
server (no separate `ydsz-worker run` needed); `list` / `get` / `create` /
`update` / `delete` work fully offline against `~/.octop/octop.db`.

```
Usage: ydsz-worker chats [OPTIONS] COMMAND [ARGS]...

  Thread list/history and interactive chat (CLI channel / local DB).

Commands:
  list        List conversation threads for an agent.
  get         Show message history for a thread.
  create      Start a new thread (/new equivalent).
  update      Rename or pin a thread.
  delete      Delete a thread.
  send        Send one message and stream the response.
  repl        Interactive chat REPL (embedded server + CLI gateway channel).
```

`ydsz-worker chat` is a deprecated alias that prints a stderr warning and
forwards to `chats`.

## `ydsz-worker bridge`

User-scoped Octop-to-Octop peer links (same surface as Dashboard **远程桥接**).
`--user` / pinned `default_user` selects the local owner. `--peer-user` is
the **remote** login. `probe` talks HTTP only; `create --connect` /
`connect` / `agents` verify the Bridge WebSocket then close it — start
`ydsz-worker run` to keep a link alive (auto-reconnect).

```
Usage: ydsz-worker bridge [OPTIONS] COMMAND [ARGS]...

  Manage remote Ydsz Worker bridge peers (add / edit / probe / connect).

Commands:
  list        List saved bridge connections.
  get         Show one saved connection.
  probe       Test peer credentials (login + list experts).
  create      Add a peer (optional Bridge WS handshake).
  patch       Update name / notes / icon / credentials / auto-reconnect.
  delete      Delete a saved connection.
  connect     Dial and verify Bridge WS, then close the CLI session.
  disconnect  Mark a connection disconnected in the local DB.
  agents      Dial, list remote experts via the tunnel, then close.
```

`probe` without `CONNECTION_ID` requires `--url` and `--peer-user`.
`probe CONNECTION_ID` reuses the stored password when `--peer-password`
is omitted. `create` always needs the remote password: pass
`--peer-password` or type it at the hidden prompt.

## `ydsz-worker channel`

Local DB channel CRUD plus platform-specific bot creators. The
`wecom` / `weixin` / `feishu-setup` subcommands drive the QR-code
bot-creator flows; `config` is the offline config editor.

```
Usage: ydsz-worker channel [OPTIONS] COMMAND [ARGS]...

  Channel management commands.

Commands:
  list          List channels for an agent.
  get           Show one channel row.
  create        Create a channel.
  patch         Update a channel.
  delete        Delete a channel.
  test          Test a channel (instantiate → start → stop).
  config        Edit channel config offline.
  feishu-setup  Drive the Feishu bot-creator flow.
  bind          Bind-group helper for WeCom / Weixin (QR login, etc.).
```

## `ydsz-worker cron`

Local DB cron management. `run-now` requires a running `ydsz-worker run`
because the actual fire is dispatched through the live
`CronManager`.

```
Usage: ydsz-worker cron [OPTIONS] COMMAND [ARGS]...

  Cron job management commands.

Commands:
  list        List cron jobs for an agent.
  create      Create a cron job.
  delete      Delete a cron job.
  run-now     Trigger a cron job immediately.
```

`create --trigger` accepts cron expressions (`"0 9 * * *"`) and the
`interval:N` / `date:ISO8601` aliases. A `date:` job runs once and
then disables itself, whether the run succeeds or fails. If the
server is down for more than 24 hours past that time and the job
never ran, it is marked `missed` and disabled. The row stays in the
list. `--task-type text` pushes the prompt verbatim; `--task-type
agent` (default) runs the LLM and pushes the reply. `--prompt` is
required, must be non-empty and ≤ 2000 characters.

## `ydsz-worker provider`

Local DB provider CRUD. `test` requires a running server.

```
Usage: ydsz-worker provider [OPTIONS] COMMAND [ARGS]...

  Provider management commands (local DB).

Commands:
  list      List providers.
  create    Create a provider.
  delete    Delete a provider.
  test      Ping the provider (requires running server).
```

## `ydsz-worker models`

Provider presets and active model management.

```
Usage: ydsz-worker models [OPTIONS] COMMAND [ARGS]...

  Model catalog and active-model settings.

Commands:
  presets       List built-in provider templates from octop-harness.
  list          List all resolved models across enabled providers.
  active        Show or set the global default model (admin).
  config        Interactively create a provider from presets and set the active model.
  ollama-list   List local Ollama models (requires a running server).
  ollama-pull   Pull a model via Ollama (requires a running server).
  ollama-rm     Remove a local Ollama model (requires a running server).
```

## `ydsz-worker skills`

Per-agent skill enable / disable. All subcommands need a running
server (the dashboard's Skill Hub and bundled `~/.octop/skills/`
library are queried at boot).

```
Usage: ydsz-worker skills [OPTIONS] COMMAND [ARGS]...

  Manage agent skills (enable / disable / list).

Commands:
  list      List skills for an agent.
  enable    Enable a skill for the agent.
  disable   Disable a skill for the agent.
  config    Show / edit the per-agent skills config.
```

## `ydsz-worker admin`

Local DB admin operations. `rotate-jwt-secret` works without a
running server (it edits the SQLite secret row directly).

```
Usage: ydsz-worker admin [OPTIONS] COMMAND [ARGS]...

  Admin commands (local DB).

Commands:
  overview             Show admin overview (user count, agent state distribution).
  audit                Show audit log entries.
  providers            Global (admin) providers.
  rotate-jwt-secret    Rotate the JWT secret directly via the local DB.
```

## `ydsz-worker captcha`

Login captcha maintenance against the local database. Works fully offline
(edits the SQLite settings row directly) — the escape hatch for when a
misconfigured captcha provider (wrong keys, unreachable vendor, hostname
not allowlisted) locks everyone out of the dashboard, since the settings
UI itself requires login to reach.

```
Usage: ydsz-worker captcha [OPTIONS] COMMAND [ARGS]...

  Login captcha maintenance against the local database.

Commands:
  reset    Clear stored captcha settings so login falls back to the slider default.
```

Boot-env captcha (`OCTOP_CAPTCHA_*`) is not touched by `reset` — unset
those in the environment file if they are the actual lockout cause.
Restart `ydsz-worker run` (if already running) for the change to apply.

## `ydsz-worker backup`

Export and restore Octop backups. Works fully offline.

```
Usage: ydsz-worker backup [OPTIONS] COMMAND [ARGS]...

  Backup and restore database + local agent workspaces.

Commands:
  create     Create a backup archive (DB + workspaces + config).
  restore    Restore a backup archive into ~/.octop.
  auto       Automatic backup status and one-shot run.
```

### `ydsz-worker backup auto`

Automatic backups are scheduled **inside** a running `octop run` process
(via the same system-job mechanism as TLS renewal). Configure in
`config.json` under `backup`, with env overrides
`OCTOP_BACKUP_AUTO_ENABLED`, `OCTOP_BACKUP_SCHEDULE`,
`OCTOP_BACKUP_RETENTION_COUNT`, or via the dashboard Backup settings.

```
Usage: ydsz-worker backup auto [OPTIONS] COMMAND [ARGS]...

Commands:
  status  Print automatic backup settings from config.json.
  run     Create one automatic backup now and prune by retention.
```

Default schedule when enabled: `cron:0 4 * * *` (daily 04:00, server
timezone). Automatic archives are named `ydsz-worker-auto-backup-*.tar.gz`;
retention only deletes those files and never touches manual
`ydsz-worker-backup-*.tar.gz` archives.

## `ydsz-worker update`

Check for and install a newer Ydsz Worker release from the configured
channel (PyPI by default).

```
Usage: ydsz-worker update [OPTIONS]

  Check for and install a newer Ydsz Worker release.

Options:
  --check / --no-check     Only check; do not install.
  --channel TEXT           Release channel (pypi, testpypi, custom index).
  -h, --help               Show this message and exit.
```

## `ydsz-worker plugin`

Install and manage third-party plugins (drop into `~/.octop/plugins/`).
The same plugin manager powers the dashboard's "Plugins" page.

Octop also **seeds bundled plugins** into `~/.octop/plugins/` during
`ydsz-worker init` and every `ydsz-worker run` start. They are listed in Admin →
Plugins but stay **globally disabled** until you turn them on. An id
already recorded in `config.json` → `bundled_plugins_seeded` is not
copied again after uninstall.

```
Usage: ydsz-worker plugin [OPTIONS] COMMAND [ARGS]...

  Install and manage plugins.

Commands:
  list       List installed plugins.
  install    Install a plugin (local path or git URL).
  uninstall  Remove an installed plugin.
  reload     Reload all installed plugins without restart.
```

## `octop acp`

Expose an Octop agent as a stdio JSON-RPC ACP server. Boots a
standalone `OctopServer` (reads `~/.octop`); does **not** require
`octop run` to be running.

```
Usage: ydsz-worker acp [OPTIONS]

  Run Octop agent as ACP server (stdio).

Options:
  --agent TEXT   Agent to expose (default: OCTOP_AGENT or first agent).
  --debug        Log to stderr.
  -h, --help     Show this message and exit.
```

See [ACP integration](./acp.md) for the Zed setup example and the
runner object schema.

## `ydsz-worker clean`

Reset CLI state or wipe the whole `~/.octop` tree. Destructive — read
the help carefully.

```
Usage: ydsz-worker clean [OPTIONS]

  Remove CLI state or wipe all of ~/.octop.

Options:
  --state / --all       What to remove.
  --yes                 Skip the confirmation prompt.
  -h, --help            Show this message and exit.
```

## `ydsz-worker config`

Inspect / edit `~/.octop/cli_state.json` (default base URL, user,
agent).

```
Usage: ydsz-worker config [OPTIONS] COMMAND [ARGS]...

  CLI state (base URL, defaults).

Commands:
  show       Print the current CLI state.
  set-user   Pin the default --user.
```

## `octop completion` / `octop version`

```text
$ ydsz-worker completion show bash   # dump a shell snippet
$ ydsz-worker completion install     # append to ~/.zshrc / ~/.bashrc
$ ydsz-worker version                # print the installed ydsz-worker version
```

## CLI state file

`~/.octop/cli_state.json` stores:

```json
{
  "base_url": "http://127.0.0.1:8088",
  "token": null,
  "default_user": null,
  "default_agent": null
}
```

The path is exposed as `ydsz_worker.cli.support.state.default_state_path()`
and can be overridden via `OCTOP_HOME`. Delete the file to log out
the CLI without hitting the server. The dashboard and HTTP callers
do not share this file — they manage their own tokens.
