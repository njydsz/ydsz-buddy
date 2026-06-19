//! Server configuration types.

use figment::{
    Figment,
    providers::{Env, Format, Toml},
};
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

    /// Log configuration.
    #[serde(default)]
    pub log: LogConfig,

    /// Server configuration.
    #[serde(default)]
    pub server: ServerSettings,

    /// Database configuration.
    #[serde(default)]
    pub database: DatabaseConfig,

    /// CORS configuration.
    #[serde(default)]
    pub cors: CorsConfig,

    /// Security configuration.
    #[serde(default)]
    pub security: SecurityConfig,

    /// Provider configuration.
    #[serde(default)]
    pub providers: ProviderConfig,
}

/// Log configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogConfig {
    /// Log level (trace, debug, info, warn, error).
    #[serde(default = "default_log_level")]
    pub level: String,

    /// Log format (json, pretty).
    #[serde(default = "default_log_format")]
    pub format: LogFormat,

    /// Log file path (optional, logs to stdout if not set).
    #[serde(default)]
    pub file: Option<PathBuf>,

    /// Enable ANSI colors in logs.
    #[serde(default = "default_true")]
    pub ansi: bool,
}

/// Log format.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum LogFormat {
    /// JSON format.
    #[default]
    Json,
    /// Pretty print format.
    Pretty,
}

/// Server settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerSettings {
    /// Request timeout in seconds.
    #[serde(default = "default_request_timeout")]
    pub request_timeout_secs: u64,

    /// Maximum concurrent connections.
    #[serde(default = "default_max_connections")]
    pub max_connections: usize,

    /// Enable graceful shutdown.
    #[serde(default = "default_true")]
    pub graceful_shutdown: bool,

    /// Shutdown timeout in seconds.
    #[serde(default = "default_shutdown_timeout")]
    pub shutdown_timeout_secs: u64,
}

/// Database configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseConfig {
    /// Maximum connection pool size.
    #[serde(default = "default_max_db_connections")]
    pub max_connections: u32,

    /// Minimum connection pool size.
    #[serde(default = "default_min_db_connections")]
    pub min_connections: u32,

    /// Connection timeout in seconds.
    #[serde(default = "default_connect_timeout")]
    pub connect_timeout_secs: u64,

    /// Idle timeout in seconds.
    #[serde(default = "default_idle_timeout")]
    pub idle_timeout_secs: u64,

    /// Enable WAL mode.
    #[serde(default = "default_true")]
    pub wal_mode: bool,
}

/// CORS configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CorsConfig {
    /// Allowed origins.
    #[serde(default = "default_cors_origins")]
    pub allowed_origins: Vec<String>,

    /// Allowed methods.
    #[serde(default = "default_cors_methods")]
    pub allowed_methods: Vec<String>,

    /// Allowed headers.
    #[serde(default = "default_cors_headers")]
    pub allowed_headers: Vec<String>,

    /// Allow credentials.
    #[serde(default)]
    pub allow_credentials: bool,

    /// Max age in seconds.
    #[serde(default = "default_cors_max_age")]
    pub max_age_secs: u64,
}

/// Security configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityConfig {
    /// Path to secret key file.
    #[serde(default)]
    pub secret_key_path: Option<PathBuf>,

    /// Session token expiration in hours.
    #[serde(default = "default_session_expiry")]
    pub session_expiry_hours: u64,

    /// Pairing code expiration in minutes.
    #[serde(default = "default_pairing_expiry")]
    pub pairing_expiry_minutes: u64,

    /// Enable rate limiting.
    #[serde(default = "default_true")]
    pub rate_limiting: bool,

    /// Maximum requests per minute.
    #[serde(default = "default_rate_limit")]
    pub max_requests_per_minute: u32,
}

/// Provider configuration.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ProviderConfig {
    /// Default provider.
    #[serde(default)]
    pub default_provider: Option<String>,

    /// Provider-specific configurations.
    #[serde(default)]
    pub providers: std::collections::HashMap<String, ProviderSettings>,
}

/// Individual provider settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderSettings {
    /// API key (if required).
    #[serde(default)]
    pub api_key: Option<String>,

    /// API endpoint.
    #[serde(default)]
    pub endpoint: Option<String>,

    /// Model to use.
    #[serde(default)]
    pub model: Option<String>,

    /// Request timeout in seconds.
    #[serde(default = "default_provider_timeout")]
    pub timeout_secs: u64,

    /// Maximum retry attempts.
    #[serde(default = "default_max_retries")]
    pub max_retries: u32,
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
            log: LogConfig::default(),
            server: ServerSettings::default(),
            database: DatabaseConfig::default(),
            cors: CorsConfig::default(),
            security: SecurityConfig::default(),
            providers: ProviderConfig::default(),
        }
    }
}

impl Default for LogConfig {
    fn default() -> Self {
        Self {
            level: default_log_level(),
            format: default_log_format(),
            file: None,
            ansi: default_true(),
        }
    }
}

impl Default for ServerSettings {
    fn default() -> Self {
        Self {
            request_timeout_secs: default_request_timeout(),
            max_connections: default_max_connections(),
            graceful_shutdown: default_true(),
            shutdown_timeout_secs: default_shutdown_timeout(),
        }
    }
}

