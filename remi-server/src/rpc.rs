//! WebSocket RPC 框架

use std::collections::HashMap;
use std::sync::Arc;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::sync::RwLock;
use tracing::{debug, error, info};

use crate::error::ServerResult;

/// JSON-RPC 请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcRequest {
    /// JSON-RPC 版本
    pub jsonrpc: String,
    /// 请求 ID
    pub id: Option<Value>,
    /// 方法名
    pub method: String,
    /// 参数
    pub params: Option<Value>,
}

/// JSON-RPC 响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcResponse {
    /// JSON-RPC 版本
    pub jsonrpc: String,
    /// 请求 ID
    pub id: Option<Value>,
    /// 结果
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    /// 错误
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<JsonRpcError>,
}

/// JSON-RPC 错误
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcError {
    /// 错误码
    pub code: i32,
    /// 错误消息
    pub message: String,
    /// 数据
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
}

/// JSON-RPC 通知（推送）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcNotification {
    /// JSON-RPC 版本
    pub jsonrpc: String,
    /// 方法名
    pub method: String,
    /// 参数
    pub params: Option<Value>,
}

/// RPC 方法处理器
#[async_trait]
pub trait RpcMethodHandler: Send + Sync {
    /// 处理方法调用
    async fn handle(&self, params: Option<Value>) -> ServerResult<Value>;
}

/// RPC 方法处理器函数
#[async_trait]
impl<F, Fut> RpcMethodHandler for F
where
    F: Fn(Option<Value>) -> Fut + Send + Sync,
    Fut: std::future::Future<Output = ServerResult<Value>> + Send,
{
    async fn handle(&self, params: Option<Value>) -> ServerResult<Value> {
        (self)(params).await
    }
}

/// RPC 路由器
pub struct RpcRouter {
    methods: Arc<RwLock<HashMap<String, Arc<dyn RpcMethodHandler>>>>,
}

impl RpcRouter {
    /// 创建新的 RPC 路由器
    pub fn new() -> Self {
        Self {
            methods: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// 注册 RPC 方法
    pub async fn register<H>(&self, method: &str, handler: H)
    where
        H: RpcMethodHandler + 'static,
    {
        debug!("注册 RPC 方法: {}", method);
        let mut methods = self.methods.write().await;
        methods.insert(method.to_string(), Arc::new(handler));
    }

    /// 处理 RPC 请求
    pub async fn handle_request(&self, request: JsonRpcRequest) -> JsonRpcResponse {
        info!("处理 RPC 请求: {}", request.method);

        let methods = self.methods.read().await;

        match methods.get(&request.method) {
            Some(handler) => {
                match handler.handle(request.params).await {
                    Ok(result) => JsonRpcResponse {
                        jsonrpc: "2.0".to_string(),
                        id: request.id,
                        result: Some(result),
                        error: None,
                    },
                    Err(e) => {
                        error!("RPC 方法执行失败: {} - {}", request.method, e);
                        JsonRpcResponse {
                            jsonrpc: "2.0".to_string(),
                            id: request.id,
                            result: None,
                            error: Some(JsonRpcError {
                                code: -32000,
                                message: e.to_string(),
                                data: None,
                            }),
                        }
                    }
                }
            }
            None => {
                error!("RPC 方法未找到: {}", request.method);
                JsonRpcResponse {
                    jsonrpc: "2.0".to_string(),
                    id: request.id,
                    result: None,
                    error: Some(JsonRpcError {
                        code: -32601,
                        message: format!("Method not found: {}", request.method),
                        data: None,
                    }),
                }
            }
        }
    }

    /// 获取已注册的方法列表
    pub async fn list_methods(&self) -> Vec<String> {
        let methods = self.methods.read().await;
        methods.keys().cloned().collect()
    }
}

impl Default for RpcRouter {
    fn default() -> Self {
        Self::new()
    }
}

/// 创建成功响应
pub fn success_response(id: Option<Value>, result: Value) -> JsonRpcResponse {
    JsonRpcResponse {
        jsonrpc: "2.0".to_string(),
        id,
        result: Some(result),
        error: None,
    }
}

/// 创建错误响应
pub fn error_response(id: Option<Value>, code: i32, message: String) -> JsonRpcResponse {
    JsonRpcResponse {
        jsonrpc: "2.0".to_string(),
        id,
        result: None,
        error: Some(JsonRpcError {
            code,
            message,
            data: None,
        }),
    }
}

/// 创建通知（推送）
pub fn create_notification(method: &str, params: Option<Value>) -> JsonRpcNotification {
    JsonRpcNotification {
        jsonrpc: "2.0".to_string(),
        method: method.to_string(),
        params,
    }
}
