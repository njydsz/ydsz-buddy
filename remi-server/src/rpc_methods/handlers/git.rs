//! Git RPC 方法

use std::sync::Arc;

use remi_git::{GitCore, GitManager, GitStatusBroadcaster, StackedAction};
use serde_json::Value;
use tracing::info;

use crate::error::ServerResult;
use crate::rpc::RpcRouter;
use crate::rpc_methods::registration::ServiceContainer;

/// 注册 Git 相关 RPC 方法
pub async fn register_git_methods(
    router: Arc<RpcRouter>,
    services: Arc<ServiceContainer>,
) {
    info!("注册 Git RPC 方法...");

    // git.status
    let broadcaster = services.git_status_broadcaster.clone();
    router
        .register("git.status", move |params| {
            let broadcaster = broadcaster.clone();
            async move {
                let params = params.ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing params".to_string())
                })?;

                let cwd = params
                    .get("cwd")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing cwd".to_string())
                    })?;

                let status = broadcaster.get_status(cwd).await?;
                serde_json::to_value(status)
                    .map_err(|e| crate::error::ServerError::InternalError(e.to_string()))
            }
        })
        .await;

    // git.listBranches
    let git_core = services.git_core.clone();
    router
        .register("git.listBranches", move |params| {
            let git_core = git_core.clone();
            async move {
                let params = params.ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing params".to_string())
                })?;

                let cwd = params
                    .get("cwd")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing cwd".to_string())
                    })?;

                let branches = git_core.list_branches(cwd).await?;
                serde_json::to_value(branches)
                    .map_err(|e| crate::error::ServerError::InternalError(e.to_string()))
            }
        })
        .await;

    // git.pull
    let git_core = services.git_core.clone();
    let broadcaster = services.git_status_broadcaster.clone();
    router
        .register("git.pull", move |params| {
            let git_core = git_core.clone();
            let broadcaster = broadcaster.clone();
            async move {
                let params = params.ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing params".to_string())
                })?;

                let cwd = params
                    .get("cwd")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing cwd".to_string())
                    })?;

                git_core.pull(cwd).await?;
                broadcaster.refresh_status(cwd).await?;
                Ok(Value::Null)
            }
        })
        .await;

    // git.runStackedAction
    let git_manager = services.git_manager.clone();
    let broadcaster = services.git_status_broadcaster.clone();
    router
        .register("git.runStackedAction", move |params| {
            let git_manager = git_manager.clone();
            let broadcaster = broadcaster.clone();
            async move {
                let params = params.ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing params".to_string())
                })?;

                let cwd = params
                    .get("cwd")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing cwd".to_string())
                    })?;

                let action_str = params
                    .get("action")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing action".to_string())
                    })?;

                let action: StackedAction = action_str
                    .parse()
                    .map_err(|e| crate::error::ServerError::InvalidParams(e.to_string()))?;

                let message = params
                    .get("message")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());

                git_manager.run_stacked_action(cwd, action, message).await?;
                broadcaster.refresh_status(cwd).await?;
                Ok(Value::Null)
            }
        })
        .await;

    // git.createBranch
    let git_core = services.git_core.clone();
    router
        .register("git.createBranch", move |params| {
            let git_core = git_core.clone();
            async move {
                let params = params.ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing params".to_string())
                })?;

                let cwd = params
                    .get("cwd")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing cwd".to_string())
                    })?;

                let branch = params
                    .get("branch")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing branch".to_string())
                    })?;

                git_core.create_branch(cwd, branch).await?;
                Ok(Value::Null)
            }
        })
        .await;

    // git.checkout
    let git_core = services.git_core.clone();
    router
        .register("git.checkout", move |params| {
            let git_core = git_core.clone();
            async move {
                let params = params.ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing params".to_string())
                })?;

                let cwd = params
                    .get("cwd")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing cwd".to_string())
                    })?;

                let branch = params
                    .get("branch")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing branch".to_string())
                    })?;

                git_core.checkout(cwd, branch).await?;
                Ok(Value::Null)
            }
        })
        .await;

    info!("Git RPC 方法注册完成");
}
