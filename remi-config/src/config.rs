//! # 服务器配置
//!
//! 本模块定义了 `remi-code` 后端服务器的完整配置体系，包括：
//!
//! - [`RuntimeMode`]：运行时模式枚举，标识当前部署形态（桌面端 / 服务端等）。
//! - [`CliArgs`]：命令行参数定义，基于 `clap` 自动解析 CLI 输入与环境变量。
//! - [`ServerConfig`]：服务器核心配置结构体，聚合所有运行时所需的配置项与派生路径。
//! - [`DerivedPaths`]：由基础目录派生出的所有子目录和文件路径的集合。
//!
//! ## 配置加载优先级
//!
//! 1. 命令行参数（最高优先级）
//! 2. 环境变量（如 `REMI_PORT`、`REMI_HOST`）
//! 3. 内置默认值（最低优先级）

use std::path::{Path, PathBuf};

use clap::Parser;
use serde::{Deserialize, Serialize};

use crate::error::{ConfigError, ConfigResult};

/// 运行时模式枚举
///
/// 用于标识当前服务器的部署形态，不同模式下可能具有不同的行为逻辑。
/// 序列化 / 反序列化时统一转为小写字符串（如 `"desktop"`）。
///
/// # 当前支持的模式
///
/// | 变体 | 说明 |
/// |------|------|
/// | [`Desktop`](RuntimeMode::Desktop) | 桌面端模式（默认），适用于本地桌面应用 |
///
/// # 示例
///
/// ```rust
/// use remi_config::RuntimeMode;
///
/// let mode = RuntimeMode::default();
/// assert_eq!(mode, RuntimeMode::Desktop);
/// ```
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RuntimeMode {
    /// 桌面端模式
    ///
    /// 适用于本地桌面应用场景，服务器运行在用户本机。
    Desktop,
}

impl Default for RuntimeMode {
    /// 返回默认的运行时模式
    ///
    /// 当前默认值为 [`RuntimeMode::Desktop`]。
    fn default() -> Self {
        Self::Desktop
    }
}

/// 命令行参数定义
///
/// 基于 `clap::Parser` 自动解析命令行参数与同名环境变量。
/// 所有参数均为可选，未提供时将使用内置默认值或由 [`ServerConfig::from_args_and_env`] 进行兜底处理。
///
/// # 环境变量映射
///
/// | 参数 | 环境变量 | 说明 |
/// |--------|----------|------|
/// | `--port` | `REMI_PORT` | 服务器监听端口 |
/// | `--host` | `REMI_HOST` | 服务器绑定主机地址 |
/// | `--home-dir` | `REMI_HOME_DIR` | 数据基础目录 |
/// | `--auth-token` | `REMI_AUTH_TOKEN` | 认证令牌 |
/// | `--log-provider-events` | `REMI_LOG_PROVIDER_EVENTS` | 是否记录 Provider 事件日志 |
/// | `--log-websocket-events` | `REMI_LOG_WEBSOCKET_EVENTS` | 是否记录 WebSocket 事件日志 |
#[derive(Parser, Debug)]
#[command(name = "remi-code", about = "Remi Code 后端服务器")]
pub struct CliArgs {
    /// 服务器监听端口
    ///
    /// 未指定时默认使用 `3773`。
    /// 可通过环境变量 `REMI_PORT` 设置。
    #[arg(long, env = "REMI_PORT")]
    pub port: Option<u16>,

    /// 服务器绑定主机地址
    ///
    /// 未指定时由服务器实现决定默认绑定行为。
    /// 可通过环境变量 `REMI_HOST` 设置。
    #[arg(long, env = "REMI_HOST")]
    pub host: Option<String>,

    /// 数据基础目录路径
    ///
    /// 所有子目录（数据库、日志、密钥等）均从此目录派生。
    /// 未指定时默认使用用户主目录下的 `.remi-code` 目录。
    /// 可通过环境变量 `REMI_HOME_DIR` 设置。
    #[arg(long, env = "REMI_HOME_DIR")]
    pub home_dir: Option<PathBuf>,

    /// 认证令牌
    ///
    /// 用于客户端请求的身份验证。未设置时服务器可能以无认证模式运行。
    /// 可通过环境变量 `REMI_AUTH_TOKEN` 设置。
    #[arg(long, env = "REMI_AUTH_TOKEN")]
    pub auth_token: Option<String>,

    /// 是否记录 Provider 事件日志
    ///
    /// 开启后将输出 Provider（AI 模型提供方）相关的调试事件到日志。
    /// 可通过环境变量 `REMI_LOG_PROVIDER_EVENTS` 设置。
    #[arg(long, env = "REMI_LOG_PROVIDER_EVENTS")]
    pub log_provider_events: bool,

