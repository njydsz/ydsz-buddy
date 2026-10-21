"""Ydsz Worker — smarter self-hosted AI assistant (multi-user, multi-agent)."""

from __future__ import annotations

from ydsz.infra.utils.httpx_proxy import install_httpx_cidr_no_proxy

__version__ = "26.10.20"

# httpx 0.28 treats NO_PROXY CIDR as an exact IP (see issue #1347). Patch once
# at import so CLI, ``ydsz-worker run``, and in-process harness clients all honor it.
install_httpx_cidr_no_proxy()
