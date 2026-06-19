//! 模型模式定义。

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// AI 模型标识符。
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, JsonSchema)]
pub struct ModelId(pub String);

impl ModelId {
    /// 创建新的模型 ID。
    pub fn new(id: impl Into<String>) -> Self {
        Self(id.into())
    }
}

impl std::fmt::Display for ModelId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        self.0.fmt(f)
    }
}

/// 模型能力描述。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ModelCapabilities {
    /// 是否支持流式输出。
    pub streaming: bool,
    /// 是否支持函数调用。
    pub function_calling: bool,
    /// 是否支持视觉能力。
    pub vision: bool,
    /// 最大上下文长度（以 token 计）。
    pub max_context_length: u32,
    /// 最大输出长度（以 token 计）。
    pub max_output_length: u32,
}

/// 模型信息。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ModelInfo {
    /// 模型 ID。
    pub id: ModelId,
    /// 显示名称。
    pub name: String,
    /// 提供者名称。
    pub provider: String,
    /// 模型能力。
    pub capabilities: ModelCapabilities,
}
