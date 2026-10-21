"""Memory adapter helpers for ydsz-harness.

The public surface of this subpackage is :class:`MemoryRuntime`, which wires
:class:`ydsz_memory.Memory` / :class:`ydsz_memory.MemoryService` into the
agent.

:class:`ydsz_harness.memory.llm_client.HarnessAgentLLMClient` is an internal
adapter used by :class:`MemoryRuntime` to expose the agent's
:class:`~ydsz_harness.llm.factory.ChatModelFactory` to ydsz-memory's
extractor / promotion / page-regeneration paths via the
:class:`ydsz_memory.ports.llm.LLMClient` protocol. It is intentionally not
re-exported here: callers who need a custom LLM client should implement the
``LLMClient`` protocol directly rather than subclassing or constructing this
adapter themselves.
"""

from __future__ import annotations

from ydsz_harness.memory.runtime import MemoryRuntime

__all__ = ["MemoryRuntime"]
