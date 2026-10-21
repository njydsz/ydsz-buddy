"""Resolve acting user for CLI commands."""

from __future__ import annotations

from pathlib import Path

from ydsz.infra.users.acting import resolve_acting_user_id


def resolve_cli_acting_user_id(
    agent_id: str | None = None,
    as_user: str | None = None,
    *,
    home: Path | None = None,
) -> int:
    """Resolve ``--user`` / pinned default_user / agent owner via local DB."""
    from ydsz.cli.support.ctx import resolve_user
    from ydsz.cli.support.db import open_cli_services
    from ydsz.cli.support.state import load
    from ydsz.infra.utils.paths import PathLayout

    paths = PathLayout(home) if home is not None else PathLayout.from_env()
    with open_cli_services(home) as svc:
        pinned = load(paths.root / "cli_state.json").default_user
        return resolve_acting_user_id(
            svc,
            as_username=resolve_user(as_user),
            pinned_username=pinned,
            agent_id=agent_id,
        )
