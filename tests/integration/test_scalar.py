"""Integration tests for the /api/docs Scalar endpoint."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from tests.support.app import write_ydsz_config, ydsz_client
from tests.support.auth import bootstrap_admin
from ydsz.api.app import build_app


async def test_api_docs_endpoint(tmp_ydsz_home: Path) -> None:
    write_ydsz_config(tmp_ydsz_home, enable_api_docs=True)
    async with ydsz_client(tmp_ydsz_home, patch_llm=False) as (_client, srv):
        app = build_app(srv)
        with TestClient(app) as c:
            r = c.get("/api/docs")
            assert r.status_code == 200
            assert "text/html" in r.headers["content-type"]
            assert "/api/openapi.json" in r.text
            spec = c.get("/api/openapi.json")
            assert spec.status_code == 200
            assert spec.json()["info"]["title"] == "Ydsz Worker API"


async def test_api_docs_disabled_by_default(tmp_ydsz_home: Path) -> None:
    async with ydsz_client(tmp_ydsz_home, patch_llm=False) as (client, _srv):
        await bootstrap_admin(client, tmp_ydsz_home)
        assert (await client.get("/api/docs")).status_code == 404
        assert (await client.get("/api/openapi.json")).status_code == 404