    /// 是否记录 WebSocket 事件日志
    ///
    /// 开启后将输出 WebSocket 连接与消息相关的调试事件到日志。
    /// 可通过环境变量 `REMI_LOG_WEBSOCKET_EVENTS` 设置。
    #[arg(long, env = "REMI_LOG_WEBSOCKET_EVENTS")]
    pub log_websocket_events: bool,
}

/// 服务器核心配置
///
/// 聚合了服务器运行所需的全部配置项，包括网络参数、目录路径、认证信息和调试开关。
/// 通过 [`ServerConfig::from_args_and_env`] 从 CLI 参数和环境变量构建，
/// 构建后应调用 [`ServerConfig::validate`] 进行合法性校验。
///
/// # 序列化
///
/// 使用 `camelCase` 命名风格进行 JSON 序列化 / 反序列化，
/// 以便与前端或其他语言的服务保持一致。
///
/// # 字段说明
///
/// | 字段 | 类型 | 说明 |
/// |------|------|------|
/// | `mode` | [`RuntimeMode`] | 运行时模式 |
/// | `port` | `u16` | 服务器监听端口 |
/// | `host` | `Option<String>` | 服务器绑定主机地址 |
/// | `base_dir` | `PathBuf` | 数据基础目录 |
/// | `state_dir` | `PathBuf` | 状态数据目录 |
/// | `db_path` | `PathBuf` | SQLite 数据库文件路径 |
/// | `secrets_dir` | `PathBuf` | 密钥存储目录 |
/// | `logs_dir` | `PathBuf` | 日志文件目录 |
/// | `attachments_dir` | `PathBuf` | 附件存储目录 |
/// | `worktrees_dir` | `PathBuf` | Git Worktree 目录 |
/// | `settings_path` | `PathBuf` | 用户设置文件路径 |
/// | `auth_token` | `Option<String>` | 认证令牌 |
/// | `log_provider_events` | `bool` | Provider 事件日志开关 |
/// | `log_websocket_events` | `bool` | WebSocket 事件日志开关 |
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerConfig {
    /// 运行时模式（桌面端 / 服务端等）
    pub mode: RuntimeMode,

    /// 服务器监听端口，默认 `3773`
    pub port: u16,

    /// 服务器绑定主机地址，`None` 表示使用默认绑定行为
    pub host: Option<String>,

    /// 数据基础目录，所有子目录均从此路径派生
    pub base_dir: PathBuf,

    /// 状态数据目录（`base_dir/userdata`），存放数据库、日志等运行时数据
    pub state_dir: PathBuf,

    /// SQLite 数据库文件路径（`state_dir/state.sqlite`）
    pub db_path: PathBuf,

    /// 密钥存储目录（`state_dir/secrets`），存放 API Key 等敏感信息
    pub secrets_dir: PathBuf,

    /// 日志文件目录（`state_dir/logs`）
    pub logs_dir: PathBuf,

    /// 附件存储目录（`state_dir/attachments`），存放用户上传的文件等
    pub attachments_dir: PathBuf,

    /// Git Worktree 目录（`base_dir/worktrees`），用于管理代码工作树
    pub worktrees_dir: PathBuf,

    /// 用户设置文件路径（`state_dir/settings.json`）
    pub settings_path: PathBuf,

    /// 认证令牌，用于客户端身份验证，`None` 表示不启用认证
    pub auth_token: Option<String>,

    /// 是否记录 Provider（AI 模型提供方）事件日志
    pub log_provider_events: bool,

    /// 是否记录 WebSocket 事件日志
    pub log_websocket_events: bool,
}

impl Default for ServerConfig {
    fn default() -> Self {
        let base_dir = PathBuf::from(".remi-code-test");
        let paths = Self::derive_paths(&base_dir).expect("Failed to derive paths");

        Self {
            mode: RuntimeMode::Desktop,
            port: 3773,
            host: None,
            base_dir,
            state_dir: paths.state_dir,
            db_path: paths.db_path,
            secrets_dir: paths.secrets_dir,
            logs_dir: paths.logs_dir,
            attachments_dir: paths.attachments_dir,
            worktrees_dir: paths.worktrees_dir,
            settings_path: paths.settings_path,
            auth_token: None,
            log_provider_events: false,
            log_websocket_events: false,
        }
    }
}

