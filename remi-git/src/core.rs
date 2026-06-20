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

use serde::{Deserialize, Serialize};
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
#[derive(Debug, Clone, Serialize, Deserialize)]
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
    /// 领先上游的提交数
    pub ahead_count: u32,
    /// 落后上游的提交数
    pub behind_count: u32,
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
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PullRequestInfo {
    /// PR 编号
    pub number: u64,
    /// PR 标题
    pub title: String,
    /// PR 的 Web URL
    pub url: String,
}

/// 详细 Git 状态信息
///
/// 包含比 `GitStatusResult` 更详细的仓库状态，包括分支计数和上游跟踪状态。
///
/// # 与 `GitStatusResult` 的区别
///
/// - `GitStatusResult` 面向前端 UI 展示，包含 PR 信息（预留字段）
/// - `GitStatusDetails` 面向内部逻辑，包含 `has_upstream` 标志位，便于判断是否需要设置上游跟踪
/// - `GitStatusDetails` 的 `branch` 字段在 detached HEAD 状态下返回 None（而非 "HEAD" 字符串）
///
/// # 使用场景
///
/// - 判断分支是否需要设置上游跟踪（`has_upstream == false` 时调用 `set_branch_upstream`）
/// - 获取 ahead/behind 计数用于同步状态展示
/// - 作为 `read_branch_patch` 等方法的基础数据来源
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitStatusDetails {
    /// 当前分支名称（detached HEAD 状态下为 None）
    pub branch: Option<String>,
    /// 上游跟踪分支引用
    pub upstream_ref: Option<String>,
    /// 是否有上游跟踪分支
    pub has_upstream: bool,
    /// 领先上游的提交数
    pub ahead_count: u32,
    /// 落后上游的提交数
    pub behind_count: u32,
    /// 工作区是否"脏"（有未提交的更改）
    pub is_dirty: bool,
    /// 已暂存的文件列表
    pub staged_files: Vec<String>,
    /// 已修改但未暂存的文件列表
    pub modified_files: Vec<String>,
    /// 未跟踪的文件列表
    pub untracked_files: Vec<String>,
}

/// 工作区补丁
///
/// 封装工作区与 HEAD 之间的统一补丁格式差异。
///
/// # 使用场景
///
/// - AI Agent 分析当前工作区的完整代码变更
/// - 生成代码审查所需的差异上下文
/// - 作为提交前预览或 PR 描述的数据来源
///
/// # 补丁来源
///
/// 可通过以下方法获取：
/// - `read_working_tree_patch`: 工作区（含未跟踪文件）与 HEAD 的差异
/// - `read_unstaged_patch`: 未暂存更改（含未跟踪文件）的补丁
/// - `read_staged_patch`: 暂存区与 HEAD 的差异
/// - `read_branch_patch`: 当前分支与基础分支的差异
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitWorkingTreePatch {
    /// 统一补丁格式的差异内容
    pub patch: String,
}

/// 准备提交上下文
///
/// 包含提交所需的暂存摘要和补丁信息，用于在执行实际提交前预览将要提交的内容。
///
/// # 字段说明
///
/// - `staged_summary`: 暂存文件的状态摘要，格式为 name-status（如 `M\tsrc/main.rs`），
///   其中状态码含义：`A`=新增，`M`=修改，`D`=删除，`R`=重命名
/// - `staged_patch`: 暂存文件的完整补丁内容，包含具体的增删行信息
///
/// # 使用场景
///
/// - AI Agent 在提交前分析变更内容，生成合适的提交消息
/// - 代码审查时展示即将提交的完整差异
/// - 确认暂存区内容是否符合预期后再执行提交
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitPreparedCommitContext {
    /// 暂存文件的状态摘要（name-status 格式）
    pub staged_summary: String,
    /// 暂存文件的补丁内容
    pub staged_patch: String,
}

