"""Backward-compat re-export — prefer ``from ydsz_harness.slash import ...``."""

from ydsz_harness.slash.core import (
    RuntimeSlashDispatcher,
    build_runtime_dispatcher,
)

__all__ = ["RuntimeSlashDispatcher", "build_runtime_dispatcher"]
