//! # Git 高级操作管理器
//!
//! 本模块提供 Git 高级操作的编排和管理功能，是面向业务逻辑的核心组件。
//!
//! ## 模块职责
//!
//! - **堆叠式操作编排**：将多个 Git 操作（提交、推送、创建 PR）组合为原子化的工作流
//! - **功能分支管理**：自动创建和切换功能分支，支持特性开发流程
//! - **Worktree 线程管理**：为 PR 创建独立的 worktree，支持并行审查和修改
//! - **线程切换**：在不同 worktree 之间安全切换，自动处理未提交更改的暂存和恢复
//! - **Diff 查询**：提供工作区和暂存区的差异查询接口
//!
//! ## 核心概念
//!
//! ### 堆叠式操作（Stacked Action）
//!
//! 堆叠式操作是将多个 Git 操作组合为一个原子化工作流的设计模式。
//! 常见的组合包括：
//! - `Commit`: 仅提交
//! - `Push`: 仅推送
//! - `CommitPush`: 提交并推送
//! - `CreatePr`: 创建 Pull Request
//! - `CommitPushPr`: 提交、推送并创建 PR（完整的代码提交流程）
//!
//! ### 线程（Thread）
//!
//! 在 Remi 系统中，"线程"指的是一个独立的工作上下文，通常对应一个 Git worktree。
//! 每个线程可以独立进行代码修改、提交和审查，互不干扰。
//!
//! ## 使用场景
//!
//! - **AI Agent 代码修改**：Agent 在独立的 worktree 中修改代码，完成后执行堆叠式操作
//! - **PR 审查工作流**：为每个 PR 创建独立的 worktree，审查完成后切换回主分支
//! - **多任务并行开发**：同时处理多个功能分支或 PR，通过 worktree 实现隔离
//!
//! ## 典型用法
//!
//! ```rust,no_run
//! use std::sync::Arc;
//! use remi_git::{GitCore, GitManager, GitRunStackedActionInput, GitAction};
//!
//! let core = Arc::new(GitCore::new());
//! let manager = GitManager::new(core);
//!
//! // 执行提交并推送操作
//! let result = manager.run_stacked_action(GitRunStackedActionInput {
//!     cwd: "/path/to/repo".to_string(),
//!     action: GitAction::CommitPush,
//!     commit_message: Some("feat: add new feature".to_string()),
//!     feature_branch: None,
//! }).await?;
//!
//! println!("操作结果: {}", result.message);
//! ```

use std::sync::Arc;

use tracing::{info, warn};

use crate::core::{GitCore, GitStatusResult};
use crate::error::GitResult;

/// Git 堆叠式操作输入参数
///
/// 封装执行堆叠式操作所需的所有配置信息。
///
/// # 字段说明
///
/// - `cwd`: 工作目录，Git 操作将在此目录下执行
/// - `action`: 要执行的操作类型（提交、推送、创建 PR 等）
/// - `commit_message`: 提交消息（仅当 action 包含提交操作时使用）
/// - `feature_branch`: 功能分支名称（如果指定，会先创建并切换到该分支）
///
/// # 使用示例
///
/// ```rust
/// use remi_git::{GitRunStackedActionInput, GitAction};
///
/// let input = GitRunStackedActionInput {
///     cwd: "/path/to/repo".to_string(),
///     action: GitAction::CommitPush,
///     commit_message: Some("feat: add login feature".to_string()),
///     feature_branch: Some("feature/login".to_string()),
/// };
/// ```
///
/// # 注意事项
///
/// - 如果 `feature_branch` 已存在，会直接切换到该分支而不会报错
/// - 如果 `commit_message` 为 None 且操作需要提交，会使用默认消息 "Update"
#[derive(Debug, Clone)]
pub struct GitRunStackedActionInput {
    /// Git 操作的工作目录（必须是绝对路径）
    pub cwd: String,
    /// 要执行的操作类型
    pub action: GitAction,
    /// 提交消息（可选，仅用于包含提交操作的 action）
    pub commit_message: Option<String>,
    /// 功能分支名称（可选，如果指定则先创建/切换到该分支）
    pub feature_branch: Option<String>,
}

