//! # Git 模块错误类型定义
//!
//! 本模块定义了 Git 操作中可能遇到的所有错误类型，提供统一的错误处理机制。
//!
//! ## 模块职责
//!
//! - **错误分类**：将 Git 操作中的各种失败场景分类为具体的错误变体
//! - **错误信息标准化**：为每种错误类型提供清晰的中文错误描述
//! - **类型安全的结果封装**：提供 `GitResult<T>` 类型别名，简化函数签名
//!
//! ## 错误类型
//!
//! | 错误变体 | 触发场景 |
//! |---------|---------|
//! | `CommandError` | Git 命令执行失败（非零退出码且不允许非零退出） |
//! | `DirtyWorktree` | 工作区存在未提交的更改，阻止某些操作执行 |
//! | `BranchNotFound` | 尝试操作不存在的分支 |
//! | `BranchAlreadyExists` | 尝试创建已存在的分支 |
//! | `WorktreeError` | Worktree 创建、删除或切换失败 |
//! | `RepositoryNotInitialized` | 在尚未初始化的仓库中执行 Git 操作 |
//! | `InternalError` | 内部逻辑错误或未预期的异常 |
//!
//! ## 使用示例
//!
//!```rust,ignore
//! use remi_git::{GitError, GitResult};
//!
//! fn example() -> GitResult<()> {
//!     // 返回具体错误
//!     Err(GitError::BranchNotFound("main".to_string()))
//! }
//! ```

use thiserror::Error;

/// Git 操作错误枚举
///
/// 封装了 Git 操作中可能遇到的所有错误类型，每个变体都包含具体的错误信息。
/// 使用 `thiserror` 库自动实现 `Display` trait，提供标准化的错误消息格式。
#[derive(Error, Debug)]
pub enum GitError {
    /// Git 命令执行失败
    ///
    /// 当 Git 命令返回非零退出码且未设置 `allow_non_zero_exit` 时抛出。
    /// 包含命令的 stderr 输出，便于诊断问题。
    ///
    /// # 示例场景
    /// - `git push` 失败（网络问题、权限不足）
    /// - `git commit` 失败（没有暂存的更改）
    #[error("Git 命令执行失败: {0}")]
    CommandError(String),

    /// 工作区存在未提交的更改
    ///
    /// 当执行需要干净工作区的操作（如分支切换、worktree 操作）时，
    /// 如果检测到未提交的更改则抛出此错误。
    ///
    /// # 解决方案
    /// - 提交当前更改
    /// - 使用 `git stash` 暂存更改
    /// - 放弃未提交的修改
    #[error("工作区有未提交的更改")]
    DirtyWorktree,

    /// 分支不存在
    ///
    /// 尝试切换到不存在的分支，或操作不存在的远程/本地分支时抛出。
    /// 包含尝试访问的分支名称。
    ///
    /// # 示例场景
    /// - `git checkout non-existent-branch`
    /// - 删除不存在的分支
    #[error("分支不存在: {0}")]
    BranchNotFound(String),

    /// 分支已存在
    ///
    /// 尝试创建已存在的分支时抛出。Git 不允许创建重复的分支名称。
    /// 包含冲突的分支名称。
    ///
    /// # 示例场景
    /// - `git branch existing-branch`（分支已存在）
    /// - 创建 worktree 时指定的分支名已被占用
    #[error("分支已存在: {0}")]
    BranchAlreadyExists(String),

    /// Worktree 操作错误
    ///
    /// 在执行 worktree 相关操作时发生的错误，包括创建、删除、切换等。
    /// 包含具体的错误描述。
    ///
    /// # 示例场景
    /// - 创建 worktree 时路径已被占用
    /// - 删除 worktree 时存在未提交的更改
    /// - worktree 路径不存在
    #[error("Worktree 错误: {0}")]
    WorktreeError(String),

    /// 仓库未初始化
    ///
    /// 在非 Git 仓库目录中执行 Git 操作时抛出。通常是因为目录中没有 `.git` 子目录。
    ///
    /// # 解决方案
    /// - 先执行 `git init` 初始化仓库
    /// - 确认当前目录是正确的 Git 仓库根目录
    #[error("仓库未初始化")]
    RepositoryNotInitialized,

    /// 内部错误
    ///
    /// 表示未预期的内部逻辑错误或系统级异常。通常不应该出现此错误，
    /// 如果出现则说明存在 bug 或环境问题。
    ///
    /// # 示例场景
    /// - UTF-8 解码失败
    /// - 进程通信异常
    /// - 文件系统错误
    #[error("内部错误: {0}")]
    InternalError(String),
}

/// Git 操作结果类型
///
/// 所有 Git 操作的统一返回类型，封装了成功值或 `GitError` 错误。
/// 简化函数签名，提高代码可读性。
///
/// # 类型参数
/// - `T`: 成功时返回的值类型
///
/// # 示例
///```rust,ignore
/// use remi_git::GitResult;
///
/// fn get_status() -> GitResult<String> {
///     Ok("on branch main".to_string())
/// }
/// ```
pub type GitResult<T> = Result<T, GitError>;
