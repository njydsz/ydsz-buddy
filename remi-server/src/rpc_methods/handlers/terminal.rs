//! Terminal RPC 方法

use std::sync::Arc;

use remi_terminal::TerminalManager;
use serde_json::Value;
use tracing::info;

use crate::error::ServerResult;
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
        .register("terminal.open", move |params| {
            let terminal_manager = terminal_manager.clone();
            async move {
                let params = params.ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing params".to_string())
                })?;

                let cwd = params
                    .get("cwd")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing cwd".to_string())
                    })?;

                let shell = params
                    .get("shell")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());

                let session_id = terminal_manager.open(cwd, shell).await?;
                Ok(serde_json::json!({ "sessionId": session_id }))
            }
        })
        .await;

    // terminal.write
    let terminal_manager = services.terminal_manager.clone();
    router
        .register("terminal.write", move |params| {
            let terminal_manager = terminal_manager.clone();
            async move {
                let params = params.ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing params".to_string())
                })?;

                let session_id = params
                    .get("sessionId")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing sessionId".to_string())
                    })?;

                let data = params
                    .get("data")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing data".to_string())
                    })?;

                terminal_manager.write(session_id, data).await?;
                Ok(Value::Null)
            }
        })
        .await;

    // terminal.resize
    let terminal_manager = services.terminal_manager.clone();
    router
        .register("terminal.resize", move |params| {
            let terminal_manager = terminal_manager.clone();
            async move {
                let params = params.ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing params".to_string())
                })?;

                let session_id = params
                    .get("sessionId")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing sessionId".to_string())
                    })?;

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

                terminal_manager.resize(session_id, cols, rows).await?;
                Ok(Value::Null)
            }
        })
        .await;

    // terminal.close
    let terminal_manager = services.terminal_manager.clone();
    router
        .register("terminal.close", move |params| {
            let terminal_manager = terminal_manager.clone();
            async move {
                let params = params.ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing params".to_string())
                })?;

                let session_id = params
                    .get("sessionId")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing sessionId".to_string())
                    })?;

                terminal_manager.close(session_id).await?;
                Ok(Value::Null)
            }
        })
        .await;

    // terminal.clear
    let terminal_manager = services.terminal_manager.clone();
    router
        .register("terminal.clear", move |params| {
            let terminal_manager = terminal_manager.clone();
            async move {
                let params = params.ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing params".to_string())
                })?;

                let session_id = params
                    .get("sessionId")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing sessionId".to_string())
                    })?;

                terminal_manager.clear(session_id).await?;
                Ok(Value::Null)
            }
        })
        .await;

    // terminal.restart
    let terminal_manager = services.terminal_manager.clone();
    router
        .register("terminal.restart", move |params| {
            let terminal_manager = terminal_manager.clone();
            async move {
                let params = params.ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing params".to_string())
                })?;

                let session_id = params
                    .get("sessionId")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing sessionId".to_string())
                    })?;

                terminal_manager.restart(session_id).await?;
                Ok(Value::Null)
            }
        })
        .await;

    info!("终端 RPC 方法注册完成");
}
