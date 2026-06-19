//! # Git 核心操作层
//!
//! 本模块提供 Git 命令的底层封装，是所有 Git 操作的基础设施层。
//!
//! ## 模块职责
//!
//! - **命令执行引擎**：封装 `git` 命令行调用，处理进程创建、环境变量、标准输入输出
//! - **状态查询**：获取仓库状态（当前分支、上游引用、暂存/修改/未跟踪文件）
//! - **分支操作**：创建、切换、列出分支
//! - **提交操作**：创建提交并返回 commit SHA
//! - **远程操作**：推送和拉取当前分支
//! - **Worktree 管理**：创建和删除 worktree，支持多分支并行开发
//! - **暂存操作**：stash 和 stash pop，临时保存工作区更改
//! - **历史查询**：获取 diff 和 log 信息
//!
//! ## 设计特点
//!
//! - 所有操作均为异步（基于 `tokio`）
//! - 统一的错误处理（通过 `GitResult<T>`）
//! - 支持自定义环境变量和超时设置
//! - 可选择是否允许非零退出码
//!
//! ## 使用场景
//!
//! 本模块通常不直接暴露给最终用户，而是被 [`GitManager`](crate::manager::GitManager) 或
//! [`GitStatusBroadcaster`](crate::broadcaster::GitStatusBroadcaster) 等高层组件封装使用。

use std::process::Stdio;

use tokio::process::Command;
use tracing::{debug, warn};

use crate::error::{GitError, GitResult};

/// Git 命令执行输入参数
///
/// 封装执行单个 Git 命令所需的所有配置信息。
/// 通过结构化的参数传递，避免函数签名过长。
///
/// # 字段说明
///
/// - `operation`: 操作名称，用于日志记录和错误报告（如 "commit", "push"）
/// - `cwd`: 工作目录，Git 命令将在此目录下执行
/// - `args`: Git 命令的参数列表（不包含 "git" 本身）
/// - `env`: 额外的环境变量，会注入到 Git 进程中
/// - `allow_non_zero_exit`: 是否允许命令返回非零退出码（某些命令如 `git status` 在空仓库中会返回非零）
/// - `timeout_ms`: 命令超时时间（毫秒），目前未实现超时控制，预留字段
///
/// # 使用示例
///
/// ```rust
/// use remi_git::ExecuteGitInput;
///
/// let input = ExecuteGitInput {
///     operation: "status".to_string(),
///     cwd: "/path/to/repo".to_string(),
///     args: vec!["status".to_string(), "--porcelain".to_string()],
///     env: vec![],
///     allow_non_zero_exit: false,
///     timeout_ms: None,
/// };
/// ```
#[derive(Debug, Clone)]
pub struct ExecuteGitInput {
    /// 操作名称，用于日志和错误信息
    pub operation: String,
    /// Git 命令执行的工作目录（必须是绝对路径）
    pub cwd: String,
    /// Git 命令参数列表（例如：["commit", "-m", "message"]）
    pub args: Vec<String>,
    /// 额外的环境变量键值对
    pub env: Vec<(String, String)>,
    /// 是否允许非零退出码（true 表示即使失败也返回 Ok）
    pub allow_non_zero_exit: bool,
    /// 超时时间（毫秒），None 表示不限制
    pub timeout_ms: Option<u64>,
}

/// Git 命令执行结果
///
/// 封装 Git 命令执行后的输出信息，包括退出码和标准输出/错误。
///
/// # 字段说明
///
/// - `code`: 进程退出码，0 表示成功，非零表示失败（某些命令有特殊含义）
/// - `stdout`: 标准输出内容（UTF-8 编码）
/// - `stderr`: 标准错误输出内容（UTF-8 编码）
///
/// # 注意事项
///
/// 即使 `code` 为非零，如果 `allow_non_zero_exit` 为 true，仍然会返回 `Ok`。
/// 调用方需要根据具体命令的语义判断是否真正成功。
#[derive(Debug, Clone)]
pub struct ExecuteGitResult {
    /// 进程退出码（0 表示成功）
    pub code: i32,
    /// 标准输出内容
    pub stdout: String,
    /// 标准错误输出内容
    pub stderr: String,
}

/// Git 仓库状态信息
///
/// 包含仓库的完整状态信息，用于前端展示和决策逻辑。
///
/// # 字段说明
///
/// - `current_branch`: 当前所在分支名称（detached HEAD 状态下可能为 None）
/// - `upstream_ref`: 上游跟踪分支引用（如 "origin/main"），未设置跟踪时为 None
/// - `is_dirty`: 工作区是否有未提交的更改（包括暂存、修改、未跟踪文件）
/// - `staged_files`: 已暂存的文件列表（等待提交）
/// - `modified_files`: 已修改但未暂存的文件列表
/// - `untracked_files`: 未跟踪的文件列表（新创建但未 `git add` 的文件）
/// - `pr`: 关联的 Pull Request 信息（目前未实现，预留字段）
///
/// # 使用场景
///
/// - 前端 UI 展示仓库状态
/// - 判断是否可以执行某些操作（如分支切换前检查 `is_dirty`）
/// - 代码审查时确定需要审查的文件范围
#[derive(Debug, Clone)]
pub struct GitStatusResult {
    /// 当前分支名称
    pub current_branch: Option<String>,
    /// 上游跟踪分支（如 "origin/main"）
    pub upstream_ref: Option<String>,
    /// 工作区是否"脏"（有未提交的更改）
    pub is_dirty: bool,
    /// 已暂存的文件列表（将包含在下次提交中）
    pub staged_files: Vec<String>,
    /// 已修改但未暂存的文件列表
    pub modified_files: Vec<String>,
    /// 未跟踪的文件列表
    pub untracked_files: Vec<String>,
    /// 关联的 Pull Request 信息（TODO: 待实现）
    pub pr: Option<PullRequestInfo>,
}

