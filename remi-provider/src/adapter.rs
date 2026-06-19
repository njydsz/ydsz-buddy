//! Provider 适配器 trait 定义

use std::sync::Arc;

use async_trait::async_trait;
use remi_core::provider::{
    ProviderKind, ProviderRuntimeEvent, ProviderSession, ProviderSessionStartInput,
    ProviderTurnStartResult, TurnInput,
};
use tokio::sync::broadcast;

use crate::error::ProviderResult;

/// Provider 适配器能力
#[derive(Debug, Clone)]
pub struct ProviderCapabilities {
    /// 是否支持会话中切换模型
    pub session_model_switch: SessionModelSwitchMode,
    /// 是否支持技能提及
    pub supports_skill_mentions: bool,
    /// 是否支持技能发现
    pub supports_skill_discovery: bool,
    /// 是否支持原生命令发现
    pub supports_native_slash_command_discovery: bool,
    /// 是否支持运行时模型列表
    pub supports_runtime_model_list: bool,
    /// 是否支持 Turn 转向
    pub supports_turn_steering: bool,
}

/// 会话模型切换模式
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SessionModelSwitchMode {
    /// 会话内切换
    InSession,
    /// 重启会话
    RestartSession,
    /// 不支持
    Unsupported,
}

/// Provider 适配器 trait
#[async_trait]
pub trait ProviderAdapter: Send + Sync {
    /// 获取 Provider 类型
    fn provider_kind(&self) -> ProviderKind;

    /// 获取适配器能力
    fn capabilities(&self) -> ProviderCapabilities;

    /// 启动会话
    async fn start_session(&self, input: ProviderSessionStartInput) -> ProviderResult<ProviderSession>;

    /// 发送 Turn
    async fn send_turn(&self, input: TurnInput) -> ProviderResult<ProviderTurnStartResult>;

    /// 转向 Turn（重定向运行中的 Turn）
    async fn steer_turn(&self, input: TurnInput) -> ProviderResult<ProviderTurnStartResult> {
        Err(crate::error::ProviderError::UnsupportedOperation(
            "steer_turn not supported".to_string(),
        ))
    }

    /// 中断 Turn
    async fn interrupt_turn(&self, thread_id: &str, turn_id: Option<&str>) -> ProviderResult<()>;

    /// 停止会话
    async fn stop_session(&self, thread_id: &str) -> ProviderResult<()>;

    /// 停止所有会话
    async fn stop_all(&self) -> ProviderResult<()>;

    /// 列出当前会话
    async fn list_sessions(&self) -> ProviderResult<Vec<ProviderSession>>;

    /// 检查是否拥有会话
    async fn has_session(&self, thread_id: &str) -> ProviderResult<bool>;

    /// 回滚会话
    async fn rollback_conversation(&self, thread_id: &str, num_turns: u32) -> ProviderResult<()> {
        Err(crate::error::ProviderError::UnsupportedOperation(
            "rollback_conversation not supported".to_string(),
        ))
    }

    /// 压缩上下文
    async fn compact_thread(&self, thread_id: &str) -> ProviderResult<()> {
        Err(crate::error::ProviderError::UnsupportedOperation(
            "compact_thread not supported".to_string(),
        ))
    }

    /// 流式事件接收器
    async fn stream_events(&self) -> ProviderResult<broadcast::Receiver<ProviderRuntimeEvent>>;
}
