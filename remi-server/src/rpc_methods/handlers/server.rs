//! # 服务器管理 RPC 方法模块
//!
//! 本模块注册与服务器管理相关的 RPC 方法，包括配置读取/更新、Provider 刷新和诊断信息查询等。
//!
//! ## 注册的方法
//!
//! | 方法名 | 说明 |
//! |--------|------|
//! | `server.getSettings` | 获取服务器配置 |
//! | `server.updateSettings` | 更新服务器配置 |
//! | `server.refreshProviders` | 刷新 Provider 列表 |
//! | `server.getDiagnostics` | 获取服务器诊断信息 |
//! | `server.getConfig` | 获取服务器运行时配置 |
//! | `server.getEnvironment` | 获取服务器环境信息 |

use std::sync::Arc;

use serde_json::Value;
use tracing::info;

use crate::rpc::RpcRouter;
use crate::rpc_methods::registration::ServiceContainer;

/// 注册服务器相关 RPC 方法
///
/// 将所有服务器管理方法注册到路由器，每个方法绑定对应的服务实例。
///
/// # 参数
///
/// - `router`: RPC 路由器实例
/// - `services`: 服务容器，提供各服务实例
pub async fn register_server_methods(
    router: Arc<RpcRouter>,
    services: Arc<ServiceContainer>,
) {
    info!("注册服务器 RPC 方法...");

    // server.getSettings - 获取服务器配置
    let config = services.config.clone();
    router
        .register("server.getSettings", move |_params: Option<Value>| {
            let config = config.clone();
            async move {
                // 从配置文件读取设置
                let settings_path = &config.settings_path;
                
                // 如果配置文件存在，读取它
                if settings_path.exists() {
                    match tokio::fs::read_to_string(settings_path).await {
                        Ok(content) => {
                            match serde_json::from_str::<Value>(&content) {
                                Ok(settings) => Ok(settings),
                                Err(_) => {
                                    // 配置文件损坏，返回默认配置
                                    Ok(get_default_settings())
                                }
                            }
                        }
                        Err(_) => Ok(get_default_settings()),
                    }
                } else {
                    Ok(get_default_settings())
                }
            }
        })
        .await;

    // server.updateSettings - 更新服务器配置
    let config = services.config.clone();
    router
        .register("server.updateSettings", move |params: Option<Value>| {
            let config = config.clone();
            async move {
                let new_settings = params.ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing settings params".to_string())
                })?;

                let settings_path = &config.settings_path;
                
                // 确保目录存在
                if let Some(parent) = settings_path.parent() {
                    tokio::fs::create_dir_all(parent).await.map_err(|e| {
                        crate::error::ServerError::InternalError(format!(
                            "Failed to create settings directory: {}",
                            e
                        ))
                    })?;
                }

                // 写入配置文件
                let content = serde_json::to_string_pretty(&new_settings).map_err(|e| {
                    crate::error::ServerError::InternalError(format!(
                        "Failed to serialize settings: {}",
                        e
                    ))
                })?;

                tokio::fs::write(settings_path, content).await.map_err(|e| {
                    crate::error::ServerError::InternalError(format!(
                        "Failed to write settings file: {}",
                        e
                    ))
                })?;

                info!("配置已更新: {:?}", settings_path);
                Ok(Value::Null)
            }
        })
        .await;

    // server.refreshProviders - 刷新 Provider 列表
    let provider_service = services.provider_service.clone();
    router
        .register("server.refreshProviders", move |_params: Option<Value>| {
            let provider_service = provider_service.clone();
            async move {
                provider_service.refresh_providers().await?;
                Ok(Value::Null)
            }
        })
        .await;

    // server.getDiagnostics - 获取服务器诊断信息
    let config = services.config.clone();
    let push_channel_manager = services.push_channel_manager.clone();
    router
        .register("server.getDiagnostics", move |_params: Option<Value>| {
            let config = config.clone();
            let push_channel_manager = push_channel_manager.clone();
            async move {
                let errors: Vec<String> = Vec::new();
                let mut warnings: Vec<String> = Vec::new();

                // 检查数据库文件
                if !config.db_path.exists() {
                    warnings.push(format!(
                        "Database file not found: {:?}",
                        config.db_path
                    ));
                }

                // 检查日志目录
                if !config.logs_dir.exists() {
                    warnings.push(format!(
                        "Logs directory not found: {:?}",
                        config.logs_dir
                    ));
                }

                // 检查推送通道状态
                let active_channels = push_channel_manager.active_channels().await;
                if active_channels.is_empty() {
                    warnings.push("No active push channels".to_string());
                }

                let status = if errors.is_empty() { "ok" } else { "error" };

                Ok(serde_json::json!({
                    "status": status,
                    "errors": errors,
                    "warnings": warnings,
                    "activeChannels": active_channels
                }))
            }
        })
        .await;

    // server.getConfig - 获取服务器运行时配置
    let config = services.config.clone();
    router
        .register("server.getConfig", move |_params: Option<Value>| {
            let config = config.clone();
            async move {
                Ok(serde_json::json!({
                    "mode": config.mode,
                    "port": config.port,
                    "host": config.host,
                    "homeDir": config.base_dir,
                    "baseDir": config.base_dir,
                    "stateDir": config.state_dir,
                    "dbPath": config.db_path,
                    "secretsDir": config.secrets_dir,
                    "logsDir": config.logs_dir,
                    "attachmentsDir": config.attachments_dir,
                    "worktreesDir": config.worktrees_dir,
                    "settingsPath": config.settings_path,
                    "logProviderEvents": config.log_provider_events,
                    "logWebsocketEvents": config.log_websocket_events
                }))
            }
        })
        .await;

    // server.getEnvironment - 获取服务器环境信息
    router
        .register("server.getEnvironment", move |_params: Option<Value>| {
            async move {
                let os = std::env::consts::OS;
                let arch = std::env::consts::ARCH;
                let family = std::env::consts::FAMILY;

                // 获取当前工作目录
                let cwd = std::env::current_dir()
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_else(|_| "unknown".to_string());

                // 获取环境变量（部分）
                let user = std::env::var("USER")
                    .or_else(|_| std::env::var("USERNAME"))
                    .unwrap_or_else(|_| "unknown".to_string());

                Ok(serde_json::json!({
                    "os": os,
                    "arch": arch,
                    "family": family,
                    "cwd": cwd,
                    "user": user,
                    "rustVersion": env!("CARGO_PKG_RUST_VERSION"),
                    "packageVersion": env!("CARGO_PKG_VERSION")
                }))
            }
        })
        .await;

    // server.listWorktrees - 列出 Git Worktree（目前返回空列表）
    // 参数: 无
    // 返回: { worktrees: [] }
    router
        .register("server.listWorktrees", |_params: Option<Value>| {
            async move {
                // TODO: 实现实际的 worktree 列表查询
                Ok(serde_json::json!({ "worktrees": [] }))
            }
        })
        .await;

    // server.updateProvider - 更新指定 Provider 的版本
    // 参数: { providerName: string }
    // 返回: { status: string, output?: string }
    let provider_service = services.provider_service.clone();
    router
        .register("server.updateProvider", move |params: Option<Value>| {
            let provider_service = provider_service.clone();
            async move {
                let params = params.ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing params".to_string())
                })?;

                let provider_name = params
                    .get("providerName")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams(
                            "Missing providerName".to_string(),
                        )
                    })?;

                // 获取 Provider 更新命令
                let update_info = provider_service
                    .get_provider_update_command(provider_name)
                    .await;

                match update_info {
                    Some((cmd, args)) => {
                        // 执行更新命令
                        let output = tokio::process::Command::new(&cmd)
                            .args(&args)
                            .output()
                            .await
                            .map_err(|e| {
                                crate::error::ServerError::InternalError(format!(
                                    "Failed to execute update command: {}",
                                    e
                                ))
                            })?;

                        if output.status.success() {
                            // 刷新 Provider 状态
                            provider_service.refresh_providers().await?;
                            Ok(serde_json::json!({
                                "status": "succeeded",
                                "output": String::from_utf8_lossy(&output.stdout).to_string()
                            }))
                        } else {
                            Ok(serde_json::json!({
                                "status": "failed",
                                "output": String::from_utf8_lossy(&output.stderr).to_string()
                            }))
                        }
                    }
                    None => Ok(serde_json::json!({
                        "status": "unsupported",
                        "output": format!("Provider '{}' does not support updates", provider_name)
                    })),
                }
            }
        })
        .await;

    // server.getProviderUsageSnapshot - 获取 Provider 使用统计
    // 参数: { providerName: string, homeDir?: string }
    // 返回: UsageSnapshot | null
    let provider_service = services.provider_service.clone();
    router
        .register("server.getProviderUsageSnapshot", move |params: Option<Value>| {
            let provider_service = provider_service.clone();
            async move {
                let params = params.ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing params".to_string())
                })?;

                let provider_name = params
                    .get("providerName")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams(
                            "Missing providerName".to_string(),
                        )
                    })?;

                // 查询 Provider 使用统计
                let snapshot = provider_service
                    .get_usage_snapshot(provider_name)
                    .await;

                match snapshot {
                    Some(s) => serde_json::to_value(s)
                        .map_err(|e| crate::error::ServerError::InternalError(e.to_string())),
                    None => Ok(Value::Null),
                }
            }
        })
        .await;

    // server.upsertKeybinding - 创建或更新快捷键绑定
    // 参数: { command: string, keys: string, when?: string }
    // 返回: KeybindingRule[]
    let config = services.config.clone();
    router
        .register("server.upsertKeybinding", move |params: Option<Value>| {
            let config = config.clone();
            async move {
                let params = params.ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing params".to_string())
                })?;

                let command = params
                    .get("command")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing command".to_string())
                    })?
                    .to_string();

                let keys = params
                    .get("keys")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing keys".to_string())
                    })?
                    .to_string();

                let when = params
                    .get("when")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());

                // 快捷键配置文件路径
                let keybindings_path = config.base_dir.join("keybindings.json");

                // 读取现有快捷键
                let mut keybindings: Vec<serde_json::Value> =
                    if keybindings_path.exists() {
                        match tokio::fs::read_to_string(&keybindings_path).await {
                            Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
                            Err(_) => Vec::new(),
                        }
                    } else {
                        Vec::new()
                    };

                // 移除同名 command 的旧绑定
                keybindings.retain(|kb| {
                    kb.get("command")
                        .and_then(|v| v.as_str())
                        .map(|c| c != command)
                        .unwrap_or(true)
                });

                // 添加新绑定
                let new_rule = serde_json::json!({
                    "command": command,
                    "keys": keys,
                    "when": when
                });
                keybindings.push(new_rule);

                // 限制最大数量
                const MAX_KEYBINDINGS: usize = 500;
                if keybindings.len() > MAX_KEYBINDINGS {
                    let start = keybindings.len() - MAX_KEYBINDINGS;
                    keybindings = keybindings[start..].to_vec();
                }

                // 写入文件
                if let Some(parent) = keybindings_path.parent() {
                    tokio::fs::create_dir_all(parent).await.ok();
                }
                let content = serde_json::to_string_pretty(&keybindings).map_err(|e| {
                    crate::error::ServerError::InternalError(format!(
                        "Failed to serialize keybindings: {}",
                        e
                    ))
                })?;
                tokio::fs::write(&keybindings_path, content)
                    .await
                    .map_err(|e| {
                        crate::error::ServerError::InternalError(format!(
                            "Failed to write keybindings: {}",
                            e
                        ))
                    })?;

                serde_json::to_value(keybindings)
                    .map_err(|e| crate::error::ServerError::InternalError(e.to_string()))
            }
        })
        .await;

    info!("服务器 RPC 方法注册完成");
}

/// 获取默认配置
fn get_default_settings() -> Value {
    serde_json::json!({
        "theme": "dark",
        "language": "zh-CN",
        "autoSave": true,
        "fontSize": 14
    })
}
