//! # 语音识别命令模块
//!
//! 本模块提供与语音识别相关的 Tauri 命令，支持将音频数据转换为文本。
//!
//! ## 模块职责
//!
//! - 定义语音识别的输入/输出数据结构
//! - 提供语音转文字的命令接口
//! - 转发到嵌入式 remi-server 的 `voice.transcribe` RPC 方法
//!
//! ## 核心功能
//!
//! 1. **语音转文字**：接收前端传来的音频数据，转发到服务端进行识别
//! 2. **语言支持**：支持指定音频语言代码（如 "zh-CN"、"en-US"）
//! 3. **置信度返回**：返回识别结果的置信度分数
//!
//! ## 使用场景
//!
//! - 用户在对话中发送语音消息时，前端录制音频并调用 `transcribe_voice` 转换为文本
//! - 语音输入功能，用户通过语音输入代码或指令
//!
//! ## 设计说明
//!
//! - 通过 `remi_server::ipc_voice_transcribe` 桥接调用嵌入式服务器的 ASR 引擎
//! - 实际 ASR 引擎可在服务端通过环境变量 `REMI_VOICE_PROVIDER` 配置（mock / openai_whisper / azure / local）
//! - 若服务端无可用 provider，则返回 `ProviderNotConfigured` 错误，前端应禁用该功能

use base64::Engine;
use serde::{Deserialize, Serialize};

/// 语音转文字输入参数
#[derive(Debug, Deserialize)]
pub struct TranscribeVoiceInput {
    /// 音频数据（Base64 编码）
    pub audio_data: String,
    /// 音频格式（如 "wav"、"mp3"、"webm"）
    pub format: String,
    /// 语言代码（如 "zh-CN"、"en-US"），不提供时由服务自动检测
    pub language: Option<String>,
}

/// 语音转文字结果
#[derive(Debug, Serialize)]
pub struct TranscribeVoiceResult {
    /// 识别出的文本
    pub text: String,
    /// 置信度（0.0 - 1.0）
    pub confidence: f32,
    /// 语言代码
    pub language: String,
    /// 是否来自 fallback（mock）实现
    pub from_fallback: bool,
}

/// 语音转文字命令
///
/// 将 Base64 编码的音频数据转发到嵌入式 remi-server 的 `voice.transcribe` RPC。
/// 若服务端无可用 ASR 引擎，则返回明确的错误信息，由前端决定降级策略。
#[tauri::command]
pub async fn transcribe_voice(input: TranscribeVoiceInput) -> Result<TranscribeVoiceResult, String> {
    // 1. 校验输入
    if input.audio_data.is_empty() {
        return Err("audio_data is empty".to_string());
    }
    if input.format.is_empty() {
        return Err("format is required".to_string());
    }

    // 2. 解码 Base64 校验合法性（不落地到磁盘）
    let _bytes = base64::engine::general_purpose::STANDARD
        .decode(input.audio_data.as_bytes())
        .map_err(|e| format!("Invalid base64 audio_data: {e}"))?;

    // 3. 通过进程内通道转发到 remi-server
    let request = serde_json::json!({
        "method": "voice.transcribe",
        "params": {
            "format": input.format,
            "language": input.language,
            "audioBase64": input.audio_data,
        }
    });

    match remi_server::ipc_voice_transcribe(request).await {
        Ok(resp) => {
            let text = resp
                .get("text")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let confidence = resp
                .get("confidence")
                .and_then(|v| v.as_f64())
                .unwrap_or(0.0) as f32;
            let language = resp
                .get("language")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .unwrap_or_else(|| input.language.unwrap_or_else(|| "auto".to_string()));
            let from_fallback = resp
                .get("fromFallback")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);

            Ok(TranscribeVoiceResult {
                text,
                confidence,
                language,
                from_fallback,
            })
        }
        Err(e) => Err(format!("Voice transcription failed: {e}")),
    }
}
