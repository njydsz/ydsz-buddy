//! Provider adapter trait definitions.

use futures::Stream;
use remi_contracts::{
    ModelId, ProviderHealth, ProviderInfo, ProviderListCommandsInput,
    ProviderListCommandsOutput, ProviderName,
};
use remi_core::Result;
use serde_json::Value;
use std::pin::Pin;

/// Provider adapter trait.
///
/// Implementations abstract over provider-specific communication details
/// (HTTP, stdio JSON-RPC, local SDK, etc.) and expose a unified interface
/// for the orchestration layer.
#[async_trait::async_trait]
pub trait ProviderAdapter: Send + Sync {
    /// Get provider information.
    fn info(&self) -> ProviderInfo;

    /// Check provider health.
    async fn health(&self) -> Result<ProviderHealth>;

    /// Start a session.
    async fn start_session(&self, model: &ModelId) -> Result<String>;

    /// Send a message to a session.
    async fn send_message(&self, session_id: &str, message: &str) -> Result<Value>;

    /// Stream a response from a session.
    async fn stream_response(
        &self,
        session_id: &str,
        message: &str,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<String>> + Send>>>;

    /// Close a session.
    async fn close_session(&self, session_id: &str) -> Result<()>;

    /// List provider-native slash commands (e.g. `/explain`, `/test`).
    ///
    /// The default implementation returns an empty list: HTTP-only providers
    /// (Claude/Codex/Gemini/Grok) and most stdio adapters do not expose
    /// their own command vocabulary. The Cursor adapter and any future
    /// agent that exposes native commands should override this method.
    async fn list_commands(
        &self,
        _input: ProviderListCommandsInput,
    ) -> Result<ProviderListCommandsOutput> {
        Ok(ProviderListCommandsOutput {
            commands: Vec::new(),
            source: Some(self.info().name.to_string()),
            cached: Some(false),
        })
    }

    /// Return the provider name (shortcut for `info().name`).
    fn name(&self) -> ProviderName {
        self.info().name
    }
}
