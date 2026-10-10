//! # Provider 适配器
//!
//! 本模块定义了 HTTP-based Provider 适配器的统一 trait，
//! 以及 Claude (Anthropic) 和 DeepSeek 的参考实现。
//!
//! ## 架构
//!
//! ```text
//! ProviderService
//!     └── HttpProviderAdapter (trait)
//!             ├── ClaudeAdapter  (Anthropic Messages API, 流式 SSE)
//!             └── DeepSeekAdapter (OpenAI Chat Completions 兼容, 流式 SSE)
//! ```

use async_trait::async_trait;
use tokio::sync::broadcast::Sender as BroadcastSender;
use uuid::Uuid;

use ydsz_core::provider::ProviderRuntimeEvent;

use crate::http_client::{EndpointConfig, HttpError};

mod claude;
mod deepseek;

pub use claude::ClaudeAdapter;
pub use deepseek::DeepSeekAdapter;

/// HTTP-based Provider 适配器的统一契约
///
/// 每个适配器封装了一个 Provider 的 API 协议差异，
/// 向上层提供一致的会话启动 / 流式 Turn / 停止接口。
#[async_trait]
pub trait HttpProviderAdapter: Send + Sync {
    /// 返回 Provider 类型
    fn provider_kind(&self) -> ydsz_core::provider::ProviderKind;

    /// 返回 Provider 显示名称
    fn display_name(&self) -> &str;

    /// 调用 Provider 完成一轮流式对话
    ///
    /// ## 参数
    /// - `input`: 用户消息输入
    /// - `event_tx`: 运行时事件广播通道的发送端，适配器将此生成功率和 ToolCall 等事件
    /// - `session_id`: 会话 ID（用于事件关联）
    ///
    /// ## 返回
    /// 成功时返回完整的助手响应文本
    async fn stream_turn(
        &self,
        input: &TurnRequest,
        event_tx: &BroadcastSender<ProviderRuntimeEvent>,
        session_id: &str,
    ) -> Result<String, HttpError>;

    /// 检查 Provider 连通性（发送轻量级请求验证 API Key 有效性）
    async fn check_health(&self) -> ProviderHealthStatus;
}

/// Turn 请求参数
#[derive(Debug, Clone)]
pub struct TurnRequest {
    /// 用户消息
    pub message: String,
    /// 模型名称
    pub model: String,
    /// 温度参数
    pub temperature: Option<f64>,
    /// 最大输出 token 数
    pub max_tokens: Option<u64>,
    /// 系统提示词
    pub system_prompt: Option<String>,
}

impl TurnRequest {
    /// 从 ydsz-core TurnInput 转换
    pub fn from_turn_input(input: &ydsz_core::provider::TurnInput, model: &str) -> Self {
        Self {
            message: input.message.clone(),
            model: model.to_string(),
            temperature: None,
            max_tokens: None,
            system_prompt: None,
        }
    }

    /// 设置系统提示词
    pub fn with_system_prompt(mut self, prompt: impl Into<String>) -> Self {
        self.system_prompt = Some(prompt.into());
        self
    }

    /// 设置温度
    pub fn with_temperature(mut self, temp: f64) -> Self {
        self.temperature = Some(temp);
        self
    }

    /// 设置最大 token
    pub fn with_max_tokens(mut self, max: u64) -> Self {
        self.max_tokens = Some(max);
        self
    }
}

/// Provider 健康状态
#[derive(Debug, Clone)]
pub struct ProviderHealthStatus {
    pub available: bool,
    pub latency_ms: Option<u64>,
    pub message: Option<String>,
}

impl ProviderHealthStatus {
    pub fn healthy(latency_ms: u64) -> Self {
        Self {
            available: true,
            latency_ms: Some(latency_ms),
            message: None,
        }
    }

    pub fn unhealthy(message: impl Into<String>) -> Self {
        Self {
            available: false,
            latency_ms: None,
            message: Some(message.into()),
        }
    }
}

/// 生成唯一会话 ID
pub fn generate_session_id() -> String {
    format!("sess-{}", Uuid::new_v4())
}

/// 生成唯一 Turn ID
pub fn generate_turn_id() -> String {
    format!("turn-{}", Uuid::new_v4())
}

/// 适配器工厂 - 根据 ProviderKind 创建对应适配器
pub struct AdapterFactory;

impl AdapterFactory {
    /// 创建指定类型的适配器
    ///
    /// 对于尚未实现的 Provider，返回 None（上层应做降级提示）
    pub fn create(
        kind: ydsz_core::provider::ProviderKind,
        endpoint: EndpointConfig,
    ) -> Option<Box<dyn HttpProviderAdapter>> {
        match kind {
            ydsz_core::provider::ProviderKind::ClaudeAgent => {
                Some(Box::new(ClaudeAdapter::new(endpoint)))
            }
            // OpenAI Chat Completions 兼容（国产 9 家 + Codex/OpenAI + Grok/xAI + Gemini）
            ydsz_core::provider::ProviderKind::DeepSeek
            | ydsz_core::provider::ProviderKind::Moonshot
            | ydsz_core::provider::ProviderKind::Qwen
            | ydsz_core::provider::ProviderKind::MiniMax
            | ydsz_core::provider::ProviderKind::Doubao
            | ydsz_core::provider::ProviderKind::Ernie
            | ydsz_core::provider::ProviderKind::Hunyuan
            | ydsz_core::provider::ProviderKind::Glm
            | ydsz_core::provider::ProviderKind::Mimo
            | ydsz_core::provider::ProviderKind::Codex
            | ydsz_core::provider::ProviderKind::Grok
            | ydsz_core::provider::ProviderKind::Gemini => {
                Some(Box::new(DeepSeekAdapter::new(endpoint, kind)))
            }
            // Cursor / Kilo / OpenCode / Pi 等 CLI-based Provider 需 CLI 封装适配器
            _ => None,
        }
    }

    /// 获取 Provider 的默认 API 端点
    pub fn default_base_url(kind: ydsz_core::provider::ProviderKind) -> &'static str {
        use ydsz_core::provider::ProviderKind::*;
        match kind {
            ClaudeAgent => "https://api.anthropic.com/v1",
            DeepSeek => "https://api.deepseek.com/v1",
            Moonshot => "https://api.moonshot.cn/v1",
            Qwen => "https://dashscope.aliyuncs.com/compatible-mode/v1",
            MiniMax => "https://api.minimax.chat/v1",
            Doubao => "https://ark.cn-beijing.volces.com/api/v3",
            Ernie => "https://qianfan.baidubce.com/v2",
            Hunyuan => "https://api.hunyuan.cloud.tencent.com/v1",
            Glm => "https://open.bigmodel.cn/api/paas/v4",
            Mimo => "https://api.xiaomimimo.com/v1",
            // 以下为新增：OpenAI Chat Completions 兼容
            Codex => "https://api.openai.com/v1",
            Grok => "https://api.xai.com/v1",
            Gemini => "https://generativelanguage.googleapis.com/v1beta/openai",
            _ => "",
        }
    }

    /// CLI-based Provider 的默认命令（对于需要本地 CLI 的 Provider）
    pub fn cli_command(kind: ydsz_core::provider::ProviderKind) -> Option<&'static str> {
        use ydsz_core::provider::ProviderKind::*;
        match kind {
            Codex => Some("codex"),
            Cursor => Some("cursor-agent"),
            Gemini => Some("gemini"),
            Grok => Some("grok"),
            Kilo => Some("kilo"),
            OpenCode => Some("opencode"),
            Pi => Some("pi"),
            _ => None,
        }
    }
}
