//! AI 模型相关的模式定义
//!
//! 定义模型 ID、能力描述与元信息，供前端在"模型选择器"等组件中展示。

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// AI 模型标识符
///
/// 通常为上游服务的模型名（如 `"claude-3-5-sonnet"`、`"gpt-4o"`），
/// 也可携带组织前缀（如 `"openai/gpt-4o"`）。
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, JsonSchema)]
#[serde(transparent)]
pub struct ModelId(pub String);

impl ModelId {
    /// 创建新的模型 ID
    pub fn new(id: impl Into<String>) -> Self {
        Self(id.into())
    }
}

impl std::fmt::Display for ModelId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        self.0.fmt(f)
    }
}

/// 模型能力描述
///
/// 用于前端按能力过滤/排序模型（例如仅展示支持视觉的模型）。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ModelCapabilities {
    /// 是否支持流式输出（SSE / WebSocket 增量）
    pub streaming: bool,
    /// 是否支持函数调用（tool use）
    pub function_calling: bool,
    /// 是否支持视觉（图像输入）
    pub vision: bool,
    /// 最大上下文长度（以 token 计）
    pub max_context_length: u32,
    /// 最大输出长度（以 token 计）
    pub max_output_length: u32,
}

/// 模型信息
///
/// 在"模型选择器"、健康检查、AI 元数据展示等场景使用。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    /// 模型 ID
    pub id: ModelId,
    /// 用户可读的显示名称
    pub name: String,
    /// 所属提供商名称
    pub provider: String,
    /// 模型能力
    pub capabilities: ModelCapabilities,
}
