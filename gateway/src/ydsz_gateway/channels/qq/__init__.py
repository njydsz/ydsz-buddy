"""QQ Bot channel package.

Public symbols remain importable from ``ydsz_gateway.channels.qq`` for
backward compatibility with the previous single-file implementation.
"""

from ydsz_gateway.channels.qq.channel import QQChannel, QQConfig
from ydsz_gateway.channels.qq.login_qr import (
    QQBotQRCodeResponse,
    QQBotQRCredentials,
    QQBotQRLogin,
    QQBotQRPollResult,
    QQBotQRWaitResult,
)

__all__ = [
    "QQBotQRCodeResponse",
    "QQBotQRCredentials",
    "QQBotQRLogin",
    "QQBotQRPollResult",
    "QQBotQRWaitResult",
    "QQChannel",
    "QQConfig",
]
