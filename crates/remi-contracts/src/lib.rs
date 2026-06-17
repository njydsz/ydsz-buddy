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
