//! # 命令执行器错误类型

use thiserror::Error;

#[derive(Debug, Error)]
pub enum RunnerError {
    #[error("工作目录不存在: {0}")]
    InvalidCwd(String),

    #[error("命令启动失败: {0}")]
    SpawnFailed(String),

    #[error("等待命令完成失败: {0}")]
    WaitFailed(String),
}
