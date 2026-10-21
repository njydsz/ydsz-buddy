"""Unit tests for YdszBrowserSettings configuration."""

from __future__ import annotations

from pathlib import Path

from ydsz_browser.settings import YdszBrowserSettings, state_dir


def test_defaults_match_expected():
    s = YdszBrowserSettings()
    # state_dir() resolves to ~/.ydsz-browser, or a legacy alternate
    # directory when that one already exists on this machine.
    assert s.profiles_dir == state_dir() / "profiles"
    assert s.screenshots_dir == state_dir() / "screenshots"
    assert s.cdp_host == "localhost"
    assert s.cdp_port_start == 9222
    assert s.chrome_bin is None
    assert s.cdp_timeout == 30.0
    assert s.launch_retries == 20
    assert s.launch_delay == 0.25
    assert s.cdp_ws_url is None
    assert s.viewport_width == 1440
    assert s.viewport_height == 900
    assert s.cdp_max_message_size == 33554432
    assert s.browser_mode == "auto"
    assert s.idle_timeout_minutes == 0.0


def test_state_dir_prefers_new_name_for_fresh_installs(monkeypatch, tmp_path):
    monkeypatch.setattr(Path, "home", staticmethod(lambda: tmp_path))
    assert state_dir() == tmp_path / ".ydsz-browser"


def test_state_dir_keeps_using_legacy_dir_when_present(monkeypatch, tmp_path):
    """An existing legacy state dir holds login cookies: keep using it."""
    from ydsz_browser.settings import _LEGACY_STATE_DIR

    legacy = tmp_path / _LEGACY_STATE_DIR
    legacy.mkdir()
    monkeypatch.setattr(Path, "home", staticmethod(lambda: tmp_path))
    assert state_dir() == legacy
    assert YdszBrowserSettings().profiles_dir == legacy / "profiles"


def test_state_dir_prefers_new_dir_when_both_exist(monkeypatch, tmp_path):
    from ydsz_browser.settings import _LEGACY_STATE_DIR, _STATE_DIR

    (tmp_path / _LEGACY_STATE_DIR).mkdir()
    (tmp_path / _STATE_DIR).mkdir()
    monkeypatch.setattr(Path, "home", staticmethod(lambda: tmp_path))
    assert state_dir() == tmp_path / _STATE_DIR


def test_env_override_profiles_dir(monkeypatch, tmp_path):
    monkeypatch.setenv("BROWSER_USE_PROFILES_DIR", str(tmp_path / "custom_profiles"))
    s = YdszBrowserSettings()
    assert s.profiles_dir == tmp_path / "custom_profiles"


def test_env_override_cdp_host(monkeypatch):
    monkeypatch.setenv("BROWSER_USE_CDP_HOST", "cdp.example.internal")
    s = YdszBrowserSettings()
    assert s.cdp_host == "cdp.example.internal"


def test_env_override_cdp_port_start(monkeypatch):
    monkeypatch.setenv("BROWSER_USE_CDP_PORT_START", "9300")
    s = YdszBrowserSettings()
    assert s.cdp_port_start == 9300


def test_env_override_cdp_ws_url(monkeypatch):
    monkeypatch.setenv(
        "BROWSER_USE_CDP_WS_URL", "ws://remote:9222/devtools/browser/abc"
    )
    s = YdszBrowserSettings()
    assert s.cdp_ws_url == "ws://remote:9222/devtools/browser/abc"


def test_env_override_idle_timeout(monkeypatch):
    monkeypatch.setenv("BROWSER_USE_IDLE_TIMEOUT_MINUTES", "30")
    assert YdszBrowserSettings().idle_timeout_minutes == 30.0


def test_explicit_override_takes_precedence(monkeypatch):
    monkeypatch.setenv("BROWSER_USE_CDP_PORT_START", "9300")
    monkeypatch.setenv("BROWSER_USE_CDP_TIMEOUT", "60.0")
    # Explicit values ignore env vars (dataclass field values passed directly)
    s = YdszBrowserSettings(cdp_port_start=9400, cdp_timeout=10.0)
    assert s.cdp_port_start == 9400
    assert s.cdp_timeout == 10.0


def test_env_override_browser_mode(monkeypatch):
    monkeypatch.setenv("BROWSER_USE_MODE", "headless")
    s = YdszBrowserSettings()
    assert s.browser_mode == "headless"


def test_env_browser_mode_invalid(monkeypatch):
    import pytest

    monkeypatch.setenv("BROWSER_USE_MODE", "ghost")
    with pytest.raises(ValueError):
        YdszBrowserSettings()


def test_env_override_screenshots_dir(monkeypatch, tmp_path):
    monkeypatch.setenv("BROWSER_USE_SCREENSHOTS_DIR", str(tmp_path / "shots"))
    s = YdszBrowserSettings()
    assert s.screenshots_dir == tmp_path / "shots"


def test_env_override_viewport(monkeypatch):
    monkeypatch.setenv("BROWSER_USE_VIEWPORT_WIDTH", "1920")
    monkeypatch.setenv("BROWSER_USE_VIEWPORT_HEIGHT", "1080")
    s = YdszBrowserSettings()
    assert s.viewport_width == 1920
    assert s.viewport_height == 1080


def test_env_override_cdp_max_message_size(monkeypatch):
    monkeypatch.setenv("BROWSER_USE_CDP_MAX_MESSAGE_SIZE", "67108864")
    s = YdszBrowserSettings()
    assert s.cdp_max_message_size == 67108864


def test_cdp_max_message_size_zero_disables_cap(monkeypatch):
    """``0`` is the documented escape hatch for "no cap" — websockets
    treats ``max_size=None`` as unlimited, so settings must translate."""
    monkeypatch.setenv("BROWSER_USE_CDP_MAX_MESSAGE_SIZE", "0")
    s = YdszBrowserSettings()
    assert s.cdp_max_message_size is None