/// Pull Request 信息
///
/// 封装与当前分支关联的 Pull Request（或 Merge Request）元数据。
///
/// # 字段说明
///
/// - `number`: PR 编号（在仓库内唯一）
/// - `title`: PR 标题
/// - `url`: PR 的 Web 访问链接
///
/// # 注意事项
///
/// 目前此功能尚未实现，`GitStatusResult::pr` 字段始终为 None。
/// 未来将集成 GitHub/GitLab API 自动获取 PR 信息。
#[derive(Debug, Clone)]
pub struct PullRequestInfo {
    /// PR 编号
    pub number: u64,
    /// PR 标题
    pub title: String,
    /// PR 的 Web URL
    pub url: String,
}

/// Git 核心服务
///
/// 提供所有底层 Git 操作的封装。本结构体是无状态的，所有方法都通过 `&self` 调用。
/// 通常被包装在 `Arc<GitCore>` 中供多个组件共享使用。
///
/// # 设计原则
///
/// - 每个方法对应一个或多个 Git 命令
/// - 统一的错误处理和日志记录
/// - 所有操作都是异步的，不阻塞调用线程
///
/// # 使用示例
///
/// ```rust
/// use remi_git::GitCore;
///
/// let core = GitCore::new();
/// let status = core.status("/path/to/repo").await?;
/// println!("当前分支: {:?}", status.current_branch);
/// ```
pub struct GitCore;

impl GitCore {
    /// 创建新的 Git 核心服务实例
    ///
    /// # 返回值
    ///
    /// 返回一个新的 `GitCore` 实例。由于本结构体无状态，创建操作非常轻量。
    ///
    /// # 使用示例
    ///
    /// ```rust
    /// let core = GitCore::new();
    /// ```
    pub fn new() -> Self {
        Self
    }

    /// 执行 Git 命令
    ///
    /// 底层命令执行引擎，所有其他 Git 操作都通过此方法实现。
    ///
    /// # 参数
    ///
    /// - `input`: 命令执行参数，包括工作目录、命令参数、环境变量等
    ///
    /// # 返回值
    ///
    /// - `Ok(ExecuteGitResult)`: 命令执行成功（或 `allow_non_zero_exit` 为 true 时即使非零也返回 Ok）
    /// - `Err(GitError::CommandError)`: 命令执行失败且不允许非零退出码
    ///
    /// # 实现细节
    ///
    /// - 使用 `tokio::process::Command` 异步执行 Git 命令
    /// - 标准输入被设置为 `null`（不从终端读取）
    /// - 标准输出和标准错误都被捕获
    /// - 输出内容按 UTF-8 解码（使用 `from_utf8_lossy` 容忍非法字节）
    ///
    /// # 错误处理
    ///
    /// 如果 Git 命令返回非零退出码且 `allow_non_zero_exit` 为 false，
    /// 将返回 `GitError::CommandError`，包含 stderr 内容和退出码。
    pub async fn execute(&self, input: ExecuteGitInput) -> GitResult<ExecuteGitResult> {
        debug!("执行 Git 命令: {} {}", input.operation, input.args.join(" "));

        let mut cmd = Command::new("git");
        cmd.current_dir(&input.cwd);
        cmd.args(&input.args);
        cmd.stdin(Stdio::null());
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        // 设置环境变量
        for (key, value) in &input.env {
            cmd.env(key, value);
        }

        let output = cmd.output().await.map_err(|e| {
            GitError::CommandError(format!("执行 Git 命令失败: {}", e))
        })?;

        let code = output.status.code().unwrap_or(-1);
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();

        if code != 0 && !input.allow_non_zero_exit {
            warn!("Git 命令失败: {} - {}", input.operation, stderr);
            return Err(GitError::CommandError(format!(
                "Git {} 失败 (exit code {}): {}",
                input.operation, code, stderr
            )));
        }

        Ok(ExecuteGitResult {
            code,
            stdout,
            stderr,
        })
    }

