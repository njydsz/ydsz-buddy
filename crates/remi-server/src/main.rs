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
        .route("/api/auth/session", get(auth_session_handler).with_state(state.clone()))
        .route("/api/auth/pairing-token", post(auth_pairing_token_handler).with_state(state.clone()))
        .route("/api/auth/ws-token", post(auth_ws_token_handler).with_state(state.clone()))
        .route("/api/auth/pairing-links", get(auth_pairing_links_handler).with_state(state.clone()))
        .route("/api/auth/pairing-links/revoke", post(auth_revoke_pairing_link_handler).with_state(state.clone()))
        .route("/api/auth/clients", get(auth_clients_handler).with_state(state.clone()))
        .route("/api/auth/clients/revoke", post(auth_revoke_client_handler).with_state(state.clone()))
        .route("/api/auth/clients/revoke-others", post(auth_revoke_other_clients_handler).with_state(state.clone()))
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

/// Auth session handler - get current session state.
async fn auth_session_handler(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
) -> impl IntoResponse {
    let token = extract_auth_token(&headers);
    match token {
        Some(t) => match state.auth.get_session_state(&t).await {
            Ok(session_state) => Json(session_state).into_response(),
            Err(e) => {
                error!("Auth session failed: {}", e);
                (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({
                    "authenticated": false,
                    "error": e.to_string()
                }))).into_response()
            }
        },
        None => Json(serde_json::json!({
            "authenticated": false
        })).into_response(),
    }
}

/// Auth pairing token handler - create pairing credential.
async fn auth_pairing_token_handler(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
    Json(input): Json<remi_contracts::AuthCreatePairingCredentialInput>,
) -> impl IntoResponse {
    // Verify owner session
    let token = extract_auth_token(&headers);
    match token {
        Some(t) => {
            match state.auth.verify_token(&t).await {
                Ok(true) => {
                    match state.auth.create_pairing_credential(input).await {
                        Ok(output) => Json(serde_json::json!({
                            "success": true,
                            "data": output
                        })).into_response(),
                        Err(e) => {
                            error!("Create pairing credential failed: {}", e);
                            (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({
                                "success": false,
                                "error": e.to_string()
                            }))).into_response()
                        }
                    }
                }
                Ok(false) => (StatusCode::UNAUTHORIZED, Json(serde_json::json!({
                    "success": false,
                    "error": "Invalid session"
                }))).into_response(),
                Err(e) => {
                    error!("Token verification failed: {}", e);
                    (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({
                        "success": false,
                        "error": e.to_string()
                    }))).into_response()
                }
            }
        }
        None => (StatusCode::UNAUTHORIZED, Json(serde_json::json!({
            "success": false,
            "error": "Missing authorization token"
        }))).into_response(),
    }
}

/// Auth WebSocket token handler - issue WS token.
async fn auth_ws_token_handler(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
) -> impl IntoResponse {
    let token = extract_auth_token(&headers);
    match token {
        Some(t) => match state.auth.issue_websocket_token(&t).await {
            Ok(ws_token) => Json(serde_json::json!({
                "success": true,
                "data": ws_token
            })).into_response(),
            Err(e) => {
                error!("Issue WS token failed: {}", e);
                (StatusCode::UNAUTHORIZED, Json(serde_json::json!({
                    "success": false,
                    "error": e.to_string()
                }))).into_response()
            }
        },
        None => (StatusCode::UNAUTHORIZED, Json(serde_json::json!({
            "success": false,
            "error": "Missing authorization token"
        }))).into_response(),
    }
}

/// Auth pairing links handler - list active pairing links.
async fn auth_pairing_links_handler(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
) -> impl IntoResponse {
    let token = extract_auth_token(&headers);
    match token {
        Some(t) => {
            match state.auth.verify_token(&t).await {
                Ok(true) => {
                    match state.auth.list_pairing_links().await {
                        Ok(links) => Json(serde_json::json!({
                            "success": true,
                            "data": links
                        })).into_response(),
                        Err(e) => {
                            error!("List pairing links failed: {}", e);
                            (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({
                                "success": false,
                                "error": e.to_string()
                            }))).into_response()
                        }
                    }
                }
                Ok(false) => (StatusCode::UNAUTHORIZED, Json(serde_json::json!({
                    "success": false,
                    "error": "Invalid session"
                }))).into_response(),
                Err(e) => {
                    error!("Token verification failed: {}", e);
                    (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({
                        "success": false,
                        "error": e.to_string()
                    }))).into_response()
                }
            }
        }
        None => (StatusCode::UNAUTHORIZED, Json(serde_json::json!({
            "success": false,
            "error": "Missing authorization token"
        }))).into_response(),
    }
}

