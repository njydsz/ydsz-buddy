//! # ydsz CLI - 命令行入口模块
//!
//! 本模块是 ydsz-buddy 服务器的命令行入口，负责整个应用程序的启动引导流程。
//! 编译产物为 `2. 环境变量 YDSZ_BOOTSTRAP_TOKEN` 二进制文件，可通过命令行直接运行。
//!
//! ## 支持的模式
//!
//! - **服务器模式**（默认）：启动 WebSocket 服务器，监听 RPC 请求
//! - **管道模式**（`--pipe`）：从 stdin 读取 prompt，发送给 Provider 并输出结果到 stdout
//!
//! ## 启动流程（服务器模式）
//!
//! ```text
//! 初始化日志 → 解析 CLI 参数 → 加载配置 → 校验配置 → 引导服务 → 启动 WebSocket 服务器
//! ```
//!
//! ## 启动流程（管道模式）
//!
//! ```text
//! 初始化日志 → 解析 CLI 参数 → 加载配置 → 引导服务 → 读取 prompt → 调用 Provider → 输出到 stdout
//! ```

use std::io::{self, BufRead, Read};

use anyhow::{bail, Result};
use clap::Parser;
use ydsz_shared::config::CliArgs;
use ydsz_core::models::RuntimeMode;
use ydsz_core::provider::{
    ProviderKind, ProviderRuntimeEvent, ProviderSessionStartInput, TurnInput,
};
use ydsz_server::{bootstrap, start_server};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> Result<()> {
    // 1. 初始化日志系统（仅在非管道模式下输出到 stderr，避免污染 stdout）
    let args = CliArgs::parse();

    if !args.pipe {
        tracing_subscriber::registry()
            .with(
                tracing_subscriber::EnvFilter::try_from_default_env()
                    .unwrap_or_else(|_| "info".into()),
            )
            .with(tracing_subscriber::fmt::layer())
            .init();

        tracing::info!("启动 ydsz-buddy 服务器");
    } else {
        // 管道模式：日志输出到 stderr，stdout 保留给 Provider 输出
        tracing_subscriber::registry()
            .with(
                tracing_subscriber::EnvFilter::try_from_default_env()
                    .unwrap_or_else(|_| "warn".into()),
            )
            .with(tracing_subscriber::fmt::layer().with_writer(std::io::stderr))
            .init();
    }

    // 2. 加载配置
    let config = ydsz_shared::config::ServerConfig::from_args_and_env(args.clone())?;

    if args.pipe {
        if args.repl {
            return run_repl_mode(&config, &args).await;
        }
        return run_pipe_mode(&config, &args).await;
    }

    // 服务器模式
    config.validate()?;
    tracing::info!(port = config.port, "配置加载完成");

    let result = bootstrap(&config).await?;
    tracing::info!("服务引导完成");

    start_server(
        result.server_addr,
        result.rpc_router,
        std::sync::Arc::new(config.clone()),
        Some(result.services.http_state.clone()),
    )
    .await?;

    Ok(())
}