    /// 获取 Git 仓库状态
    ///
    /// 查询指定目录的 Git 仓库状态，包括当前分支、上游引用、文件变更等。
    ///
    /// # 参数
    ///
    /// - `cwd`: 仓库工作目录的绝对路径
    ///
    /// # 返回值
    ///
    /// - `Ok(GitStatusResult)`: 包含完整的仓库状态信息
    /// - `Err(GitError)`: 命令执行失败
    ///
    /// # 实现细节
    ///
    /// 本方法会执行以下 Git 命令：
    /// 1. `git rev-parse --abbrev-ref HEAD` - 获取当前分支
    /// 2. `git rev-parse --abbrev-ref --symbolic-full-name @{u}` - 获取上游引用
    /// 3. `git status --porcelain` - 获取文件状态（机器可读格式）
    ///
    /// 文件状态解析规则：
    /// - `??` - 未跟踪文件
    /// - `M `, `A `, `D ` - 已暂存（修改/新增/删除）
    /// - ` M`, ` A`, ` D` - 已修改但未暂存
    /// - `MM`, `AM`, `DM` - 既在暂存区又有新的修改
    ///
    /// # 使用示例
    ///
    /// ```rust
    /// let status = core.status("/path/to/repo").await?;
    /// if status.is_dirty {
    ///     println!("有未提交的更改");
    /// }
    /// ```
    pub async fn status(&self, cwd: &str) -> GitResult<GitStatusResult> {
        // 获取当前分支
        let branch_result = self
            .execute(ExecuteGitInput {
                operation: "rev-parse --abbrev-ref HEAD".to_string(),
                cwd: cwd.to_string(),
                args: vec!["rev-parse".to_string(), "--abbrev-ref".to_string(), "HEAD".to_string()],
                env: vec![],
                allow_non_zero_exit: true,
                timeout_ms: None,
            })
            .await?;

        let current_branch = if branch_result.code == 0 {
            Some(branch_result.stdout.trim().to_string())
        } else {
            None
        };

        // 获取上游引用
        let upstream_result = self
            .execute(ExecuteGitInput {
                operation: "rev-parse --abbrev-ref --symbolic-full-name @{u}".to_string(),
                cwd: cwd.to_string(),
                args: vec![
                    "rev-parse".to_string(),
                    "--abbrev-ref".to_string(),
                    "--symbolic-full-name".to_string(),
                    "@{u}".to_string(),
                ],
                env: vec![],
                allow_non_zero_exit: true,
                timeout_ms: None,
            })
            .await?;

        let upstream_ref = if upstream_result.code == 0 {
            Some(upstream_result.stdout.trim().to_string())
        } else {
            None
        };

        // 获取状态
        let status_result = self
            .execute(ExecuteGitInput {
                operation: "status --porcelain".to_string(),
                cwd: cwd.to_string(),
                args: vec!["status".to_string(), "--porcelain".to_string()],
                env: vec![],
                allow_non_zero_exit: false,
                timeout_ms: None,
            })
            .await?;

        let mut staged_files = Vec::new();
        let mut modified_files = Vec::new();
        let mut untracked_files = Vec::new();

        for line in status_result.stdout.lines() {
            if line.len() < 3 {
                continue;
            }

            let status = &line[0..2];
            let file = line[3..].to_string();

            match status {
                "??" => untracked_files.push(file),
                "M " | "A " | "D " => staged_files.push(file),
                " M" | " A" | " D" => modified_files.push(file),
                "MM" | "AM" | "DM" => {
                    staged_files.push(file.clone());
                    modified_files.push(file);
                }
                _ => {}
            }
        }

        let is_dirty = !staged_files.is_empty() || !modified_files.is_empty() || !untracked_files.is_empty();

        Ok(GitStatusResult {
            current_branch,
            upstream_ref,
            is_dirty,
            staged_files,
            modified_files,
            untracked_files,
            pr: None, // TODO: 实现 PR 信息获取
        })
    }

    /// 创建新分支
    ///
    /// 在当前 HEAD 位置创建一个新的本地分支，但不会自动切换过去。
    ///
    /// # 参数
    ///
    /// - `cwd`: 仓库工作目录
    /// - `branch_name`: 新分支名称（必须符合 Git 命名规则）
    ///
    /// # 返回值
    ///
    /// - `Ok(())`: 分支创建成功
    /// - `Err(GitError::CommandError)`: 分支已存在或名称无效
    ///
    /// # 注意事项
    ///
    /// 如果分支已存在，将返回错误。如需创建并切换，请先调用此方法再调用 `checkout_branch`。
    pub async fn create_branch(&self, cwd: &str, branch_name: &str) -> GitResult<()> {
        self.execute(ExecuteGitInput {
            operation: "branch".to_string(),
            cwd: cwd.to_string(),
            args: vec!["branch".to_string(), branch_name.to_string()],
            env: vec![],
            allow_non_zero_exit: false,
            timeout_ms: None,
        })
        .await?;

        Ok(())
    }

    /// 切换到指定分支
    ///
    /// 将工作区切换到目标分支。如果工作区有未提交的更改且与目标分支冲突，可能会失败。
    ///
    /// # 参数
    ///
    /// - `cwd`: 仓库工作目录
    /// - `branch_name`: 目标分支名称（必须已存在）
    ///
    /// # 返回值
    ///
    /// - `Ok(())`: 切换成功
    /// - `Err(GitError::CommandError)`: 分支不存在或工作区有冲突的更改
    ///
    /// # 注意事项
    ///
    /// 切换前建议检查 `status().is_dirty`，如有未提交更改可先 `stash`。
    pub async fn checkout_branch(&self, cwd: &str, branch_name: &str) -> GitResult<()> {
        self.execute(ExecuteGitInput {
            operation: "checkout".to_string(),
            cwd: cwd.to_string(),
            args: vec!["checkout".to_string(), branch_name.to_string()],
            env: vec![],
            allow_non_zero_exit: false,
            timeout_ms: None,
        })
        .await?;

        Ok(())
    }

