//! 语音转录服务接口。
//!
//! 大厂标准：用户应该能在 IDE 内直接"说出来"，由后端
//! 转录成文本后发送到会话。本模块定义 [`VoiceProvider`] trait
//! 和一个简单的内存实现 [`VoiceService`]，方便本地开发与测试。
//! 真实生产可对接 Whisper、Deepgram、Google STT 等。

use remi_core::Result;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::Mutex;
use tracing::{debug, info};

/// 语音转录结果。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoiceTranscription {
    /// 转录文本。
    pub text: String,
    /// 使用的语言代码。
    pub language: Option<String>,
    /// 置信度（0-1）。
    pub confidence: Option<f32>,
    /// 时长（毫秒）。
    pub duration_ms: u64,
}

/// 语音服务状态。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum VoiceState {
    /// 未启动。
    Idle,
    /// 正在录音。
    Recording,
    /// 正在转录。
    Transcribing,
    /// 出错。
    Error,
}

/// 语音 Provider trait。
#[async_trait::async_trait]
pub trait VoiceProvider: Send + Sync {
    /// Provider 名称。
    fn name(&self) -> &'static str;

    /// 转录音频字节。
    async fn transcribe(
        &self,
        audio: &[u8],
        sample_rate: u32,
    ) -> Result<VoiceTranscription>;
}

/// 简单的内存占位实现 —— 直接把"音频"当成文本返回。
pub struct PassthroughVoiceProvider;

#[async_trait::async_trait]
impl VoiceProvider for PassthroughVoiceProvider {
    fn name(&self) -> &'static str {
        "passthrough"
    }

    async fn transcribe(&self, audio: &[u8], _sample_rate: u32) -> Result<VoiceTranscription> {
        let text = String::from_utf8_lossy(audio).to_string();
        Ok(VoiceTranscription {
            text,
            language: None,
            confidence: Some(1.0),
            duration_ms: 0,
        })
    }
}

/// 语音服务 —— 高层封装。
pub struct VoiceService {
    provider: Arc<dyn VoiceProvider>,
    state: Arc<Mutex<VoiceState>>,
}

impl VoiceService {
    /// 创建一个使用指定 Provider 的语音服务。
    pub fn new(provider: Arc<dyn VoiceProvider>) -> Self {
        Self {
            provider,
            state: Arc::new(Mutex::new(VoiceState::Idle)),
        }
    }

    /// 获取当前状态。
    pub async fn state(&self) -> VoiceState {
        *self.state.lock().await
    }

    /// 转录音频。
    pub async fn transcribe(
        &self,
        audio: &[u8],
        sample_rate: u32,
    ) -> Result<VoiceTranscription> {
        {
            let mut state = self.state.lock().await;
            *state = VoiceState::Transcribing;
        }
        let result = self.provider.transcribe(audio, sample_rate).await;
        {
            let mut state = self.state.lock().await;
            *state = match &result {
                Ok(_) => VoiceState::Idle,
                Err(_) => VoiceState::Error,
            };
        }
        info!(provider = self.provider.name(), "语音转录完成");
        result
    }
}

impl Default for VoiceService {
    fn default() -> Self {
        Self::new(Arc::new(PassthroughVoiceProvider))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_passthrough_provider() {
        let provider = PassthroughVoiceProvider;
        let result = provider.transcribe(b"hello world", 16000).await.unwrap();
        assert_eq!(result.text, "hello world");
        assert_eq!(result.confidence, Some(1.0));
    }

    #[tokio::test]
    async fn test_voice_service_state_transitions() {
        let service = VoiceService::default();
        assert_eq!(service.state().await, VoiceState::Idle);
        let _ = service.transcribe(b"hi", 16000).await;
        assert_eq!(service.state().await, VoiceState::Idle);
    }
}
