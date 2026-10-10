//! # Anthropic Claude 适配器
//!
//! 实现 Anthropic Messages API v1 的流式调用。
//! 参考文档: https://docs.anthropic.com/en/api/messages-streaming

use async_trait::async_trait;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Instant;
use tokio::sync::broadcast::Sender as BroadcastSender;
use tracing::{info, warn, instrument};

use ydsz_core::provider::{ProviderKind, ProviderRuntimeEvent};

use crate::adapters::{
    HttpProviderAdapter, ProviderHealthStatus, TurnRequest,
};
use crate::http_client::{create_http_client, EndpointConfig, HttpError, extract_api_error};
use crate::sse::{parse_sse_stream, SseEvent};

/// Anthropic Claude 适配器
pub struct ClaudeAdapter {
    client: Client,
    endpoint: EndpointConfig,
}

impl ClaudeAdapter {
    /// 创建新的 Claude 适配器
    pub fn new(endpoint: EndpointConfig) -> Self {
        Self {
            client: create_http_client().expect("Failed to build HTTP client"),
            endpoint,
        }
    }

    /// 使用指定的 reqwest client（主要用于测试注入 mock）
    #[cfg(test)]
    pub fn with_client(client: Client, endpoint: EndpointConfig) -> Self {
        Self { client, endpoint }
    }
}

#[async_trait]
impl HttpProviderAdapter for ClaudeAdapter {
    fn provider_kind(&self) -> ProviderKind {
        ProviderKind::ClaudeAgent
    }

    fn display_name(&self) -> &str {
        "Claude (Anthropic)"
    }

