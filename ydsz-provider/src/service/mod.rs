//! # Provider 服务
//!
//! 管理 Provider 会话生命周期，包括：
//! - 会话启动 / 停止
//! - Turn 执行（流式）
//! - 运行时事件广播
//! - 适配器工厂路由

use std::collections::HashMap;
use std::sync::Arc;

use tokio::sync::{broadcast, Mutex, RwLock};
use tracing::{info, warn, instrument};
use uuid::Uuid;

use ydsz_core::provider::{
    ProviderKind, ProviderRuntimeEvent, ProviderSessionStartInput, TurnInput,
};

use crate::adapters::{
    AdapterFactory, ProviderHealthStatus, TurnRequest,
};
use crate::http_client::EndpointConfig;
use crate::models_registry::ModelRegistry;

/// Provider 服务 - 对话运行时入口
///
/// 管理所有 AI Provider 的连接会话，向上层（Tauri / CLI / RPC）
/// 提供统一的会话启动、消息发送、事件订阅接口。
pub struct ProviderService {
    registry: Arc<RwLock<ModelRegistry>>,
    api_keys: Arc<RwLock<HashMap<ProviderKind, String>>>,
    base_urls: Arc<RwLock<HashMap<ProviderKind, String>>>,
    sessions: Arc<Mutex<HashMap<String, ProviderSessionHandle>>>,
    event_tx: broadcast::Sender<ProviderRuntimeEvent>,
}

/// 内部会话句柄
#[allow(dead_code)]
struct ProviderSessionHandle {
    session_id: String,
    provider: ProviderKind,
    model: String,
}

impl ProviderService {
    /// 创建新的 Provider 服务实例（预加载默认模型列表）
    pub fn new() -> Self {
        let (event_tx, _) = broadcast::channel(256);
        Self {
            registry: Arc::new(RwLock::new(ModelRegistry::with_defaults())),
            api_keys: Arc::new(RwLock::new(HashMap::new())),
            base_urls: Arc::new(RwLock::new(HashMap::new())),
            sessions: Arc::new(Mutex::new(HashMap::new())),
            event_tx,
        }
    }

