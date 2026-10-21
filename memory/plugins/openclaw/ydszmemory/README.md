# ydszmemory for OpenClaw

OpenClaw memory plugin backed by the Python `ydsz-memory` runtime.

```bash
uv tool install 'ydsz-memory[cli]'
openclaw plugins install @ydsz-memory/openclaw
ydsz-memory openclaw setup
openclaw gateway restart
ydsz-memory openclaw doctor
```

Requires Python 3.12+ with SQLite FTS5 and a host version compatible with `package.json`.
Installation, configuration, profiles, troubleshooting and adapter development share one
[OpenClaw / Hermes guide](https://github.com/TencentCloud/ydsz-memory/blob/main/docs/integrations.md#openclaw).
