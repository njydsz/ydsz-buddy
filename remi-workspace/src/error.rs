//! Workspace 模块错误类型

use thiserror::Error;

/// Workspace 错误
#[derive(Error, Debug)]
pub enum WorkspaceError {
    #[error("路径超出工作空间根目录: {0}")]
    PathOutsideRoot(String),

    #[error("文件不存在: {0}")]
    FileNotFound(String),

    #[error("目录不存在: {0}")]
    DirectoryNotFound(String),

    #[error("IO 错误: {0}")]
    IoError(#[from] std::io::Error),

    #[error("路径无效: {0}")]
    InvalidPath(String),

    #[error("内部错误: {0}")]
    InternalError(String),
}

/// Workspace 结果类型
pub type WorkspaceResult<T> = Result<T, WorkspaceError>;
