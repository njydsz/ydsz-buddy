"""Remote desktop HTTP status."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from ydsz.api.deps import require_permission
from ydsz.infra.desktop.session import active_session_count, session_limit
from ydsz.infra.desktop.setup import desktop_status
from ydsz.infra.users.identity import User
from ydsz.infra.utils.locale import resolve_request_locale

router = APIRouter()


@router.get("/desktop/status")
async def get_desktop_status(
    request: Request,
    _user: User = Depends(require_permission("desktop")),
) -> dict[str, object]:
    locale = resolve_request_locale(request)
    status = desktop_status(locale=locale)
    return {
        "ok": status.ok,
        "desktop_supported": status.desktop_supported,
        "setup_state": status.setup_state,
        "platform": status.platform,
        "display": status.display,
        "reason": status.reason,
        "install_script": status.install_script,
        "start_command": status.start_command,
        "geometry": status.geometry,
        "permissions_needed": list(status.permissions_needed),
        "vnc_localhost_only": status.vnc_localhost_only,
        "active_sessions": active_session_count(),
        "session_limit": session_limit(),
        "native_capture": status.platform in {"darwin", "windows"},
    }