/// Git 操作类型枚举
///
/// 定义了所有支持的堆叠式操作类型。每个变体代表一种常用的 Git 工作流组合。
///
/// # 变体说明
///
/// | 变体 | 操作序列 | 使用场景 |
/// |------|---------|---------|
/// | `Commit` | `git commit` | 本地提交，不推送 |
/// | `Push` | `git push` | 推送已有的提交到远程 |
/// | `CreatePr` | 创建 Pull Request | 在远程仓库创建 PR（TODO: 待实现） |
/// | `CommitPush` | `commit` → `push` | 提交并推送，最常用的提交流程 |
/// | `CommitPushPr` | `commit` → `push` → 创建 PR | 完整的代码提交流程（PR 创建待实现） |
///
/// # 实现状态
///
/// - ✅ `Commit`: 已实现
/// - ✅ `Push`: 已实现
/// - ⏳ `CreatePr`: 待实现（需要集成 GitHub/GitLab API）
/// - ✅ `CommitPush`: 已实现
/// - ⚠️ `CommitPushPr`: 部分实现（PR 创建待完成）
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GitAction {
    /// 仅提交到本地仓库
    ///
    /// 执行 `git commit -m <message>`，将暂存区的更改提交到当前分支。
    /// 不会推送到远程仓库。
    Commit,

    /// 仅推送到远程仓库
    ///
    /// 执行 `git push`，将本地提交推送到远程跟踪分支。
    /// 前提是有已提交但未推送的更改。
    Push,

    /// 创建 Pull Request
    ///
    /// 在远程仓库（GitHub/GitLab）创建 Pull Request。
    /// ⚠️ 此功能尚未实现，需要集成相应的 API。
    CreatePr,

    /// 提交并推送
    ///
    /// 执行 `git commit` 后紧跟 `git push`，是最常用的代码提交流程。
    /// 如果提交消息为空，使用默认消息 "Update"。
    CommitPush,

    /// 提交、推送并创建 Pull Request
    ///
    /// 完整的代码提交流程：先提交本地更改，再推送到远程，最后创建 PR。
    /// ⚠️ PR 创建部分尚未实现，目前仅完成提交和推送。
    CommitPushPr,
}

/// Git 堆叠式操作结果
///
/// 封装堆叠式操作执行后的结果信息。
///
/// # 字段说明
///
/// - `success`: 操作是否成功完成
/// - `commit_sha`: 新创建的 commit SHA（仅当操作包含提交时有效）
/// - `pr_url`: 创建的 PR URL（仅当操作包含创建 PR 时有效，目前始终为 None）
/// - `message`: 操作结果的可读描述信息
///
/// # 使用示例
///
/// ```rust
/// let result = manager.run_stacked_action(input).await?;
/// if result.success {
///     println!("操作成功: {}", result.message);
///     if let Some(sha) = result.commit_sha {
///         println!("提交 SHA: {}", sha);
///     }
/// }
/// ```
#[derive(Debug, Clone)]
pub struct GitRunStackedActionResult {
    /// 操作是否成功
    pub success: bool,
    /// 新创建的 commit SHA（如果操作包含提交）
    pub commit_sha: Option<String>,
    /// 创建的 PR URL（如果操作包含创建 PR，目前始终为 None）
    pub pr_url: Option<String>,
    /// 操作结果描述信息
    pub message: String,
}

