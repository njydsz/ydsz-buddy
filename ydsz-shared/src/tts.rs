//! # TTS 语音合成模块（P2-9）
//!
//! 将文本转换为语音的支持基础设施。
//!
//! ## 设计
//!
//! - `TtsAdapter` trait 抽象不同 TTS 后端（Edge TTS / Azure / OpenAI TTS / 本地部署）
//! - `TtsConfig` 统一配置（语音、语速、音量、输出格式）
//! - `TtsResult` 统一返回结果

use async_trait::async_trait;
use serde::{Deserialize, Serialize};

// ============================================================================
// 配置
// ============================================================================

/// TTS 配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TtsConfig {
    /// 语音类型标识
    #[serde(default = "default_voice")]
    pub voice: String,
    /// 语速（0.5 - 2.0，默认 1.0）
    #[serde(default = "default_speed")]
    pub speed: f64,
    /// 音量（0.0 - 1.0，默认 1.0）
    #[serde(default = "default_volume")]
    pub volume: f64,
    /// 输出格式
    #[serde(default = "default_format")]
    pub format: TtsAudioFormat,
    /// 输出文件路径（可选，不指定则返回音频字节）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_path: Option<String>,
}

fn default_voice() -> String {
    "zh-CN-XiaoxiaoNeural".to_string()
}

fn default_speed() -> f64 {
    1.0
}

fn default_volume() -> f64 {
    1.0
}

fn default_format() -> TtsAudioFormat {
    TtsAudioFormat::Mp3
}

impl Default for TtsConfig {
    fn default() -> Self {
        Self {
            voice: default_voice(),
            speed: default_speed(),
            volume: default_volume(),
            format: default_format(),
            output_path: None,
        }
    }
}

/// 音频输出格式
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TtsAudioFormat {
    Mp3,
    Wav,
    Ogg,
    Webm,
}

// ============================================================================
// 结果
// ============================================================================

/// TTS 合成结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TtsResult {
    /// 是否成功
    pub success: bool,
    /// 音频数据（成功且未指定 output_path 时返回）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub audio_data: Option<Vec<u8>>,
    /// 输出文件路径（成功且指定 output_path 时返回）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_path: Option<String>,
    /// 音频时长（秒）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_secs: Option<f64>,
    /// 错误信息（失败时）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl TtsResult {
    /// 创建成功结果（内存模式）
    pub fn success(audio_data: Vec<u8>, duration_secs: f64) -> Self {
        Self {
            success: true,
            audio_data: Some(audio_data),
            output_path: None,
            duration_secs: Some(duration_secs),
            error: None,
        }
    }

    /// 创建成功结果（文件模式）
    pub fn success_file(output_path: String, duration_secs: f64) -> Self {
        Self {
            success: true,
            audio_data: None,
            output_path: Some(output_path),
            duration_secs: Some(duration_secs),
            error: None,
        }
    }

    /// 创建失败结果
    pub fn failure(error: impl Into<String>) -> Self {
        Self {
            success: false,
            audio_data: None,
            output_path: None,
            duration_secs: None,
            error: Some(error.into()),
        }
    }
}

// ============================================================================
// Adapter Trait
// ============================================================================

/// TTS Adapter 抽象接口
///
/// 不同 TTS 后端（Edge TTS、Azure Speech、OpenAI TTS、本地部署）实现此 trait。
#[async_trait]
pub trait TtsAdapter: Send + Sync {
    /// 获取 Adapter 名称
    fn name(&self) -> &str;

    /// 将文本合成为语音
    async fn synthesize(&self, text: &str, config: &TtsConfig) -> anyhow::Result<TtsResult>;

    /// 获取可用语音列表
    async fn list_voices(&self) -> anyhow::Result<Vec<TtsVoiceInfo>>;

    /// 检查 TTS 服务是否可用
    async fn is_available(&self) -> bool {
        true
    }
}

/// 语音信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TtsVoiceInfo {
    /// 语音标识
    pub voice_id: String,
    /// 显示名称
    pub display_name: String,
    /// 语言区域
    pub locale: String,
    /// 性别
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gender: Option<String>,
}

// ============================================================================
// Edge TTS Adapter（基于微软 Edge 免费 TTS）
// ============================================================================

/// Edge TTS Adapter
///
/// 使用微软 Edge 的在线免费 TTS 服务。
/// 需要网络连接，无需 API Key。
#[derive(Debug, Clone)]
pub struct EdgeTtsAdapter;

impl EdgeTtsAdapter {
    /// 创建新的 Edge TTS Adapter
    pub fn new() -> Self {
        Self
    }

