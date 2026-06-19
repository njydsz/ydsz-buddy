//! Remi CLI - 命令行入口

use std::net::SocketAddr;
use std::sync::Arc;

use anyhow::Result;
use clap::Parser;
use remi_config::CliArgs;
use remi_server::{RpcRouter, WebSocketServer};
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

    // 创建 RPC 路由器
    let rpc_router = Arc::new(RpcRouter::new());

    // TODO: 注册 RPC 方法
    // register_rpc_methods(rpc_router.clone()).await;

    // 创建服务器地址
    let addr: SocketAddr = format!("{}:{}", config.host, config.port)
        .parse()
        .expect("Invalid server address");

    // 创建并启动 WebSocket 服务器
    let server = WebSocketServer::new(addr, rpc_router);
    
    tracing::info!("WebSocket 服务器启动中...");
    
    // 启动服务器（阻塞）
    if let Err(e) = server.start().await {
        tracing::error!("服务器启动失败: {}", e);
        return Err(e.into());
    }

    Ok(())
}

// TODO: 实现 RPC 方法注册
// async fn register_rpc_methods(router: Arc<RpcRouter>) {
//     use remi_server::create_success_response;
//     use serde_json::json;
//
//     // 示例：注册 ping 方法
//     router
//         .register("ping", |params| async move {
//             Ok(json!({"pong": true}))
//         })
//         .await;
//
//     // TODO: 注册所有 60+ RPC 方法
//     // - orchestration.*
//     // - provider.*
//     // - git.*
//     // - terminal.*
//     // - workspace.*
//     // - auth.*
//     // - checkpoint.*
// }
