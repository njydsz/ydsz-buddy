//! Core error types for Remi Code.

use thiserror::Error;

/// The main error type for Remi Code operations.
#[derive(Error, Debug, Clone)]
pub enum Error {
    /// Configuration error.
    #[error("configuration error: {0}")]
    Config(String),

    /// Database error.
    #[error("database error: {0}")]
    Database(String),

    /// I/O error.
    #[error("I/O error: {0}")]
    Io(String),

    /// Serialization error.
    #[error("serialization error: {0}")]
    Serialization(String),

    /// Authentication error.
    #[error("authentication error: {0}")]
    Auth(String),

    /// Provider error.
    #[error("provider error: {0}")]
    Provider(String),

    /// Git error.
    #[error("git error: {0}")]
    Git(String),

    /// Workspace error.
    #[error("workspace error: {0}")]
    Workspace(String),

    /// Orchestration error.
    #[error("orchestration error: {0}")]
    Orchestration(String),

    /// Internal error.
    #[error("internal error: {0}")]
    Internal(String),
}

impl From<std::io::Error> for Error {
    fn from(err: std::io::Error) -> Self {
        Self::Io(err.to_string())
    }
}

impl From<serde_json::Error> for Error {
    fn from(err: serde_json::Error) -> Self {
        Self::Serialization(err.to_string())
    }
}

impl From<figment::Error> for Error {
    fn from(err: figment::Error) -> Self {
        Self::Config(err.to_string())
    }
}

/// Result type alias using the core Error type.
pub type Result<T, E = Error> = std::result::Result<T, E>;
