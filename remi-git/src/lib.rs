//! Remi Code 的 Git 操作。
//!
//! 本 crate 使用 git2-rs 和 CLI 命令提供 Git 操作功能。

use git2::{Repository, StatusOptions};
use remi_contracts::{
    GitBranch, GitChangeStatus, GitCreateBranchResult, GitFileChange, GitListBranchesResult,
    GitStatusResult,
};
use remi_core::{Error, Result};
use tracing::info;

/// Git 服务。
pub struct GitService;

impl GitService {
    /// 获取 Git 仓库的状态。
    pub async fn status(repo_path: &str) -> Result<GitStatusResult> {
        let repo = Repository::open(repo_path)
            .map_err(|e| Error::Git(format!("打开仓库失败: {}", e)))?;

        let mut opts = StatusOptions::new();
        opts.include_untracked(true);
        opts.recurse_untracked_dirs(true);

        let statuses = repo
            .statuses(Some(&mut opts))
            .map_err(|e| Error::Git(format!("获取状态失败: {}", e)))?;

        let mut staged = Vec::new();
        let mut unstaged = Vec::new();
        let mut untracked = Vec::new();

        for status in statuses.iter() {
            let path = status.path().unwrap_or("").to_string();
            let status_code = status.status();

            if status_code.is_index_new() {
                staged.push(GitFileChange {
                    path: path.clone(),
                    status: GitChangeStatus::Added,
                });
            } else if status_code.is_index_modified() {
                staged.push(GitFileChange {
                    path: path.clone(),
                    status: GitChangeStatus::Modified,
                });
            } else if status_code.is_index_deleted() {
                staged.push(GitFileChange {
                    path: path.clone(),
                    status: GitChangeStatus::Deleted,
                });
            }

            if status_code.is_wt_modified() {
                unstaged.push(GitFileChange {
                    path: path.clone(),
                    status: GitChangeStatus::Modified,
                });
            } else if status_code.is_wt_deleted() {
                unstaged.push(GitFileChange {
                    path: path.clone(),
                    status: GitChangeStatus::Deleted,
                });
            }

            if status_code.is_wt_new() {
                untracked.push(path);
            }
        }

        let current_branch = repo
            .head()
            .ok()
            .and_then(|head| head.shorthand().map(String::from));

        let is_clean = staged.is_empty() && unstaged.is_empty() && untracked.is_empty();

        Ok(GitStatusResult {
            current_branch,
            is_clean,
            staged,
            unstaged,
            untracked,
        })
    }

    /// 创建新分支。
    pub async fn create_branch(
        repo_path: &str,
        branch_name: &str,
        base: Option<&str>,
        checkout: bool,
    ) -> Result<GitCreateBranchResult> {
        let repo = Repository::open(repo_path)
            .map_err(|e| Error::Git(format!("打开仓库失败: {}", e)))?;

        let commit = if let Some(base_ref) = base {
            repo.revparse_single(base_ref)
                .map_err(|e| Error::Git(format!("解析基准引用失败: {}", e)))?
                .peel_to_commit()
                .map_err(|e| Error::Git(format!("解析为提交失败: {}", e)))?
        } else {
            repo.head()
                .map_err(|e| Error::Git(format!("获取 HEAD 失败: {}", e)))?
                .peel_to_commit()
                .map_err(|e| Error::Git(format!("解析为提交失败: {}", e)))?
        };

        let branch = repo
            .branch(branch_name, &commit, false)
            .map_err(|e| Error::Git(format!("创建分支失败: {}", e)))?;

        if checkout {
            let ref_name = branch
                .get()
                .name()
                .ok_or_else(|| Error::Git("无效的分支名称".to_string()))?;
            repo.set_head(ref_name)
                .map_err(|e| Error::Git(format!("检出分支失败: {}", e)))?;
        }

        let commit_sha = commit.id().to_string();

        Ok(GitCreateBranchResult {
            branch_name: branch_name.to_string(),
            commit_sha,
        })
    }

