"""ydsz-worker version command."""

from __future__ import annotations

import click


@click.command("version")
def version() -> None:
    """Show the installed ydsz-worker version."""
    try:
        from importlib.metadata import version as _v

        v = _v("ydsz")
    except Exception:
        v = "unknown"
    click.echo(f"ydsz-worker v{v}")
