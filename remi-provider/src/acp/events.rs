//! ACP 事件映射
//!
//! 本模块提供 ACP (Agent Client Protocol) 事件到 Remi 运行时事件的转换能力。
//! 将 ACP 客户端推送的各类事件统一映射为 [`remi_core::provider::ProviderRuntimeEvent`]，
//! 使上层业务无需关心底层协议差异。
//!
//! # 事件映射关系
//!
//! | ACP 事件 | Remi 运行时事件 | 说明 |
//! |----------|----------------|------|
//! | ContentDelta | TurnDelta | 内容增量更新 |
//! | ToolCall | SessionUpdate | 工具调用状态变更 |
//! | PlanUpdate | SessionUpdate | 计划内容更新 |
//! | PermissionRequest | ApprovalRequested | 权限审批请求 |
//! | TokenUsage | SessionUpdate | Token 消耗统计 |
//! | SessionComplete | TurnCompleted | 会话执行完成 |
//! | Error | Error | 错误事件 |
//!
//! # 使用方式
//!
//! - **单事件转换**：使用 `make_acp_*` 系列函数将单个 ACP 事件转换为 Remi 事件
//! - **统一映射**：使用 [`map_acp_event_to_runtime_event`] 根据事件类型自动选择对应的转换函数
//!
//! # 模块依赖
//!
//! - 依赖 [`crate::acp::model`] 中的 ACP 数据类型
//! - 依赖 `remi_core::provider::ProviderRuntimeEvent` 定义目标事件类型

use crate::acp::model::{AcpParsedSessionEvent, AcpPlanUpdate, AcpToolCall};
use remi_core::provider::ProviderRuntimeEvent;

/// 将 ACP 内容增量事件转换为 Remi 运行时事件
///
/// 将 Agent 输出的流式文本增量转换为 `TurnDelta` 事件，
/// 用于实时显示 Agent 的响应内容。
///
/// # 参数
///
/// - `session_id`: 会话 ID，标识事件所属的会话
/// - `turn_id`: Turn ID，标识事件所属的对话轮次
/// - `delta`: 增量文本内容
///
/// # 返回值
///
/// 返回 `ProviderRuntimeEvent::TurnDelta` 变体
pub fn make_acp_content_delta_event(
    session_id: &str,
    turn_id: &str,
    delta: &str,
) -> ProviderRuntimeEvent {
    ProviderRuntimeEvent::TurnDelta {
        session_id: session_id.to_string(),
        turn_id: turn_id.to_string(),
        delta: delta.to_string(),
    }
}

/// 将 ACP 工具调用事件转换为 Remi 运行时事件（会话更新）
///
/// 将工具调用的状态变更转换为 `SessionUpdate` 事件，
/// 携带工具调用的详细信息（ID、名称、参数、状态、结果、错误）。
///
/// # 参数
///
/// - `session_id`: 会话 ID
/// - `turn_id`: Turn ID
/// - `tool_call`: 工具调用信息引用
///
/// # 返回值
///
/// 返回 `ProviderRuntimeEvent::SessionUpdate` 变体，data 中包含 `type: 'tool_call'`
pub fn make_acp_tool_call_event(
    session_id: &str,
    turn_id: &str,
    tool_call: &AcpToolCall,
) -> ProviderRuntimeEvent {
    ProviderRuntimeEvent::SessionUpdate {
        session_id: session_id.to_string(),
        data: serde_json::json!({
            "type": "tool_call",
            "turn_id": turn_id,
            "tool_call": {
                "id": tool_call.id,
                "name": tool_call.name,
                "arguments": tool_call.arguments,
                "state": format!("{:?}", tool_call.state),
                "result": tool_call.result,
                "error": tool_call.error,
            }
        }),
    }
}

/// 将 ACP 计划更新事件转换为 Remi 运行时事件（会话更新）
///
/// 将执行计划的内容或状态变更转换为 `SessionUpdate` 事件，
/// 携带计划的 ID、内容和实现状态。
///
/// # 参数
///
/// - `session_id`: 会话 ID
/// - `turn_id`: Turn ID
/// - `plan`: 计划更新信息引用
///
/// # 返回值
///
/// 返回 `ProviderRuntimeEvent::SessionUpdate` 变体，data 中包含 `type: 'plan_update'`
pub fn make_acp_plan_update_event(
    session_id: &str,
    turn_id: &str,
    plan: &AcpPlanUpdate,
) -> ProviderRuntimeEvent {
    ProviderRuntimeEvent::SessionUpdate {
        session_id: session_id.to_string(),
        data: serde_json::json!({
            "type": "plan_update",
            "turn_id": turn_id,
            "plan": {
                "id": plan.id,
                "content": plan.content,
                "implemented": plan.implemented,
            }
        }),
    }
}

