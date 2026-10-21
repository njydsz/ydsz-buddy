"""ydsz-harness: production-grade Harness Agent on top of LangChain Deep Agents."""

from __future__ import annotations

from importlib import import_module
from typing import TYPE_CHECKING

from ydsz_harness._version import __version__
from ydsz_harness.config import (
    HarnessAgentConfig,
    MediaGenerationConfig,
    MediaProviderConfig,
    ModelConfig,
    ProviderConfig,
)
from ydsz_harness.request import ChatRequest

if TYPE_CHECKING:
    from ydsz_harness.agent import HarnessAgent
    from ydsz_harness.init import InitResult, init_workspace
    from ydsz_harness.manager import AgentEntry, HarnessAgentManager
    from ydsz_harness.observability.logging import (
        current_log_file,
        default_log_dir,
        setup_logging,
        teardown_logging,
    )
    from ydsz_harness.protocols.langgraph import AgentEventType
    from ydsz_harness.providers import ModelPreset, ProviderPreset

_LAZY_EXPORTS: dict[str, tuple[str, str]] = {
    "AgentEntry": ("ydsz_harness.manager", "AgentEntry"),
    "HarnessAgentManager": ("ydsz_harness.manager", "HarnessAgentManager"),
    "ModelPreset": ("ydsz_harness.providers", "ModelPreset"),
    "ProviderPreset": ("ydsz_harness.providers", "ProviderPreset"),
    "HarnessAgent": ("ydsz_harness.agent", "HarnessAgent"),
    "InitResult": ("ydsz_harness.init", "InitResult"),
    "init_workspace": ("ydsz_harness.init", "init_workspace"),
    "current_log_file": ("ydsz_harness.observability.logging", "current_log_file"),
    "default_log_dir": ("ydsz_harness.observability.logging", "default_log_dir"),
    "setup_logging": ("ydsz_harness.observability.logging", "setup_logging"),
    "teardown_logging": ("ydsz_harness.observability.logging", "teardown_logging"),
    "ChatProtocol": ("ydsz_harness.protocols", "ChatProtocol"),
    "register_protocol": ("ydsz_harness.protocols", "register_protocol"),
    "resolve_protocol": ("ydsz_harness.protocols", "resolve_protocol"),
    "AgentEventType": ("ydsz_harness.protocols.langgraph", "AgentEventType"),
    "SecurityPolicy": ("ydsz_harness.security.models", "SecurityPolicy"),
}


def __getattr__(name: str) -> object:  # pragma: no cover - thin re-export shim
    target = _LAZY_EXPORTS.get(name)
    if target is None:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    module_name, attr = target
    return getattr(import_module(module_name), attr)


__all__ = [
    "AgentEntry",
    "AgentEventType",
    "ChatProtocol",
    "ChatRequest",
    "HarnessAgent",
    "HarnessAgentConfig",
    "HarnessAgentManager",
    "InitResult",
    "MediaGenerationConfig",
    "MediaProviderConfig",
    "ModelConfig",
    "ModelPreset",
    "ProviderConfig",
    "ProviderPreset",
    "SecurityPolicy",
    "__version__",
    "current_log_file",
    "default_log_dir",
    "init_workspace",
    "register_protocol",
    "resolve_protocol",
    "setup_logging",
    "teardown_logging",
]
