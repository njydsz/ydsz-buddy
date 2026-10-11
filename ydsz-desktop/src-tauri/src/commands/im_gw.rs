//! IM 网关核心：消息规范化 + Agent 分发（P0-1 MVP）
//!
//! 参考 Octop Gateway 架构简化：进程内 Channel → Processor → Agent → Response。
//! 第一版目标：飞书/Webhook 通道的真实连接 + InboundMessage→Agent→OutboundMessage 管线。

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc;
use serde::{Deserialize, Serialize};
use chrono::Utc;
use uuid::Uuid;

// ──────────── IM 消息模型 ────────────

/// 规范化入站消息（所有通道统一格式）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InboundMessage {
    pub msg_id: String,
    pub channel_type: String,       // "feishu" / "dingtalk" / "wecom" / "webhook"
    pub sender_id: String,          // 发送者 ID（open_id / userid）
    pub sender_name: String,
    pub chat_id: String,            // 会话/群 ID
    pub content: String,
    pub content_type: String,       // "text" / "markdown" / "image"
    pub received_at_ms: i64,
    pub extra: HashMap<String, String>,
}

impl InboundMessage {
    /// 创建新的入站消息（自动生成 ID 和时间戳）
    pub fn new(
        channel_type: impl Into<String>,
        sender_id: impl Into<String>,
        sender_name: impl Into<String>,
        chat_id: impl Into<String>,
        content: impl Into<String>,
    ) -> Self {
        Self {
            msg_id: Uuid::new_v4().to_string(),
            channel_type: channel_type.into(),
            sender_id: sender_id.into(),
            sender_name: sender_name.into(),
            chat_id: chat_id.into(),
            content: content.into(),
            content_type: "text".into(),
            received_at_ms: Utc::now().timestamp_millis(),
            extra: HashMap::new(),
        }
    }
}

/// Agent 处理后的出站消息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutboundMessage {
    pub request_msg_id: String,         // 对应 InboundMessage.msg_id
    pub channel_type: String,
    pub chat_id: String,
    pub content: String,
    pub content_type: String,
    pub created_at_ms: i64,
    pub token_usage: Option<TokenUsageBrief>,
}

/// Token 用量汇总
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenUsageBrief {
    pub input_tokens: u64,
    pub output_tokens: u64,
}

// ──────────── 会话路由（Thread Binding）────────────

/// 聊天会话路由表（chat_id → thread_id）
/// 参考 Octop 的 session_key → thread_id 路由
pub struct SessionRouter {
    routes: Arc<Mutex<HashMap<String, String>>>,   // "channel_type:chat_id" → thread_id
}

impl SessionRouter {
    pub fn new() -> Self {
        Self { routes: Arc::new(Mutex::new(HashMap::new())) }
    }

    fn key(channel_type: &str, chat_id: &str) -> String {
        format!("{}:{}", channel_type, chat_id)
    }

    pub fn get_thread(&self, channel_type: &str, chat_id: &str) -> Option<String> {
        self.routes.lock().ok()?.get(&Self::key(channel_type, chat_id)).cloned()
    }

    pub fn bind_thread(&self, channel_type: &str, chat_id: &str, thread_id: String) {
        if let Ok(mut routes) = self.routes.lock() {
            routes.insert(Self::key(channel_type, chat_id), thread_id);
        }
    }
}

// ──────────── 网关状态 ────────────

/// 单个通道的运行时状态
#[derive(Debug, Clone)]
pub struct ChannelRuntimeStatus {
    pub status: ImChannelStatus,
    pub connected_at_ms: Option<i64>,
    pub last_activity_ms: Option<i64>,
    pub messages_received: u64,
    pub messages_sent: u64,
    pub last_error: Option<String>,
}

/// 网关处理的消息管线请求
#[derive(Debug, Clone)]
pub struct GwProcessRequest {
    pub inbound: InboundMessage,
}

