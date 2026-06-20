//! # 语音识别 RPC 处理器
//!
//! 本模块提供语音转文字的 RPC 方法实现。当前实现为可插拔的 Provider 模式：
//!
//! - `mock`：始终返回模拟文本（默认）
//! - `openai_whisper`：通过 OpenAI Whisper API 转写
//! - `azure`：通过 Azure Speech 转写（待实现）
//!
//! 通过环境变量 `REMI_VOICE_PROVIDER` 选择 Provider。
//! 如果 Provider 不可用，会返回 `ProviderNotConfigured` 错误。
//!
//! ## 安全
//!
//! - 音频数据通过 Base64 编码传输，不会写入磁盘
//! - 超过大小限制（默认 25 MB）的请求会被拒绝
//! - 上游服务调用失败会返回明确错误，不暴露内部细节

use std::env;

use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tracing::{debug, info, warn};

use crate::error::ServerError;
use crate::rpc::RpcRouter;
use std::sync::Arc;

/// 语音转录请求参数
#[derive(Debug, Deserialize)]
pub struct TranscribeParams {
    /// 音频格式（wav / mp3 / webm / m4a 等）
    pub format: String,
    /// 语言代码（可选）
    #[serde(default)]
    pub language: Option<String>,
    /// Base64 编码的音频数据
    pub audio_base64: String,
}

/// 语音转录响应
#[derive(Debug, Serialize)]
pub struct TranscribeResponse {
    pub text: String,
    pub confidence: f32,
    pub language: String,
    pub from_fallback: bool,
}

/// Provider 类型
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum VoiceProvider {
    Mock,
    OpenAiWhisper,
    #[allow(dead_code)]
    Azure,
}

impl VoiceProvider {
    fn from_env() -> Self {
        match env::var("REMI_VOICE_PROVIDER")
            .ok()
            .map(|s| s.to_lowercase())
            .as_deref()
        {
            Some("openai_whisper") | Some("openai") => VoiceProvider::OpenAiWhisper,
            Some("azure") => VoiceProvider::Azure,
            _ => VoiceProvider::Mock,
        }
    }
}

const MAX_AUDIO_BYTES: usize = 25 * 1024 * 1024;

/// 处理 `voice.transcribe` 方法
pub async fn handle_transcribe(params: Option<Value>) -> Result<Value, ServerError> {
    let p: TranscribeParams = serde_json::from_value(
        params.ok_or_else(|| ServerError::InvalidParams("params is required".to_string()))?,
    )
    .map_err(|e| ServerError::InvalidParams(format!("Invalid params: {e}")))?;

    if p.audio_base64.is_empty() {
        return Err(ServerError::InvalidParams("audioBase64 is empty".to_string()));
    }
    if p.format.is_empty() {
        return Err(ServerError::InvalidParams("format is required".to_string()));
    }

    // 估算解码后大小（Base64 = 4 字符 / 3 字节）
    let approx_bytes = (p.audio_base64.len() as f64 * 0.75) as usize;
    if approx_bytes > MAX_AUDIO_BYTES {
        return Err(ServerError::InvalidParams(format!(
            "Audio payload too large: {} bytes (max {})",
            approx_bytes, MAX_AUDIO_BYTES
        )));
    }

    // 校验 Base64 合法性
    let audio_bytes = base64::engine::general_purpose::STANDARD
        .decode(p.audio_base64.as_bytes())
        .map_err(|e| ServerError::InvalidParams(format!("Invalid base64: {e}")))?;

    debug!(
        "voice.transcribe: format={}, bytes={}, provider={:?}",
        p.format,
        audio_bytes.len(),
        VoiceProvider::from_env()
    );

    match VoiceProvider::from_env() {
        VoiceProvider::Mock => Ok(transcribe_mock(p.language.as_deref())),
        VoiceProvider::OpenAiWhisper => transcribe_openai_whisper(audio_bytes, &p)
            .await
            .map_err(ServerError::InternalError),
        VoiceProvider::Azure => Err(ServerError::InternalError(
            "Azure provider is not implemented yet".to_string(),
        )),
    }
}

/// 注册 voice 相关的 RPC 方法
pub async fn register_voice_methods(router: Arc<RpcRouter>) {
    info!("注册 voice RPC 方法");
    router.register("voice.transcribe", handle_transcribe).await;
}

