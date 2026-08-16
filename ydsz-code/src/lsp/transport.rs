//! # LSP 传输层抽象
//!
//! 定义 [`LspTransport`] trait，统一本地（stdio）和远端（SSH channel）两种 LSP 传输方式。
//!
//! ## 设计目的
//!
//! - **统一接口**：`LspClient` 只依赖 `dyn LspTransport`，不关心底层是子进程还是 SSH 通道
//! - **本地开发**：[`LocalLspTransport`] 通过 `tokio::process` spawn 子进程，基于 stdio 双向通信
//! - **远端开发**：[`crate::lsp::ssh_transport::SshLspTransport`] 通过 SSH 通道与远端 LSP 服务器通信
//!
//! ## 协议格式
//!
//! LSP 使用 [Language Server Protocol](https://microsoft.github.io/language-server-protocol/) 的
//! `Content-Length` 头格式（基于 JSON-RPC 2.0 over stdio）：
//!
//! ```text
//! Content-Length: <N>\r\n
//! \r\n
//! <N bytes of JSON>
//! ```

use std::process::Stdio;

use async_trait::async_trait;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, ChildStdout, Command};
use tokio::sync::Mutex;

use super::error::LspError;
use super::presets::LanguagePreset;
use super::LspResult;

/// LSP 传输层 trait
///
/// 抽象 LSP JSON-RPC 消息的发送与接收，屏蔽底层传输细节（stdio / SSH channel）。
///
/// # 实现约束
///
/// - `send` 必须按 LSP `Content-Length` 头格式封装消息
/// - `recv` 必须返回完整的 JSON-RPC 消息（已解析为 `serde_json::Value`）
/// - 实现需保证线程安全（`Send + Sync`），通常用 `Mutex` 包裹内部状态
#[async_trait]
pub trait LspTransport: Send + Sync {
    /// 发送 JSON-RPC 消息
    async fn send(&self, msg: &serde_json::Value) -> LspResult<()>;

    /// 接收 JSON-RPC 消息
    ///
    /// 阻塞直到收到一条完整消息。若服务器关闭连接，返回 `CommunicationFailed` 错误。
    async fn recv(&self) -> LspResult<serde_json::Value>;
}

/// 本地 LSP 传输：基于 stdio 的 JSON-RPC
///
/// 通过 `tokio::process::Command` spawn 语言服务器子进程，
/// 通过 stdin/stdout 双向通信，符合 LSP stdio 传输规范。
pub struct LocalLspTransport {
    stdin: Mutex<ChildStdin>,
    stdout: Mutex<BufReader<ChildStdout>>,
    _child: Child,
}

impl LocalLspTransport {
    /// 启动语言服务器进程并建立 stdio 传输
    pub async fn spawn(preset: &LanguagePreset) -> LspResult<Self> {
        let mut child = Command::new(&preset.server_command)
            .args(&preset.server_args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true)
            .spawn()
            .map_err(|e| LspError::ServerStartFailed(format!("{}: {e}", preset.server_command)))?;

        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| LspError::ServerStartFailed("无法获取 stdin".into()))?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| LspError::ServerStartFailed("无法获取 stdout".into()))?;

        Ok(Self {
            stdin: Mutex::new(stdin),
            stdout: Mutex::new(BufReader::new(stdout)),
            _child: child,
        })
    }
}

#[async_trait]
impl LspTransport for LocalLspTransport {
    /// 发送 JSON-RPC 消息（LSP Content-Length 头格式）
    async fn send(&self, msg: &serde_json::Value) -> LspResult<()> {
        let body = serde_json::to_string(msg)?;
        let header = format!("Content-Length: {}\r\n\r\n", body.len());
        let mut stdin = self.stdin.lock().await;
        stdin.write_all(header.as_bytes()).await?;
        stdin.write_all(body.as_bytes()).await?;
        stdin.flush().await?;
        Ok(())
    }

    /// 接收 JSON-RPC 消息
    async fn recv(&self) -> LspResult<serde_json::Value> {
        let mut stdout = self.stdout.lock().await;
        let mut content_length: Option<usize> = None;

        // 读取头部
        loop {
            let mut line = String::new();
            let n = stdout.read_line(&mut line).await?;
            if n == 0 {
                return Err(LspError::CommunicationFailed("服务器关闭连接".into()));
            }
            let trimmed = line.trim_end();
            if trimmed.is_empty() {
                break;
            }
            if let Some(len_str) = trimmed.strip_prefix("Content-Length: ") {
                content_length = len_str.parse::<usize>().ok();
            }
        }

        let len = content_length
            .ok_or_else(|| LspError::CommunicationFailed("缺少 Content-Length 头".into()))?;

        // 读取 body
        let mut buf = vec![0u8; len];
        stdout.read_exact(&mut buf).await?;
        let value: serde_json::Value = serde_json::from_slice(&buf)?;
        Ok(value)
    }
}