    /// 获取 Edge TTS 可用的中文语音列表
    pub fn chinese_voices() -> Vec<TtsVoiceInfo> {
        vec![
            TtsVoiceInfo {
                voice_id: "zh-CN-XiaoxiaoNeural".to_string(),
                display_name: "晓晓（女声）".to_string(),
                locale: "zh-CN".to_string(),
                gender: Some("Female".to_string()),
            },
            TtsVoiceInfo {
                voice_id: "zh-CN-YunxiNeural".to_string(),
                display_name: "云希（男声）".to_string(),
                locale: "zh-CN".to_string(),
                gender: Some("Male".to_string()),
            },
            TtsVoiceInfo {
                voice_id: "zh-CN-YunjianNeural".to_string(),
                display_name: "云健（男声）".to_string(),
                locale: "zh-CN".to_string(),
                gender: Some("Male".to_string()),
            },
            TtsVoiceInfo {
                voice_id: "zh-CN-XiaoyiNeural".to_string(),
                display_name: "晓伊（女声）".to_string(),
                locale: "zh-CN".to_string(),
                gender: Some("Female".to_string()),
            },
            TtsVoiceInfo {
                voice_id: "zh-TW-HsiaoChenNeural".to_string(),
                display_name: "曉臻（繁体）".to_string(),
                locale: "zh-TW".to_string(),
                gender: Some("Female".to_string()),
            },
        ]
    }
}

impl Default for EdgeTtsAdapter {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl TtsAdapter for EdgeTtsAdapter {
    fn name(&self) -> &str {
        "edge-tts"
    }

    async fn synthesize(&self, _text: &str, _config: &TtsConfig) -> anyhow::Result<TtsResult> {
        // 实际实现需要调用 edge-tts 服务
        // 这里返回一个占位结果，表明接口已打通
        Ok(TtsResult::failure(
            "Edge TTS 需要安装 edge-tts 依赖并在运行时启用",
        ))
    }

    async fn list_voices(&self) -> anyhow::Result<Vec<TtsVoiceInfo>> {
        Ok(Self::chinese_voices())
    }

    async fn is_available(&self) -> bool {
        // 实际实现应检查网络连通性
        false
    }
}

// ============================================================================
// TTS 服务
// ============================================================================

/// TTS 服务
///
/// 封装 TtsAdapter，提供统一的高层 API。
pub struct TtsService {
    adapter: Box<dyn TtsAdapter>,
    config: TtsConfig,
}

impl TtsService {
    /// 创建新的 TTS 服务
    pub fn new(adapter: Box<dyn TtsAdapter>) -> Self {
        Self {
            adapter,
            config: TtsConfig::default(),
        }
    }

    /// 创建带配置的 TTS 服务
    pub fn with_config(adapter: Box<dyn TtsAdapter>, config: TtsConfig) -> Self {
        Self { adapter, config }
    }

    /// 合成语音
    pub async fn speak(&self, text: &str) -> anyhow::Result<TtsResult> {
        self.adapter.synthesize(text, &self.config).await
    }

    /// 合成语音到文件
    pub async fn speak_to_file(&self, text: &str, output_path: &str) -> anyhow::Result<TtsResult> {
        let mut config = self.config.clone();
        config.output_path = Some(output_path.to_string());
        self.adapter.synthesize(text, &config).await
    }

    /// 获取可用语音列表
    pub async fn available_voices(&self) -> anyhow::Result<Vec<TtsVoiceInfo>> {
        self.adapter.list_voices().await
    }

    /// 检查服务是否可用
    pub async fn is_available(&self) -> bool {
        self.adapter.is_available().await
    }

    /// 更新配置
    pub fn set_config(&mut self, config: TtsConfig) {
        self.config = config;
    }

    /// 获取当前配置
    pub fn config(&self) -> &TtsConfig {
        &self.config
    }
}

// ============================================================================
// 测试
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tts_config_default() {
        let config = TtsConfig::default();
        assert_eq!(config.voice, "zh-CN-XiaoxiaoNeural");
        assert_eq!(config.speed, 1.0);
        assert_eq!(config.volume, 1.0);
        assert_eq!(config.format, TtsAudioFormat::Mp3);
    }

    #[test]
    fn test_edge_tts_voices() {
        let voices = EdgeTtsAdapter::chinese_voices();
        assert!(!voices.is_empty());
        assert!(voices.iter().any(|v| v.locale == "zh-CN"));
        assert!(voices.iter().any(|v| v.voice_id == "zh-CN-XiaoxiaoNeural"));
    }

    #[test]
    fn test_tts_result_success() {
        let result = TtsResult::success(vec![1, 2, 3], 2.5);
        assert!(result.success);
        assert_eq!(result.duration_secs, Some(2.5));
        assert!(result.audio_data.is_some());
    }

    #[test]
    fn test_tts_result_failure() {
        let result = TtsResult::failure("Service unavailable");
        assert!(!result.success);
        assert_eq!(result.error, Some("Service unavailable".to_string()));
    }
}
