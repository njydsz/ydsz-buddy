//! WebSocket JSON-RPC implementation for Remi Code.
//!
//! This crate provides the WebSocket server and JSON-RPC protocol handling.

pub mod handler;
pub mod server;

use axum::{
    extract::ws::{Message, WebSocket},
    Router,
};
use futures::{SinkExt, StreamExt};
use remi_contracts::{JsonRpcRequest, JsonRpcResponse};
use remi_core::Result;
use std::sync::Arc;
use tokio::sync::broadcast;
use tracing::{error, info};

pub use handler::RpcState;

/// WebSocket connection state.
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

/// Handle a WebSocket connection.
pub async fn handle_ws_connection(
    ws: WebSocket,
    rpc_state: Arc<RpcState>,
) -> Result<()> {
    let (mut sender, mut receiver) = ws.split();

    let mut notification_rx = rpc_state.ws_state.notification_tx.subscribe();

    // Spawn task to forward notifications to client
    let sender_task = tokio::spawn(async move {
        while let Ok(notification) = notification_rx.recv().await {
            if sender.send(Message::Text(notification)).await.is_err() {
                break;
            }
        }
    });

    // Handle incoming messages
    while let Some(Ok(msg)) = receiver.next().await {
        match msg {
            Message::Text(text) => {
                if let Err(e) = handle_rpc_message(&text, &rpc_state, &mut sender).await {
                    error!("Failed to handle RPC message: {}", e);
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

/// Handle a single RPC message.
async fn handle_rpc_message(
    text: &str,
    state: &Arc<RpcState>,
    sender: &mut futures::stream::SplitSink<WebSocket, Message>,
) -> Result<()> {
    let request: JsonRpcRequest = match serde_json::from_str(text) {
        Ok(req) => req,
        Err(e) => {
            error!("Failed to parse RPC request: {}", e);
            return Ok(());
        }
    };

    info!("Received RPC request: {}", request.method);

    // Route to appropriate handler
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
            error: Some(remi_contracts::JsonRpcError {
                code: -32000,
                message: e.to_string(),
                data: None,
            }),
        },
    };

    let response_text = serde_json::to_string(&response)?;
    let _ = sender.send(Message::Text(response_text)).await;

    Ok(())
}
