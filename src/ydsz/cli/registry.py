"""CLI command registry for lazy loading."""

from __future__ import annotations

# command name -> (relative module path, attribute name, short help)
COMMANDS: dict[str, tuple[str, str, str]] = {
    "memory": (".commands.memory", "memory", "Live memory maintenance (backup and slim)."),
    "init": (".commands.init", "init", "Bootstrap a Ydsz Worker install."),
    "run": (".commands.run", "run", "Run ydsz-server in the foreground."),
    "service": (
        ".commands.service",
        "service",
        "System service lifecycle (start/stop/restart/status).",
    ),
    "config": (".commands.config", "config_group", "CLI defaults (pinned user/agent)."),
    "user": (".commands.user", "user", "User management commands (admin only)."),
    "agent": (".commands.agent", "agent", "Agent lifecycle commands."),
    "chats": (".commands.chats", "chats", "Chat REPL and session management."),
    "channel": (".commands.channel", "channel", "Channel management commands."),
    "cron": (".commands.cron", "cron", "Cron job management commands."),
    "provider": (".commands.provider", "provider", "Provider management (admin write)."),
    "models": (".commands.models", "models", "Provider presets and resolved models."),
    "skills": (".commands.skills", "skills", "Per-agent skill enable/disable."),
    "admin": (".commands.admin", "admin", "Admin commands."),
    "captcha": (
        ".commands.captcha",
        "captcha",
        "Login captcha maintenance (lockout escape hatch).",
    ),
    "version": (".commands.version", "version", "Show the installed ydsz-worker version."),
    "completion": (".commands.completion", "completion", "Shell completion utilities."),
    "update": (".commands.update", "update", "Check for and install a newer Ydsz Worker release."),
    "clean": (".commands.clean", "clean", "Remove CLI state or wipe all of ~/.ydsz-worker."),
    "backup": (".commands.backup", "backup", "Export and restore Ydsz Worker backups."),
    "bridge": (".commands.bridge", "bridge", "Manage remote Ydsz Worker bridge peers."),
    "acp": (".commands.acp", "acp_cmd", "Run Ydsz Worker agent as ACP server (stdio)."),
    "plugin": (".commands.plugin", "plugin", "Install and manage plugins."),
}
