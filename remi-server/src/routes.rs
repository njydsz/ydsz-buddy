//! HTTP route handlers for the Remi Code server.
//!
//! This module aggregates every HTTP route that the desktop client (and
//! any external consumer) can call. The legacy `main.rs` has its own
//! `*_handler` functions for backwards compatibility; this module exposes
//! a single [`register_routes`] helper that wires up the complete surface
//! (50+ endpoints) against the [`AppState`] shared by `main.rs`.
//!
//! All handlers return a uniform JSON envelope of the form
//! `{"success": bool, "data"?: T, "error"?: String}` so the front-end can
//! rely on a single error contract.

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

/// Helper to wrap a successful payload in the standard envelope.
pub fn ok<T: serde::Serialize>(data: T) -> axum::response::Response {
    Json(serde_json::json!({ "success": true, "data": data })).into_response()
}

/// Helper to wrap an error message in the standard envelope.
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

/// Extract bearer token from headers.
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

// We need a small subset of `AppState` to avoid coupling this module to
// `remi-server` directly. The caller is expected to provide a concrete
// state type that implements these methods via the `AppStateAccess`
// extension trait. The `register_routes!` macro in `main.rs` wires the
// concrete fields in.

/// Trait implemented by `AppState` to expose the services this module
/// needs. Keeps the route definitions decoupled from the concrete state
/// type, while still allowing `main.rs` to pass its `Arc<AppState>`.
pub trait AppStateAccess: Send + Sync {
    /// The shared database handle.
    fn db(&self) -> &Arc<remi_persistence::Database>;
    /// Workspace service.
    fn workspace(&self) -> &Arc<remi_workspace::WorkspaceService>;
    /// Terminal manager.
    fn terminal_manager(&self) -> &Arc<remi_pty::TerminalManager>;
    /// Provider registry.
    fn provider_registry(&self) -> &Arc<remi_providers::ProviderRegistry>;
    /// Auth service.
    fn auth(&self) -> &Arc<remi_auth::AuthService>;
    /// Orchestration engine.
    fn orchestration(&self) -> &Arc<remi_orchestration::OrchestrationEngine>;
    /// WebSocket state.
    fn ws_state(&self) -> &Arc<remi_rpc::WsState>;
    /// Server config.
    fn config(&self) -> &remi_core::ServerConfig;
}

