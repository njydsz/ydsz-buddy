//! # Remi CLI - 命令行入口模块
//!
//! 本模块是 Remi Code 服务器的命令行入口，负责整个应用程序的启动引导流程。
//!
//! ## 核心职责
//!
//! 1. **日志初始化**：基于 `tracing` 生态构建结构化日志系统，支持通过环境变量 `RUST_LOG`
//!    动态调整日志级别，默认级别为 `info`。
//! 2. **命令行参数解析**：使用 `clap` 派生宏解析用户传入的 CLI 参数（如端口号、主机地址等），
//!    参数定义详见 [`remi_config::CliArgs`]。
//! 3. **配置加载与校验**：通过 [`remi_config::ServerConfig`] 合并 CLI 参数与环境变量，
//!    生成运行时配置并执行合法性校验。
//! 4. **RPC 路由初始化**：创建 [`RpcRouter`] 实例用于后续注册 JSON-RPC 方法处理器。
//! 5. **WebSocket 服务器启动**：构建 [`WebSocketServer`] 并在指定地址上启动监听，
//!    为客户端提供基于 WebSocket 的 JSON-RPC 通信服务。
//!
//! ## 使用场景
//!
//! 本模块作为二进制 crate 的 `main` 函数入口，仅在以下场景中被调用：
//!
//! - 通过 `cargo run` 或编译后的可执行文件直接启动 Remi Code 服务器。
//! - 在容器化部署（如 Docker）中作为 ENTRYPOINT 启动服务。
//!
//! ## 启动流程
//!
//! ```text
//! 初始化日志 → 解析 CLI 参数 → 加载并校验配置 → 创建 RPC 路由 → 启动 WebSocket 服务器
//! ```
//!
//! ## 依赖说明
//!
//! - [`anyhow`]：提供便捷错误处理机制。
//! - [`clap`]：命令行参数解析框架。
//! - [`tokio`]：异步运行时，提供多线程调度与 I/O 驱动。
//! - [`tracing_subscriber`]：结构化日志采集与输出。
//! - [`remi_config`]：配置管理模块，负责参数解析、配置合并与校验。
//! - [`remi_server`]：服务器核心模块，提供 WebSocket 服务与 RPC 路由能力。

use std::net::SocketAddr;
use std::sync::Arc;

use anyhow::Result;
use clap::Parser;
use remi_config::CliArgs;
use remi_server::{RpcRouter, WebSocketServer};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

/// # 程序主入口函数
///
/// 本函数是 Remi Code 服务器的异步主入口，负责协调整个应用的启动流程。
/// 使用 `#[tokio::main]` 宏初始化 Tokio 异步运行时，并在多线程环境下执行异步任务。
///
/// ## 执行流程
///
/// 1. **初始化日志系统**
///    - 构建 `tracing_subscriber` 注册表。
///    - 通过 `EnvFilter` 从环境变量 `RUST_LOG` 读取日志级别，若未设置则默认使用 `info` 级别。
///    - 附加格式化日志层（`fmt::layer`），将日志输出到标准输出。
///
/// 2. **解析命令行参数**
///    - 调用 [`CliArgs::parse`] 解析用户传入的 CLI 参数（如 `--port`、`--host` 等）。
///    - 若参数无效或缺失必要值，`clap` 会自动打印帮助信息并退出。
///
/// 3. **加载并校验配置**
///    - 调用 [`ServerConfig::from_args_and_env`] 合并 CLI 参数与环境变量，生成运行时配置。
///    - 调用 [`config.validate`] 校验配置合法性（如端口范围、主机格式等）。
///
/// 4. **初始化 RPC 路由**
///    - 创建 [`RpcRouter`] 实例并使用 `Arc` 包装，以便在多线程环境中共享。
///    - 预留 RPC 方法注册接口（当前为 TODO 状态）。
///
/// 5. **构建服务器地址**
///    - 从配置中提取主机地址（默认 `127.0.0.1`）和端口号。
///    - 解析为 [`SocketAddr`] 类型，若格式无效则触发 panic。
///
/// 6. **启动 WebSocket 服务器**
///    - 创建 [`WebSocketServer`] 实例，绑定指定地址并注入 RPC 路由。
///    - 调用 [`server.start`] 启动监听，阻塞当前任务直至服务器关闭或发生错误。
///    - 若启动失败，记录错误日志并返回错误。
///
/// ## 返回值
///
/// - `Ok(())`：服务器正常关闭。
/// - `Err(anyhow::Error)`：启动过程中发生错误（如配置无效、端口被占用、I/O 异常等）。
///
/// ## 错误处理
///
/// 本函数使用 `anyhow` 库进行错误管理，所有中间错误会自动转换为 `anyhow::Error` 类型。
/// 服务器启动失败时，错误会通过 `tracing::error!` 记录到日志系统。
///
/// ## 示例
///
/// ```bash
/// # 默认启动（监听 127.0.0.1:3000）
/// cargo run
///
/// # 指定端口启动
/// cargo run -- --port 8080
///
/// # 通过环境变量设置日志级别
/// RUST_LOG=debug cargo run
/// ```
///
/// ## 注意事项
///
/// - 本函数为阻塞式执行，启动成功后会持续运行直至收到终止信号或发生致命错误。
/// - RPC 方法注册功能尚未实现（见 TODO 注释），当前仅支持基础连接。
/// - 服务器地址解析失败时会触发 panic，确保配置的主机地址格式正确。
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
    let host = config.host.unwrap_or_else(|| "127.0.0.1".to_string());
    let addr: SocketAddr = format!("{}:{}", host, config.port)
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
