//! # JSON-RPC 请求/响应类型
//!
//! 定义 TUI 客户端与 ydzs-server 之间通信的消息格式。
//! 遵循 JSON-RPC 2.0 规范，支持请求-响应和通知（推送）两种模式。

use serde::{Deserialize, Serialize};

/// JSON-RPC 请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcRequest {
    /// JSON-RPC 版本（恒为 "2.0"）
    pub jsonrpc: String,
    /// 请求 ID（用于匹配响应）
    pub id: String,
    /// 方法名
    pub method: String,
    /// 参数（可选）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub params: Option<serde_json::Value>,
}

impl JsonRpcRequest {
    /// 创建新的 JSON-RPC 请求
    pub fn new(id: impl Into<String>, method: impl Into<String>, params: Option<serde_json::Value>) -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            id: id.into(),
            method: method.into(),
            params,
        }
    }
}

/// JSON-RPC 响应
#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct JsonRpcResponse {
    /// JSON-RPC 版本
    pub jsonrpc: String,
    /// 请求 ID
    pub id: String,
    /// 结果（成功时）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<serde_json::Value>,
    /// 错误（失败时）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<JsonRpcError>,
}

/// JSON-RPC 通知（服务端推送，无 id）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct JsonRpcNotification {
    /// JSON-RPC 版本
    pub jsonrpc: String,
    /// 通知方法名
    pub method: String,
    /// 通知参数
    #[serde(skip_serializing_if = "Option::is_none")]
    pub params: Option<serde_json::Value>,
}

/// JSON-RPC 错误
#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct JsonRpcError {
    /// 错误码
    pub code: i64,
    /// 错误消息
    pub message: String,
    /// 附加数据
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
}

/// Token 用量
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenUsage {
    /// 输入 token 数
    pub input_tokens: u64,
    /// 输出 token 数
    pub output_tokens: u64,
}

/// 发送消息请求参数
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct SendMessageParams {
    /// 线程 ID（可选，None 表示新建线程）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thread_id: Option<String>,
    /// 消息文本内容
    pub text: String,
    /// 执行模式
    pub mode: String,
}

/// 创建线程请求参数
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct CreateThreadParams {
    /// 项目 ID
    pub project_id: String,
    /// 初始标题
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
}
