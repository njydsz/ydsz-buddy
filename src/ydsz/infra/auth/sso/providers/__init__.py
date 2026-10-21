"""Dashboard SSO identity-provider adapters."""

from __future__ import annotations

from typing import TYPE_CHECKING

from ydsz.infra.auth.sso.providers.base import SSO_KINDS, IdentityProvider

if TYPE_CHECKING:
    from ydsz.infra.auth.sso.service import SsoService


def build_adapters(service: SsoService) -> dict[str, IdentityProvider]:
    from ydsz.infra.auth.sso.providers.dingtalk import DingTalkAdapter
    from ydsz.infra.auth.sso.providers.feishu import FeishuAdapter
    from ydsz.infra.auth.sso.providers.oidc import OidcAdapter
    from ydsz.infra.auth.sso.providers.wecom import WeComAdapter

    return {
        "oidc": OidcAdapter(service),
        "feishu": FeishuAdapter(service),
        "dingtalk": DingTalkAdapter(service),
        "wecom": WeComAdapter(service),
    }


__all__ = ["SSO_KINDS", "IdentityProvider", "build_adapters"]
