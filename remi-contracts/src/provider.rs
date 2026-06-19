//! 提供商（Provider）相关的模式定义
//!
//! 定义 Remi Code 支持的 AI 提供商枚举、模型列表、健康状态、会话信息与错误类型。

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::ModelId;

/// 提供商名称
///
/// 序列化采用 `lowercase`，便于与上游 CLI/SDK 配置保持一致。
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum ProviderName {
    /// Anthropic Claude
    Claude,
    /// OpenAI Codex
    Codex,
    /// Cursor
    Cursor,
    /// Google Gemini
    Gemini,
    /// xAI Grok
    Grok,
    /// OpenCode
    OpenCode,
    /// Pi
    Pi,
    /// Kilo
    Kilo,
}

impl std::fmt::Display for ProviderName {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Claude => write!(f, "claude"),
            Self::Codex => write!(f, "codex"),
            Self::Cursor => write!(f, "cursor"),
            Self::Gemini => write!(f, "gemini"),
            Self::Grok => write!(f, "grok"),
            Self::OpenCode => write!(f, "opencode"),
            Self::Pi => write!(f, "pi"),
            Self::Kilo => write!(f, "kilo"),
        }
    }
}

/// 提供商元信息
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ProviderInfo {
    /// 提供商名称
    pub name: ProviderName,
    /// 用户可读的显示名称
    pub display_name: String,
    /// 可用模型列表
    pub models: Vec<ModelId>,
    /// 提供商是否当前可用（已配置凭证且连通性正常）
    pub available: bool,
}

/// 提供商健康状态
///
/// 在"健康度栏"等 UI 组件中实时展示。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ProviderHealth {
    /// 提供商名称
    pub provider: ProviderName,
    /// 健康状态
    pub status: ProviderHealthStatus,
    /// 最近检查时间戳（ISO 8601 字符串）
    pub last_checked: String,
    /// 错误信息（状态不健康时存在）
    pub error: Option<String>,
}

/// 提供商健康状态枚举
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum ProviderHealthStatus {
    /// 提供商运行正常
    Healthy,
    /// 提供商性能下降（延迟升高或偶发错误）
    Degraded,
    /// 提供商不可用
    Unhealthy,
    /// 提供商状态未知（尚未发起健康检查）
    Unknown,
}

/// 提供商会话信息
///
/// 表示与上游 AI 服务的一次会话，用于跟踪 token 用量与生命周期。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ProviderSession {
    /// 会话 ID
    pub id: String,
    /// 提供商名称
    pub provider: ProviderName,
    /// 模型 ID
    pub model: ModelId,
    /// 创建时间戳（ISO 8601 字符串）
    pub created_at: String,
    /// 最近活动时间戳（ISO 8601 字符串）
    pub last_activity: String,
}

/// 提供商相关错误类型
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, thiserror::Error)]
#[serde(tag = "_tag")]
pub enum ProviderError {
    /// 提供商未找到
    #[error("提供者未找到: {provider}")]
    ProviderNotFound {
        /// 未找到的提供商
        provider: ProviderName,
    },
    /// 模型未找到
    #[error("模型未找到: {model}")]
    ModelNotFound {
        /// 未找到的模型
        model: ModelId,
    },
    /// 上游 API 错误
    #[error("API 错误: {message}")]
    ApiError {
        /// 错误描述
        message: String,
    },
    /// 超出速率限制
    #[error("超出速率限制")]
    RateLimitExceeded,
    /// 内部错误
    #[error("内部错误: {message}")]
    Internal {
        /// 错误描述
        message: String,
    },
}

/// 列出提供商原生命令的入参
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ProviderListCommandsInput {
    /// 提供商名称
    pub provider: ProviderName,
    /// 当前工作目录
    pub cwd: String,
    /// 线程 ID（可选，用于上下文相关的命令）
    pub thread_id: Option<String>,
    /// 代理目录（可选）
    pub agent_dir: Option<String>,
    /// 是否强制重新加载（忽略缓存）
    pub force_reload: Option<bool>,
}

/// 提供商原生命令描述符
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ProviderNativeCommandDescriptor {
    /// 命令名称（如 `"commit"`、`"summarize"`）
    pub name: String,
    /// 命令描述（可选）
    pub description: Option<String>,
}

/// 列出提供商原生命令的出参
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ProviderListCommandsOutput {
    /// 命令列表
    pub commands: Vec<ProviderNativeCommandDescriptor>,
    /// 命令来源（可选，用于诊断）
    pub source: Option<String>,
    /// 是否来自缓存（可选）
    pub cached: Option<bool>,
}
