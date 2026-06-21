//! Provider adapter trait definition module

use async_trait::async_trait;
use remi_core::provider::{
    ProviderForkThreadInput, ProviderForkThreadResult, ProviderKind, ProviderRespondToRequestInput,
    ProviderRespondToUserInputInput, ProviderRuntimeEvent, ProviderSession,
    ProviderSessionStartInput, ProviderStartReviewInput, ProviderThreadSnapshot,
    ProviderTurnStartResult, TurnInput,
};
use serde::{Deserialize, Serialize};
use tokio::sync::broadcast;

use crate::error::ProviderResult;

/// Provider adapter capabilities
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderCapabilities {
    /// Session model switch mode
    pub session_model_switch: SessionModelSwitchMode,
    /// Supports skill mentions
    pub supports_skill_mentions: bool,
    /// Supports skill discovery
    pub supports_skill_discovery: bool,
    /// Supports native slash command discovery
    pub supports_native_slash_command_discovery: bool,
    /// Supports plugin mentions
    #[serde(default)]
    pub supports_plugin_mentions: bool,
    /// Supports plugin discovery
    #[serde(default)]
    pub supports_plugin_discovery: bool,
    /// Supports runtime model list
    pub supports_runtime_model_list: bool,
    /// Supports turn steering
    pub supports_turn_steering: bool,
    /// Supports thread compaction
    #[serde(default)]
    pub supports_thread_compaction: bool,
    /// Supports thread import
    #[serde(default)]
    pub supports_thread_import: bool,
}

/// Session model switch mode
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum SessionModelSwitchMode {
    /// In-session switch
    InSession,
    /// Restart session required
    RestartSession,
    /// Unsupported
    Unsupported,
}

/// Provider adapter trait
#[async_trait]
pub trait ProviderAdapter: Send + Sync {
    /// Get provider kind
    fn provider_kind(&self) -> ProviderKind;

    /// Get capabilities
    fn capabilities(&self) -> ProviderCapabilities;

    /// Start a new session
    async fn start_session(&self, input: ProviderSessionStartInput) -> ProviderResult<ProviderSession>;

    /// Send a turn
    async fn send_turn(&self, input: TurnInput) -> ProviderResult<ProviderTurnStartResult>;

    /// Steer a turn
    async fn steer_turn(&self, _input: TurnInput) -> ProviderResult<ProviderTurnStartResult> {
        Err(crate::error::ProviderError::UnsupportedOperation("steer_turn not supported".to_string()))
    }

    /// Interrupt a turn
    async fn interrupt_turn(&self, thread_id: &str, turn_id: Option<&str>) -> ProviderResult<()>;

    /// Stop a session
    async fn stop_session(&self, thread_id: &str) -> ProviderResult<()>;

    /// Stop all sessions
    async fn stop_all(&self) -> ProviderResult<()>;

    /// List sessions
    async fn list_sessions(&self) -> ProviderResult<Vec<ProviderSession>>;

    /// Check if session exists
    async fn has_session(&self, thread_id: &str) -> ProviderResult<bool>;

    /// Rollback conversation
    async fn rollback_conversation(&self, _thread_id: &str, _num_turns: u32) -> ProviderResult<()> {
        Err(crate::error::ProviderError::UnsupportedOperation("rollback_conversation not supported".to_string()))
    }

    /// Compact thread
    async fn compact_thread(&self, _thread_id: &str) -> ProviderResult<()> {
        Err(crate::error::ProviderError::UnsupportedOperation("compact_thread not supported".to_string()))
    }

    /// Stream events
    async fn stream_events(&self) -> ProviderResult<broadcast::Receiver<ProviderRuntimeEvent>>;

    /// List skills
    async fn list_skills(&self, _input: remi_core::provider::ProviderListSkillsInput) -> ProviderResult<remi_core::provider::ProviderListSkillsResult> {
        Err(crate::error::ProviderError::UnsupportedOperation("list_skills not supported".to_string()))
    }

    /// List commands
    async fn list_commands(&self, _input: remi_core::provider::ProviderListCommandsInput) -> ProviderResult<remi_core::provider::ProviderListCommandsResult> {
        Err(crate::error::ProviderError::UnsupportedOperation("list_commands not supported".to_string()))
    }

    /// List models
    async fn list_models(&self, _input: remi_core::provider::ProviderListModelsInput) -> ProviderResult<remi_core::provider::ProviderListModelsResult> {
        Ok(crate::catalog::default_models_for(self.provider_kind()))
    }

    /// List agents
    async fn list_agents(&self) -> ProviderResult<remi_core::provider::ProviderListAgentsResult> {
        Ok(crate::catalog::default_agents_for(self.provider_kind()))
    }

    /// List plugins
    async fn list_plugins(&self, _input: remi_core::provider::ProviderListPluginsInput) -> ProviderResult<remi_core::provider::ProviderListPluginsResult> {
        Err(crate::error::ProviderError::UnsupportedOperation("list_plugins not supported".to_string()))
    }

    /// Read plugin
    async fn read_plugin(&self, _input: remi_core::provider::ProviderReadPluginInput) -> ProviderResult<remi_core::provider::ProviderReadPluginResult> {
        Err(crate::error::ProviderError::UnsupportedOperation("read_plugin not supported".to_string()))
    }

    /// Get composer capabilities
    async fn get_composer_capabilities(&self) -> ProviderResult<ProviderCapabilities> {
        Ok(self.capabilities())
    }

    /// Start review
    async fn start_review(&self, _input: ProviderStartReviewInput) -> ProviderResult<ProviderTurnStartResult> {
        Err(crate::error::ProviderError::UnsupportedOperation("start_review not supported".to_string()))
    }

    /// Respond to request
    async fn respond_to_request(&self, _input: ProviderRespondToRequestInput) -> ProviderResult<()> {
        Err(crate::error::ProviderError::UnsupportedOperation("respond_to_request not supported".to_string()))
    }

    /// Respond to user input
    async fn respond_to_user_input(&self, _input: ProviderRespondToUserInputInput) -> ProviderResult<()> {
        Err(crate::error::ProviderError::UnsupportedOperation("respond_to_user_input not supported".to_string()))
    }

    /// Fork thread
    async fn fork_thread(&self, _input: ProviderForkThreadInput) -> ProviderResult<ProviderForkThreadResult> {
        Err(crate::error::ProviderError::UnsupportedOperation("fork_thread not supported".to_string()))
    }

    /// Read thread snapshot
    async fn read_thread(&self, _thread_id: &str) -> ProviderResult<ProviderThreadSnapshot> {
        Err(crate::error::ProviderError::UnsupportedOperation("read_thread not supported".to_string()))
    }
}
