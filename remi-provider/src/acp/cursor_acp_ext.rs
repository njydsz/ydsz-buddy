//! # Cursor ACP 扩展模块
//!
//! 在 `cursor` 模块基础上提供更细粒度的 Cursor ACP 能力：
//!
//! - [`CursorAcpProfile`]：启动参数 / 能力预设（多套）
//! - [`CursorAcpBootstrap`]：客户端首次连接时的握手/能力协商
//! - [`CursorAcpMessageDecoder`]：把 Cursor 的 `text/delta` 帧解码成 `CoreRuntimeEvent`
//!
//! ## 背景
//!
//! - Cursor 的 ACP 输出和标准 ACP 略不同（使用 `content/index` 而非 `index/0`）
//! - Cursor 的 `session/new` 返回的 `sessionId` 在 `data.id` 而非 `sessionId`
//! - Cursor 早期版本只支持 `agent: cursor` 字段，v1 才支持模型覆盖

use serde::{Deserialize, Serialize};
use tracing::warn;

use super::core_runtime_events::{
    ContentChunk, CoreRuntimeEvent, EventSource, PlanStepSpec, ToolCallSpec,
};

/// Cursor ACP 预设 profile
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CursorAcpProfile {
    /// 默认：与官方文档一致
    Default,
    /// 兼容模式：旧版 Cursor（v0.x）
    Legacy,
    /// 性能模式：禁用 thinking
    Fast,
    /// 安全模式：所有工具调用都需审批
    Strict,
}

impl CursorAcpProfile {
    /// 启动参数（追加到 `cursor-agent --acp` 之后）
    pub fn extra_args(&self) -> Vec<&'static str> {
        match self {
            Self::Default => vec![],
            Self::Legacy => vec!["--acp-version=0"],
            Self::Fast => vec!["--no-thinking"],
            Self::Strict => vec!["--strict-permissions"],
        }
    }

    /// 能力声明
    pub fn advertised_capabilities(&self) -> Vec<&'static str> {
        match self {
            Self::Default => vec!["text", "tool_use", "plan", "permission"],
            Self::Legacy => vec!["text", "tool_use"],
            Self::Fast => vec!["text", "tool_use"],
            Self::Strict => vec!["text", "tool_use", "plan", "permission", "approval_required"],
        }
    }
}

/// Cursor ACP 握手 / 能力协商结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CursorAcpBootstrap {
    /// 协商后实际使用的 profile
    pub profile: CursorAcpProfile,
    /// 协商成功的协议版本
    pub protocol_version: String,
    /// Cursor 报告的能力
    pub server_capabilities: Vec<String>,
    /// 是否支持 thinking
    pub supports_thinking: bool,
    /// 是否要求 plan 审批
    pub requires_plan_approval: bool,
    /// 备注
    pub note: Option<String>,
}

impl CursorAcpBootstrap {
    /// 从原始 `initialize` 响应构造
    pub fn from_initialize_response(
        profile: CursorAcpProfile,
        protocol_version: impl Into<String>,
        server_capabilities: Vec<String>,
    ) -> Self {
        let supports_thinking = server_capabilities.iter().any(|c| c == "thinking");
        let requires_plan_approval = matches!(profile, CursorAcpProfile::Strict)
            || server_capabilities.iter().any(|c| c == "approval_required");
        Self {
            profile,
            protocol_version: protocol_version.into(),
            server_capabilities,
            supports_thinking,
            requires_plan_approval,
            note: None,
        }
    }
}

/// Cursor ACP 消息解码器
pub struct CursorAcpMessageDecoder {
    thread_id: String,
    session_id: Option<String>,
}

impl CursorAcpMessageDecoder {
    pub fn new(thread_id: impl Into<String>, session_id: Option<String>) -> Self {
        Self {
            thread_id: thread_id.into(),
            session_id,
        }
    }

