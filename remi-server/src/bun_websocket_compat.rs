//! # Bun WebSocket 兼容性垫片模块
//!
//! 提供与 Bun 运行时 WebSocket 行为兼容的工具与约定。
//!
//! ## 背景
//!
//! - Bun 的 `WebSocket` 实现与浏览器不完全一致（如不支持 `binaryType = 'arraybuffer'` 默认值）
//! - Bun 在二进制帧处理上有自己的优化
//! - 我们的服务器端 `tokio-tungstenite` 在消息分片、`ping/pong`、Close code 上有差异
//!
//! ## 本模块提供
//!
//! - **帧类型归一化**：把 Bun / 浏览器 / tokio-tungstenite 三种来源的 `Message` 统一为内部表示
//! - **ping/pong 策略**：默认 30s 心跳，断线检测
//! - **Close code 映射**：常见 close code 转可读说明
//!
//! ## 用法
//!
//! 该模块为工具集合，外部代码可直接调用 `normalize_message` / `build_ping_payload` 等函数。

use std::time::Duration;

use serde::{Deserialize, Serialize};
use tokio_tungstenite::tungstenite::Message;

/// 统一的二进制 / 文本 / Ping / Pong 消息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum NormalizedMessage {
    Text(String),
    Binary(Vec<u8>),
    Ping(Vec<u8>),
    Pong(Vec<u8>),
    Close(Option<CloseFrame>),
    Frame(FrameControl),
}

/// 关闭帧
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloseFrame {
    /// 关闭码
    pub code: u16,
    /// 原因（UTF-8）
    pub reason: String,
}

/// 帧控制（fragmented / continuation）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FrameControl {
    pub opcode: u8,
    pub fragmented: bool,
    pub payload: Vec<u8>,
}

impl NormalizedMessage {
    /// 从 `tokio_tungstenite::tungstenite::Message` 归一化
    pub fn from_tungstenite(msg: Message) -> Self {
        match msg {
            Message::Text(s) => NormalizedMessage::Text(s),
            Message::Binary(b) => NormalizedMessage::Binary(b),
            Message::Ping(p) => NormalizedMessage::Ping(p),
            Message::Pong(p) => NormalizedMessage::Pong(p),
            Message::Close(c) => NormalizedMessage::Close(c.map(|cf| CloseFrame {
                code: cf.code.into(),
                reason: cf.reason.into_owned(),
            })),
            Message::Frame(f) => NormalizedMessage::Frame(FrameControl {
                opcode: f.opcode as u8,
                fragmented: f.is_fragment,
                payload: f.payload.to_vec(),
            }),
        }
    }

    /// 转回 `tokio_tungstenite::tungstenite::Message`
    pub fn into_tungstenite(self) -> Message {
        match self {
            NormalizedMessage::Text(s) => Message::Text(s),
            NormalizedMessage::Binary(b) => Message::Binary(b),
            NormalizedMessage::Ping(p) => Message::Ping(p),
            NormalizedMessage::Pong(p) => Message::Pong(p),
            NormalizedMessage::Close(c) => {
                let cf = c.map(|c| tokio_tungstenite::tungstenite::protocol::CloseFrame {
                    code: tokio_tungstenite::tungstenite::protocol::frame::coding::CloseCode::from(c.code),
                    reason: c.reason.into(),
                });
                Message::Close(cf)
            }
            NormalizedMessage::Frame(f) => Message::Frame(f.into()),
        }
    }

    /// 是否是控制帧（ping/pong/close）
    pub fn is_control(&self) -> bool {
        matches!(
            self,
            NormalizedMessage::Ping(_) | NormalizedMessage::Pong(_) | NormalizedMessage::Close(_)
        )
    }

    /// payload 大小（字节）
    pub fn payload_size(&self) -> usize {
        match self {
            NormalizedMessage::Text(s) => s.len(),
            NormalizedMessage::Binary(b) => b.len(),
            NormalizedMessage::Ping(p) | NormalizedMessage::Pong(p) => p.len(),
            NormalizedMessage::Frame(f) => f.payload.len(),
            NormalizedMessage::Close(_) => 0,
        }
    }
}

