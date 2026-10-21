"""Custom middleware shipped with ydsz-harness."""

from __future__ import annotations

from ydsz_harness.middleware.client_tool_search import ClientToolSearchMiddleware
from ydsz_harness.middleware.conversation_mode import ConversationModeMiddleware
from ydsz_harness.middleware.filesystem_guard import FilesystemGuardMiddleware
from ydsz_harness.middleware.media_offload import MediaOffloadMiddleware
from ydsz_harness.middleware.memory import MemoryMiddleware
from ydsz_harness.middleware.model_settings import (
    CONFIGURABLE_MAX_INPUT_TOKENS,
    CONFIGURABLE_MODEL_SETTINGS,
    ModelSettingsMiddleware,
)
from ydsz_harness.middleware.native_tool_search import NativeToolSearchMiddleware
from ydsz_harness.middleware.peer import PeerAgentMiddleware
from ydsz_harness.middleware.pii import detect_pii
from ydsz_harness.middleware.tool_search import ToolSearchMiddleware

__all__ = [
    "CONFIGURABLE_MAX_INPUT_TOKENS",
    "CONFIGURABLE_MODEL_SETTINGS",
    "ClientToolSearchMiddleware",
    "ConversationModeMiddleware",
    "FilesystemGuardMiddleware",
    "MediaOffloadMiddleware",
    "MemoryMiddleware",
    "ModelSettingsMiddleware",
    "NativeToolSearchMiddleware",
    "PeerAgentMiddleware",
    "ToolSearchMiddleware",
    "detect_pii",
]
