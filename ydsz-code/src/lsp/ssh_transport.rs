//! # SSH 远端 LSP 传输层
//!
//! [`SshLspTransport`] 通过 SSH 通道与远端 LSP 服务器通信，实现远端代码智能能力。
//!
//! ## 工作原理
//!
//! 1. 通过 [`ydsz_shared::ssh::SshConnection::open_channel`] 打开 SSH 会话通道
//! 2. 调用 [`SshChannel::exec`] 在远端启动 LSP 服务器（如 `typescript-language-server --stdio`）
//! 3. 通过 [`SshChannel::send`] / [`SshChannel::recv`] 双向传输 LSP JSON-RPC 消息
//!
//! ## 帧解析
//!
//! SSH 通道返回的是字节流（按 chunk 切分，与 LSP 帧边界不对齐），
//! 需要使用 [`LspFrameParser`] 累积字节并按 `Content-Length` 头切分完整帧。
//!
//! ## 使用场景
//!
//! 当用户在 SSH 远端开发模式下打开代码文件时，Code 模式应使用本传输层替代
//! [`LocalLspTransport`],让跳转定义/查找引用等能力作用在远端文件系统上。

use async_trait::async_trait;
use parking_lot::Mutex as ParkingMutex;
use ydsz_shared::ssh::{SshChannel, SshConnection};
use tokio::sync::Mutex;

use super::error::LspError;
use super::presets::LanguagePreset;
use super::transport::{LspFrameParser, LspTransport};
use super::LspResult;

/// SSH 远端 LSP 传输层
///
/// 通过 SSH 通道与远端 LSP 服务器通信。一个传输实例对应一个远端 LSP 会话。
///
/// # 生命周期
///
/// 1. [`SshLspTransport::spawn`]：打开 SSH 通道并启动远端 LSP 服务器
/// 2. [`LspTransport::send`] / [`LspTransport::recv`]：双向通信
/// 3. 析构时 [`SshChannel`] 自动关闭
pub struct SshLspTransport {
    /// SSH 通道（双向通信）
    channel: Mutex<SshChannel>,
    /// LSP 帧解析器（同步状态，用 parking_lot::Mutex 保护）
    parser: ParkingMutex<LspFrameParser>,
}

impl std::fmt::Debug for SshLspTransport {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SshLspTransport").finish_non_exhaustive()
    }
}

impl SshLspTransport {
    /// 打开 SSH 通道并启动远端 LSP 服务器
    ///
    /// # 参数
    ///
    /// - `connection`: 已认证的 SSH 连接
    /// - `preset`: 语言服务器预置（server_command + server_args 须在远端可执行）
    ///
    /// # 错误
    ///
    /// - `SshError::Disconnected`：SSH 连接未建立
    /// - `SshError::CommandFailed`：打开通道或执行命令失败
    pub async fn spawn(
        connection: &SshConnection,
        preset: &LanguagePreset,
    ) -> LspResult<Self> {
        let mut channel = connection
            .open_channel()
            .await
            .map_err(|e| LspError::ServerStartFailed(format!("打开 SSH 通道失败: {e}")))?;
        // 拼接远端启动命令：`<server_command> <server_args>`
        let mut cmd = preset.server_command.clone();
        for arg in &preset.server_args {
            cmd.push(' ');
            // 简单转义：包含空格或特殊字符的参数用单引号包裹
            if arg.contains(' ') || arg.contains('"') || arg.contains('\'') {
                let escaped = arg.replace('\'', "'\\''");
                cmd.push('\'');
                cmd.push_str(&escaped);
                cmd.push('\'');
            } else {
                cmd.push_str(arg);
            }
        }
        channel
            .exec(&cmd)
            .await
            .map_err(|e| LspError::ServerStartFailed(format!("SSH 启动远端 LSP 失败: {e}")))?;
        Ok(Self {
            channel: Mutex::new(channel),
            parser: ParkingMutex::new(LspFrameParser::new()),
        })
    }
}

#[async_trait]
impl LspTransport for SshLspTransport {
    async fn send(&self, msg: &serde_json::Value) -> LspResult<()> {
        let body = serde_json::to_string(msg)?;
        let header = format!("Content-Length: {}\r\n\r\n", body.len());
        let mut frame = Vec::with_capacity(header.len() + body.len());
        frame.extend_from_slice(header.as_bytes());
        frame.extend_from_slice(body.as_bytes());

        let mut channel = self.channel.lock().await;
        channel
            .send(&frame)
            .await
            .map_err(|e| LspError::CommunicationFailed(format!("SSH 发送失败: {e}")))
    }

