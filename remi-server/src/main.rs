//! Remi Code Server - Main entry point.
//!
//! This binary starts the HTTP/WebSocket server for Remi Code. It uses
//! the [`remi_server::routes`] module to mount every HTTP route in one
//! place and additionally exposes the WebSocket endpoint used by the
//! Tauri desktop client.

use axum::{
    Router,
    http::{HeaderValue, Method},
    routing::get,
};
use remi_auth::AuthService;
use remi_core::ServerConfig;
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
use std::sync::Arc;
use std::time::Duration;
use tower_http::cors::{AllowOrigin, CorsLayer};
use tracing::{error, info};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

/// Application state shared across handlers.
#[derive(Clone)]
struct AppState {
    config: ServerConfig,
    db: Arc<Database>,
    orchestration: Arc<OrchestrationEngine>,
    workspace: Arc<WorkspaceService>,
    terminal_manager: Arc<TerminalManager>,
    provider_registry: Arc<ProviderRegistry>,
    auth: Arc<AuthService>,
    ws_state: Arc<WsState>,
}

impl From<AppState> for ServerState {
    fn from(s: AppState) -> Self {
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

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "remi_server=info,tower_http=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    info!("Starting Remi Code Server");

    // Load configuration
    let config = ServerConfig::load().unwrap_or_else(|e| {
        error!("Failed to load configuration: {}", e);
        ServerConfig::default()
    });

    info!(
        "Configuration: host={}, port={}, db={}",
        config.host,
        config.port,
        config.db_path.display()
    );

    // Ensure data directory exists
    tokio::fs::create_dir_all(&config.data_dir).await?;

    // Initialize database
    let db = Arc::new(Database::connect(&config).await?);
    db.run_migrations().await?;
    info!("Database initialized");

    // Initialize authentication service
    let auth = Arc::new(AuthService::new(db.clone()));
    let secret_key: Vec<u8> = (0..32).map(|_| rand::random()).collect();
    auth.initialize(secret_key).await?;
    info!("Authentication service initialized");

    // Initialize provider registry
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
        "Provider registry initialized ({} providers)",
        provider_registry.list().len()
    );

    // Initialize orchestration engine (with reactor fan-out wired up).
    let orchestration = Arc::new(OrchestrationEngine::with_default_reactors(
        db.clone(),
        provider_registry.clone(),
    ));
    let _reactor_handle = orchestration.spawn_reactor_loop();
    info!("Orchestration engine started with default reactor set");

    // Initialize workspace service
    let workspace = Arc::new(WorkspaceService::new(config.data_dir.join("workspace")));

    // Initialize terminal manager
    let terminal_manager = Arc::new(TerminalManager::new());

    // Initialize WebSocket state
    let ws_state = Arc::new(WsState::new());

    // Initialize RPC state
    let rpc_state = Arc::new(RpcState {
        orchestration: orchestration.clone(),
        workspace: workspace.clone(),
        provider_registry: provider_registry.clone(),
        auth: auth.clone(),
        terminal_manager: terminal_manager.clone(),
        ws_state: ws_state.clone(),
    });

    // Build application state
    let state = AppState {
        config: config.clone(),
        db: db.clone(),
        orchestration: orchestration.clone(),
        workspace: workspace.clone(),
        terminal_manager: terminal_manager.clone(),
        provider_registry: provider_registry.clone(),
        auth: auth.clone(),
        ws_state: ws_state.clone(),
    };
    let state = Arc::new(state);

    let server_state: Arc<ServerState> = Arc::new(state.clone().into());

    // Build router with secure CORS configuration
    let cors = if config.dev_mode {
        CorsLayer::new()
            .allow_origin(AllowOrigin::list([
                HeaderValue::from_static("http://localhost:3000"),
                HeaderValue::from_static("http://localhost:5173"),
                HeaderValue::from_static("http://127.0.0.1:3000"),
                HeaderValue::from_static("http://127.0.0.1:5173"),
            ]))
            .allow_methods([
                Method::GET,
                Method::POST,
                Method::PUT,
                Method::DELETE,
                Method::PATCH,
                Method::OPTIONS,
            ])
            .allow_headers(tower_http::cors::Any)
            .max_age(Duration::from_secs(3600))
    } else {
        CorsLayer::new()
            .allow_origin(AllowOrigin::exact(HeaderValue::from_static(
                "https://remi-code.com",
            )))
            .allow_methods([Method::GET, Method::POST])
            .allow_headers([
                axum::http::header::CONTENT_TYPE,
                axum::http::header::AUTHORIZATION,
            ])
    };

    // Mount the full route surface (50+ endpoints) and the WebSocket.
    let app = register_routes(server_state)
        .route("/", get(root_redirect))
        .merge(create_ws_router(rpc_state))
        .layer(cors);

    // Start server
    let addr = format!("{}:{}", config.host, config.port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    info!(
        "Server listening on {} ({} routes registered)",
        addr,
        remi_server::route_count()
    );

    axum::serve(listener, app).await?;

    Ok(())
}

/// Root path: 200 OK with a small JSON descriptor so health probes that
/// hit `/` (not `/health`) still get a useful response.
async fn root_redirect() -> axum::response::Response {
    axum::Json(serde_json::json!({
        "name": "remi-code-server",
        "version": env!("CARGO_PKG_VERSION"),
        "health": "/health",
    }))
    .into_response()
}

// `IntoResponse` lives in `axum::response`; re-export here so the helper
// above compiles when the import is re-anchored at the call site.
use axum::response::IntoResponse;
