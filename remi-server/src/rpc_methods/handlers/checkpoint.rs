//! Checkpoint RPC 方法

use std::sync::Arc;

use serde_json::Value;
use tracing::info;

use crate::rpc::RpcRouter;
use crate::rpc_methods::registration::ServiceContainer;

/// 注册检查点相关 RPC 方法
pub async fn register_checkpoint_methods(
    router: Arc<RpcRouter>,
    services: Arc<ServiceContainer>,
) {
    info!("注册检查点 RPC 方法...");

    // checkpoint.create
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

                let message = params
                    .get("message")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();

                let thread_id: remi_core::models::ThreadId = thread_id
                    .parse()
                    .map_err(|e| crate::error::ServerError::InvalidParams(format!("Invalid threadId: {}", e)))?;

                let checkpoint = checkpoint_store.create_checkpoint(thread_id, commit_sha, message).await?;
                serde_json::to_value(checkpoint)
                    .map_err(|e| crate::error::ServerError::InternalError(e.to_string()))
            }
        })
        .await;

    // checkpoint.get
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

    // checkpoint.list
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

    // checkpoint.delete
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

    // checkpoint.revert
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

                let git_ref = checkpoint_store
                    .revert_to_checkpoint(thread_id, checkpoint_id.to_string())
                    .await?;
                Ok(serde_json::json!({ "gitRef": git_ref }))
            }
        })
        .await;

    info!("检查点 RPC 方法注册完成");
}
