//! Schema definitions and RPC protocol for Remi Code.
//!
//! This crate serves as the single source of truth for all data schemas
//! and RPC method definitions. Types are defined using `schemars` for
//! JSON Schema generation and can be used to generate TypeScript types.

pub mod auth;
pub mod editor;
pub mod filesystem;
pub mod git;
pub mod model;
pub mod orchestration;
pub mod project;
pub mod provider;
pub mod rpc;
pub mod terminal;

pub use auth::*;
pub use editor::*;
pub use filesystem::*;
pub use git::*;
pub use model::*;
pub use orchestration::*;
pub use project::*;
pub use provider::*;
pub use rpc::*;
pub use terminal::*;

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// Unique identifier for a project.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, JsonSchema,
)]
pub struct ProjectId(pub uuid::Uuid);

impl ProjectId {
    /// Generate a new random project ID.
    pub fn new() -> Self {
        Self(uuid::Uuid::new_v4())
    }
}

impl Default for ProjectId {
    fn default() -> Self {
        Self::new()
    }
}

impl std::fmt::Display for ProjectId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// Unique identifier for a thread.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, JsonSchema,
)]
pub struct ThreadId(pub uuid::Uuid);

impl ThreadId {
    /// Generate a new random thread ID.
    pub fn new() -> Self {
        Self(uuid::Uuid::new_v4())
    }
}

impl Default for ThreadId {
    fn default() -> Self {
        Self::new()
    }
}

impl std::fmt::Display for ThreadId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}
