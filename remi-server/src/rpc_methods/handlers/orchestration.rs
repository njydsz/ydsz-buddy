//! 编排引擎 RPC 方法

use std::sync::Arc;

use remi_orchestration::{OrchestrationCommand, OrchestrationEngine, ProjectionSnapshotQuery};
use serde_json::Value;
use tracing::info;

use crate::error::ServerResult;
use crate::rpc::RpcRouter;
use crate::rpc_methods::registration::ServiceContainer;

/// 注册编排引擎相关 RPC 方法
pub async fn register_orchestration_methods(
    router: Arc<RpcRouter>,
    services: Arc<ServiceContainer>,
) {
    info!("注册编排引擎 RPC 方法...");

    // orchestration.dispatchCommand
    let engine = services.orchestration_engine.clone();
    router
        .register("orchestration.dispatchCommand", move |params| {
            let engine = engine.clone();
            async move {
                let params = params.ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing params".to_string())
                })?;

                let command: OrchestrationCommand = serde_json::from_value(params)
                    .map_err(|e| crate::error::ServerError::InvalidParams(e.to_string()))?;

                let sequence = engine.dispatch(command).await?;
                Ok(serde_json::json!({ "sequence": sequence }))
            }
        })
        .await;

    // orchestration.getSnapshot
    let query = services.projection_query.clone();
    router
        .register("orchestration.getSnapshot", move |_params| {
            let query = query.clone();
            async move {
                let snapshot = query.get_snapshot().await?;
                serde_json::to_value(snapshot)
                    .map_err(|e| crate::error::ServerError::InternalError(e.to_string()))
            }
        })
        .await;

    // orchestration.getShellSnapshot
    let query = services.projection_query.clone();
    router
        .register("orchestration.getShellSnapshot", move |_params| {
            let query = query.clone();
            async move {
                let snapshot = query.get_shell_snapshot().await?;
                serde_json::to_value(snapshot)
                    .map_err(|e| crate::error::ServerError::InternalError(e.to_string()))
            }
        })
        .await;

    // orchestration.getThreadDetail
    let query = services.projection_query.clone();
    router
        .register("orchestration.getThreadDetail", move |params| {
            let query = query.clone();
            async move {
                let params = params.ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing params".to_string())
                })?;

                let thread_id = params
                    .get("threadId")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing threadId".to_string())
                    })?;

                let thread = query.get_thread_detail(thread_id).await?;
                match thread {
                    Some(t) => serde_json::to_value(t)
                        .map_err(|e| crate::error::ServerError::InternalError(e.to_string())),
                    None => Ok(Value::Null),
                }
            }
        })
        .await;

    // orchestration.replayEvents
    let engine = services.orchestration_engine.clone();
    router
        .register("orchestration.replayEvents", move |params| {
            let engine = engine.clone();
            async move {
                let from_sequence = params
                    .and_then(|p| p.get("fromSequenceExclusive").and_then(|v| v.as_u64()))
                    .unwrap_or(0);

                let events = engine.read_events(from_sequence).await?;
                serde_json::to_value(events)
                    .map_err(|e| crate::error::ServerError::InternalError(e.to_string()))
            }
        })
        .await;

    // orchestration.repairState
    let engine = services.orchestration_engine.clone();
    router
        .register("orchestration.repairState", move |_params| {
            let engine = engine.clone();
            async move {
                engine.repair_state().await?;
                Ok(Value::Null)
            }
        })
        .await;

    info!("编排引擎 RPC 方法注册完成");
}