impl Default for DatabaseConfig {
    fn default() -> Self {
        Self {
            max_connections: default_max_db_connections(),
            min_connections: default_min_db_connections(),
            connect_timeout_secs: default_connect_timeout(),
            idle_timeout_secs: default_idle_timeout(),
            wal_mode: default_true(),
        }
    }
}

impl Default for CorsConfig {
    fn default() -> Self {
        Self {
            allowed_origins: default_cors_origins(),
            allowed_methods: default_cors_methods(),
            allowed_headers: default_cors_headers(),
            allow_credentials: false,
            max_age_secs: default_cors_max_age(),
        }
    }
}

impl Default for SecurityConfig {
    fn default() -> Self {
        Self {
            secret_key_path: None,
            session_expiry_hours: default_session_expiry(),
            pairing_expiry_minutes: default_pairing_expiry(),
            rate_limiting: default_true(),
            max_requests_per_minute: default_rate_limit(),
        }
    }
}

impl ServerConfig {
    /// Load configuration from environment variables and config file.
    pub fn load() -> crate::Result<Self> {
        let mut figment = Figment::new().merge(Env::prefixed("REMI_CODE_"));

        let config_path = PathBuf::from("remi-code.toml");
        if config_path.exists() {
            figment = figment.merge(Toml::file(&config_path).nested());
        }

        let config: Self = figment.extract().map_err(crate::Error::from)?;
        config.validate()?;
        Ok(config)
    }

    /// Load configuration with a specific config file path.
    pub fn load_from(path: impl AsRef<std::path::Path>) -> crate::Result<Self> {
        let mut figment = Figment::new().merge(Env::prefixed("REMI_CODE_"));

        if path.as_ref().exists() {
            figment = figment.merge(Toml::file(path.as_ref()).nested());
        }

        let config: Self = figment.extract().map_err(crate::Error::from)?;
        config.validate()?;
        Ok(config)
    }

    /// Validate configuration.
    pub fn validate(&self) -> crate::Result<()> {
        if self.port == 0 {
            return Err(crate::Error::Config("Port must be greater than 0".to_string()));
        }

        if self.server.request_timeout_secs == 0 {
            return Err(crate::Error::Config("Request timeout must be greater than 0".to_string()));
        }

        if self.database.max_connections == 0 {
            return Err(crate::Error::Config("Database max connections must be greater than 0".to_string()));
        }

        if self.security.session_expiry_hours == 0 {
            return Err(crate::Error::Config("Session expiry must be greater than 0".to_string()));
        }

        Ok(())
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

fn default_log_format() -> LogFormat {
    LogFormat::Json
}

fn default_true() -> bool {
    true
}

fn default_request_timeout() -> u64 {
    30
}

fn default_max_connections() -> usize {
    100
}

fn default_shutdown_timeout() -> u64 {
    30
}

fn default_max_db_connections() -> u32 {
    10
}

fn default_min_db_connections() -> u32 {
    1
}

fn default_connect_timeout() -> u64 {
    30
}

fn default_idle_timeout() -> u64 {
    600
}

fn default_cors_origins() -> Vec<String> {
    vec![
        "http://localhost:3000".to_string(),
        "http://localhost:5173".to_string(),
    ]
}

fn default_cors_methods() -> Vec<String> {
    vec!["GET".to_string(), "POST".to_string(), "PUT".to_string(), "DELETE".to_string()]
}

fn default_cors_headers() -> Vec<String> {
    vec!["Content-Type".to_string(), "Authorization".to_string()]
}

fn default_cors_max_age() -> u64 {
    3600
}

fn default_session_expiry() -> u64 {
    24
}

fn default_pairing_expiry() -> u64 {
    10
}

fn default_rate_limit() -> u32 {
    100
}

fn default_provider_timeout() -> u64 {
    60
}

fn default_max_retries() -> u32 {
    3
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
        assert_eq!(config.log.level, "info");
        assert_eq!(config.server.request_timeout_secs, 30);
        assert_eq!(config.database.max_connections, 10);
        assert_eq!(config.security.session_expiry_hours, 24);
    }

    #[test]
    fn test_config_validation() {
        let mut config = ServerConfig::default();
        assert!(config.validate().is_ok());

        config.port = 0;
        assert!(config.validate().is_err());
    }

    #[test]
    fn test_config_from_env() {
        // SAFETY: This is safe in test context as tests run in isolated threads
        unsafe {
            std::env::set_var("REMI_CODE_PORT", "8080");
        }
        let config = ServerConfig::load().expect("Failed to load config");
        assert_eq!(config.port, 8080);
        // SAFETY: Cleanup environment variable
        unsafe {
            std::env::remove_var("REMI_CODE_PORT");
        }
    }

    #[test]
    fn test_cors_defaults() {
        let cors = CorsConfig::default();
        assert!(!cors.allowed_origins.is_empty());
        assert!(cors.allowed_methods.contains(&"GET".to_string()));
        assert_eq!(cors.max_age_secs, 3600);
    }

    #[test]
    fn test_security_defaults() {
        let security = SecurityConfig::default();
        assert_eq!(security.session_expiry_hours, 24);
        assert_eq!(security.pairing_expiry_minutes, 10);
        assert!(security.rate_limiting);
    }
}