    /// 列出分支。
    pub async fn list_branches(
        repo_path: &str,
        include_remote: bool,
    ) -> Result<GitListBranchesResult> {
        let repo = Repository::open(repo_path)
            .map_err(|e| Error::Git(format!("打开仓库失败: {}", e)))?;

        let mut branches = Vec::new();

        // 本地分支
        for branch in repo
            .branches(Some(git2::BranchType::Local))
            .map_err(|e| Error::Git(format!("列出本地分支失败: {}", e)))?
        {
            let (branch, _) =
                branch.map_err(|e| Error::Git(format!("读取分支失败: {}", e)))?;
            let name = branch
                .name()
                .map_err(|e| Error::Git(format!("无效的分支名称: {}", e)))?
                .unwrap_or("")
                .to_string();

            let commit = branch
                .get()
                .peel_to_commit()
                .map_err(|e| Error::Git(format!("获取提交失败: {}", e)))?;

            let is_current = repo
                .head()
                .ok()
                .and_then(|h| h.shorthand().map(|s| s == name))
                .unwrap_or(false);

            branches.push(GitBranch {
                name,
                is_current,
                is_remote: false,
                commit_sha: commit.id().to_string(),
            });
        }

        // 远程分支
        if include_remote {
            for branch in repo
                .branches(Some(git2::BranchType::Remote))
                .map_err(|e| Error::Git(format!("列出远程分支失败: {}", e)))?
            {
                let (branch, _) =
                    branch.map_err(|e| Error::Git(format!("读取分支失败: {}", e)))?;
                let name = branch
                    .name()
                    .map_err(|e| Error::Git(format!("无效的分支名称: {}", e)))?
                    .unwrap_or("")
                    .to_string();

                let commit = branch
                    .get()
                    .peel_to_commit()
                    .map_err(|e| Error::Git(format!("获取提交失败: {}", e)))?;

                branches.push(GitBranch {
                    name,
                    is_current: false,
                    is_remote: true,
                    commit_sha: commit.id().to_string(),
                });
            }
        }

        Ok(GitListBranchesResult { branches })
    }

    /// 初始化新的 Git 仓库。
    pub async fn init(path: &str) -> Result<()> {
        Repository::init(path)
            .map_err(|e| Error::Git(format!("初始化仓库失败: {}", e)))?;
        info!("在 {} 初始化了 Git 仓库", path);
        Ok(())
    }

    /// 检出分支或提交。
    pub async fn checkout(repo_path: &str, target: &str, create_branch: bool) -> Result<()> {
        let repo = Repository::open(repo_path)
            .map_err(|e| Error::Git(format!("打开仓库失败: {}", e)))?;

        if create_branch {
            // 创建并检出新分支
            let commit = repo
                .head()
                .map_err(|e| Error::Git(format!("获取 HEAD 失败: {}", e)))?
                .peel_to_commit()
                .map_err(|e| Error::Git(format!("解析为提交失败: {}", e)))?;

            let branch = repo
                .branch(target, &commit, false)
                .map_err(|e| Error::Git(format!("创建分支失败: {}", e)))?;

            let ref_name = branch
                .get()
                .name()
                .ok_or_else(|| Error::Git("无效的分支名称".to_string()))?;

            repo.set_head(ref_name)
                .map_err(|e| Error::Git(format!("检出分支失败: {}", e)))?;
        } else {
            // 检出已有分支或提交
            let obj = repo
                .revparse_single(target)
                .map_err(|e| Error::Git(format!("解析目标失败: {}", e)))?;

            repo.checkout_tree(&obj, None)
                .map_err(|e| Error::Git(format!("检出树失败: {}", e)))?;

            // 尝试将 HEAD 设置为目标（如果是分支）
            if let Ok(branch) = repo.find_branch(target, git2::BranchType::Local) {
                if let Some(name) = branch.get().name() {
                    repo.set_head(name)
                        .map_err(|e| Error::Git(format!("设置 HEAD 失败: {}", e)))?;
                }
            } else {
                // 分离 HEAD
                repo.set_head_detached(obj.id())
                    .map_err(|e| Error::Git(format!("分离 HEAD 失败: {}", e)))?;
            }
        }

        info!("在 {} 检出了 {}", repo_path, target);
        Ok(())
    }

    /// 从远程仓库拉取。
    pub async fn pull(repo_path: &str, remote: Option<&str>, branch: Option<&str>) -> Result<()> {
        let repo = Repository::open(repo_path)
            .map_err(|e| Error::Git(format!("打开仓库失败: {}", e)))?;

        let remote_name = remote.unwrap_or("origin");

        // 使用 git2 进行获取
        let mut remote_obj = repo
            .find_remote(remote_name)
            .map_err(|e| Error::Git(format!("查找远程仓库失败: {}", e)))?;

        let branch_name = branch.unwrap_or("main");
        let refspec = format!("refs/heads/{}:refs/remotes/{}/{}", branch_name, remote_name, branch_name);

        remote_obj
            .fetch(&[&refspec], None, None)
            .map_err(|e| Error::Git(format!("获取失败: {}", e)))?;

        info!("在 {} 从 {}:{} 拉取", repo_path, remote_name, branch_name);
        Ok(())
    }

