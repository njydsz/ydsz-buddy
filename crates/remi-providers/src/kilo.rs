//! Kilo provider adapter.
//!
//! Kilo is a local CLI agent. This adapter discovers the `kilo` executable
//! and will eventually speak its native protocol over stdio. The runtime
//! implementation is intentionally left as a stub until the upstream protocol
//! is stable enough to harden.

use crate::errors::ProviderAdapterError;
use crate::traits::ProviderAdapter;
use dashmap::DashMap;
use futures::Stream;
use remi_contracts::{
    ModelId, ProviderHealth, ProviderHealthStatus, ProviderInfo, ProviderName,
};
use remi_core::Result;
use serde_json::Value;
use std::pin::Pin;
use std::sync::Arc;
use tracing::{info, warn};
use uuid::Uuid;

/// Kilo session state.
#[derive(Clone)]
#[allow(dead_code)]
struct KiloSession {
    id: String,
    model: String,
}

/// Kilo provider adapter.
pub struct KiloAdapter {
    executable: Option<String>,
    sessions: Arc<DashMap<String, KiloSession>>,
}

impl KiloAdapter {
    /// Create a new Kilo adapter, probing for the `kilo` executable.
    pub fn new() -> Self {
        let executable = find_kilo_executable();
        Self {
            executable,
            sessions: Arc::new(DashMap::new()),
        }
    }

    /// Returns true if the Kilo executable is available.
    fn is_configured(&self) -> bool {
        self.executable.is_some()
    }
}

impl Default for KiloAdapter {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait::async_trait]
impl ProviderAdapter for KiloAdapter {
    fn info(&self) -> ProviderInfo {
        ProviderInfo {
            name: ProviderName::Kilo,
            display_name: "Kilo".to_string(),
            models: vec![ModelId::new("kilo-default")],
            available: self.is_configured(),
        }
    }

    async fn health(&self) -> Result<ProviderHealth> {
        if !self.is_configured() {
            return Ok(ProviderHealth {
                provider: ProviderName::Kilo,
                status: ProviderHealthStatus::Unhealthy,
                last_checked: chrono::Utc::now().to_rfc3339(),
                error: Some("kilo executable not found on PATH".to_string()),
            });
        }

        Ok(ProviderHealth {
            provider: ProviderName::Kilo,
            status: ProviderHealthStatus::Healthy,
            last_checked: chrono::Utc::now().to_rfc3339(),
            error: None,
        })
    }

    async fn start_session(&self, model: &ModelId) -> Result<String> {
        if !self.is_configured() {
            return Err(ProviderAdapterError::NotConfigured(ProviderName::Kilo).into());
        }

        let session_id = Uuid::new_v4().to_string();
        let session = KiloSession {
            id: session_id.clone(),
            model: model.0.clone(),
        };

        self.sessions.insert(session_id.clone(), session);
        info!(session_id = %session_id, model = %model, "Started Kilo session");

        Ok(session_id)
    }

    async fn send_message(&self, session_id: &str, _message: &str) -> Result<Value> {
        if !self.is_configured() {
            return Err(ProviderAdapterError::NotConfigured(ProviderName::Kilo).into());
        }

        if self.sessions.get(session_id).is_none() {
            return Err(ProviderAdapterError::SessionNotFound(session_id.to_string()).into());
        }

        warn!("Kilo send_message is not yet implemented");
        Err(ProviderAdapterError::Internal("Kilo adapter not yet implemented".to_string()).into())
    }

    async fn stream_response(
        &self,
        session_id: &str,
        _message: &str,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<String>> + Send>>> {
        if !self.is_configured() {
            return Err(ProviderAdapterError::NotConfigured(ProviderName::Kilo).into());
        }

        if self.sessions.get(session_id).is_none() {
            return Err(ProviderAdapterError::SessionNotFound(session_id.to_string()).into());
        }

        warn!("Kilo stream_response is not yet implemented");
        Err(ProviderAdapterError::Internal("Kilo adapter not yet implemented".to_string()).into())
    }

    async fn close_session(&self, session_id: &str) -> Result<()> {
        self.sessions.remove(session_id);
        info!(session_id = %session_id, "Closed Kilo session");
        Ok(())
    }
}

/// Search for the `kilo` executable on PATH.
fn find_kilo_executable() -> Option<String> {
    let candidates = ["kilo", "kilo.exe"];
    let path_var = std::env::var_os("PATH")?;

    for candidate in &candidates {
        for dir in std::env::split_paths(&path_var) {
            let full_path = dir.join(candidate);
            if full_path.is_file() {
                return Some(full_path.to_string_lossy().to_string());
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_kilo_session_lifecycle() {
        let adapter = KiloAdapter::new();
        let model = ModelId::new("kilo-default");

        let result = adapter.start_session(&model).await;
        if adapter.is_configured() {
            let session_id = result.unwrap();
            adapter.close_session(&session_id).await.unwrap();
        } else {
            assert!(result.is_err());
        }
    }
}
