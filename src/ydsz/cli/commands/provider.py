"""ydsz-worker provider commands."""

from __future__ import annotations

import json as _json
import sys
from typing import Any

import click

from ydsz.cli.support.errors import fail_ydsz
from ydsz.infra.errors import YdszError


@click.group()
def provider() -> None:
    """Provider management commands (local DB)."""


@provider.command("list")
def list_providers() -> None:
    """List providers."""
    from rich.console import Console
    from rich.table import Table

    from ydsz.cli.support.ctx import json_output_enabled
    from ydsz.cli.support.offline_ops import list_providers_offline

    rows = list_providers_offline()
    if json_output_enabled():
        safe: list[dict[str, Any]] = []
        for p in rows:
            item = dict(p)
            if item.get("api_key"):
                item["api_key"] = "***"
            safe.append(item)
        click.echo(_json.dumps(safe, indent=2))
        return
    table = Table(title="Providers")
    for col in ("id", "name", "kind", "enabled"):
        table.add_column(col)
    for p in rows:
        table.add_row(
            str(p.get("id", "")),
            p.get("name", ""),
            p.get("kind", ""),
            str(bool(p.get("enabled", True))),
        )
    Console(file=sys.stdout).print(table)


@provider.command("create")
@click.option("--name", required=True)
@click.option("--kind", required=True)
@click.option("--base-url", default=None)
@click.option("--api-key", default=None, hide_input=True)
@click.option("--models", "models_json", default=None, help="JSON array of model objects.")
def create(
    name: str,
    kind: str,
    base_url: str | None,
    api_key: str | None,
    models_json: str | None,
) -> None:
    """Create a provider."""
    models = _json.loads(models_json) if models_json else None
    from ydsz.cli.support.offline_ops import create_provider_offline

    try:
        row = create_provider_offline(
            name=name,
            kind=kind,
            base_url=base_url,
            api_key=api_key,
            models=models,
        )
    except YdszError as exc:
        fail_ydsz(exc)
    click.echo(_json.dumps(row, indent=2))


@provider.command("delete")
@click.argument("provider_id")
def delete(provider_id: str) -> None:
    """Delete a provider."""
    from ydsz.cli.support.offline_ops import delete_provider_offline

    try:
        delete_provider_offline(int(provider_id))
    except YdszError as exc:
        fail_ydsz(exc)
    click.echo("deleted")


@provider.command("test")
@click.argument("provider_id")
@click.option("--model", "model_id", default=None)
def test(provider_id: str, model_id: str | None) -> None:
    """Probe a provider with a one-token ping."""
    from ydsz.cli.support.embedded_ops import probe_provider

    data = probe_provider(int(provider_id), model_id=model_id)
    if data.get("ok"):
        click.echo(f"ok ({data.get('latency_ms', '?')} ms)")
        return
    click.echo(f"failed: {data.get('error', 'unknown error')}", err=True)
    raise SystemExit(1)