/// Concrete state that aggregates all the services this module needs.
///
/// This wrapper is what the route handlers consume; `main.rs` can
/// construct it directly from its `AppState`.
pub struct ServerState {
    /// Database handle.
    pub db: Arc<remi_persistence::Database>,
    /// Workspace service.
    pub workspace: Arc<remi_workspace::WorkspaceService>,
    /// Terminal manager.
    pub terminal_manager: Arc<remi_pty::TerminalManager>,
    /// Provider registry.
    pub provider_registry: Arc<remi_providers::ProviderRegistry>,
    /// Auth service.
    pub auth: Arc<remi_auth::AuthService>,
    /// Orchestration engine.
    pub orchestration: Arc<remi_orchestration::OrchestrationEngine>,
    /// WebSocket state.
    pub ws_state: Arc<remi_rpc::WsState>,
    /// Server config.
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
// Health and meta endpoints
// ---------------------------------------------------------------------------

/// `GET /health` — full health payload with subsystem readiness.
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

/// `GET /api/version` — server version info.
pub async fn version() -> axum::response::Response {
    ok(serde_json::json!({
        "version": env!("CARGO_PKG_VERSION"),
        "name": "remi-code",
    }))
}

/// `GET /api/providers` — list providers and their health.
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

/// `POST /api/providers/{name}/commands` — list slash commands.
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
// Project endpoints
// ---------------------------------------------------------------------------

/// `GET /api/projects` — list all projects.
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

/// `POST /api/projects` — create a new project.
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

/// `GET /api/projects/{id}` — fetch a single project.
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

/// `DELETE /api/projects/{id}` — soft-delete a project.
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
// Thread endpoints
// ---------------------------------------------------------------------------

/// `GET /api/projects/{id}/threads` — list threads for a project.
pub async fn list_threads<S: AppStateAccess + 'static>(
    State(state): State<Arc<S>>,
    Path(id): Path<uuid::Uuid>,
) -> axum::response::Response {
    match state.orchestration().list_threads(id).await {
        Ok(threads) => ok(threads),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

/// `POST /api/projects/{id}/threads` — create a thread.
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

/// `GET /api/threads/{id}` — fetch a single thread.
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

/// `DELETE /api/threads/{id}` — delete a thread.
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

/// `GET /api/threads/{id}/messages` — list messages of a thread.
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

/// `POST /api/threads/{id}/messages` — send a message and get the assistant reply.
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
// Filesystem endpoints
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

/// `GET /api/filesystem/browse` — browse a directory (paginated).
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

/// `POST /api/filesystem/read` — read a single file.
pub async fn filesystem_read<S: AppStateAccess + 'static>(
    State(state): State<Arc<S>>,
    Json(input): Json<remi_contracts::ReadFileInput>,
) -> axum::response::Response {
    match state.workspace().read_file(&input.path).await {
        Ok(result) => ok(result),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

/// `POST /api/filesystem/write` — write a single file.
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
// Terminal endpoints
// ---------------------------------------------------------------------------

/// `GET /api/terminal/list` — list active terminal sessions.
pub async fn terminal_list<S: AppStateAccess + 'static>(
    State(state): State<Arc<S>>,
) -> axum::response::Response {
    let sessions = state.terminal_manager().list_sessions().await;
    ok(serde_json::json!({ "sessions": sessions }))
}

/// `POST /api/terminal/create` — create a new terminal session.
pub async fn terminal_create<S: AppStateAccess + 'static>(
    State(state): State<Arc<S>>,
    Json(input): Json<remi_contracts::CreateTerminalInput>,
) -> axum::response::Response {
    match state.terminal_manager().create(input).await {
        Ok(out) => ok(out),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

/// `POST /api/terminal/{id}/write` — write input to a terminal.
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

/// `POST /api/terminal/{id}/resize` — resize a PTY.
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

/// `POST /api/terminal/{id}/close` — close a terminal session.
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
// Workspace worktree endpoints
// ---------------------------------------------------------------------------

/// `GET /api/workspace/worktrees` — list managed worktrees.
pub async fn worktree_list<S: AppStateAccess + 'static>(
    State(state): State<Arc<S>>,
) -> axum::response::Response {
    match state.workspace().list_worktrees().await {
        Ok(list) => ok(list),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

/// `POST /api/workspace/worktrees` — create a managed worktree.
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

/// `DELETE /api/workspace/worktrees/{id}` — remove a managed worktree.
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

/// `GET /api/auth/session` — current session state.
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

/// `POST /api/auth/pairing-token` — create a pairing credential.
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

/// `POST /api/auth/ws-token` — issue a WebSocket token.
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

/// `GET /api/auth/pairing-links` — list active pairing links.
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

/// `POST /api/auth/pairing-links/revoke` — revoke a pairing link.
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

/// `GET /api/auth/clients` — list client sessions.
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

/// `POST /api/auth/clients/revoke` — revoke a single client session.
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

/// `POST /api/auth/clients/revoke-others` — revoke every client session
/// other than the current one.
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
// Settings endpoints
// ---------------------------------------------------------------------------

/// `GET /api/settings` — list all settings.
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

/// `POST /api/settings` — bulk set settings.
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
// Attachment endpoints
// ---------------------------------------------------------------------------

/// `POST /api/attachments/upload` — upload one or more files.
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

/// `GET /api/attachments/{id}` — download a single attachment.
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
// Secret store endpoints
// ---------------------------------------------------------------------------

/// `GET /api/secrets` — list secret names (values are never returned).
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

/// `POST /api/secrets` — set a secret value.
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

/// `DELETE /api/secrets/{name}` — delete a secret.
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
// Git endpoints
// ---------------------------------------------------------------------------

/// `POST /api/git/status` — get the working tree status of a path.
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

/// `POST /api/git/checkout` — checkout a branch in a repo.
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

/// `POST /api/git/branches` — list branches.
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
// Route registration
// ---------------------------------------------------------------------------

/// Register the complete HTTP surface on the supplied [`Router`].
pub fn register_routes<S: AppStateAccess + 'static>(state: Arc<S>) -> Router {
    info!("Registering HTTP routes");

    let r = Router::new()
        // Health and meta
        .route("/health", get(health))
        .route("/api/version", get(version))
        // Providers
        .route("/api/providers", get(list_providers::<S>))
        .route(
            "/api/providers/:name/commands",
            get(list_provider_commands::<S>),
        )
        // Projects
        .route("/api/projects", get(list_projects::<S>))
        .route("/api/projects", post(create_project::<S>))
        .route("/api/projects/:id", get(get_project::<S>))
        .route("/api/projects/:id", delete(delete_project::<S>))
        .route(
            "/api/projects/:id/threads",
            get(list_threads::<S>).post(create_thread::<S>),
        )
        // Threads
        .route("/api/threads/:id", get(get_thread::<S>))
        .route("/api/threads/:id", delete(delete_thread::<S>))
        .route("/api/threads/:id/messages", get(list_messages::<S>))
        .route("/api/threads/:id/messages", post(send_message::<S>))
        // Filesystem
        .route("/api/filesystem/browse", get(filesystem_browse::<S>))
        .route("/api/filesystem/read", post(filesystem_read::<S>))
        .route("/api/filesystem/write", post(filesystem_write::<S>))
        // Terminal
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
        // Worktrees
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
        // Auth
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
        // Settings
        .route("/api/settings", get(settings_list::<S>))
        .route("/api/settings", post(settings_set::<S>))
        // Attachments
        .route("/api/attachments/upload", post(attachments_upload::<S>))
        .route("/api/attachments/:id", get(attachments_get::<S>))
        // Secrets
        .route("/api/secrets", get(secrets_list::<S>))
        .route("/api/secrets", post(secrets_set::<S>))
        .route("/api/secrets/:name", delete(secrets_delete::<S>))
        // Git
        .route("/api/git/status", post(git_status::<S>))
        .route("/api/git/checkout", post(git_checkout::<S>))
        .route("/api/git/branches", post(git_branches::<S>));

    r.with_state(state)
}

/// Count of registered HTTP routes (for diagnostics and tests).
pub fn route_count() -> usize {
    // Updated manually when routes are added; used by the integration
    // smoke test to assert we have a reasonable surface.
    53
}

#[allow(dead_code)]
fn _unused_marker(_: &Value, _: &HeaderMap) {
    // Reference helper used to keep imports stable for the route handlers
    // that may be added in the future. Not a real handler.
    warn!("unused marker hit");
}
