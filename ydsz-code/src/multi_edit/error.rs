//! # 多文件编辑器错误类型

use thiserror::Error;

#[derive(Debug, Error)]
pub enum EditorError {
    #[error("工作区不存在: {0}")]
    InvalidWorkspace(String),

    #[error("文件已存在: {0}")]
    FileExists(String),

    #[error("文件不存在: {0}")]
    FileNotFound(String),

    #[error("IO 错误: {0}")]
    IoError(String),
}
