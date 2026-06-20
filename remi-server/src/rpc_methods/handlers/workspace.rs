//! Workspace RPC 方法

use std::sync::Arc;

use remi_workspace::{
    BrowseInput, ListDirectoriesInput, SearchEntriesInput, WorkspaceEntries, WorkspaceFileSystem,
    WriteFileInput,
};
use serde_json::Value;
use tracing::info;

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
        .register("workspace.browse", move |params: Option<Value>| {
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
                    })?
                    .to_string();

                let relative_path = params
                    .get("path")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());

                let include_hidden = params
                    .get("includeHidden")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);

                let max_depth = params
                    .get("maxDepth")
                    .and_then(|v| v.as_u64())
                    .map(|d| d as usize);

                let input = BrowseInput {
                    cwd: root,
                    relative_path,
                    include_hidden,
                    max_depth,
                };

                let entries = workspace_entries.browse(input).await?;
                serde_json::to_value(entries)
                    .map_err(|e| crate::error::ServerError::InternalError(e.to_string()))
            }
        })
        .await;

    // workspace.search
    let workspace_entries = services.workspace_entries.clone();
    router
        .register("workspace.search", move |params: Option<Value>| {
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
                    })?
                    .to_string();

                let pattern = params
                    .get("pattern")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing pattern".to_string())
                    })?
                    .to_string();

                let max_results = params
                    .get("maxResults")
                    .and_then(|v| v.as_u64())
                    .map(|r| r as usize);

                let file_pattern = params
                    .get("filePattern")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());

                let input = SearchEntriesInput {
                    cwd: root,
                    query: pattern,
                    max_results,
                    file_pattern,
                };

                let entries = workspace_entries.search(input).await?;
                serde_json::to_value(entries)
                    .map_err(|e| crate::error::ServerError::InternalError(e.to_string()))
            }
        })
        .await;

    // workspace.listDirectories
    let workspace_entries = services.workspace_entries.clone();
    router
        .register("workspace.listDirectories", move |params: Option<Value>| {
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
                    })?
                    .to_string();

                let max_depth = params
                    .get("maxDepth")
                    .and_then(|v| v.as_u64())
                    .map(|d| d as usize);

                let input = ListDirectoriesInput {
                    cwd: root,
                    max_depth,
                };

                let directories = workspace_entries.list_directories(input).await?;
                serde_json::to_value(directories)
                    .map_err(|e| crate::error::ServerError::InternalError(e.to_string()))
            }
        })
        .await;

    // workspace.writeFile
    let workspace_filesystem = services.workspace_filesystem.clone();
    router
        .register("workspace.writeFile", move |params: Option<Value>| {
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
                    })?
                    .to_string();

                let path = params
                    .get("path")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing path".to_string())
                    })?
                    .to_string();

                let content = params
                    .get("content")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing content".to_string())
                    })?
                    .to_string();

                let create_directories = params
                    .get("createDirectories")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(true);

                let input = WriteFileInput {
                    cwd: root,
                    relative_path: path,
                    content,
                    create_directories,
                };

                let result = workspace_filesystem.write_file(input).await?;
                serde_json::to_value(result)
                    .map_err(|e| crate::error::ServerError::InternalError(e.to_string()))
            }
        })
        .await;

    // workspace.readFile
    let workspace_filesystem = services.workspace_filesystem.clone();
    router
        .register("workspace.readFile", move |params: Option<Value>| {
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
        .register("workspace.deleteFile", move |params: Option<Value>| {
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
