//! Git 模块错误类型

use thiserror::Error;

/// Git 错误
#[derive(Error, Debug)]
pub enum GitError {
    #[error("Git 命令执行失败: {0}")]
    CommandError(String),

    #[error("工作区有未提交的更改")]
    DirtyWorktree,

    #[error("分支不存在: {0}")]
    BranchNotFound(String),

    #[error("分支已存在: {0}")]
    BranchAlreadyExists(String),

    #[error("Worktree 错误: {0}")]
    WorktreeError(String),

    #[error("仓库未初始化")]
    RepositoryNotInitialized,

    #[error("内部错误: {0}")]
    InternalError(String),
}

/// Git 结果类型
pub type GitResult<T> = Result<T, GitError>;
