"""WeChat (iLink Bot) channel package.

Public API — all symbols previously importable from
``ydsz_gateway.channels.weixin`` remain available here for
backward compatibility.
"""

from ydsz_gateway.channels.weixin.channel import (
    WeixinAccountConfig,
    WeixinChannel,
    WeixinConfig,
)
from ydsz_gateway.channels.weixin.login_qr import (
    QRCodeResponse,
    WeixinQRLogin,
    WeixinQrWaitResult,
)

__all__ = [
    "QRCodeResponse",
    "WeixinAccountConfig",
    "WeixinChannel",
    "WeixinConfig",
    "WeixinQRLogin",
    "WeixinQrWaitResult",
]
