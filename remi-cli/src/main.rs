//! # Remi CLI - 命令行入口模块
//!
//! 本模块是 Remi Code 服务器的命令行入口，负责整个应用程序的启动引导流程。
//! 编译产物为 `remi-code` 二进制文件，可通过命令行直接运行。
//!
//! ## 核心职责
//!
//! 1. **日志初始化**：基于 `tracing` 生态构建结构化日志系统
//! 2. **命令行参数解析**：使用 `clap` 派生宏解析 CLI 参数
//! 3. **配置加载与校验**：合并 CLI 参数与环境变量生成运行时配置
//! 4. **服务引导**：调用 `remi-server::bootstrap` 统一引导函数
//! 5. **WebSocket 服务器启动**：绑定地址并启动监听
//!
//! ## 启动流程
//!
//! ```text
//! 初始化日志 → 解析 CLI 参数 → 加载配置 → 校验配置 → 引导服务 → 启动 WebSocket 服务器
//! ```

use anyhow::Result;
use clap::Parser;
use remi_config::CliArgs;
use remi_server::{bootstrap, start_server};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

/// # 程序主入口函数
///
/// 执行流程：初始化日志 → 解析 CLI 参数 → 加载配置 → 引导服务 → 启动服务器
///
/// # Errors
///
/// 以下任一环节失败将返回错误：
/// - 配置加载失败（环境变量缺失或格式错误）
/// - 配置校验失败（端口号不合法等）
/// - 服务引导失败（依赖服务初始化异常）
/// - 服务器启动失败（端口绑定失败等）
///
/// # Async
///
/// 使用 `#[tokio::main]` 将同步入口转换为 Tokio 异步运行时入口，
/// 以支持整个服务器的异步 I/O 操作。
#[tokio::main]
async fn main() -> Result<()> {
    // 1. 初始化日志系统
    // 优先读取 RUST_LOG 环境变量作为日志过滤条件，
    // 若未设置则默认使用 "info" 级别，确保生产环境不会输出过多调试信息
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    tracing::info!("启动 Remi Code 服务器");

    // 2. 解析 CLI 参数并加载配置
    // clap 会自动处理 --help 和 --version 参数，无需额外处理
    let args = CliArgs::parse();
    let config = remi_config::ServerConfig::from_args_and_env(args)?;
    config.validate()?;

    tracing::info!(port = config.port, "配置加载完成");

    // 3. 引导服务（统一构造工厂）
    // bootstrap 负责初始化所有依赖子模块并返回运行时资源
    let result = bootstrap(&config).await?;

    tracing::info!("服务引导完成");

    // 4. 启动 WebSocket 服务器
    // 此调用会阻塞当前线程，持续监听直到服务器被关闭
    start_server(
        result.server_addr,
        result.rpc_router,
        std::sync::Arc::new(config.clone()),
    )
    .await?;

    Ok(())
}