    #[instrument(skip(self, event_tx, input), fields(model=%input.model, session_id=%session_id))]
    async fn stream_turn(
        &self,
        input: &TurnRequest,
        event_tx: &BroadcastSender<ProviderRuntimeEvent>,
        session_id: &str,
    ) -> Result<String, HttpError> {
        let url = self.endpoint.join("/messages");

        // 构建 Anthropic Messages API 请求体
        let mut body = ClaudeMessagesRequest::new(&input.model, input.max_tokens.unwrap_or(4096));
        
        // 添加系统消息
        if let Some(ref system) = input.system_prompt {
            body.system = Some(system.clone());
        }
        
        // 添加用户消息
        body.messages.push(ClaudeMessage {
            role: "user".to_string(),
            content: input.message.clone(),
        });

        // 设置温度
        if let Some(temp) = input.temperature {
            body.temperature = Some(temp);
        }

        info!(url=%url, model=%input.model, "Claude adapter sending request");

        // 发出 TurnStarted 事件
        let turn_id = format!("claude-turn-{}", uuid::Uuid::new_v4());
        let _ = event_tx.send(ProviderRuntimeEvent::TurnStarted {
            session_id: session_id.to_string(),
            turn_id: turn_id.clone(),
        });

        // 发送 HTTP 请求
        let response = self
            .client
            .post(&url)
            .header("x-api-key", &self.endpoint.api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(HttpError::from)?;

        if !response.status().is_success() {
            let err = extract_api_error(response).await;
            let _ = event_tx.send(ProviderRuntimeEvent::Error {
                session_id: session_id.to_string(),
                error: format!("Claude API error: {err}"),
            });
            return Err(err);
        }

        // 解析 SSE 流（内部 spawn task 持续读取 HTTP body 并广播 SSE 事件）
        let mut rx = parse_sse_stream(response, 64);
        let mut full_text = String::new();

        loop {
            match rx.recv().await {
                Ok(event) => match &event {
                    SseEvent::Data(data) | SseEvent::Event { data, .. } => {
                        // 尝试解析 Anthropic SSE 数据
                        if let Some(json) = parse_json_claude_delta(data) {
                            full_text.push_str(&json);
                            
                            // 向 UI 发送 TurnDelta 事件
                            let _ = event_tx.send(ProviderRuntimeEvent::TurnDelta {
                                session_id: session_id.to_string(),
                                turn_id: turn_id.clone(),
                                delta: json,
                            });
                        }
                    }
                    SseEvent::Done => break,
                    SseEvent::Error(e) => {
                        let _ = event_tx.send(ProviderRuntimeEvent::Error {
                            session_id: session_id.to_string(),
                            error: format!("SSE error: {e}"),
                        });
                        break;
                    }
                },
                Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
                Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => {
                    warn!("SSE broadcast lagged, some deltas may be lost");
                    continue;
                }
            }
        }

        // 发送 TurnCompleted 事件
        let _ = event_tx.send(ProviderRuntimeEvent::TurnCompleted {
            session_id: session_id.to_string(),
            turn_id: turn_id.clone(),
        });

        info!(text_len=%full_text.len(), "Claude adapter turn completed");
        Ok(full_text)
    }

    #[instrument(skip(self))]
    async fn check_health(&self) -> ProviderHealthStatus {
        // Anthropic 没有专用 health 端点，发送空 messages 请求检测连通性
        // 实际使用中也可检查 /v1/messages 是否能返回 4xx（表示 API Key 格式正确）
        let url = self.endpoint.join("/messages");
        let start = Instant::now();

        let result = self
            .client
            .post(&url)
            .header("x-api-key", &self.endpoint.api_key)
            .header("anthropic-version", "2023-06-01")
            .json(&serde_json::json!({
                "model": "claude-3-haiku-20240307",
                "max_tokens": 1,
                "messages": [{ "role": "user", "content": "hi" }]
            }))
            .send()
            .await;

        match result {
            Ok(resp) => {
                let latency = start.elapsed().as_millis() as u64;
                if resp.status().is_success() || resp.status().as_u16() == 400 {
                    // 400 = 参数错误（正常连通），200 = 成功，其他 4xx/5xx = 异常
                    ProviderHealthStatus::healthy(latency)
                } else {
                    ProviderHealthStatus::unhealthy(format!(
                        "Unexpected status: {}",
                        resp.status()
                    ))
                }
            }
            Err(e) => ProviderHealthStatus::unhealthy(format!("Connection failed: {e}")),
        }
    }
}

// ============================================================================
// Anthropic Messages API 请求/响应结构
// ============================================================================

#[derive(Debug, Serialize)]
struct ClaudeMessagesRequest {
    model: String,
    max_tokens: u64,
    stream: bool,
    messages: Vec<ClaudeMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    system: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f64>,
}

impl ClaudeMessagesRequest {
    fn new(model: &str, max_tokens: u64) -> Self {
        Self {
            model: model.to_string(),
            max_tokens,
            stream: true, // 始终启用流式
            messages: Vec::new(),
            system: None,
            temperature: None,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct ClaudeMessage {
    role: String,
    content: String,
}

/// 解析 Anthropic SSE delta 格式
/// 
/// Anthropic 流式响应格式:
/// event: content_block_delta
/// data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}
fn parse_json_claude_delta(data: &str) -> Option<String> {
    let json: serde_json::Value = data.parse().ok()?;
    
    // 处理 content_block_delta
    if let Some(delta) = json.get("delta") {
        if let Some(text) = delta.get("text").and_then(|v| v.as_str()) {
            return Some(text.to_string());
        }
    }
    
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_claude_text_delta() {
        let data = r#"{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello world"}}"#;
        let result = parse_json_claude_delta(data);
        assert_eq!(result, Some("Hello world".to_string()));
    }

    #[test]
    fn parse_claude_non_text_delta() {
        let data = r#"{"type":"message_start","message":{"id":"msg_123"}}"#;
        let result = parse_json_claude_delta(data);
        assert_eq!(result, None);
    }

    #[test]
    fn parse_claude_invalid_json() {
        let data = "not json";
        let result = parse_json_claude_delta(data);
        assert_eq!(result, None);
    }
}