/// Auth revoke pairing link handler.
async fn auth_revoke_pairing_link_handler(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
    Json(input): Json<remi_contracts::AuthRevokePairingLinkInput>,
) -> impl IntoResponse {
    let token = extract_auth_token(&headers);
    match token {
        Some(t) => {
            match state.auth.verify_token(&t).await {
                Ok(true) => {
                    match state.auth.revoke_pairing_link(&input.code).await {
                        Ok(_) => Json(serde_json::json!({
                            "success": true,
                            "revoked": true
                        })).into_response(),
                        Err(e) => {
                            error!("Revoke pairing link failed: {}", e);
                            (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({
                                "success": false,
                                "error": e.to_string()
                            }))).into_response()
                        }
                    }
                }
                Ok(false) => (StatusCode::UNAUTHORIZED, Json(serde_json::json!({
                    "success": false,
                    "error": "Invalid session"
                }))).into_response(),
                Err(e) => {
                    error!("Token verification failed: {}", e);
                    (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({
                        "success": false,
                        "error": e.to_string()
                    }))).into_response()
                }
            }
        }
        None => (StatusCode::UNAUTHORIZED, Json(serde_json::json!({
            "success": false,
            "error": "Missing authorization token"
        }))).into_response(),
    }
}

/// Auth clients handler - list client sessions.
async fn auth_clients_handler(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
) -> impl IntoResponse {
    let token = extract_auth_token(&headers);
    match token {
        Some(t) => {
            match state.auth.verify_token(&t).await {
                Ok(true) => {
                    match state.auth.list_client_sessions(None).await {
                        Ok(clients) => Json(serde_json::json!({
                            "success": true,
                            "data": clients
                        })).into_response(),
                        Err(e) => {
                            error!("List client sessions failed: {}", e);
                            (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({
                                "success": false,
                                "error": e.to_string()
                            }))).into_response()
                        }
                    }
                }
                Ok(false) => (StatusCode::UNAUTHORIZED, Json(serde_json::json!({
                    "success": false,
                    "error": "Invalid session"
                }))).into_response(),
                Err(e) => {
                    error!("Token verification failed: {}", e);
                    (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({
                        "success": false,
                        "error": e.to_string()
                    }))).into_response()
                }
            }
        }
        None => (StatusCode::UNAUTHORIZED, Json(serde_json::json!({
            "success": false,
            "error": "Missing authorization token"
        }))).into_response(),
    }
}

/// Auth revoke client handler.
async fn auth_revoke_client_handler(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
    Json(input): Json<remi_contracts::AuthRevokeClientSessionInput>,
) -> impl IntoResponse {
    let token = extract_auth_token(&headers);
    match token {
        Some(t) => {
            match state.auth.verify_token(&t).await {
                Ok(true) => {
                    match state.auth.revoke_client_session(&input.token).await {
                        Ok(_) => Json(serde_json::json!({
                            "success": true,
                            "revoked": true
                        })).into_response(),
                        Err(e) => {
                            error!("Revoke client session failed: {}", e);
                            (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({
                                "success": false,
                                "error": e.to_string()
                            }))).into_response()
                        }
                    }
                }
                Ok(false) => (StatusCode::UNAUTHORIZED, Json(serde_json::json!({
                    "success": false,
                    "error": "Invalid session"
                }))).into_response(),
                Err(e) => {
                    error!("Token verification failed: {}", e);
                    (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({
                        "success": false,
                        "error": e.to_string()
                    }))).into_response()
                }
            }
        }
        None => (StatusCode::UNAUTHORIZED, Json(serde_json::json!({
            "success": false,
            "error": "Missing authorization token"
        }))).into_response(),
    }
}

/// Auth revoke other clients handler.
async fn auth_revoke_other_clients_handler(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
) -> impl IntoResponse {
    let token = extract_auth_token(&headers);
    match token {
        Some(t) => {
            // First get the session ID for the current token
            match state.auth.get_session_state(&t).await {
                Ok(session) => {
                    if let Some(session_id) = session.get("sessionId").and_then(|v| v.as_str()) {
                        match state.auth.revoke_other_client_sessions(session_id).await {
                            Ok(count) => Json(serde_json::json!({
                                "success": true,
                                "revokedCount": count
                            })).into_response(),
                            Err(e) => {
                                error!("Revoke other client sessions failed: {}", e);
                                (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({
                                    "success": false,
                                    "error": e.to_string()
                                }))).into_response()
                            }
                        }
                    } else {
                        (StatusCode::UNAUTHORIZED, Json(serde_json::json!({
                            "success": false,
                            "error": "Invalid session"
                        }))).into_response()
                    }
                }
                Err(e) => {
                    error!("Get session state failed: {}", e);
                    (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({
                        "success": false,
                        "error": e.to_string()
                    }))).into_response()
                }
            }
        }
        None => (StatusCode::UNAUTHORIZED, Json(serde_json::json!({
            "success": false,
            "error": "Missing authorization token"
        }))).into_response(),
    }
}

/// Extract authorization token from headers.
fn extract_auth_token(headers: &axum::http::HeaderMap) -> Option<String> {
    headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| {
            if v.starts_with("Bearer ") {
                Some(v[7..].to_string())
            } else {
                Some(v.to_string())
            }
        })
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
