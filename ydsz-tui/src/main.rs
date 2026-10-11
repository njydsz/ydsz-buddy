//! # ydsz-tui - 终端 UI 入口
//!
//! 基于 ratatui + crossterm 的终端交互界面，连接到 ydzs-server 提供完整的终端对话体验。
//! 对标 ZCode 的 `zcode tui` 能力。

use anyhow::Result;
use clap::Parser;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use crate::app::TuiApp;

mod app;
mod client;
mod theme;
mod ui;

/// CLI 命令行参数
#[derive(Parser, Debug, Clone)]
#[command(name = "ydsz-tui", version, about = "ydsz-buddy 终端 TUI 交互界面")]
pub struct CliArgs {
    /// 服务器 WebSocket URL
    #[arg(long, default_value = "ws://127.0.0.1:1729")]
    pub server: String,

    /// 直接发送单轮提示词后退出（headless 模式）
    #[arg(long)]
    pub prompt: Option<String>,

    /// 默认执行权限模式
    #[arg(long, default_value = "code")]
    pub mode: String,

    /// 日志级别
    #[arg(long, default_value = "info")]
    pub log_level: String,
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

    tracing::info!("启动 ydsz-tui");

    // 3. 创建并运行 TUI 应用
    let mut app = TuiApp::new(&args.server, &args.mode);

    // 如果指定了 --prompt，则执行单轮 headless 模式
    if let Some(prompt) = args.prompt {
        tracing::info!(prompt = %prompt, "执行单轮 headless 模式");
        app.run_headless(&prompt).await?;
    } else {
        app.run().await?;
    }

    tracing::info!("ydsz-tui 已退出");
    Ok(())
}
