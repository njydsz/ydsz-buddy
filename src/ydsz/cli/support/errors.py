"""CLI error helpers."""

from __future__ import annotations

from typing import NoReturn

import click

from ydsz.infra.errors import YdszError


def fail_ydsz(exc: YdszError) -> NoReturn:
    click.echo(f"error: {exc.message}", err=True)
    raise SystemExit(1) from exc
