//! Git 高级操作管理

use std::sync::Arc;

use tracing::{info, warn};

use crate::core::{GitCore, GitStatusResult};
use crate::error::{GitError, GitResult};

/// Git 操作输入
#[derive(Debug, Clone)]
pub struct GitRunStackedActionInput {
    /// 工作目录
    pub cwd: String,
    /// 操作类型
    pub action: GitAction,
    /// 提交消息
    pub commit_message: Option<String>,
    /// 功能分支名称
    pub feature_branch: Option<String>,
}

/// Git 操作类型
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GitAction {
    /// 提交
    Commit,
    /// 推送
    Push,
    /// 创建 PR
    CreatePr,
    /// 提交并推送
    CommitPush,
    /// 提交、推送并创建 PR
    CommitPushPr,
}

/// Git 操作结果
#[derive(Debug, Clone)]
pub struct GitRunStackedActionResult {
    /// 操作是否成功
    pub success: bool,
    /// 提交 SHA（如果有）
    pub commit_sha: Option<String>,
    /// PR URL（如果有）
    pub pr_url: Option<String>,
    /// 操作消息
    pub message: String,
}

/// Git 管理器
pub struct GitManager {
    core: Arc<GitCore>,
}

impl GitManager {
    /// 创建新的 Git 管理器
    pub fn new(core: Arc<GitCore>) -> Self {
        Self { core }
    }

    /// 获取 Git 状态
    pub async fn status(&self, cwd: &str) -> GitResult<GitStatusResult> {
        self.core.status(cwd).await
    }

    /// 运行堆叠操作
    pub async fn run_stacked_action(
        &self,
        input: GitRunStackedActionInput,
    ) -> GitResult<GitRunStackedActionResult> {
        info!("运行 Git 堆叠操作: {:?}", input.action);

        // 如果有功能分支，先创建并切换
        if let Some(branch_name) = &input.feature_branch {
            info!("创建功能分支: {}", branch_name);

            // 检查分支是否已存在
            let branches = self.core.list_branches(&input.cwd).await?;
            if !branches.contains(branch_name) {
                self.core.create_branch(&input.cwd, branch_name).await?;
            }

            self.core.checkout_branch(&input.cwd, branch_name).await?;
        }

        match input.action {
            GitAction::Commit => {
                let message = input.commit_message.as_deref().unwrap_or("Update");
                let commit_sha = self.core.commit(&input.cwd, message).await?;

                Ok(GitRunStackedActionResult {
                    success: true,
                    commit_sha: Some(commit_sha),
                    pr_url: None,
                    message: "提交成功".to_string(),
                })
            }
            GitAction::Push => {
                self.core.push_current_branch(&input.cwd).await?;

                Ok(GitRunStackedActionResult {
                    success: true,
                    commit_sha: None,
                    pr_url: None,
                    message: "推送成功".to_string(),
                })
            }
            GitAction::CreatePr => {
                // TODO: 实现 PR 创建逻辑（需要调用 GitHub API）
                warn!("PR 创建功能尚未实现");

                Ok(GitRunStackedActionResult {
                    success: false,
                    commit_sha: None,
                    pr_url: None,
                    message: "PR 创建功能尚未实现".to_string(),
                })
            }
            GitAction::CommitPush => {
                let message = input.commit_message.as_deref().unwrap_or("Update");
                let commit_sha = self.core.commit(&input.cwd, message).await?;
                self.core.push_current_branch(&input.cwd).await?;

                Ok(GitRunStackedActionResult {
                    success: true,
                    commit_sha: Some(commit_sha),
                    pr_url: None,
                    message: "提交并推送成功".to_string(),
                })
            }
            GitAction::CommitPushPr => {
                let message = input.commit_message.as_deref().unwrap_or("Update");
                let commit_sha = self.core.commit(&input.cwd, message).await?;
                self.core.push_current_branch(&input.cwd).await?;

                // TODO: 实现 PR 创建逻辑
                warn!("PR 创建功能尚未实现");

                Ok(GitRunStackedActionResult {
                    success: true,
                    commit_sha: Some(commit_sha),
                    pr_url: None,
                    message: "提交并推送成功，PR 创建功能尚未实现".to_string(),
                })
            }
        }
    }

    /// 读取工作区 diff
    pub async fn read_working_tree_diff(&self, cwd: &str) -> GitResult<String> {
        self.core.diff(cwd, false).await
    }

    /// 读取暂存区 diff
    pub async fn read_staged_diff(&self, cwd: &str) -> GitResult<String> {
        self.core.diff(cwd, true).await
    }

    /// 准备 PR 线程（创建 worktree 并切换）
    pub async fn prepare_pull_request_thread(
        &self,
        cwd: &str,
        pr_number: u64,
        worktree_path: &str,
    ) -> GitResult<String> {
        let branch_name = format!("pr-{}", pr_number);

        info!("准备 PR 线程: PR #{}, 分支: {}", pr_number, branch_name);

        // 创建 worktree
        self.core
            .create_worktree(cwd, worktree_path, &branch_name)
            .await?;

        Ok(branch_name)
    }

    /// 切换线程（在 Local 和 Worktree 之间切换）
    pub async fn handoff_thread(
        &self,
        cwd: &str,
        target_branch: &str,
    ) -> GitResult<()> {
        info!("切换线程到分支: {}", target_branch);

        // 检查是否有未提交的更改
        let status = self.core.status(cwd).await?;
        if status.is_dirty {
            info!("工作区有未提交的更改，先暂存");
            self.core.stash(cwd).await?;

            // 切换分支
            self.core.checkout_branch(cwd, target_branch).await?;

            // 恢复暂存
            if let Err(e) = self.core.stash_pop(cwd).await {
                warn!("恢复暂存失败: {}", e);
            }
        } else {
            self.core.checkout_branch(cwd, target_branch).await?;
        }

        Ok(())
    }
}
