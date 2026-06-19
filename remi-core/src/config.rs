//! 服务器配置类型与加载逻辑
//!
//! 整体策略：
//! - 使用 [`figment`] 同时支持 TOML 配置文件与环境变量（`REMI_CODE_*` 前缀）。
//! - 配置加载采用"环境变量覆盖配置文件"的覆盖顺序，符合 12-Factor App 规范。
//! - 提供 [`ServerConfig::load`] 与 [`ServerConfig::load_from`] 两套入口，前者默认读取
//!   当前目录下的 `remi-code.toml`，后者由调用方显式指定路径，方便测试与嵌入式场景。
//! - 提供 [`ServerConfig::validate`] 做基础业务校验（端口、超时、连接池等必须为正）。
//!
//! 各配置结构体在文档中均标注了大厂常见的"必填/可空/默认值"语义与"安全/性能"权衡。

use figment::{
    Figment,
    providers::{Env, Format, Toml},
};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// 服务器顶层配置
///
/// 涵盖网络监听、数据库、日志、CORS、安全、提供商等所有可配置项。
/// 字段均提供默认值，可通过 `remi-code.toml` 或 `REMI_CODE_*` 环境变量覆盖。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    /// HTTP/WebSocket 监听地址（默认 `127.0.0.1`，仅本机访问）
    #[serde(default = "default_host")]
    pub host: String,

    /// HTTP/WebSocket 监听端口（默认 3845，避免与 3000/8080 常见服务冲突）
    #[serde(default = "default_port")]
    pub port: u16,

    /// SQLite 数据库文件路径（相对当前工作目录或绝对路径）
    #[serde(default = "default_db_path")]
    pub db_path: PathBuf,

    /// 数据目录，用于存放缓存、附件、checkpoint 等
    #[serde(default = "default_data_dir")]
    pub data_dir: PathBuf,

    /// 启动时注入的认证令牌（可选，未设置时仅做本地信任）
    #[serde(default)]
    pub auth_token: Option<String>,

    /// 启用开发模式（详细日志、宽松 CORS、热重载等便利能力）
    #[serde(default)]
    pub dev_mode: bool,

    /// 运行时模式（服务器/桌面/开发），见 [`RuntimeMode`]
    #[serde(default = "default_runtime_mode")]
    pub runtime_mode: RuntimeMode,

    /// 日志配置（级别、格式、文件、是否启用 ANSI 颜色）
    #[serde(default)]
    pub log: LogConfig,

    /// HTTP 服务器参数（超时、最大连接数、优雅关闭）
    #[serde(default)]
    pub server: ServerSettings,

    /// 数据库连接池与超时配置
    #[serde(default)]
    pub database: DatabaseConfig,

    /// CORS 跨域配置
    #[serde(default)]
    pub cors: CorsConfig,

    /// 安全相关配置（密钥、会话过期、限流）
    #[serde(default)]
    pub security: SecurityConfig,

    /// 提供商相关配置（默认提供商、各 Provider 独立设置）
    #[serde(default)]
    pub providers: ProviderConfig,
}

/// 日志配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogConfig {
    /// 日志级别（`trace`/`debug`/`info`/`warn`/`error`）
    #[serde(default = "default_log_level")]
    pub level: String,

    /// 日志输出格式（JSON 适合生产环境，Pretty 适合开发）
    #[serde(default = "default_log_format")]
    pub format: LogFormat,

    /// 日志文件路径，未设置时输出到 stdout
    #[serde(default)]
    pub file: Option<PathBuf>,

    /// 是否启用 ANSI 颜色（仅 Pretty 模式生效）
    #[serde(default = "default_true")]
    pub ansi: bool,
}

/// 日志输出格式
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum LogFormat {
    /// JSON 结构化日志，便于日志平台采集
    #[default]
    Json,
    /// 美化打印格式，便于本地调试
    Pretty,
}

/// HTTP 服务器参数
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerSettings {
    /// 单个请求超时时间（秒）
    #[serde(default = "default_request_timeout")]
    pub request_timeout_secs: u64,

    /// 最大并发连接数（超出后排队处理）
    #[serde(default = "default_max_connections")]
    pub max_connections: usize,

    /// 是否在收到终止信号后等待在途请求完成
    #[serde(default = "default_true")]
    pub graceful_shutdown: bool,

    /// 优雅关闭的最大等待时间（秒），超时后强制退出
    #[serde(default = "default_shutdown_timeout")]
    pub shutdown_timeout_secs: u64,
}

