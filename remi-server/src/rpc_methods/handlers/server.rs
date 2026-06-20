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
                let mut errors: Vec<String> = Vec::new();
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
