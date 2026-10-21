"""Unit tests for require_permission dependency."""

from __future__ import annotations

import pytest

from ydsz.api.deps import require_permission
from ydsz.infra.errors import ErrorCode, YdszError
from ydsz.infra.users.identity import Role, User


def _user(is_admin: bool, permissions: list[str] | None = None) -> User:
    return User(
        id=1,
        username="u",
        role=Role.ADMIN if is_admin else Role.USER,
        display_name=None,
        permissions=permissions or [],
    )


def test_unknown_key_raises_at_construction() -> None:
    with pytest.raises(RuntimeError):
        require_permission("not_a_real_key")


async def test_dependency_denies_without_permission() -> None:
    dep = require_permission("browser")
    with pytest.raises(YdszError) as exc:
        await dep(_user(False, []))
    assert exc.value.code is ErrorCode.FORBIDDEN
    assert exc.value.details.get("permission") == "browser"


async def test_dependency_allows_admin_and_holder() -> None:
    dep = require_permission("browser")
    assert await dep(_user(True)) is not None
    assert await dep(_user(False, ["browser"])) is not None