    /// 创建提交
    ///
    /// 将暂存区的更改提交到当前分支，并返回新提交的 SHA。
    ///
    /// # 参数
    ///
    /// - `cwd`: 仓库工作目录
    /// - `message`: 提交消息（建议使用符合 Conventional Commits 规范的格式）
    ///
    /// # 返回值
    ///
    /// - `Ok(String)`: 新创建的 commit 的完整 SHA-1 哈希值
    /// - `Err(GitError::CommandError)`: 提交失败（如没有暂存的更改）
    ///
    /// # 实现细节
    ///
    /// 本方法执行两步：
    /// 1. `git commit -m <message>` - 创建提交
    /// 2. `git rev-parse HEAD` - 获取新提交的 SHA
    ///
    /// # 使用示例
    ///
    /// ```rust
    /// let sha = core.commit("/path/to/repo", "feat: add new feature").await?;
    /// println!("提交成功: {}", sha);
    /// ```
    pub async fn commit(&self, cwd: &str, message: &str) -> GitResult<String> {
        let _result = self
            .execute(ExecuteGitInput {
                operation: "commit".to_string(),
                cwd: cwd.to_string(),
                args: vec!["commit".to_string(), "-m".to_string(), message.to_string()],
                env: vec![],
                allow_non_zero_exit: false,
                timeout_ms: None,
            })
            .await?;

        // 提取 commit SHA
        let sha_result = self
            .execute(ExecuteGitInput {
                operation: "rev-parse HEAD".to_string(),
                cwd: cwd.to_string(),
                args: vec!["rev-parse".to_string(), "HEAD".to_string()],
                env: vec![],
                allow_non_zero_exit: false,
                timeout_ms: None,
            })
            .await?;

        Ok(sha_result.stdout.trim().to_string())
    }

    /// 推送当前分支到远程
    ///
    /// 将当前分支的提交推送到默认远程仓库的上游分支。
    ///
    /// # 参数
    ///
    /// - `cwd`: 仓库工作目录
    ///
    /// # 返回值
    ///
    /// - `Ok(())`: 推送成功
    /// - `Err(GitError::CommandError)`: 推送失败（网络问题、权限不足、冲突等）
    ///
    /// # 注意事项
    ///
    /// - 当前分支必须有设置上游跟踪分支，或者远程有同名分支
    /// - 如果是新分支，可能需要先 `git push -u origin <branch>` 设置上游
    pub async fn push_current_branch(&self, cwd: &str) -> GitResult<()> {
        self.execute(ExecuteGitInput {
            operation: "push".to_string(),
            cwd: cwd.to_string(),
            args: vec!["push".to_string()],
            env: vec![],
            allow_non_zero_exit: false,
            timeout_ms: None,
        })
        .await?;

        Ok(())
    }

    /// 拉取当前分支的最新更改
    ///
    /// 从远程仓库拉取当前分支的最新提交并合并到本地。
    ///
    /// # 参数
    ///
    /// - `cwd`: 仓库工作目录
    ///
    /// # 返回值
    ///
    /// - `Ok(())`: 拉取并合并成功
    /// - `Err(GitError::CommandError)`: 拉取失败（网络问题、合并冲突等）
    ///
    /// # 注意事项
    ///
    /// - 如果远程有冲突的更改，可能会产生合并冲突
    /// - 建议拉取前确保工作区干净（`is_dirty == false`）
    pub async fn pull_current_branch(&self, cwd: &str) -> GitResult<()> {
        self.execute(ExecuteGitInput {
            operation: "pull".to_string(),
            cwd: cwd.to_string(),
            args: vec!["pull".to_string()],
            env: vec![],
            allow_non_zero_exit: false,
            timeout_ms: None,
        })
        .await?;

        Ok(())
    }

    /// 创建 Git worktree
    ///
    /// 在指定路径创建一个新的 worktree，并关联到新分支。
    /// Worktree 允许在同一个仓库中同时检出多个分支到不同的目录。
    ///
    /// # 参数
    ///
    /// - `cwd`: 主仓库工作目录
    /// - `worktree_path`: 新 worktree 的绝对路径
    /// - `branch_name`: worktree 关联的新分支名称
    ///
    /// # 返回值
    ///
    /// - `Ok(())`: worktree 创建成功
    /// - `Err(GitError::CommandError)`: 创建失败（路径已存在、分支名冲突等）
    ///
    /// # 使用场景
    ///
    /// - 并行开发多个功能分支
    /// - 在不影响当前工作的情况下审查其他分支
    /// - AI Agent 在独立的 worktree 中进行代码修改
    ///
    /// # 注意事项
    ///
    /// - worktree 路径必须是绝对路径
    /// - 分支名称不能与现有分支冲突
    /// - 同一个 commit 不能同时在两个 worktree 中检出
    pub async fn create_worktree(
        &self,
        cwd: &str,
        worktree_path: &str,
        branch_name: &str,
    ) -> GitResult<()> {
        self.execute(ExecuteGitInput {
            operation: "worktree add".to_string(),
            cwd: cwd.to_string(),
            args: vec![
                "worktree".to_string(),
                "add".to_string(),
                worktree_path.to_string(),
                "-b".to_string(),
                branch_name.to_string(),
            ],
            env: vec![],
            allow_non_zero_exit: false,
            timeout_ms: None,
        })
        .await?;

        Ok(())
    }

