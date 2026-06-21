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
//! | `git.stash` | 暂存当前工作区变更 |
//! | `git.stashPop` | 恢复最近一次暂存的变更 |
//! | `git.stashDrop` | 删除最近一次暂存记录 |
//! | `git.stashInfo` | 获取暂存记录信息 |
//! | `git.diff` | 获取工作区差异 |
//! | `git.log` | 获取提交日志 |
//! | `git.createWorktree` | 创建 Git Worktree |
//! | `git.removeWorktree` | 删除 Git Worktree |
//! | `git.createDetachedWorktree` | 创建分离 HEAD 的 Worktree |
//! | `git.removeIndexLock` | 删除 index.lock 文件 |
//! | `git.init` | 初始化 Git 仓库 |
//! | `git.readWorkingTreeDiff` | 读取工作树完整差异 |
//! | `git.summarizeDiff` | 获取差异摘要统计 |

use std::sync::Arc;

use remi_git::{GitAction, GitHubCli, GitRunStackedActionInput, MergeMethod};
use serde_json::Value;
use tracing::info;

use crate::push_channels::channels;
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
                    )),
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

    // git.diff - 获取工作区差异
    // 参数: { cwd: string, staged?: boolean }
    // 返回: { diff: string }
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

    // git.log - 获取提交日志
    // 参数: { cwd: string, maxCount?: number }
    // 返回: { log: CommitLog[] }
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

    // git.stash - 暂存当前工作区变更
    // 参数: { cwd: string }
    // 返回: null
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

    // git.stashPop - 恢复最近一次暂存的变更
    // 参数: { cwd: string }
    // 返回: null
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

    // git.createWorktree - 创建 Git Worktree
    // 参数: { cwd: string, worktreePath: string, branch: string, base?: string }
    // 返回: null
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

    // git.removeWorktree - 删除 Git Worktree
    // 参数: { cwd: string, worktreePath: string }
    // 返回: null
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

    // git.createDetachedWorktree - 创建分离 HEAD 的 Worktree，用于查看指定提交的代码
    // 参数: { cwd: string, worktreePath: string, commit: string }
    // 返回: null
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

    // git.stashDrop - 删除最新的 stash 记录
    // 参数: { cwd: string }
    // 返回: null
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

    // git.stashInfo - 获取暂存记录信息
    // 参数: { cwd: string }
    // 返回: { info: StashInfo }
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

    // git.removeIndexLock - 删除 index.lock 文件，用于解除 Git 锁定状态
    // 参数: { cwd: string }
    // 返回: null
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
    // 参数: { cwd: string }
    // 返回: null
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

    // git.readWorkingTreeDiff - 读取工作树的完整差异（patch 格式）
    // 参数: { cwd: string }
    // 返回: { patch: string }
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

    // git.summarizeDiff - 获取差异摘要统计（新增行数、删除行数、变更文件数）
    // 参数: { cwd: string, staged?: boolean }
    // 返回: { additions: number, deletions: number, filesChanged: number }
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

    // ===== Manager 高阶方法 =====

    // git.createPullRequest - 通过 gh CLI 创建 PR
    // 参数: { cwd: string, title: string, body?: string, base?: string }
    // 返回: { url: string }
    let git_manager = services.git_manager.clone();
    router
        .register("git.createPullRequest", move |params: Option<Value>| {
            let git_manager = git_manager.clone();
            async move {
                let p = params.ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing params".to_string())
                })?;
                let cwd = p.get("cwd").and_then(|v| v.as_str()).ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing cwd".to_string())
                })?;
                let title = p
                    .get("title")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing title".to_string())
                    })?;
                let body = p.get("body").and_then(|v| v.as_str());
                let base = p.get("base").and_then(|v| v.as_str());
                let url = git_manager
                    .create_pull_request(cwd, title, body, base)
                    .await?;
                Ok(serde_json::json!({ "url": url }))
            }
        })
        .await;

    // git.resolvePullRequest - 解析 PR 引用
    // 参数: { cwd: string, prRef: string }
    // 返回: PullRequestInfo
    let git_manager = services.git_manager.clone();
    router
        .register("git.resolvePullRequest", move |params: Option<Value>| {
            let git_manager = git_manager.clone();
            async move {
                let p = params.ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing params".to_string())
                })?;
                let cwd = p.get("cwd").and_then(|v| v.as_str()).ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing cwd".to_string())
                })?;
                let pr_ref = p
                    .get("prRef")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing prRef".to_string())
                    })?;
                let info = git_manager.resolve_pull_request(cwd, pr_ref).await?;
                serde_json::to_value(info)
                    .map_err(|e| crate::error::ServerError::InternalError(e.to_string()))
            }
        })
        .await;

    // git.summarizeDiffMarkdown - 生成 Markdown 格式差异摘要
    // 参数: { cwd: string, maxLength?: number }
    // 返回: { summary: string }
    let git_manager = services.git_manager.clone();
    router
        .register("git.summarizeDiffMarkdown", move |params: Option<Value>| {
            let git_manager = git_manager.clone();
            async move {
                let p = params.ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing params".to_string())
                })?;
                let cwd = p.get("cwd").and_then(|v| v.as_str()).ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing cwd".to_string())
                })?;
                let max_length = p.get("maxLength").and_then(|v| v.as_u64()).map(|n| n as usize);
                let diff = git_manager.read_working_tree_diff(cwd).await?;
                let summary = git_manager.summarize_diff(&diff, max_length).await?;
                Ok(serde_json::json!({ "summary": summary }))
            }
        })
        .await;

    // git.handoffThread - 在 worktree 之间切换，自动 stash / pop
    // 参数: { cwd: string, targetBranch: string }
    // 返回: null
    let git_manager = services.git_manager.clone();
    let broadcaster = services.git_status_broadcaster.clone();
    router
        .register("git.handoffThread", move |params: Option<Value>| {
            let git_manager = git_manager.clone();
            let broadcaster = broadcaster.clone();
            async move {
                let p = params.ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing params".to_string())
                })?;
                let cwd = p.get("cwd").and_then(|v| v.as_str()).ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing cwd".to_string())
                })?;
                let target = p
                    .get("targetBranch")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing targetBranch".to_string())
                    })?;
                git_manager.handoff_thread(cwd, target).await?;
                broadcaster.refresh_status(cwd).await?;
                Ok(Value::Null)
            }
        })
        .await;

    // git.preparePullRequestThread - 为 PR 创建独立 worktree
    // 参数: { cwd: string, prNumber: number, worktreePath: string }
    // 返回: { branch: string }
    let git_manager = services.git_manager.clone();
    router
        .register("git.preparePullRequestThread", move |params: Option<Value>| {
            let git_manager = git_manager.clone();
            async move {
                let p = params.ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing params".to_string())
                })?;
                let cwd = p.get("cwd").and_then(|v| v.as_str()).ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing cwd".to_string())
                })?;
                let pr_number = p
                    .get("prNumber")
                    .and_then(|v| v.as_u64())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing prNumber".to_string())
                    })?;
                let worktree_path = p
                    .get("worktreePath")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams(
                            "Missing worktreePath".to_string(),
                        )
                    })?;
                let branch = git_manager
                    .prepare_pull_request_thread(cwd, pr_number, worktree_path)
                    .await?;
                Ok(serde_json::json!({ "branch": branch }))
            }
        })
        .await;

    // ===== GitHubCli 方法 =====

    // git.listPullRequests - 列出 PR
    // 参数: { cwd: string, state?: string, limit?: number }
    // 返回: PullRequestSummary[]
    let gh_list = GitHubCli::new();
    router
        .register("git.listPullRequests", move |params: Option<Value>| {
            let gh = gh_list.clone();
            async move {
                let p = params.ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing params".to_string())
                })?;
                let cwd = p.get("cwd").and_then(|v| v.as_str()).ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing cwd".to_string())
                })?;
                let state = p.get("state").and_then(|v| v.as_str());
                let limit = p.get("limit").and_then(|v| v.as_u64()).map(|n| n as u32);
                let list = gh.list_pull_requests(cwd, state, limit).await?;
                serde_json::to_value(list)
                    .map_err(|e| crate::error::ServerError::InternalError(e.to_string()))
            }
        })
        .await;

    // git.viewPullRequest - 查看 PR 详情
    // 参数: { cwd: string, prNumber: number }
    // 返回: PullRequestDetail
    let gh_view = GitHubCli::new();
    router
        .register("git.viewPullRequest", move |params: Option<Value>| {
            let gh = gh_view.clone();
            async move {
                let p = params.ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing params".to_string())
                })?;
                let cwd = p.get("cwd").and_then(|v| v.as_str()).ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing cwd".to_string())
                })?;
                let n = p.get("prNumber").and_then(|v| v.as_u64()).ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing prNumber".to_string())
                })?;
                let detail = gh.view_pull_request(cwd, n).await?;
                serde_json::to_value(detail)
                    .map_err(|e| crate::error::ServerError::InternalError(e.to_string()))
            }
        })
        .await;

    // git.mergePullRequest - 合并 PR
    // 参数: { cwd: string, prNumber: number, method: "merge"|"squash"|"rebase", deleteBranch?: boolean }
    // 返回: null
    let gh_merge = GitHubCli::new();
    router
        .register("git.mergePullRequest", move |params: Option<Value>| {
            let gh = gh_merge.clone();
            async move {
                let p = params.ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing params".to_string())
                })?;
                let cwd = p.get("cwd").and_then(|v| v.as_str()).ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing cwd".to_string())
                })?;
                let n = p.get("prNumber").and_then(|v| v.as_u64()).ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing prNumber".to_string())
                })?;
                let method_str = p
                    .get("method")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing method".to_string())
                    })?;
                let method = match method_str {
                    "merge" => MergeMethod::Merge,
                    "squash" => MergeMethod::Squash,
                    "rebase" => MergeMethod::Rebase,
                    _ => {
                        return Err(crate::error::ServerError::InvalidParams(format!(
                            "Unknown merge method: {method_str}"
                        )));
                    }
                };
                let delete = p
                    .get("deleteBranch")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);
                gh.merge_pull_request(cwd, n, method, delete).await?;
                Ok(Value::Null)
            }
        })
        .await;

    // git.commentPullRequest - 给 PR 添加评论
    // 参数: { cwd: string, prNumber: number, body: string }
    // 返回: null
    let gh_comment = GitHubCli::new();
    router
        .register("git.commentPullRequest", move |params: Option<Value>| {
            let gh = gh_comment.clone();
            async move {
                let p = params.ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing params".to_string())
                })?;
                let cwd = p.get("cwd").and_then(|v| v.as_str()).ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing cwd".to_string())
                })?;
                let n = p.get("prNumber").and_then(|v| v.as_u64()).ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing prNumber".to_string())
                })?;
                let body = p
                    .get("body")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing body".to_string())
                    })?;
                gh.comment_pull_request(cwd, n, body).await?;
                Ok(Value::Null)
            }
        })
        .await;

    // git.diffPullRequest - 获取 PR 的 diff
    // 参数: { cwd: string, prNumber: number }
    // 返回: { diff: string }
    let gh_diff = GitHubCli::new();
    router
        .register("git.diffPullRequest", move |params: Option<Value>| {
            let gh = gh_diff.clone();
            async move {
                let p = params.ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing params".to_string())
                })?;
                let cwd = p.get("cwd").and_then(|v| v.as_str()).ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing cwd".to_string())
                })?;
                let n = p.get("prNumber").and_then(|v| v.as_u64()).ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing prNumber".to_string())
                })?;
                let diff = gh.diff_pull_request(cwd, n).await?;
                Ok(serde_json::json!({ "diff": diff }))
            }
        })
        .await;

    // git.closePullRequest
    let gh_close = GitHubCli::new();
    router
        .register("git.closePullRequest", move |params: Option<Value>| {
            let gh = gh_close.clone();
            async move {
                let p = params.ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing params".to_string())
                })?;
                let cwd = p.get("cwd").and_then(|v| v.as_str()).ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing cwd".to_string())
                })?;
                let n = p.get("prNumber").and_then(|v| v.as_u64()).ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing prNumber".to_string())
                })?;
                gh.close_pull_request(cwd, n).await?;
                Ok(Value::Null)
            }
        })
        .await;

    // git.reopenPullRequest
    let gh_reopen = GitHubCli::new();
    router
        .register("git.reopenPullRequest", move |params: Option<Value>| {
            let gh = gh_reopen.clone();
            async move {
                let p = params.ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing params".to_string())
                })?;
                let cwd = p.get("cwd").and_then(|v| v.as_str()).ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing cwd".to_string())
                })?;
                let n = p.get("prNumber").and_then(|v| v.as_u64()).ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing prNumber".to_string())
                })?;
                gh.reopen_pull_request(cwd, n).await?;
                Ok(Value::Null)
            }
        })
        .await;

    // git.authStatus
    let gh_auth = GitHubCli::new();
    router
        .register("git.authStatus", move |_params: Option<Value>| {
            let gh = gh_auth.clone();
            async move {
                let status = gh.auth_status().await?;
                serde_json::to_value(status)
                    .map_err(|e| crate::error::ServerError::InternalError(e.to_string()))
            }
        })
        .await;

    // git.stashAndCheckout - 暂存当前变更并切换分支，切换成功后恢复暂存
    // 参数: { cwd: string, branch: string }
    // 返回: null
    let git_core = services.git_core.clone();
    let broadcaster = services.git_status_broadcaster.clone();
    router
        .register("git.stashAndCheckout", move |params: Option<Value>| {
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

                let branch = params
                    .get("branch")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing branch".to_string())
                    })?;

                // 使用 GitCore 已有的 stash_and_checkout 方法
                git_core.stash_and_checkout(cwd, branch).await?;
                broadcaster.refresh_status(cwd).await?;
                Ok(Value::Null)
            }
        })
        .await;

    // git.subscribeActionProgress - 订阅 Git 操作进度事件
    // 参数: { actionId?: string }
    // 返回: { subscribed: string, status: string }
    let push_manager = services.push_channel_manager.clone();
    router
        .register("git.subscribeActionProgress", move |params: Option<Value>| {
            let push_manager = push_manager.clone();
            async move {
                // 订阅 Git 状态通道以接收操作进度
                let _receiver = push_manager.subscribe(channels::GIT_STATUS).await;

                // 如果提供了 actionId，记录日志用于关联
                if let Some(params) = params {
                    if let Some(action_id) = params.get("actionId").and_then(|v| v.as_str()) {
                        info!("订阅 Git 操作进度: actionId={}", action_id);
                    }
                }

                Ok(serde_json::json!({
                    "subscribed": channels::GIT_STATUS,
                    "status": "active"
                }))
            }
        })
        .await;

    info!("Git RPC 方法注册完成");
}
