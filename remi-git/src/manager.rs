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
//! 在 Remi 系统中，'线程'指的是一个独立的工作上下文，通常对应一个 Git worktree。
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
//!```rust,ignore
//! #[tokio::main]
//! async fn main() {
//! use std::sync::Arc;
//! use remi_git::{GitCore, GitManager, GitRunStackedActionInput, GitAction};
//! 
//! let core = Arc::new(GitCore::new());
//! let manager = GitManager::new(core);
//! 
//! // 执行提交并推送操作
//! let result = manager.run_stacked_action(GitRunStackedActionInput {
//!     cwd: '/path/to/repo'.to_string(),
//!     action: GitAction::CommitPush,
//!     commit_message: Some('feat: add new feature'.to_string()),
//!     feature_branch: None,
//! }).await?;
//! 
//! println!('操作结果: {}', result.message);
//! }

use std::sync::Arc;
use serde::{Deserialize, Serialize};

use tokio::process::Command;
use tracing::{info, warn};

use crate::core::{GitCore, GitStatusResult};
use crate::error::{GitError, GitResult};

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
/// - `pr_title`: PR 标题（可选，未指定时使用 commit_message）
/// - `pr_body`: PR 描述（可选）
/// - `pr_base`: PR 目标分支（可选，未指定时使用仓库默认分支）
///
/// # 使用示例
///
///```rust,ignore
/// use remi_git::{GitRunStackedActionInput, GitAction};
///
/// let input = GitRunStackedActionInput {
///     cwd: '/path/to/repo'.to_string(),
///     action: GitAction::CommitPush,
///     commit_message: Some('feat: add login feature'.to_string()),
///     feature_branch: Some('feature/login'.to_string()),
///     pr_title: None,
///     pr_body: None,
///     pr_base: None,
/// };
/// ```
///
/// # 注意事项
///
/// - 如果 `feature_branch` 已存在，会直接切换到该分支而不会报错
/// - 如果 `commit_message` 为 None 且操作需要提交，会使用默认消息 'Update'
/// - PR 创建通过 `gh` CLI 实现，需要预先安装并登录 GitHub CLI
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
    /// PR 标题（可选，未指定时使用 commit_message）
    pub pr_title: Option<String>,
    /// PR 描述（可选）
    pub pr_body: Option<String>,
    /// PR 目标分支（可选，未指定时使用仓库默认分支）
    pub pr_base: Option<String>,
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
/// | `CreatePr` | 创建 Pull Request | 在远程仓库创建 PR（通过 `gh` CLI） |
/// | `CommitPush` | `commit` → `push` | 提交并推送，最常用的提交流程 |
/// | `CommitPushPr` | `commit` → `push` → 创建 PR | 完整的代码提交流程 |
///
/// # 实现状态
///
/// - ✅ `Commit`: 已实现
/// - ✅ `Push`: 已实现
/// - ✅ `CreatePr`: 已实现（通过 `gh` CLI）
/// - ✅ `CommitPush`: 已实现
/// - ✅ `CommitPushPr`: 已实现
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
    /// 通过 `gh pr create` 在 GitHub 仓库创建 Pull Request。
    /// 需要预先安装并登录 GitHub CLI (`gh`)。
    CreatePr,

    /// 提交并推送
    ///
    /// 执行 `git commit` 后紧跟 `git push`，是最常用的代码提交流程。
    /// 如果提交消息为空，使用默认消息 'Update'。
    CommitPush,

    /// 提交、推送并创建 Pull Request
    ///
    /// 完整的代码提交流程：先提交本地更改，再推送到远程，最后通过 `gh` CLI 创建 PR。
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
///```rust,ignore
/// #[tokio::main]
/// async fn main() {
/// let result = manager.run_stacked_action(input).await?;
/// if result.success {
///     println!("操作成功: {}", result.message);
///     if let Some(sha) = result.commit_sha {
///         println!("提交 SHA: {}", sha);
///     }
/// }
/// }
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
///```rust,ignore
/// #[tokio::main]
/// async fn main() {
/// use std::sync::Arc;
/// use remi_git::{GitCore, GitManager};
/// 
/// let core = Arc::new(GitCore::new());
/// let manager = GitManager::new(core);
/// 
/// // 获取仓库状态
/// let status = manager.status('/path/to/repo').await?;
/// 
/// // 执行堆叠式操作
/// let result = manager.run_stacked_action(input).await?;
/// }
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
    ///```rust,ignore
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
    /// - `input`: 操作输入参数，包括操作类型、提交消息、功能分支、PR 配置等
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
    ///    - `CreatePr`: 通过 `gh` CLI 创建 PR
    ///    - `CommitPushPr`: 提交、推送后创建 PR
    ///
    /// # 使用示例
    ///
    ///```rust,ignore
    /// #[tokio::main]
    /// async fn main() {
    /// let result = manager.run_stacked_action(GitRunStackedActionInput {
    ///     cwd: '/path/to/repo'.to_string(),
    ///     action: GitAction::CommitPush,
    ///     commit_message: Some('feat: add feature'.to_string()),
    ///     feature_branch: Some('feature/new'.to_string()),
    ///     pr_title: None,
    ///     pr_body: None,
    ///     pr_base: None,
    /// }).await?;
    /// }
    ///
    /// # 注意事项
    ///
    /// - 如果 `commit_message` 为 None，会使用默认消息 'Update'
    /// - PR 创建通过 `gh` CLI 实现，需要预先安装并登录
    /// - PR 标题未指定时使用 `commit_message`，两者都为空时使用 'Update'
    pub async fn run_stacked_action(
        &self,
        input: GitRunStackedActionInput,
    ) -> GitResult<GitRunStackedActionResult> {
        info!("运行 Git 堆叠操作: {:?}", input.action);

        // 如果有功能分支，先创建并切换
        // 这允许在执行堆叠操作前自动切换到目标功能分支
        if let Some(branch_name) = &input.feature_branch {
            info!("创建功能分支: {}", branch_name);

            // 检查分支是否已存在
            // 如果已存在则直接切换，避免因重复创建而报错
            let branches = self.core.list_branches(&input.cwd).await?;
            if !branches.contains(branch_name) {
                self.core.create_branch(&input.cwd, branch_name).await?;
            }

            self.core.checkout_branch(&input.cwd, branch_name).await?;
        }

        match input.action {
            // 仅提交：将暂存区更改提交到本地仓库
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
            // 仅推送：将本地提交推送到远程仓库
            GitAction::Push => {
                self.core.push_current_branch(&input.cwd).await?;

                Ok(GitRunStackedActionResult {
                    success: true,
                    commit_sha: None,
                    pr_url: None,
                    message: "推送成功".to_string(),
                })
            }
            // 仅创建 PR：通过 gh CLI 创建 Pull Request
            GitAction::CreatePr => {
                // PR 标题优先级：pr_title > commit_message > 默认值 'Update'
                let pr_title = input
                    .pr_title
                    .or(input.commit_message.clone())
                    .unwrap_or_else(|| "Update".to_string());
                let pr_url = self
                    .create_pull_request(
                        &input.cwd,
                        &pr_title,
                        input.pr_body.as_deref(),
                        input.pr_base.as_deref(),
                    )
                    .await?;

                Ok(GitRunStackedActionResult {
                    success: true,
                    commit_sha: None,
                    pr_url: Some(pr_url.clone()),
                    message: format!("PR 创建成功: {}", pr_url),
                })
            }
            // 提交并推送：先提交到本地，再推送到远程
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
            // 完整流程：提交 → 推送 → 创建 PR
            GitAction::CommitPushPr => {
                let message = input.commit_message.as_deref().unwrap_or("Update");
                let commit_sha = self.core.commit(&input.cwd, message).await?;
                self.core.push_current_branch(&input.cwd).await?;

                // PR 标题优先级：pr_title > commit_message > 默认值 'Update'
                let pr_title = input
                    .pr_title
                    .or(input.commit_message.clone())
                    .unwrap_or_else(|| "Update".to_string());
                let pr_url = self
                    .create_pull_request(
                        &input.cwd,
                        &pr_title,
                        input.pr_body.as_deref(),
                        input.pr_base.as_deref(),
                    )
                    .await?;

                Ok(GitRunStackedActionResult {
                    success: true,
                    commit_sha: Some(commit_sha),
                    pr_url: Some(pr_url.clone()),
                    message: format!("提交、推送并创建 PR 成功: {}", pr_url),
                })
            }
        }
    }

    /// 创建 Pull Request
    ///
    /// 通过 GitHub CLI (`gh`) 在远程仓库创建 Pull Request。
    /// 调用前需确保：
    /// 1. 已安装 `gh` CLI 并完成认证（`gh auth login`）
    /// 2. 当前分支已推送到远程
    /// 3. 仓库已关联 GitHub 远程仓库
    ///
    /// # 参数
    ///
    /// - `cwd`: 仓库工作目录的绝对路径
    /// - `title`: PR 标题
    /// - `body`: PR 描述（可选，为 None 时留空）
    /// - `base`: PR 目标分支（可选，为 None 时使用仓库默认分支）
    ///
    /// # 返回值
    ///
    /// - `Ok(String)`: 创建的 PR URL
    /// - `Err(GitError)`: 创建失败（`gh` 未安装、未认证、网络错误等）
    ///
    /// # 错误处理
    ///
    /// - 如果 `gh` 命令不存在，返回包含安装提示的 `GitError::CommandError`
    /// - 如果 `gh` 返回非零退出码，返回包含 stderr 的 `GitError::CommandError`
    /// - 如果输出无法解析为 URL，返回 `GitError::InternalError`
    pub async fn create_pull_request(
        &self,
        cwd: &str,
        title: &str,
        body: Option<&str>,
        base: Option<&str>,
    ) -> GitResult<String> {
        info!("创建 PR: title={}, base={:?}", title, base);

        let mut cmd = Command::new("gh");
        cmd.current_dir(cwd)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .args(["pr", "create", "--title", title]);

        if let Some(body_content) = body {
            cmd.arg("--body").arg(body_content);
        } else {
            // gh pr create 要求必须提供 --body 或 --fill 参数，否则会打开交互式编辑器
            // 在非交互式环境中，使用空 body 避免阻塞等待用户输入
            cmd.arg("--body").arg("");
        }

        if let Some(base_branch) = base {
            cmd.arg("--base").arg(base_branch);
        }

        let output = cmd.output().await.map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                GitError::CommandError(
                    "未找到 gh CLI，请安装 GitHub CLI (https://cli.github.com) 并执行 gh auth login".to_string(),
                )
            } else {
                GitError::CommandError(format!("执行 gh 命令失败: {}", e))
            }
        })?;

        let code = output.status.code().unwrap_or(-1);
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

        if code != 0 {
            warn!("gh pr create 失败 (exit {}): {}", code, stderr);
            return Err(GitError::CommandError(format!(
                "gh pr create 失败 (exit {}): {}",
                code, stderr
            )));
        }

        // gh pr create 成功时输出 PR URL
        if stdout.is_empty() {
            return Err(GitError::InternalError(
                "gh pr create 未返回 PR URL".to_string(),
            ));
        }

        // 取第一行作为 URL（避免多余输出干扰）
        // gh pr create 成功时输出格式为：PR URL 后可能跟随其他提示信息
        // 仅取第一行确保获取的是纯 URL
        let pr_url = stdout.lines().next().unwrap_or(&stdout).to_string();
        info!("PR 创建成功: {}", pr_url);

        Ok(pr_url)
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
    ///```rust,ignore
    /// #[tokio::main]
    /// async fn main() {
    /// let branch = manager.prepare_pull_request_thread(
    ///     '/path/to/repo',
    ///     123,
    ///     '/path/to/worktree/pr-123',
    /// ).await?;
    /// println!('已创建分支: {}', branch);
    /// }
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
        // 分支命名约定：pr-<number>，便于识别 PR 对应的 worktree
        let branch_name = format!("pr-{}", pr_number);

        info!("准备 PR 线程: PR #{}, 分支: {}", pr_number, branch_name);

        // 创建 worktree（不指定基础引用，从当前 HEAD 派生）
        self.core
            .create_worktree(cwd, worktree_path, &branch_name, None)
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
    ///```rust,ignore
    /// #[tokio::main]
    /// async fn main() {
    /// // 切换到 PR 审查分支
    /// manager.handoff_thread('/path/to/repo', 'pr-123').await?;
    /// 
    /// // 审查完成后切换回主分支
    /// manager.handoff_thread('/path/to/repo', 'main').await?;
    /// }
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
            // stash pop 失败时仅记录警告，不中断操作
            // 常见失败原因：新分支上的文件与暂存内容冲突，需要用户手动解决
            if let Err(e) = self.core.stash_pop(cwd).await {
                warn!("恢复暂存失败: {}", e);
            }
        } else {
            self.core.checkout_branch(cwd, target_branch).await?;
        }

        Ok(())
    }

    /// 生成差异摘要
    ///
    /// 将 diff 补丁转换为 Markdown 格式的可读摘要，用于代码审查和文档生成。
    ///
    /// # 参数
    ///
    /// - `diff`: 统一格式的 diff 补丁内容
    /// - `max_length`: 摘要最大长度（可选，默认为 4000 字符）
    ///
    /// # 返回值
    ///
    /// - `Ok(String)`: Markdown 格式的差异摘要
    /// - `Err(GitError)`: 生成失败
    ///
    /// # 使用场景
    ///
    /// - 为 PR 描述生成变更摘要
    /// - 为 AI Agent 提供代码变更的结构化描述
    /// - 生成提交消息建议
    ///
    /// # 实现细节
    ///
    /// 解析 diff 输出，提取：
    /// - 修改的文件列表
    /// - 每个文件的增删行数统计
    /// - 关键变更的简要描述
    pub async fn summarize_diff(&self, diff: &str, max_length: Option<usize>) -> GitResult<String> {
        let max_len = max_length.unwrap_or(4000);
        info!("生成差异摘要，最大长度: {}", max_len);

        let mut summary = String::new();
        let mut files_changed = Vec::new();
        let mut total_additions = 0;
        let mut total_deletions = 0;

        // 解析 diff 输出
        // 遍历每一行，跟踪当前文件名，统计每个文件的增删行数
        let mut current_file = None;
        let mut file_additions = 0;
        let mut file_deletions = 0;

        for line in diff.lines() {
            if line.starts_with("diff --git") {
                // 遇到新文件的 diff 头，先保存上一个文件的统计
                if let Some(file) = current_file.take() {
                    files_changed.push((file, file_additions, file_deletions));
                    file_additions = 0;
                    file_deletions = 0;
                }

                // 从 'diff --git a/path b/path' 格式中提取文件名
                // 取 ' b/' 之后的部分作为文件路径
                if let Some(parts) = line.split(" b/").nth(1) {
                    current_file = Some(parts.to_string());
                }
            } else if line.starts_with('+') && !line.starts_with("+++") {
                // 以 '+' 开头但不是 '+++'（文件头），计为新增行
                file_additions += 1;
                total_additions += 1;
            } else if line.starts_with('-') && !line.starts_with("---") {
                // 以 '-' 开头但不是 '---'（文件头），计为删除行
                file_deletions += 1;
                total_deletions += 1;
            }
        }

        // 保存最后一个文件
        if let Some(file) = current_file {
            files_changed.push((file, file_additions, file_deletions));
        }

        // 生成 Markdown 摘要
        summary.push_str(&format!(
            "## 变更摘要\n\n共修改 {} 个文件，增加 {} 行，删除 {} 行。\n\n",
            files_changed.len(),
            total_additions,
            total_deletions
        ));

        if !files_changed.is_empty() {
            summary.push_str("### 文件列表\n\n");
            for (file, additions, deletions) in &files_changed {
                summary.push_str(&format!(
                    "- `{}` (+{} -{})\n",
                    file, additions, deletions
                ));

                // 检查是否超过最大长度
                if summary.len() > max_len {
                    summary.push_str("\n... (摘要已截断)\n");
                    break;
                }
            }
        }

        Ok(summary)
    }

    /// 解析 Pull Request
    ///
    /// 根据 PR URL 或编号解析出 PR 的详细信息，包括仓库、分支、提交等。
    ///
    /// # 参数
    ///
    /// - `cwd`: 仓库工作目录
    /// - `pr_ref`: PR 引用，可以是：
    ///   - PR 编号（如 '123'）
    ///   - PR URL（如 'https://github.com/owner/repo/pull/123'）
    ///   - 分支引用（如 'owner:branch'）
    ///
    /// # 返回值
    ///
    /// - `Ok(GitPullRequestInfo)`: PR 详细信息
    /// - `Err(GitError)`: 解析失败
    ///
    /// # 使用场景
    ///
    /// - 从用户输入解析 PR 引用
    /// - 验证 PR 是否存在
    /// - 获取 PR 的目标分支和源分支信息
    pub async fn resolve_pull_request(
        &self,
        cwd: &str,
        pr_ref: &str,
    ) -> GitResult<GitPullRequestInfo> {
        info!("解析 PR 引用: {}", pr_ref);

        // 尝试解析 PR 编号
        // 支持三种输入格式：纯数字编号、GitHub PR URL、其他格式（报错）
        let pr_number = if let Ok(num) = pr_ref.parse::<u64>() {
            // 格式1：纯数字，直接作为 PR 编号
            num
        } else if pr_ref.contains("/pull/") {
            // 格式2：GitHub PR URL，从中提取编号
            // 例如 'https://github.com/owner/repo/pull/123' -> 123
            pr_ref
                .split("/pull/")
                .nth(1)
                .and_then(|s| s.split('/').next())
                .and_then(|s| s.parse::<u64>().ok())
                .ok_or_else(|| {
                    GitError::CommandError(format!("无法从 URL 解析 PR 编号: {}", pr_ref))
                })?
        } else {
            return Err(GitError::CommandError(format!(
                "无法解析 PR 引用: {}，请提供 PR 编号或 URL",
                pr_ref
            )));
        };

        // 使用 gh CLI 获取 PR 信息
        // --json 参数指定需要返回的字段，避免获取不必要的数据
        let mut cmd = Command::new("gh");
        cmd.current_dir(cwd)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .args([
                "pr",
                "view",
                &pr_number.to_string(),
                "--json",
                "number,title,headRefName,baseRefName,state,url,author",
            ]);

        let output = cmd.output().await.map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                GitError::CommandError(
                    "未找到 gh CLI，请安装 GitHub CLI (https://cli.github.com)".to_string(),
                )
            } else {
                GitError::CommandError(format!("执行 gh 命令失败: {}", e))
            }
        })?;

        let code = output.status.code().unwrap_or(-1);
        if code != 0 {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(GitError::CommandError(format!(
                "gh pr view 失败 (exit {}): {}",
                code, stderr
            )));
        }

        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();

        // 解析 JSON 输出
        // gh pr view --json 返回的 JSON 中可能缺少某些字段，使用 unwrap_or 提供默认值
        let pr_info: serde_json::Value = serde_json::from_str(&stdout).map_err(|e| {
            GitError::InternalError(format!("解析 PR 信息失败: {}", e))
        })?;

        Ok(GitPullRequestInfo {
            number: pr_info["number"]
                .as_u64()
                .ok_or_else(|| GitError::InternalError("缺少 PR 编号".to_string()))?,
            title: pr_info["title"]
                .as_str()
                .unwrap_or("")
                .to_string(),
            head_ref: pr_info["headRefName"]
                .as_str()
                .unwrap_or("")
                .to_string(),
            base_ref: pr_info["baseRefName"]
                .as_str()
                .unwrap_or("")
                .to_string(),
            state: pr_info["state"]
                .as_str()
                .unwrap_or("unknown")
                .to_string(),
            url: pr_info["url"]
                .as_str()
                .unwrap_or("")
                .to_string(),
            author: pr_info["author"]["login"]
                .as_str()
                .map(|s| s.to_string()),
        })
    }
}

