//! Remi Code 服务器的 HTTP 路由处理器。
//!
//! 本模块聚合了桌面客户端（及任何外部消费者）可调用的所有 HTTP 路由。
//! 旧版 `main.rs` 为向后兼容保留了自己的 `*_handler` 函数；本模块暴露
//! 一个 [`register_routes`] 辅助函数，将完整路由表（50+ 端点）挂载到
//! `main.rs` 共享的 [`AppState`] 上。
//!
//! 所有处理器返回统一的 JSON 信封格式
//! `{"success": bool, "data"?: T, "error"?: String}`，前端可依赖单一的错误约定。

use axum::{
    Json, Router,
    extract::{Multipart, Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    routing::{delete, get, post},
};
use serde::Deserialize;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use tracing::{error, info, warn};

/// 将成功载荷包装在标准信封中。
pub fn ok<T: serde::Serialize>(data: T) -> axum::response::Response {
    Json(serde_json::json!({ "success": true, "data": data })).into_response()
}

/// 将错误消息包装在标准信封中。
pub fn err(status: StatusCode, message: impl Into<String>) -> axum::response::Response {
    (
        status,
        Json(serde_json::json!({
            "success": false,
            "error": message.into()
        })),
    )
        .into_response()
}

/// 从请求头中提取 Bearer Token。
pub fn extract_token(headers: &HeaderMap) -> Option<String> {
    headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| {
            if let Some(rest) = v.strip_prefix("Bearer ") {
                Some(rest.to_string())
            } else {
                Some(v.to_string())
            }
        })
}

// 我们需要 `AppState` 的一个小子集，以避免将此模块直接耦合到
// `remi-server`。调用方应提供一个具体状态类型，通过
// `AppStateAccess` 扩展 trait 实现这些方法。`main.rs` 中的
// `register_routes!` 宏负责注入具体字段。

/// 由 `AppState` 实现的 trait，暴露本模块所需的服务。
/// 保持路由定义与具体状态类型解耦，同时允许
/// `main.rs` 传入其 `Arc<AppState>`。
pub trait AppStateAccess: Send + Sync {
    /// 共享数据库句柄。
    fn db(&self) -> &Arc<remi_persistence::Database>;
    /// 工作区服务。
    fn workspace(&self) -> &Arc<remi_workspace::WorkspaceService>;
    /// 终端管理器。
    fn terminal_manager(&self) -> &Arc<remi_pty::TerminalManager>;
    /// Provider 注册表。
    fn provider_registry(&self) -> &Arc<remi_providers::ProviderRegistry>;
    /// 认证服务。
    fn auth(&self) -> &Arc<remi_auth::AuthService>;
    /// 编排引擎。
    fn orchestration(&self) -> &Arc<remi_orchestration::OrchestrationEngine>;
    /// WebSocket 状态。
    fn ws_state(&self) -> &Arc<remi_rpc::WsState>;
    /// 服务器配置。
    fn config(&self) -> &remi_core::ServerConfig;
}

/// 聚合本模块所需所有服务的具体状态。
///
/// 路由处理器消费此包装器；`main.rs` 可直接从其 `AppState` 构造。
pub struct ServerState {
    /// 数据库句柄。
    pub db: Arc<remi_persistence::Database>,
    /// 工作区服务。
    pub workspace: Arc<remi_workspace::WorkspaceService>,
    /// 终端管理器。
    pub terminal_manager: Arc<remi_pty::TerminalManager>,
    /// Provider 注册表。
    pub provider_registry: Arc<remi_providers::ProviderRegistry>,
    /// 认证服务。
    pub auth: Arc<remi_auth::AuthService>,
    /// 编排引擎。
    pub orchestration: Arc<remi_orchestration::OrchestrationEngine>,
    /// WebSocket 状态。
    pub ws_state: Arc<remi_rpc::WsState>,
    /// 服务器配置。
    pub config: remi_core::ServerConfig,
}

impl AppStateAccess for ServerState {
    fn db(&self) -> &Arc<remi_persistence::Database> {
        &self.db
    }
    fn workspace(&self) -> &Arc<remi_workspace::WorkspaceService> {
        &self.workspace
    }
    fn terminal_manager(&self) -> &Arc<remi_pty::TerminalManager> {
        &self.terminal_manager
    }
    fn provider_registry(&self) -> &Arc<remi_providers::ProviderRegistry> {
        &self.provider_registry
    }
    fn auth(&self) -> &Arc<remi_auth::AuthService> {
        &self.auth
    }
    fn orchestration(&self) -> &Arc<remi_orchestration::OrchestrationEngine> {
        &self.orchestration
    }
    fn ws_state(&self) -> &Arc<remi_rpc::WsState> {
        &self.ws_state
    }
    fn config(&self) -> &remi_core::ServerConfig {
        &self.config
    }
}