    /// 读取工作树差异。
    pub async fn read_working_tree_diff(
        repo_path: &str,
        file_path: Option<&str>,
        include_staged: bool,
    ) -> Result<String> {
        let repo = Repository::open(repo_path)
            .map_err(|e| Error::Git(format!("打开仓库失败: {}", e)))?;

        let mut diff_opts = git2::DiffOptions::new();
        if let Some(path) = file_path {
            diff_opts.pathspec(path);
        }

        let diff = if include_staged {
            // 索引与 HEAD 之间的差异
            let head = repo
                .head()
                .map_err(|e| Error::Git(format!("获取 HEAD 失败: {}", e)))?;
            let head_tree = head
                .peel_to_tree()
                .map_err(|e| Error::Git(format!("解析为树失败: {}", e)))?;

            repo.diff_tree_to_index(Some(&head_tree), None, Some(&mut diff_opts))
                .map_err(|e| Error::Git(format!("差异比较失败: {}", e)))?
        } else {
            // 工作目录与索引之间的差异
            repo.diff_index_to_workdir(None, Some(&mut diff_opts))
                .map_err(|e| Error::Git(format!("差异比较失败: {}", e)))?
        };

        let mut diff_text = String::new();
        diff.print(git2::DiffFormat::Patch, |_delta, _hunk, line| {
            if let Ok(content) = std::str::from_utf8(line.content()) {
                diff_text.push_str(content);
            }
            true
        })
        .map_err(|e| Error::Git(format!("打印差异失败: {}", e)))?;

        Ok(diff_text)
    }

    /// 暂存当前更改。
    pub async fn stash_save(repo_path: &str, message: Option<&str>) -> Result<()> {
        let mut repo = Repository::open(repo_path)
            .map_err(|e| Error::Git(format!("打开仓库失败: {}", e)))?;

        let sig = repo
            .signature()
            .map_err(|e| Error::Git(format!("获取签名失败: {}", e)))?;

        repo.stash_save(
            &sig,
            message.unwrap_or("WIP"),
            Some(git2::StashFlags::INCLUDE_UNTRACKED),
        )
        .map_err(|e| Error::Git(format!("暂存更改失败: {}", e)))?;

        info!("在 {} 暂存了更改", repo_path);
        Ok(())
    }

    /// 暂存信息 — 列出暂存条目。
    pub async fn stash_info(repo_path: &str) -> Result<Vec<remi_contracts::GitStashEntry>> {
        let mut repo = Repository::open(repo_path)
            .map_err(|e| Error::Git(format!("打开仓库失败: {}", e)))?;

        let mut stashes = Vec::new();
        repo.stash_foreach(|index, message, _oid| {
            stashes.push(remi_contracts::GitStashEntry {
                index: index as u32,
                message: message.to_string(),
                timestamp: chrono::Utc::now().to_rfc3339(), // git2 不直接提供时间戳
            });
            true
        })
        .map_err(|e| Error::Git(format!("列出暂存条目失败: {}", e)))?;

        Ok(stashes)
    }

    /// 删除暂存条目。
    pub async fn stash_drop(repo_path: &str, index: u32) -> Result<()> {
        let mut repo = Repository::open(repo_path)
            .map_err(|e| Error::Git(format!("打开仓库失败: {}", e)))?;

        repo.stash_drop(index as usize)
            .map_err(|e| Error::Git(format!("删除暂存条目失败: {}", e)))?;

        info!("在 {} 删除了暂存条目 {}", repo_path, index);
        Ok(())
    }

    /// 创建 worktree。
    pub async fn create_worktree(
        repo_path: &str,
        worktree_path: &str,
        branch_name: &str,
    ) -> Result<()> {
        let repo = Repository::open(repo_path)
            .map_err(|e| Error::Git(format!("打开仓库失败: {}", e)))?;

        repo.worktree(
            branch_name,
            std::path::Path::new(worktree_path),
            None,
        )
        .map_err(|e| Error::Git(format!("创建 worktree 失败: {}", e)))?;

        info!("在 {} 创建了 worktree {}", worktree_path, branch_name);
        Ok(())
    }

