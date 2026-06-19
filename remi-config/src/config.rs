//! 服务器配置

use std::path::PathBuf;

use clap::Parser;
use serde::{Deserialize, Serialize};

use crate::error::{ConfigError, ConfigResult};

/// 运行时模式
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RuntimeMode {
    /// 桌面端模式
    Desktop,
}

impl Default for RuntimeMode {
    fn default() -> Self {
        Self::Desktop
    }
}

/// CLI 参数
#[derive(Parser, Debug)]
#[command(name = "remi-code", about = "Remi Code 后端服务器")]
pub struct CliArgs {
    /// 服务器端口
    #[arg(long, env = "REMI_PORT")]
    pub port: Option<u16>,

    /// 服务器主机
    #[arg(long, env = "REMI_HOST")]
    pub host: Option<String>,

    /// 基础目录
    #[arg(long, env = "REMI_HOME_DIR")]
    pub home_dir: Option<PathBuf>,

    /// 认证令牌
    #[arg(long, env = "REMI_AUTH_TOKEN")]
    pub auth_token: Option<String>,

    /// 是否记录 Provider 事件
    #[arg(long, env = "REMI_LOG_PROVIDER_EVENTS")]
    pub log_provider_events: bool,

    /// 是否记录 WebSocket 事件
    #[arg(long, env = "REMI_LOG_WEBSOCKET_EVENTS")]
    pub log_websocket_events: bool,
}

/// 服务器配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerConfig {
    /// 运行时模式
    pub mode: RuntimeMode,

    /// 服务器端口
    pub port: u16,

    /// 服务器主机
    pub host: Option<String>,

    /// 基础目录
    pub base_dir: PathBuf,

    /// 状态目录
    pub state_dir: PathBuf,

    /// 数据库路径
    pub db_path: PathBuf,

    /// 密钥目录
    pub secrets_dir: PathBuf,

    /// 日志目录
    pub logs_dir: PathBuf,

    /// 附件目录
    pub attachments_dir: PathBuf,

    /// Worktree 目录
    pub worktrees_dir: PathBuf,

    /// 设置文件路径
    pub settings_path: PathBuf,

    /// 认证令牌
    pub auth_token: Option<String>,

    /// 是否记录 Provider 事件
    pub log_provider_events: bool,

    /// 是否记录 WebSocket 事件
    pub log_websocket_events: bool,
}

impl ServerConfig {
    /// 从 CLI 参数和环境变量创建配置
    pub fn from_args_and_env(args: CliArgs) -> ConfigResult<Self> {
        let mode = RuntimeMode::Desktop;
        let port = args.port.unwrap_or(3773);
        let host = args.host;

        // 确定基础目录
        let base_dir = if let Some(home_dir) = args.home_dir {
            home_dir
        } else {
            // 默认使用用户目录下的 .remi-code
            let home = std::env::var("USERPROFILE")
                .or_else(|_| std::env::var("HOME"))
                .map_err(|_| ConfigError::EnvError("无法获取用户目录".to_string()))?;
            PathBuf::from(home).join(".remi-code")
        };

        // 派生路径
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

    /// 派生路径
    pub fn derive_paths(base_dir: &PathBuf) -> ConfigResult<DerivedPaths> {
        let state_dir = base_dir.join("userdata");
        let db_path = state_dir.join("state.sqlite");
        let secrets_dir = state_dir.join("secrets");
        let logs_dir = state_dir.join("logs");
        let attachments_dir = state_dir.join("attachments");
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

    /// 验证配置
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

/// 派生路径
#[derive(Debug, Clone)]
pub struct DerivedPaths {
    pub state_dir: PathBuf,
    pub db_path: PathBuf,
    pub secrets_dir: PathBuf,
    pub logs_dir: PathBuf,
    pub attachments_dir: PathBuf,
    pub worktrees_dir: PathBuf,
    pub settings_path: PathBuf,
}

#[cfg(test)]
mod tests {
    use super::*;

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
