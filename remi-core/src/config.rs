//! 服务器配置类型

use figment::{
    Figment,
    providers::{Env, Format, Toml},
};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// 服务器配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    /// 服务器绑定地址
    #[serde(default = "default_host")]
    pub host: String,

    /// 服务器监听端口
    #[serde(default = "default_port")]
    pub port: u16,

    /// SQLite 数据库文件路径
    #[serde(default = "default_db_path")]
    pub db_path: PathBuf,

    /// 数据目录路径
    #[serde(default = "default_data_dir")]
    pub data_dir: PathBuf,

    /// 认证令牌（可选）
    #[serde(default)]
    pub auth_token: Option<String>,

    /// 启用开发模式
    #[serde(default)]
    pub dev_mode: bool,

    /// 运行时模式
    #[serde(default = "default_runtime_mode")]
    pub runtime_mode: RuntimeMode,

    /// 日志配置
    #[serde(default)]
    pub log: LogConfig,

    /// 服务器设置
    #[serde(default)]
    pub server: ServerSettings,

    /// 数据库配置
    #[serde(default)]
    pub database: DatabaseConfig,

    /// CORS 配置
    #[serde(default)]
    pub cors: CorsConfig,

    /// 安全配置
    #[serde(default)]
    pub security: SecurityConfig,

    /// 提供商配置
    #[serde(default)]
    pub providers: ProviderConfig,
}

/// 日志配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogConfig {
    /// 日志级别（trace, debug, info, warn, error）
    #[serde(default = "default_log_level")]
    pub level: String,

    /// 日志格式（json, pretty）
    #[serde(default = "default_log_format")]
    pub format: LogFormat,

    /// 日志文件路径（可选，未设置时输出到标准输出）
    #[serde(default)]
    pub file: Option<PathBuf>,

    /// 启用 ANSI 颜色
    #[serde(default = "default_true")]
    pub ansi: bool,
}

/// 日志格式
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum LogFormat {
    /// JSON 格式
    #[default]
    Json,
    /// 美化打印格式
    Pretty,
}

/// 服务器设置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerSettings {
    /// 请求超时时间（秒）
    #[serde(default = "default_request_timeout")]
    pub request_timeout_secs: u64,

    /// 最大并发连接数
    #[serde(default = "default_max_connections")]
    pub max_connections: usize,

    /// 启用优雅关闭
    #[serde(default = "default_true")]
    pub graceful_shutdown: bool,

    /// 关闭超时时间（秒）
    #[serde(default = "default_shutdown_timeout")]
    pub shutdown_timeout_secs: u64,
}

/// 数据库配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseConfig {
    /// 最大连接池大小
    #[serde(default = "default_max_db_connections")]
    pub max_connections: u32,

    /// 最小连接池大小
    #[serde(default = "default_min_db_connections")]
    pub min_connections: u32,

    /// 连接超时时间（秒）
    #[serde(default = "default_connect_timeout")]
    pub connect_timeout_secs: u64,

    /// 空闲超时时间（秒）
    #[serde(default = "default_idle_timeout")]
    pub idle_timeout_secs: u64,

    /// 启用 WAL 模式
    #[serde(default = "default_true")]
    pub wal_mode: bool,
}

/// CORS 配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CorsConfig {
    /// 允许的源
    #[serde(default = "default_cors_origins")]
    pub allowed_origins: Vec<String>,

    /// 允许的方法
    #[serde(default = "default_cors_methods")]
    pub allowed_methods: Vec<String>,

    /// 允许的请求头
    #[serde(default = "default_cors_headers")]
    pub allowed_headers: Vec<String>,

    /// 允许携带凭证
    #[serde(default)]
    pub allow_credentials: bool,

    /// 最大缓存时间（秒）
    #[serde(default = "default_cors_max_age")]
    pub max_age_secs: u64,
}

/// 安全配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityConfig {
    /// 密钥文件路径
    #[serde(default)]
    pub secret_key_path: Option<PathBuf>,

    /// 会话令牌过期时间（小时）
    #[serde(default = "default_session_expiry")]
    pub session_expiry_hours: u64,

    /// 配对码过期时间（分钟）
    #[serde(default = "default_pairing_expiry")]
    pub pairing_expiry_minutes: u64,

    /// 启用速率限制
    #[serde(default = "default_true")]
    pub rate_limiting: bool,

    /// 每分钟最大请求数
    #[serde(default = "default_rate_limit")]
    pub max_requests_per_minute: u32,
}

/// 提供商配置
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ProviderConfig {
    /// 默认提供商
    #[serde(default)]
    pub default_provider: Option<String>,

    /// 提供商特定配置
    #[serde(default)]
    pub providers: std::collections::HashMap<String, ProviderSettings>,
}

/// 单个提供商设置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderSettings {
    /// API 密钥（如果需要）
    #[serde(default)]
    pub api_key: Option<String>,

    /// API 端点
    #[serde(default)]
    pub endpoint: Option<String>,

    /// 使用的模型
    #[serde(default)]
    pub model: Option<String>,

    /// 请求超时时间（秒）
    #[serde(default = "default_provider_timeout")]
    pub timeout_secs: u64,

    /// 最大重试次数
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
    /// 从环境变量和配置文件加载配置
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

    /// 从指定配置文件路径加载配置
    pub fn load_from(path: impl AsRef<std::path::Path>) -> crate::Result<Self> {
        let mut figment = Figment::new().merge(Env::prefixed("REMI_CODE_"));

        if path.as_ref().exists() {
            figment = figment.merge(Toml::file(path.as_ref()).nested());
        }

        let config: Self = figment.extract().map_err(crate::Error::from)?;
        config.validate()?;
        Ok(config)
    }

    /// 验证配置
    pub fn validate(&self) -> crate::Result<()> {
        if self.port == 0 {
            return Err(crate::Error::Config("端口必须大于 0".to_string()));
        }

        if self.server.request_timeout_secs == 0 {
            return Err(crate::Error::Config("请求超时时间必须大于 0".to_string()));
        }

        if self.database.max_connections == 0 {
            return Err(crate::Error::Config("数据库最大连接数必须大于 0".to_string()));
        }

        if self.security.session_expiry_hours == 0 {
            return Err(crate::Error::Config("会话过期时间必须大于 0".to_string()));
        }

        Ok(())
    }
}

/// 服务器运行时模式
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum RuntimeMode {
    /// 服务器模式（默认）
    #[default]
    Server,
    /// 桌面模式
    Desktop,
    /// 开发模式
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
