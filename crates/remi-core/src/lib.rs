//! Core types and utilities for Remi Code.
//!
//! This crate contains shared types, error definitions, and configuration
//! structures used across all Remi Code crates.

pub mod config;
pub mod error;
pub mod types;

pub use config::{
    CorsConfig, DatabaseConfig, LogConfig, LogFormat, ProviderConfig, ProviderSettings,
    RuntimeMode, SecurityConfig, ServerConfig, ServerSettings,
};
pub use error::{Error, Result};