    /// 解码一个 Cursor 风格的通知/响应体
    ///
    /// 期望格式：
    /// ```json
    /// { 'method': 'session/update', 'params': { 'type': 'text_delta|tool_call|plan|token_usage|...', 'data': {...} } }
    /// ```
    pub fn decode(&self, raw: &serde_json::Value) -> Option<CoreRuntimeEvent> {
        let method = raw.get("method")?.as_str()?;
        if method != "session/update" {
            return None;
        }
        let params = raw.get("params")?;
        let kind = params.get("type")?.as_str()?;
        let data = params.get("data")?;
        let source = || EventSource {
            provider: "cursor".to_string(),
            thread_id: self.thread_id.clone(),
            turn_id: data.get("turnId").and_then(|v| v.as_str()).map(String::from),
            session_id: self.session_id.clone(),
        };
        match kind {
            "text_delta" => Some(CoreRuntimeEvent::Message {
                source: source(),
                chunk: ContentChunk {
                    text: data
                        .get("content")
                        .and_then(|v| v.as_str())
                        .map(String::from),
                    thinking: None,
                    tool_call: None,
                },
            }),
            "thinking_delta" => Some(CoreRuntimeEvent::Message {
                source: source(),
                chunk: ContentChunk {
                    text: None,
                    thinking: data
                        .get("content")
                        .and_then(|v| v.as_str())
                        .map(String::from),
                    tool_call: None,
                },
            }),
            "message_done" => Some(CoreRuntimeEvent::MessageDone {
                source: source(),
                final_text: data
                    .get("text")
                    .and_then(|v| v.as_str())
                    .map(String::from),
            }),
            "tool_call" => Some(CoreRuntimeEvent::ToolCall {
                source: source(),
                call: ToolCallSpec {
                    id: data
                        .get("id")
                        .and_then(|v| v.as_str())
                        .unwrap_or("unknown")
                        .to_string(),
                    name: data
                        .get("name")
                        .and_then(|v| v.as_str())
                        .unwrap_or("unknown")
                        .to_string(),
                    arguments: data.get("arguments").cloned().unwrap_or(serde_json::json!({})),
                },
            }),
            "plan" => Some(CoreRuntimeEvent::Plan {
                source: source(),
                steps: data
                    .get("steps")
                    .and_then(|v| v.as_array())
                    .map(|arr| {
                        arr.iter()
                            .enumerate()
                            .map(|(i, s)| PlanStepSpec {
                                index: s
                                    .get("index")
                                    .and_then(|v| v.as_u64())
                                    .map(|n| n as u32)
                                    .unwrap_or(i as u32),
                                title: s
                                    .get("title")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("")
                                    .to_string(),
                                description: s
                                    .get("description")
                                    .and_then(|v| v.as_str())
                                    .map(String::from),
                            })
                            .collect()
                    })
                    .unwrap_or_default(),
            }),
            "token_usage" => Some(CoreRuntimeEvent::TokenUsage {
                source: source(),
                usage: super::core_runtime_events::TokenUsageSpec {
                    input_tokens: data
                        .get("inputTokens")
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0),
                    output_tokens: data
                        .get("outputTokens")
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0),
                    cached_tokens: data.get("cachedTokens").and_then(|v| v.as_u64()),
                },
            }),
            "turn_done" => Some(CoreRuntimeEvent::TurnDone {
                source: source(),
                status: data
                    .get("status")
                    .and_then(|v| v.as_str())
                    .unwrap_or("ok")
                    .to_string(),
            }),
            "error" => Some(CoreRuntimeEvent::Error {
                source: source(),
                code: data.get("code").and_then(|v| v.as_str()).map(String::from),
                message: data
                    .get("message")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown")
                    .to_string(),
            }),
            other => {
                warn!("CursorAcpMessageDecoder 未知 type: {}", other);
                None
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn profile_default_has_no_extras() {
        let p = CursorAcpProfile::Default;
        assert!(p.extra_args().is_empty());
        assert!(p.advertised_capabilities().contains(&"plan"));
    }

    #[test]
    fn profile_strict_requires_approval() {
        let p = CursorAcpProfile::Strict;
        assert!(p.extra_args().contains(&"--strict-permissions"));
        let bs = CursorAcpBootstrap::from_initialize_response(
            p,
            "v1",
            vec!["text".to_string()],
        );
        assert!(bs.requires_plan_approval);
        assert!(!bs.supports_thinking);
    }

    #[test]
    fn profile_fast_disables_thinking() {
        let p = CursorAcpProfile::Fast;
        let bs = CursorAcpBootstrap::from_initialize_response(
            p,
            "v1",
            vec!["text".to_string(), "thinking".to_string()],
        );
        // 服务端仍可能支持，但客户端会传 --no-thinking 关闭
        assert!(bs.supports_thinking);
        assert!(!bs.requires_plan_approval);
    }

    #[test]
    fn decoder_text_delta() {
        let d = CursorAcpMessageDecoder::new("t1", Some("s1".to_string()));
        let raw = json!({
            "method": "session/update",
            "params": {
                "type": "text_delta",
                "data": { "content": "hello" }
            }
        });
        let ev = d.decode(&raw).expect("event");
        assert_eq!(ev.kind_name(), "message");
        assert_eq!(ev.thread_id(), "t1");
    }

    #[test]
    fn decoder_tool_call() {
        let d = CursorAcpMessageDecoder::new("t1", None);
        let raw = json!({
            "method": "session/update",
            "params": {
                "type": "tool_call",
                "data": {
                    "id": "c1",
                    "name": "read_file",
                    "arguments": { "path": "/x" }
                }
            }
        });
        let ev = d.decode(&raw).expect("event");
        if let CoreRuntimeEvent::ToolCall { call, .. } = ev {
            assert_eq!(call.id, "c1");
            assert_eq!(call.name, "read_file");
        } else {
            panic!("wrong event type");
        }
    }

    #[test]
    fn decoder_plan() {
        let d = CursorAcpMessageDecoder::new("t1", None);
        let raw = json!({
            "method": "session/update",
            "params": {
                "type": "plan",
                "data": {
                    "steps": [
                        { "index": 0, "title": "step 1" },
                        { "index": 1, "title": "step 2" }
                    ]
                }
            }
        });
        let ev = d.decode(&raw).expect("event");
        if let CoreRuntimeEvent::Plan { steps, .. } = ev {
            assert_eq!(steps.len(), 2);
            assert_eq!(steps[0].title, "step 1");
        } else {
            panic!("wrong event type");
        }
    }

    #[test]
    fn decoder_non_update_returns_none() {
        let d = CursorAcpMessageDecoder::new("t1", None);
        let raw = json!({ "method": "ping" });
        assert!(d.decode(&raw).is_none());
    }
}
