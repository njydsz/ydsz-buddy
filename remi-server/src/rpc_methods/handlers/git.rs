//! # Git RPC 方法模块
//!
//! 本模块注册所有与 Git 版本控制相关的 RPC 方法，包括状态查询、分支操作、
//! 代码拉取和堆叠操作（commit/push/PR）等。
//!
//! ## 注册的方法
//!
//! | 方法名 | 说明 |
//! |--------|------|
//! | `git.status` | 获取指定仓库的 Git 状态 |
//! | `git.listBranches` | 列出指定仓库的所有分支 |
//! | `git.pull` | 拉取当前分支的最新代码 |
//! | `git.runStackedAction` | 执行堆叠 Git 操作（commit/push/PR） |
//! | `git.createBranch` | 创建新分支 |
//! | `git.checkout` | 切换到指定分支 |

use std::sync::Arc;

use remi_git::{GitAction, GitRunStackedActionInput};
use serde_json::Value;
use tracing::info;

use crate::rpc::RpcRouter;
use crate::rpc_methods::registration::ServiceContainer;

/// 注册 Git 相关 RPC 方法
///
/// 将所有 Git 方法注册到路由器，每个方法绑定对应的服务实例。
///
/// # 参数
///
/// - `router`: RPC 路由器实例
/// - `services`: 服务容器，提供 GitCore、GitManager 和 GitStatusBroadcaster 实例
pub async fn register_git_methods(
    router: Arc<RpcRouter>,
    services: Arc<ServiceContainer>,
) {
    info!("注册 Git RPC 方法...");

    // git.status - 获取指定仓库的 Git 状态
    // 参数: { cwd: string }
    // 返回: GitStatus
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

    // git.listBranches - 列出指定仓库的所有分支
    // 参数: { cwd: string }
    // 返回: Branch[]
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

    // git.pull - 拉取当前分支的最新代码，并刷新状态广播
    // 参数: { cwd: string }
    // 返回: null
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

    // git.runStackedAction - 执行堆叠 Git 操作（commit/push/PR 组合）
    // 参数: { cwd: string, action: "commit"|"push"|"createPr"|"commitPush"|"commitPushPr",
    //         message?: string, prTitle?: string, prBody?: string, prBase?: string }
    // 返回: null
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

    // git.createBranch - 创建新分支
    // 参数: { cwd: string, branch: string }
    // 返回: null
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

    // git.checkout - 切换到指定分支
    // 参数: { cwd: string, branch: string }
    // 返回: null
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

    // git.diff
    let git_core = services.git_core.clone();
    router
        .register("git.diff", move |params: Option<Value>| {
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

                let staged = params
                    .get("staged")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);

                let diff = git_core.diff(cwd, staged).await?;
                Ok(serde_json::json!({ "diff": diff }))
            }
        })
        .await;

    // git.log
    let git_core = services.git_core.clone();
    router
        .register("git.log", move |params: Option<Value>| {
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

                let max_count = params
                    .get("maxCount")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(50) as usize;

                let log = git_core.log(cwd, max_count).await?;
                Ok(serde_json::json!({ "log": log }))
            }
        })
        .await;

    // git.stash
    let git_core = services.git_core.clone();
    router
        .register("git.stash", move |params: Option<Value>| {
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

                git_core.stash(cwd).await?;
                Ok(Value::Null)
            }
        })
        .await;

    // git.stashPop
    let git_core = services.git_core.clone();
    router
        .register("git.stashPop", move |params: Option<Value>| {
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

                git_core.stash_pop(cwd).await?;
                Ok(Value::Null)
            }
        })
        .await;

    // git.createWorktree - 创建 worktree
    let git_core = services.git_core.clone();
    router
        .register("git.createWorktree", move |params: Option<Value>| {
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

                let worktree_path = params
                    .get("worktreePath")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing worktreePath".to_string())
                    })?;

                let branch = params
                    .get("branch")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing branch".to_string())
                    })?;

                let base = params
                    .get("base")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());

                git_core.create_worktree(cwd, worktree_path, branch, base).await?;
                Ok(Value::Null)
            }
        })
        .await;

    // git.removeWorktree - 删除 worktree
    let git_core = services.git_core.clone();
    router
        .register("git.removeWorktree", move |params: Option<Value>| {
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

                let worktree_path = params
                    .get("worktreePath")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing worktreePath".to_string())
                    })?;

                git_core.remove_worktree(cwd, worktree_path).await?;
                Ok(Value::Null)
            }
        })
        .await;

    // git.createDetachedWorktree - 创建分离的 worktree
    let git_core = services.git_core.clone();
    router
        .register("git.createDetachedWorktree", move |params: Option<Value>| {
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

                let worktree_path = params
                    .get("worktreePath")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing worktreePath".to_string())
                    })?;

                let commit = params
                    .get("commit")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing commit".to_string())
                    })?;

                git_core.create_detached_worktree(cwd, worktree_path, commit).await?;
                Ok(Value::Null)
            }
        })
        .await;

    // git.stashDrop - 删除最新的 stash
    let git_core = services.git_core.clone();
    router
        .register("git.stashDrop", move |params: Option<Value>| {
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

                git_core.stash_drop(cwd).await?;
                Ok(Value::Null)
            }
        })
        .await;

    // git.stashInfo - 获取 stash 信息
    let git_core = services.git_core.clone();
    router
        .register("git.stashInfo", move |params: Option<Value>| {
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

                let info = git_core.stash_info(cwd).await?;
                Ok(serde_json::json!({ "info": info }))
            }
        })
        .await;

    // git.removeIndexLock - 删除 index.lock 文件
    let git_core = services.git_core.clone();
    router
        .register("git.removeIndexLock", move |params: Option<Value>| {
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

                git_core.remove_index_lock(cwd).await?;
                Ok(Value::Null)
            }
        })
        .await;

    // git.init - 初始化 Git 仓库
    let git_core = services.git_core.clone();
    router
        .register("git.init", move |params: Option<Value>| {
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

                git_core.init_repo(cwd).await?;
                Ok(Value::Null)
            }
        })
        .await;

    // git.readWorkingTreeDiff - 读取工作树的完整差异
    let git_core = services.git_core.clone();
    router
        .register("git.readWorkingTreeDiff", move |params: Option<Value>| {
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

                let patch = git_core.read_working_tree_patch(cwd).await?;
                Ok(serde_json::json!({ "patch": patch }))
            }
        })
        .await;

    // git.summarizeDiff - 获取差异摘要
    let git_core = services.git_core.clone();
    router
        .register("git.summarizeDiff", move |params: Option<Value>| {
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

                let staged = params
                    .get("staged")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);

                let diff = git_core.diff(cwd, staged).await?;
                
                // 解析 diff 统计信息
                let mut additions = 0;
                let mut deletions = 0;
                let mut files_changed = 0;
                
                for line in diff.lines() {
                    if line.starts_with("diff --git") {
                        files_changed += 1;
                    } else if line.starts_with("+") && !line.starts_with("+++") {
                        additions += 1;
                    } else if line.starts_with("-") && !line.starts_with("---") {
                        deletions += 1;
                    }
                }
                
                Ok(serde_json::json!({
                    "additions": additions,
                    "deletions": deletions,
                    "filesChanged": files_changed
                }))
            }
        })
        .await;

    info!("Git RPC 方法注册完成");
}
