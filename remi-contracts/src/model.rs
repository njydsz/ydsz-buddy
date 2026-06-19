//! Model schemas.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// AI model identifier.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, JsonSchema)]
pub struct ModelId(pub String);

impl ModelId {
    /// Create a new model ID.
    pub fn new(id: impl Into<String>) -> Self {
        Self(id.into())
    }
}

impl std::fmt::Display for ModelId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        self.0.fmt(f)
    }
}

/// Model capabilities.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ModelCapabilities {
    /// Whether the model supports streaming.
    pub streaming: bool,
    /// Whether the model supports function calling.
    pub function_calling: bool,
    /// Whether the model supports vision.
    pub vision: bool,
    /// Maximum context length in tokens.
    pub max_context_length: u32,
    /// Maximum output length in tokens.
    pub max_output_length: u32,
}

/// Model information.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ModelInfo {
    /// Model ID.
    pub id: ModelId,
    /// Display name.
    pub name: String,
    /// Provider name.
    pub provider: String,
    /// Model capabilities.
    pub capabilities: ModelCapabilities,
}
