"""Teams: optional inbox-driven agent-to-agent collaboration."""

from __future__ import annotations

from ydsz_harness.teams.inbox import (
    HarnessAgentInboxManager,
    InboxMessage,
    InboxStatus,
    PeerResult,
)
from ydsz_harness.teams.processor import (
    ReplyEvent,
    ReplyStatus,
    TeamProcessor,
    default_compose_followup,
)
from ydsz_harness.teams.team_manager import TeamManager
from ydsz_harness.teams.tools import AskAgentInput, build_team_tools
from ydsz_harness.teams.util import (
    PeerCall,
    PeerSession,
    build_one_shot_request,
    derive_peer_thread_id,
)

__all__ = [
    "AskAgentInput",
    "HarnessAgentInboxManager",
    "InboxMessage",
    "InboxStatus",
    "PeerCall",
    "PeerResult",
    "PeerSession",
    "ReplyEvent",
    "ReplyStatus",
    "TeamManager",
    "TeamProcessor",
    "build_one_shot_request",
    "build_team_tools",
    "default_compose_followup",
    "derive_peer_thread_id",
]
