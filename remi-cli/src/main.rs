//! Remi CLI - 命令行入口

use anyhow::Result;
use clap::Parser;
use remi_config::CliArgs;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> Result<()> {
    // 初始化日志
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::try_from_default_env()
            .unwrap_or_else(|_| "info".into()))
        .with(tracing_subscriber::fmt::layer())
        .init();

    // 解析 CLI 参数
    let args = CliArgs::parse();
    
    tracing::info!("启动 Remi Code 服务器");

    // 加载配置
    let config = remi_config::ServerConfig::from_args_and_env(args)?;
    config.validate()?;

    tracing::info!(port = config.port, "配置加载完成");

    // TODO: 构建服务层并启动服务器
    tracing::info!("服务器配置就绪，等待后续阶段实现");

    Ok(())
}
