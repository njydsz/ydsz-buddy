//! WebSocket JSON-RPC implementation for Remi Code.
//!
//! This crate provides the WebSocket server and JSON-RPC protocol handling.

pub mod handler;
pub mod server;

use axum::extract::ws::{Message, WebSocket};
use futures::{SinkExt, StreamExt};
use remi_contracts::{JsonRpcError, JsonRpcRequest, JsonRpcResponse};
use remi_core::Result;
use std::sync::Arc;
use tokio::sync::{broadcast, mpsc};
use tracing::{error, info};

pub use handler::RpcState;

/// WebSocket connection state.
#[derive(Clone)]
pub struct WsState {
    /// Broadcast sender for notifications.
    pub notification_tx: broadcast::Sender<String>,
}

impl WsState {
    /// Create a new WebSocket state.
    pub fn new() -> Self {
        let (notification_tx, _) = broadcast::channel(1000);
        Self { notification_tx }
    }
}

impl Default for WsState {
    fn default() -> Self {
        Self::new()
    }
}

/// Handle a WebSocket connection.
pub async fn handle_ws_connection(ws: WebSocket, rpc_state: Arc<RpcState>) -> Result<()> {
    let (mut sender, mut receiver) = ws.split();

    let mut notification_rx = rpc_state.ws_state.notification_tx.subscribe();
    let (response_tx, mut response_rx) = mpsc::channel::<String>(100);

    // Spawn task to forward notifications and responses to client
    let sender_task = tokio::spawn(async move {
        loop {
            tokio::select! {
                Ok(notification) = notification_rx.recv() => {
                    if sender.send(Message::Text(notification)).await.is_err() {
                        break;
                    }
                }
                Some(response) = response_rx.recv() => {
                    if sender.send(Message::Text(response)).await.is_err() {
                        break;
                    }
                }
                else => break,
            }
        }
    });

    // Handle incoming messages
    while let Some(Ok(msg)) = receiver.next().await {
        match msg {
            Message::Text(text) => {
                let response_str = handle_rpc_request(&text, &rpc_state).await;
                if response_tx.send(response_str).await.is_err() {
                    break;
                }
            }
            Message::Close(_) => {
                info!("WebSocket connection closed");
                break;
            }
            _ => {}
        }
    }

    sender_task.abort();
    Ok(())
}

/// Handle a single RPC request and return the response as a string.
async fn handle_rpc_request(text: &str, state: &Arc<RpcState>) -> String {
    let request: JsonRpcRequest = match serde_json::from_str(text) {
        Ok(req) => req,
        Err(e) => {
            error!("Failed to parse RPC request: {}", e);
            return String::new();
        }
    };

    info!("Received RPC request: {}", request.method);

    let response = match handler::handle_method(&request.method, request.params, state).await {
        Ok(result) => JsonRpcResponse {
            jsonrpc: "2.0".to_string(),
            id: request.id,
            result: Some(result),
            error: None,
        },
        Err(e) => JsonRpcResponse {
            jsonrpc: "2.0".to_string(),
            id: request.id,
            result: None,
            error: Some(JsonRpcError {
                code: -32000,
                message: e.to_string(),
                data: None,
            }),
        },
    };

    serde_json::to_string(&response).unwrap_or_default()
}
