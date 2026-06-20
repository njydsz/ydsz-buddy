//! Git RPC 方法

use std::sync::Arc;

use remi_git::{GitAction, GitCore, GitManager, GitRunStackedActionInput, GitStatusBroadcaster};
use serde_json::Value;
use tracing::info;

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
        .register("git.status", move |params: Option<Value>| {
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
        .register("git.listBranches", move |params: Option<Value>| {
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
        .register("git.pull", move |params: Option<Value>| {
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

                git_core.pull_current_branch(cwd).await?;
                broadcaster.refresh_status(cwd).await?;
                Ok(Value::Null)
            }
        })
        .await;

    // git.runStackedAction
    let git_manager = services.git_manager.clone();
    let broadcaster = services.git_status_broadcaster.clone();
    router
        .register("git.runStackedAction", move |params: Option<Value>| {
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

                let action = match action_str {
                    "commit" => GitAction::Commit,
                    "push" => GitAction::Push,
                    "createPr" => GitAction::CreatePr,
                    "commitPush" => GitAction::CommitPush,
                    "commitPushPr" => GitAction::CommitPushPr,
                    _ => return Err(crate::error::ServerError::InvalidParams(
                        format!("Unknown action: {}", action_str),
                    ).into()),
                };

                let message = params
                    .get("message")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());

                let pr_title = params
                    .get("prTitle")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                let pr_body = params
                    .get("prBody")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                let pr_base = params
                    .get("prBase")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());

                let input = GitRunStackedActionInput {
                    cwd: cwd.to_string(),
                    action,
                    commit_message: message,
                    feature_branch: None,
                    pr_title,
                    pr_body,
                    pr_base,
                };

                git_manager.run_stacked_action(input).await?;
                broadcaster.refresh_status(cwd).await?;
                Ok(Value::Null)
            }
        })
        .await;

    // git.createBranch
    let git_core = services.git_core.clone();
    router
        .register("git.createBranch", move |params: Option<Value>| {
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
        .register("git.checkout", move |params: Option<Value>| {
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

                git_core.checkout_branch(cwd, branch).await?;
                Ok(Value::Null)
            }
        })
        .await;

    info!("Git RPC 方法注册完成");
}
