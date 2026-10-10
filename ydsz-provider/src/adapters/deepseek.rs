//! # DeepSeek/OpenAI 兼容适配器
//!
//! 实现 OpenAI Chat Completions API 的流式调用。
//! 兼容 DeepSeek、Moonshot、Qwen、MiniMax、Doubao、Ernie、Hunyuan、GLM、Mimo 等
//! 所有遵循 OpenAI Chat Completions 规范的国产 Provider。
//!
//! 参考文档: https://api.deepseek.com/docs

use async_trait::async_trait;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Instant;
use tokio::sync::broadcast::Sender as BroadcastSender;
use tracing::{info, instrument};

use ydsz_core::provider::{ProviderKind, ProviderRuntimeEvent};

use crate::adapters::{
    HttpProviderAdapter, ProviderHealthStatus, TurnRequest,
};
use crate::http_client::{create_http_client, EndpointConfig, HttpError, extract_api_error};
use crate::sse::{parse_sse_stream, SseEvent};

/// OpenAI Chat Completions 兼容适配器
///
/// 通过 provider_kind 区分不同厂商的 API 格式差异
/// （大部分参数结构相同，差异主要在认证方式和endpoint路径）
pub struct DeepSeekAdapter {
    client: Client,
    endpoint: EndpointConfig,
    provider_kind: ProviderKind,
}

impl DeepSeekAdapter {
    /// 创建新的适配配器
    pub fn new(endpoint: EndpointConfig, provider_kind: ProviderKind) -> Self {
        Self {
            client: create_http_client().expect("Failed to build HTTP client"),
            endpoint,
            provider_kind,
        }
    }

    /// 用于测试注入 mock client
    #[cfg(test)]
    pub fn with_client(client: Client, endpoint: EndpointConfig, provider_kind: ProviderKind) -> Self {
        Self {
            client,
            endpoint,
            provider_kind,
        }
    }

    /// 获取 API 路径（不同厂商可能有差异）
    fn chat_completions_path(&self) -> &'static str {
        match self.provider_kind {
            ProviderKind::Ernie => "/chat/completions", // 千帆 v2
            _ => "/chat/completions",
        }
    }

    /// 构建认证 Header
    fn auth_header_value(&self) -> String {
        format!("Bearer {}", self.endpoint.api_key)
    }
}

#[async_trait]
impl HttpProviderAdapter for DeepSeekAdapter {
    fn provider_kind(&self) -> ProviderKind {
        self.provider_kind
    }

    fn display_name(&self) -> &str {
        match self.provider_kind {
            ProviderKind::DeepSeek => "DeepSeek",
            ProviderKind::Moonshot => "Kimi (Moonshot)",
            ProviderKind::Qwen => "通义千问 (Qwen)",
            ProviderKind::MiniMax => "MiniMax",
            ProviderKind::Doubao => "豆包 (Doubao)",
            ProviderKind::Ernie => "文心一言 (Ernie)",
            ProviderKind::Hunyuan => "混元 (Hunyuan)",
            ProviderKind::Glm => "智谱 (GLM)",
            ProviderKind::Mimo => "MiMo (小米)",
            ProviderKind::Codex => "Codex (OpenAI)",
            ProviderKind::Grok => "Grok (xAI)",
            ProviderKind::Gemini => "Gemini (Google)",
            _ => "Unknown",
        }
    }

