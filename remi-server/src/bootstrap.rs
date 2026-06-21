//! # 服务引导模块
//!
//! 本模块提供统一的服务容器构造和启动逻辑，供 remi-cli 和 Tauri 端共享使用。
//!
//! ## 核心职责
//!
//! 1. **服务容器构造**：按依赖顺序创建所有业务服务实例
//! 2. **Reactor 启动**：启动 ProviderCommandReactor、CheckpointReactor、ThreadDeletionReactor
//! 3. **RPC 方法注册**：将所有 RPC 方法注册到路由器
//! 4. **WebSocket 服务器启动**：绑定地址并启动监听
//!
//! ## 使用场景
//!
//! - `remi-cli`：通过 `bootstrap()` 启动独立服务器
//! - `remi-app` (Tauri)：通过 `bootstrap_embedded()` 启动嵌入式服务器

use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use anyhow::Result;
use tokio::sync::broadcast;
use tracing::{info, warn};

use remi_auth::{AuthService, SecretStore, SessionCredentialService};
use remi_checkpoint::CheckpointStore;
use remi_config::ServerConfig;
use remi_git::{GitCore, GitManager, GitStatusBroadcaster};
use remi_orchestration::{
    CheckpointReactor, OrchestrationEngine, OrchestrationResult,
    ProjectionSnapshotQuery, ProviderCommandReactor, ThreadDeletionReactor,
};
use remi_persistence::{
    run_migrations, SqliteCheckpointStore, SqliteClient, SqliteEventStore,
    SqlitePairingLinkStore, SqliteProjectionRepository,
};
use remi_provider::ProviderService;
use remi_telemetry::{AnalyticsService, MetricsCollector};
use remi_terminal::TerminalManager;
use remi_workspace::{WorkspaceEntries, WorkspaceFileSystem};

use crate::push_channels::PushChannelManager;
use crate::rpc::RpcRouter;
use crate::rpc_methods::{register_all_methods, ServiceContainer};
use crate::server::WebSocketServer;

/// Reactor 任务句柄集合
pub struct ReactorHandles {
    /// Provider 命令反应器句柄
    pub provider_reactor: tokio::task::JoinHandle<OrchestrationResult<()>>,
    /// 检查点反应器句柄
    pub checkpoint_reactor: tokio::task::JoinHandle<OrchestrationResult<()>>,
    /// 线程删除反应器句柄
    pub thread_deletion_reactor: tokio::task::JoinHandle<OrchestrationResult<()>>,
    /// 关闭信号发送端
    pub shutdown_tx: broadcast::Sender<()>,
}

/// 引导结果
pub struct BootstrapResult {
    /// 服务容器
    pub services: Arc<ServiceContainer>,
    /// RPC 路由器
    pub rpc_router: Arc<RpcRouter>,
    /// Reactor 任务句柄
    pub reactor_handles: ReactorHandles,
    /// 服务器地址（嵌入式模式下由 OS 分配）
    pub server_addr: SocketAddr,
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
async fn build_service_container(
    sqlite_client: SqliteClient,
    config: &ServerConfig,
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

    // ===== 推送通道层 =====
    let push_channel_manager = Arc::new(PushChannelManager::new().await);

    // ===== 遥测层 =====
    let analytics_service = Arc::new(AnalyticsService::new());
    let metrics_collector = Arc::new(MetricsCollector::new());

    info!("服务容器初始化完成");

    // 共享 ServerConfig 供 ServiceContainer 的 config 字段使用
    let services_config = Arc::new(config.clone());

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
        analytics_service,
        metrics_collector,
        push_channel_manager,
        config: services_config,
    })
}

/// 启动所有 Reactor
///
/// 启动以下反应器：
/// - ProviderCommandReactor：监听 Turn 启动/中断事件，调用 Provider
/// - CheckpointReactor：监听检查点回滚请求，创建检查点
/// - ThreadDeletionReactor：监听线程删除事件，清理资源
fn start_reactors(
    services: Arc<ServiceContainer>,
    shutdown_tx: broadcast::Sender<()>,
) -> ReactorHandles {
    info!("启动 Reactor...");

    // 启动 ProviderCommandReactor
    let provider_reactor = ProviderCommandReactor::new(
        services.orchestration_engine.clone(),
        services.provider_service.clone(),
        services.projection_query.clone(),
    );
    let provider_shutdown = shutdown_tx.subscribe();
    let provider_handle = tokio::spawn(async move {
        provider_reactor.run(provider_shutdown).await
    });

    // 启动 CheckpointReactor
    let checkpoint_reactor = CheckpointReactor::new(
        services.orchestration_engine.clone(),
        services.checkpoint_store.clone(),
    );
    let checkpoint_shutdown = shutdown_tx.subscribe();
    let checkpoint_handle = tokio::spawn(async move {
        checkpoint_reactor.run(checkpoint_shutdown).await
    });

    // 启动 ThreadDeletionReactor
    let thread_deletion_reactor = ThreadDeletionReactor::new(
        services.orchestration_engine.clone(),
        services.provider_service.clone(),
        services.checkpoint_store.clone(),
        services.projection_query.clone(),
    );
    let deletion_shutdown = shutdown_tx.subscribe();
    let deletion_handle = tokio::spawn(async move {
        thread_deletion_reactor.run(deletion_shutdown).await
    });

    info!("Reactor 启动完成");

    ReactorHandles {
        provider_reactor: provider_handle,
        checkpoint_reactor: checkpoint_handle,
        thread_deletion_reactor: deletion_handle,
        shutdown_tx,
    }
}