/// 网关处理结果
#[derive(Debug, Clone)]
pub struct GwProcessResult {
    pub outbound: OutboundMessage,
}

/// 消息处理器 trait（与 ydsz-core 桥接的抽象接缝）
#[async_trait::async_trait]
pub trait MessageProcessor: Send + Sync {
    /// 处理入站消息并返回 Agent 回复（同步调用版）
    async fn process(&self, inbound: &InboundMessage, thread_id: Option<&str>) -> Result<OutboundMessage, String>;
}

/// IM 网关状态（简化的进程内 Gateway）
pub struct ImGatewayState {
    pub registry: Arc<Mutex<HashMap<String, ChannelRuntimeStatus>>>,
    pub session_router: SessionRouter,
    pub tx_inbound: mpsc::Sender<GwProcessRequest>,
}

impl ImGatewayState {
    pub fn new(tx_inbound: mpsc::Sender<GwProcessRequest>) -> Self {
        Self {
            registry: Arc::new(Mutex::new(HashMap::new())),
            session_router: SessionRouter::new(),
            tx_inbound,
        }
    }

    pub fn update_channel_status(&self, channel_id: &str, status: ImChannelStatus, error: Option<String>) {
        if let Ok(mut reg) = self.registry.lock() {
            let entry = reg.entry(channel_id.to_string()).or_insert_with(|| ChannelRuntimeStatus {
                status: ImChannelStatus::Disconnected,
                connected_at_ms: None,
                last_activity_ms: None,
                messages_received: 0,
                messages_sent: 0,
                last_error: None,
            });
            entry.status = status;
            entry.last_error = error;
            if status == ImChannelStatus::Connected {
                entry.connected_at_ms = Some(Utc::now().timestamp_millis());
            }
            entry.last_activity_ms = Some(Utc::now().timestamp_millis());
        }
    }

    pub fn increment_received(&self, channel_id: &str) {
        if let Ok(mut reg) = self.registry.lock() {
            if let Some(st) = reg.get_mut(channel_id) {
                st.messages_received += 1;
                st.last_activity_ms = Some(Utc::now().timestamp_millis());
            }
        }
    }

    pub fn increment_sent(&self, channel_id: &str) {
        if let Ok(mut reg) = self.registry.lock() {
            if let Some(st) = reg.get_mut(channel_id) {
                st.messages_sent += 1;
                st.last_activity_ms = Some(Utc::now().timestamp_millis());
            }
        }
    }

    pub fn get_all_status(&self) -> HashMap<String, ChannelRuntimeStatus> {
        self.registry.lock().map(|r| r.clone()).unwrap_or_default()
    }
}

/// IM 通道状态
#[derive(Debug, Clone, Copy, Serialize, Deserialize, specta::Type, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ImChannelStatus {
    Disconnected,
    Connecting,
    Connected,
    Error,
}

/// 默认的 stub MessageProcessor（无 LLM 连接时的降级）
pub struct StubProcessor;

#[async_trait::async_trait]
impl MessageProcessor for StubProcessor {
    async fn process(&self, inbound: &InboundMessage, _thread_id: Option<&str>) -> Result<OutboundMessage, String> {
        // 降级处理：直接返回确认消息（MVP 第一版尚未接入真实 LLM 管线）
        let reply = format!(
            "【测试回复】收到消息：{}（通道：{}，发送者：{}）\n\
             当前为 IM 网关 MVP 模式，Agent 管线未连接。请配置 LLM Provider 后启用完整功能。",
            if inbound.content.len() > 50 { &inbound.content[..50] } else { &inbound.content },
            inbound.channel_type,
            inbound.sender_name,
        );
        Ok(OutboundMessage {
            request_msg_id: inbound.msg_id.clone(),
            channel_type: inbound.channel_type.clone(),
            chat_id: inbound.chat_id.clone(),
            content: reply,
            content_type: "text".into(),
            created_at_ms: Utc::now().timestamp_millis(),
            token_usage: None,
        })
    }
}
