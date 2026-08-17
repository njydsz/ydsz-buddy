//! # ydsz CLI - 命令行入口模块
//!
//! 本模块是 ydsz-buddy 服务器的命令行入口，负责整个应用程序的启动引导流程。
//!
//! ## 支持的模式
//!
//! - **服务器模式**（默认）：启动 WebSocket 服务器，监听 RPC 请求

use anyhow::Result;
use clap::Parser;
use ydsz_server::bootstrap_embedded;
use ydsz_shared::config::ServerConfig;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

/// CLI 命令行参数
#[derive(Parser, Debug, Clone)]
#[command(name = "ydsz-buddy", version, about = "ydsz-buddy AI-native workspace CLI")]
pub struct CliArgs {
    /// WebSocket 端口
    #[arg(long, default_value = "0")]
    pub port: u16,

    /// 日志级别
    #[arg(long, default_value = "info")]
    pub log_level: String,

    /// 数据库 URL
    #[arg(long)]
    pub database_url: Option<String>,

    /// 启用移动端推送
    #[arg(long, default_value = "false")]
    pub enable_push: bool,

    /// 启用设备配对
    #[arg(long, default_value = "false")]
    pub enable_pairing: bool,

    /// 配对密钥
    #[arg(long)]
    pub pairing_secret: Option<String>,
}

impl From<CliArgs> for ServerConfig {
    fn from(args: CliArgs) -> Self {
        ServerConfig {
            ws_port: args.port,
            enable_push: args.enable_push,
            enable_pairing: args.enable_pairing,
            pairing_secret: args.pairing_secret,
            database_url: args.database_url,
            log_level: args.log_level,
        }
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    // 1. 解析 CLI 参数
    let args = CliArgs::parse();

    // 2. 初始化日志系统
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| args.log_level.clone().into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    tracing::info!("启动 ydsz-buddy 服务器");

    // 3. 加载配置
    let config: ServerConfig = args.into();
    tracing::info!(port = config.ws_port, "配置加载完成");

    // 4. 引导服务
    let _result = bootstrap_embedded(config).await?;
    tracing::info!("服务引导完成");

    // 5. 保持服务器运行，等待 Ctrl+C
    tracing::info!("服务器运行中，按 Ctrl+C 退出");
    tokio::signal::ctrl_c().await?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cli_args_default() {
        let args = CliArgs::parse_from(["ydsz-buddy"]);
        assert_eq!(args.port, 0);
        assert_eq!(args.log_level, "info");
        assert!(!args.enable_push);
        assert!(!args.enable_pairing);
        assert!(args.database_url.is_none());
        assert!(args.pairing_secret.is_none());
    }

    #[test]
    fn test_cli_args_custom() {
        let args = CliArgs::parse_from([
            "ydsz-buddy",
            "--port",
            "8080",
            "--log-level",
            "debug",
            "--enable-push",
            "--enable-pairing",
            "--database-url",
            "postgres://localhost/ydsz",
            "--pairing-secret",
            "test-secret",
        ]);
        assert_eq!(args.port, 8080);
        assert_eq!(args.log_level, "debug");
        assert!(args.enable_push);
        assert!(args.enable_pairing);
        assert_eq!(args.database_url.as_deref(), Some("postgres://localhost/ydsz"));
        assert_eq!(args.pairing_secret.as_deref(), Some("test-secret"));
    }

    #[test]
    fn test_server_config_from_args() {
        let args = CliArgs::parse_from([
            "ydsz-buddy",
            "--port",
            "9000",
            "--enable-push",
        ]);
        let config: ServerConfig = args.into();
        assert_eq!(config.ws_port, 9000);
        assert!(config.enable_push);
        assert!(!config.enable_pairing);
    }
}