/// 独立服务器引导（供 remi-cli 使用）
///
/// 执行流程：
/// 1. 初始化持久化层（确保目录存在、运行迁移）
/// 2. 构建服务容器
/// 3. 启动所有 Reactor
/// 4. 注册 RPC 方法
/// 5. 启动 WebSocket 服务器
///
/// # 参数
///
/// - `config`: 服务器配置
///
/// # 返回值
///
/// 返回引导结果，包含服务容器、RPC 路由器、Reactor 句柄和服务器地址
pub async fn bootstrap(config: &ServerConfig) -> Result<BootstrapResult> {
    info!("开始独立服务器引导");

    // 1. 初始化持久化层
    if let Some(parent) = config.db_path.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    if let Some(parent) = config.secrets_dir.parent() {
        std::fs::create_dir_all(parent).ok();
    }

    let sqlite_client = SqliteClient::new(&config.db_path)?;
    run_migrations(&sqlite_client)?;
    info!("数据库初始化完成: {}", config.db_path.display());

    // 2. 构建服务容器
    let services = Arc::new(build_service_container(sqlite_client, config).await?);

    // 3. 启动 Reactor
    let (shutdown_tx, _) = broadcast::channel::<()>(1);
    let reactor_handles = start_reactors(services.clone(), shutdown_tx.clone());

    // 4. 注册 RPC 方法
    let rpc_router = Arc::new(RpcRouter::new());
    register_all_methods(rpc_router.clone(), services.clone()).await;
    info!("RPC 方法注册完成");

    // 5. 构建服务器地址
    let host = config.host.clone().unwrap_or_else(|| "127.0.0.1".to_string());
    let server_addr: SocketAddr = format!("{}:{}", host, config.port)
        .parse()
        .expect("Invalid server address");

    Ok(BootstrapResult {
        services,
        rpc_router,
        reactor_handles,
        server_addr,
    })
}

/// 嵌入式服务器引导（供 Tauri 使用）
///
/// 与 `bootstrap()` 类似，但使用 OS 分配的随机端口（127.0.0.1:0）
///
/// # 参数
///
/// - `config`: 服务器配置（端口字段会被忽略）
///
/// # 返回值
///
/// 返回引导结果，包含服务容器、RPC 路由器、Reactor 句柄和实际分配的服务器地址
pub async fn bootstrap_embedded(config: &ServerConfig) -> Result<BootstrapResult> {
    info!("开始嵌入式服务器引导");

    // 1. 初始化持久化层
    if let Some(parent) = config.db_path.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    if let Some(parent) = config.secrets_dir.parent() {
        std::fs::create_dir_all(parent).ok();
    }

    let sqlite_client = SqliteClient::new(&config.db_path)?;
    run_migrations(&sqlite_client)?;
    info!("数据库初始化完成: {}", config.db_path.display());

    // 2. 构建服务容器
    let services = Arc::new(build_service_container(sqlite_client, config).await?);

    // 3. 启动 Reactor
    let (shutdown_tx, _) = broadcast::channel::<()>(1);
    let reactor_handles = start_reactors(services.clone(), shutdown_tx.clone());

    // 4. 注册 RPC 方法
    let rpc_router = Arc::new(RpcRouter::new());
    register_all_methods(rpc_router.clone(), services.clone()).await;
    info!("RPC 方法注册完成");

    // 5. 使用 OS 分配的随机端口
    let server_addr: SocketAddr = "127.0.0.1:0".parse().unwrap();

    Ok(BootstrapResult {
        services,
        rpc_router,
        reactor_handles,
        server_addr,
    })
}

/// 启动 WebSocket 服务器
///
/// 阻塞直到服务器关闭。当 `addr` 端口为 `0` 时，会使用操作系统分配的随机端口。
pub async fn start_server(
    addr: SocketAddr,
    rpc_router: Arc<RpcRouter>,
    config: Arc<ServerConfig>,
) -> Result<()> {
    let server = WebSocketServer::new(addr, rpc_router, config);
    let (actual_addr, serve) = server.start().await?;
    info!("WebSocket 服务器已启动，监听地址: {}", actual_addr);
    serve.await.map_err(anyhow::Error::from)
}

/// 关闭所有 Reactor
///
/// 发送关闭信号并等待所有 Reactor 任务完成
pub async fn shutdown_reactors(handles: ReactorHandles) {
    info!("开始关闭 Reactor...");

    // 发送关闭信号
    let _ = handles.shutdown_tx.send(());

    // 等待所有 Reactor 完成
    if let Err(e) = handles.provider_reactor.await {
        warn!("ProviderCommandReactor 关闭异常: {}", e);
    }
    if let Err(e) = handles.checkpoint_reactor.await {
        warn!("CheckpointReactor 关闭异常: {}", e);
    }
    if let Err(e) = handles.thread_deletion_reactor.await {
        warn!("ThreadDeletionReactor 关闭异常: {}", e);
    }

    info!("Reactor 已关闭");
}
