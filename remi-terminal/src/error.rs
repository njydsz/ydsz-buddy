//! Terminal 模块错误类型

use thiserror::Error;

/// Terminal 错误
#[derive(Error, Debug)]
pub enum TerminalError {
    #[error("终端不存在: {0}")]
    TerminalNotFound(String),

    #[error("终端已存在: {0}")]
    TerminalAlreadyExists(String),

    #[error("PTY 错误: {0}")]
    PtyError(String),

    #[error("终端未启动")]
    TerminalNotStarted,

    #[error("终端已退出")]
    TerminalExited,

    #[error("内部错误: {0}")]
    InternalError(String),
}

/// Terminal 结果类型
pub type TerminalResult<T> = Result<T, TerminalError>;
