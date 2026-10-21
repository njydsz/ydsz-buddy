# ydszmemory for Hermes

Hermes `MemoryProvider` backed by the Python `ydsz-memory` runtime. Requires Hermes v0.10.0+
and Python 3.12+ with SQLite FTS5.

- **Installer package:** install `ydsz-memory-hermes` into Hermes' interpreter, then run
  `<hermes-python> -m ydszmemory.installer install --no-write-pth` and `doctor`.
- **Native plugin repository:** use `hermes plugins install --enable <plugin-repository-url>`,
  then `hermes memory setup`. This artifact does not contain the installer module.

Restart with `hermes gateway restart` and check `hermes memory status`.
Installation, configuration, troubleshooting and adapter development share one
[OpenClaw / Hermes guide](https://github.com/TencentCloud/ydsz-memory/blob/main/docs/integrations.md#hermes).