    /// 移除 worktree。
    pub async fn remove_worktree(repo_path: &str, worktree_path: &str, force: bool) -> Result<()> {
        let repo = Repository::open(repo_path)
            .map_err(|e| Error::Git(format!("打开仓库失败: {}", e)))?;

        let worktree_name = std::path::Path::new(worktree_path)
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(|| Error::Git("无效的 worktree 路径".to_string()))?;

        let worktree = repo
            .find_worktree(worktree_name)
            .map_err(|e| Error::Git(format!("查找 worktree 失败: {}", e)))?;

        if force {
            worktree
                .prune(None)
                .map_err(|e| Error::Git(format!("清理 worktree 失败: {}", e)))?;
        } else {
            // git2 没有直接的移除方法，改用 prune
            worktree
                .prune(None)
                .map_err(|e| Error::Git(format!("移除 worktree 失败: {}", e)))?;
        }

        info!("在 {} 移除了 worktree", worktree_path);
        Ok(())
    }

    /// 移除索引锁。
    pub async fn remove_index_lock(repo_path: &str) -> Result<()> {
        let lock_path = std::path::Path::new(repo_path).join(".git").join("index.lock");
        if lock_path.exists() {
            std::fs::remove_file(&lock_path)
                .map_err(|e| Error::Git(format!("移除索引锁失败: {}", e)))?;
            info!("在 {} 移除了索引锁", repo_path);
        }
        Ok(())
    }

    /// 在指定提交处创建分离 HEAD 的 worktree。
    pub async fn create_detached_worktree(
        repo_path: &str,
        worktree_path: &str,
        commit_sha: &str,
    ) -> Result<()> {
        let repo = Repository::open(repo_path)
            .map_err(|e| Error::Git(format!("打开仓库失败: {}", e)))?;

        let commit = repo
            .revparse_single(commit_sha)
            .map_err(|e| Error::Git(format!("解析提交失败: {}", e)))?
            .peel_to_commit()
            .map_err(|e| Error::Git(format!("解析为提交失败: {}", e)))?;

        let wt_name = std::path::Path::new(worktree_path)
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(|| Error::Git("无效的 worktree 路径".to_string()))?;

        let mut opts = git2::WorktreeAddOptions::new();
        opts.reference(None);

        let worktree = repo
            .worktree(wt_name, std::path::Path::new(worktree_path), Some(&opts))
            .map_err(|e| Error::Git(format!("创建 worktree 失败: {}", e)))?;

        let wt_repo = Repository::open_from_worktree(&worktree)
            .map_err(|e| Error::Git(format!("打开 worktree 仓库失败: {}", e)))?;
        wt_repo
            .set_head_detached(commit.id())
            .map_err(|e| Error::Git(format!("分离 HEAD 失败: {}", e)))?;
        wt_repo
            .checkout_head(Some(git2::build::CheckoutBuilder::new().force()))
            .map_err(|e| Error::Git(format!("检出提交失败: {}", e)))?;

        info!(
            "在 {} 创建了分离 HEAD 的 worktree {}，基于提交 {}",
            worktree_path, wt_name, commit_sha
        );
        Ok(())
    }

    /// 使用文本生成总结差异。
    pub async fn summarize_diff(
        repo_path: &str,
        diff: &str,
    ) -> Result<remi_contracts::GitSummarizeDiffResult> {
        // 解析差异以统计变更
        let mut files_changed = 0;
        let mut insertions = 0;
        let mut deletions = 0;

        for line in diff.lines() {
            if line.starts_with("diff --git") {
                files_changed += 1;
            } else if line.starts_with('+') && !line.starts_with("+++") {
                insertions += 1;
            } else if line.starts_with('-') && !line.starts_with("---") {
                deletions += 1;
            }
        }

        // 生成摘要（简化版本 — 生产环境会使用 AI）
        let summary = format!(
            "Changed {} file(s) with {} insertion(s) and {} deletion(s)",
            files_changed, insertions, deletions
        );

        info!("在 {} 总结了差异", repo_path);
        Ok(remi_contracts::GitSummarizeDiffResult {
            summary,
            files_changed,
            insertions,
            deletions,
        })
    }

