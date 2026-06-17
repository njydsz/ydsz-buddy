//! Server configuration types.

use figment::{Figment, providers::{Env, Format, Toml}};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Server configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    /// Server host to bind to.
    #[serde(default = "default_host")]
    pub host: String,

    /// Server port to listen on.
    #[serde(default = "default_port")]
    pub port: u16,

    /// Path to the SQLite database file.
    #[serde(default = "default_db_path")]
    pub db_path: PathBuf,

    /// Path to the data directory.
    #[serde(default = "default_data_dir")]
    pub data_dir: PathBuf,

    /// Authentication token (optional).
    #[serde(default)]
    pub auth_token: Option<String>,

    /// Enable development mode.
    #[serde(default)]
    pub dev_mode: bool,

    /// Runtime mode.
    #[serde(default = "default_runtime_mode")]
    pub runtime_mode: RuntimeMode,

    /// Log level.
    #[serde(default = "default_log_level")]
    pub log_level: String,
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            host: default_host(),
            port: default_port(),
            db_path: default_db_path(),
            data_dir: default_data_dir(),
            auth_token: None,
            dev_mode: false,
            runtime_mode: default_runtime_mode(),
            log_level: default_log_level(),
        }
    }
}

impl ServerConfig {
    /// Load configuration from environment variables and config file.
    pub fn load() -> crate::Result<Self> {
        let figment = Figment::new()
            .merge(Toml::file("remi-code.toml").nested().optional())
            .merge(Env::prefixed("REMI_CODE_"));

        figment.extract().map_err(Into::into)
    }

    /// Load configuration with a specific config file path.
    pub fn load_from(path: impl AsRef<std::path::Path>) -> crate::Result<Self> {
        let figment = Figment::new()
            .merge(Toml::file(path.as_ref()).nested().optional())
            .merge(Env::prefixed("REMI_CODE_"));

        figment.extract().map_err(Into::into)
    }
}

/// Runtime mode for the server.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum RuntimeMode {
    /// Server mode (default).
    #[default]
    Server,
    /// Desktop mode.
    Desktop,
    /// Development mode.
    Dev,
}

fn default_host() -> String {
    "127.0.0.1".to_string()
}

fn default_port() -> u16 {
    3845
}

fn default_db_path() -> PathBuf {
    PathBuf::from("remi-code.db")
}

fn default_data_dir() -> PathBuf {
    PathBuf::from(".remi-code")
}

fn default_runtime_mode() -> RuntimeMode {
    RuntimeMode::Server
}

fn default_log_level() -> String {
    "info".to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = ServerConfig::default();
        assert_eq!(config.host, "127.0.0.1");
        assert_eq!(config.port, 3845);
        assert_eq!(config.runtime_mode, RuntimeMode::Server);
    }

    #[test]
    fn test_config_from_env() {
        std::env::set_var("REMI_CODE_PORT", "8080");
        let config = ServerConfig::load().expect("Failed to load config");
        assert_eq!(config.port, 8080);
        std::env::remove_var("REMI_CODE_PORT");
    }
}
