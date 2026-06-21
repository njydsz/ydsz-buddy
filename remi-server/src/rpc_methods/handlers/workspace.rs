//! # 工作空间 RPC 方法模块
//!
//! 本模块注册所有与工作空间文件操作相关的 RPC 方法，包括文件浏览、
//! 搜索、读写和删除等操作。
//!
//! ## 注册的方法
//!
//! | 方法名 | 说明 |
//! |--------|------|
//! | `workspace.browse` | 浏览工作空间目录树 |
//! | `workspace.search` | 搜索工作空间中的文件 |
//! | `workspace.listDirectories` | 列出工作空间目录结构 |
//! | `workspace.writeFile` | 写入文件 |
//! | `workspace.readFile` | 读取文件内容 |
//! | `workspace.deleteFile` | 删除文件 |
//! | `workspace.listProjects` | 列出所有项目 |
//! | `workspace.addProject` | 添加项目 |
//! | `workspace.removeProject` | 移除项目 |

use std::sync::Arc;

use remi_core::commands::{OrchestrationCommand, ProjectCreateCommand, ProjectDeleteCommand};
use remi_workspace::{
    BrowseInput, ListDirectoriesInput, SearchEntriesInput, WriteFileInput,
};
use serde_json::Value;
use tracing::info;

use crate::rpc::RpcRouter;
use crate::rpc_methods::registration::ServiceContainer;

/// 注册工作空间相关 RPC 方法
///
/// 将所有工作空间方法注册到路由器，每个方法绑定对应的服务实例。
///
/// # 参数
///
/// - `router`: RPC 路由器实例
/// - `services`: 服务容器，提供 WorkspaceEntries 和 WorkspaceFileSystem 实例
pub async fn register_workspace_methods(
    router: Arc<RpcRouter>,
    services: Arc<ServiceContainer>,
) {
    info!("注册工作空间 RPC 方法...");

    // workspace.browse - 浏览工作空间目录树
    // 参数: { root: string, path?: string, includeHidden?: boolean, maxDepth?: number }
    // 返回: Entry[]
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

    // workspace.search - 搜索工作空间中的文件
    // 参数: { root: string, pattern: string, maxResults?: number, filePattern?: string }
    // 返回: Entry[]
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

    // workspace.listDirectories - 列出工作空间目录结构
    // 参数: { root: string, maxDepth?: number }
    // 返回: Directory[]
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

    // workspace.writeFile - 写入文件
    // 参数: { root: string, path: string, content: string, createDirectories?: boolean }
    // 返回: WriteResult
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

    // workspace.readFile - 读取文件内容
    // 参数: { root: string, path: string }
    // 返回: { content: string }
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

    // workspace.deleteFile - 删除文件
    // 参数: { root: string, path: string }
    // 返回: null
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

    // workspace.listProjects - 列出所有项目
    // 参数: 无
    // 返回: Project[]
    let projection_query = services.projection_query.clone();
    router
        .register("workspace.listProjects", move |_params: Option<Value>| {
            let projection_query = projection_query.clone();
            async move {
                let snapshot = projection_query.get_snapshot().await?;
                serde_json::to_value(snapshot.projects)
                    .map_err(|e| crate::error::ServerError::InternalError(e.to_string()))
            }
        })
        .await;

    // workspace.addProject - 添加项目，自动从路径提取项目名并通过编排引擎创建
    // 参数: { path: string }
    // 返回: null
    let engine = services.orchestration_engine.clone();
    router
        .register("workspace.addProject", move |params: Option<Value>| {
            let engine = engine.clone();
            async move {
                let params = params.ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing params".to_string())
                })?;

                let path = params
                    .get("path")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing path".to_string())
                    })?
                    .to_string();

                // 从路径中提取项目名
                let title = path
                    .split('\\')
                    .next_back()
                    .or_else(|| path.split('/').next_back())
                    .unwrap_or(&path)
                    .to_string();

                let project_id = uuid::Uuid::new_v4();
                let command = OrchestrationCommand::ProjectCreate(ProjectCreateCommand {
                    command_id: None,
                    project_id,
                    title,
                    workspace_root: path,
                });
                engine.dispatch(command).await?;
                Ok(Value::Null)
            }
        })
        .await;

    // workspace.removeProject - 移除项目，通过编排引擎发送删除命令
    // 参数: { projectId: string }
    // 返回: null
    let engine = services.orchestration_engine.clone();
    router
        .register("workspace.removeProject", move |params: Option<Value>| {
            let engine = engine.clone();
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

                let project_id: uuid::Uuid = project_id_str
                    .parse()
                    .map_err(|e| crate::error::ServerError::InvalidParams(format!("Invalid projectId: {}", e)))?;

                let command = OrchestrationCommand::ProjectDelete(ProjectDeleteCommand {
                    command_id: None,
                    project_id,
                });
                engine.dispatch(command).await?;
                Ok(Value::Null)
            }
        })
        .await;

    info!("工作空间 RPC 方法注册完成");
}
