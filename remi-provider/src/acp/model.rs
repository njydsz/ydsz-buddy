//! ACP 数据模型定义
//!
//! 本模块定义 ACP (Agent Client Protocol) 协议的核心数据结构和事件类型，
//! 用于与 ACP 兼容的 Provider 客户端（如 Cursor、Grok）进行通信。
//!
//! # 核心概念
//!
//! - **[`AcpSessionMode`]**: 会话运行模式，控制 Agent 的行为策略
//! - **[`AcpToolCallState`]**: 工具调用的生命周期状态
//! - **[`AcpSessionUpdateEvent`]**: 会话更新事件，由 ACP 客户端推送
//! - **[`AcpParsedSessionEvent`]**: 解析后的会话事件，用于内部事件处理
//! - **[`AcpSessionConfig`]**: 会话配置，包含模型、提示词、模式等
//! - **[`AcpSpawnInput`]**: 进程启动参数，用于创建 ACP 会话运行时
//!
//! # 事件流
//!
//! ACP 客户端通过 JSON-RPC 通知推送会话更新事件，事件类型包括：
//!
//! ```text
//! AcpSessionUpdateEvent
//! ├── ContentDelta      ← 内容增量更新（流式输出）
//! ├── ToolCall          ← 工具调用状态变更
//! ├── PlanUpdate        ← 计划内容更新
//! ├── PermissionRequest ← 权限审批请求
//! ├── TokenUsage        ← Token 消耗统计
//! ├── SessionComplete   ← 会话执行完成
//! └── Error             ← 错误事件
//! ```
//!
//! # 模块依赖
//!
//! - 被 [`crate::acp::events`] 模块依赖，用于事件映射
//! - 被 [`crate::acp::runtime`] 模块依赖，用于会话配置
//! - 被 [`crate::acp::cursor`] 和 [`crate::acp::grok`] 模块依赖，用于构建启动参数

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// ACP 会话模式
///
/// 定义 Agent 的运行模式，不同模式下 Agent 的行为策略不同。
/// 例如，计划模式下 Agent 会先制定计划再执行，而非直接执行操作。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AcpSessionMode {
    /// 默认模式
    ///
    /// Agent 按标准流程执行，直接响应用户请求
    Default,
    /// 计划模式
    ///
    /// Agent 先制定执行计划，经用户确认后再逐步执行
    Plan,
    /// 自定义模式
    ///
    /// 由 Provider 定义的特殊运行模式，通过字符串标识
    Custom(String),
}

/// ACP 会话模式状态
///
/// 记录当前会话的模式及其关联的元数据信息。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcpSessionModeState {
    /// 当前模式
    pub mode: AcpSessionMode,
    /// 模式特定的元数据
    ///
    /// 不同模式可能携带不同的附加信息，例如计划模式下可能包含计划 ID 等
    pub metadata: HashMap<String, serde_json::Value>,
}

/// ACP 工具调用状态
///
/// 描述工具调用在生命周期中所处的阶段，从创建到完成或失败。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AcpToolCallState {
    /// 待处理
    ///
    /// 工具调用已创建但尚未开始执行
    Pending,
    /// 运行中
    ///
    /// 工具正在执行中
    Running,
    /// 已完成
    ///
    /// 工具执行成功完成，结果可用
    Completed,
    /// 已失败
    ///
    /// 工具执行过程中发生错误
    Failed,
}

/// ACP 工具调用
///
/// 记录一次工具调用的完整信息，包括调用参数、执行状态和结果。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcpToolCall {
    /// 工具调用 ID
    ///
    /// 唯一标识一次工具调用，用于关联调用请求和结果
    pub id: String,
    /// 工具名称
    ///
    /// 被调用的工具标识，如 'file_read'、'shell_exec' 等
    pub name: String,
    /// 调用参数
    ///
    /// 传递给工具的参数，格式由具体工具定义
    pub arguments: serde_json::Value,
    /// 调用状态
    ///
    /// 工具调用的当前执行状态
    pub state: AcpToolCallState,
    /// 执行结果
    ///
    /// 工具执行成功时的返回值，仅在 `state` 为 `Completed` 时有值
    pub result: Option<serde_json::Value>,
    /// 错误信息
    ///
    /// 工具执行失败时的错误描述，仅在 `state` 为 `Failed` 时有值
    pub error: Option<String>,
}

/// ACP 计划更新
///
/// 记录 Agent 执行计划的更新信息，用于计划模式下的进度跟踪。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcpPlanUpdate {
    /// 计划 ID
    ///
    /// 唯一标识一个执行计划
    pub id: String,
    /// 计划内容（Markdown）
    ///
    /// 以 Markdown 格式描述的计划步骤和内容
    pub content: String,
    /// 是否已实现
    ///
    /// 标记该计划是否已经执行完成
    pub implemented: bool,
}

