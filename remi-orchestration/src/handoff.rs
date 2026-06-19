//! Provider 会话切换逻辑。
//!
//! 切换层负责将用户轮次路由到 AI Provider，管理每个会话的
//! Provider 会话，并返回助手响应。

use remi_contracts::{ModelId, ThreadId};
use remi_core::{Error, Result};
use remi_providers::{ProviderDispatcher, ProviderRegistry};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use tracing::{info, warn};

/// 将会话 ID 映射到 Provider 会话 ID。
#[derive(Default)]
pub struct ProviderSessionMap {
    sessions: Mutex<HashMap<(ThreadId, String), String>>,
}

impl ProviderSessionMap {
    /// 创建一个新的空会话映射。
    pub fn new() -> Self {
        Self::default()
    }

    /// 获取指定会话/Provider 对的会话 ID（如存在）。
    pub async fn get(&self, thread_id: ThreadId, provider: &str) -> Option<String> {
        let sessions = self.sessions.lock().await;
        sessions.get(&(thread_id, provider.to_string())).cloned()
    }

    /// 设置指定会话/Provider 对的会话 ID。
    pub async fn set(&self, thread_id: ThreadId, provider: String, session_id: String) {
        let mut sessions = self.sessions.lock().await;
        sessions.insert((thread_id, provider), session_id);
    }

    /// 移除某个会话的所有 Provider 会话。
    pub async fn remove_thread(&self, thread_id: ThreadId) {
        let mut sessions = self.sessions.lock().await;
        sessions.retain(|(tid, _), _| *tid != thread_id);
    }
}

/// 将轮次路由到 Provider 的切换服务。
pub struct ProviderHandoff {
    registry: Arc<ProviderRegistry>,
    sessions: Arc<ProviderSessionMap>,
    /// 可选的调度器（failover/round-robin/priority）。
    /// 为 None 时使用简单的"第一个可用 Provider"策略。
    dispatcher: Option<Arc<ProviderDispatcher>>,
}

impl ProviderHandoff {
    /// 创建一个新的 Provider 切换服务。
    pub fn new(registry: Arc<ProviderRegistry>) -> Self {
        Self {
            registry,
            sessions: Arc::new(ProviderSessionMap::new()),
            dispatcher: None,
        }
    }

    /// 附加一个 Provider 调度器，启用多 Provider 路由策略。
    pub fn with_dispatcher(mut self, dispatcher: Arc<ProviderDispatcher>) -> Self {
        self.dispatcher = Some(dispatcher);
        self
    }

    /// 访问底层的 Provider 注册中心。
    pub fn registry(&self) -> &Arc<ProviderRegistry> {
        &self.registry
    }

    /// 选择一个 Provider（使用 dispatcher 或兜底到第一个可用）。
    async fn select_provider(&self) -> Result<Arc<dyn remi_providers::ProviderAdapter>> {
        if let Some(dispatcher) = &self.dispatcher {
            if let Some(adapter) = dispatcher.select().await {
                return Ok(adapter);
            }
        }
        let providers = self.registry.list();
        let info = providers
            .into_iter()
            .find(|p| p.available)
            .ok_or_else(|| Error::Provider("没有可用的 AI 服务。请配置 API 密钥。".to_string()))?;
        self.registry
            .get(&info.name)
            .ok_or_else(|| Error::Provider(format!("Provider 不存在: {}", info.name)))
    }

    /// 将用户消息路由到 Provider 并返回助手文本。
    pub async fn route(&self, thread_id: ThreadId, content: &str) -> Result<String> {
        let adapter = self.select_provider().await?;
        let provider_info = adapter.info();
        let provider_name = provider_info.name.to_string();

        let session_id = match self.sessions.get(thread_id, &provider_name).await {
            Some(session_id) => session_id,
            None => {
                let default_model = provider_info
                    .models
                    .first()
                    .cloned()
                    .unwrap_or_else(|| ModelId::new("claude-3-5-sonnet-20241022"));

                let new_session_id = adapter.start_session(&default_model).await.map_err(|e| {
                    Error::Provider(format!("启动 Provider 会话失败: {e}"))
                })?;

                info!(thread_id = %thread_id, provider = %provider_name, session_id = %new_session_id, "已启动 Provider 会话");
                self.sessions
                    .set(thread_id, provider_name.clone(), new_session_id.clone())
                    .await;
                new_session_id
            }
        };

        let response = adapter
            .send_message(&session_id, content)
            .await
            .map_err(|e| Error::Provider(format!("Provider 请求失败: {e}")))?;

        let response_text = response
            .get("response")
            .and_then(|r| r.as_str())
            .unwrap_or("Provider 未返回响应")
            .to_string();

        if response_text == "Provider 未返回响应" {
            warn!(thread_id = %thread_id, provider = %provider_name, "Provider 返回了空响应");
        }

        Ok(response_text)
    }

    /// 清除某个会话的 Provider 会话。
    pub async fn forget_thread(&self, thread_id: ThreadId) {
        self.sessions.remove_thread(thread_id).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use remi_providers::{ClaudeAdapter, ProviderRegistry};

    #[tokio::test]
    async fn test_session_map() {
        let map = ProviderSessionMap::new();
        let thread_id = ThreadId::new();

        assert!(map.get(thread_id, "claude").await.is_none());
        map.set(thread_id, "claude".to_string(), "session-1".to_string()).await;
        assert_eq!(map.get(thread_id, "claude").await.unwrap(), "session-1");

        map.remove_thread(thread_id).await;
        assert!(map.get(thread_id, "claude").await.is_none());
    }

    #[tokio::test]
    async fn test_handoff_without_providers() {
        let registry = Arc::new(ProviderRegistry::new());
        let handoff = ProviderHandoff::new(registry);
        let thread_id = ThreadId::new();

        let result = handoff.route(thread_id, "Hello").await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_handoff_with_unconfigured_provider() {
        let registry = Arc::new(ProviderRegistry::new());
        registry.register(Arc::new(ClaudeAdapter::new()));
        let handoff = ProviderHandoff::new(registry);
        let thread_id = ThreadId::new();

        // 未配置 API 密钥的 Claude 不可用，因此切换应失败。
        let result = handoff.route(thread_id, "Hello").await;
        assert!(result.is_err());
    }
}
