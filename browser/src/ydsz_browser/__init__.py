"""ydsz-browser: AI-friendly browser automation via CDP."""

from ydsz_browser.install import (
    InstallEvent,
    chromium_executable,
    ensure_chromium,
    install_chromium_stream,
)
from ydsz_browser.mode import BrowserMode
from ydsz_browser.models import ActionMetrics, TabInfo, ToolResult
from ydsz_browser.session import BrowserSession
from ydsz_browser.settings import YdszBrowserSettings, settings
from ydsz_browser.tool_interface import browser_tool

__all__ = [
    "BrowserSession",
    "browser_tool",
    "BrowserMode",
    "YdszBrowserSettings",
    "settings",
    "ToolResult",
    "ActionMetrics",
    "TabInfo",
    "InstallEvent",
    "chromium_executable",
    "ensure_chromium",
    "install_chromium_stream",
]
