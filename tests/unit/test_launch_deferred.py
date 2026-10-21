"""Launch composition root must tolerate deferred control-plane bind."""

from __future__ import annotations

from pathlib import Path

import pytest

from ydsz.infra.server import YdszServer


@pytest.mark.asyncio
async def test_deferred_start_exposes_config_for_listen(tmp_ydsz_home: Path, monkeypatch) -> None:
    """``ydsz-worker run`` reads bind host/port from config before the DB is bound."""
    from ydsz.infra import server as server_module

    guarded = []
    monkeypatch.setattr(server_module, "ensure_nofile_limit", lambda: guarded.append(True))
    original_probe = server_module.ensure_mobile_capabilities_probed

    def probe(path):
        assert guarded == [True]  # Resource guard runs before runtime/config initialization.
        return original_probe(path)

    monkeypatch.setattr(server_module, "ensure_mobile_capabilities_probed", probe)
    srv = YdszServer(home=tmp_ydsz_home)
    await srv.start()
    try:
        assert srv.services is None
        cfg = srv.services.config if srv.services is not None else srv.config
        assert cfg is not None
        assert isinstance(cfg.port, int)
        assert cfg.bind_host
    finally:
        await srv.stop()
