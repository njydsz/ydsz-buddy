//! Remi Code 服务器 - 主入口点。
//!
//! 此二进制程序启动 Remi Code 的 HTTP/WebSocket 服务器。它使用
//! [`remi_server::routes`] 模块在一处挂载所有 HTTP 路由，
//! 并额外暴露 Tauri 桌面客户端使用的 WebSocket 端点。

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

/// 在处理器间共享的应用状态。
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
    // 初始化追踪
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "remi_server=info,tower_http=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    info!("正在启动 Remi Code 服务器");

    // 加载配置
    let config = ServerConfig::load().unwrap_or_else(|e| {
        error!("加载配置失败: {}", e);
        ServerConfig::default()
    });

    info!(
        "Configuration: host={}, port={}, db={}",
        config.host,
        config.port,
        config.db_path.display()
    );

    // 确保数据目录存在
    tokio::fs::create_dir_all(&config.data_dir).await?;

    // 初始化数据库
    let db = Arc::new(Database::connect(&config).await?);
    db.run_migrations().await?;
    info!("数据库已初始化");

    // 初始化认证服务
    let auth = Arc::new(AuthService::new(db.clone()));
    let secret_key: Vec<u8> = (0..32).map(|_| rand::random()).collect();
    auth.initialize(secret_key).await?;
    info!("认证服务已初始化");

    // 初始化 provider 注册表
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
        "提供商注册表已初始化（{} 个提供商）",
        provider_registry.list().len()
    );

    // 初始化编排引擎（已连接 reactor 扇出）
    let orchestration = Arc::new(OrchestrationEngine::with_default_reactors(
        db.clone(),
        provider_registry.clone(),
    ));
    let _reactor_handle = orchestration.spawn_reactor_loop();
    info!("编排引擎已启动，包含默认反应器集");

    // 初始化工作区服务
    let workspace = Arc::new(WorkspaceService::new(config.data_dir.join("workspace")));

    // 初始化终端管理器
    let terminal_manager = Arc::new(TerminalManager::new());

    // 初始化 WebSocket 状态
    let ws_state = Arc::new(WsState::new());

    // 初始化 RPC 状态
    let rpc_state = Arc::new(RpcState {
        orchestration: orchestration.clone(),
        workspace: workspace.clone(),
        provider_registry: provider_registry.clone(),
        auth: auth.clone(),
        terminal_manager: terminal_manager.clone(),
        ws_state: ws_state.clone(),
    });

    // 构建应用状态
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

    // 使用安全的 CORS 配置构建路由
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

    // 挂载完整路由表（50+ 端点）和 WebSocket
    let app = register_routes(server_state)
        .route("/", get(root_redirect))
        .merge(create_ws_router(rpc_state))
        .layer(cors);

    // 启动服务器
    let addr = format!("{}:{}", config.host, config.port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    info!(
        "服务器正在监听 {}（已注册 {} 条路由）",
        addr,
        remi_server::route_count()
    );

    axum::serve(listener, app).await?;

    Ok(())
}

/// 根路径：返回 200 OK 和小型 JSON 描述符，以便健康检查探针
/// 访问 `/`（而非 `/health`）时仍能获得有用响应。
async fn root_redirect() -> axum::response::Response {
    axum::Json(serde_json::json!({
        "name": "remi-code-server",
        "version": env!("CARGO_PKG_VERSION"),
        "health": "/health",
    }))
    .into_response()
}

// `IntoResponse` 位于 `axum::response`；在此重新导出，以便上述辅助函数
// 在导入重新定位到调用点时能够编译通过。
use axum::response::IntoResponse;