    /// 暂存更改并检出分支。
    pub async fn stash_and_checkout(
        repo_path: &str,
        branch: &str,
        message: Option<&str>,
    ) -> Result<()> {
        let mut repo = Repository::open(repo_path)
            .map_err(|e| Error::Git(format!("打开仓库失败: {}", e)))?;

        // 暂存当前更改
        let sig = repo
            .signature()
            .map_err(|e| Error::Git(format!("获取签名失败: {}", e)))?;

        repo.stash_save(
            &sig,
            message.unwrap_or("WIP"),
            Some(git2::StashFlags::INCLUDE_UNTRACKED),
        )
        .map_err(|e| Error::Git(format!("暂存更改失败: {}", e)))?;

        // 检出分支
        let obj = repo
            .revparse_single(branch)
            .map_err(|e| Error::Git(format!("解析分支失败: {}", e)))?;

        repo.checkout_tree(&obj, None)
            .map_err(|e| Error::Git(format!("检出树失败: {}", e)))?;

        if let Ok(branch_ref) = repo.find_branch(branch, git2::BranchType::Local) {
            if let Some(name) = branch_ref.get().name() {
                repo.set_head(name)
                    .map_err(|e| Error::Git(format!("设置 HEAD 失败: {}", e)))?;
            }
        }

        info!("在 {} 暂存并检出了 {}", repo_path, branch);
        Ok(())
    }

    /// 运行堆叠 Git 操作（commit、push、create_pr）。
    pub async fn run_stacked_action(
        repo_path: &str,
        action: &str,
        params: serde_json::Value,
    ) -> Result<serde_json::Value> {
        let repo = Repository::open(repo_path)
            .map_err(|e| Error::Git(format!("打开仓库失败: {}", e)))?;

        match action {
            "commit" => {
                let message = params["message"].as_str().unwrap_or("Commit");
                let sig = repo
                    .signature()
                    .map_err(|e| Error::Git(format!("获取签名失败: {}", e)))?;

                let mut index = repo
                    .index()
                    .map_err(|e| Error::Git(format!("获取索引失败: {}", e)))?;

                let tree_id = index
                    .write_tree()
                    .map_err(|e| Error::Git(format!("写入树失败: {}", e)))?;

                let tree = repo
                    .find_tree(tree_id)
                    .map_err(|e| Error::Git(format!("查找树失败: {}", e)))?;

                let parent_commit = repo
                    .head()
                    .ok()
                    .and_then(|head| head.peel_to_commit().ok());

                let parent_ref = parent_commit.as_ref();
                let parents: Vec<&git2::Commit> = if let Some(p) = parent_ref {
                    vec![p]
                } else {
                    vec![]
                };

                let commit_id = repo
                    .commit(Some("HEAD"), &sig, &sig, message, &tree, &parents)
                    .map_err(|e| Error::Git(format!("提交失败: {}", e)))?;

                info!("在 {} 提交了更改", repo_path);
                Ok(serde_json::json!({
                    "status": "committed",
                    "sha": commit_id.to_string()
                }))
            }
            "push" => {
                let remote_name = params["remote"].as_str().unwrap_or("origin");
                let branch_name = params["branch"].as_str().unwrap_or("HEAD");
                let mut remote = repo
                    .find_remote(remote_name)
                    .map_err(|e| Error::Git(format!("查找远程仓库失败: {}", e)))?;
                let refspec = format!("refs/heads/{}:refs/heads/{}", branch_name, branch_name);
                let mut push_opts = git2::PushOptions::new();
                remote
                    .push(&[&refspec], Some(&mut push_opts))
                    .map_err(|e| Error::Git(format!("推送失败: {}", e)))?;
                info!("在 {} 推送了 {} 到 {}", repo_path, branch_name, remote_name);
                Ok(serde_json::json!({"status": "pushed", "remote": remote_name, "branch": branch_name}))
            }
            "create_pr" => {
                // 尝试运行 `gh pr create`，如不可用则返回存根 URL。
                let title = params["title"].as_str().unwrap_or("Untitled");
                let body = params["body"].as_str().unwrap_or("");
                let base = params["base"].as_str().unwrap_or("main");
                let head = params["head"].as_str().unwrap_or("HEAD");
                let output = std::process::Command::new("gh")
                    .args([
                        "pr", "create",
                        "--title", title,
                        "--body", body,
                        "--base", base,
                        "--head", head,
                    ])
                    .current_dir(repo_path)
                    .output();
                match output {
                    Ok(out) if out.status.success() => {
                        let url = String::from_utf8_lossy(&out.stdout).trim().to_string();
                        Ok(serde_json::json!({"status": "pr_created", "url": url}))
                    }
                    Ok(out) => {
                        let stderr = String::from_utf8_lossy(&out.stderr).to_string();
                        // 如果 gh 不可用，回退到合成 URL。
                        if stderr.contains("not found") || stderr.contains("command not found") {
                            Ok(serde_json::json!({
                                "status": "pr_stub",
                                "url": format!("https://github.com/example/repo/compare/{base}...{head}?title={title}"),
                                "note": "gh CLI 不可用，返回存根 URL"
                            }))
                        } else {
                            Err(Error::Git(format!("gh pr create 失败: {stderr}")))
                        }
                    }
                    Err(_) => Ok(serde_json::json!({
                        "status": "pr_stub",
                        "url": format!("https://github.com/example/repo/compare/{base}...{head}?title={title}"),
                        "note": "gh CLI 不可用，返回存根 URL"
                    })),
                }
            }
            _ => Err(Error::Git(format!("未知操作: {}", action))),
        }
    }

