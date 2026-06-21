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

use remi_checkpoint::CheckpointDiffQuery;

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

    // orchestration.repairState - 修复投影状态
    // 参数: 无
    // 返回: { repairedEvents: number }
    let engine = services.orchestration_engine.clone();
    router
        .register("orchestration.repairState", move |_params: Option<Value>| {
            let engine = engine.clone();
            async move {
                let repaired_events = engine.repair_state().await?;
                Ok(serde_json::json!({ "repairedEvents": repaired_events }))
            }
        })
        .await;

    // orchestration.getProposedPlan - 获取线程的提议计划
    // 参数: { threadId: string }
    // 返回: ProposedPlan | null
    let query = services.projection_query.clone();
    router
        .register("orchestration.getProposedPlan", move |params: Option<Value>| {
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
                let plan = thread
                    .and_then(|t| t.proposed_plans.into_iter().next());
                match plan {
                    Some(p) => serde_json::to_value(p)
                        .map_err(|e| crate::error::ServerError::InternalError(e.to_string())),
                    None => Ok(Value::Null),
                }
            }
        })
        .await;

    // orchestration.getTurnDiff - 获取指定轮次的代码变更差异
    // 参数: { threadId: string, turnId: string }
    // 返回: TurnDiff | null
    let diff_query = services.checkpoint_diff_query.clone();
    router
        .register("orchestration.getTurnDiff", move |params: Option<Value>| {
            let diff_query = diff_query.clone();
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

                let turn_id = params
                    .get("turnId")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing turnId".to_string())
                    })?
                    .to_string();

                let thread_id: ThreadId = thread_id_str
                    .parse()
                    .map_err(|e| crate::error::ServerError::InvalidParams(format!("Invalid threadId: {}", e)))?;

                let turn_diff = diff_query.get_turn_diff(thread_id, turn_id).await
                    .map_err(|e| crate::error::ServerError::InternalError(e.to_string()))?;

                match turn_diff {
                    Some(td) => serde_json::to_value(td)
                        .map_err(|e| crate::error::ServerError::InternalError(e.to_string())),
                    None => Ok(Value::Null),
                }
            }
        })
        .await;

    // orchestration.getFullThreadDiff - 获取完整线程的代码变更差异
    // 参数: { threadId: string }
    // 返回: FullThreadDiff
    let diff_query = services.checkpoint_diff_query.clone();
    router
        .register("orchestration.getFullThreadDiff", move |params: Option<Value>| {
            let diff_query = diff_query.clone();
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

                let full_diff = diff_query.get_full_thread_diff(thread_id).await
                    .map_err(|e| crate::error::ServerError::InternalError(e.to_string()))?;

                serde_json::to_value(full_diff)
                    .map_err(|e| crate::error::ServerError::InternalError(e.to_string()))
            }
        })
        .await;

    // orchestration.importThread - 导入外部 Provider 线程
    // 参数: { threadId: string, externalId: string, providerName: string, cwd: string }
    // 返回: null
    let engine = services.orchestration_engine.clone();
    let provider_service = services.provider_service.clone();
    let query = services.projection_query.clone();
    router
        .register("orchestration.importThread", move |params: Option<Value>| {
            let engine = engine.clone();
            let provider_service = provider_service.clone();
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

                let _external_id = params
                    .get("externalId")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing externalId".to_string())
                    })?;

                let _provider_name = params
                    .get("providerName")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing providerName".to_string())
                    })?;

                let _cwd = params
                    .get("cwd")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing cwd".to_string())
                    })?;

                let thread_id: ThreadId = thread_id_str
                    .parse()
                    .map_err(|e| crate::error::ServerError::InvalidParams(format!("Invalid threadId: {}", e)))?;

                // 验证线程存在
                let thread = query.get_thread_detail(thread_id).await?;
                if thread.is_none() {
                    return Err(crate::error::ServerError::InvalidParams(
                        format!("Thread not found: {}", thread_id),
                    ));
                }

                // TODO: 完整实现 - 需要 Provider 适配器的 readExternalThread 能力
                // 当前返回成功，后续需要：
                // 1. 调用 provider adapter 读取外部线程消息
                // 2. 分发 thread.messages.import 命令
                // 3. 设置 session 状态

                info!("线程导入请求已接收: thread_id={}, provider={}", thread_id_str, _provider_name);
                Ok(Value::Null)
            }
        })
        .await;

    info!("编排引擎 RPC 方法注册完成");
}