    /// 删除 Git worktree
    ///
    /// 移除指定的 worktree。worktree 目录必须存在且没有未提交的更改。
    ///
    /// # 参数
    ///
    /// - `cwd`: 主仓库工作目录
    /// - `worktree_path`: 要删除的 worktree 路径
    ///
    /// # 返回值
    ///
    /// - `Ok(())`: worktree 删除成功
    /// - `Err(GitError::CommandError)`: 删除失败（worktree 不存在、有未提交更改等）
    ///
    /// # 注意事项
    ///
    /// - 删除前请确保 worktree 中的所有更改已提交或暂存
    /// - 删除后 worktree 目录将被移除
    pub async fn remove_worktree(&self, cwd: &str, worktree_path: &str) -> GitResult<()> {
        self.execute(ExecuteGitInput {
            operation: "worktree remove".to_string(),
            cwd: cwd.to_string(),
            args: vec![
                "worktree".to_string(),
                "remove".to_string(),
                worktree_path.to_string(),
            ],
            env: vec![],
            allow_non_zero_exit: false,
            timeout_ms: None,
        })
        .await?;

        Ok(())
    }

    /// 暂存当前工作区的更改
    ///
    /// 将工作区和暂存区的更改保存到 stash 栈中，并恢复工作区到 HEAD 状态。
    ///
    /// # 参数
    ///
    /// - `cwd`: 仓库工作目录
    ///
    /// # 返回值
    ///
    /// - `Ok(())`: 暂存成功
    /// - `Err(GitError::CommandError)`: 暂存失败（没有可暂存的更改）
    ///
    /// # 使用场景
    ///
    /// - 需要切换分支但当前有未完成的更改
    /// - 需要拉取远程更新但工作区不干净
    ///
    /// # 配套方法
    ///
    /// 使用 `stash_pop` 恢复暂存的更改。
    pub async fn stash(&self, cwd: &str) -> GitResult<()> {
        self.execute(ExecuteGitInput {
            operation: "stash".to_string(),
            cwd: cwd.to_string(),
            args: vec!["stash".to_string()],
            env: vec![],
            allow_non_zero_exit: false,
            timeout_ms: None,
        })
        .await?;

        Ok(())
    }

    /// 恢复最近一次暂存的更改
    ///
    /// 从 stash 栈中弹出最近一次的暂存，并应用到当前工作区。
    ///
    /// # 参数
    ///
    /// - `cwd`: 仓库工作目录
    ///
    /// # 返回值
    ///
    /// - `Ok(())`: 恢复成功
    /// - `Err(GitError::CommandError)`: 恢复失败（stash 栈为空、有冲突等）
    ///
    /// # 注意事项
    ///
    /// - 恢复后 stash 条目将从栈中移除
    /// - 如果当前工作区有冲突的更改，可能会产生合并冲突
    pub async fn stash_pop(&self, cwd: &str) -> GitResult<()> {
        self.execute(ExecuteGitInput {
            operation: "stash pop".to_string(),
            cwd: cwd.to_string(),
            args: vec!["stash".to_string(), "pop".to_string()],
            env: vec![],
            allow_non_zero_exit: false,
            timeout_ms: None,
        })
        .await?;

        Ok(())
    }

    /// 初始化 Git 仓库
    ///
    /// 在指定目录中创建一个新的 Git 仓库（创建 `.git` 目录）。
    ///
    /// # 参数
    ///
    /// - `cwd`: 要初始化为 Git 仓库的目录
    ///
    /// # 返回值
    ///
    /// - `Ok(())`: 初始化成功
    /// - `Err(GitError::CommandError)`: 初始化失败（权限问题等）
    ///
    /// # 注意事项
    ///
    /// - 如果目录已经是 Git 仓库，此操作不会报错（幂等操作）
    /// - 初始化后仓库处于空状态，需要先添加文件并提交
    pub async fn init_repo(&self, cwd: &str) -> GitResult<()> {
        self.execute(ExecuteGitInput {
            operation: "init".to_string(),
            cwd: cwd.to_string(),
            args: vec!["init".to_string()],
            env: vec![],
            allow_non_zero_exit: false,
            timeout_ms: None,
        })
        .await?;

        Ok(())
    }

    /// 列出所有本地分支
    ///
    /// 获取仓库中所有本地分支的名称列表。
    ///
    /// # 参数
    ///
    /// - `cwd`: 仓库工作目录
    ///
    /// # 返回值
    ///
    /// - `Ok(Vec<String>)`: 分支名称列表（当前分支排在第一位）
    /// - `Err(GitError::CommandError)`: 命令执行失败
    ///
    /// # 实现细节
    ///
    /// 执行 `git branch --list` 并解析输出，自动处理前导空格和当前分支标记（`*`）。
    pub async fn list_branches(&self, cwd: &str) -> GitResult<Vec<String>> {
        let result = self
            .execute(ExecuteGitInput {
                operation: "branch --list".to_string(),
                cwd: cwd.to_string(),
                args: vec!["branch".to_string(), "--list".to_string()],
                env: vec![],
                allow_non_zero_exit: false,
                timeout_ms: None,
            })
            .await?;

        let branches: Vec<String> = result
            .stdout
            .lines()
            .map(|line| {
                // 移除前导空格和星号
                let branch = line.trim_start();
                if let Some(stripped) = branch.strip_prefix("* ") {
                    stripped.to_string()
                } else {
                    branch.to_string()
                }
            })
            .filter(|b| !b.is_empty())
            .collect();

        Ok(branches)
    }