/// 范围上下文
///
/// 包含基础分支与当前 HEAD 之间的提交列表和差异补丁，用于描述一个分支范围内的完整变更。
///
/// # 字段说明
///
/// - `commits`: 提交列表，每行格式为 `<abbreviated-sha> <message>`（oneline 格式）
/// - `patch`: 基础分支与 HEAD 之间的完整差异补丁
///
/// # 使用场景
///
/// - 生成 PR 描述时提供变更范围和具体差异
/// - AI Agent 分析分支上的所有变更以生成摘要
/// - 代码审查时展示分支的完整变更历史
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitRangeContext {
    /// 提交列表（oneline 格式）
    pub commits: Vec<String>,
    /// 差异补丁内容
    pub patch: String,
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

        // 获取 ahead/behind 计数
        let (ahead_count, behind_count) = if upstream_ref.is_some() {
            let count_result = self
                .execute(ExecuteGitInput {
                    operation: "rev-list --left-right --count HEAD...@{u}".to_string(),
                    cwd: cwd.to_string(),
                    args: vec![
                        "rev-list".to_string(),
                        "--left-right".to_string(),
                        "--count".to_string(),
                        "HEAD...@{u}".to_string(),
                    ],
                    env: vec![],
                    allow_non_zero_exit: true,
                    timeout_ms: None,
                })
                .await?;

            if count_result.code == 0 {
                let parts: Vec<&str> = count_result.stdout.trim().split_whitespace().collect();
                if parts.len() == 2 {
                    let ahead = parts[0].parse::<u32>().unwrap_or(0);
                    let behind = parts[1].parse::<u32>().unwrap_or(0);
                    (ahead, behind)
                } else {
                    (0, 0)
                }
            } else {
                (0, 0)
            }
        } else {
            (0, 0)
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

            // porcelain 格式：前2字符为状态码，第3字符为空格，之后为文件路径
            // 状态码分为两列：第1列表示暂存区状态，第2列表示工作区状态
            let status = &line[0..2];
            let file = line[3..].to_string();

            match status {
                "??" => untracked_files.push(file),
                // 第1列非空、第2列为空格：仅暂存区有变更
                "M " | "A " | "D " => staged_files.push(file),
                // 第1列为空格、第2列非空：仅工作区有变更（未暂存）
                " M" | " A" | " D" => modified_files.push(file),
                // 两列都有值：暂存区和工作区都有变更（部分暂存后又有新的修改）
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
            ahead_count,
            behind_count,
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
        // TODO: cwd 硬编码为 "."，应改为接受参数以支持指定工作目录
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
        // TODO: cwd 硬编码为 "."，应改为接受参数以支持指定工作目录
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
        // 先检查远程仓库是否存在：使用 get-url 子命令查询指定远程的 URL
        // 如果远程不存在，该命令会返回非零退出码
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
    /// # 问题背景
    ///
    /// 当 Git 操作异常中断（如进程崩溃、用户手动终止）时，可能会残留 `.git/index.lock` 文件，
    /// 导致后续所有 Git 操作都被阻塞并报错 "Unable to create index.lock: File exists"。
    /// 此方法用于安全地移除该锁文件，恢复仓库的正常操作。
    ///
    /// # 参数
    ///
    /// - `cwd`: 仓库工作目录
    ///
    /// # 返回值
    ///
    /// - `Ok(())`: 移除成功或文件不存在
    /// - `Err(GitError::CommandError)`: 移除失败
    ///
    /// # 安全性
    ///
    /// 仅当锁文件存在时才尝试删除。如果当前确实有其他 Git 进程在运行，
    /// 删除锁文件可能导致数据损坏，调用方应确保没有其他 Git 操作正在进行。
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

    /// 获取详细的 Git 状态信息
    ///
    /// 获取比 `status` 更详细的仓库状态信息，包括分支计数、上游跟踪状态等。
    ///
    /// # 参数
    ///
    /// - `cwd`: 仓库工作目录
    ///
    /// # 返回值
    ///
    /// - `Ok(GitStatusDetails)`: 详细状态信息
    /// - `Err(GitError::CommandError)`: 命令执行失败
    pub async fn status_details(&self, cwd: &str) -> GitResult<GitStatusDetails> {
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

        let branch = if branch_result.code == 0 {
            let b = branch_result.stdout.trim();
            // "HEAD" 表示 detached HEAD 状态（不在任何分支上），转换为 None
            if b == "HEAD" { None } else { Some(b.to_string()) }
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

        // 获取 ahead/behind 计数
        let (ahead_count, behind_count) = if upstream_ref.is_some() {
            let count_result = self
                .execute(ExecuteGitInput {
                    operation: "rev-list --left-right --count HEAD...@{u}".to_string(),
                    cwd: cwd.to_string(),
                    args: vec![
                        "rev-list".to_string(),
                        "--left-right".to_string(),
                        "--count".to_string(),
                        "HEAD...@{u}".to_string(),
                    ],
                    env: vec![],
                    allow_non_zero_exit: true,
                    timeout_ms: None,
                })
                .await?;

            if count_result.code == 0 {
                let parts: Vec<&str> = count_result.stdout.trim().split_whitespace().collect();
                if parts.len() == 2 {
                    let ahead = parts[0].parse::<u32>().unwrap_or(0);
                    let behind = parts[1].parse::<u32>().unwrap_or(0);
                    (ahead, behind)
                } else {
                    (0, 0)
                }
            } else {
                (0, 0)
            }
        } else {
            (0, 0)
        };

        // 获取文件状态
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
        let has_upstream = upstream_ref.is_some();

        Ok(GitStatusDetails {
            branch,
            upstream_ref,
            has_upstream,
            ahead_count,
            behind_count,
            is_dirty,
            staged_files,
            modified_files,
            untracked_files,
        })
    }

    /// 读取工作区统一补丁
    ///
    /// 获取工作区（包括未跟踪文件）与 HEAD 之间的统一补丁。
    ///
    /// # 参数
    ///
    /// - `cwd`: 仓库工作目录
    ///
    /// # 返回值
    ///
    /// - `Ok(GitWorkingTreePatch)`: 工作区补丁
    /// - `Err(GitError::CommandError)`: 命令执行失败
    pub async fn read_working_tree_patch(&self, cwd: &str) -> GitResult<GitWorkingTreePatch> {
        // 检查 HEAD 是否存在
        let head_exists = self
            .execute(ExecuteGitInput {
                operation: "rev-parse --verify HEAD".to_string(),
                cwd: cwd.to_string(),
                args: vec!["rev-parse".to_string(), "--verify".to_string(), "HEAD".to_string()],
                env: vec![],
                allow_non_zero_exit: true,
                timeout_ms: None,
            })
            .await?;

        let tracked_patch = if head_exists.code == 0 {
            // 仓库有提交历史，直接获取工作区与 HEAD 的差异
            self.diff(cwd, false).await?
        } else {
            // 空仓库（没有任何提交），HEAD 不存在，无法使用 git diff
            // 尝试使用空树对象作为基准，获取所有已跟踪文件的差异
            // 注意：此命令在空仓库中可能返回非零退出码，因此 allow_non_zero_exit 设为 true
            let result = self
                .execute(ExecuteGitInput {
                    operation: "diff HEAD".to_string(),
                    cwd: cwd.to_string(),
                    args: vec![
                        "diff".to_string(),
                        "--patch".to_string(),
                        "--no-color".to_string(),
                        "--no-ext-diff".to_string(),
                        "HEAD".to_string(),
                    ],
                    env: vec![],
                    allow_non_zero_exit: true,
                    timeout_ms: Some(60000),
                })
                .await?;
            result.stdout
        };

        // 获取未跟踪文件的补丁
        let untracked_patches = self.read_untracked_patches(cwd).await?;

        let mut full_patch = tracked_patch;
        for patch in untracked_patches {
            if !full_patch.is_empty() && !full_patch.ends_with('\n') {
                full_patch.push('\n');
            }
            full_patch.push_str(&patch);
        }

        Ok(GitWorkingTreePatch { patch: full_patch })
    }

    /// 读取未暂存更改补丁
    ///
    /// 获取未暂存的已跟踪更改加上未跟踪文件的补丁。
    ///
    /// # 参数
    ///
    /// - `cwd`: 仓库工作目录
    ///
    /// # 返回值
    ///
    /// - `Ok(GitWorkingTreePatch)`: 未暂存补丁
    /// - `Err(GitError::CommandError)`: 命令执行失败
    pub async fn read_unstaged_patch(&self, cwd: &str) -> GitResult<GitWorkingTreePatch> {
        let tracked_patch = self.diff(cwd, false).await?;
        let untracked_patches = self.read_untracked_patches(cwd).await?;

        let mut full_patch = tracked_patch;
        for patch in untracked_patches {
            if !full_patch.is_empty() && !full_patch.ends_with('\n') {
                full_patch.push('\n');
            }
            full_patch.push_str(&patch);
        }

        Ok(GitWorkingTreePatch { patch: full_patch })
    }

    /// 读取已暂存更改补丁
    ///
    /// 获取暂存区与 HEAD 之间的补丁。
    ///
    /// # 参数
    ///
    /// - `cwd`: 仓库工作目录
    ///
    /// # 返回值
    ///
    /// - `Ok(GitWorkingTreePatch)`: 已暂存补丁
    /// - `Err(GitError::CommandError)`: 命令执行失败
    pub async fn read_staged_patch(&self, cwd: &str) -> GitResult<GitWorkingTreePatch> {
        let result = self
            .execute(ExecuteGitInput {
                operation: "diff --cached".to_string(),
                cwd: cwd.to_string(),
                args: vec![
                    "diff".to_string(),
                    "--cached".to_string(),
                    "--patch".to_string(),
                    "--no-color".to_string(),
                    "--no-ext-diff".to_string(),
                ],
                env: vec![],
                allow_non_zero_exit: true,
                timeout_ms: Some(60000),
            })
            .await?;

        Ok(GitWorkingTreePatch { patch: result.stdout })
    }

    /// 读取分支差异补丁
    ///
    /// 获取当前分支与上游/基础分支之间的差异补丁。
    ///
    /// # 参数
    ///
    /// - `cwd`: 仓库工作目录
    ///
    /// # 返回值
    ///
    /// - `Ok(GitWorkingTreePatch)`: 分支差异补丁
    /// - `Err(GitError::CommandError)`: 无法解析基础分支或命令执行失败
    pub async fn read_branch_patch(&self, cwd: &str) -> GitResult<GitWorkingTreePatch> {
        let details = self.status_details(cwd).await?;

        let base_branch = if let Some(ref upstream) = details.upstream_ref {
            Some(upstream.clone())
        } else if let Some(ref branch) = details.branch {
            // 尝试解析基础分支
            self.resolve_base_branch(cwd, branch).await.ok()
        } else {
            None
        };

        let base = base_branch.ok_or_else(|| {
            GitError::CommandError("无法解析当前分支的基础分支".to_string())
        })?;

        let result = self
            .execute(ExecuteGitInput {
                operation: "diff base...HEAD".to_string(),
                cwd: cwd.to_string(),
                args: vec![
                    "diff".to_string(),
                    "--patch".to_string(),
                    "--minimal".to_string(),
                    "--no-color".to_string(),
                    "--no-ext-diff".to_string(),
                    format!("{}...HEAD", base),
                ],
                env: vec![],
                allow_non_zero_exit: false,
                timeout_ms: Some(60000),
            })
            .await?;

        Ok(GitWorkingTreePatch { patch: result.stdout })
    }

    /// 准备提交上下文
    ///
    /// 暂存指定文件（或所有文件）并生成提交所需的摘要和补丁。
    ///
    /// # 参数
    ///
    /// - `cwd`: 仓库工作目录
    /// - `file_paths`: 要暂存的文件路径列表，None 表示暂存所有更改
    ///
    /// # 返回值
    ///
    /// - `Ok(Some(GitPreparedCommitContext))`: 提交上下文
    /// - `Ok(None)`: 没有可提交的更改
    /// - `Err(GitError::CommandError)`: 命令执行失败
    pub async fn prepare_commit_context(
        &self,
        cwd: &str,
        file_paths: Option<&[String]>,
    ) -> GitResult<Option<GitPreparedCommitContext>> {
        // 暂存文件
        if let Some(paths) = file_paths {
            if !paths.is_empty() {
                // 先重置暂存区，确保只有指定的文件被暂存
                // 这样做是因为之前可能有其他文件已在暂存区中，
                // 如果不重置，提交时会包含不相关的文件
                let _ = self
                    .execute(ExecuteGitInput {
                        operation: "reset".to_string(),
                        cwd: cwd.to_string(),
                        args: vec!["reset".to_string()],
                        env: vec![],
                        allow_non_zero_exit: true,
                        timeout_ms: None,
                    })
                    .await;

                // 添加指定文件
                let mut args = vec!["add".to_string(), "-A".to_string(), "--".to_string()];
                args.extend(paths.iter().cloned());
                self.execute(ExecuteGitInput {
                    operation: "add".to_string(),
                    cwd: cwd.to_string(),
                    args,
                    env: vec![],
                    allow_non_zero_exit: false,
                    timeout_ms: None,
                })
                .await?;
            }
        } else {
            self.execute(ExecuteGitInput {
                operation: "add -A".to_string(),
                cwd: cwd.to_string(),
                args: vec!["add".to_string(), "-A".to_string()],
                env: vec![],
                allow_non_zero_exit: false,
                timeout_ms: None,
            })
            .await?;
        }

        // 获取暂存摘要
        let summary_result = self
            .execute(ExecuteGitInput {
                operation: "diff --cached --name-status".to_string(),
                cwd: cwd.to_string(),
                args: vec![
                    "diff".to_string(),
                    "--cached".to_string(),
                    "--name-status".to_string(),
                ],
                env: vec![],
                allow_non_zero_exit: false,
                timeout_ms: None,
            })
            .await?;

        let staged_summary = summary_result.stdout.trim().to_string();
        if staged_summary.is_empty() {
            return Ok(None);
        }

        // 获取暂存补丁
        let patch_result = self
            .execute(ExecuteGitInput {
                operation: "diff --cached --patch".to_string(),
                cwd: cwd.to_string(),
                args: vec![
                    "diff".to_string(),
                    "--cached".to_string(),
                    "--patch".to_string(),
                    "--minimal".to_string(),
                ],
                env: vec![],
                allow_non_zero_exit: false,
                timeout_ms: None,
            })
            .await?;

        Ok(Some(GitPreparedCommitContext {
            staged_summary,
            staged_patch: patch_result.stdout,
        }))
    }

    /// 读取范围上下文
    ///
    /// 获取基础分支与当前 HEAD 之间的提交和差异上下文。
    ///
    /// # 参数
    ///
    /// - `cwd`: 仓库工作目录
    /// - `base_branch`: 基础分支名称
    ///
    /// # 返回值
    ///
    /// - `Ok(GitRangeContext)`: 范围上下文
    /// - `Err(GitError::CommandError)`: 命令执行失败
    pub async fn read_range_context(
        &self,
        cwd: &str,
        base_branch: &str,
    ) -> GitResult<GitRangeContext> {
        // 获取提交列表
        let log_result = self
            .execute(ExecuteGitInput {
                operation: "log".to_string(),
                cwd: cwd.to_string(),
                args: vec![
                    "log".to_string(),
                    "--oneline".to_string(),
                    "--no-color".to_string(),
                    format!("{}...HEAD", base_branch),
                ],
                env: vec![],
                allow_non_zero_exit: false,
                timeout_ms: None,
            })
            .await?;

        let commits: Vec<String> = log_result
            .stdout
            .lines()
            .map(|l| l.trim().to_string())
            .filter(|l| !l.is_empty())
            .collect();

        // 获取差异补丁
        let patch_result = self
            .execute(ExecuteGitInput {
                operation: "diff base...HEAD".to_string(),
                cwd: cwd.to_string(),
                args: vec![
                    "diff".to_string(),
                    "--patch".to_string(),
                    "--no-color".to_string(),
                    "--no-ext-diff".to_string(),
                    format!("{}...HEAD", base_branch),
                ],
                env: vec![],
                allow_non_zero_exit: false,
                timeout_ms: Some(60000),
            })
            .await?;

        Ok(GitRangeContext {
            commits,
            patch: patch_result.stdout,
        })
    }

    /// 读取 Git 配置值
    ///
    /// 从本地仓库读取指定的 Git 配置值。
    ///
    /// # 参数
    ///
    /// - `cwd`: 仓库工作目录
    /// - `key`: 配置键（如 "user.name"、"remote.origin.url"）
    ///
    /// # 返回值
    ///
    /// - `Ok(Some(String))`: 配置值
    /// - `Ok(None)`: 配置不存在
    /// - `Err(GitError::CommandError)`: 命令执行失败
    pub async fn read_config_value(&self, cwd: &str, key: &str) -> GitResult<Option<String>> {
        let result = self
            .execute(ExecuteGitInput {
                operation: "config".to_string(),
                cwd: cwd.to_string(),
                args: vec!["config".to_string(), "--get".to_string(), key.to_string()],
                env: vec![],
                allow_non_zero_exit: true,
                timeout_ms: None,
            })
            .await?;

        if result.code == 0 {
            Ok(Some(result.stdout.trim().to_string()))
        } else {
            Ok(None)
        }
    }

    /// 创建分离 worktree
    ///
    /// 从指定的分支或引用创建分离的 worktree（不创建新分支）。
    ///
    /// # 参数
    ///
    /// - `cwd`: 主仓库工作目录
    /// - `worktree_path`: 新 worktree 的绝对路径
    /// - `ref_spec`: 要检出的分支或引用
    ///
    /// # 返回值
    ///
    /// - `Ok(())`: worktree 创建成功
    /// - `Err(GitError::CommandError)`: 创建失败
    pub async fn create_detached_worktree(
        &self,
        cwd: &str,
        worktree_path: &str,
        ref_spec: &str,
    ) -> GitResult<()> {
        self.execute(ExecuteGitInput {
            operation: "worktree add --detach".to_string(),
            cwd: cwd.to_string(),
            args: vec![
                "worktree".to_string(),
                "add".to_string(),
                "--detach".to_string(),
                worktree_path.to_string(),
                ref_spec.to_string(),
            ],
            env: vec![],
            allow_non_zero_exit: false,
            timeout_ms: None,
        })
        .await?;

        Ok(())
    }

    /// 暂存并切换分支
    ///
    /// 暂存当前更改，切换到目标分支，然后恢复暂存。
    ///
    /// # 参数
    ///
    /// - `cwd`: 仓库工作目录
    /// - `branch_name`: 目标分支名称
    ///
    /// # 返回值
    ///
    /// - `Ok(())`: 操作成功
    /// - `Err(GitError::CommandError)`: 操作失败
    ///
    /// # 注意事项
    ///
    /// 无论分支切换是否成功，都会尝试恢复暂存的更改，以避免数据丢失。
    /// 如果恢复失败（如产生冲突），仅记录警告日志，不会中断操作。
    pub async fn stash_and_checkout(&self, cwd: &str, branch_name: &str) -> GitResult<()> {
        // 暂存当前更改
        self.stash(cwd).await?;

        // 切换分支
        let checkout_result = self.checkout_branch(cwd, branch_name).await;

        // 无论切换是否成功，都尝试恢复暂存，避免用户的更改丢失在 stash 栈中
        let _ = self.stash_pop(cwd).await;

        checkout_result
    }

    /// 读取未跟踪文件的补丁（内部辅助方法）
    ///
    /// 为每个未跟踪文件生成统一格式的补丁。由于 `git diff` 默认不包含未跟踪文件，
    /// 需要使用 `git diff --no-index /dev/null <file>` 的技巧来生成补丁，
    /// 这样可以将未跟踪文件视为"从空文件新增"，使其补丁格式与已跟踪文件一致。
    ///
    /// # 参数
    ///
    /// - `cwd`: 仓库工作目录
    ///
    /// # 返回值
    ///
    /// - `Ok(Vec<String>)`: 每个未跟踪文件的补丁内容列表
    /// - `Err(GitError)`: 命令执行失败
    async fn read_untracked_patches(&self, cwd: &str) -> GitResult<Vec<String>> {
        // 获取未跟踪文件列表
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

        let untracked_files: Vec<String> = status_result
            .stdout
            .lines()
            .filter(|line| line.starts_with("??"))
            .map(|line| line[3..].to_string())
            .collect();

        let mut patches = Vec::new();
        for file in untracked_files {
            // 使用 --no-index 比较 /dev/null 和文件，模拟"从空文件新增"的补丁
            // --src-prefix=a/ 和 --dst-prefix=b/ 使补丁路径格式与普通 diff 一致
            // --no-index 的退出码为 1（有差异时），因此需要 allow_non_zero_exit: true
            let result = self
                .execute(ExecuteGitInput {
                    operation: "diff /dev/null file".to_string(),
                    cwd: cwd.to_string(),
                    args: vec![
                        "diff".to_string(),
                        "--no-index".to_string(),
                        "--patch".to_string(),
                        "--no-color".to_string(),
                        "--src-prefix=a/".to_string(),
                        "--dst-prefix=b/".to_string(),
                        "--".to_string(),
                        "/dev/null".to_string(),
                        file.clone(),
                    ],
                    env: vec![],
                    allow_non_zero_exit: true,
                    timeout_ms: Some(30000),
                })
                .await?;

            if !result.stdout.is_empty() {
                patches.push(result.stdout);
            }
        }

        Ok(patches)
    }

    /// 解析基础分支（内部辅助方法）
    ///
    /// 尝试从常见的默认分支名称（main、master、develop）中找到与当前分支
    /// 存在共同祖先的基础分支。通过 `git merge-base` 命令验证分支间是否有共同历史。
    ///
    /// # 参数
    ///
    /// - `cwd`: 仓库工作目录
    /// - `branch`: 当前分支名称
    ///
    /// # 返回值
    ///
    /// - `Ok(String)`: 找到的基础分支名称
    /// - `Err(GitError::CommandError)`: 所有候选分支都不适用
    ///
    /// # 实现策略
    ///
    /// 按优先级依次尝试 "main"、"master"、"develop" 三个常见的默认分支名称。
    /// 如果 `git merge-base` 返回成功（退出码 0），说明该分支与当前分支有共同祖先，
    /// 即可作为基础分支使用。
    async fn resolve_base_branch(&self, cwd: &str, branch: &str) -> GitResult<String> {
        // 尝试常见的 base 分支
        for base in &["main", "master", "develop"] {
            let result = self
                .execute(ExecuteGitInput {
                    operation: "merge-base".to_string(),
                    cwd: cwd.to_string(),
                    args: vec![
                        "merge-base".to_string(),
                        base.to_string(),
                        branch.to_string(),
                    ],
                    env: vec![],
                    allow_non_zero_exit: true,
                    timeout_ms: None,
                })
                .await?;

            if result.code == 0 {
                return Ok(base.to_string());
            }
        }

        Err(GitError::CommandError(format!(
            "无法为分支 '{}' 解析基础分支",
            branch
        )))
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
