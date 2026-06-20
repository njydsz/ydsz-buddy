//! # Remi CLI - 命令行入口模块
//!
//! 本模块是 Remi Code 服务器的命令行入口，负责整个应用程序的启动引导流程。
//!
//! ## 核心职责
//!
//! 1. **日志初始化**：基于 `tracing` 生态构建结构化日志系统
//! 2. **命令行参数解析**：使用 `clap` 派生宏解析 CLI 参数
//! 3. **配置加载与校验**：合并 CLI 参数与环境变量生成运行时配置
//! 4. **服务容器初始化**：创建所有业务服务实例并组装为 `ServiceContainer`
//! 5. **RPC 方法注册**：将所有 RPC 方法注册到路由器
//! 6. **WebSocket 服务器启动**：绑定地址并启动监听

use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use anyhow::Result;
use clap::Parser;
use remi_auth::{AuthService, SecretStore, SessionCredentialService};
use remi_checkpoint::CheckpointStore;
use remi_config::CliArgs;
use remi_git::{GitCore, GitManager, GitStatusBroadcaster};
use remi_orchestration::{OrchestrationEngine, ProjectionSnapshotQuery};
use remi_persistence::{
    run_migrations, SqliteCheckpointStore, SqliteClient, SqliteEventStore,
    SqlitePairingLinkStore, SqliteProjectionRepository,
};
use remi_provider::ProviderService;
use remi_server::{register_all_methods, RpcRouter, ServiceContainer, WebSocketServer};
use remi_terminal::TerminalManager;
use remi_workspace::{WorkspaceEntries, WorkspaceFileSystem};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

/// # 程序主入口函数
///
/// 执行流程：初始化日志 → 解析 CLI 参数 → 加载配置 → 初始化服务容器 → 注册 RPC 方法 → 启动服务器
#[tokio::main]
async fn main() -> Result<()> {
    // 1. 初始化日志系统
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    tracing::info!("启动 Remi Code 服务器");

    // 2. 解析 CLI 参数并加载配置
    let args = CliArgs::parse();
    let config = remi_config::ServerConfig::from_args_and_env(args)?;
    config.validate()?;

    tracing::info!(port = config.port, "配置加载完成");

    // 3. 初始化持久化层
    // 确保状态目录存在
    if let Some(parent) = config.db_path.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    if let Some(parent) = config.secrets_dir.parent() {
        std::fs::create_dir_all(parent).ok();
    }

    let sqlite_client = SqliteClient::new(&config.db_path)?;
    run_migrations(&sqlite_client)?;

    tracing::info!("数据库初始化完成: {}", config.db_path.display());

    // 4. 创建服务容器
    let services = Arc::new(build_service_container(sqlite_client, &config)?);

    // 5. 创建 RPC 路由器并注册所有方法
    let rpc_router = Arc::new(RpcRouter::new());
    register_all_methods(rpc_router.clone(), services.clone()).await;

    tracing::info!("RPC 方法注册完成");

    // 6. 构建服务器地址并启动
    let host = config.host.unwrap_or_else(|| "127.0.0.1".to_string());
    let addr: SocketAddr = format!("{}:{}", host, config.port)
        .parse()
        .expect("Invalid server address");

    let server = WebSocketServer::new(addr, rpc_router);

    tracing::info!("WebSocket 服务器启动中: {}", addr);

    if let Err(e) = server.start().await {
        tracing::error!("服务器启动失败: {}", e);
        return Err(e.into());
    }

    Ok(())
}

/// 构建服务容器，组装所有业务服务实例
///
/// 按依赖顺序创建各模块的服务实例：
/// 1. 持久化层（EventStore、ProjectionRepository、CheckpointStore、PairingLinkStore）
/// 2. 编排层（OrchestrationEngine、ProjectionSnapshotQuery）
/// 3. Provider 层（ProviderService）
/// 4. Git 层（GitCore、GitManager、GitStatusBroadcaster）
/// 5. 终端层（TerminalManager）
/// 6. 工作空间层（WorkspaceEntries、WorkspaceFileSystem）
/// 7. 认证层（SecretStore、SessionCredentialService、AuthService）
/// 8. 检查点层（CheckpointStore）
fn build_service_container(
    sqlite_client: SqliteClient,
    config: &remi_config::ServerConfig,
) -> Result<ServiceContainer> {
    // ===== 持久化层 =====
    let event_store = Arc::new(SqliteEventStore::new(sqlite_client.clone()));
    let projection_repo = Arc::new(SqliteProjectionRepository::new(sqlite_client.clone()));
    let sqlite_checkpoint_store = Arc::new(SqliteCheckpointStore::new(sqlite_client.clone()));
    let pairing_link_store = Arc::new(SqlitePairingLinkStore::new(sqlite_client));

    // ===== 编排层 =====
    let orchestration_engine = Arc::new(OrchestrationEngine::new(
        event_store.clone(),
        projection_repo.clone(),
    ));
    let projection_query = Arc::new(ProjectionSnapshotQuery::new(projection_repo.clone()));

    // ===== Provider 层 =====
    let provider_service = Arc::new(ProviderService::new());

    // ===== Git 层 =====
    let git_core = Arc::new(GitCore::new());
    let git_manager = Arc::new(GitManager::new(git_core.clone()));
    let git_status_broadcaster = Arc::new(GitStatusBroadcaster::new(
        git_core.clone(),
        Duration::from_secs(30),
    ));

    // ===== 终端层 =====
    let terminal_manager = Arc::new(TerminalManager::new());

    // ===== 工作空间层 =====
    let workspace_entries = Arc::new(WorkspaceEntries::new());
    let workspace_filesystem = Arc::new(WorkspaceFileSystem::new());

    // ===== 认证层 =====
    let secret_store = Arc::new(SecretStore::new(Some(config.secrets_dir.clone())));
    let credential_service = Arc::new(SessionCredentialService::new(secret_store));
    let auth_service = Arc::new(AuthService::with_pairing_store(
        credential_service,
        pairing_link_store,
    ));

    // ===== 检查点层 =====
    let checkpoint_store = Arc::new(CheckpointStore::new(
        git_core.clone(),
        sqlite_checkpoint_store,
    ));

    tracing::info!("服务容器初始化完成");

    Ok(ServiceContainer {
        orchestration_engine,
        projection_query,
        provider_service,
        git_core,
        git_manager,
        git_status_broadcaster,
        terminal_manager,
        workspace_filesystem,
        workspace_entries,
        auth_service,
        checkpoint_store,
    })
}