/// 管道模式：从 stdin 或 --prompt 读取 prompt，调用 Provider 并输出到 stdout
async fn run_pipe_mode(config: &ydsz_shared::config::ServerConfig, args: &CliArgs) -> Result<()> {
    // 1. 读取 prompt
    let prompt = if let Some(ref p) = args.prompt {
        p.clone()
    } else {
        // 从 stdin 读取全部内容
        let mut buffer = String::new();
        io::stdin().read_to_string(&mut buffer)?;
        let trimmed = buffer.trim().to_string();
        if trimmed.is_empty() {
            bail!("管道模式：未提供 prompt。使用 --prompt \"...\" 或通过 stdin 传入。");
        }
        trimmed
    };

    eprintln!("[pipe] prompt: {}", &prompt[..prompt.len().min(80)]);

    // 2. 引导服务（初始化数据库、Provider、Git 等子系统）
    let result = bootstrap(config).await?;

    // 3. 选择 Provider
    let provider_service = &result.services.provider_service;
    let providers = provider_service.list_providers().await.unwrap_or_default();
    if providers.is_empty() {
        bail!("没有可用的 Provider 适配器。请确保至少安装并配置了一个 Provider（如 Codex、Claude 等）。");
    }

    let provider_kind = if let Some(ref provider_name) = args.provider {
        parse_provider_kind(provider_name).unwrap_or_else(|| {
            let available: Vec<String> = providers.iter().map(|p| format!("{:?}", p.provider)).collect();
            eprintln!("未知的 Provider: '{}'。可用的 Provider: {:?}", provider_name, available);
            std::process::exit(1);
        })
    } else {
        // 默认使用第一个可用的 Provider
        providers[0].provider
    };

    eprintln!("[pipe] provider: {:?}", provider_kind);

    // 4. 使用工作目录（--cwd 或当前目录）
    let _cwd = args
        .cwd
        .clone()
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_default());

    // 5. 启动 Provider 会话
    let thread_id = uuid::Uuid::new_v4().to_string();
    let session_input = ProviderSessionStartInput {
        thread_id: thread_id.clone(),
        provider: provider_kind,
        model: args.model.clone().unwrap_or_default(),
        runtime_mode: RuntimeMode::Code,
        sandbox_mode: None,
        approval_policy: None,
    };

    let adapter = provider_service.get_adapter(provider_kind).await.map_err(|e| {
        anyhow::anyhow!("无法获取 Provider 适配器 {:?}: {}", provider_kind, e)
    })?;

    let session = adapter.start_session(session_input).await.map_err(|e| {
        anyhow::anyhow!("启动 Provider 会话失败: {}", e)
    })?;

    eprintln!("[pipe] session started: {}", session.session_id);

    // 6. 发送 Turn
    let turn_id = uuid::Uuid::new_v4().to_string();
    let turn_input = TurnInput {
        thread_id: thread_id.clone(),
        turn_id: turn_id.clone(),
        provider: provider_kind,
        message: prompt,
        parent_turn_id: None,
        skills: Vec::new(),
    };

    let _turn_result = adapter.send_turn(turn_input).await.map_err(|e| {
        anyhow::anyhow!("发送 Turn 失败: {}", e)
    })?;

    // 7. 订阅事件流，输出 assistant 的文本到 stdout
    let mut event_rx = adapter.stream_events().await.map_err(|e| {
        anyhow::anyhow!("订阅 Provider 事件流失败: {}", e)
    })?;

    // 收集完整输出
    let mut full_text = String::new();
    let mut turn_completed = false;

    loop {
        tokio::select! {
            event = event_rx.recv() => {
                match event {
                    Ok(ProviderRuntimeEvent::TurnDelta { turn_id: tid, delta, .. }) if tid == turn_id => {
                        // 实时输出增量文本到 stdout
                        print!("{}", delta);
                        io::Write::flush(&mut io::stdout())?;
                        full_text.push_str(&delta);
                    }
                    Ok(ProviderRuntimeEvent::TurnCompleted { turn_id: tid, .. }) if tid == turn_id => {
                        turn_completed = true;
                        break;
                    }
                    Ok(ProviderRuntimeEvent::TurnInterrupted { turn_id: tid, .. }) if tid == turn_id => {
                        eprintln!("[pipe] turn interrupted");
                        turn_completed = true;
                        break;
                    }
                    Ok(ProviderRuntimeEvent::Error { error, .. }) => {
                        eprintln!("[pipe] error: {}", error);
                        break;
                    }
                    Ok(_) => {
                        // 其他事件，忽略
                    }
                    Err(e) => {
                        eprintln!("[pipe] event receive error: {}", e);
                        break;
                    }
                }
            }
            // 超时保护：60秒无事件自动退出
            _ = tokio::time::sleep(std::time::Duration::from_secs(60)) => {
                eprintln!("[pipe] timeout: 60s without events");
                break;
            }
        }
    }

    // 8. 清理会话
    let _ = adapter.stop_session(&thread_id).await;

    if turn_completed {
        eprintln!("[pipe] done");
    } else {
        eprintln!("[pipe] incomplete");
    }

    Ok(())
}

/// 解析 Provider 名称字符串为 ProviderKind 枚举
fn parse_provider_kind(name: &str) -> Option<ProviderKind> {
    match name.to_lowercase().as_str() {
        "claude" | "claudeagent" | "claude_agent" => Some(ProviderKind::ClaudeAgent),
        "codex" => Some(ProviderKind::Codex),
        "cursor" => Some(ProviderKind::Cursor),
        "gemini" => Some(ProviderKind::Gemini),
        "grok" => Some(ProviderKind::Grok),
        "kilo" | "kilocode" => Some(ProviderKind::Kilo),
        "opencode" => Some(ProviderKind::OpenCode),
        "pi" => Some(ProviderKind::Pi),
        // 国内 9 家 Provider
        "glm" | "zhipu" | "bigmodel" => Some(ProviderKind::Glm),
        "deepseek" => Some(ProviderKind::DeepSeek),
        "moonshot" | "kimi" => Some(ProviderKind::Moonshot),
        "qwen" | "dashscope" => Some(ProviderKind::Qwen),
        "mimo" => Some(ProviderKind::Mimo),
        "minimax" => Some(ProviderKind::MiniMax),
        "doubao" | "ark" => Some(ProviderKind::Doubao),
        "ernie" | "qianfan" => Some(ProviderKind::Ernie),
        "hunyuan" => Some(ProviderKind::Hunyuan),
        _ => None,
    }
}

