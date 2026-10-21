"""Provider-neutral media generation with built-in vendor adapters."""

from ydsz_harness.media.base import BaseMediaProvider, MediaGenerationProvider
from ydsz_harness.media.errors import MediaGenerationError
from ydsz_harness.media.manager import InMemoryMediaJobStore, MediaJobStore, MediaManager, MediaRouteInfo
from ydsz_harness.media.models import (
    GeneratedMedia,
    ImageGenerationRequest,
    MediaCapabilities,
    MediaGenerationResult,
    MediaJob,
    MediaJobUpdate,
    MediaSubmission,
    ProviderTask,
    RemoteArtifact,
    StoredMedia,
    VideoGenerationRequest,
)
from ydsz_harness.media.providers.dashscope import DashScopeMediaProvider
from ydsz_harness.media.providers.minimax import MiniMaxMediaProvider
from ydsz_harness.media.providers.volcengine import VolcengineMediaProvider
from ydsz_harness.media.registry import BUILTIN_MEDIA_PROVIDERS, create_media_manager, create_media_provider

__all__ = [
    "BUILTIN_MEDIA_PROVIDERS",
    "BaseMediaProvider",
    "DashScopeMediaProvider",
    "GeneratedMedia",
    "ImageGenerationRequest",
    "InMemoryMediaJobStore",
    "MediaCapabilities",
    "MediaGenerationError",
    "MediaGenerationProvider",
    "MediaGenerationResult",
    "MediaJob",
    "MediaJobStore",
    "MediaJobUpdate",
    "MediaManager",
    "MediaRouteInfo",
    "MediaSubmission",
    "MiniMaxMediaProvider",
    "ProviderTask",
    "RemoteArtifact",
    "StoredMedia",
    "VideoGenerationRequest",
    "VolcengineMediaProvider",
    "create_media_manager",
    "create_media_provider",
]