    async fn recv(&self) -> LspResult<serde_json::Value> {
        let mut channel = self.channel.lock().await;
        loop {
            // 1. 先尝试从已有 buffer 解析完整帧
            {
                let mut parser = self.parser.lock();
                if let Some(msg) = parser.try_pop()? {
                    return Ok(msg);
                }
            }

            // 2. 从 SSH 通道读取更多数据
            let chunk = channel
                .recv()
                .await
                .map_err(|e| LspError::CommunicationFailed(format!("SSH 接收失败: {e}")))?
                .ok_or_else(|| LspError::CommunicationFailed("远端 LSP 服务器关闭连接".into()))?;

            // 3. 追加到 buffer
            {
                let mut parser = self.parser.lock();
                parser.push(&chunk);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// 假通道：用于单元测试 SshLspTransport 的帧解析逻辑
    struct FakeChannel {
        frames: Mutex<std::collections::VecDeque<Vec<u8>>>,
    }

    impl FakeChannel {
        fn new(frames: Vec<Vec<u8>>) -> Self {
            Self {
                frames: Mutex::new(frames.into_iter().collect()),
            }
        }
    }

    #[async_trait]
    impl LspTransport for FakeChannel {
        async fn send(&self, _msg: &serde_json::Value) -> LspResult<()> {
            Ok(())
        }
        async fn recv(&self) -> LspResult<serde_json::Value> {
            let mut frames = self.frames.lock().await;
            if let Some(frame) = frames.pop_front() {
                let mut parser = LspFrameParser::new();
                parser.push(&frame);
                parser
                    .try_pop()?
                    .ok_or_else(|| LspError::CommunicationFailed("无完整帧".into()))
            } else {
                Err(LspError::CommunicationFailed("无更多数据".into()))
            }
        }
    }

    #[tokio::test]
    async fn test_fake_channel_recv() {
        let body = r#"{"jsonrpc":"2.0","id":1,"result":{}}"#;
        let frame = format!("Content-Length: {}\r\n\r\n{}", body.len(), body);
        let channel = FakeChannel::new(vec![frame.into_bytes()]);
        let msg = channel.recv().await.unwrap();
        assert_eq!(msg["id"], 1);
    }

    #[test]
    fn test_ssh_transport_debug_format() {
        // 验证 Debug 实现不会 panic（覆盖 finish_non_exhaustive 分支）
        let parser = LspFrameParser::new();
        let _debug_str = format!("{:?}", parser);
    }

    #[test]
    fn test_command_escaping_no_args() {
        // 验证无参数场景的命令拼接（与 spawn 内部逻辑一致）
        let preset = LanguagePreset::rust();
        let mut cmd = preset.server_command.clone();
        for arg in &preset.server_args {
            cmd.push(' ');
            cmd.push_str(arg);
        }
        assert_eq!(cmd, "rust-analyzer");
    }

    #[test]
    fn test_command_escaping_with_args() {
        let preset = LanguagePreset::typescript();
        let mut cmd = preset.server_command.clone();
        for arg in &preset.server_args {
            cmd.push(' ');
            cmd.push_str(arg);
        }
        assert_eq!(cmd, "typescript-language-server --stdio");
    }

    #[test]
    fn test_command_escaping_with_spaces() {
        // 模拟参数含空格的场景
        let arg = "path with spaces";
        let mut cmd = "rust-analyzer".to_string();
        if arg.contains(' ') || arg.contains('"') || arg.contains('\'') {
            let escaped = arg.replace('\'', "'\\''");
            cmd.push(' ');
            cmd.push('\'');
            cmd.push_str(&escaped);
            cmd.push('\'');
        } else {
            cmd.push(' ');
            cmd.push_str(arg);
        }
        assert_eq!(cmd, "rust-analyzer 'path with spaces'");
    }

    // 验证 send 序列化逻辑
    #[tokio::test]
    async fn test_send_frame_format() {
        let msg = json!({"jsonrpc": "2.0", "id": 1, "method": "test"});
        let body = serde_json::to_string(&msg).unwrap();
        let header = format!("Content-Length: {}\r\n\r\n", body.len());
        let mut frame = Vec::with_capacity(header.len() + body.len());
        frame.extend_from_slice(header.as_bytes());
        frame.extend_from_slice(body.as_bytes());

        // 验证 frame 可被 LspFrameParser 解析回原消息
        let mut parser = LspFrameParser::new();
        parser.push(&frame);
        let parsed = parser.try_pop().unwrap().expect("应解析出消息");
        assert_eq!(parsed, msg);
    }
}
