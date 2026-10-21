"""Remote desktop routers."""

from __future__ import annotations

from fastapi import APIRouter

from ydsz.api.routers.desktop.install import router as install_router
from ydsz.api.routers.desktop.settings import router as settings_router
from ydsz.api.routers.desktop.status import router as status_router
from ydsz.api.routers.desktop.stream import router as stream_router
from ydsz.api.routers.desktop.uninstall import router as uninstall_router

router = APIRouter()
router.include_router(status_router)
router.include_router(settings_router)
router.include_router(install_router)
router.include_router(uninstall_router)
router.include_router(stream_router)

__all__ = ["router"]
