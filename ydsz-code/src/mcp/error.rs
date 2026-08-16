//! MCP 错误类型

use thiserror::Error;

/// MCP 错误
#[derive(Debug, Error)]
pub enum McpError {
    /// 配置文件读写失败
    #[error("MCP 配置文件 I/O 失败: {0}")]
    ConfigIo(#[from] std::io::Error),

    /// 配置文件 JSON 解析失败
    #[error("MCP 配置文件 JSON 解析失败: {0}")]
    ConfigParse(#[from] serde_json::Error),

    /// 服务器进程启动失败
    #[error("MCP 服务器进程启动失败 ({command}): {detail}")]
    ServerStartFailed { command: String, detail: String },

    /// 服务器进程未在超时时间内完成初始化
    #[error("MCP 服务器初始化超时（{seconds}s）")]
    ServerInitTimeout { seconds: u64 },

    /// JSON-RPC 通信失败
    #[error("MCP JSON-RPC 通信失败: {0}")]
    Communication(String),

    /// 服务器返回错误响应
    #[error("MCP 服务器返回错误（code={code}): {message}")]
    ServerError { code: i32, message: String },

    /// 工具未找到
    #[error("MCP 工具未找到: {0}")]
    ToolNotFound(String),

    /// 协议层缺失字段
    #[error("MCP 协议响应缺少字段: {0}")]
    ProtocolMissingField(String),

    /// MCP 服务器被禁用
    #[error("MCP 服务器已禁用: {0}")]
    ServerDisabled(String),

    /// MCP 服务器不存在
    #[error("MCP 服务器不存在: {0}")]
    ServerNotFound(String),

    /// MCP SSE 连接失败
    #[error("MCP SSE 连接失败 ({url}): {detail}")]
    SseConnectionFailed { url: String, detail: String },

    /// MCP SSE 端点未收到
    #[error("MCP SSE 服务器未返回 endpoint 事件")]
    SseEndpointNotReceived,

    /// MCP SSE 流断开
    #[error("MCP SSE 流断开: {0}")]
    SseStreamClosed(String),
}

pub type McpResult<T> = Result<T, McpError>;

// ============================================================================
// 单元测试
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use std::io;

    #[test]
    fn error_display_contains_key_info() {
        let cases: Vec<(McpError, &str)> = vec![
            (McpError::ServerStartFailed { command: "npx".into(), detail: "not found".into() }, "npx"),
            (McpError::ServerInitTimeout { seconds: 15 }, "15s"),
            (McpError::Communication("conn reset".into()), "conn reset"),
            (McpError::ServerError { code: -32600, message: "bad req".into() }, "-32600"),
            (McpError::ToolNotFound("foo".into()), "foo"),
            (McpError::ProtocolMissingField("tools".into()), "tools"),
            (McpError::ServerDisabled("fs".into()), "fs"),
            (McpError::ServerNotFound("fs".into()), "fs"),
            (McpError::SseConnectionFailed { url: "http://x".into(), detail: "refused".into() }, "http://x"),
            (McpError::SseEndpointNotReceived, "endpoint"),
            (McpError::SseStreamClosed("done".into()), "done"),
        ];
        for (err, needle) in cases {
            let msg = err.to_string();
            assert!(
                msg.contains(needle),
                "Expected '{needle}' in '{msg}'"
            );
        }
    }

    #[test]
    fn from_io_error_converts_to_config_io() {
        let io_err = io::Error::new(io::ErrorKind::NotFound, "no such file");
        let mcp_err: McpError = io_err.into();
        match mcp_err {
            McpError::ConfigIo(e) => assert_eq!(e.kind(), io::ErrorKind::NotFound),
            other => panic!("Expected ConfigIo, got {other:?}"),
        }
    }

    #[test]
    fn from_serde_json_error_converts_to_config_parse() {
        let json_err: serde_json::Result<()> = serde_json::from_str("not json").map(|_: serde_json::Value| ());
        let json_err = json_err.unwrap_err();
        let mcp_err: McpError = json_err.into();
        match mcp_err {
            McpError::ConfigParse(_) => {}
            other => panic!("Expected ConfigParse, got {other:?}"),
        }
    }
}