    /// 获取模型只读引用
    pub async fn registry(&self) -> tokio::sync::RwLockReadGuard<'_, ModelRegistry> {
        self.registry.read().await
    }

    /// 配置 Provider 的 API Key
    pub async fn set_api_key(&self, kind: ProviderKind, api_key: impl Into<String>) {
        let mut keys = self.api_keys.write().await;
        keys.insert(kind, api_key.into());
        info!(provider=%kind, "API key configured");
    }

    /// 配置 Provider 的自定义 Base URL
    pub async fn set_base_url(&self, kind: ProviderKind, base_url: impl Into<String>) {
        let mut urls = self.base_urls.write().await;
        urls.insert(kind, base_url.into());
    }

    /// 启动 Provider 会话
    /// 
    /// 创建一个新的 Provider 会话，不做实际的 API 调用。
    /// 实际的 LLM 交互在 send_turn 时按需发起（无状态模式，
    /// 每次 Turn 携带完整上下文）。
    #[instrument(skip(self, input))]
    pub async fn start_session(
        &self,
        input: ProviderSessionStartInput,
    ) -> anyhow::Result<String> {
        let session_id = format!("sess-{}", Uuid::new_v4());

        // 检查 API Key 是否已配置
        let keys = self.api_keys.read().await;
        if !keys.contains_key(&input.provider) {
            anyhow::bail!(
                "Provider {:?} API key not configured. Call set_api_key() first.",
                input.provider
            );
        }
        drop(keys);

        // 生成 SessionStarted 事件
        let _ = self.event_tx.send(ProviderRuntimeEvent::SessionStarted {
            session_id: session_id.clone(),
            thread_id: input.thread_id.clone(),
        });

        // 记录会话
        let mut sessions = self.sessions.lock().await;
        sessions.insert(
            session_id.clone(),
            ProviderSessionHandle {
                session_id: session_id.clone(),
                provider: input.provider,
                model: input.model.clone(),
            },
        );

        info!(session_id=%session_id, provider=%input.provider, model=%input.model, "Session started");
        Ok(session_id)
    }

    /// 获取运行时事件接收器
    ///
    /// 每个 UI 组件调用此方法获得事件流的订阅。
    /// 事件包括：SessionStarted、TurnStarted、TurnDelta、TurnCompleted、Error 等。
    pub fn stream_events(&self) -> broadcast::Receiver<ProviderRuntimeEvent> {
        self.event_tx.subscribe()
    }

    /// 发送一轮对话（Turn）
    ///
    /// 流式调用 LLM API，实时广播 TurnDelta 事件。
    /// 
    /// ## 参数
    /// - `input`: Turn 输入（含 thread_id、turn_id、message）
    /// - `model`: 使用的模型名称
    /// - `system_prompt`: 系统提示词（可选）
    #[instrument(skip(self, input))]
    pub async fn send_turn(
        &self,
        input: TurnInput,
        model: Option<&str>,
        system_prompt: Option<&str>,
    ) -> anyhow::Result<String> {
        let keys = self.api_keys.read().await;
        let api_key = keys.get(&input.provider).cloned();
        let api_key = match api_key {
            Some(k) => k.clone(),
            None => anyhow::bail!("No API key for provider {:?}", input.provider),
        };
        drop(keys);

        // 确定 base URL
        let base_url = {
            let urls = self.base_urls.read().await;
            urls.get(&input.provider)
                .map(|s| s.clone())
                .unwrap_or_else(|| {
                    let default_url = AdapterFactory::default_base_url(input.provider);
                    default_url.to_string()
                })
        };

        // 创建适配器
        let endpoint = EndpointConfig::new(base_url, api_key);
        let adapter = AdapterFactory::create(input.provider, endpoint)
            .ok_or_else(|| anyhow::anyhow!("Provider {:?} not yet implemented", input.provider))?;

        // 构建 Turn 请求
        let turn_req = TurnRequest::from_turn_input(&input, model.unwrap_or(""))
            .with_system_prompt(system_prompt.unwrap_or("You are a helpful AI assistant."));

        // 获取 session_id
        let sessions = self.sessions.lock().await;
        let session_id = sessions
            .values()
            .find(|s| s.provider == input.provider)
            .map(|s| s.session_id.clone())
            .unwrap_or_else(|| format!("sess-{}", Uuid::new_v4()));
        drop(sessions);

        // 执行流式调用
        let result = adapter.stream_turn(&turn_req, &self.event_tx, &session_id).await;

        match result {
            Ok(text) => {
                info!(text_len=%text.len(), provider=%input.provider, "Turn completed successfully");
                
                // SessionIdle 事件
                let _ = self.event_tx.send(ProviderRuntimeEvent::SessionIdle {
                    session_id: session_id.clone(),
                    last_turn_id: Some(input.turn_id.clone()),
                });
                
                Ok(text)
            }
            Err(e) => {
                let _ = self.event_tx.send(ProviderRuntimeEvent::Error {
                    session_id: session_id.clone(),
                    error: format!("{}: {}", adapter.display_name(), e),
                });
                Err(e.into())
            }
        }
    }

    /// 停止 Provider 会话
    #[instrument(skip(self))]
    pub async fn stop_session(
        &self,
        session_id: &str,
    ) -> anyhow::Result<()> {
        let mut sessions = self.sessions.lock().await;
        if let Some(handle) = sessions.remove(session_id) {
            let _ = self.event_tx.send(ProviderRuntimeEvent::SessionStopped {
                session_id: handle.session_id.clone(),
            });
            info!(session_id=%session_id, "Session stopped");
            Ok(())
        } else {
            warn!(session_id=%session_id, "Session not found");
            anyhow::bail!("Session {session_id} not found")
        }
    }

    /// 检查指定 Provider 的连通性
    #[instrument(skip(self))]
    pub async fn check_health(&self, kind: ProviderKind) -> anyhow::Result<ProviderHealthStatus> {
        let keys = self.api_keys.read().await;
        let api_key = keys
            .get(&kind)
            .ok_or_else(|| anyhow::anyhow!("No API key for provider {kind:?}"))?
            .clone();
        drop(keys);

        let base_url = {
            let urls = self.base_urls.read().await;
            urls.get(&kind)
                .map(|s| s.clone())
                .unwrap_or_else(|| AdapterFactory::default_base_url(kind).to_string())
        };

        let endpoint = EndpointConfig::new(base_url, api_key);
        let adapter = AdapterFactory::create(kind, endpoint)
            .ok_or_else(|| anyhow::anyhow!("Provider {kind:?} not yet implemented"))?;

        Ok(adapter.check_health().await)
    }

    /// 获取已配置 API Key 的 Provider 列表
    pub async fn list_providers(&self) -> Vec<ProviderKind> {
        let keys = self.api_keys.read().await;
        keys.keys().copied().collect()
    }

    /// 获取 API Key 信息
    pub fn api_keys(&self) -> &Arc<RwLock<HashMap<ProviderKind, String>>> {
        &self.api_keys
    }

    /// 获取 Base URL 覆盖配置
    pub fn base_urls(&self) -> &Arc<RwLock<HashMap<ProviderKind, String>>> {
        &self.base_urls
    }
}

impl Default for ProviderService {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn new_service_has_no_sessions() {
        let svc = ProviderService::new();
        let sessions = svc.sessions.lock().await;
        assert!(sessions.is_empty());
    }

    #[tokio::test]
    async fn set_and_retrieve_api_key() {
        let svc = ProviderService::new();
        svc.set_api_key(ProviderKind::DeepSeek, "test-key-123").await;
        
        let providers = svc.list_providers().await;
        assert!(providers.contains(&ProviderKind::DeepSeek));
    }
}
