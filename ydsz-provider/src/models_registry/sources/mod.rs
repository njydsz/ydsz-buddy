//! # 模型数据源
//!
//! 从本地配置文件 / 远程 API 加载可用模型列表。
//!
//! ## 配置文件格式 (TOML)
//!
//! ```toml
//! [models.claude-3-5-sonnet-20241022]
//! name = "Claude 3.5 Sonnet"
//! provider = "ClaudeAgent"
//! max_tokens = 8192
//! supports_vision = true
//!
//! [models.deepseek-chat]
//! name = "DeepSeek Chat"
//! provider = "DeepSeek"
//! max_tokens = 4096
//! supports_vision = false
//! ```

use std::collections::HashMap;
use std::path::Path;

use serde::Deserialize;
use tracing::info;

use crate::models_registry::{ModelInfo, ModelRegistry};

/// 模型配置条目（从 TOML 反序列化）
#[derive(Debug, Deserialize)]
pub struct ModelConfigEntry {
    pub name: String,
    pub provider: String,
    #[serde(default)]
    pub max_tokens: Option<u32>,
    #[serde(default)]
    pub supports_vision: bool,
}

/// 模型配置文件根结构
#[derive(Debug, Deserialize, Default)]
pub struct ModelConfigFile {
    #[serde(default)]
    pub models: HashMap<String, ModelConfigEntry>,
}

/// 内置默认模型（不依赖配置文件即可使用的最小模型集）
pub fn default_models() -> Vec<ModelInfo> {
    vec![
        // === Anthropic Claude ===
        ModelInfo {
            id: "claude-3-5-sonnet-20241022".into(),
            name: "Claude 3.5 Sonnet".into(),
            provider: "ClaudeAgent".into(),
            max_tokens: Some(8192),
        },
        ModelInfo {
            id: "claude-3-opus-20240229".into(),
            name: "Claude 3 Opus".into(),
            provider: "ClaudeAgent".into(),
            max_tokens: Some(4096),
        },
        ModelInfo {
            id: "claude-3-haiku-20240307".into(),
            name: "Claude 3 Haiku".into(),
            provider: "ClaudeAgent".into(),
            max_tokens: Some(4096),
        },
        // === DeepSeek ===
        ModelInfo {
            id: "deepseek-chat".into(),
            name: "DeepSeek Chat".into(),
            provider: "DeepSeek".into(),
            max_tokens: Some(4096),
        },
        ModelInfo {
            id: "deepseek-reasoner".into(),
            name: "DeepSeek R1".into(),
            provider: "DeepSeek".into(),
            max_tokens: Some(8192),
        },
        // === OpenAI / Codex ===
        ModelInfo {
            id: "gpt-4o".into(),
            name: "GPT-4o".into(),
            provider: "Codex".into(),
            max_tokens: Some(16384),
        },
        ModelInfo {
            id: "gpt-4o-mini".into(),
            name: "GPT-4o Mini".into(),
            provider: "Codex".into(),
            max_tokens: Some(16384),
        },
        ModelInfo {
            id: "o1-preview".into(),
            name: "o1 Preview".into(),
            provider: "Codex".into(),
            max_tokens: Some(32768),
        },
        // === xAI Grok ===
        ModelInfo {
            id: "grok-2-1212".into(),
            name: "Grok 2".into(),
            provider: "Grok".into(),
            max_tokens: Some(32768),
        },
        // === Google Gemini ===
        ModelInfo {
            id: "gemini-1.5-pro".into(),
            name: "Gemini 1.5 Pro".into(),
            provider: "Gemini".into(),
            max_tokens: Some(8192),
        },
        ModelInfo {
            id: "gemini-1.5-flash".into(),
            name: "Gemini 1.5 Flash".into(),
            provider: "Gemini".into(),
            max_tokens: Some(8192),
        },
        // === Moonshot Kimi ===
        ModelInfo {
            id: "moonshot-v1-8k".into(),
            name: "Kimi 8K".into(),
            provider: "Moonshot".into(),
            max_tokens: Some(8192),
        },
        // === 通义千问 ===
        ModelInfo {
            id: "qwen-plus".into(),
            name: "Qwen Plus".into(),
            provider: "Qwen".into(),
            max_tokens: Some(8192),
        },
        ModelInfo {
            id: "qwen-max".into(),
            name: "Qwen Max".into(),
            provider: "Qwen".into(),
            max_tokens: Some(8192),
        },
        // === MiniMax ===
        ModelInfo {
            id: "abab6.5s-chat".into(),
            name: "MiniMax abab6.5s".into(),
            provider: "MiniMax".into(),
            max_tokens: Some(4096),
        },
        // === 豆包 ===
        ModelInfo {
            id: "doubao-pro-32k".into(),
            name: "豆包 Pro 32K".into(),
            provider: "Doubao".into(),
            max_tokens: Some(32768),
        },
        // === 文心一言 ===
        ModelInfo {
            id: "ernie-4.0-8k".into(),
            name: "文心一言 4.0".into(),
            provider: "Ernie".into(),
            max_tokens: Some(8192),
        },
        // === 混元 ===
        ModelInfo {
            id: "hunyuan-standard".into(),
            name: "混元 Standard".into(),
            provider: "Hunyuan".into(),
            max_tokens: Some(4096),
        },
        // === 智谱 GLM ===
        ModelInfo {
            id: "glm-4-plus".into(),
            name: "GLM-4 Plus".into(),
            provider: "Glm".into(),
            max_tokens: Some(8192),
        },
        // === 小米 MiMo ===
        ModelInfo {
            id: "mimo-v1".into(),
            name: "MiMo V1".into(),
            provider: "Mimo".into(),
            max_tokens: Some(4096),
        },
    ]
}