/// 数据库连接池配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseConfig {
    /// 连接池最大连接数
    #[serde(default = "default_max_db_connections")]
    pub max_connections: u32,

    /// 连接池最小保持连接数
    #[serde(default = "default_min_db_connections")]
    pub min_connections: u32,

    /// 新建连接的超时时间（秒）
    #[serde(default = "default_connect_timeout")]
    pub connect_timeout_secs: u64,

    /// 空闲连接超时回收时间（秒）
    #[serde(default = "default_idle_timeout")]
    pub idle_timeout_secs: u64,

    /// 是否启用 SQLite WAL 模式（显著提升并发读写性能）
    #[serde(default = "default_true")]
    pub wal_mode: bool,
}

/// CORS 跨域配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CorsConfig {
    /// 允许的跨域源列表
    #[serde(default = "default_cors_origins")]
    pub allowed_origins: Vec<String>,

    /// 允许的 HTTP 方法
    #[serde(default = "default_cors_methods")]
    pub allowed_methods: Vec<String>,

    /// 允许的请求头
    #[serde(default = "default_cors_headers")]
    pub allowed_headers: Vec<String>,

    /// 是否允许携带 Cookie/Authorization 等凭证
    #[serde(default)]
    pub allow_credentials: bool,

    /// 预检请求缓存时间（秒）
    #[serde(default = "default_cors_max_age")]
    pub max_age_secs: u64,
}

/// 安全相关配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityConfig {
    /// 密钥文件路径，未设置时自动生成
    #[serde(default)]
    pub secret_key_path: Option<PathBuf>,

    /// 会话令牌过期时间（小时）
    #[serde(default = "default_session_expiry")]
    pub session_expiry_hours: u64,

    /// 配对码过期时间（分钟），仅用于 CLI 配对场景
    #[serde(default = "default_pairing_expiry")]
    pub pairing_expiry_minutes: u64,

    /// 是否启用 API 速率限制
    #[serde(default = "default_true")]
    pub rate_limiting: bool,

    /// 单客户端每分钟最大请求数
    #[serde(default = "default_rate_limit")]
    pub max_requests_per_minute: u32,
}

/// 提供商聚合配置
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ProviderConfig {
    /// 默认启用的提供商 ID（如 `"claude"`/`"codex"`）
    #[serde(default)]
    pub default_provider: Option<String>,

    /// 提供商 ID 到具体设置的映射
    #[serde(default)]
    pub providers: std::collections::HashMap<String, ProviderSettings>,
}

/// 单个提供商设置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderSettings {
    /// 上游 API 密钥（建议使用环境变量注入）
    #[serde(default)]
    pub api_key: Option<String>,

    /// 自定义 API 端点
    #[serde(default)]
    pub endpoint: Option<String>,

    /// 使用的模型名
    #[serde(default)]
    pub model: Option<String>,

    /// 单次请求超时（秒）
    #[serde(default = "default_provider_timeout")]
    pub timeout_secs: u64,

    /// 失败时的最大重试次数
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
    /// 加载默认配置：先读取环境变量（`REMI_CODE_*`），再尝试合并 `remi-code.toml`
    ///
    /// # 流程
    /// 1. 构造 [`Figment`]，注入以 `REMI_CODE_` 为前缀的环境变量。
    /// 2. 若当前目录存在 `remi-code.toml`，合并到 figment。
    /// 3. 反序列化为 [`ServerConfig`] 并执行 [`ServerConfig::validate`]。
    ///
    /// # 错误
    /// - 配置文件存在但格式不合法：返回 [`crate::Error::Config`]
    /// - 关键字段缺失或不合法（端口/超时等为 0）：返回 [`crate::Error::Config`]
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

    /// 从显式指定的路径加载配置
    ///
    /// 与 [`ServerConfig::load`] 的差异仅在于不依赖默认 `remi-code.toml`，
    /// 适用于嵌入式 CLI、Tauri 桌面端按用户偏好加载等场景。
    pub fn load_from(path: impl AsRef<std::path::Path>) -> crate::Result<Self> {
        let mut figment = Figment::new().merge(Env::prefixed("REMI_CODE_"));

        if path.as_ref().exists() {
            figment = figment.merge(Toml::file(path.as_ref()).nested());
        }

        let config: Self = figment.extract().map_err(crate::Error::from)?;
        config.validate()?;
        Ok(config)
    }

    /// 校验配置项的合法性
    ///
    /// 校验规则：
    /// - 端口必须大于 0
    /// - 请求超时必须大于 0
    /// - 数据库最大连接数必须大于 0
    /// - 会话过期时间必须大于 0
    ///
    /// 校验失败时返回带中文说明的 [`crate::Error::Config`]，便于日志可读性。
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
///
/// 不同模式会在启动时决定监听方式、CORS 策略、日志详细程度等行为。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum RuntimeMode {
    /// 服务器模式（默认），监听 HTTP/WebSocket，无桌面 UI
    #[default]
    Server,
    /// 桌面模式，由 Tauri 壳启动
    Desktop,
    /// 显式声明的开发模式（与 `dev_mode=true` 行为类似）
    Dev,
}