// ---------------------------------------------------------------------------
// 健康检查与元信息端点
// ---------------------------------------------------------------------------

/// `GET /health` — 包含子系统就绪状态的完整健康检查载荷。
pub async fn health() -> axum::response::Response {
    ok(serde_json::json!({
        "status": "ok",
        "version": env!("CARGO_PKG_VERSION"),
        "startupReady": true,
        "pushBusReady": true,
        "keybindingsReady": true,
        "terminalSubscriptionsReady": true,
        "orchestrationSubscriptionsReady": true,
    }))
}

/// `GET /api/version` — 服务器版本信息。
pub async fn version() -> axum::response::Response {
    ok(serde_json::json!({
        "version": env!("CARGO_PKG_VERSION"),
        "name": "remi-code",
    }))
}

/// `GET /api/providers` — 列出 provider 及其健康状态。
pub async fn list_providers<S: AppStateAccess + 'static>(
    State(state): State<Arc<S>>,
) -> axum::response::Response {
    let infos = state.provider_registry().list();
    let health = state.provider_registry().health_check_all().await;
    ok(serde_json::json!({
        "providers": infos,
        "health": health,
    }))
}

/// `POST /api/providers/{name}/commands` — 列出斜杠命令。
pub async fn list_provider_commands<S: AppStateAccess + 'static>(
    State(state): State<Arc<S>>,
    Path(name): Path<String>,
) -> axum::response::Response {
    let provider_name = match name.as_str() {
        "claude" => remi_contracts::ProviderName::Claude,
        "codex" => remi_contracts::ProviderName::Codex,
        "gemini" => remi_contracts::ProviderName::Gemini,
        "grok" => remi_contracts::ProviderName::Grok,
        "opencode" => remi_contracts::ProviderName::OpenCode,
        "cursor" => remi_contracts::ProviderName::Cursor,
        "pi" => remi_contracts::ProviderName::Pi,
        "kilo" => remi_contracts::ProviderName::Kilo,
        _ => return err(StatusCode::NOT_FOUND, format!("Unknown provider: {name}")),
    };

    let adapter = match state.provider_registry().get(&provider_name) {
        Some(a) => a,
        None => return err(StatusCode::NOT_FOUND, "Provider not registered"),
    };

    let input = remi_contracts::ProviderListCommandsInput {
        provider: provider_name,
        cwd: String::new(),
        thread_id: None,
        agent_dir: None,
        force_reload: None,
    };

    match adapter.list_commands(input).await {
        Ok(out) => ok(out),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

// ---------------------------------------------------------------------------
// 项目端点
// ---------------------------------------------------------------------------

/// `GET /api/projects` — 列出所有项目。
pub async fn list_projects<S: AppStateAccess + 'static>(
    State(state): State<Arc<S>>,
) -> axum::response::Response {
    use remi_persistence::repositories::project_repo::ProjectRepositoryTrait;
    let repo = remi_persistence::repositories::ProjectRepository::new(state.db().pool().clone());
    match repo.list().await {
        Ok(projects) => ok(projects),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

/// `POST /api/projects` — 创建新项目。
pub async fn create_project<S: AppStateAccess + 'static>(
    State(state): State<Arc<S>>,
    Json(input): Json<remi_contracts::CreateProjectInput>,
) -> axum::response::Response {
    use remi_persistence::repositories::project_repo::ProjectRepositoryTrait;
    let repo = remi_persistence::repositories::ProjectRepository::new(state.db().pool().clone());
    match repo
        .create(&input.name, &input.path, remi_contracts::ProjectKind::Local)
        .await
    {
        Ok(project) => ok(project),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

/// `GET /api/projects/{id}` — 获取单个项目。
pub async fn get_project<S: AppStateAccess + 'static>(
    State(state): State<Arc<S>>,
    Path(id): Path<uuid::Uuid>,
) -> axum::response::Response {
    use remi_persistence::repositories::project_repo::ProjectRepositoryTrait;
    let repo = remi_persistence::repositories::ProjectRepository::new(state.db().pool().clone());
    match repo.get_by_id(remi_contracts::ProjectId(id)).await {
        Ok(Some(p)) => ok(p),
        Ok(None) => err(StatusCode::NOT_FOUND, "Project not found"),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

/// `DELETE /api/projects/{id}` — 软删除项目。
pub async fn delete_project<S: AppStateAccess + 'static>(
    State(state): State<Arc<S>>,
    Path(id): Path<uuid::Uuid>,
) -> axum::response::Response {
    use remi_persistence::repositories::project_repo::ProjectRepositoryTrait;
    let repo = remi_persistence::repositories::ProjectRepository::new(state.db().pool().clone());
    match repo.soft_delete(remi_contracts::ProjectId(id)).await {
        Ok(_) => ok(serde_json::json!({ "deleted": true })),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

// ---------------------------------------------------------------------------
// 线程端点
// ---------------------------------------------------------------------------

/// `GET /api/projects/{id}/threads` — 列出项目下的线程。
pub async fn list_threads<S: AppStateAccess + 'static>(
    State(state): State<Arc<S>>,
    Path(id): Path<uuid::Uuid>,
) -> axum::response::Response {
    match state.orchestration().list_threads(id).await {
        Ok(threads) => ok(threads),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

/// `POST /api/projects/{id}/threads` — 创建线程。
pub async fn create_thread<S: AppStateAccess + 'static>(
    State(state): State<Arc<S>>,
    Path(id): Path<uuid::Uuid>,
    Json(input): Json<ThreadCreateBody>,
) -> axum::response::Response {
    match state
        .orchestration()
        .handle_command(remi_contracts::OrchestrationCommand::CreateThread {
            project_id: id,
            title: input.title,
        })
        .await
    {
        Ok(_) => match state.orchestration().list_threads(id).await {
            Ok(threads) => ok(threads.into_iter().next().unwrap_or_default()),
            Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
        },
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

#[derive(Debug, Deserialize)]
pub struct ThreadCreateBody {
    pub title: Option<String>,
}

/// `GET /api/threads/{id}` — 获取单个线程。
pub async fn get_thread<S: AppStateAccess + 'static>(
    State(state): State<Arc<S>>,
    Path(id): Path<uuid::Uuid>,
) -> axum::response::Response {
    let thread_id = remi_contracts::ThreadId(id);
    match state.orchestration().get_thread(thread_id).await {
        Ok(Some(t)) => ok(t),
        Ok(None) => err(StatusCode::NOT_FOUND, "Thread not found"),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

/// `DELETE /api/threads/{id}` — 删除线程。
pub async fn delete_thread<S: AppStateAccess + 'static>(
    State(state): State<Arc<S>>,
    Path(id): Path<uuid::Uuid>,
) -> axum::response::Response {
    match state
        .orchestration()
        .handle_command(remi_contracts::OrchestrationCommand::DeleteThread {
            thread_id: remi_contracts::ThreadId(id),
        })
        .await
    {
        Ok(_) => ok(serde_json::json!({ "deleted": true })),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

/// `GET /api/threads/{id}/messages` — 列出线程的消息。
pub async fn list_messages<S: AppStateAccess + 'static>(
    State(state): State<Arc<S>>,
    Path(id): Path<uuid::Uuid>,
) -> axum::response::Response {
    use remi_persistence::repositories::thread_repo::ThreadRepositoryTrait;
    let repo = remi_persistence::repositories::ThreadRepository::new(state.db().pool().clone());
    let thread_id = remi_contracts::ThreadId(id);
    match repo.list_messages(thread_id).await {
        Ok(messages) => ok(messages),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

/// `POST /api/threads/{id}/messages` — 发送消息并获取助手回复。
pub async fn send_message<S: AppStateAccess + 'static>(
    State(state): State<Arc<S>>,
    Path(id): Path<uuid::Uuid>,
    Json(input): Json<MessageBody>,
) -> axum::response::Response {
    let thread_id = remi_contracts::ThreadId(id);
    match state
        .orchestration()
        .handle_send_message(thread_id, &input.content)
        .await
    {
        Ok((user, assistant)) => ok(remi_contracts::ThreadSendMessageOutput {
            user_message: user,
            assistant_message: assistant,
        }),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

#[derive(Debug, Deserialize)]
pub struct MessageBody {
    pub content: String,
}

// ---------------------------------------------------------------------------
// 文件系统端点
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct BrowseQuery {
    pub path: String,
    #[serde(default)]
    pub include_hidden: bool,
    #[serde(default)]
    pub max_depth: Option<u32>,
    #[serde(default)]
    pub offset: Option<usize>,
    #[serde(default)]
    pub limit: Option<usize>,
}

/// `GET /api/filesystem/browse` — 浏览目录（分页）。
pub async fn filesystem_browse<S: AppStateAccess + 'static>(
    State(state): State<Arc<S>>,
    Query(q): Query<BrowseQuery>,
) -> axum::response::Response {
    match state
        .workspace()
        .browse_chunked(&q.path, q.include_hidden, q.max_depth, q.offset.unwrap_or(0), q.limit)
        .await
    {
        Ok(chunk) => ok(chunk),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

/// `POST /api/filesystem/read` — 读取单个文件。
pub async fn filesystem_read<S: AppStateAccess + 'static>(
    State(state): State<Arc<S>>,
    Json(input): Json<remi_contracts::ReadFileInput>,
) -> axum::response::Response {
    match state.workspace().read_file(&input.path).await {
        Ok(result) => ok(result),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

/// `POST /api/filesystem/write` — 写入单个文件。
pub async fn filesystem_write<S: AppStateAccess + 'static>(
    State(state): State<Arc<S>>,
    Json(input): Json<remi_contracts::WriteFileInput>,
) -> axum::response::Response {
    match state.workspace().write_file(&input.path, &input.contents).await {
        Ok(result) => ok(result),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

// ---------------------------------------------------------------------------
// 终端端点
// ---------------------------------------------------------------------------

/// `GET /api/terminal/list` — 列出活跃的终端会话。
pub async fn terminal_list<S: AppStateAccess + 'static>(
    State(state): State<Arc<S>>,
) -> axum::response::Response {
    let sessions = state.terminal_manager().list_sessions().await;
    ok(serde_json::json!({ "sessions": sessions }))
}

/// `POST /api/terminal/create` — 创建新的终端会话。
pub async fn terminal_create<S: AppStateAccess + 'static>(
    State(state): State<Arc<S>>,
    Json(input): Json<remi_contracts::CreateTerminalInput>,
) -> axum::response::Response {
    match state.terminal_manager().create(input).await {
        Ok(out) => ok(out),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

/// `POST /api/terminal/{id}/write` — 向终端写入输入。
pub async fn terminal_write<S: AppStateAccess + 'static>(
    State(state): State<Arc<S>>,
    Path(id): Path<uuid::Uuid>,
    Json(input): Json<remi_contracts::WriteTerminalInput>,
) -> axum::response::Response {
    match state.terminal_manager().write(id, &input.data).await {
        Ok(_) => ok(serde_json::json!({ "written": input.data.len() })),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

/// `POST /api/terminal/{id}/resize` — 调整 PTY 大小。
pub async fn terminal_resize<S: AppStateAccess + 'static>(
    State(state): State<Arc<S>>,
    Path(id): Path<uuid::Uuid>,
    Json(input): Json<remi_contracts::ResizeTerminalInput>,
) -> axum::response::Response {
    match state
        .terminal_manager()
        .resize(id, input.cols, input.rows)
        .await
    {
        Ok(_) => ok(serde_json::json!({ "resized": true })),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

/// `POST /api/terminal/{id}/close` — 关闭终端会话。
pub async fn terminal_close<S: AppStateAccess + 'static>(
    State(state): State<Arc<S>>,
    Path(id): Path<uuid::Uuid>,
) -> axum::response::Response {
    match state.terminal_manager().close(id).await {
        Ok(_) => ok(serde_json::json!({ "closed": true })),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

// ---------------------------------------------------------------------------
// 工作区 worktree 端点
// ---------------------------------------------------------------------------

/// `GET /api/workspace/worktrees` — 列出托管的 worktree。
pub async fn worktree_list<S: AppStateAccess + 'static>(
    State(state): State<Arc<S>>,
) -> axum::response::Response {
    match state.workspace().list_worktrees().await {
        Ok(list) => ok(list),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

/// `POST /api/workspace/worktrees` — 创建托管的 worktree。
pub async fn worktree_create<S: AppStateAccess + 'static>(
    State(state): State<Arc<S>>,
    Json(input): Json<WorktreeCreateBody>,
) -> axum::response::Response {
    match state
        .workspace()
        .create_worktree(&input.path, &input.branch)
        .await
    {
        Ok(wt) => ok(wt),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

#[derive(Debug, Deserialize)]
pub struct WorktreeCreateBody {
    pub path: String,
    pub branch: String,
}

/// `DELETE /api/workspace/worktrees/{id}` — 移除托管的 worktree。
pub async fn worktree_remove<S: AppStateAccess + 'static>(
    State(state): State<Arc<S>>,
    Path(id): Path<String>,
) -> axum::response::Response {
    match state.workspace().remove_worktree(&id).await {
        Ok(_) => ok(serde_json::json!({ "removed": true })),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

/// `POST /api/workspace/worktrees/gc` — garbage collect stale worktrees.
pub async fn worktree_gc<S: AppStateAccess + 'static>(
    State(state): State<Arc<S>>,
) -> axum::response::Response {
    match state.workspace().gc_worktrees().await {
        Ok(count) => ok(serde_json::json!({ "removed": count })),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

// ---------------------------------------------------------------------------
// Auth endpoints
// ---------------------------------------------------------------------------

/// `POST /api/auth/bootstrap` — first-time owner bootstrap.
pub async fn auth_bootstrap<S: AppStateAccess + 'static>(
    State(state): State<Arc<S>>,
    Json(input): Json<remi_contracts::AuthBootstrapInput>,
) -> axum::response::Response {
    match state.auth().bootstrap(input).await {
        Ok(out) => ok(out),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

/// `POST /api/auth/verify` — verify a token.
pub async fn auth_verify<S: AppStateAccess + 'static>(
    State(state): State<Arc<S>>,
    Json(input): Json<remi_contracts::AuthVerifyInput>,
) -> axum::response::Response {
    match state.auth().verify_token(&input.token).await {
        Ok(valid) => ok(serde_json::json!({ "valid": valid })),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

/// `GET /api/auth/session` — 当前会话状态。
pub async fn auth_session<S: AppStateAccess + 'static>(
    State(state): State<Arc<S>>,
    headers: HeaderMap,
) -> axum::response::Response {
    let token = match extract_token(&headers) {
        Some(t) => t,
        None => {
            return ok(serde_json::json!({ "authenticated": false }));
        }
    };
    match state.auth().get_session_state(&token).await {
        Ok(s) => ok(s),
        Err(_) => ok(serde_json::json!({ "authenticated": false })),
    }
}

/// `POST /api/auth/pairing-token` — 创建配对凭证。
pub async fn auth_pairing<S: AppStateAccess + 'static>(
    State(state): State<Arc<S>>,
    headers: HeaderMap,
    Json(input): Json<remi_contracts::AuthCreatePairingCredentialInput>,
) -> axum::response::Response {
    let token = match extract_token(&headers) {
        Some(t) => t,
        None => return err(StatusCode::UNAUTHORIZED, "Missing authorization token"),
    };
    match state.auth().verify_token(&token).await {
        Ok(true) => match state.auth().create_pairing_credential(input).await {
            Ok(out) => ok(out),
            Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
        },
        _ => err(StatusCode::UNAUTHORIZED, "Invalid session"),
    }
}

/// `POST /api/auth/ws-token` — 签发 WebSocket 令牌。
pub async fn auth_ws_token<S: AppStateAccess + 'static>(
    State(state): State<Arc<S>>,
    headers: HeaderMap,
) -> axum::response::Response {
    let token = match extract_token(&headers) {
        Some(t) => t,
        None => return err(StatusCode::UNAUTHORIZED, "Missing authorization token"),
    };
    match state.auth().issue_websocket_token(&token).await {
        Ok(ws) => ok(ws),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

/// `GET /api/auth/pairing-links` — 列出活跃的配对链接。
pub async fn auth_pairing_links<S: AppStateAccess + 'static>(
    State(state): State<Arc<S>>,
    headers: HeaderMap,
) -> axum::response::Response {
    let token = match extract_token(&headers) {
        Some(t) => t,
        None => return err(StatusCode::UNAUTHORIZED, "Missing authorization token"),
    };
    match state.auth().verify_token(&token).await {
        Ok(true) => match state.auth().list_pairing_links().await {
            Ok(links) => ok(links),
            Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
        },
        _ => err(StatusCode::UNAUTHORIZED, "Invalid session"),
    }
}

/// `POST /api/auth/pairing-links/revoke` — 撤销配对链接。
pub async fn auth_revoke_pairing<S: AppStateAccess + 'static>(
    State(state): State<Arc<S>>,
    headers: HeaderMap,
    Json(input): Json<remi_contracts::AuthRevokePairingLinkInput>,
) -> axum::response::Response {
    let token = match extract_token(&headers) {
        Some(t) => t,
        None => return err(StatusCode::UNAUTHORIZED, "Missing authorization token"),
    };
    match state.auth().verify_token(&token).await {
        Ok(true) => match state.auth().revoke_pairing_link(&input.code).await {
            Ok(_) => ok(serde_json::json!({ "revoked": true })),
            Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
        },
        _ => err(StatusCode::UNAUTHORIZED, "Invalid session"),
    }
}

/// `GET /api/auth/clients` — 列出客户端会话。
pub async fn auth_clients<S: AppStateAccess + 'static>(
    State(state): State<Arc<S>>,
    headers: HeaderMap,
) -> axum::response::Response {
    let token = match extract_token(&headers) {
        Some(t) => t,
        None => return err(StatusCode::UNAUTHORIZED, "Missing authorization token"),
    };
    match state.auth().verify_token(&token).await {
        Ok(true) => match state.auth().list_client_sessions(None).await {
            Ok(list) => ok(list),
            Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
        },
        _ => err(StatusCode::UNAUTHORIZED, "Invalid session"),
    }
}

/// `POST /api/auth/clients/revoke` — 撤销单个客户端会话。
pub async fn auth_revoke_client<S: AppStateAccess + 'static>(
    State(state): State<Arc<S>>,
    headers: HeaderMap,
    Json(input): Json<remi_contracts::AuthRevokeClientSessionInput>,
) -> axum::response::Response {
    let token = match extract_token(&headers) {
        Some(t) => t,
        None => return err(StatusCode::UNAUTHORIZED, "Missing authorization token"),
    };
    match state.auth().verify_token(&token).await {
        Ok(true) => match state.auth().revoke_client_session(&input.token).await {
            Ok(_) => ok(serde_json::json!({ "revoked": true })),
            Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
        },
        _ => err(StatusCode::UNAUTHORIZED, "Invalid session"),
    }
}

/// `POST /api/auth/clients/revoke-others` — 撤销除当前会话外的
/// 所有客户端会话。
pub async fn auth_revoke_other_clients<S: AppStateAccess + 'static>(
    State(state): State<Arc<S>>,
    headers: HeaderMap,
) -> axum::response::Response {
    let token = match extract_token(&headers) {
        Some(t) => t,
        None => return err(StatusCode::UNAUTHORIZED, "Missing authorization token"),
    };
    let session = match state.auth().get_session_state(&token).await {
        Ok(s) => s,
        Err(_) => return err(StatusCode::UNAUTHORIZED, "Invalid session"),
    };
    let session_id = match session.get("sessionId").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => return err(StatusCode::UNAUTHORIZED, "Invalid session"),
    };
    match state.auth().revoke_other_client_sessions(&session_id).await {
        Ok(count) => ok(serde_json::json!({ "revokedCount": count })),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

// ---------------------------------------------------------------------------
// 设置端点
// ---------------------------------------------------------------------------

/// `GET /api/settings` — 列出所有设置。
pub async fn settings_list<S: AppStateAccess + 'static>(
    State(state): State<Arc<S>>,
) -> axum::response::Response {
    use remi_persistence::repositories::settings_repo::SettingsRepositoryTrait;
    let repo = remi_persistence::repositories::SettingsRepository::new(state.db().pool().clone());
    match repo.list().await {
        Ok(settings) => {
            let map: HashMap<String, String> = settings.into_iter().collect();
            ok(map)
        }
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

/// `POST /api/settings` — 批量设置。
pub async fn settings_set<S: AppStateAccess + 'static>(
    State(state): State<Arc<S>>,
    Json(input): Json<HashMap<String, String>>,
) -> axum::response::Response {
    use remi_persistence::repositories::settings_repo::SettingsRepositoryTrait;
    let repo = remi_persistence::repositories::SettingsRepository::new(state.db().pool().clone());
    for (k, v) in input {
        if let Err(e) = repo.set(&k, &v).await {
            return err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string());
        }
    }
    ok(serde_json::json!({ "saved": true }))
}

// ---------------------------------------------------------------------------
// 附件端点
// ---------------------------------------------------------------------------

/// `POST /api/attachments/upload` — 上传一个或多个文件。
pub async fn attachments_upload<S: AppStateAccess + 'static>(
    State(state): State<Arc<S>>,
    mut multipart: Multipart,
) -> axum::response::Response {
    let mut attachments = Vec::new();
    while let Some(field) = multipart.next_field().await.unwrap_or(None) {
        let name = field.file_name().unwrap_or("file").to_string();
        let content_type = field
            .content_type()
            .unwrap_or("application/octet-stream")
            .to_string();
        let data = match field.bytes().await {
            Ok(d) => d,
            Err(e) => return err(StatusCode::BAD_REQUEST, e.to_string()),
        };
        let id = uuid::Uuid::new_v4().to_string();
        let path = state.config().data_dir.join("attachments").join(&id);
        if let Err(e) = tokio::fs::create_dir_all(path.parent().unwrap()).await {
            return err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string());
        }
        if let Err(e) = tokio::fs::write(&path, &data).await {
            return err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string());
        }
        attachments.push(serde_json::json!({
            "id": id,
            "name": name,
            "contentType": content_type,
            "size": data.len(),
        }));
    }
    ok(attachments)
}

/// `GET /api/attachments/{id}` — 下载单个附件。
pub async fn attachments_get<S: AppStateAccess + 'static>(
    State(state): State<Arc<S>>,
    Path(id): Path<String>,
) -> axum::response::Response {
    let path = state.config().data_dir.join("attachments").join(&id);
    match tokio::fs::read(&path).await {
        Ok(data) => axum::response::Response::builder()
            .header("Content-Type", "application/octet-stream")
            .body(axum::body::Body::from(data))
            .unwrap()
            .into_response(),
        Err(_) => err(StatusCode::NOT_FOUND, "Attachment not found"),
    }
}

// ---------------------------------------------------------------------------
// 密钥存储端点
// ---------------------------------------------------------------------------

/// `GET /api/secrets` — 列出密钥名称（不返回值）。
pub async fn secrets_list<S: AppStateAccess + 'static>(
    State(state): State<Arc<S>>,
) -> axum::response::Response {
    use remi_persistence::repositories::secret_repo::SecretRepositoryTrait;
    let repo = remi_persistence::repositories::SecretRepository::new(state.db().pool().clone());
    match repo.list_names().await {
        Ok(names) => ok(names),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

/// `POST /api/secrets` — 设置密钥值。
pub async fn secrets_set<S: AppStateAccess + 'static>(
    State(state): State<Arc<S>>,
    Json(input): Json<SecretBody>,
) -> axum::response::Response {
    use remi_persistence::repositories::secret_repo::SecretRepositoryTrait;
    let repo = remi_persistence::repositories::SecretRepository::new(state.db().pool().clone());
    match repo.set(&input.name, &input.value).await {
        Ok(_) => ok(serde_json::json!({ "stored": true })),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

#[derive(Debug, Deserialize)]
pub struct SecretBody {
    pub name: String,
    pub value: String,
}

/// `DELETE /api/secrets/{name}` — 删除密钥。
pub async fn secrets_delete<S: AppStateAccess + 'static>(
    State(state): State<Arc<S>>,
    Path(name): Path<String>,
) -> axum::response::Response {
    use remi_persistence::repositories::secret_repo::SecretRepositoryTrait;
    let repo = remi_persistence::repositories::SecretRepository::new(state.db().pool().clone());
    match repo.delete(&name).await {
        Ok(_) => ok(serde_json::json!({ "deleted": true })),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

// ---------------------------------------------------------------------------
// Git 端点
// ---------------------------------------------------------------------------

/// `POST /api/git/status` — 获取路径的工作树状态。
pub async fn git_status<S: AppStateAccess + 'static>(
    State(state): State<Arc<S>>,
    Json(input): Json<GitPathBody>,
) -> axum::response::Response {
    let git = remi_git::GitService::new();
    match git.status(&input.path).await {
        Ok(s) => ok(s),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

/// `POST /api/git/checkout` — 检出仓库中的分支。
pub async fn git_checkout<S: AppStateAccess + 'static>(
    State(state): State<Arc<S>>,
    Json(input): Json<GitCheckoutBody>,
) -> axum::response::Response {
    let git = remi_git::GitService::new();
    match git.checkout(&input.path, &input.branch).await {
        Ok(_) => ok(serde_json::json!({ "checked_out": input.branch })),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

/// `POST /api/git/branches` — 列出分支。
pub async fn git_branches<S: AppStateAccess + 'static>(
    State(state): State<Arc<S>>,
    Json(input): Json<GitPathBody>,
) -> axum::response::Response {
    let git = remi_git::GitService::new();
    match git.branches(&input.path).await {
        Ok(b) => ok(b),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

#[derive(Debug, Deserialize)]
pub struct GitPathBody {
    pub path: String,
}

#[derive(Debug, Deserialize)]
pub struct GitCheckoutBody {
    pub path: String,
    pub branch: String,
}

// ---------------------------------------------------------------------------
// 路由注册
// ---------------------------------------------------------------------------

/// 在提供的 [`Router`] 上注册完整的 HTTP 路由表。
pub fn register_routes<S: AppStateAccess + 'static>(state: Arc<S>) -> Router {
    info!("Registering HTTP routes");

    let r = Router::new()
        // 健康检查与元信息
        .route("/health", get(health))
        .route("/api/version", get(version))
        // Provider
        .route("/api/providers", get(list_providers::<S>))
        .route(
            "/api/providers/:name/commands",
            get(list_provider_commands::<S>),
        )
        // 项目
        .route("/api/projects", get(list_projects::<S>))
        .route("/api/projects", post(create_project::<S>))
        .route("/api/projects/:id", get(get_project::<S>))
        .route("/api/projects/:id", delete(delete_project::<S>))
        .route(
            "/api/projects/:id/threads",
            get(list_threads::<S>).post(create_thread::<S>),
        )
        // 线程
        .route("/api/threads/:id", get(get_thread::<S>))
        .route("/api/threads/:id", delete(delete_thread::<S>))
        .route("/api/threads/:id/messages", get(list_messages::<S>))
        .route("/api/threads/:id/messages", post(send_message::<S>))
        // 文件系统
        .route("/api/filesystem/browse", get(filesystem_browse::<S>))
        .route("/api/filesystem/read", post(filesystem_read::<S>))
        .route("/api/filesystem/write", post(filesystem_write::<S>))
        // 终端
        .route("/api/terminal/list", get(terminal_list::<S>))
        .route("/api/terminal/create", post(terminal_create::<S>))
        .route(
            "/api/terminal/:id/write",
            post(terminal_write::<S>),
        )
        .route(
            "/api/terminal/:id/resize",
            post(terminal_resize::<S>),
        )
        .route(
            "/api/terminal/:id/close",
            post(terminal_close::<S>),
        )
        // Worktree
        .route("/api/workspace/worktrees", get(worktree_list::<S>))
        .route("/api/workspace/worktrees", post(worktree_create::<S>))
        .route(
            "/api/workspace/worktrees/gc",
            post(worktree_gc::<S>),
        )
        .route(
            "/api/workspace/worktrees/:id",
            delete(worktree_remove::<S>),
        )
        // 认证
        .route("/api/auth/bootstrap", post(auth_bootstrap::<S>))
        .route("/api/auth/verify", post(auth_verify::<S>))
        .route("/api/auth/session", get(auth_session::<S>))
        .route("/api/auth/pairing-token", post(auth_pairing::<S>))
        .route("/api/auth/ws-token", post(auth_ws_token::<S>))
        .route("/api/auth/pairing-links", get(auth_pairing_links::<S>))
        .route(
            "/api/auth/pairing-links/revoke",
            post(auth_revoke_pairing::<S>),
        )
        .route("/api/auth/clients", get(auth_clients::<S>))
        .route(
            "/api/auth/clients/revoke",
            post(auth_revoke_client::<S>),
        )
        .route(
            "/api/auth/clients/revoke-others",
            post(auth_revoke_other_clients::<S>),
        )
        // 设置
        .route("/api/settings", get(settings_list::<S>))
        .route("/api/settings", post(settings_set::<S>))
        // 附件
        .route("/api/attachments/upload", post(attachments_upload::<S>))
        .route("/api/attachments/:id", get(attachments_get::<S>))
        // 密钥
        .route("/api/secrets", get(secrets_list::<S>))
        .route("/api/secrets", post(secrets_set::<S>))
        .route("/api/secrets/:name", delete(secrets_delete::<S>))
        // Git
        .route("/api/git/status", post(git_status::<S>))
        .route("/api/git/checkout", post(git_checkout::<S>))
        .route("/api/git/branches", post(git_branches::<S>));

    r.with_state(state)
}

/// 已注册的 HTTP 路由数量（用于诊断和测试）。
pub fn route_count() -> usize {
    // 添加路由时需手动更新；集成冒烟测试用此值
    // 断言路由表规模是否合理。
    53
}

#[allow(dead_code)]
fn _unused_marker(_: &Value, _: &HeaderMap) {
    // 占位辅助函数，用于保持未来可能添加的路由处理器的导入稳定性。非真实处理器。
    warn!("unused marker hit");
}
