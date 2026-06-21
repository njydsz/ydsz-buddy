//! # 终端 RPC 方法模块
//!
//! 本模块注册所有与终端会话相关的 RPC 方法，包括终端的创建、写入、
//! 调整大小、关闭、清屏和重启等操作。
//!
//! ## 注册的方法
//!
//! | 方法名 | 说明 |
//! |--------|------|
//! | `terminal.open` | 打开新的终端会话 |
//! | `terminal.write` | 向终端写入数据 |
//! | `terminal.resize` | 调整终端大小 |
//! | `terminal.close` | 关闭终端会话 |
//! | `terminal.clear` | 清空终端屏幕 |
//! | `terminal.restart` | 重启终端会话 |

use std::sync::Arc;

use remi_terminal::{
    TerminalCloseInput, TerminalOpenInput, TerminalResizeInput, TerminalRestartInput,
    TerminalWriteInput,
};
use serde_json::Value;
use tracing::info;

use crate::rpc::RpcRouter;
use crate::rpc_methods::registration::ServiceContainer;

/// 注册终端相关 RPC 方法
///
/// 将所有终端方法注册到路由器，每个方法绑定对应的服务实例。
///
/// # 参数
///
/// - `router`: RPC 路由器实例
/// - `services`: 服务容器，提供 TerminalManager 实例
pub async fn register_terminal_methods(
    router: Arc<RpcRouter>,
    services: Arc<ServiceContainer>,
) {
    info!("注册终端 RPC 方法...");

    // terminal.open - 打开新的终端会话
    // 参数: { threadId: string, terminalId?: string, cwd: string, cols?: number, rows?: number, env?: Record<string, string> }
    // 返回: TerminalSnapshot
    let terminal_manager = services.terminal_manager.clone();
    router
        .register("terminal.open", move |params: Option<Value>| {
            let terminal_manager = terminal_manager.clone();
            async move {
                let params = params.ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing params".to_string())
                })?;

                let thread_id = params
                    .get("threadId")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing threadId".to_string())
                    })?
                    .to_string();

                let terminal_id = params
                    .get("terminalId")
                    .and_then(|v| v.as_str())
                    .unwrap_or("default")
                    .to_string();

                let cwd = params
                    .get("cwd")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing cwd".to_string())
                    })?
                    .to_string();

                let cols = params
                    .get("cols")
                    .and_then(|v| v.as_u64())
                    .map(|c| c as u16);

                let rows = params
                    .get("rows")
                    .and_then(|v| v.as_u64())
                    .map(|r| r as u16);

                let env = params
                    .get("env")
                    .and_then(|v| v.as_object())
                    .map(|map| {
                        map.iter()
                            .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
                            .collect()
                    });

                let input = TerminalOpenInput {
                    thread_id,
                    terminal_id,
                    cwd,
                    cols,
                    rows,
                    env,
                };

                let snapshot = terminal_manager.open(input).await?;
                serde_json::to_value(snapshot)
                    .map_err(|e| crate::error::ServerError::InternalError(e.to_string()))
            }
        })
        .await;

    // terminal.write - 向终端写入数据
    // 参数: { threadId: string, terminalId?: string, data: string }
    // 返回: null
    let terminal_manager = services.terminal_manager.clone();
    router
        .register("terminal.write", move |params: Option<Value>| {
            let terminal_manager = terminal_manager.clone();
            async move {
                let params = params.ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing params".to_string())
                })?;

                let thread_id = params
                    .get("threadId")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing threadId".to_string())
                    })?
                    .to_string();

                let terminal_id = params
                    .get("terminalId")
                    .and_then(|v| v.as_str())
                    .unwrap_or("default")
                    .to_string();

                let data = params
                    .get("data")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing data".to_string())
                    })?
                    .to_string();

                let input = TerminalWriteInput {
                    thread_id,
                    terminal_id,
                    data,
                };

                terminal_manager.write(input).await?;
                Ok(Value::Null)
            }
        })
        .await;

    // terminal.resize - 调整终端大小
    // 参数: { threadId: string, terminalId?: string, cols: number, rows: number }
    // 返回: null
    let terminal_manager = services.terminal_manager.clone();
    router
        .register("terminal.resize", move |params: Option<Value>| {
            let terminal_manager = terminal_manager.clone();
            async move {
                let params = params.ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing params".to_string())
                })?;

                let thread_id = params
                    .get("threadId")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing threadId".to_string())
                    })?
                    .to_string();

                let terminal_id = params
                    .get("terminalId")
                    .and_then(|v| v.as_str())
                    .unwrap_or("default")
                    .to_string();

                let cols = params
                    .get("cols")
                    .and_then(|v| v.as_u64())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing cols".to_string())
                    })? as u16;

                let rows = params
                    .get("rows")
                    .and_then(|v| v.as_u64())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing rows".to_string())
                    })? as u16;

                let input = TerminalResizeInput {
                    thread_id,
                    terminal_id,
                    cols,
                    rows,
                };

                terminal_manager.resize(input).await?;
                Ok(Value::Null)
            }
        })
        .await;

    // terminal.close - 关闭终端会话
    // 参数: { threadId: string, terminalId?: string, deleteHistory?: boolean }
    // 返回: null
    let terminal_manager = services.terminal_manager.clone();
    router
        .register("terminal.close", move |params: Option<Value>| {
            let terminal_manager = terminal_manager.clone();
            async move {
                let params = params.ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing params".to_string())
                })?;

                let thread_id = params
                    .get("threadId")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing threadId".to_string())
                    })?
                    .to_string();

                let terminal_id = params
                    .get("terminalId")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());

                let delete_history = params
                    .get("deleteHistory")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);

                let input = TerminalCloseInput {
                    thread_id,
                    terminal_id,
                    delete_history,
                };

                terminal_manager.close(input).await?;
                Ok(Value::Null)
            }
        })
        .await;

    // terminal.clear - 清空终端屏幕
    // 参数: { threadId: string, terminalId?: string }
    // 返回: null
    let terminal_manager = services.terminal_manager.clone();
    router
        .register("terminal.clear", move |params: Option<Value>| {
            let terminal_manager = terminal_manager.clone();
            async move {
                let params = params.ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing params".to_string())
                })?;

                let thread_id = params
                    .get("threadId")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing threadId".to_string())
                    })?;

                let terminal_id = params
                    .get("terminalId")
                    .and_then(|v| v.as_str())
                    .unwrap_or("default");

                terminal_manager.clear(thread_id, terminal_id).await?;
                Ok(Value::Null)
            }
        })
        .await;

    // terminal.restart - 重启终端会话
    // 参数: { threadId: string, terminalId?: string, cwd: string, cols?: number, rows?: number, env?: Record<string, string> }
    // 返回: TerminalSnapshot
    let terminal_manager = services.terminal_manager.clone();
    router
        .register("terminal.restart", move |params: Option<Value>| {
            let terminal_manager = terminal_manager.clone();
            async move {
                let params = params.ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing params".to_string())
                })?;

                let thread_id = params
                    .get("threadId")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing threadId".to_string())
                    })?
                    .to_string();

                let terminal_id = params
                    .get("terminalId")
                    .and_then(|v| v.as_str())
                    .unwrap_or("default")
                    .to_string();

                let cwd = params
                    .get("cwd")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing cwd".to_string())
                    })?
                    .to_string();

                let cols = params
                    .get("cols")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(80) as u16;

                let rows = params
                    .get("rows")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(24) as u16;

                let env = params
                    .get("env")
                    .and_then(|v| v.as_object())
                    .map(|map| {
                        map.iter()
                            .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
                            .collect()
                    });

                let input = TerminalRestartInput {
                    thread_id,
                    terminal_id,
                    cwd,
                    cols,
                    rows,
                    env,
                };

                let snapshot = terminal_manager.restart(input).await?;
                serde_json::to_value(snapshot)
                    .map_err(|e| crate::error::ServerError::InternalError(e.to_string()))
            }
        })
        .await;

    info!("终端 RPC 方法注册完成");

    // terminal.getTitle - 获取终端会话标题
    // 参数: { sessionId: string }
    // 返回: { title: string | null }
    let terminal_title_tracker = services.terminal_title_tracker.clone();
    router
        .register("terminal.getTitle", move |params: Option<Value>| {
            let terminal_title_tracker = terminal_title_tracker.clone();
            async move {
                let params = params.ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing params".to_string())
                })?;

                let session_id = params
                    .get("sessionId")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams(
                            "Missing sessionId".to_string(),
                        )
                    })?
                    .to_string();

                let title = terminal_title_tracker.get_title(&session_id);
                let result = serde_json::json!({ "title": title });
                Ok(result)
            }
        })
        .await;

    // terminal.setTitle - 设置终端会话标题
    // 参数: { sessionId: string, title: string }
    // 返回: { success: true }
    let terminal_title_tracker = services.terminal_title_tracker.clone();
    router
        .register("terminal.setTitle", move |params: Option<Value>| {
            let terminal_title_tracker = terminal_title_tracker.clone();
            async move {
                let params = params.ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing params".to_string())
                })?;

                let session_id = params
                    .get("sessionId")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams(
                            "Missing sessionId".to_string(),
                        )
                    })?
                    .to_string();

                let title = params
                    .get("title")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams(
                            "Missing title".to_string(),
                        )
                    })?
                    .to_string();

                terminal_title_tracker.update_title(&session_id, &title);
                let result = serde_json::json!({ "success": true });
                Ok(result)
            }
        })
        .await;
}
