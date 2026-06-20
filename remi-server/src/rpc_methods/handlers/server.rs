//! # 服务器管理 RPC 方法模块
//!
//! 本模块注册与服务器管理相关的 RPC 方法，包括配置更新、Provider 刷新和诊断信息查询等。
//!
//! ## 注册的方法
//!
//! | 方法名 | 说明 |
//! |--------|------|
//! | `server.updateSettings` | 更新服务器配置（待实现） |
//! | `server.refreshProviders` | 刷新 Provider 列表 |
//! | `server.getDiagnostics` | 获取服务器诊断信息（待实现） |

use std::sync::Arc;

use serde_json::Value;
use tracing::info;

use crate::rpc::RpcRouter;
use crate::rpc_methods::registration::ServiceContainer;

/// 注册服务器相关 RPC 方法
///
/// 将所有服务器管理方法注册到路由器，每个方法绑定对应的服务实例。
///
/// # 参数
///
/// - `router`: RPC 路由器实例
/// - `services`: 服务容器，提供各服务实例
pub async fn register_server_methods(
    router: Arc<RpcRouter>,
    services: Arc<ServiceContainer>,
) {
    info!("注册服务器 RPC 方法...");

    // server.getSettings
    let _workspace_filesystem = services.workspace_filesystem.clone();
    router
        .register("server.getSettings", move |_params: Option<Value>| {
            let _workspace_filesystem = _workspace_filesystem.clone();
            async move {
                // TODO: 实现配置读取逻辑
                // 目前返回默认配置，实际实现需要读取配置文件
                Ok(serde_json::json!({
                    "theme": "dark",
                    "language": "zh-CN",
                    "autoSave": true,
                    "fontSize": 14
                }))
            }
        })
        .await;

    // server.updateSettings - 更新服务器配置（待实现）
    // 参数: { ...配置项 }
    // 返回: null
    let _workspace_filesystem = services.workspace_filesystem.clone();
    router
        .register("server.updateSettings", move |params: Option<Value>| {
            let _workspace_filesystem = _workspace_filesystem.clone();
            async move {
                let params = params.ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing params".to_string())
                })?;

                // TODO: 实现配置更新逻辑
                // 目前返回成功，实际配置更新需要实现配置管理服务
                info!("更新配置: {:?}", params);
                Ok(Value::Null)
            }
        })
        .await;

    // server.refreshProviders - 刷新 Provider 列表
    // 参数: 无
    // 返回: null
    let provider_service = services.provider_service.clone();
    router
        .register("server.refreshProviders", move |_params: Option<Value>| {
            let provider_service = provider_service.clone();
            async move {
                provider_service.refresh_providers().await?;
                Ok(Value::Null)
            }
        })
        .await;

    // server.getDiagnostics - 获取服务器诊断信息（待实现）
    // 参数: 无
    // 返回: { status: string, errors: [], warnings: [] }
    let _orchestration_engine = services.orchestration_engine.clone();
    router
        .register("server.getDiagnostics", move |_params: Option<Value>| {
            let _orchestration_engine = _orchestration_engine.clone();
            async move {
                // TODO: 实现诊断信息收集
                // 返回空诊断信息，实际实现需要收集系统状态、错误统计等
                Ok(serde_json::json!({
                    "status": "ok",
                    "errors": [],
                    "warnings": []
                }))
            }
        })
        .await;

    info!("服务器 RPC 方法注册完成");
}
