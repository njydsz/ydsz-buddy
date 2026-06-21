//! # HTTP 路由注册模块
//!
//! 把本服务器对外提供的辅助 HTTP 路由（attachments / local-image / project-favicon / health）挂到 axum 上。
//!
//! ## 已实现路由
//!
//! | Method | Path | Handler | 说明 |
//! | --- | --- | --- | --- |
//! | GET    | `/health` | [`health_handler`] | 健康检查 |
//! | GET    | `/api/local-image` | [`local_image_handler`] | 受控的本地图片服务 |
//! | GET    | `/api/project-favicon` | [`project_favicon_handler`] | 项目 favicon 服务 |
//! | POST   | `/api/attachments/upload` | [`attachment_upload_handler`] | 附件上传 |
//! | GET    | `/api/attachments/:id` | [`attachment_read_handler`] | 附件读取 |
//! | DELETE | `/api/attachments/:id` | [`attachment_delete_handler`] | 附件删除 |
//!
//! ## 集成方式
//!
//! 在 [`crate::server::WebSocketServer::start`] 内部，调用
//! [`register_http_routes`] 把上述路由并入主 Router。

use std::sync::Arc;

use axum::{
    body::Body,
    extract::{Path, Query, State},
    http::{header, StatusCode},
    response::Response,
    routing::{get, post},
    Router,
};
use base64::Engine;
use serde::Deserialize;
use tower_http::cors::{Any, CorsLayer};
use tracing::{info, warn};

use crate::attachment_store::{AttachmentKind, AttachmentStore};
use crate::local_image_files::{mime_for_extension, LocalImageResolver};
use crate::project_favicon_route::FaviconLookup;
use crate::server::ServerState;

/// HTTP 辅助路由的独立状态
///
/// 把它作为字段嵌入 `ServerState`（`http_state`），所有 axum handler 都能用
/// `Arc<ServerState>` 提取，然后访问 `state.http_state`。
pub struct HttpState {
    /// 附件存储
    pub attachment_store: Arc<AttachmentStore>,
    /// 本地图片解析器
    pub local_image_resolver: Arc<LocalImageResolver>,
    /// Favicon 查找器
    pub favicon_lookup: Arc<FaviconLookup>,
}

impl HttpState {
    /// 创建 HTTP 扩展状态
    pub fn new(
        attachment_store: Arc<AttachmentStore>,
        local_image_resolver: Arc<LocalImageResolver>,
        favicon_lookup: Arc<FaviconLookup>,
    ) -> Self {
        Self {
            attachment_store,
            local_image_resolver,
            favicon_lookup,
        }
    }
}

/// 把 HTTP 路由挂到一个空 Router 上
///
/// 返回已绑定 `Arc<ServerState>` 的 Router，调用方直接 `with_state` 即可。
pub fn build_http_router() -> Router<Arc<ServerState>> {
    Router::new()
        .route("/api/local-image", get(local_image_handler))
        .route("/api/project-favicon", get(project_favicon_handler))
        .route("/api/attachments/upload", post(attachment_upload_handler))
        .route(
            "/api/attachments/:id",
            get(attachment_read_handler).delete(attachment_delete_handler),
        )
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any),
        )
}

// ──────────────── Health ────────────────

pub async fn health_handler() -> &'static str {
    "OK"
}

// ──────────────── Local image ────────────────

#[derive(Debug, Deserialize)]
pub struct LocalImageQuery {
    pub path: String,
    pub cwd: Option<String>,
    pub download: Option<String>,
}

