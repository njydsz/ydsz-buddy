//! # 编排引擎 RPC 方法模块
//!
//! 本模块注册所有与编排引擎相关的 RPC 方法，包括命令分发、快照查询、
//! 线程/项目详情查询、事件回放和状态修复等。
//!
//! ## 注册的方法
//!
//! | 方法名 | 说明 |
//! |--------|------|
//! | `orchestration.dispatchCommand` | 分发编排命令，返回事件序列号 |
//! | `orchestration.getSnapshot` | 获取当前投影快照 |
//! | `orchestration.getShellSnapshot` | 获取 Shell 投影快照 |
//! | `orchestration.getThreadDetail` | 获取指定线程的详情 |
//! | `orchestration.getProjectDetail` | 获取指定项目的详情 |
//! | `orchestration.getCounts` | 获取线程和项目的计数统计 |
//! | `orchestration.replayEvents` | 回放指定范围的事件 |
//! | `orchestration.repairState` | 修复投影状态（待实现） |

use std::sync::Arc;

use remi_core::commands::OrchestrationCommand;
use remi_core::models::{ProjectId, ThreadId};
use serde_json::Value;
use tracing::info;

use crate::rpc::RpcRouter;
use crate::rpc_methods::registration::ServiceContainer;

/// 注册编排引擎相关 RPC 方法
///
/// 将所有编排引擎方法注册到路由器，每个方法绑定对应的服务实例。
///
/// # 参数
///
/// - `router`: RPC 路由器实例
/// - `services`: 服务容器，提供编排引擎和投影查询服务
pub async fn register_orchestration_methods(
    router: Arc<RpcRouter>,
    services: Arc<ServiceContainer>,
) {
    info!("注册编排引擎 RPC 方法...");

    // orchestration.dispatchCommand - 分发编排命令到引擎，返回事件序列号
    // 参数: { command: OrchestrationCommand }
    // 返回: { sequence: u64 }
    let engine = services.orchestration_engine.clone();
    router
        .register("orchestration.dispatchCommand", move |params: Option<Value>| {
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

    // orchestration.getSnapshot - 获取当前投影快照
    // 参数: 无
    // 返回: ProjectionSnapshot
    let query = services.projection_query.clone();
    router
        .register("orchestration.getSnapshot", move |_params: Option<Value>| {
            let query = query.clone();
            async move {
                let snapshot = query.get_snapshot().await?;
                serde_json::to_value(snapshot)
                    .map_err(|e| crate::error::ServerError::InternalError(e.to_string()))
            }
        })
        .await;

    // orchestration.getShellSnapshot - 获取 Shell 投影快照
    // 参数: 无
    // 返回: ShellSnapshot
    let query = services.projection_query.clone();
    router
        .register("orchestration.getShellSnapshot", move |_params: Option<Value>| {
            let query = query.clone();
            async move {
                let snapshot = query.get_shell_snapshot().await?;
                serde_json::to_value(snapshot)
                    .map_err(|e| crate::error::ServerError::InternalError(e.to_string()))
            }
        })
        .await;

    // orchestration.getThreadDetail - 获取指定线程的详情
    // 参数: { threadId: string }
    // 返回: ThreadDetail | null
    let query = services.projection_query.clone();
    router
        .register("orchestration.getThreadDetail", move |params: Option<Value>| {
            let query = query.clone();
            async move {
                let params = params.ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing params".to_string())
                })?;

                let thread_id_str = params
                    .get("threadId")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing threadId".to_string())
                    })?;

                let thread_id: ThreadId = thread_id_str
                    .parse()
                    .map_err(|e| crate::error::ServerError::InvalidParams(format!("Invalid threadId: {}", e)))?;

                let thread = query.get_thread_detail(thread_id).await?;
                match thread {
                    Some(t) => serde_json::to_value(t)
                        .map_err(|e| crate::error::ServerError::InternalError(e.to_string())),
                    None => Ok(Value::Null),
                }
            }
        })
        .await;

    // orchestration.getProjectDetail - 获取指定项目的详情
    // 参数: { projectId: string }
    // 返回: ProjectDetail | null
    let query = services.projection_query.clone();
    router
        .register("orchestration.getProjectDetail", move |params: Option<Value>| {
            let query = query.clone();
            async move {
                let params = params.ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing params".to_string())
                })?;

                let project_id_str = params
                    .get("projectId")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing projectId".to_string())
                    })?;

                let project_id: ProjectId = project_id_str
                    .parse()
                    .map_err(|e| crate::error::ServerError::InvalidParams(format!("Invalid projectId: {}", e)))?;

                let project = query.get_project_detail(project_id).await?;
                match project {
                    Some(p) => serde_json::to_value(p)
                        .map_err(|e| crate::error::ServerError::InternalError(e.to_string())),
                    None => Ok(Value::Null),
                }
            }
        })
        .await;

    // orchestration.getCounts - 获取线程和项目的计数统计
    // 参数: 无
    // 返回: Counts
    let query = services.projection_query.clone();
    router
        .register("orchestration.getCounts", move |_params: Option<Value>| {
            let query = query.clone();
            async move {
                let counts = query.get_counts().await?;
                serde_json::to_value(counts)
                    .map_err(|e| crate::error::ServerError::InternalError(e.to_string()))
            }
        })
        .await;

    // orchestration.replayEvents - 回放指定范围的事件
    // 参数: { fromSequenceExclusive?: number, limit?: number }
    // 返回: Event[]
    let engine = services.orchestration_engine.clone();
    router
        .register("orchestration.replayEvents", move |params: Option<Value>| {
            let engine = engine.clone();
            async move {
                let from_sequence = params
                    .as_ref()
                    .and_then(|p| p.get("fromSequenceExclusive").and_then(|v| v.as_u64()))
                    .unwrap_or(0);

                let limit = params
                    .as_ref()
                    .and_then(|p| p.get("limit").and_then(|v| v.as_u64()))
                    .map(|l| l as usize)
                    .unwrap_or(1000);

                let events = engine.read_events(from_sequence, limit).await?;
                serde_json::to_value(events)
                    .map_err(|e| crate::error::ServerError::InternalError(e.to_string()))
            }
        })
        .await;

    // orchestration.repairState - 修复投影状态（待实现）
    // 参数: 无
    // 返回: null（当前为占位实现）
    let _engine = services.orchestration_engine.clone();
    router
        .register("orchestration.repairState", move |_params: Option<Value>| {
            async move {
                // TODO: OrchestrationEngine 当前没有 repair_state 方法，待实现后补充
                Ok(Value::Null)
            }
        })
        .await;

    info!("编排引擎 RPC 方法注册完成");
}
