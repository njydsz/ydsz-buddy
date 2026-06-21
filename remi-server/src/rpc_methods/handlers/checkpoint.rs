//! # 检查点 RPC 方法模块
//!
//! 本模块注册所有与检查点相关的 RPC 方法，包括检查点的创建、查询、
//! 列表、删除和回滚等操作。检查点用于保存和恢复工作空间状态。
//!
//! ## 注册的方法
//!
//! | 方法名 | 说明 |
//! |--------|------|
//! | `checkpoint.create` | 创建检查点 |
//! | `checkpoint.get` | 获取指定检查点详情 |
//! | `checkpoint.list` | 列出指定线程的所有检查点 |
//! | `checkpoint.delete` | 删除指定检查点 |
//! | `checkpoint.revert` | 回滚到指定检查点 |

use std::sync::Arc;

use serde_json::Value;
use tracing::info;

use crate::rpc::RpcRouter;
use crate::rpc_methods::registration::ServiceContainer;

/// 注册检查点相关 RPC 方法
///
/// 将所有检查点方法注册到路由器，每个方法绑定对应的服务实例。
///
/// # 参数
///
/// - `router`: RPC 路由器实例
/// - `services`: 服务容器，提供 CheckpointStore 实例
pub async fn register_checkpoint_methods(
    router: Arc<RpcRouter>,
    services: Arc<ServiceContainer>,
) {
    info!("注册检查点 RPC 方法...");

    // checkpoint.create - 创建检查点
    // 参数: { threadId: string, commitSha?: string, message?: string }
    // 返回: Checkpoint
    let checkpoint_store = services.checkpoint_store.clone();
    router
        .register("checkpoint.create", move |params: Option<Value>| {
            let checkpoint_store = checkpoint_store.clone();
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

                let commit_sha = params
                    .get("commitSha")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();

                let turn_id = params
                    .get("turnId")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();

                let message = params
                    .get("message")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();

                let thread_id: remi_core::models::ThreadId = thread_id
                    .parse()
                    .map_err(|e| crate::error::ServerError::InvalidParams(format!("Invalid threadId: {}", e)))?;

                let checkpoint = checkpoint_store.create_checkpoint(thread_id, turn_id, commit_sha, message).await?;
                serde_json::to_value(checkpoint)
                    .map_err(|e| crate::error::ServerError::InternalError(e.to_string()))
            }
        })
        .await;

    // checkpoint.get - 获取指定检查点详情
    // 参数: { checkpointId: string }
    // 返回: Checkpoint | null
    let checkpoint_store = services.checkpoint_store.clone();
    router
        .register("checkpoint.get", move |params: Option<Value>| {
            let checkpoint_store = checkpoint_store.clone();
            async move {
                let params = params.ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing params".to_string())
                })?;

                let checkpoint_id = params
                    .get("checkpointId")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing checkpointId".to_string())
                    })?;

                let checkpoint = checkpoint_store.get_checkpoint(checkpoint_id.to_string()).await?;
                match checkpoint {
                    Some(c) => serde_json::to_value(c)
                        .map_err(|e| crate::error::ServerError::InternalError(e.to_string())),
                    None => Ok(Value::Null),
                }
            }
        })
        .await;

    // checkpoint.list - 列出指定线程的所有检查点
    // 参数: { threadId: string }
    // 返回: Checkpoint[]
    let checkpoint_store = services.checkpoint_store.clone();
    router
        .register("checkpoint.list", move |params: Option<Value>| {
            let checkpoint_store = checkpoint_store.clone();
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

                let thread_id: remi_core::models::ThreadId = thread_id
                    .parse()
                    .map_err(|e| crate::error::ServerError::InvalidParams(format!("Invalid threadId: {}", e)))?;

                let checkpoints = checkpoint_store.list_checkpoints(thread_id).await?;
                serde_json::to_value(checkpoints)
                    .map_err(|e| crate::error::ServerError::InternalError(e.to_string()))
            }
        })
        .await;

    // checkpoint.delete - 删除指定检查点
    // 参数: { checkpointId: string }
    // 返回: null
    let checkpoint_store = services.checkpoint_store.clone();
    router
        .register("checkpoint.delete", move |params: Option<Value>| {
            let checkpoint_store = checkpoint_store.clone();
            async move {
                let params = params.ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing params".to_string())
                })?;

                let checkpoint_id = params
                    .get("checkpointId")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing checkpointId".to_string())
                    })?;

                checkpoint_store.delete_checkpoint(checkpoint_id.to_string()).await?;
                Ok(Value::Null)
            }
        })
        .await;

    // checkpoint.revert - 回滚到指定检查点，返回回滚后的 Git 引用
    // 参数: { threadId: string, checkpointId: string }
    // 返回: { gitRef: string }
    let checkpoint_store = services.checkpoint_store.clone();
    router
        .register("checkpoint.revert", move |params: Option<Value>| {
            let checkpoint_store = checkpoint_store.clone();
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

                let checkpoint_id = params
                    .get("checkpointId")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing checkpointId".to_string())
                    })?;

                let thread_id: remi_core::models::ThreadId = thread_id
                    .parse()
                    .map_err(|e| crate::error::ServerError::InvalidParams(format!("Invalid threadId: {}", e)))?;

                let cwd = params
                    .get("cwd")
                    .and_then(|v| v.as_str())
                    .unwrap_or(".");

                let git_ref = checkpoint_store
                    .revert_to_checkpoint(cwd, thread_id, checkpoint_id.to_string())
                    .await?;
                Ok(serde_json::json!({ "gitRef": git_ref }))
            }
        })
        .await;

    info!("检查点 RPC 方法注册完成");
}