/// Pull Request 信息
///
/// 封装从 GitHub CLI 获取的 PR 元数据，用于 PR 审查和线程管理。
///
/// # 字段说明
///
/// - `number`: PR 编号（在仓库内唯一标识）
/// - `title`: PR 标题
/// - `head_ref`: 源分支名称（PR 的来源分支）
/// - `base_ref`: 目标分支名称（PR 要合并到的分支）
/// - `state`: PR 当前状态（'open'、'closed'、'merged'）
/// - `url`: PR 的 Web 访问链接
/// - `author`: PR 创建者的 GitHub 用户名（可能为 None，如 API 返回格式异常）
///
/// # 数据来源
///
/// 通过 `gh pr view --json` 命令获取，由 `resolve_pull_request` 方法解析。
///
/// # 使用场景
///
/// - 获取 PR 的源分支和目标分支，用于创建 worktree 或切换分支
/// - 判断 PR 状态是否为 open，决定是否可以进行审查
/// - 展示 PR 的基本信息（标题、作者、URL）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitPullRequestInfo {
    /// PR 编号
    pub number: u64,
    /// PR 标题
    pub title: String,
    /// 源分支名称
    pub head_ref: String,
    /// 目标分支名称
    pub base_ref: String,
    /// PR 状态（open, closed, merged）
    pub state: String,
    /// PR URL
    pub url: String,
    /// PR 作者（GitHub 用户名）
    pub author: Option<String>,
}
