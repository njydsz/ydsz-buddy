//! Provider 服务 - 跨 Provider 门面

use std::collections::HashMap;
use std::sync::Arc;

use remi_core::provider::{
    ProviderKind, ProviderRuntimeEvent, ProviderSession, ProviderSessionStartInput,
    ProviderTurnStartResult, TurnInput,
};
use tokio::sync::{broadcast, RwLock};
use tracing::{info, warn};

use crate::adapter::ProviderAdapter;
use crate::error::{ProviderError, ProviderResult};

/// Provider 服务
pub struct ProviderService {
    adapters: Arc<RwLock<HashMap<ProviderKind, Arc<dyn ProviderAdapter>>>>,
    event_tx: broadcast::Sender<ProviderRuntimeEvent>,
}

impl ProviderService {
    /// 创建新的 Provider 服务
    pub fn new() -> Self {
        let (event_tx, _) = broadcast::channel(10000);

        Self {
            adapters: Arc::new(RwLock::new(HashMap::new())),
            event_tx,
        }
    }

    /// 注册适配器
    pub async fn register_adapter(&self, adapter: Arc<dyn ProviderAdapter>) {
        let kind = adapter.provider_kind();
        info!("注册 Provider 适配器: {:?}", kind);

        let mut adapters = self.adapters.write().await;
        adapters.insert(kind, adapter);
    }

    /// 获取适配器
    pub async fn get_adapter(&self, provider: ProviderKind) -> ProviderResult<Arc<dyn ProviderAdapter>> {
        let adapters = self.adapters.read().await;

        adapters
            .get(&provider)
            .cloned()
            .ok_or_else(|| ProviderError::ProviderNotFound(format!("{:?}", provider)))
    }

    /// 启动会话
    pub async fn start_session(
        &self,
        thread_id: &str,
        input: ProviderSessionStartInput,
    ) -> ProviderResult<ProviderSession> {
        let provider = input.provider;
        let adapter = self.get_adapter(provider).await?;

        info!("启动 Provider 会话: thread_id={}, provider={:?}", thread_id, provider);

        adapter.start_session(input).await
    }

    /// 发送 Turn
    pub async fn send_turn(&self, input: TurnInput) -> ProviderResult<ProviderTurnStartResult> {
        let provider = input.provider;
        let adapter = self.get_adapter(provider).await?;

        adapter.send_turn(input).await
    }

    /// 转向 Turn
    pub async fn steer_turn(&self, input: TurnInput) -> ProviderResult<ProviderTurnStartResult> {
        let provider = input.provider;
        let adapter = self.get_adapter(provider).await?;

        adapter.steer_turn(input).await
    }

    /// 中断 Turn
    pub async fn interrupt_turn(
        &self,
        thread_id: &str,
        turn_id: Option<&str>,
        provider: ProviderKind,
    ) -> ProviderResult<()> {
        let adapter = self.get_adapter(provider).await?;

        adapter.interrupt_turn(thread_id, turn_id).await
    }

    /// 停止会话
    pub async fn stop_session(&self, thread_id: &str, provider: ProviderKind) -> ProviderResult<()> {
        let adapter = self.get_adapter(provider).await?;

        adapter.stop_session(thread_id).await
    }

    /// 列出所有会话
    pub async fn list_sessions(&self) -> ProviderResult<Vec<ProviderSession>> {
        let adapters = self.adapters.read().await;
        let mut all_sessions = Vec::new();

        for adapter in adapters.values() {
            match adapter.list_sessions().await {
                Ok(sessions) => all_sessions.extend(sessions),
                Err(e) => {
                    warn!("列出会话失败: {}", e);
                }
            }
        }

        Ok(all_sessions)
    }

    /// 获取适配器能力
    pub async fn get_capabilities(
        &self,
        provider: ProviderKind,
    ) -> ProviderResult<crate::adapter::ProviderCapabilities> {
        let adapter = self.get_adapter(provider).await?;

        Ok(adapter.capabilities())
    }

    /// 回滚会话
    pub async fn rollback_conversation(
        &self,
        thread_id: &str,
        num_turns: u32,
        provider: ProviderKind,
    ) -> ProviderResult<()> {
        let adapter = self.get_adapter(provider).await?;

        adapter.rollback_conversation(thread_id, num_turns).await
    }

    /// 压缩上下文
    pub async fn compact_thread(&self, thread_id: &str, provider: ProviderKind) -> ProviderResult<()> {
        let adapter = self.get_adapter(provider).await?;

        adapter.compact_thread(thread_id).await
    }

    /// 订阅 Provider 事件
    pub fn stream_events(&self) -> broadcast::Receiver<ProviderRuntimeEvent> {
        self.event_tx.subscribe()
    }

    /// 广播 Provider 事件
    pub fn broadcast_event(&self, event: ProviderRuntimeEvent) {
        let _ = self.event_tx.send(event);
    }
}

impl Default for ProviderService {
    fn default() -> Self {
        Self::new()
    }
}