    #[instrument(skip(self, event_tx, input), fields(model=%input.model, session_id=%session_id))]
    async fn stream_turn(
        &self,
        input: &TurnRequest,
        event_tx: &BroadcastSender<ProviderRuntimeEvent>,
        session_id: &str,
    ) -> Result<String, HttpError> {
        let url = self.endpoint.join(self.chat_completions_path());

        // 构建 OpenAI Chat Completions 请求体
        let mut messages = Vec::new();
        
        // 系统消息
        if let Some(ref system) = input.system_prompt {
            messages.push(OpenAiMessage {
                role: "system".to_string(),
                content: system.clone(),
            });
        }
        
        // 用户消息
        messages.push(OpenAiMessage {
            role: "user".to_string(),
            content: input.message.clone(),
        });

        let body = OpenAiChatRequest {
            model: input.model.clone(),
            messages,
            stream: true,
            temperature: input.temperature,
            max_tokens: input.max_tokens,
        };

        info!(url=%url, model=%input.model, provider=%self.display_name(), 
              "OpenAI-compatible adapter sending request");

        let turn_id = format!("oai-turn-{}", uuid::Uuid::new_v4());

        // TurnStarted 事件
        let _ = event_tx.send(ProviderRuntimeEvent::TurnStarted {
            session_id: session_id.to_string(),
            turn_id: turn_id.clone(),
        });

        // 发送请求
        let response = self
            .client
            .post(&url)
            .header("Authorization", self.auth_header_value())
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(HttpError::from)?;

        if !response.status().is_success() {
            let err = extract_api_error(response).await;
            let _ = event_tx.send(ProviderRuntimeEvent::Error {
                session_id: session_id.to_string(),
                error: format!("{} API error: {}", self.display_name(), err),
            });
            return Err(err);
        }

        // 解析 SSE 流
        let mut rx = parse_sse_stream(response, 64);
        let mut full_text = String::new();

        loop {
            match rx.recv().await {
                Ok(event) => match &event {
                    SseEvent::Data(data) => {
                        if let Some(json) = parse_json_openai_delta(data) {
                            full_text.push_str(&json);
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
                    _ => {} // 忽略其他事件
                },
                Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
                Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => {
                    tracing::warn!("SSE broadcast lagged, some deltas may be lost");
                    continue;
                }
            }
        }

        // TurnCompleted 事件
        let _ = event_tx.send(ProviderRuntimeEvent::TurnCompleted {
            session_id: session_id.to_string(),
            turn_id: turn_id.clone(),
        });

        info!(text_len=%full_text.len(), "OpenAI-compatible adapter turn completed");
        Ok(full_text)
    }

    #[instrument(skip(self))]
    async fn check_health(&self) -> ProviderHealthStatus {
        // 使用 models 端点（OpenAI标准）检测连通性
        let url = self.endpoint.join("/models");
        let start = Instant::now();

        let result = self
            .client
            .get(&url)
            .header("Authorization", self.auth_header_value())
            .send()
            .await;

        match result {
            Ok(resp) => {
                let latency = start.elapsed().as_millis() as u64;
                if resp.status().is_success() {
                    ProviderHealthStatus::healthy(latency)
                } else if resp.status().as_u16() == 401 {
                    ProviderHealthStatus::unhealthy("Invalid API Key (401 Unauthorized)".to_string())
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
// OpenAI Chat Completions API 请求/响应结构
// ============================================================================

#[derive(Debug, Serialize)]
struct OpenAiChatRequest {
    model: String,
    messages: Vec<OpenAiMessage>,
    stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize)]
struct OpenAiMessage {
    role: String,
    content: String,
}

/// 解析 OpenAI SSE delta 格式
/// 
/// OpenAI 流式响应格式:
/// data: {"id":"1","choices":[{"delta":{"content":"Hello"},"index":0}]}
fn parse_json_openai_delta(data: &str) -> Option<String> {
    let json: serde_json::Value = data.parse().ok()?;
    
    // 从 choices[0].delta.content 提取增量文本
    let choices = json.get("choices")?.as_array()?;
    let first = choices.first()?;
    let delta = first.get("delta")?;
    let content = delta.get("content")?.as_str()?;
    
    Some(content.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_openai_text_delta() {
        let data = r#"{"id":"chatcmpl-123","choices":[{"delta":{"content":"Hello"},"index":0,"finish_reason":null}],"created":1700000000,"object":"chat.completion.chunk"}"#;
        let result = parse_json_openai_delta(data);
        assert_eq!(result, Some("Hello".to_string()));
    }

    #[test]
    fn parse_openai_delta_with_tool_call() {
        // 当模型发起 tool_call 时 delta 中只有 tool_calls 没有 content
        let data = r#"{"id":"chatcmpl-123","choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"bash","arguments":"{}"}}]},"index":0}]}"#;
        let result = parse_json_openai_delta(data);
        assert_eq!(result, None); // 当前不处理 tool_call，返回 None
    }

    #[test]
    fn parse_openai_finish_reason() {
        // finish_reason 不为 null 表示流结束
        let data = r#"{"id":"chatcmpl-123","choices":[{"delta":{},"index":0,"finish_reason":"stop"}]}"#;
        let result = parse_json_openai_delta(data);
        assert_eq!(result, None);
    }

    #[test]
    fn parse_openai_invalid_json() {
        let data = "not json";
        let result = parse_json_openai_delta(data);
        assert_eq!(result, None);
    }
}