/// Git 高级操作管理器
///
/// 提供面向业务逻辑的 Git 操作编排功能。本结构体封装了 `GitCore`，
/// 在其基础上提供更高层次的操作组合和工作流管理。
///
/// # 字段说明
///
/// - `core`: Git 核心服务实例，用于执行底层 Git 命令
///
/// # 设计原则
///
/// - **组合优于继承**：通过组合 `GitCore` 获得底层能力，而非继承
/// - **工作流导向**：提供面向业务场景的操作组合，而非简单的命令封装
/// - **安全性优先**：在危险操作前自动检查状态（如切换分支前检查 `is_dirty`）
///
/// # 使用示例
///
/// ```rust
/// use std::sync::Arc;
/// use remi_git::{GitCore, GitManager};
///
/// let core = Arc::new(GitCore::new());
/// let manager = GitManager::new(core);
///
/// // 获取仓库状态
/// let status = manager.status("/path/to/repo").await?;
///
/// // 执行堆叠式操作
/// let result = manager.run_stacked_action(input).await?;
/// ```
pub struct GitManager {
    /// Git 核心服务实例
    core: Arc<GitCore>,
}

impl GitManager {
    /// 创建新的 Git 管理器实例
    ///
    /// # 参数
    ///
    /// - `core`: Git 核心服务，通常包装在 `Arc` 中供多个组件共享
    ///
    /// # 返回值
    ///
    /// 返回一个新的 `GitManager` 实例。
    ///
    /// # 使用示例
    ///
    /// ```rust
    /// let core = Arc::new(GitCore::new());
    /// let manager = GitManager::new(core);
    /// ```
    pub fn new(core: Arc<GitCore>) -> Self {
        Self { core }
    }

    /// 获取 Git 仓库状态
    ///
    /// 委托给 `GitCore::status` 获取仓库的完整状态信息。
    ///
    /// # 参数
    ///
    /// - `cwd`: 仓库工作目录的绝对路径
    ///
    /// # 返回值
    ///
    /// - `Ok(GitStatusResult)`: 仓库的当前状态
    /// - `Err(GitError)`: 状态查询失败
    pub async fn status(&self, cwd: &str) -> GitResult<GitStatusResult> {
        self.core.status(cwd).await
    }

    /// 执行 Git 堆叠式操作
    ///
    /// 根据输入参数执行组合化的 Git 操作工作流。支持自动创建功能分支、
    /// 提交、推送和创建 PR 等操作的各种组合。
    ///
    /// # 参数
    ///
    /// - `input`: 操作输入参数，包括操作类型、提交消息、功能分支等
    ///
    /// # 返回值
    ///
    /// - `Ok(GitRunStackedActionResult)`: 操作结果，包含成功状态、commit SHA、PR URL 等
    /// - `Err(GitError)`: 操作执行失败
    ///
    /// # 执行流程
    ///
    /// 1. 如果指定了 `feature_branch`：
    ///    - 检查分支是否已存在，不存在则创建
    ///    - 切换到该分支
    /// 2. 根据 `action` 类型执行对应的操作序列：
    ///    - `Commit`: 提交更改
    ///    - `Push`: 推送到远程
    ///    - `CommitPush`: 提交后推送
    ///    - `CreatePr`: 创建 PR（待实现）
    ///    - `CommitPushPr`: 提交、推送后创建 PR（PR 部分待实现）
    ///
    /// # 使用示例
    ///
    /// ```rust
    /// let result = manager.run_stacked_action(GitRunStackedActionInput {
    ///     cwd: "/path/to/repo".to_string(),
    ///     action: GitAction::CommitPush,
    ///     commit_message: Some("feat: add feature".to_string()),
    ///     feature_branch: Some("feature/new".to_string()),
    /// }).await?;
    /// ```
    ///
    /// # 注意事项
    ///
    /// - 如果 `commit_message` 为 None，会使用默认消息 "Update"
    /// - PR 创建功能尚未实现，相关操作会返回 `success: false` 或部分成功
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

    /// 读取工作区差异
    ///
    /// 获取工作区（未暂存）与最近提交之间的文件差异。
    ///
    /// # 参数
    ///
    /// - `cwd`: 仓库工作目录的绝对路径
    ///
    /// # 返回值
    ///
    /// - `Ok(String)`: diff 输出（统一格式），如果没有更改则返回空字符串
    /// - `Err(GitError)`: 命令执行失败
    ///
    /// # 使用场景
    ///
    /// - AI Agent 分析当前工作区的更改内容
    /// - 提交前预览将要修改的文件
    pub async fn read_working_tree_diff(&self, cwd: &str) -> GitResult<String> {
        self.core.diff(cwd, false).await
    }