impl ServerConfig {
    /// 从 CLI 参数和环境变量创建服务器配置
    ///
    /// 按照以下优先级加载配置：CLI 参数 > 环境变量 > 内置默认值。
    /// 基础目录（`base_dir`）的确定逻辑：
    /// 1. 优先使用 `--home-dir` 参数指定的路径；
    /// 2. 若未指定，则尝试读取系统环境变量 `USERPROFILE`（Windows）或 `HOME`（Unix）；
    /// 3. 在用户主目录下拼接 `.remi-code` 作为默认基础目录。
    ///
    /// # 参数
    ///
    /// - `args` — 经 `clap` 解析后的命令行参数
    ///
    /// # 返回值
    ///
    /// - `Ok(ServerConfig)` — 构建成功的服务器配置
    /// - `Err(ConfigError::EnvError)` — 无法获取用户主目录时返回
    ///
    /// # 错误
    ///
    /// 当系统环境变量 `USERPROFILE` 和 `HOME` 均未设置，且未通过 `--home-dir` 指定基础目录时，
    /// 将返回 [`ConfigError::EnvError`]。
    ///
    /// # 示例
    ///
    /// ```rust,no_run
    /// #[tokio::main]
    /// async fn main() {
    /// use remi_config::{CliArgs, ServerConfig};
    /// use clap::Parser;
    /// 
    /// let args = CliArgs::parse();
    /// let config = ServerConfig::from_args_and_env(args).unwrap();
    /// }
    pub fn from_args_and_env(args: CliArgs) -> ConfigResult<Self> {
        // 当前仅支持桌面端模式
        let mode = RuntimeMode::Desktop;

        // 端口默认 3773，可通过 CLI 参数或环境变量覆盖
        let port = args.port.unwrap_or(3773);
        let host = args.host;

        // 确定基础目录：优先使用 CLI 参数，否则从系统环境变量获取用户主目录
        let base_dir = if let Some(home_dir) = args.home_dir {
            home_dir
        } else {
            // 兼容 Windows（USERPROFILE）和 Unix（HOME）系统
            let home = std::env::var("USERPROFILE")
                .or_else(|_| std::env::var("HOME"))
                .map_err(|_| ConfigError::EnvError("无法获取用户目录".to_string()))?;
            PathBuf::from(home).join(".remi-code")
        };

        // 基于基础目录派生所有子目录和文件路径
        let paths = Self::derive_paths(&base_dir)?;

        Ok(Self {
            mode,
            port,
            host,
            base_dir,
            state_dir: paths.state_dir,
            db_path: paths.db_path,
            secrets_dir: paths.secrets_dir,
            logs_dir: paths.logs_dir,
            attachments_dir: paths.attachments_dir,
            worktrees_dir: paths.worktrees_dir,
            settings_path: paths.settings_path,
            auth_token: args.auth_token,
            log_provider_events: args.log_provider_events,
            log_websocket_events: args.log_websocket_events,
        })
    }

    /// 根据基础目录派生所有子目录和文件路径
    ///
    /// 路径派生规则：
    ///
    /// | 路径 | 相对位置 | 说明 |
    /// |------|----------|------|
    /// | `state_dir` | `base_dir/userdata` | 状态数据根目录 |
    /// | `db_path` | `state_dir/state.sqlite` | SQLite 数据库文件 |
    /// | `secrets_dir` | `state_dir/secrets` | 密钥存储目录 |
    /// | `logs_dir` | `state_dir/logs` | 日志文件目录 |
    /// | `attachments_dir` | `state_dir/attachments` | 附件存储目录 |
    /// | `worktrees_dir` | `base_dir/worktrees` | Git Worktree 目录 |
    /// | `settings_path` | `state_dir/settings.json` | 用户设置文件 |
    ///
    /// # 参数
    ///
    /// - `base_dir` — 数据基础目录路径
    ///
    /// # 返回值
    ///
    /// - `Ok(DerivedPaths)` — 包含所有派生路径的结构体
    ///
    /// # 注意
    ///
    /// 本方法仅计算路径，**不会**在磁盘上创建任何目录或文件。
    /// 调用方需在适当时机自行确保这些目录的存在（如使用 `std::fs::create_dir_all`）。
    pub fn derive_paths(base_dir: &Path) -> ConfigResult<DerivedPaths> {
        // 状态数据根目录：存放数据库、日志、密钥等运行时数据
        let state_dir = base_dir.join("userdata");
        let db_path = state_dir.join("state.sqlite");
        let secrets_dir = state_dir.join("secrets");
        let logs_dir = state_dir.join("logs");
        let attachments_dir = state_dir.join("attachments");
        // Worktree 目录直接位于基础目录下，与 state_dir 同级
        let worktrees_dir = base_dir.join("worktrees");
        let settings_path = state_dir.join("settings.json");

        Ok(DerivedPaths {
            state_dir,
            db_path,
            secrets_dir,
            logs_dir,
            attachments_dir,
            worktrees_dir,
            settings_path,
        })
    }

