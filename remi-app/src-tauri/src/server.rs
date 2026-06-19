//! Embedded `remi-server` lifecycle.
//!
//! Boots the full HTTP/WS server in-process (database, auth, providers,
//! orchestration, terminal, workspace, git) on a loopback port, holds the
//! join handle in a [`EmbeddedServerHandle`], and provides a graceful
//! shutdown path so the Tauri run-loop can stop the server on exit.

use anyhow::{Context, Result, anyhow};
use axum::{Router, http::HeaderValue, routing::get};
use remi_auth::AuthService;
use remi_core::{RuntimeMode, ServerConfig};
use remi_orchestration::OrchestrationEngine;
use remi_persistence::Database;
use remi_providers::{
    ClaudeAdapter, CodexAdapter, CursorAdapter, GeminiAdapter, GrokAdapter, KiloAdapter,
    OpenCodeAdapter, PiAdapter, ProviderRegistry,
};
use remi_pty::TerminalManager;
use remi_rpc::{RpcState, WsState, server::create_ws_router};
use remi_server::{ServerState, register_routes};
use remi_workspace::WorkspaceService;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::oneshot;
use tower_http::cors::{AllowOrigin, CorsLayer};
use tracing::{info, warn};

/// Handle returned to Tauri's managed state. Cloning is cheap — the
/// underlying shutdown channel is wrapped in an `Arc`.
#[derive(Clone)]
pub struct EmbeddedServerHandle {
    port: u16,
    host: String,
    shutdown_tx: Arc<tokio::sync::Mutex<Option<oneshot::Sender<()>>>>,
    server_task: Arc<tokio::sync::Mutex<Option<tokio::task::JoinHandle<()>>>>,
}

impl EmbeddedServerHandle {
    /// The loopback port the server bound to (useful when `port: 0`
    /// is used in dev to let the OS pick).
    pub fn port(&self) -> u16 {
        self.port
    }

    /// The host the server is bound to. Defaults to `127.0.0.1`.
    pub fn host(&self) -> &str {
        &self.host
    }

    /// Full WebSocket URL the renderer should connect to.
    pub fn ws_url(&self) -> String {
        format!("ws://{}:{}/ws", self.host, self.port)
    }

    /// Trigger a graceful shutdown of the embedded server.
    pub fn shutdown(&self) {
        if let Some(tx) = self.shutdown_tx.blocking_lock().take() {
            let _ = tx.send(());
        }
    }
}

