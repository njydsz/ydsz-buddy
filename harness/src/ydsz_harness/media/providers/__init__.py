"""Built-in media generation provider adapters."""

from ydsz_harness.media.providers.dashscope import DashScopeMediaProvider
from ydsz_harness.media.providers.minimax import MiniMaxMediaProvider
from ydsz_harness.media.providers.volcengine import VolcengineMediaProvider

__all__ = ["DashScopeMediaProvider", "MiniMaxMediaProvider", "VolcengineMediaProvider"]
