"""Ydsz Worker↔Ydsz Worker instance bridge — remote agents, HTTP tunnel, chat relay."""

from __future__ import annotations

from ydsz.infra.bridge.ids import (
    BRIDGE_AGENT_PREFIX,
    BridgeAgentRef,
    format_bridge_agent_id,
    parse_bridge_agent_id,
)
from ydsz.infra.bridge.manager import BridgeManager

__all__ = [
    "BRIDGE_AGENT_PREFIX",
    "BridgeAgentRef",
    "BridgeManager",
    "format_bridge_agent_id",
    "parse_bridge_agent_id",
]