    /// 获取文件差异
    ///
    /// 获取工作区或暂存区与最近提交之间的差异。
    ///
    /// # 参数
    ///
    /// - `cwd`: 仓库工作目录
    /// - `staged`: 是否获取暂存区的 diff（true: `git diff --cached`，false: `git diff`）
    ///
    /// # 返回值
    ///
    /// - `Ok(String)`: diff 输出（统一格式）
    /// - `Err(GitError::CommandError)`: 命令执行失败
    ///
    /// # 使用场景
    ///
    /// - 代码审查前查看更改内容
    /// - 提交前确认更改范围
    /// - AI Agent 分析代码变更
    pub async fn diff(&self, cwd: &str, staged: bool) -> GitResult<String> {
        let mut args = vec!["diff".to_string()];
        if staged {
            args.push("--cached".to_string());
        }

        let result = self
            .execute(ExecuteGitInput {
                operation: "diff".to_string(),
                cwd: cwd.to_string(),
                args,
                env: vec![],
                allow_non_zero_exit: false,
                timeout_ms: None,
            })
            .await?;

        Ok(result.stdout)
    }

    /// 获取提交历史
    ///
    /// 获取当前分支的提交历史日志。
    ///
    /// # 参数
    ///
    /// - `cwd`: 仓库工作目录
    /// - `max_count`: 最大返回提交数
    ///
    /// # 返回值
    ///
    /// - `Ok(String)`: 提交历史（oneline 格式：`<sha> <message>`）
    /// - `Err(GitError::CommandError)`: 命令执行失败
    ///
    /// # 输出格式
    ///
    /// 每行格式为：`<abbreviated-sha> <commit-message>`
    /// 例如：`a1b2c3d feat: add new feature`
    pub async fn log(&self, cwd: &str, max_count: usize) -> GitResult<String> {
        let result = self
            .execute(ExecuteGitInput {
                operation: "log".to_string(),
                cwd: cwd.to_string(),
                args: vec![
                    "log".to_string(),
                    format!("--max-count={}", max_count),
                    "--oneline".to_string(),
                ],
                env: vec![],
                allow_non_zero_exit: false,
                timeout_ms: None,
            })
            .await?;

        Ok(result.stdout)
    }

    /// 回滚到指定提交
    ///
    /// 将当前分支硬重置到指定的 commit，丢弃所有后续更改。
    ///
    /// # 参数
    ///
    /// - `commit_sha`: 目标 commit 的 SHA（可以是完整 SHA 或短 SHA）
    ///
    /// # 返回值
    ///
    /// - `Ok(())`: 回滚成功
    /// - `Err(GitError::CommandError)`: 回滚失败（commit 不存在等）
    ///
    /// # ⚠️ 危险操作
    ///
    /// 此操作会**永久删除**目标 commit 之后的所有更改，包括：
    /// - 已提交但未推送的更改
    /// - 已暂存的更改
    /// - 未暂存的修改
    ///
    /// 调用前请确保：
    /// - 已经备份重要更改
    /// - 确认目标 commit 是正确的
    pub async fn revert_to_commit(&self, commit_sha: &str) -> GitResult<()> {
        self.execute(ExecuteGitInput {
            operation: "reset --hard".to_string(),
            cwd: ".".to_string(),
            args: vec!["reset".to_string(), "--hard".to_string(), commit_sha.to_string()],
            env: vec![],
            allow_non_zero_exit: false,
            timeout_ms: None,
        })
        .await?;

        Ok(())
    }

    /// 获取两个提交之间的差异
    ///
    /// 比较两个 commit 之间的文件更改。
    ///
    /// # 参数
    ///
    /// - `from_commit`: 起始 commit 的 SHA
    /// - `to_commit`: 目标 commit 的 SHA
    ///
    /// # 返回值
    ///
    /// - `Ok(String)`: 两个 commit 之间的 diff（统一格式）
    /// - `Err(GitError::CommandError)`: 命令执行失败（commit 不存在等）
    ///
    /// # 实现细节
    ///
    /// 使用 `git diff <from>...<to>` 语法（三点），表示比较 from 和 to 的最近公共祖先到 to 的更改。
    /// 这在比较分支时特别有用，可以忽略 from 分支在 to 分支分叉后的更改。
    ///
    /// # 使用场景
    ///
    /// - 代码审查时查看 PR 包含的所有更改
    /// - 分析两个版本之间的差异
    pub async fn diff_between_commits(
        &self,
        from_commit: &str,
        to_commit: &str,
    ) -> GitResult<String> {
        let result = self
            .execute(ExecuteGitInput {
                operation: "diff".to_string(),
                cwd: ".".to_string(),
                args: vec![
                    "diff".to_string(),
                    format!("{}...{}", from_commit, to_commit),
                ],
                env: vec![],
                allow_non_zero_exit: false,
                timeout_ms: None,
            })
            .await?;

        Ok(result.stdout)
    }