    /// 读取暂存区差异
    ///
    /// 获取暂存区（已 `git add`）与最近提交之间的文件差异。
    ///
    /// # 参数
    ///
    /// - `cwd`: 仓库工作目录的绝对路径
    ///
    /// # 返回值
    ///
    /// - `Ok(String)`: diff 输出（统一格式），如果暂存区为空则返回空字符串
    /// - `Err(GitError)`: 命令执行失败
    ///
    /// # 使用场景
    ///
    /// - 提交前确认暂存的更改内容
    /// - 代码审查时查看将要提交的更改
    pub async fn read_staged_diff(&self, cwd: &str) -> GitResult<String> {
        self.core.diff(cwd, true).await
    }

    /// 准备 PR 审查线程
    ///
    /// 为指定的 Pull Request 创建独立的 worktree，用于并行审查和修改。
    /// 创建的 worktree 会关联到一个新分支（命名格式：`pr-<number>`）。
    ///
    /// # 参数
    ///
    /// - `cwd`: 主仓库工作目录
    /// - `pr_number`: PR 编号
    /// - `worktree_path`: 新 worktree 的绝对路径
    ///
    /// # 返回值
    ///
    /// - `Ok(String)`: 创建的分支名称（格式：`pr-<number>`）
    /// - `Err(GitError)`: worktree 创建失败（路径冲突、分支名冲突等）
    ///
    /// # 使用场景
    ///
    /// - 为 PR 审查创建独立的工作空间
    /// - 在不影响当前工作的情况下审查和测试 PR
    ///
    /// # 使用示例
    ///
    /// ```rust
    /// let branch = manager.prepare_pull_request_thread(
    ///     "/path/to/repo",
    ///     123,
    ///     "/path/to/worktree/pr-123",
    /// ).await?;
    /// println!("已创建分支: {}", branch);
    /// ```
    ///
    /// # 后续操作
    ///
    /// 创建完成后，可以通过 `handoff_thread` 切换到该 worktree 进行审查。
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

    /// 切换工作线程
    ///
    /// 在不同的 worktree（或分支）之间安全切换。如果当前工作区有未提交的更改，
    /// 会自动执行 `git stash` 暂存更改，切换后再通过 `git stash pop` 恢复。
    ///
    /// # 参数
    ///
    /// - `cwd`: 当前工作目录
    /// - `target_branch`: 目标分支名称
    ///
    /// # 返回值
    ///
    /// - `Ok(())`: 切换成功
    /// - `Err(GitError)`: 切换失败（分支不存在、stash 冲突等）
    ///
    /// # 实现细节
    ///
    /// 1. 检查当前工作区是否有未提交的更改（`status.is_dirty`）
    /// 2. 如果有未提交更改：
    ///    - 执行 `git stash` 暂存更改
    ///    - 切换到目标分支
    ///    - 执行 `git stash pop` 恢复暂存的更改
    ///    - 如果恢复失败，记录警告但不中断操作
    /// 3. 如果没有未提交更改，直接切换分支
    ///
    /// # 使用场景
    ///
    /// - 在主分支和 PR 审查分支之间切换
    /// - 在多个功能分支之间切换
    ///
    /// # 注意事项
    ///
    /// - 如果 `stash pop` 产生冲突，需要手动解决
    /// - 切换后暂存的更改会应用到新的工作区，可能产生冲突
    ///
    /// # 使用示例
    ///
    /// ```rust
    /// // 切换到 PR 审查分支
    /// manager.handoff_thread("/path/to/repo", "pr-123").await?;
    ///
    /// // 审查完成后切换回主分支
    /// manager.handoff_thread("/path/to/repo", "main").await?;
    /// ```
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
