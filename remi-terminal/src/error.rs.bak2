//! Terminal 模块错误类型定义
//!
//! 本模块定义了终端模块专用的错误枚举和结果类型别名，
//! 为终端操作中的各类异常情况提供语义清晰的错误表达。
//!
//! # 设计说明
//!
//! - 使用 `thiserror` 派生宏自动生成 `Display` 和 `Error` trait 实现
//! - 每个变体对应一种特定的终端异常场景，便于调用方进行精确的模式匹配和错误处理
//! - 提供 [`TerminalResult`] 类型别名，统一模块内所有函数的返回值类型

use thiserror::Error;

/// 终端模块统一错误类型
///
/// 涵盖终端生命周期中可能出现的所有异常场景，包括会话查找失败、
/// 状态冲突、底层 PTY 错误以及内部运行时异常。
///
/// # 使用示例
///
/// ```ignore
/// match terminal_manager.open(input).await {
///
Ok(snapshot) => { /* 处理成功 */ },
///
Err(TerminalError::TerminalNotFound(id)) => { /* 会话不存在 */ },
///
Err(TerminalError::TerminalAlreadyExists(id)) => { /* 会话已存在 */ },
///
Err(e) => { /* 其他错误 */ },
/// }
/// ```
#[derive(Error, Debug)]
pub enum TerminalError {
    /// 终端会话未找到
    ///
    /// 当尝试对不存在的终端执行写入、调整大小、关闭等操作时返回此错误。
    /// 携带的 `String` 参数为会话键（格式：`thread_id:terminal_id`），用于定位问题。
    #[error("终端不存在: {0}")]
    TerminalNotFound(String),

    /// 终端会话已存在
    ///
    /// 当尝试创建一个与现有会话键冲突的新终端时返回此错误。
    /// 携带的 `String` 参数为冲突的会话键。
    #[error("终端已存在: {0}")]
    TerminalAlreadyExists(String),

    /// 底层 PTY 操作错误
    ///
    /// 封装来自 `portable-pty` 库或操作系统层面的伪终端错误，
    /// 例如 PTY 分配失败、子进程启动失败等。
    #[error("PTY 错误: {0}")]
    PtyError(String),

    /// 终端未启动
    ///
    /// 当尝试向一个尚未完成启动流程的终端写入数据时返回此错误。
    /// 通常发生在终端状态不为 `Running` 的情况下。
    #[error("终端未启动")]
    TerminalNotStarted,

    /// 终端已退出
    ///
    /// 当尝试对一个已经退出的终端执行操作时返回此错误。
    /// 可通过重启终端恢复使用。
    #[error("终端已退出")]
    TerminalExited,

    /// 内部错误
    ///
    /// 捕获未归入上述分类的内部异常，通常表示不可预期的运行时错误。
    /// 携带的 `String` 参数包含错误的详细描述信息。
    #[error("内部错误: {0}")]
    InternalError(String),
}

/// 终端模块统一结果类型
///
/// 所有终端模块公开 API 的返回值类型别名，
/// 成功时返回泛型 `T`，失败时返回 [`TerminalError`]。
pub type TerminalResult<T> = Result<T, TerminalError>;