    /// 拉取 GitHub Pull Request 分支
    ///
    /// 从远程仓库拉取指定的 Pull Request 分支到本地。
    ///
    /// # 参数
    ///
    /// - `cwd`: 仓库工作目录
    /// - `pr_number`: Pull Request 编号
    /// - `local_branch`: 本地分支名称
    ///
    /// # 返回值
    ///
    /// - `Ok(())`: 拉取成功
    /// - `Err(GitError::CommandError)`: 拉取失败
    pub async fn fetch_pull_request_branch(
        &self,
        cwd: &str,
        pr_number: u32,
        local_branch: &str,
    ) -> GitResult<()> {
        self.execute(ExecuteGitInput {
            operation: "fetch".to_string(),
            cwd: cwd.to_string(),
            args: vec![
                "fetch".to_string(),
                "origin".to_string(),
                format!("pull/{}/head:{}", pr_number, local_branch),
            ],
            env: vec![],
            allow_non_zero_exit: false,
            timeout_ms: None,
        })
        .await?;

        Ok(())
    }

    /// 确保远程仓库存在
    ///
    /// 检查指定的远程仓库是否存在，如果不存在则添加。
    ///
    /// # 参数
    ///
    /// - `cwd`: 仓库工作目录
    /// - `remote_name`: 远程仓库名称
    /// - `remote_url`: 远程仓库 URL
    ///
    /// # 返回值
    ///
    /// - `Ok(())`: 远程仓库存在或已成功添加
    /// - `Err(GitError::CommandError)`: 操作失败
    pub async fn ensure_remote(
        &self,
        cwd: &str,
        remote_name: &str,
        remote_url: &str,
    ) -> GitResult<()> {
        // 先检查远程仓库是否存在
        let check_result = self
            .execute(ExecuteGitInput {
                operation: "remote".to_string(),
                cwd: cwd.to_string(),
                args: vec!["remote".to_string(), "get-url".to_string(), remote_name.to_string()],
                env: vec![],
                allow_non_zero_exit: true,
                timeout_ms: None,
            })
            .await?;

        // 如果不存在，则添加远程仓库
        if check_result.code != 0 {
            self.execute(ExecuteGitInput {
                operation: "remote add".to_string(),
                cwd: cwd.to_string(),
                args: vec![
                    "remote".to_string(),
                    "add".to_string(),
                    remote_name.to_string(),
                    remote_url.to_string(),
                ],
                env: vec![],
                allow_non_zero_exit: false,
                timeout_ms: None,
            })
            .await?;
        }

        Ok(())
    }

    /// 拉取远程分支
    ///
    /// 从远程仓库拉取指定的分支到本地。
    ///
    /// # 参数
    ///
    /// - `cwd`: 仓库工作目录
    /// - `remote_name`: 远程仓库名称
    /// - `remote_branch`: 远程分支名称
    /// - `local_branch`: 本地分支名称
    ///
    /// # 返回值
    ///
    /// - `Ok(())`: 拉取成功
    /// - `Err(GitError::CommandError)`: 拉取失败
    pub async fn fetch_remote_branch(
        &self,
        cwd: &str,
        remote_name: &str,
        remote_branch: &str,
        local_branch: &str,
    ) -> GitResult<()> {
        self.execute(ExecuteGitInput {
            operation: "fetch".to_string(),
            cwd: cwd.to_string(),
            args: vec![
                "fetch".to_string(),
                remote_name.to_string(),
                format!("{}:{}", remote_branch, local_branch),
            ],
            env: vec![],
            allow_non_zero_exit: false,
            timeout_ms: None,
        })
        .await?;

        Ok(())
    }

    /// 设置分支上游跟踪
    ///
    /// 为本地分支设置上游跟踪分支。
    ///
    /// # 参数
    ///
    /// - `cwd`: 仓库工作目录
    /// - `branch`: 本地分支名称
    /// - `upstream`: 上游分支引用（如 "origin/main"）
    ///
    /// # 返回值
    ///
    /// - `Ok(())`: 设置成功
    /// - `Err(GitError::CommandError)`: 设置失败
    pub async fn set_branch_upstream(
        &self,
        cwd: &str,
        branch: &str,
        upstream: &str,
    ) -> GitResult<()> {
        self.execute(ExecuteGitInput {
            operation: "branch".to_string(),
            cwd: cwd.to_string(),
            args: vec![
                "branch".to_string(),
                format!("--set-upstream-to={}", upstream),
                branch.to_string(),
            ],
            env: vec![],
            allow_non_zero_exit: false,
            timeout_ms: None,
        })
        .await?;

        Ok(())
    }

