//! 终端（PTY）相关的模式定义
//!
//! 定义终端会话、读写、调整大小、订阅输出等动作的 DTO，以及事件流 [`TerminalEvent`]。
//!
//! # 设计原则
//! - **会话独立**：每个 [`TerminalSession`] 绑定一个 [`Uuid`]，支持并发多个终端。
//! - **事件驱动**：终端输出/标题/退出通过 [`TerminalEvent`] 推送给前端，避免轮询。
//! - **线程关联**：可选的 `thread_id` 字段把"命令执行"与"AI 会话"打通，
//!   便于审计回溯"哪条 AI 指令触发了哪些命令"。

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// 终端会话元信息
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSession {
    /// 会话 ID
    pub id: Uuid,
    /// 关联的线程 ID（如有）
    pub thread_id: Option<Uuid>,
    /// 工作目录
    pub cwd: String,
    /// Shell 命令
    pub shell: String,
    /// 创建时间戳（ISO 8601 字符串）
    pub created_at: String,
}

/// 创建终端会话的入参
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateTerminalInput {
    /// 工作目录
    pub cwd: String,
    /// Shell 命令（可选，未指定时使用平台默认值）
    pub shell: Option<String>,
    /// 关联的线程 ID（可选）
    pub thread_id: Option<Uuid>,
    /// 终端列数（可选）
    pub cols: Option<u16>,
    /// 终端行数（可选）
    pub rows: Option<u16>,
}

/// 创建终端会话的出参
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateTerminalOutput {
    /// 新会话 ID
    pub id: Uuid,
}

/// 向终端写入数据的入参
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WriteTerminalInput {
    /// 会话 ID
    pub session_id: Uuid,
    /// 要写入的数据
    pub data: String,
}

/// 调整终端大小的入参
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ResizeTerminalInput {
    /// 会话 ID
    pub session_id: Uuid,
    /// 新的列数
    pub cols: u16,
    /// 新的行数
    pub rows: u16,
}

/// 关闭终端会话的入参
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CloseTerminalInput {
    /// 会话 ID
    pub session_id: Uuid,
}

/// 清除终端历史记录的入参
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ClearTerminalInput {
    /// 会话 ID
    pub session_id: Uuid,
}

/// 重启终端会话的入参
///
/// 关闭并重新创建会话，保留历史日志但重置 PTY 状态。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct RestartTerminalInput {
    /// 会话 ID
    pub session_id: Uuid,
}

/// 订阅终端输出的入参
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SubscribeTerminalOutputInput {
    /// 会话 ID
    pub session_id: Uuid,
}

/// 终端输出事件
///
/// 增量推送 PTY 输出，前端使用 xterm.js 等终端模拟器渲染。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct TerminalOutputEvent {
    /// 会话 ID
    pub session_id: Uuid,
    /// 输出数据
    pub data: String,
}

/// 终端退出事件
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct TerminalExitEvent {
    /// 会话 ID
    pub session_id: Uuid,
    /// 退出码
    pub exit_code: i32,
}

/// 终端标题变更事件
///
/// 当运行中的程序发送 OSC 0/1/2 序列来设置终端标题时触发
/// （例如 tmux/zellij 窗格、vim 等）。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct TerminalTitleEvent {
    /// 会话 ID
    pub session_id: Uuid,
    /// 新标题
    pub title: String,
}

/// 终端状态快照，用于 `terminal.status` 查询
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct TerminalStatus {
    /// 会话 ID
    pub session_id: Uuid,
    /// 底层进程是否仍在运行
    pub running: bool,
    /// 最近观察到的退出码（如有）
    pub exit_code: Option<i32>,
    /// 最近报告的标题
    pub title: String,
    /// 从进程接收的字节数
    pub bytes_received: u64,
    /// 向进程发送的字节数
    pub bytes_sent: u64,
    /// 会话创建时间戳（ISO 8601 字符串）
    pub created_at: String,
    /// 最近活动时间戳（ISO 8601 字符串）
    pub last_activity_at: String,
}

/// 聚合事件流，订阅者可监听此流
///
/// 使用 `#[serde(tag = "kind", rename_all = "snake_case")]` 外部判别式序列化，
/// 前端按 `kind` 字段做模式匹配。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum TerminalEvent {
    /// 普通 PTY 输出
    Output(TerminalOutputEvent),
    /// 标题更新
    Title(TerminalTitleEvent),
    /// 进程已退出
    Exit(TerminalExitEvent),
}
