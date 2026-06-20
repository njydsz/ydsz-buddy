//! ACP 数据模型定义
//!
//! 本模块定义 ACP 协议的核心数据结构和事件类型。

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// ACP 会话模式
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AcpSessionMode {
    /// 默认模式
    Default,
    /// 计划模式
    Plan,
    /// 自定义模式
    Custom(String),
}

/// ACP 会话模式状态
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcpSessionModeState {
    /// 当前模式
    pub mode: AcpSessionMode,
    /// 模式特定的元数据
    pub metadata: HashMap<String, serde_json::Value>,
}

/// ACP 工具调用状态
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AcpToolCallState {
    /// 待处理
    Pending,
    /// 运行中
    Running,
    /// 已完成
    Completed,
    /// 已失败
    Failed,
}

/// ACP 工具调用
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcpToolCall {
    /// 工具调用 ID
    pub id: String,
    /// 工具名称
    pub name: String,
    /// 调用参数
    pub arguments: serde_json::Value,
    /// 调用状态
    pub state: AcpToolCallState,
    /// 执行结果
    pub result: Option<serde_json::Value>,
    /// 错误信息
    pub error: Option<String>,
}

/// ACP 计划更新
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcpPlanUpdate {
    /// 计划 ID
    pub id: String,
    /// 计划内容（Markdown）
    pub content: String,
    /// 是否已实现
    pub implemented: bool,
}

/// ACP 权限请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcpPermissionRequest {
    /// 请求 ID
    pub id: String,
    /// 请求类型
    pub request_type: String,
    /// 请求描述
    pub description: String,
    /// 可用选项
    pub options: Vec<AcpPermissionOption>,
}

/// ACP 权限选项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcpPermissionOption {
    /// 选项 ID
    pub id: String,
    /// 选项标签
    pub label: String,
    /// 是否为推荐选项
    pub recommended: bool,
}

/// ACP 会话更新事件
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AcpSessionUpdateEvent {
    /// 内容增量更新
    ContentDelta {
        /// 增量内容
        delta: String,
    },
    /// 工具调用事件
    ToolCall {
        /// 工具调用信息
        tool_call: AcpToolCall,
    },
    /// 计划更新
    PlanUpdate {
        /// 计划更新信息
        plan: AcpPlanUpdate,
    },
    /// 权限请求
    PermissionRequest {
        /// 权限请求信息
        request: AcpPermissionRequest,
    },
    /// Token 使用统计
    TokenUsage {
        /// 输入 token 数
        input_tokens: u64,
        /// 输出 token 数
        output_tokens: u64,
    },
    /// 会话完成
    SessionComplete {
        /// 完成原因
        reason: String,
    },
    /// 错误事件
    Error {
        /// 错误代码
        code: String,
        /// 错误消息
        message: String,
    },
}

/// ACP 解析后的会话事件
#[derive(Debug, Clone)]
pub enum AcpParsedSessionEvent {
    /// 内容增量
    ContentDelta(String),
    /// 工具调用
    ToolCall(AcpToolCall),
    /// 计划更新
    PlanUpdate(AcpPlanUpdate),
    /// 权限请求
    PermissionRequest(AcpPermissionRequest),
    /// Token 使用
    TokenUsage { input: u64, output: u64 },
    /// 会话完成
    SessionComplete(String),
    /// 错误
    Error { code: String, message: String },
}

/// 解析 ACP 会话更新事件
pub fn parse_session_update_event(event: &AcpSessionUpdateEvent) -> AcpParsedSessionEvent {
    match event {
        AcpSessionUpdateEvent::ContentDelta { delta } => {
            AcpParsedSessionEvent::ContentDelta(delta.clone())
        }
        AcpSessionUpdateEvent::ToolCall { tool_call } => {
            AcpParsedSessionEvent::ToolCall(tool_call.clone())
        }
        AcpSessionUpdateEvent::PlanUpdate { plan } => {
            AcpParsedSessionEvent::PlanUpdate(plan.clone())
        }
        AcpSessionUpdateEvent::PermissionRequest { request } => {
            AcpParsedSessionEvent::PermissionRequest(request.clone())
        }
        AcpSessionUpdateEvent::TokenUsage {
            input_tokens,
            output_tokens,
        } => AcpParsedSessionEvent::TokenUsage {
            input: *input_tokens,
            output: *output_tokens,
        },
        AcpSessionUpdateEvent::SessionComplete { reason } => {
            AcpParsedSessionEvent::SessionComplete(reason.clone())
        }
        AcpSessionUpdateEvent::Error { code, message } => AcpParsedSessionEvent::Error {
            code: code.clone(),
            message: message.clone(),
        },
    }
}

/// ACP 会话配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcpSessionConfig {
    /// 模型 ID
    pub model_id: String,
    /// 系统提示
    pub system_prompt: Option<String>,
    /// 会话模式
    pub mode: AcpSessionMode,
    /// 额外配置
    pub extra: HashMap<String, serde_json::Value>,
}

/// ACP 生成输入
#[derive(Debug, Clone)]
pub struct AcpSpawnInput {
    /// 可执行文件路径
    pub executable: String,
    /// 命令行参数
    pub args: Vec<String>,
    /// 环境变量
    pub env: HashMap<String, String>,
    /// 工作目录
    pub cwd: Option<String>,
    /// 会话配置
    pub config: AcpSessionConfig,
}