    /// 校验配置的合法性
    ///
    /// 在服务器启动前调用，确保关键配置项满足业务约束。
    ///
    /// # 校验规则
    ///
    /// 1. 端口号不能为 `0`（`0` 表示由系统随机分配，此处不允许）
    /// 2. 基础目录路径必须是合法的 UTF-8 字符串
    ///
    /// # 返回值
    ///
    /// - `Ok(())` — 配置校验通过
    /// - `Err(ConfigError::ValidationError)` — 端口号校验失败
    /// - `Err(ConfigError::PathError)` — 基础目录路径无效
    ///
    /// # 注意
    ///
    /// 本方法仅校验配置值本身的合法性，**不会**检查目录是否真实存在于磁盘、
    /// 是否具有读写权限等文件系统状态。调用方需在启动服务前另行检查。
    pub fn validate(&self) -> ConfigResult<()> {
        if self.port == 0 {
            return Err(ConfigError::ValidationError("端口不能为 0".to_string()));
        }

        if self.base_dir.to_str().is_none() {
            return Err(ConfigError::PathError("基础目录路径无效".to_string()));
        }

        Ok(())
    }
}

/// 派生路径集合
///
/// 由 [`ServerConfig::derive_paths`] 根据基础目录计算得出，
/// 包含服务器运行所需的所有子目录和文件路径。
///
/// # 目录结构
///
/// ```text
/// base_dir/
/// ├── userdata/              <- state_dir
/// │   ├── state.sqlite       <- db_path
/// │   ├── secrets/           <- secrets_dir
/// │   ├── logs/              <- logs_dir
/// │   ├── attachments/       <- attachments_dir
/// │   └── settings.json      <- settings_path
/// └── worktrees/             <- worktrees_dir
/// ```
#[derive(Debug, Clone)]
pub struct DerivedPaths {
    /// 状态数据根目录（`base_dir/userdata`）
    pub state_dir: PathBuf,

    /// SQLite 数据库文件路径（`state_dir/state.sqlite`）
    pub db_path: PathBuf,

    /// 密钥存储目录（`state_dir/secrets`）
    pub secrets_dir: PathBuf,

    /// 日志文件目录（`state_dir/logs`）
    pub logs_dir: PathBuf,

    /// 附件存储目录（`state_dir/attachments`）
    pub attachments_dir: PathBuf,

    /// Git Worktree 目录（`base_dir/worktrees`）
    pub worktrees_dir: PathBuf,

    /// 用户设置文件路径（`state_dir/settings.json`）
    pub settings_path: PathBuf,
}

#[cfg(test)]
mod tests {
    //! # 配置模块单元测试
    //!
    //! 覆盖路径派生逻辑和配置校验逻辑的核心测试用例。

    use super::*;

    /// 测试路径派生逻辑
    ///
    /// 验证 [`ServerConfig::derive_paths`] 能否根据给定的基础目录
    /// 正确计算出所有子目录和文件路径。
    #[test]
    fn test_derive_paths() {
        let base_dir = PathBuf::from("/tmp/remi-test");
        let paths = ServerConfig::derive_paths(&base_dir).unwrap();

        assert_eq!(paths.state_dir, base_dir.join("userdata"));
        assert_eq!(paths.db_path, base_dir.join("userdata/state.sqlite"));
        assert_eq!(paths.secrets_dir, base_dir.join("userdata/secrets"));
        assert_eq!(paths.logs_dir, base_dir.join("userdata/logs"));
        assert_eq!(paths.attachments_dir, base_dir.join("userdata/attachments"));
        assert_eq!(paths.worktrees_dir, base_dir.join("worktrees"));
        assert_eq!(paths.settings_path, base_dir.join("userdata/settings.json"));
    }

    /// 测试配置校验逻辑
    ///
    /// 验证端口号为 `0` 时 [`ServerConfig::validate`] 应返回错误。
    #[test]
    fn test_config_validation() {
        let args = CliArgs {
            port: Some(0),
            host: None,
            home_dir: Some(PathBuf::from("/tmp/remi-test")),
            auth_token: None,
            log_provider_events: false,
            log_websocket_events: false,
        };

        let config = ServerConfig::from_args_and_env(args).unwrap();
        assert!(config.validate().is_err());
    }
}