/// LSP 帧解析状态机
///
/// 用于 [`SshLspTransport`] 等基于字节流（非 BufReader）的传输层。
/// 累积字节并按 `Content-Length` 头切分完整帧。
///
/// # 状态
///
/// - `buffer`: 待解析字节
/// - `pending_length`: 已解析到 header 但尚未读够 body 的长度
pub(crate) struct LspFrameParser {
    buffer: Vec<u8>,
}

#[cfg(test)]
impl std::fmt::Debug for LspFrameParser {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("LspFrameParser")
            .field("buffer_len", &self.buffer.len())
            .finish()
    }
}

impl LspFrameParser {
    pub(crate) fn new() -> Self {
        Self {
            buffer: Vec::new(),
        }
    }

    /// 追加新字节
    pub(crate) fn push(&mut self, data: &[u8]) {
        self.buffer.extend_from_slice(data);
    }

    /// 尝试取出一条完整 LSP 消息
    ///
    /// 返回 `Ok(Some(value))` 表示成功解析一条消息；
    /// `Ok(None)` 表示数据不足，需要继续 push；
    /// `Err(...)` 表示协议错误（header 格式错误或 JSON 解析失败）。
    pub(crate) fn try_pop(&mut self) -> LspResult<Option<serde_json::Value>> {
            // 寻找 header 结束标记 \r\n\r\n
            let header_end = match find_subsequence(&self.buffer, b"\r\n\r\n") {
                Some(idx) => idx,
                None => return Ok(None), // header 不完整
            };

            // 解析 header
            let header_str = std::str::from_utf8(&self.buffer[..header_end])
                .map_err(|e| LspError::CommunicationFailed(format!("header 非 UTF-8: {e}")))?;
            let mut content_length: Option<usize> = None;
            for line in header_str.split("\r\n") {
                if let Some(len_str) = line.strip_prefix("Content-Length: ") {
                    content_length = len_str.parse::<usize>().ok();
                }
            }
            let len = content_length.ok_or_else(|| {
                LspError::CommunicationFailed("缺少 Content-Length 头".into())
            })?;

            let body_start = header_end + 4;
            let body_end = body_start + len;
            if self.buffer.len() < body_end {
                // body 不完整，等待更多数据
                return Ok(None);
            }

            // 解析 JSON
            let body_bytes = &self.buffer[body_start..body_end];
            let value: serde_json::Value = serde_json::from_slice(body_bytes)?;

            // 移除已消费的字节
            self.buffer.drain(..body_end);

            Ok(Some(value))
    }
}

fn find_subsequence(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_frame_parser_single_message() {
        let mut parser = LspFrameParser::new();
        let body = r#"{"jsonrpc":"2.0","id":1,"result":{}}"#;
        let frame = format!("Content-Length: {}\r\n\r\n{}", body.len(), body);
        parser.push(frame.as_bytes());
        let msg = parser.try_pop().unwrap().expect("应解析出一条消息");
        assert_eq!(msg["id"], 1);
        assert!(parser.try_pop().unwrap().is_none());
    }

    #[test]
    fn test_frame_parser_split_chunks() {
        let mut parser = LspFrameParser::new();
        let body = r#"{"jsonrpc":"2.0","id":2,"result":null}"#;
        let frame = format!("Content-Length: {}\r\n\r\n{}", body.len(), body);

        // 分两次推送
        let mid = frame.len() / 2;
        parser.push(&frame.as_bytes()[..mid]);
        assert!(parser.try_pop().unwrap().is_none());
        parser.push(&frame.as_bytes()[mid..]);
        let msg = parser.try_pop().unwrap().expect("应解析出消息");
        assert_eq!(msg["id"], 2);
    }

    #[test]
    fn test_frame_parser_multiple_messages() {
        let mut parser = LspFrameParser::new();
        let body1 = r#"{"jsonrpc":"2.0","id":1}"#;
        let body2 = r#"{"jsonrpc":"2.0","id":2}"#;
        let frame = format!(
            "Content-Length: {}\r\n\r\n{}Content-Length: {}\r\n\r\n{}",
            body1.len(),
            body1,
            body2.len(),
            body2
        );
        parser.push(frame.as_bytes());
        let m1 = parser.try_pop().unwrap().expect("第一条消息");
        assert_eq!(m1["id"], 1);
        let m2 = parser.try_pop().unwrap().expect("第二条消息");
        assert_eq!(m2["id"], 2);
        assert!(parser.try_pop().unwrap().is_none());
    }

    #[test]
    fn test_find_subsequence() {
        assert_eq!(find_subsequence(b"abc\r\n\r\ndef", b"\r\n\r\n"), Some(3));
        assert_eq!(find_subsequence(b"abcdef", b"\r\n\r\n"), None);
        assert_eq!(find_subsequence(b"", b"\r\n\r\n"), None);
    }
}
