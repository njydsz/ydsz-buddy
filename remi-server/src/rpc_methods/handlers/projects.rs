//! # Projects RPC 方法模块
//!
//! 为前端提供 `projects.*` 命名空间下的 RPC 方法，内部委托给
//! `workspace_entries` / `workspace_filesystem` 完成实际文件操作。
//!
//! 这是 Peak Code 迁移兼容层：Remi 后端统一使用 `workspace.*`，
//! 但前端仍大量调用 `projects.searchEntries` / `projects.searchLocalEntries`
//! / `projects.listDirectories` / `projects.writeFile`。

use std::sync::Arc;

use remi_workspace::{ListDirectoriesInput, SearchEntriesInput, WriteFileInput};
use serde_json::Value;
use tracing::info;

use crate::rpc::RpcRouter;
use crate::rpc_methods::registration::ServiceContainer;

/// 注册 Projects 相关 RPC 方法
pub async fn register_projects_methods(
    router: Arc<RpcRouter>,
    services: Arc<ServiceContainer>,
) {
    info!("注册 Projects RPC 方法...");

    // projects.searchEntries - 在指定项目目录中搜索文件
    // 参数: { projectDir: string, query: string, maxResults?: number }
    // 返回: Entry[]
    let workspace_entries = services.workspace_entries.clone();
    router
        .register("projects.searchEntries", move |params: Option<Value>| {
            let workspace_entries = workspace_entries.clone();
            async move {
                let params = params.ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing params".to_string())
                })?;

                let project_dir = params
                    .get("projectDir")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing projectDir".to_string())
                    })?
                    .to_string();

                let query = params
                    .get("query")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing query".to_string())
                    })?
                    .to_string();

                let max_results = params
                    .get("maxResults")
                    .and_then(|v| v.as_u64())
                    .map(|r| r as usize);

                let input = SearchEntriesInput {
                    cwd: project_dir,
                    query,
                    max_results,
                    file_pattern: None,
                };

                let entries = workspace_entries.search(input).await?;
                serde_json::to_value(entries)
                    .map_err(|e| crate::error::ServerError::InternalError(e.to_string()))
            }
        })
        .await;

    // projects.searchLocalEntries - 本地（非远程）项目文件搜索
    // 当前实现与 searchEntries 相同，后续可区分远程索引
    let workspace_entries = services.workspace_entries.clone();
    router
        .register("projects.searchLocalEntries", move |params: Option<Value>| {
            let workspace_entries = workspace_entries.clone();
            async move {
                let params = params.ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing params".to_string())
                })?;

                let project_dir = params
                    .get("projectDir")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing projectDir".to_string())
                    })?
                    .to_string();

                let query = params
                    .get("query")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing query".to_string())
                    })?
                    .to_string();

                let max_results = params
                    .get("maxResults")
                    .and_then(|v| v.as_u64())
                    .map(|r| r as usize);

                let input = SearchEntriesInput {
                    cwd: project_dir,
                    query,
                    max_results,
                    file_pattern: None,
                };

                let entries = workspace_entries.search(input).await?;
                serde_json::to_value(entries)
                    .map_err(|e| crate::error::ServerError::InternalError(e.to_string()))
            }
        })
        .await;

    // projects.listDirectories - 列出项目目录结构
    // 参数: { projectDir: string, maxDepth?: number }
    let workspace_entries = services.workspace_entries.clone();
    router
        .register("projects.listDirectories", move |params: Option<Value>| {
            let workspace_entries = workspace_entries.clone();
            async move {
                let params = params.ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing params".to_string())
                })?;

                let project_dir = params
                    .get("projectDir")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing projectDir".to_string())
                    })?
                    .to_string();

                let max_depth = params
                    .get("maxDepth")
                    .and_then(|v| v.as_u64())
                    .map(|d| d as usize);

                let input = ListDirectoriesInput {
                    cwd: project_dir,
                    max_depth,
                };

                let directories = workspace_entries.list_directories(input).await?;
                serde_json::to_value(directories)
                    .map_err(|e| crate::error::ServerError::InternalError(e.to_string()))
            }
        })
        .await;

    // projects.writeFile - 写入项目文件
    // 参数: { projectDir: string, path: string, content: string, createDirectories?: boolean }
    let workspace_filesystem = services.workspace_filesystem.clone();
    router
        .register("projects.writeFile", move |params: Option<Value>| {
            let workspace_filesystem = workspace_filesystem.clone();
            async move {
                let params = params.ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing params".to_string())
                })?;

                let project_dir = params
                    .get("projectDir")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing projectDir".to_string())
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
                    cwd: project_dir,
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

    info!("Projects RPC 方法注册完成");
}

