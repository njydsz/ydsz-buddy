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
use remi_providers::{ClaudeAdapter, CodexAdapter, CursorAdapter, GeminiAdapter, GrokAdapter, KiloAdapter, OpenCodeAdapter, PiAdapter, ProviderRegistry};
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
    provider_registry.register(Arc::new(CodexAdapter::new()));
    provider_registry.register(Arc::new(GeminiAdapter::new()));
    provider_registry.register(Arc::new(GrokAdapter::new()));
    provider_registry.register(Arc::new(OpenCodeAdapter::new()));
    provider_registry.register(Arc::new(CursorAdapter::new()));
    provider_registry.register(Arc::new(PiAdapter::new()));
    provider_registry.register(Arc::new(KiloAdapter::new()));
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
        terminal_manager: terminal_manager.clone(),
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

/// Auth bootstrap handler.
async fn auth_bootstrap_handler(
    State(state): State<Arc<AppState>>,
    Json(input): Json<remi_contracts::AuthBootstrapInput>,
) -> impl IntoResponse {
    match state.auth.bootstrap(input).await {
        Ok(output) => Json(serde_json::json!({
            "success": true,
            "data": output
        })).into_response(),
        Err(e) => {
            error!("Auth bootstrap failed: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({
                "success": false,
                "error": e.to_string()
            }))).into_response()
        }
    }
}

/// Auth verify handler.
async fn auth_verify_handler(
    State(state): State<Arc<AppState>>,
    Json(input): Json<remi_contracts::AuthVerifyInput>,
) -> impl IntoResponse {
    match state.auth.verify_token(&input.token).await {
        Ok(valid) => Json(serde_json::json!({
            "success": true,
            "valid": valid
        })).into_response(),
        Err(e) => {
            error!("Auth verify failed: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({
                "success": false,
                "error": e.to_string()
            }))).into_response()
        }
    }
}

/// Settings get handler.
async fn settings_get_handler(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    use remi_persistence::repositories::settings_repo::SettingsRepositoryTrait;
    let settings_repo = remi_persistence::repositories::SettingsRepository::new(state.db.pool().clone());
    
    match settings_repo.list().await {
        Ok(settings) => {
            let map: std::collections::HashMap<String, String> = settings.into_iter().collect();
            Json(serde_json::json!({
                "success": true,
                "data": map
            })).into_response()
        }
        Err(e) => {
            error!("Settings get failed: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({
                "success": false,
                "error": e.to_string()
            }))).into_response()
        }
    }
}

/// Settings set handler.
async fn settings_set_handler(
    State(state): State<Arc<AppState>>,
    Json(input): Json<std::collections::HashMap<String, String>>,
) -> impl IntoResponse {
    use remi_persistence::repositories::settings_repo::SettingsRepositoryTrait;
    let settings_repo = remi_persistence::repositories::SettingsRepository::new(state.db.pool().clone());
    
    for (key, value) in input {
        if let Err(e) = settings_repo.set(&key, &value).await {
            error!("Settings set failed for key {}: {}", key, e);
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({
                "success": false,
                "error": e.to_string()
            }))).into_response();
        }
    }
    
    Json(serde_json::json!({
        "success": true
    })).into_response()
}

/// Attachments upload handler.
async fn attachments_upload_handler(
    State(state): State<Arc<AppState>>,
    mut multipart: Multipart,
) -> impl IntoResponse {
    let mut attachments = Vec::new();
    
    while let Some(field) = multipart.next_field().await.unwrap_or(None) {
        let name = field.file_name().unwrap_or("file").to_string();
        let content_type = field.content_type().unwrap_or("application/octet-stream").to_string();
        
        match field.bytes().await {
            Ok(data) => {
                let id = uuid::Uuid::new_v4().to_string();
                let path = state.config.data_dir.join("attachments").join(&id);
                
                if let Err(e) = tokio::fs::create_dir_all(path.parent().unwrap()).await {
                    error!("Failed to create attachments directory: {}", e);
                    return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({
                        "success": false,
                        "error": e.to_string()
                    }))).into_response();
                }
                
                if let Err(e) = tokio::fs::write(&path, &data).await {
                    error!("Failed to write attachment: {}", e);
                    return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({
                        "success": false,
                        "error": e.to_string()
                    }))).into_response();
                }
                
                attachments.push(serde_json::json!({
                    "id": id,
                    "name": name,
                    "contentType": content_type,
                    "size": data.len()
                }));
            }
            Err(e) => {
                error!("Failed to read field: {}", e);
                return (StatusCode::BAD_REQUEST, Json(serde_json::json!({
                    "success": false,
                    "error": e.to_string()
                }))).into_response();
            }
        }
    }
    
    Json(serde_json::json!({
        "success": true,
        "data": attachments
    })).into_response()
}

/// Attachments get handler.
async fn attachments_get_handler(
    State(state): State<Arc<AppState>>,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> impl IntoResponse {
    let path = state.config.data_dir.join("attachments").join(&id);
    
    match tokio::fs::read(&path).await {
        Ok(data) => {
            axum::response::Response::builder()
                .header("Content-Type", "application/octet-stream")
                .body(axum::body::Body::from(data))
                .unwrap()
                .into_response()
        }
        Err(e) => {
            error!("Failed to read attachment {}: {}", id, e);
            (StatusCode::NOT_FOUND, Json(serde_json::json!({
                "success": false,
                "error": "Attachment not found"
            }))).into_response()
        }
    }
}

/// Terminal create handler.
async fn terminal_create_handler(
    State(state): State<Arc<AppState>>,
    Json(input): Json<remi_contracts::CreateTerminalInput>,
) -> impl IntoResponse {
    match state.terminal_manager.create(input).await {
        Ok(output) => Json(serde_json::json!({
            "success": true,
            "data": output
        })).into_response(),
        Err(e) => {
            error!("Terminal create failed: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({
                "success": false,
                "error": e.to_string()
            }))).into_response()
        }
    }
}

/// Terminal list handler.
async fn terminal_list_handler(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let sessions = state.terminal_manager.list_sessions().await;
    Json(serde_json::json!({
        "success": true,
        "data": sessions
    }))
}