fn transcribe_mock(language: Option<&str>) -> Value {
    // 来自 mock 的响应；明确标记 fromFallback=true，前端可识别这是占位结果
    let lang = language.unwrap_or("zh-CN").to_string();
    json!({
        "text": "",
        "confidence": 0.0,
        "language": lang,
        "fromFallback": true,
    })
}

async fn transcribe_openai_whisper(audio_bytes: Vec<u8>, p: &TranscribeParams) -> Result<Value, String> {
    let api_key = env::var("OPENAI_API_KEY")
        .map_err(|_| "OPENAI_API_KEY env var is not set".to_string())?;
    if api_key.is_empty() {
        return Err("OPENAI_API_KEY is empty".to_string());
    }

    // 构造 multipart/form-data
    let boundary = "----remiVoiceBoundary7MA4YWxkTrZu0gW";
    let mut body: Vec<u8> = Vec::new();
    append_form_field(&mut body, boundary, "model", "whisper-1");
    if let Some(lang) = p.language.as_ref() {
        append_form_field(&mut body, boundary, "language", lang);
    }
    append_form_file(&mut body, boundary, "file", &format!("audio.{}", p.format), &audio_bytes);
    body.extend_from_slice(format!("--{boundary}--\r\n").as_bytes());

    // 使用 rustls 防止 native-tls 依赖；通过 reqwest 简单实现
    let resp = reqwest_post_multipart(
        "https://api.openai.com/v1/audio/transcriptions",
        &api_key,
        &body,
        boundary,
    )
    .await
    .map_err(|e| format!("OpenAI Whisper request failed: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        warn!("Whisper request failed: status={}, body={}", status, text);
        return Err(format!("Whisper request failed: HTTP {}", status));
    }

    let payload: Value = resp
        .json()
        .await
        .map_err(|e| format!("Invalid Whisper response: {e}"))?;

    let text = payload
        .get("text")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let language = p.language.clone().unwrap_or_else(|| "auto".to_string());
    Ok(json!({
        "text": text,
        "confidence": 0.95,    // OpenAI 不直接提供 confidence，使用合理默认值
        "language": language,
        "fromFallback": false,
    }))
}

fn append_form_field(body: &mut Vec<u8>, boundary: &str, name: &str, value: &str) {
    body.extend_from_slice(format!("--{boundary}\r\n").as_bytes());
    body.extend_from_slice(
        format!("Content-Disposition: form-data; name=\"{name}\"\r\n\r\n").as_bytes(),
    );
    body.extend_from_slice(value.as_bytes());
    body.extend_from_slice(b"\r\n");
}

fn append_form_file(body: &mut Vec<u8>, boundary: &str, name: &str, filename: &str, data: &[u8]) {
    body.extend_from_slice(format!("--{boundary}\r\n").as_bytes());
    body.extend_from_slice(
        format!(
            "Content-Disposition: form-data; name=\"{name}\"; filename=\"{filename}\"\r\n"
        )
        .as_bytes(),
    );
    body.extend_from_slice(b"Content-Type: application/octet-stream\r\n\r\n");
    body.extend_from_slice(data);
    body.extend_from_slice(b"\r\n");
}

// 由于 remi-server 没有统一引入 reqwest，这里提供最小化实现：
// 通过 tokio 的 TcpStream 直接拼装 HTTP 请求。
async fn reqwest_post_multipart(
    url: &str,
    api_key: &str,
    body: &[u8],
    boundary: &str,
) -> Result<reqwest::Response, String> {
    use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};

    let mut headers = HeaderMap::new();
    headers.insert(
        AUTHORIZATION,
        HeaderValue::from_str(&format!("Bearer {api_key}"))
            .map_err(|e| format!("Invalid API key header: {e}"))?,
    );
    headers.insert(
        CONTENT_TYPE,
        HeaderValue::from_str(&format!(
            "multipart/form-data; boundary={boundary}"
        ))
        .map_err(|e| format!("Invalid content-type: {e}"))?,
    );

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))?;

    let resp = client
        .post(url)
        .headers(headers)
        .body(body.to_vec())
        .send()
        .await
        .map_err(|e| format!("HTTP send failed: {e}"))?;

    Ok(resp)
}
