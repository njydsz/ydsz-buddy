//! ACP 事件映射
//!
//! 本模块提供 ACP 事件到 Remi 运行时事件的转换能力。

use crate::acp::model::{AcpParsedSessionEvent, AcpToolCall, AcpPlanUpdate};
use remi_core::provider::ProviderRuntimeEvent;

/// 将 ACP 内容增量事件转换为 Remi 运行时事件
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
