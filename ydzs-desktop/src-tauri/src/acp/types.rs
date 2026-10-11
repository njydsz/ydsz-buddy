//! # ACP 协议类型定义
//!
//! 定义 Agent Client Protocol 通信中使用的核心数据类型。

use serde::{Deserialize, Serialize};

/// ACP 会话请求
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AcpSessionRequest {
    pub session_id: String,
    pub task: String,
    pub context: Option<String>,
}

/// ACP Agent 响应
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AcpAgentResponse {
    pub session_id: String,
    pub status: String,
    pub output: Option<String>,
    pub error: Option<String>,
}

/// ACP 工具调用请求
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AcpToolCall {
    pub call_id: String,
    pub tool_name: String,
    pub arguments: serde_json::Value,
}

/// ACP 工具调用结果
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AcpToolResult {
    pub call_id: String,
    pub success: bool,
    pub output: Option<String>,
    pub error: Option<String>,
}

/// ACP 会话状态
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum AcpSessionState {
    Idle,
    Running,
    Completed,
    Failed(String),
}

/// ACP 服务状态
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AcpServerStatus {
    pub running: bool,
    pub session_count: u32,
}

/// ACP 入站会话信息
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AcpInboundSession {
    pub session_id: String,
    pub state: AcpSessionState,
    pub started_at: Option<String>,
}

/// ACP 出站 Runner 配置
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AcpOutboundRunner {
    pub runner_id: String,
    pub runner_type: String,
    pub command_path: String,
    pub args: Vec<String>,
}
