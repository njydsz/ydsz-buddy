//! # Core Runtime Events 模块
//!
//! 跨 Provider / ACP 适配器的核心运行时事件类型与"事件总线"。
//!
//! ## 背景
//!
//! - 不同 ACP Provider 推上来的事件命名 / 字段不一致（Cursor、Grok、Gemini 各有差异）
//! - 适配器层负责把"原始事件"翻译成统一的 `CoreRuntimeEvent`
//! - 上层（Service / Frontend）只认 `CoreRuntimeEvent`
//!
//! ## 事件类别
//!
//! - `SessionStart` / `SessionEnd`
//! - `Message` / `MessageDelta` / `MessageDone`
//! - `ToolCall` / `ToolResult`
//! - `Plan` / `PlanStep`
//! - `PermissionRequest` / `PermissionResponse`
//! - `TokenUsage` / `TurnDone` / `Error`

use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tokio::sync::broadcast;
use tracing::{debug, warn};

/// 事件来源（用于事件溯源 / 调试）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventSource {
    pub provider: String,
    pub thread_id: String,
    pub turn_id: Option<String>,
    pub session_id: Option<String>,
}

/// 内容片段
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContentChunk {
    /// 文本内容（普通文本）
    pub text: Option<String>,
    /// 思考 / 推理内容
    pub thinking: Option<String>,
    /// 工具调用 JSON（若本片段是工具调用）
    pub tool_call: Option<ToolCallSpec>,
}

/// 工具调用
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCallSpec {
    pub id: String,
    pub name: String,
    pub arguments: serde_json::Value,
}

/// 工具结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolResultSpec {
    pub id: String,
    pub output: String,
    pub is_error: bool,
}

/// 计划步骤
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanStepSpec {
    pub index: u32,
    pub title: String,
    pub description: Option<String>,
}

/// 权限请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionRequestSpec {
    pub request_id: String,
    pub action: String,
    pub reason: Option<String>,
    /// 候选选项（"allow" / "deny" / "ask"）
    pub options: Vec<String>,
}

/// Token 用量
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenUsageSpec {
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cached_tokens: Option<u64>,
}

/// 核心运行时事件
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum CoreRuntimeEvent {
    /// 会话开始
    SessionStart {
        source: EventSource,
        model: Option<String>,
    },
    /// 会话结束
    SessionEnd {
        source: EventSource,
        reason: Option<String>,
    },
    /// 消息片段（流式）
    Message {
        source: EventSource,
        chunk: ContentChunk,
    },
    /// 一条消息完成
    MessageDone {
        source: EventSource,
        final_text: Option<String>,
    },
    /// 工具调用
    ToolCall {
        source: EventSource,
        call: ToolCallSpec,
    },
    /// 工具结果
    ToolResult {
        source: EventSource,
        result: ToolResultSpec,
    },
    /// 计划
    Plan {
        source: EventSource,
        steps: Vec<PlanStepSpec>,
    },
    /// 权限请求
    PermissionRequest {
        source: EventSource,
        request: PermissionRequestSpec,
    },
    /// 权限响应
    PermissionResponse {
        source: EventSource,
        request_id: String,
        decision: String,
    },
    /// Token 用量
    TokenUsage {
        source: EventSource,
        usage: TokenUsageSpec,
    },
    /// Turn 完成
    TurnDone {
        source: EventSource,
        status: String,
    },
    /// 错误
    Error {
        source: EventSource,
        code: Option<String>,
        message: String,
    },
}

impl CoreRuntimeEvent {
    /// 所属 thread_id
    pub fn thread_id(&self) -> &str {
        self.source().thread_id.as_str()
    }

    /// 来源
    pub fn source(&self) -> &EventSource {
        match self {
            Self::SessionStart { source, .. }
            | Self::SessionEnd { source, .. }
            | Self::Message { source, .. }
            | Self::MessageDone { source, .. }
            | Self::ToolCall { source, .. }
            | Self::ToolResult { source, .. }
            | Self::Plan { source, .. }
            | Self::PermissionRequest { source, .. }
            | Self::PermissionResponse { source, .. }
            | Self::TokenUsage { source, .. }
            | Self::TurnDone { source, .. }
            | Self::Error { source, .. } => source,
        }
    }