/// Boot the embedded server, returning a handle the Tauri shell can use
/// to broadcast the port to the renderer and shut down on exit.
pub async fn spawn_embedded_server(data_dir: PathBuf) -> Result<EmbeddedServerHandle> {
    let mut config = ServerConfig::default();
    config.host = "127.0.0.1".to_string();
    config.port = 0; // OS-assigned loopback port.
    config.runtime_mode = RuntimeMode::Desktop;
    config.data_dir = data_dir.clone();
    config.db_path = data_dir.join("remi-code.db");
    config.dev_mode = cfg!(debug_assertions);

    tokio::fs::create_dir_all(&config.data_dir)
        .await
        .with_context(|| format!("create data dir {}", config.data_dir.display()))?;

    let db = Arc::new(Database::connect(&config).await?);
    db.run_migrations().await?;
    info!("Embedded server: database ready at {}", config.db_path.display());

    let auth = Arc::new(AuthService::new(db.clone()));
    let secret_key: Vec<u8> = (0..32).map(|_| rand::random()).collect();
    auth.initialize(secret_key).await?;
    info!("Embedded server: auth service initialized");

    let provider_registry = Arc::new(ProviderRegistry::new());
    provider_registry.register(Arc::new(ClaudeAdapter::new()));
    provider_registry.register(Arc::new(CodexAdapter::new()));
    provider_registry.register(Arc::new(GeminiAdapter::new()));
    provider_registry.register(Arc::new(GrokAdapter::new()));
    provider_registry.register(Arc::new(OpenCodeAdapter::new()));
    provider_registry.register(Arc::new(CursorAdapter::new()));
    provider_registry.register(Arc::new(PiAdapter::new()));
    provider_registry.register(Arc::new(KiloAdapter::new()));
    info!(
        "Embedded server: {} providers registered",
        provider_registry.list().len()
    );

    let orchestration = Arc::new(OrchestrationEngine::with_default_reactors(
        db.clone(),
        provider_registry.clone(),
    ));
    let _reactor_handle = orchestration.spawn_reactor_loop();
    info!("Embedded server: orchestration engine started");

    let workspace = Arc::new(WorkspaceService::new(config.data_dir.join("workspace")));
    let terminal_manager = Arc::new(TerminalManager::new());
    let ws_state = Arc::new(WsState::new());

    let rpc_state = Arc::new(RpcState {
        orchestration: orchestration.clone(),
        workspace: workspace.clone(),
        provider_registry: provider_registry.clone(),
        auth: auth.clone(),
        terminal_manager: terminal_manager.clone(),
        ws_state: ws_state.clone(),
    });

    let server_state: Arc<ServerState> = Arc::new(
        RemiAppState {
            config: config.clone(),
            db,
            orchestration,
            workspace,
            terminal_manager,
            provider_registry,
            auth,
            ws_state,
        }
        .into(),
    );

    // Strict loopback CORS — only the Tauri webview and a local dev
    // server (Vite at 1420/5173) can reach the embedded server.
    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::list([
            HeaderValue::from_static("http://localhost:1420"),
            HeaderValue::from_static("http://localhost:5173"),
            HeaderValue::from_static("http://127.0.0.1:1420"),
            HeaderValue::from_static("http://127.0.0.1:5173"),
            HeaderValue::from_static("tauri://localhost"),
            HeaderValue::from_static("https://tauri.localhost"),
        ]))
        .allow_methods(tower_http::cors::Any)
        .allow_headers(tower_http::cors::Any);

    let app: Router = register_routes(server_state)
        .route("/", get(root_descriptor))
        .merge(create_ws_router(rpc_state))
        .layer(cors);

    let addr: SocketAddr = format!("{}:{}", config.host, config.port)
        .parse()
        .expect("valid socket addr");
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .with_context(|| format!("bind embedded server on {addr}"))?;
    let bound = listener
        .local_addr()
        .with_context(|| "read bound port from listener")?;

    info!(
        "Embedded remi-server listening on http://{} ({} routes)",
        bound,
        remi_server::route_count()
    );

    let (shutdown_tx, shutdown_rx) = oneshot::channel();
    let server_task = tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, app)
            .with_graceful_shutdown(async move {
                let _ = shutdown_rx.await;
                warn!("Embedded remi-server received shutdown signal");
            })
            .await
        {
            tracing::error!("Embedded remi-server crashed: {e}");
        }
    });

    Ok(EmbeddedServerHandle {
        port: bound.port(),
        host: bound.ip().to_string(),
        shutdown_tx: Arc::new(tokio::sync::Mutex::new(Some(shutdown_tx))),
        server_task: Arc::new(tokio::sync::Mutex::new(Some(server_task))),
    })
}

/// Bridge between the concrete Tauri-side state and the `ServerState`
/// shape that `remi-server::register_routes` expects. This is the
/// desktop counterpart of the `AppState` in `remi-server/src/main.rs`.
#[derive(Clone)]
struct RemiAppState {
    config: ServerConfig,
    db: Arc<Database>,
    orchestration: Arc<OrchestrationEngine>,
    workspace: Arc<WorkspaceService>,
    terminal_manager: Arc<TerminalManager>,
    provider_registry: Arc<ProviderRegistry>,
    auth: Arc<AuthService>,
    ws_state: Arc<WsState>,
}

impl From<RemiAppState> for ServerState {
    fn from(s: RemiAppState) -> Self {
        ServerState {
            db: s.db,
            workspace: s.workspace,
            terminal_manager: s.terminal_manager,
            provider_registry: s.provider_registry,
            auth: s.auth,
            orchestration: s.orchestration,
            ws_state: s.ws_state,
            config: s.config,
        }
    }
}

async fn root_descriptor() -> axum::response::Response {
    axum::Json(serde_json::json!({
        "name": "remi-app",
        "mode": "desktop",
        "transport": "http+ws",
        "version": env!("CARGO_PKG_VERSION"),
    }))
    .into_response()
}

#[allow(unused_imports)]
use axum::response::IntoResponse;

#[allow(dead_code)]
fn _force_anyhow() -> Result<()> {
    Err(anyhow!("unreachable"))
}
