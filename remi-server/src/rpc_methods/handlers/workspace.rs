//! Workspace RPC 方法

use std::sync::Arc;

use remi_workspace::{WorkspaceEntries, WorkspaceFileSystem};
use serde_json::Value;
use tracing::info;

use crate::error::ServerResult;
use crate::rpc::RpcRouter;
use crate::rpc_methods::registration::ServiceContainer;

/// 注册工作空间相关 RPC 方法
pub async fn register_workspace_methods(
    router: Arc<RpcRouter>,
    services: Arc<ServiceContainer>,
) {
    info!("注册工作空间 RPC 方法...");

    // workspace.browse
    let workspace_entries = services.workspace_entries.clone();
    router
        .register("workspace.browse", move |params| {
            let workspace_entries = workspace_entries.clone();
            async move {
                let params = params.ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing params".to_string())
                })?;

                let root = params
                    .get("root")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing root".to_string())
                    })?;

                let path = params
                    .get("path")
                    .and_then(|v| v.as_str())
                    .unwrap_or(".");

                let entries = workspace_entries.browse(root, path).await?;
                serde_json::to_value(entries)
                    .map_err(|e| crate::error::ServerError::InternalError(e.to_string()))
            }
        })
        .await;

    // workspace.search
    let workspace_entries = services.workspace_entries.clone();
    router
        .register("workspace.search", move |params| {
            let workspace_entries = workspace_entries.clone();
            async move {
                let params = params.ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing params".to_string())
                })?;

                let root = params
                    .get("root")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing root".to_string())
                    })?;

                let pattern = params
                    .get("pattern")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing pattern".to_string())
                    })?;

                let entries = workspace_entries.search(root, pattern).await?;
                serde_json::to_value(entries)
                    .map_err(|e| crate::error::ServerError::InternalError(e.to_string()))
            }
        })
        .await;

    // workspace.listDirectories
    let workspace_entries = services.workspace_entries.clone();
    router
        .register("workspace.listDirectories", move |params| {
            let workspace_entries = workspace_entries.clone();
            async move {
                let params = params.ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing params".to_string())
                })?;

                let root = params
                    .get("root")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing root".to_string())
                    })?;

                let directories = workspace_entries.list_directories(root).await?;
                serde_json::to_value(directories)
                    .map_err(|e| crate::error::ServerError::InternalError(e.to_string()))
            }
        })
        .await;

    // workspace.writeFile
    let workspace_filesystem = services.workspace_filesystem.clone();
    router
        .register("workspace.writeFile", move |params| {
            let workspace_filesystem = workspace_filesystem.clone();
            async move {
                let params = params.ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing params".to_string())
                })?;

                let root = params
                    .get("root")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing root".to_string())
                    })?;

                let path = params
                    .get("path")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing path".to_string())
                    })?;

                let content = params
                    .get("content")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing content".to_string())
                    })?;

                workspace_filesystem.write_file(root, path, content).await?;
                Ok(Value::Null)
            }
        })
        .await;

    // workspace.readFile
    let workspace_filesystem = services.workspace_filesystem.clone();
    router
        .register("workspace.readFile", move |params| {
            let workspace_filesystem = workspace_filesystem.clone();
            async move {
                let params = params.ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing params".to_string())
                })?;

                let root = params
                    .get("root")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing root".to_string())
                    })?;

                let path = params
                    .get("path")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing path".to_string())
                    })?;

                let content = workspace_filesystem.read_file(root, path).await?;
                Ok(serde_json::json!({ "content": content }))
            }
        })
        .await;

    // workspace.deleteFile
    let workspace_filesystem = services.workspace_filesystem.clone();
    router
        .register("workspace.deleteFile", move |params| {
            let workspace_filesystem = workspace_filesystem.clone();
            async move {
                let params = params.ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing params".to_string())
                })?;

                let root = params
                    .get("root")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing root".to_string())
                    })?;

                let path = params
                    .get("path")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing path".to_string())
                    })?;

                workspace_filesystem.delete_file(root, path).await?;
                Ok(Value::Null)
            }
        })
        .await;

    info!("工作空间 RPC 方法注册完成");
}