    /// 事件类型名（用于 metric / log）
    pub fn kind_name(&self) -> &'static str {
        match self {
            Self::SessionStart { .. } => "session_start",
            Self::SessionEnd { .. } => "session_end",
            Self::Message { .. } => "message",
            Self::MessageDone { .. } => "message_done",
            Self::ToolCall { .. } => "tool_call",
            Self::ToolResult { .. } => "tool_result",
            Self::Plan { .. } => "plan",
            Self::PermissionRequest { .. } => "permission_request",
            Self::PermissionResponse { .. } => "permission_response",
            Self::TokenUsage { .. } => "token_usage",
            Self::TurnDone { .. } => "turn_done",
            Self::Error { .. } => "error",
        }
    }
}

/// 事件总线：发布 + 多订阅者
pub struct EventBus {
    tx: broadcast::Sender<CoreRuntimeEvent>,
    capacity: usize,
}

impl EventBus {
    pub fn new(capacity: usize) -> Self {
        let (tx, _rx) = broadcast::channel(capacity);
        Self { tx, capacity }
    }

    pub fn publish(&self, event: CoreRuntimeEvent) {
        if self.tx.send(event).is_err() {
            debug!("事件总线无活跃订阅者，事件被丢弃");
        }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<CoreRuntimeEvent> {
        self.tx.subscribe()
    }

    pub fn capacity(&self) -> usize {
        self.capacity
    }

    /// 订阅者数量
    pub fn subscriber_count(&self) -> usize {
        self.tx.receiver_count()
    }
}

impl Default for EventBus {
    fn default() -> Self {
        Self::new(1024)
    }
}

/// 事件订阅句柄（带名称 + 自动 unsubscribe 日志）
pub struct EventSubscription {
    name: String,
    rx: broadcast::Receiver<CoreRuntimeEvent>,
    bus_capacity: usize,
}

impl EventSubscription {
    pub fn new(name: impl Into<String>, bus: &EventBus) -> Self {
        Self {
            name: name.into(),
            rx: bus.subscribe(),
            bus_capacity: bus.capacity(),
        }
    }

    /// 拉取下一条事件
    pub async fn recv(&mut self) -> Option<CoreRuntimeEvent> {
        match self.rx.recv().await {
            Ok(ev) => Some(ev),
            Err(broadcast::error::RecvError::Lagged(n)) => {
                warn!(
                    "订阅者 {} 落后 {} 条事件（总线容量 {}）",
                    self.name, n, self.bus_capacity
                );
                // 继续尝试接收
                Box::pin(self.recv()).await
            }
            Err(broadcast::error::RecvError::Closed) => None,
        }
    }

    pub fn name(&self) -> &str {
        &self.name
    }
}

/// 全局事件总线句柄
pub type SharedEventBus = Arc<EventBus>;

#[cfg(test)]
mod tests {
    use super::*;

    fn src() -> EventSource {
        EventSource {
            provider: "test".to_string(),
            thread_id: "t1".to_string(),
            turn_id: None,
            session_id: None,
        }
    }

    #[test]
    fn event_kind_name_matches_variant() {
        let e = CoreRuntimeEvent::SessionStart {
            source: src(),
            model: None,
        };
        assert_eq!(e.kind_name(), "session_start");
    }

    #[test]
    fn event_thread_id_from_source() {
        let e = CoreRuntimeEvent::MessageDone {
            source: src(),
            final_text: Some("hi".to_string()),
        };
        assert_eq!(e.thread_id(), "t1");
    }

    #[tokio::test]
    async fn bus_publishes_to_subscriber() {
        let bus = EventBus::new(8);
        let mut sub = bus.subscribe();
        bus.publish(CoreRuntimeEvent::SessionStart {
            source: src(),
            model: Some("gpt-5".to_string()),
        });
        let ev = sub.recv().await.expect("event");
        assert_eq!(ev.kind_name(), "session_start");
    }

    #[tokio::test]
    async fn bus_subscriber_count_increments() {
        let bus = EventBus::new(8);
        assert_eq!(bus.subscriber_count(), 0);
        let _s1 = bus.subscribe();
        let _s2 = bus.subscribe();
        assert_eq!(bus.subscriber_count(), 2);
    }
}
