"""tests/integration/test_server_lifecycle.py"""

from __future__ import annotations

from pathlib import Path

import pytest

from tests.support.app import ensure_control_plane_bound
from ydsz.infra.server import YdszServer


async def _bind_default_sqlite(srv: YdszServer) -> None:
    await ensure_control_plane_bound(srv)


@pytest.fixture
async def server(tmp_ydsz_home: Path):
    srv = YdszServer(home=tmp_ydsz_home)
    await srv.start()
    await _bind_default_sqlite(srv)
    yield srv
    await srv.stop()


async def test_start_defers_db_until_bind(tmp_ydsz_home: Path):
    srv = YdszServer(home=tmp_ydsz_home)
    await srv.start()
    try:
        assert tmp_ydsz_home.is_dir()
        assert (tmp_ydsz_home / "config.json").exists()
        assert not (tmp_ydsz_home / "ydsz.db").exists()
        assert srv.database_bound is False
        assert srv.services is None
        await _bind_default_sqlite(srv)
        assert (tmp_ydsz_home / "ydsz.db").exists()
        assert srv.database_bound is True
    finally:
        await srv.stop()


async def test_start_creates_root_and_db(server: YdszServer, tmp_ydsz_home: Path):
    assert tmp_ydsz_home.is_dir()
    assert (tmp_ydsz_home / "ydsz.db").exists()
    assert (tmp_ydsz_home / "config.json").exists()


async def test_jwt_secret_seeded(server: YdszServer):
    assert server.services is not None
    secret = server.services.secret_repo.get("jwt")
    assert secret is not None
    assert len(secret) >= 32


async def test_user_manager_loaded(server: YdszServer):
    assert server.user_manager is not None
    assert server.user_manager.count() == 0


async def test_boot_then_stop_idempotent(tmp_ydsz_home: Path):
    srv = YdszServer(home=tmp_ydsz_home)
    await srv.start()
    await _bind_default_sqlite(srv)
    await srv.stop()
    await srv.stop()  # idempotent