// region: 默认值工厂函数
// 大厂实践：默认值集中放在文件底部，便于统一管理与复用。
// 每个函数都对应一个 `#[serde(default = "...")]` 注解。

/// 默认监听地址
fn default_host() -> String {
    "127.0.0.1".to_string()
}

/// 默认端口（避免与 3000/8080 等常见端口冲突）
fn default_port() -> u16 {
    3845
}

/// 默认数据库路径
fn default_db_path() -> PathBuf {
    PathBuf::from("remi-code.db")
}

/// 默认数据目录
fn default_data_dir() -> PathBuf {
    PathBuf::from(".remi-code")
}

/// 默认运行时模式
fn default_runtime_mode() -> RuntimeMode {
    RuntimeMode::Server
}

/// 默认日志级别
fn default_log_level() -> String {
    "info".to_string()
}

/// 默认日志格式
fn default_log_format() -> LogFormat {
    LogFormat::Json
}

/// 通用布尔默认值（true）
fn default_true() -> bool {
    true
}

/// 默认请求超时
fn default_request_timeout() -> u64 {
    30
}

/// 默认最大并发连接数
fn default_max_connections() -> usize {
    100
}

/// 默认优雅关闭超时
fn default_shutdown_timeout() -> u64 {
    30
}

/// 默认数据库最大连接数
fn default_max_db_connections() -> u32 {
    10
}

/// 默认数据库最小连接数
fn default_min_db_connections() -> u32 {
    1
}

/// 默认连接超时
fn default_connect_timeout() -> u64 {
    30
}

/// 默认空闲超时
fn default_idle_timeout() -> u64 {
    600
}

/// 默认允许的跨域源
fn default_cors_origins() -> Vec<String> {
    vec![
        "http://localhost:3000".to_string(),
        "http://localhost:5173".to_string(),
    ]
}

/// 默认允许的 HTTP 方法
fn default_cors_methods() -> Vec<String> {
    vec!["GET".to_string(), "POST".to_string(), "PUT".to_string(), "DELETE".to_string()]
}

/// 默认允许的请求头
fn default_cors_headers() -> Vec<String> {
    vec!["Content-Type".to_string(), "Authorization".to_string()]
}

/// 默认 CORS 预检缓存时间
fn default_cors_max_age() -> u64 {
    3600
}

/// 默认会话过期时间（小时）
fn default_session_expiry() -> u64 {
    24
}

/// 默认配对码过期时间（分钟）
fn default_pairing_expiry() -> u64 {
    10
}

/// 默认每分钟最大请求数
fn default_rate_limit() -> u32 {
    100
}

/// 默认提供商请求超时
fn default_provider_timeout() -> u64 {
    60
}

/// 默认最大重试次数
fn default_max_retries() -> u32 {
    3
}

// endregion: 默认值工厂函数

#[cfg(test)]
mod tests {
    use super::*;

    /// 默认配置应当与每个 `default_*` 函数返回值一致
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

    /// 验证非法配置会被 `validate` 拒绝
    #[test]
    fn test_config_validation() {
        let mut config = ServerConfig::default();
        assert!(config.validate().is_ok());

        config.port = 0;
        assert!(config.validate().is_err());
    }

    /// 通过环境变量覆盖默认端口
    #[test]
    fn test_config_from_env() {
        // SAFETY: 在单线程测试中修改环境变量是安全的。
        unsafe {
            std::env::set_var("REMI_CODE_PORT", "8080");
        }
        let config = ServerConfig::load().expect("Failed to load config");
        assert_eq!(config.port, 8080);
        // SAFETY: 测试结束后清理环境变量，避免污染其他测试。
        unsafe {
            std::env::remove_var("REMI_CODE_PORT");
        }
    }

    /// CORS 默认配置应至少包含一种允许的方法
    #[test]
    fn test_cors_defaults() {
        let cors = CorsConfig::default();
        assert!(!cors.allowed_origins.is_empty());
        assert!(cors.allowed_methods.contains(&"GET".to_string()));
        assert_eq!(cors.max_age_secs, 3600);
    }

    /// 安全配置默认值校验
    #[test]
    fn test_security_defaults() {
        let security = SecurityConfig::default();
        assert_eq!(security.session_expiry_hours, 24);
        assert_eq!(security.pairing_expiry_minutes, 10);
        assert!(security.rate_limiting);
    }
}
