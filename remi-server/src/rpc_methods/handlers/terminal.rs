//! Terminal RPC 方法

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
pub async fn register_terminal_methods(
    router: Arc<RpcRouter>,
    services: Arc<ServiceContainer>,
) {
    info!("注册终端 RPC 方法...");

    // terminal.open
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

    // terminal.write
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

    // terminal.resize
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

    // terminal.close
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

    // terminal.clear
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

    // terminal.restart
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
}