pub async fn local_image_handler(
    State(state): State<Arc<ServerState>>,
    Query(q): Query<LocalImageQuery>,
) -> Response {
    let http_state = match state.http_state.as_ref() {
        Some(s) => s,
        None => return error_response(StatusCode::SERVICE_UNAVAILABLE, "http state not initialized"),
    };
    match http_state
        .local_image_resolver
        .resolve(&q.path, q.cwd.as_deref())
    {
        Ok(abs) => match std::fs::read(&abs) {
            Ok(bytes) => {
                let mime = mime_for_extension(abs.to_str().unwrap_or(""));
                let mut resp = Response::builder().status(StatusCode::OK).header(header::CONTENT_TYPE, mime);
                if q.download.as_deref() == Some("1") {
                    let fname = abs
                        .file_name()
                        .and_then(|s| s.to_str())
                        .unwrap_or("image")
                        .to_string();
                    resp = resp.header(
                        header::CONTENT_DISPOSITION,
                        format!("attachment; filename=\"{}\"", fname),
                    );
                }
                resp.body(Body::from(bytes))
                    .unwrap_or_else(|_| error_response(StatusCode::INTERNAL_SERVER_ERROR, "build response failed"))
            }
            Err(e) => {
                warn!("本地图片读取失败: {}", e);
                error_response(StatusCode::NOT_FOUND, "image not found")
            }
        },
        Err(e) => {
            warn!("本地图片解析失败 path={}: {}", q.path, e);
            error_response(StatusCode::BAD_REQUEST, &format!("{:?}", e))
        }
    }
}

// ──────────────── Project favicon ────────────────

#[derive(Debug, Deserialize)]
pub struct FaviconQuery {
    pub path: String,
}

pub async fn project_favicon_handler(
    State(state): State<Arc<ServerState>>,
    Query(q): Query<FaviconQuery>,
) -> Response {
    let http_state = match state.http_state.as_ref() {
        Some(s) => s,
        None => return error_response(StatusCode::SERVICE_UNAVAILABLE, "http state not initialized"),
    };
    match http_state
        .favicon_lookup
        .lookup(std::path::Path::new(&q.path))
    {
        Ok(meta) => {
            if meta.hit {
                if let Some(p) = &meta.absolute_path {
                    if let Ok(bytes) = std::fs::read(p) {
                        return Response::builder()
                            .status(StatusCode::OK)
                            .header(header::CONTENT_TYPE, meta.mime_type.clone())
                            .header(header::CACHE_CONTROL, "public, max-age=300")
                            .body(Body::from(bytes))
                            .unwrap_or_else(|_| {
                                error_response(StatusCode::INTERNAL_SERVER_ERROR, "build response failed")
                            });
                    }
                }
            }
            // fallback
            Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, "image/png")
                .header(header::CACHE_CONTROL, "public, max-age=60")
                .body(Body::from(FaviconLookup::fallback()))
                .unwrap_or_else(|_| error_response(StatusCode::INTERNAL_SERVER_ERROR, "build response failed"))
        }
        Err(e) => {
            warn!("project favicon 失败: {}", e);
            error_response(StatusCode::BAD_REQUEST, &format!("{:?}", e))
        }
    }
}

// ──────────────── Attachments ────────────────

/// 简化的附件上传载荷：JSON `{ 'name': 'x.png', 'mimeType': 'image/png', 'dataBase64': '...' }`
#[derive(Debug, Deserialize)]
pub struct AttachmentUploadBody {
    pub name: String,
    #[serde(default)]
    pub mime_type: String,
    pub data_base64: String,
    #[serde(default)]
    pub kind: Option<String>,
    #[serde(default)]
    pub thread_id: Option<String>,
    #[serde(default)]
    pub message_id: Option<String>,
    #[serde(default)]
    pub user_id: Option<String>,
}

