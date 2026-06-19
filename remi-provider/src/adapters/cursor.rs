//! Cursor Provider 适配器

use std::sync::Arc;

use async_trait::async_trait;
use remi_core::provider::{
    ProviderKind, ProviderRuntimeEvent, ProviderSession, ProviderSessionStartInput,
    ProviderTurnStartResult, TurnInput,
};
use tokio::sync::{broadcast, RwLock};
use tracing::info;

use crate::adapter::{ProviderAdapter, ProviderCapabilities, SessionModelSwitchMode};
use crate::error::ProviderResult;

/// Cursor 适配器
pub struct CursorAdapter {
    sessions: Arc<RwLock<Vec<ProviderSession>>>,
    event_tx: broadcast::Sender<ProviderRuntimeEvent>,
}

impl CursorAdapter {
    /// 创建新的 Cursor 适配器
    pub fn new() -> Self {
        let (event_tx, _) = broadcast::channel(10000);

        Self {
            sessions: Arc::new(RwLock::new(Vec::new())),
            event_tx,
        }
    }
}

impl Default for CursorAdapter {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl ProviderAdapter for CursorAdapter {
    fn provider_kind(&self) -> ProviderKind {
        ProviderKind::Cursor
    }

    fn capabilities(&self) -> ProviderCapabilities {
        ProviderCapabilities {
            session_model_switch: SessionModelSwitchMode::Unsupported,
            supports_skill_mentions: false,
            supports_skill_discovery: false,
            supports_native_slash_command_discovery: false,
            supports_runtime_model_list: false,
            supports_turn_steering: false,
        }
    }

    async fn start_session(&self, input: ProviderSessionStartInput) -> ProviderResult<ProviderSession> {
        info!("CursorAdapter: 启动会话 thread_id={}", input.thread_id);

        // TODO: 实现 Cursor 会话启动逻辑（ACP 协议）
        let session = ProviderSession {
            session_id: uuid::Uuid::new_v4().to_string(),
            thread_id: input.thread_id.clone(),
            provider: ProviderKind::Cursor,
            model: input.model.clone(),
            status: remi_core::provider::ProviderSessionStatus::Running,
            created_at: chrono::Utc::now(),
        };

        let mut sessions = self.sessions.write().await;
        sessions.push(session.clone());

        Ok(session)
    }

    async fn send_turn(&self, input: TurnInput) -> ProviderResult<ProviderTurnStartResult> {
        info!("CursorAdapter: 发送 Turn thread_id={}", input.thread_id);

        // TODO: 实现 Cursor Turn 发送逻辑
        Ok(ProviderTurnStartResult {
            turn_id: input.turn_id,
            thread_id: input.thread_id,
        })
    }

    async fn interrupt_turn(&self, thread_id: &str, turn_id: Option<&str>) -> ProviderResult<()> {
        info!("CursorAdapter: 中断 Turn thread_id={}, turn_id={:?}", thread_id, turn_id);

        // TODO: 实现 Cursor Turn 中断逻辑
        Ok(())
    }

    async fn stop_session(&self, thread_id: &str) -> ProviderResult<()> {
        info!("CursorAdapter: 停止会话 thread_id={}", thread_id);

        let mut sessions = self.sessions.write().await;
        sessions.retain(|s| s.thread_id != thread_id);

        Ok(())
    }

    async fn stop_all(&self) -> ProviderResult<()> {
        info!("CursorAdapter: 停止所有会话");

        let mut sessions = self.sessions.write().await;
        sessions.clear();

        Ok(())
    }

    async fn list_sessions(&self) -> ProviderResult<Vec<ProviderSession>> {
        let sessions = self.sessions.read().await;
        Ok(sessions.clone())
    }

    async fn has_session(&self, thread_id: &str) -> ProviderResult<bool> {
        let sessions = self.sessions.read().await;
        Ok(sessions.iter().any(|s| s.thread_id == thread_id))
    }

    async fn stream_events(&self) -> ProviderResult<broadcast::Receiver<ProviderRuntimeEvent>> {
        Ok(self.event_tx.subscribe())
    }
}
