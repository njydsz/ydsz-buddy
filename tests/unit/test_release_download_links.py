"""tests/unit/test_release_download_links.py"""

from __future__ import annotations

import importlib.util
from pathlib import Path

_SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "release_download_links.py"


def _load():
    spec = importlib.util.spec_from_file_location("release_download_links", _SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_split_tag_accepts_with_or_without_v() -> None:
    mod = _load()
    assert mod.split_tag("0.9.31") == ("v0.9.31", "0.9.31")
    assert mod.split_tag("v0.9.31") == ("v0.9.31", "0.9.31")


def test_render_download_section_matches_github_asset_names() -> None:
    mod = _load()
    body = mod.render_download_section("0.9.31")
    base = "https://github.com/TencentCloud/Ydsz Worker/releases/download/v0.9.31"
    assert f"{base}/Ydsz Worker-desktop-windows-amd64-0.9.31.exe" in body
    assert f"{base}/Ydsz Worker-desktop-windows-arm64-0.9.31.exe" in body
    assert f"{base}/Ydsz Worker-portable-windows-amd64-0.9.31.zip" in body
    assert f"{base}/Ydsz Worker-portable-windows-arm64-0.9.31.zip" in body
    assert f"{base}/Ydsz Worker-desktop-darwin-arm64-0.9.31.dmg" in body
    assert f"{base}/Ydsz Worker-desktop-darwin-amd64-0.9.31.dmg" in body
    assert f"{base}/Ydsz Worker-portable-darwin-arm64-0.9.31.zip" in body
    assert f"{base}/Ydsz Worker-portable-darwin-amd64-0.9.31.zip" in body
    assert f"{base}/Ydsz Worker-desktop-linux-amd64-0.9.31.tar.gz" in body
    assert f"{base}/Ydsz Worker-desktop-linux-arm64-0.9.31.tar.gz" in body
    assert f"{base}/Ydsz Worker-portable-linux-amd64-0.9.31.zip" in body
    assert f"{base}/Ydsz Worker-portable-linux-arm64-0.9.31.zip" in body
    assert f"{base}/Ydsz Worker-fnos-docker-0.9.31.fpk" in body
    assert f"{base}/Ydsz Worker-fnos-native-0.9.31.fpk" in body
    assert f"{base}/Ydsz Worker-fnos-native-arm64-0.9.31.fpk" in body
    assert "Docker (recommended; x86 and ARM)" in body
    assert "Native x86_64" in body
    assert "Native ARM64 (no Docker)" in body
    assert "pip install" not in body
    assert "## Downloads" in body
