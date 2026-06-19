//! Provider handoff logic.
//!
//! The handoff layer is responsible for routing a user turn to an AI
//! provider, managing provider sessions per thread, and returning the
//! assistant response.

use remi_contracts::{ModelId, ThreadId};
use remi_core::{Error, Result};
use remi_providers::ProviderRegistry;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use tracing::{info, warn};

/// Maps thread IDs to provider session IDs.
#[derive(Default)]
pub struct ProviderSessionMap {
    sessions: Mutex<HashMap<(ThreadId, String), String>>,
}

impl ProviderSessionMap {
    /// Create a new empty session map.
    pub fn new() -> Self {
        Self::default()
    }

    /// Get the session ID for a thread/provider pair, if one exists.
    pub async fn get(&self, thread_id: ThreadId, provider: &str) -> Option<String> {
        let sessions = self.sessions.lock().await;
        sessions.get(&(thread_id, provider.to_string())).cloned()
    }

    /// Set the session ID for a thread/provider pair.
    pub async fn set(&self, thread_id: ThreadId, provider: String, session_id: String) {
        let mut sessions = self.sessions.lock().await;
        sessions.insert((thread_id, provider), session_id);
    }

    /// Remove all sessions for a thread.
    pub async fn remove_thread(&self, thread_id: ThreadId) {
        let mut sessions = self.sessions.lock().await;
        sessions.retain(|(tid, _), _| *tid != thread_id);
    }
}

/// Handoff service that routes turns to providers.
pub struct ProviderHandoff {
    registry: Arc<ProviderRegistry>,
    sessions: Arc<ProviderSessionMap>,
}

impl ProviderHandoff {
    /// Create a new provider handoff service.
    pub fn new(registry: Arc<ProviderRegistry>) -> Self {
        Self {
            registry,
            sessions: Arc::new(ProviderSessionMap::new()),
        }
    }

    /// Route a user message to a provider and return the assistant text.
    pub async fn route(&self, thread_id: ThreadId, content: &str) -> Result<String> {
        let providers = self.registry.list();
        let provider_info = providers
            .into_iter()
            .find(|p| p.available)
            .ok_or_else(|| Error::Provider("No AI provider is available. Please configure an API key.".to_string()))?;

        let adapter = self
            .registry
            .get(&provider_info.name)
            .ok_or_else(|| Error::Provider(format!("Provider not found: {}", provider_info.name)))?;

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
                    Error::Provider(format!("Failed to start provider session: {e}"))
                })?;

                info!(thread_id = %thread_id, provider = %provider_name, session_id = %new_session_id, "Started provider session");
                self.sessions
                    .set(thread_id, provider_name.clone(), new_session_id.clone())
                    .await;
                new_session_id
            }
        };

        let response = adapter
            .send_message(&session_id, content)
            .await
            .map_err(|e| Error::Provider(format!("Provider request failed: {e}")))?;

        let response_text = response
            .get("response")
            .and_then(|r| r.as_str())
            .unwrap_or("No response from provider")
            .to_string();

        if response_text == "No response from provider" {
            warn!(thread_id = %thread_id, provider = %provider_name, "Provider returned empty response");
        }

        Ok(response_text)
    }

    /// Drop provider sessions for a thread.
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

        // Claude without API key is unavailable, so handoff should fail.
        let result = handoff.route(thread_id, "Hello").await;
        assert!(result.is_err());
    }
}
