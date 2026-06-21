//! Provider session directory module

use std::collections::HashMap;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;
use tracing::{debug, warn};

use remi_core::provider::ProviderKind;
use remi_core::models::RuntimeMode;
use crate::error::{ProviderError, ProviderResult};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SessionStatus {
    Starting,
    Running,
    Stopped,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = camelCase)]
pub struct ProviderRuntimeBinding {
    pub thread_id: String,
    pub provider: ProviderKind,
    pub adapter_key: String,
    pub runtime_mode: RuntimeMode,
    pub status: SessionStatus,
    pub last_seen_at: String,
    pub resume_cursor: Option<String>,
    pub runtime_payload: Option<serde_json::Value>,
}

pub struct ProviderSessionDirectory {
    bindings: Arc<RwLock<HashMap<String, ProviderRuntimeBinding>>>,
}

impl ProviderSessionDirectory {
    pub fn new() -> Self {
        Self { bindings: Arc::new(RwLock::new(HashMap::new())) }
    }

    pub async fn get_binding(&self, thread_id: &str) -> ProviderResult<Option<ProviderRuntimeBinding>> {
        let bindings = self.bindings.read().await;
        Ok(bindings.get(thread_id).cloned())
    }

    pub async fn get_provider(&self, thread_id: &str) -> ProviderResult<ProviderKind> {
        let binding = self.get_binding(thread_id).await?
            .ok_or_else(|| ProviderError::SessionNotFound(format!(Provider binding not found for thread {}, thread_id)))?;
        Ok(binding.provider)
    }

    pub async fn upsert(&self, binding: ProviderRuntimeBinding) -> ProviderResult<()> {
        let thread_id = binding.thread_id.clone();
        let mut bindings = self.bindings.write().await;
        debug!(Updating session binding: thread_id={}, provider={:?}, thread_id, binding.provider);
        bindings.insert(thread_id, binding);
        Ok(())
    }

    pub async fn remove(&self, thread_id: &str) -> ProviderResult<()> {
        let mut bindings = self.bindings.write().await;
        if bindings.remove(thread_id).is_some() {
            debug!(Deleted session binding: thread_id={}, thread_id);
        } else {
            warn!(Attempted to delete non-existent session binding: thread_id={}, thread_id);
        }
        Ok(())
    }

    pub async fn list_thread_ids(&self) -> ProviderResult<Vec<String>> {
        let bindings = self.bindings.read().await;
        Ok(bindings.keys().cloned().collect())
    }

    pub async fn list_bindings(&self) -> ProviderResult<Vec<ProviderRuntimeBinding>> {
        let bindings = self.bindings.read().await;
        Ok(bindings.values().cloned().collect())
    }

    pub async fn update_status(&self, thread_id: &str, status: SessionStatus) -> ProviderResult<()> {
        let mut bindings = self.bindings.write().await;
        if let Some(binding) = bindings.get_mut(thread_id) {
            binding.status = status;
            binding.last_seen_at = chrono::Utc::now().to_rfc3339();
            debug!(Updated session status: thread_id={}, status={:?}, thread_id, status);
            Ok(())
        } else {
            Err(ProviderError::SessionNotFound(format!(Session binding not found for thread {}, thread_id)))
        }
    }

    pub async fn update_resume_cursor(&self, thread_id: &str, cursor: Option<String>) -> ProviderResult<()> {
        let mut bindings = self.bindings.write().await;
        if let Some(binding) = bindings.get_mut(thread_id) {
            binding.resume_cursor = cursor;
            binding.last_seen_at = chrono::Utc::now().to_rfc3339();
            debug!(Updated resume cursor: thread_id={}, thread_id);
            Ok(())
        } else {
            Err(ProviderError::SessionNotFound(format!(Session binding not found for thread {}, thread_id)))
        }
    }

    pub async fn update_runtime_payload(&self, thread_id: &str, payload: Option<serde_json::Value>) -> ProviderResult<()> {
        let mut bindings = self.bindings.write().await;
        if let Some(binding) = bindings.get_mut(thread_id) {
            if let Some(new_payload) = payload {
                if let Some(existing) = &mut binding.runtime_payload {
                    if let (Some(existing_obj), Some(new_obj)) = (existing.as_object_mut(), new_payload.as_object()) {
                        for (k, v) in new_obj { existing_obj.insert(k.clone(), v.clone()); }
                    } else { binding.runtime_payload = Some(new_payload); }
                } else { binding.runtime_payload = Some(new_payload); }
            }
            binding.last_seen_at = chrono::Utc::now().to_rfc3339();
            debug!(Updated runtime payload: thread_id={}, thread_id);
            Ok(())
        } else {
            Err(ProviderError::SessionNotFound(format!(Session binding not found for thread {}, thread_id)))
        }
    }

    pub async fn cleanup_stale_sessions(&self, max_age_seconds: i64) -> ProviderResult<usize> {
        let mut bindings = self.bindings.write().await;
        let now = chrono::Utc::now();
        let mut removed = 0;
        bindings.retain(|thread_id, binding| {
            if let Ok(last_seen) = chrono::DateTime::parse_from_rfc3339(&binding.last_seen_at) {
                let age = now.signed_duration_since(last_seen);
                if age.num_seconds() > max_age_seconds {
                    debug!(Cleaning up expired session: thread_id={}, age={}s, thread_id, age.num_seconds());
                    removed += 1;
                    return false;
                }
            }
            true
        });
        if removed > 0 { debug!(Cleaned up {} expired sessions, removed); }
        Ok(removed)
    }
}

impl Default for ProviderSessionDirectory {
    fn default() -> Self { Self::new() }
}