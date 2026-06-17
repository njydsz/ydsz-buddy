//! Remi Code Server - Main entry point.
//!
//! This binary starts the HTTP/WebSocket server for Remi Code.

use axum::{
    Json, Router,
    extract::{Multipart, State},
    http::{HeaderValue, Method, StatusCode},
    response::IntoResponse,
    routing::{get, post},
};
use remi_auth::AuthService;
use remi_core::ServerConfig;
use remi_orchestration::OrchestrationEngine;
use remi_persistence::Database;
use remi_providers::{ClaudeAdapter, ProviderRegistry};
use remi_pty::TerminalManager;
use remi_rpc::{RpcState, WsState, server::create_ws_router};
use remi_workspace::WorkspaceService;
use std::sync::Arc;
use tower_http::cors::{AllowOrigin, CorsLayer};
use tracing::{error, info};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

/// Application state shared across handlers.
#[derive(Clone)]
#[allow(dead_code)]
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
    info!("Provider registry initialized");

    // Initialize orchestration engine
    let orchestration = Arc::new(OrchestrationEngine::new(
        db.clone(),
        provider_registry.clone(),
    ));

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
        ws_state: ws_state.clone(),
    });

    // Build application state
    let state = Arc::new(AppState {
        config: config.clone(),
        db,
        orchestration,
        workspace,
        terminal_manager,
        provider_registry,
        auth,
        ws_state: ws_state.clone(),
    });

    // Build router with secure CORS configuration
    let cors = if config.dev_mode {
        // Development mode: allow localhost origins
        CorsLayer::new()
            .allow_origin(AllowOrigin::list([
                HeaderValue::from_static("http://localhost:3000"),
                HeaderValue::from_static("http://localhost:5173"),
                HeaderValue::from_static("http://127.0.0.1:3000"),
                HeaderValue::from_static("http://127.0.0.1:5173"),
            ]))
            .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE])
            .allow_headers(tower_http::cors::Any)
    } else {
        // Production mode: restrict to same origin
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

    let app = Router::new()
        .route("/health", get(health_handler))
        .route(
            "/api/providers",
            get(providers_handler).with_state(state.clone()),
        )
        // Auth endpoints
        .route("/api/auth/bootstrap", post(auth_bootstrap_handler).with_state(state.clone()))
        .route("/api/auth/verify", post(auth_verify_handler).with_state(state.clone()))
        // Settings endpoints
        .route("/api/settings", get(settings_get_handler).with_state(state.clone()))
        .route("/api/settings", post(settings_set_handler).with_state(state.clone()))
        // Attachments endpoints
        .route("/api/attachments/upload", post(attachments_upload_handler).with_state(state.clone()))
        .route("/api/attachments/:id", get(attachments_get_handler).with_state(state.clone()))
        // Terminal endpoints
        .route("/api/terminal/create", post(terminal_create_handler).with_state(state.clone()))
        .route("/api/terminal/list", get(terminal_list_handler).with_state(state.clone()))
        .merge(create_ws_router(rpc_state))
        .layer(cors);

    // Start server
    let addr = format!("{}:{}", config.host, config.port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    info!("Server listening on {}", addr);

    axum::serve(listener, app).await?;

    Ok(())
}

/// Health check handler.
async fn health_handler() -> impl IntoResponse {
    Json(serde_json::json!({
        "status": "ok",
        "startupReady": true,
        "pushBusReady": true,
        "keybindingsReady": true,
        "terminalSubscriptionsReady": true,
        "orchestrationSubscriptionsReady": true,
    }))
}

/// List providers handler.
async fn providers_handler(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let providers = state.provider_registry.list();
    Json(providers)
}