    /// 发布分支
    ///
    /// 将本地分支推送到远程仓库并设置上游跟踪。
    ///
    /// # 参数
    ///
    /// - `cwd`: 仓库工作目录
    /// - `remote_name`: 远程仓库名称
    /// - `branch`: 本地分支名称
    ///
    /// # 返回值
    ///
    /// - `Ok(())`: 发布成功
    /// - `Err(GitError::CommandError)`: 发布失败
    pub async fn publish_branch(
        &self,
        cwd: &str,
        remote_name: &str,
        branch: &str,
    ) -> GitResult<()> {
        self.execute(ExecuteGitInput {
            operation: "push".to_string(),
            cwd: cwd.to_string(),
            args: vec![
                "push".to_string(),
                "-u".to_string(),
                remote_name.to_string(),
                branch.to_string(),
            ],
            env: vec![],
            allow_non_zero_exit: false,
            timeout_ms: None,
        })
        .await?;

        Ok(())
    }

    /// 重命名分支
    ///
    /// 重命名本地分支。
    ///
    /// # 参数
    ///
    /// - `cwd`: 仓库工作目录
    /// - `old_name`: 旧分支名称
    /// - `new_name`: 新分支名称
    ///
    /// # 返回值
    ///
    /// - `Ok(())`: 重命名成功
    /// - `Err(GitError::CommandError)`: 重命名失败
    pub async fn rename_branch(
        &self,
        cwd: &str,
        old_name: &str,
        new_name: &str,
    ) -> GitResult<()> {
        self.execute(ExecuteGitInput {
            operation: "branch".to_string(),
            cwd: cwd.to_string(),
            args: vec![
                "branch".to_string(),
                "-m".to_string(),
                old_name.to_string(),
                new_name.to_string(),
            ],
            env: vec![],
            allow_non_zero_exit: false,
            timeout_ms: None,
        })
        .await?;

        Ok(())
    }

    /// 删除最新的 stash
    ///
    /// 删除 stash 栈顶的条目。
    ///
    /// # 参数
    ///
    /// - `cwd`: 仓库工作目录
    ///
    /// # 返回值
    ///
    /// - `Ok(())`: 删除成功
    /// - `Err(GitError::CommandError)`: 删除失败（stash 为空等）
    pub async fn stash_drop(&self, cwd: &str) -> GitResult<()> {
        self.execute(ExecuteGitInput {
            operation: "stash".to_string(),
            cwd: cwd.to_string(),
            args: vec!["stash".to_string(), "drop".to_string()],
            env: vec![],
            allow_non_zero_exit: false,
            timeout_ms: None,
        })
        .await?;

        Ok(())
    }

    /// 获取最新 stash 信息
    ///
    /// 获取 stash 栈顶条目的信息。
    ///
    /// # 参数
    ///
    /// - `cwd`: 仓库工作目录
    ///
    /// # 返回值
    ///
    /// - `Ok(String)`: stash 信息（格式：`stash@{0}: <message>`）
    /// - `Err(GitError::CommandError)`: 获取失败（stash 为空等）
    pub async fn stash_info(&self, cwd: &str) -> GitResult<String> {
        let result = self
            .execute(ExecuteGitInput {
                operation: "stash".to_string(),
                cwd: cwd.to_string(),
                args: vec!["stash".to_string(), "list".to_string(), "-1".to_string()],
                env: vec![],
                allow_non_zero_exit: false,
                timeout_ms: None,
            })
            .await?;

        Ok(result.stdout.trim().to_string())
    }

    /// 移除索引锁文件
    ///
    /// 删除 `.git/index.lock` 文件，用于解决 Git 索引锁定问题。
    ///
    /// # 参数
    ///
    /// - `cwd`: 仓库工作目录
    ///
    /// # 返回值
    ///
    /// - `Ok(())`: 移除成功或文件不存在
    /// - `Err(GitError::CommandError)`: 移除失败
    pub async fn remove_index_lock(&self, cwd: &str) -> GitResult<()> {
        let lock_path = std::path::Path::new(cwd).join(".git").join("index.lock");
        
        if lock_path.exists() {
            std::fs::remove_file(&lock_path).map_err(|e| {
                crate::error::GitError::CommandError(format!(
                    "Failed to remove index.lock: {}",
                    e
                ))
            })?;
        }

        Ok(())
    }

    /// 列出本地分支名称（短格式）
    ///
    /// 列出所有本地分支的名称，不包含远程分支。
    ///
    /// # 参数
    ///
    /// - `cwd`: 仓库工作目录
    ///
    /// # 返回值
    ///
    /// - `Ok(Vec<String>)`: 分支名称列表
    /// - `Err(GitError::CommandError)`: 列出失败
    pub async fn list_local_branch_names(&self, cwd: &str) -> GitResult<Vec<String>> {
        let result = self
            .execute(ExecuteGitInput {
                operation: "branch".to_string(),
                cwd: cwd.to_string(),
                args: vec!["branch".to_string(), "--format=%(refname:short)".to_string()],
                env: vec![],
                allow_non_zero_exit: false,
                timeout_ms: None,
            })
            .await?;

        let branches: Vec<String> = result
            .stdout
            .lines()
            .map(|line| line.trim().to_string())
            .filter(|line| !line.is_empty())
            .collect();

        Ok(branches)
    }
}

impl Default for GitCore {
    /// 实现 `Default` trait，允许使用 `GitCore::default()` 创建实例
    ///
    /// 等同于 `GitCore::new()`。
    fn default() -> Self {
        Self::new()
    }
}
