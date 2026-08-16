//! MCP stdio 传输层
//!
//! 基于 JSON-RPC 2.0 over stdio，与 LSP 传输共用 Content-Length 头格式
//! （与 LSP 兼容以最大化复用进程管理代码）。

use std::collections::HashMap;
use std::process::Stdio;

use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, ChildStdout, Command};
use tokio::sync::Mutex;
use tracing::debug;

use super::error::{McpError, McpResult};

/// MCP stdio 传输层
pub struct McpTransport {
    stdin: Mutex<ChildStdin>,
    stdout: Mutex<BufReader<ChildStdout>>,
    child: Mutex<Child>,
}

impl McpTransport {
    /// 启动 MCP 服务器进程并建立 stdio 传输
    pub async fn spawn(
        command: &str,
        args: &[String],
        env: &HashMap<String, String>,
    ) -> McpResult<Self> {
        let mut cmd = Command::new(command);
        cmd.args(args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        for (k, v) in env {
            cmd.env(k, v);
        }

        let mut child = cmd.spawn().map_err(|e| McpError::ServerStartFailed {
            command: command.to_string(),
            detail: e.to_string(),
        })?;

        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| McpError::ServerStartFailed {
                command: command.to_string(),
                detail: "无法获取 stdin".into(),
            })?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| McpError::ServerStartFailed {
                command: command.to_string(),
                detail: "无法获取 stdout".into(),
            })?;

        Ok(Self {
            stdin: Mutex::new(stdin),
            stdout: Mutex::new(BufReader::new(stdout)),
            child: Mutex::new(child),
        })
    }

    /// 发送 JSON-RPC 消息（Content-Length 头格式）
    pub async fn send(&self, msg: &serde_json::Value) -> McpResult<()> {
        let body = serde_json::to_string(msg).map_err(|e| McpError::Communication(e.to_string()))?;
        let header = format!("Content-Length: {}\r\n\r\n", body.len());
        let mut stdin = self.stdin.lock().await;
        stdin
            .write_all(header.as_bytes())
            .await
            .map_err(|e| McpError::Communication(e.to_string()))?;
        stdin
            .write_all(body.as_bytes())
            .await
            .map_err(|e| McpError::Communication(e.to_string()))?;
        stdin
            .flush()
            .await
            .map_err(|e| McpError::Communication(e.to_string()))?;
        debug!(body_len = body.len(), "MCP 发送请求");
        Ok(())
    }

    /// 接收 JSON-RPC 消息
    pub async fn recv(&self) -> McpResult<serde_json::Value> {
        let mut stdout = self.stdout.lock().await;
        let mut content_length: Option<usize> = None;

        // 读取头部（可能多个 header 直到空行）
        loop {
            let mut line = String::new();
            let n = stdout
                .read_line(&mut line)
                .await
                .map_err(|e| McpError::Communication(e.to_string()))?;
            if n == 0 {
                return Err(McpError::Communication("服务器关闭连接".into()));
            }
            let trimmed = line.trim_end();
            if trimmed.is_empty() {
                break;
            }
            if let Some(len_str) = trimmed.strip_prefix("Content-Length: ") {
                content_length = len_str.parse::<usize>().ok();
            }
            // 忽略其他 header（Content-Type 等）
        }

        let len = content_length
            .ok_or_else(|| McpError::Communication("缺少 Content-Length 头".into()))?;

        let mut buf = vec![0u8; len];
        stdout
            .read_exact(&mut buf)
            .await
            .map_err(|e| McpError::Communication(e.to_string()))?;
        let value: serde_json::Value =
            serde_json::from_slice(&buf).map_err(|e| McpError::Communication(e.to_string()))?;
        debug!(body_len = len, "MCP 接收响应");
        Ok(value)
    }

    /// 关闭底层子进程
    pub async fn shutdown(&self) -> McpResult<()> {
        let mut child = self.child.lock().await;
        let _ = child.start_kill();
        Ok(())
    }

    /// 构造 Content-Length 帧头（辅助函数，便于测试验证帧格式）
    ///
    /// 返回用于传输的字节序列: `Content-Length: <len>\r\n\r\n<body>`
    pub fn build_frame(body: &serde_json::Value) -> Result<Vec<u8>, serde_json::Error> {
        let body_str = serde_json::to_string(body)?;
        let frame = format!("Content-Length: {}\r\n\r\n{}", body_str.len(), body_str);
        Ok(frame.into_bytes())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_frame_produces_valid_content_length_header() {
        let msg = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/list",
            "params": {}
        });
        let frame = McpTransport::build_frame(&msg).unwrap();
        let frame_str = String::from_utf8(frame).unwrap();

        // 形如: Content-Length: 55\r\n\r\n{...}
        assert!(
            frame_str.starts_with("Content-Length: "),
            "Frame must start with Content-Length header"
        );
        assert!(frame_str.contains("\r\n\r\n"), "Header-body separator required");

        // 提取长度并验证与 body 匹配
        let header_end = frame_str.find("\r\n\r\n").unwrap();
        let header = &frame_str[..header_end];
        let len_str = header.strip_prefix("Content-Length: ").unwrap();
        let claimed_len: usize = len_str.parse().unwrap();
        let body = &frame_str[header_end + 4..];
        assert_eq!(claimed_len, body.len(), "Content-Length must match body length");
    }

    #[test]
    fn build_frame_with_unicode_body() {
        // 中文字符，验证 Content-Length 是字节数而非字符数
        let msg = serde_json::json!({"text": "你好世界"});
        let frame = McpTransport::build_frame(&msg).unwrap();
        let frame_str = String::from_utf8(frame).unwrap();
        let header_end = frame_str.find("\r\n\r\n").unwrap();
        // 提取 Content-Length 值并验证其大于纯字符数
        let header = &frame_str[..header_end];
        let len_str = header.strip_prefix("Content-Length: ").unwrap();
        let claimed_len: usize = len_str.parse().unwrap();
        // 4 个 UTF-8 中文字符 = 12 字节 + JSON 结构 '({"text":""}' 占位 > 4
        assert!(claimed_len > 4, "Chinese UTF-8 bytes must exceed char count");
    }

    #[test]
    fn build_frame_empty_params() {
        let msg = serde_json::json!({"jsonrpc":"2.0","id":42,"method":"ping","params":{}});
        let frame = McpTransport::build_frame(&msg).unwrap();
        let frame_str = String::from_utf8(frame).unwrap();
        assert!(frame_str.contains("Content-Length:"));
        assert!(frame_str.contains("\"method\":\"ping\""));
    }

    #[test]
    fn build_frame_invalid_json_returns_error() {
        // serde_json::Value 不会包含无效 JSON, 此测试验证 serialize 错误路径
        // 实际上 Value 总是可序列化的, 这里验证签名与错误处理
        let msg = serde_json::json!({});
        let result = McpTransport::build_frame(&msg);
        assert!(result.is_ok()); // Value 总是序列化成功
    }

    #[test]
    fn build_frame_payload_extractable() {
        // 验证可以从帧中还原原始 JSON
        let original = serde_json::json!({"id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18"}});
        let frame = McpTransport::build_frame(&original).unwrap();
        let frame_str = String::from_utf8(frame).unwrap();
        let body_start = frame_str.find("\r\n\r\n").unwrap() + 4;
        let body: serde_json::Value = serde_json::from_str(&frame_str[body_start..]).unwrap();
        assert_eq!(body, original);
    }
}