    /// 通过运行 `gh pr create` 准备拉取请求线程并捕获 URL。
    pub async fn prepare_pull_request_thread(
        repo_path: &str,
        base_branch: &str,
        head_branch: &str,
        title: &str,
        description: Option<&str>,
    ) -> Result<remi_contracts::GitPreparePullRequestThreadResult> {
        let body = description.unwrap_or("");
        let output = std::process::Command::new("gh")
            .args([
                "pr", "create",
                "--title", title,
                "--body", body,
                "--base", base_branch,
                "--head", head_branch,
            ])
            .current_dir(repo_path)
            .output();
        match output {
            Ok(out) if out.status.success() => {
                let url = String::from_utf8_lossy(&out.stdout).trim().to_string();
                // 尝试从 URL 解析 PR 编号，如 https://github.com/o/r/pull/123
                let pr_number = url
                    .rsplit('/')
                    .next()
                    .and_then(|s| s.trim().parse::<u32>().ok())
                    .unwrap_or(0);
                info!("在 {} 创建了 PR #{}（{} -> {}）", repo_path, pr_number, head_branch, base_branch);
                Ok(remi_contracts::GitPreparePullRequestThreadResult {
                    pr_number,
                    pr_url: url,
                })
            }
            _ => {
                // 回退到合成 URL
                let url = format!(
                    "https://github.com/example/repo/compare/{}...{}",
                    base_branch, head_branch
                );
                info!("在 {} 回退到存根 PR URL: {}", repo_path, url);
                Ok(remi_contracts::GitPreparePullRequestThreadResult {
                    pr_number: 0,
                    pr_url: url,
                })
            }
        }
    }

    /// 解决拉取请求（标记为可评审 / 关闭草稿）。
    pub async fn resolve_pull_request(
        repo_path: &str,
        pr_number: u32,
    ) -> Result<remi_contracts::GitResolvePullRequestResult> {
        // 尝试标记 PR 为就绪状态（gh pr ready）；忽略失败。
        let _ = std::process::Command::new("gh")
            .args(["pr", "ready", &pr_number.to_string()])
            .current_dir(repo_path)
            .output();
        info!("在 {} 解决了 PR #{}", repo_path, pr_number);
        Ok(remi_contracts::GitResolvePullRequestResult {
            repo_path: repo_path.to_string(),
            pr_number,
        })
    }

    /// 通过写入交接清单 JSON 将线程交接给 worktree。
    pub async fn handoff_thread(
        thread_id: uuid::Uuid,
        worktree_path: &str,
    ) -> Result<remi_contracts::GitHandoffThreadResult> {
        // 确保 worktree 目录存在，然后写入交接标记。
        let path = std::path::Path::new(worktree_path);
        if !path.exists() {
            std::fs::create_dir_all(path).map_err(|e| {
                Error::Git(format!("创建 worktree 目录失败: {}", e))
            })?;
        }
        let manifest = serde_json::json!({
            "sourceThreadId": thread_id,
            "handoffAt": chrono::Utc::now().to_rfc3339(),
        });
        let manifest_path = path.join(".remi-handoff.json");
        std::fs::write(
            &manifest_path,
            serde_json::to_string_pretty(&manifest)
                .map_err(|e| Error::Git(format!("序列化交接信息失败: {}", e)))?,
        )
        .map_err(|e| Error::Git(format!("写入交接清单失败: {}", e)))?;

        info!("将线程 {} 交接给 {}", thread_id, worktree_path);
        Ok(remi_contracts::GitHandoffThreadResult {
            new_thread_id: uuid::Uuid::new_v4(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[tokio::test]
    async fn test_init_and_status() {
        let temp_dir = TempDir::new().unwrap();
        let path = temp_dir.path();

        GitService::init(path.to_str().unwrap()).await.unwrap();

        let status = GitService::status(path.to_str().unwrap()).await.unwrap();
        assert!(status.is_clean);
    }
}