/// 从 TOML 配置文件加载模型列表
pub fn load_from_toml(path: &Path) -> Result<ModelConfigFile, ModelLoadError> {
    let content = std::fs::read_to_string(path)
        .map_err(|e| ModelLoadError::Io(e.to_string()))?;
    toml::from_str(&content)
        .map_err(|e| ModelLoadError::Parse(e.to_string()))
}

/// 将配置文件条目填充到 ModelRegistry
pub fn populate_registry(registry: &mut ModelRegistry, config: ModelConfigFile) {
    for (id, entry) in config.models {
        registry.register(ModelInfo {
            id,
            name: entry.name,
            provider: entry.provider,
            max_tokens: entry.max_tokens,
        });
    }
    info!("Models loaded from config file");
}

/// TOML 文件加载错误
#[derive(Debug, thiserror::Error)]
pub enum ModelLoadError {
    #[error("Failed to read file: {0}")]
    Io(String),
    #[error("Failed to parse TOML: {0}")]
    Parse(String),
}

/// 判断模型是否支持图片理解
pub fn model_supports_vision(model_id: &str) -> bool {
    matches!(
        model_id,
        "claude-3-5-sonnet-20241022"
            | "claude-3-opus-20240229"
            | "gpt-4o"
            | "gpt-4o-mini"
            | "gemini-1.5-pro"
            | "gemini-1.5-flash"
            | "qwen-vl-plus"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_models_not_empty() {
        let models = default_models();
        assert!(!models.is_empty());
        // 至少应有 17 个模型
        assert!(models.len() >= 17);
    }

    #[test]
    fn load_from_toml_valid() {
        let toml_str = r#"
[models.claude-3-5-sonnet-20241022]
name = "Claude 3.5 Sonnet"
provider = "ClaudeAgent"
max_tokens = 8192
supports_vision = true

[models.deepseek-chat]
name = "DeepSeek Chat"
provider = "DeepSeek"
"#;
        // toml crate from_str
        let config: ModelConfigFile = toml::from_str(toml_str).expect("valid TOML");
        assert_eq!(config.models.len(), 2);
        assert_eq!(
            config.models["claude-3-5-sonnet-20241022"].name,
            "Claude 3.5 Sonnet"
        );
    }

    #[test]
    fn model_supports_vision_check() {
        assert!(model_supports_vision("gpt-4o"));
        assert!(model_supports_vision("claude-3-5-sonnet-20241022"));
        assert!(!model_supports_vision("deepseek-chat"));
        assert!(!model_supports_vision("o1-preview"));
    }
}
