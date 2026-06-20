//! Server RPC 方法

use std::sync::Arc;

use serde_json::Value;
use tracing::info;

use crate::rpc::RpcRouter;
use crate::rpc_methods::registration::ServiceContainer;

/// 注册服务器相关 RPC 方法
pub async fn register_server_methods(
    router: Arc<RpcRouter>,
    services: Arc<ServiceContainer>,
) {
    info!("注册服务器 RPC 方法...");

    // server.updateSettings
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

    // server.refreshProviders
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

    // server.getDiagnostics
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
