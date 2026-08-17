// ydzs-provider: Provider service facade
use crate::models_registry::ModelRegistry;
use tokio::sync::broadcast;

// Re-export ydzs_core types to unify type identity across crates
pub use ydsz_core::provider::ProviderRuntimeEvent;
pub use ydsz_core::provider::ProviderKind;
pub use ydsz_core::provider::ProviderSessionStartInput;
pub use ydsz_core::provider::TurnInput;

/// Provider service facade
pub struct ProviderService {
    registry: ModelRegistry,
}

impl ProviderService {
    pub fn new() -> Self {
        Self {
            registry: ModelRegistry::new(),
        }
    }

    pub fn registry(&self) -> &ModelRegistry {
        &self.registry
    }

    pub async fn start_session(
        &self,
        _thread_id: &str,
        _input: ProviderSessionStartInput,
    ) -> anyhow::Result<()> {
        Ok(())
    }

    pub fn stream_events(&self) -> broadcast::Receiver<ProviderRuntimeEvent> {
        let (_tx, rx) = broadcast::channel(16);
        rx
    }

    pub async fn send_turn(&self, _input: TurnInput) -> anyhow::Result<()> {
        Ok(())
    }

    pub async fn stop_session(
        &self,
        _thread_id: &str,
        _provider: ProviderKind,
    ) -> anyhow::Result<()> {
        Ok(())
    }
}

impl Default for ProviderService {
    fn default() -> Self {
        Self::new()
    }
}