pub async fn attachment_upload_handler(
    State(state): State<Arc<ServerState>>,
    axum::Json(body): axum::Json<AttachmentUploadBody>,
) -> Response {
    let http_state = match state.http_state.as_ref() {
        Some(s) => s,
        None => return error_response(StatusCode::SERVICE_UNAVAILABLE, "http state not initialized"),
    };
    let bytes = match base64::engine::general_purpose::STANDARD.decode(&body.data_base64) {
        Ok(b) => b,
        Err(e) => {
            return error_response(StatusCode::BAD_REQUEST, &format!("base64 解码失败: {}", e))
        }
    };

    let kind = match body.kind.as_deref() {
        Some("voice") => AttachmentKind::Voice,
        Some("screenshot") => AttachmentKind::Screenshot,
        Some("file") => AttachmentKind::File,
        _ => AttachmentKind::Chat,
    };

    match http_state.attachment_store.write(
        &body.name,
        &body.mime_type,
        &bytes,
        kind,
        body.thread_id,
        body.message_id,
        body.user_id,
    ) {
        Ok(meta) => {
            info!("附件已上传: id={}, name={}", meta.id, meta.original_name);
            let json = serde_json::to_string(&meta).unwrap_or_else(|_| "{}".to_string());
            Response::builder()
                .status(StatusCode::CREATED)
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(json))
                .unwrap_or_else(|_| error_response(StatusCode::INTERNAL_SERVER_ERROR, "build response failed"))
        }
        Err(e) => {
            warn!("附件上传失败: {}", e);
            error_response(StatusCode::BAD_REQUEST, &format!("{:?}", e))
        }
    }
}

pub async fn attachment_read_handler(
    State(state): State<Arc<ServerState>>,
    Path(id): Path<String>,
) -> Response {
    let http_state = match state.http_state.as_ref() {
        Some(s) => s,
        None => return error_response(StatusCode::SERVICE_UNAVAILABLE, "http state not initialized"),
    };
    match http_state.attachment_store.read(&id) {
        Ok((bytes, lite)) => {
            let mime = mime_for_extension(&lite.extension);
            Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, mime)
                .header(header::CONTENT_LENGTH, lite.size_bytes)
                .body(Body::from(bytes))
                .unwrap_or_else(|_| error_response(StatusCode::INTERNAL_SERVER_ERROR, "build response failed"))
        }
        Err(e) => {
            warn!("附件读取失败 id={}: {}", id, e);
            error_response(StatusCode::NOT_FOUND, &format!("{:?}", e))
        }
    }
}

pub async fn attachment_delete_handler(
    State(state): State<Arc<ServerState>>,
    Path(id): Path<String>,
) -> Response {
    let http_state = match state.http_state.as_ref() {
        Some(s) => s,
        None => return error_response(StatusCode::SERVICE_UNAVAILABLE, "http state not initialized"),
    };
    match http_state.attachment_store.delete(&id) {
        Ok(true) => Response::builder()
            .status(StatusCode::NO_CONTENT)
            .body(Body::empty())
            .unwrap_or_else(|_| error_response(StatusCode::INTERNAL_SERVER_ERROR, "build response failed")),
        Ok(false) => error_response(StatusCode::NOT_FOUND, "attachment not found"),
        Err(e) => error_response(StatusCode::INTERNAL_SERVER_ERROR, &format!("{:?}", e)),
    }
}

// ──────────────── 工具 ────────────────

fn error_response(status: StatusCode, msg: &str) -> Response {
    let body = serde_json::json!({ "error": msg }).to_string();
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(body))
        .unwrap_or_else(|_| Response::new(Body::empty()))
}

// 重新导出 SUPPORTED_EXTENSIONS 便于一致性检查（暂未启用，避免不必要的可见性扩散）
// pub use crate::local_image_files::SUPPORTED_EXTENSIONS as _SUPPORTED_EXTENSIONS_REEXPORT;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn health_returns_ok() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        let r = rt.block_on(health_handler());
        assert_eq!(r, "OK");
    }

    #[test]
    fn error_response_has_json_content_type() {
        let resp = error_response(StatusCode::BAD_REQUEST, "bad");
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
        let ct = resp.headers().get(header::CONTENT_TYPE).unwrap();
        assert!(ct.to_str().unwrap().contains("application/json"));
    }
}

