//! RPC 方法注册器

use std::sync::Arc;

use remi_auth::AuthService;
use remi_checkpoint::CheckpointStore;
use remi_git::{GitCore, GitManager, GitStatusBroadcaster};
use remi_orchestration::{OrchestrationEngine, ProjectionSnapshotQuery};
use remi_provider::ProviderService;
use remi_telemetry::{AnalyticsService, MetricsCollector};
use remi_terminal::TerminalManager;
use remi_workspace::{WorkspaceEntries, WorkspaceFileSystem};
use tracing::info;

use crate::rpc::RpcRouter;
use super::handlers::{
    register_orchestration_methods, register_provider_methods, register_git_methods,
    register_terminal_methods, register_workspace_methods, register_auth_methods,
    register_checkpoint_methods, register_server_methods, register_telemetry_methods,
};

/// 服务容器
pub struct ServiceContainer {
    /// 编排引擎
    pub orchestration_engine: Arc<OrchestrationEngine>,
    /// 投影快照查询
    pub projection_query: Arc<ProjectionSnapshotQuery>,
    /// Provider 服务
    pub provider_service: Arc<ProviderService>,
    /// Git 核心
    pub git_core: Arc<GitCore>,
    /// Git 管理器
    pub git_manager: Arc<GitManager>,
    /// Git 状态广播器
    pub git_status_broadcaster: Arc<GitStatusBroadcaster>,
    /// 终端管理器
    pub terminal_manager: Arc<TerminalManager>,
    /// 工作空间文件系统
    pub workspace_filesystem: Arc<WorkspaceFileSystem>,
    /// 工作空间条目
    pub workspace_entries: Arc<WorkspaceEntries>,
    /// 认证服务
    pub auth_service: Arc<AuthService>,
    /// 检查点存储
    pub checkpoint_store: Arc<CheckpointStore>,
    /// 分析服务
    pub analytics_service: Arc<AnalyticsService>,
    /// 指标收集器
    pub metrics_collector: Arc<MetricsCollector>,
}

/// 注册所有 RPC 方法
pub async fn register_all_methods(
    router: Arc<RpcRouter>,
    services: Arc<ServiceContainer>,
) {
    info!("开始注册 RPC 方法...");

    // 编排引擎方法
    register_orchestration_methods(router.clone(), services.clone()).await;

    // Provider 方法
    register_provider_methods(router.clone(), services.clone()).await;

    // Git 方法
    register_git_methods(router.clone(), services.clone()).await;

    // 终端方法
    register_terminal_methods(router.clone(), services.clone()).await;

    // 工作空间方法
    register_workspace_methods(router.clone(), services.clone()).await;

    // 认证方法
    register_auth_methods(router.clone(), services.clone()).await;

    // 检查点方法
    register_checkpoint_methods(router.clone(), services.clone()).await;

    // 服务器方法
    register_server_methods(router.clone(), services.clone()).await;

    // 遥测方法
    register_telemetry_methods(router, services).await;

    info!("RPC 方法注册完成");
}