/// ACP 权限请求
///
/// Agent 在执行需要用户授权的操作时发出的审批请求，
/// 用户可以从提供的选项中选择一个进行响应。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcpPermissionRequest {
    /// 请求 ID
    ///
    /// 唯一标识一次权限请求，用于关联审批响应
    pub id: String,
    /// 请求类型
    ///
    /// 权限请求的分类，如 'file_write'、'shell_execute' 等
    pub request_type: String,
    /// 请求描述
    ///
    /// 人类可读的操作描述，说明 Agent 请求执行的具体操作
    pub description: String,
    /// 可用选项
    ///
    /// 用户可以选择的审批选项列表，通常包含'允许'、'拒绝'等
    pub options: Vec<AcpPermissionOption>,
}

/// ACP 权限选项
///
/// 权限请求中的一个可选响应项，用户通过选择某个选项来决定是否授权。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcpPermissionOption {
    /// 选项 ID
    ///
    /// 唯一标识一个选项，用于在响应中引用
    pub id: String,
    /// 选项标签
    ///
    /// 用户界面中显示的选项文本，如'允许'、'拒绝'、'仅本次允许'等
    pub label: String,
    /// 是否为推荐选项
    ///
    /// 标记此选项是否为系统推荐的默认选择
    pub recommended: bool,
}

/// ACP 会话更新事件
///
/// ACP 客户端通过 JSON-RPC 通知推送的会话更新事件，
/// 使用 `#[serde(tag = 'type')]` 实现带标签的枚举序列化。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AcpSessionUpdateEvent {
    /// 内容增量更新
    ///
    /// Agent 输出的流式文本增量，用于实时显示 Agent 的响应内容
    ContentDelta {
        /// 增量内容
        delta: String,
    },
    /// 工具调用事件
    ///
    /// 工具调用的状态变更通知，包括调用开始、完成、失败等
    ToolCall {
        /// 工具调用信息
        tool_call: AcpToolCall,
    },
    /// 计划更新
    ///
    /// 执行计划的内容或状态变更通知
    PlanUpdate {
        /// 计划更新信息
        plan: AcpPlanUpdate,
    },
    /// 权限请求
    ///
    /// Agent 请求用户授权执行某个操作
    PermissionRequest {
        /// 权限请求信息
        request: AcpPermissionRequest,
    },
    /// Token 使用统计
    ///
    /// 当前会话的 Token 消耗统计，用于成本监控和用量展示
    TokenUsage {
        /// 输入 token 数
        input_tokens: u64,
        /// 输出 token 数
        output_tokens: u64,
    },
    /// 会话完成
    ///
    /// Agent 已完成当前任务，会话进入结束状态
    SessionComplete {
        /// 完成原因
        ///
        /// 描述会话完成的原因，如 'task_completed'、'user_cancelled' 等
        reason: String,
    },
    /// 错误事件
    ///
    /// 会话执行过程中发生的错误
    Error {
        /// 错误代码
        ///
        /// 机器可读的错误标识，如 'rate_limit_exceeded'、'context_overflow' 等
        code: String,
        /// 错误消息
        ///
        /// 人类可读的错误描述
        message: String,
    },
}

/// ACP 解析后的会话事件
///
/// 从 [`AcpSessionUpdateEvent`] 解析得到的内部事件表示，
/// 去除了 JSON 序列化标签，便于在事件处理流程中使用。
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
///
/// 将 JSON 反序列化得到的 [`AcpSessionUpdateEvent`] 转换为内部使用的
/// [`AcpParsedSessionEvent`]，简化事件数据结构以便后续处理。
///
/// # 参数
///
/// - `event`: 待解析的 ACP 会话更新事件引用
///
/// # 返回值
///
/// 返回解析后的 [`AcpParsedSessionEvent`]，字段结构与原事件一一对应
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
///
/// 创建 ACP 会话时的配置参数，包含模型选择、系统提示、运行模式等。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcpSessionConfig {
    /// 模型 ID
    ///
    /// 指定 ACP 客户端使用的 AI 模型标识，如 'gpt-4'、'claude-3-opus' 等
    pub model_id: String,
    /// 系统提示
    ///
    /// 可选的系统级提示词，用于设定 Agent 的行为和角色
    pub system_prompt: Option<String>,
    /// 会话模式
    ///
    /// Agent 的运行模式，影响其行为策略
    pub mode: AcpSessionMode,
    /// 额外配置
    ///
    /// Provider 特定的扩展配置项，以键值对形式传递
    pub extra: HashMap<String, serde_json::Value>,
}

/// ACP 生成输入
///
/// 启动 ACP 客户端子进程所需的全部参数，包括可执行文件路径、
/// 命令行参数、环境变量、工作目录和会话配置。
#[derive(Debug, Clone)]
pub struct AcpSpawnInput {
    /// 可执行文件路径
    ///
    /// ACP 客户端的可执行文件名或完整路径，如 'cursor-agent'、'grok' 等
    pub executable: String,
    /// 命令行参数
    ///
    /// 传递给 ACP 客户端的命令行参数列表
    pub args: Vec<String>,
    /// 环境变量
    ///
    /// 传递给子进程的额外环境变量，通常包含 API Key 等认证信息
    pub env: HashMap<String, String>,
    /// 工作目录
    ///
    /// 子进程的工作目录，为 None 时使用当前进程的工作目录
    pub cwd: Option<String>,
    /// 会话配置
    ///
    /// ACP 会话的初始化配置，包含模型、提示词、模式等
    pub config: AcpSessionConfig,
}