/// REPL 模式：交互式多轮对话，保持 Provider 会话活跃
async fn run_repl_mode(config: &ydsz_shared::config::ServerConfig, args: &CliArgs) -> Result<()> {
    // 1. 引导服务
    let result = bootstrap(config).await?;

    // 2. 选择 Provider
    let provider_service = &result.services.provider_service;
    let providers = provider_service.list_providers().await.unwrap_or_default();
    if providers.is_empty() {
        bail!("没有可用的 Provider 适配器。请确保至少安装并配置了一个 Provider。");
    }

    let provider_kind = if let Some(ref provider_name) = args.provider {
        parse_provider_kind(provider_name).unwrap_or_else(|| {
            let available: Vec<String> = providers.iter().map(|p| format!("{:?}", p.provider)).collect();
            eprintln!("未知的 Provider: '{}'。可用的 Provider: {:?}", provider_name, available);
            std::process::exit(1);
        })
    } else {
        providers[0].provider
    };

    let _cwd = args
        .cwd
        .clone()
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_default());

    eprintln!("[repl] provider: {:?}", provider_kind);
    eprintln!("[repl] 输入 prompt 开始对话，输入 /exit 退出");

    // 3. 启动 Provider 会话
    let thread_id = uuid::Uuid::new_v4().to_string();
    let session_input = ProviderSessionStartInput {
        thread_id: thread_id.clone(),
        provider: provider_kind,
        model: args.model.clone().unwrap_or_default(),
        runtime_mode: RuntimeMode::Code,
        sandbox_mode: None,
        approval_policy: None,
    };

    let adapter = provider_service.get_adapter(provider_kind).await.map_err(|e| {
        anyhow::anyhow!("无法获取 Provider 适配器 {:?}: {}", provider_kind, e)
    })?;

    let session = adapter.start_session(session_input).await.map_err(|e| {
        anyhow::anyhow!("启动 Provider 会话失败: {}", e)
    })?;

    eprintln!("[repl] session started: {}", session.session_id);

    // 4. REPL 循环
    let stdin = io::stdin();
    let reader = io::BufReader::new(stdin);
    let mut lines = reader.lines();
    let mut turn_count = 0u32;

    loop {
        eprint!("\n[repl] > ");
        let prompt = match lines.next() {
            Some(Ok(line)) => line,
            Some(Err(e)) => {
                eprintln!("[repl] stdin 读取错误: {}", e);
                break;
            }
            None => {
                // EOF (Ctrl+D)
                eprintln!("[repl] EOF");
                break;
            }
        };

        let trimmed = prompt.trim();
        if trimmed.is_empty() {
            continue;
        }
        if trimmed == "/exit" || trimmed == "/quit" {
            eprintln!("[repl] 退出");
            break;
        }

        turn_count += 1;
        let turn_id = uuid::Uuid::new_v4().to_string();
        let turn_input = TurnInput {
            thread_id: thread_id.clone(),
            turn_id: turn_id.clone(),
            provider: provider_kind,
            message: trimmed.to_string(),
            parent_turn_id: None,
            skills: Vec::new(),
        };

        let _turn_result = match adapter.send_turn(turn_input).await {
            Ok(r) => r,
            Err(e) => {
                eprintln!("[repl] 发送 Turn 失败: {}", e);
                continue;
            }
        };

        // 订阅事件流并输出响应
        let mut event_rx = match adapter.stream_events().await {
            Ok(rx) => rx,
            Err(e) => {
                eprintln!("[repl] 订阅事件流失败: {}", e);
                continue;
            }
        };

        println!();
        let mut turn_completed = false;

        loop {
            tokio::select! {
                event = event_rx.recv() => {
                    match event {
                        Ok(ProviderRuntimeEvent::TurnDelta { turn_id: tid, delta, .. }) if tid == turn_id => {
                            print!("{}", delta);
                            io::Write::flush(&mut io::stdout())?;
                        }
                        Ok(ProviderRuntimeEvent::TurnCompleted { turn_id: tid, .. }) if tid == turn_id => {
                            turn_completed = true;
                            break;
                        }
                        Ok(ProviderRuntimeEvent::TurnInterrupted { turn_id: tid, .. }) if tid == turn_id => {
                            eprintln!("\n[repl] turn interrupted");
                            turn_completed = true;
                            break;
                        }
                        Ok(ProviderRuntimeEvent::Error { error, .. }) => {
                            eprintln!("\n[repl] error: {}", error);
                            break;
                        }
                        Ok(_) => {}
                        Err(e) => {
                            eprintln!("\n[repl] event receive error: {}", e);
                            break;
                        }
                    }
                }
                _ = tokio::time::sleep(std::time::Duration::from_secs(120)) => {
                    eprintln!("\n[repl] timeout: 120s without events");
                    break;
                }
            }
        }

        if turn_completed {
            println!();
        }
    }

    // 5. 清理会话
    let _ = adapter.stop_session(&thread_id).await;
    eprintln!("[repl] session closed, {} turns completed", turn_count);

    Ok(())
}