impl From<tokio_tungstenite::tungstenite::protocol::frame::Frame> for FrameControl {
    fn from(f: tokio_tungstenite::tungstenite::protocol::frame::Frame) -> Self {
        Self {
            opcode: f.header().opcode as u8,
            fragmented: f.header().is_fragment,
            payload: f.into_data().to_vec(),
        }
    }
}

impl From<FrameControl> for tokio_tungstenite::tungstenite::protocol::frame::Frame {
    fn from(c: FrameControl) -> Self {
        use tokio_tungstenite::tungstenite::protocol::frame::{coding::Data, Frame};
        let mut frame = Frame::new(Data::from(c.payload));
        if c.fragmented {
            frame = frame.set_fragment(true);
        }
        frame
    }
}

/// WebSocket 心跳策略
#[derive(Debug, Clone)]
pub struct HeartbeatPolicy {
    /// 心跳间隔
    pub interval: Duration,
    /// 心跳超时
    pub timeout: Duration,
    /// 自定义 ping payload
    pub ping_payload: Vec<u8>,
}

impl Default for HeartbeatPolicy {
    fn default() -> Self {
        Self {
            interval: Duration::from_secs(30),
            timeout: Duration::from_secs(15),
            ping_payload: b"remi-ping".to_vec(),
        }
    }
}

impl HeartbeatPolicy {
    /// 构造 ping 消息
    pub fn build_ping(&self) -> Message {
        Message::Ping(self.ping_payload.clone())
    }

    /// 判断上次心跳后是否超时
    pub fn is_overdue(&self, last_pong: std::time::Instant) -> bool {
        last_pong.elapsed() > self.interval + self.timeout
    }
}

/// 常用 close code 转可读说明
pub fn describe_close_code(code: u16) -> &'static str {
    match code {
        1000 => "正常关闭",
        1001 => "服务器离开 / 浏览器关闭页面",
        1002 => "协议错误",
        1003 => "不支持的数据类型",
        1004 => "保留",
        1005 => "无状态码",
        1006 => "异常关闭（连接中断）",
        1007 => "无效的 payload（如非 UTF-8 文本）",
        1008 => "策略违规",
        1009 => "消息过大",
        1010 => "必需的扩展未协商",
        1011 => "服务器内部错误",
        1012 => "服务重启",
        1013 => "稍后重试",
        1014 => "网关错误",
        1015 => "TLS 握手失败",
        4000..=4999 => "应用自定义",
        _ => "未知",
    }
}

/// Bun 兼容开关：决定是否发送额外的 Bun 识别 ping
pub fn bun_handshake_payload() -> Vec<u8> {
    b"remi-bun-v1".to_vec()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip_text() {
        let m = Message::Text("hello".into());
        let n = NormalizedMessage::from_tungstenite(m);
        match n {
            NormalizedMessage::Text(s) => assert_eq!(s, "hello"),
            _ => panic!("wrong variant"),
        }
    }

    #[test]
    fn describe_close_code_known() {
        assert_eq!(describe_close_code(1000), "正常关闭");
        assert_eq!(describe_close_code(1006), "异常关闭（连接中断）");
        assert_eq!(describe_close_code(9999), "未知");
    }

    #[test]
    fn heartbeat_builds_ping() {
        let p = HeartbeatPolicy::default();
        let m = p.build_ping();
        match m {
            Message::Ping(payload) => assert_eq!(payload, b"remi-ping"),
            _ => panic!("expected ping"),
        }
    }

    #[test]
    fn heartbeat_is_overdue() {
        let p = HeartbeatPolicy::default();
        let now = std::time::Instant::now();
        std::thread::sleep(Duration::from_millis(10));
        // 远远没到超时
        assert!(!p.is_overdue(now));
    }

    #[test]
    fn binary_payload_size() {
        let n = NormalizedMessage::Binary(vec![1, 2, 3, 4, 5]);
        assert_eq!(n.payload_size(), 5);
    }

    #[test]
    fn is_control() {
        assert!(NormalizedMessage::Ping(vec![]).is_control());
        assert!(NormalizedMessage::Pong(vec![]).is_control());
        assert!(NormalizedMessage::Close(None).is_control());
        assert!(!NormalizedMessage::Text("x".into()).is_control());
    }

    #[test]
    fn bun_handshake_payload_nonempty() {
        let p = bun_handshake_payload();
        assert!(!p.is_empty());
    }
}
