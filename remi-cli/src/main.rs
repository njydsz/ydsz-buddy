//! # Remi CLI - 命令行入口模块
//!
//! 本模块是 Remi Code 服务器的命令行入口，负责整个应用程序的启动引导流程。
//!
//! ## 核心职责
//!
//! 1. **日志初始化**：基于 `tracing` 生态构建结构化日志系统
//! 2. **命令行参数解析**：使用 `clap` 派生宏解析 CLI 参数
//! 3. **配置加载与校验**：合并 CLI 参数与环境变量生成运行时配置
//! 4. **服务引导**：调用 `remi-server::bootstrap` 统一引导函数
//! 5. **WebSocket 服务器启动**：绑定地址并启动监听

use anyhow::Result;
use clap::Parser;
use remi_config::CliArgs;
use remi_server::{bootstrap, start_server};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

/// # 程序主入口函数
///
/// 执行流程：初始化日志 → 解析 CLI 参数 → 加载配置 → 引导服务 → 启动服务器
#[tokio::main]
async fn main() -> Result<()> {
    // 1. 初始化日志系统
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    tracing::info!("启动 Remi Code 服务器");

    // 2. 解析 CLI 参数并加载配置
    let args = CliArgs::parse();
    let config = remi_config::ServerConfig::from_args_and_env(args)?;
    config.validate()?;

    tracing::info!(port = config.port, "配置加载完成");

    // 3. 引导服务（统一构造工厂）
    let result = bootstrap(&config).await?;

    tracing::info!("服务引导完成");

    // 4. 启动 WebSocket 服务器
    start_server(result.server_addr, result.rpc_router).await?;

    Ok(())
}