/// 将 ACP Token 使用事件转换为 Remi 运行时事件（会话更新）
///
/// 将 Token 消耗统计转换为 `SessionUpdate` 事件，
/// 携带输入和输出 Token 数量。
///
/// # 参数
///
/// - `session_id`: 会话 ID
/// - `turn_id`: Turn ID
/// - `input_tokens`: 输入 Token 数量
/// - `output_tokens`: 输出 Token 数量
///
/// # 返回值
///
/// 返回 `ProviderRuntimeEvent::SessionUpdate` 变体，data 中包含 `type: 'token_usage'`
pub fn make_acp_token_usage_event(
    session_id: &str,
    turn_id: &str,
    input_tokens: u64,
    output_tokens: u64,
) -> ProviderRuntimeEvent {
    ProviderRuntimeEvent::SessionUpdate {
        session_id: session_id.to_string(),
        data: serde_json::json!({
            "type": "token_usage",
            "turn_id": turn_id,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
        }),
    }
}

/// 将 ACP 会话完成事件转换为 Remi 运行时事件
///
/// 将 Agent 完成当前任务的事件转换为 `TurnCompleted` 事件，
/// 表示一个对话轮次已结束。
///
/// # 参数
///
/// - `session_id`: 会话 ID
/// - `turn_id`: Turn ID
///
/// # 返回值
///
/// 返回 `ProviderRuntimeEvent::TurnCompleted` 变体
pub fn make_acp_session_complete_event(
    session_id: &str,
    turn_id: &str,
) -> ProviderRuntimeEvent {
    ProviderRuntimeEvent::TurnCompleted {
        session_id: session_id.to_string(),
        turn_id: turn_id.to_string(),
    }
}

/// 将 ACP 错误事件转换为 Remi 运行时事件
///
/// 将 ACP 客户端报告的错误转换为 `Error` 事件。
///
/// # 参数
///
/// - `session_id`: 会话 ID
/// - `message`: 错误消息
///
/// # 返回值
///
/// 返回 `ProviderRuntimeEvent::Error` 变体
pub fn make_acp_error_event(
    session_id: &str,
    message: &str,
) -> ProviderRuntimeEvent {
    ProviderRuntimeEvent::Error {
        session_id: session_id.to_string(),
        error: message.to_string(),
    }
}

/// 将 ACP 权限请求事件转换为 Remi 运行时事件
///
/// 将 Agent 发出的权限审批请求转换为 `ApprovalRequested` 事件，
/// 等待用户做出授权决策。
///
/// # 参数
///
/// - `session_id`: 会话 ID
/// - `turn_id`: Turn ID
/// - `request_id`: 权限请求 ID，用于关联审批响应
/// - `description`: 权限请求描述，说明 Agent 请求执行的操作
///
/// # 返回值
///
/// 返回 `ProviderRuntimeEvent::ApprovalRequested` 变体
pub fn make_acp_permission_request_event(
    session_id: &str,
    turn_id: &str,
    request_id: &str,
    description: &str,
) -> ProviderRuntimeEvent {
    ProviderRuntimeEvent::ApprovalRequested {
        session_id: session_id.to_string(),
        turn_id: turn_id.to_string(),
        request_id: request_id.to_string(),
        description: description.to_string(),
    }
}

/// 将 ACP 解析后的会话事件转换为 Remi 运行时事件
///
/// 统一的事件映射入口，根据 [`AcpParsedSessionEvent`] 的变体类型
/// 自动选择对应的转换函数，将 ACP 事件映射为 Remi 运行时事件。
///
/// # 参数
///
/// - `event`: 解析后的 ACP 会话事件引用
/// - `session_id`: 会话 ID
/// - `turn_id`: Turn ID
///
/// # 返回值
///
/// - `Some(ProviderRuntimeEvent)`: 成功映射的运行时事件
/// - `None`: 当前所有事件类型均可映射，此返回值保留用于未来扩展
///
/// # 映射规则
///
/// | AcpParsedSessionEvent | ProviderRuntimeEvent |
/// |-----------------------|---------------------|
/// | ContentDelta | TurnDelta |
/// | ToolCall | SessionUpdate (tool_call) |
/// | PlanUpdate | SessionUpdate (plan_update) |
/// | PermissionRequest | ApprovalRequested |
/// | TokenUsage | SessionUpdate (token_usage) |
/// | SessionComplete | TurnCompleted |
/// | Error | Error |
pub fn map_acp_event_to_runtime_event(
    event: &AcpParsedSessionEvent,
    session_id: &str,
    turn_id: &str,
) -> Option<ProviderRuntimeEvent> {
    match event {
        AcpParsedSessionEvent::ContentDelta(delta) => {
            Some(make_acp_content_delta_event(session_id, turn_id, delta))
        }
        AcpParsedSessionEvent::ToolCall(tool_call) => {
            Some(make_acp_tool_call_event(session_id, turn_id, tool_call))
        }
        AcpParsedSessionEvent::PlanUpdate(plan) => {
            Some(make_acp_plan_update_event(session_id, turn_id, plan))
        }
        AcpParsedSessionEvent::PermissionRequest(request) => {
            Some(make_acp_permission_request_event(
                session_id,
                turn_id,
                &request.id,
                &request.description,
            ))
        }
        AcpParsedSessionEvent::TokenUsage { input, output } => {
            Some(make_acp_token_usage_event(session_id, turn_id, *input, *output))
        }
        AcpParsedSessionEvent::SessionComplete(_) => {
            Some(make_acp_session_complete_event(session_id, turn_id))
        }
        AcpParsedSessionEvent::Error { message, .. } => {
            Some(make_acp_error_event(session_id, message))
        }
    }
}
