//! 终端模式定义。

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// 终端会话信息。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct TerminalSession {
    /// 会话 ID。
    pub id: Uuid,
    /// 关联的线程 ID（如有）。
    pub thread_id: Option<Uuid>,
    /// 工作目录。
    pub cwd: String,
    /// Shell 命令。
    pub shell: String,
    /// 创建时间戳（ISO 8601 格式）。
    pub created_at: String,
}

/// 创建终端会话的输入参数。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct CreateTerminalInput {
    /// 工作目录。
    pub cwd: String,
    /// Shell 命令（可选，未指定时使用默认值）。
    pub shell: Option<String>,
    /// 线程 ID（可选）。
    pub thread_id: Option<Uuid>,
    /// 终端列数。
    pub cols: Option<u16>,
    /// 终端行数。
    pub rows: Option<u16>,
}

/// 创建终端会话的输出。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct CreateTerminalOutput {
    /// 会话 ID。
    pub id: Uuid,
}

/// 向终端写入数据的输入参数。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct WriteTerminalInput {
    /// 会话 ID。
    pub session_id: Uuid,
    /// 要写入的数据。
    pub data: String,
}

/// 调整终端大小的输入参数。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ResizeTerminalInput {
    /// 会话 ID。
    pub session_id: Uuid,
    /// 新的列数。
    pub cols: u16,
    /// 新的行数。
    pub rows: u16,
}

/// 关闭终端会话的输入参数。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct CloseTerminalInput {
    /// 会话 ID。
    pub session_id: Uuid,
}

/// 清除终端历史记录的输入参数。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ClearTerminalInput {
    /// 会话 ID。
    pub session_id: Uuid,
}

/// 重启终端会话的输入参数。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct RestartTerminalInput {
    /// 会话 ID。
    pub session_id: Uuid,
}

/// 订阅终端输出的输入参数。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct SubscribeTerminalOutputInput {
    /// 会话 ID。
    pub session_id: Uuid,
}

/// 终端输出事件。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct TerminalOutputEvent {
    /// 会话 ID。
    pub session_id: Uuid,
    /// 输出数据。
    pub data: String,
}

/// 终端退出事件。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct TerminalExitEvent {
    /// 会话 ID。
    pub session_id: Uuid,
    /// 退出码。
    pub exit_code: i32,
}

/// 终端标题变更事件。
///
/// 当运行中的程序发送 OSC 0/1/2 序列来设置终端标题时触发
/// （例如 tmux/zellij 窗格、vim 等）。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct TerminalTitleEvent {
    /// 会话 ID。
    pub session_id: Uuid,
    /// 新标题。
    pub title: String,
}

/// 终端状态快照，用于 `terminal.status` 查询。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct TerminalStatus {
    /// 会话 ID。
    pub session_id: Uuid,
    /// 底层进程是否仍在运行。
    pub running: bool,
    /// 最近观察到的退出码（如有）。
    pub exit_code: Option<i32>,
    /// 最近报告的标题。
    pub title: String,
    /// 从进程接收的字节数。
    pub bytes_received: u64,
    /// 向进程发送的字节数。
    pub bytes_sent: u64,
    /// 会话创建时间戳（ISO 8601 格式）。
    pub created_at: String,
    /// 最近活动时间戳（ISO 8601 格式）。
    pub last_activity_at: String,
}

/// 聚合事件流，订阅者可监听此流。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum TerminalEvent {
    /// 普通 PTY 输出。
    Output(TerminalOutputEvent),
    /// 标题更新。
    Title(TerminalTitleEvent),
    /// 进程已退出。
    Exit(TerminalExitEvent),
}
