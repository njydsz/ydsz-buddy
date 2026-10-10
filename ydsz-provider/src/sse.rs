//! # SSE (Server-Sent Events) 流式解析器
//!
//! 解析 Provider 返回的 SSE 事件流，抽象为统一的事件枚举。
//! 兼容 OpenAI / Anthropic / DeepSeek 等主流 Provider 的 SSE 格式。
//!
//! ## SSE 格式标准
//!
//! ```text
//! event: message_delta
//! data: {"id":"1","delta":{"content":"Hello"}}
//!
//! event: message_stop
//! data: {"usage":{"input_tokens":10,"output_tokens":5}}
//!
//! data: [DONE]
//! ```

use futures_util::StreamExt;
use reqwest::Response;
use tokio::sync::broadcast::Receiver as BroadcastReceiver;

/// SSE 事件类型
#[derive(Debug, Clone)]
pub enum SseEvent {
    /// 数据事件
    Data(String),
    /// 命名事件
    Event {
        event_type: String,
        data: String,
    },
    /// 流结束
    Done,
    /// 解析错误
    Error(String),
}

/// 将 reqwest Response 解析为 SSE 事件流
///
/// 返回 broadcast::Receiver 供多个消费者订阅。
/// 内部 spawn 一个 tokio task 持续读取 HTTP body 并解析 SSE 帧。
pub fn parse_sse_stream(
    response: Response,
    buffer_size: usize,
) -> BroadcastReceiver<SseEvent> {
    let (tx, rx) = tokio::sync::broadcast::channel(buffer_size);

    tokio::spawn(async move {
        let mut stream = response.bytes_stream();
        let mut line_buffer = String::new();

        while let Some(chunk_result) = stream.next().await {
            let bytes = match chunk_result {
                Ok(b) => b,
                Err(e) => {
                    let _ = tx.send(SseEvent::Error(format!("Stream read error: {e}")));
                    break;
                }
            };

            let text = match String::from_utf8(bytes.to_vec()) {
                Ok(s) => s,
                Err(e) => {
                    let _ = tx.send(SseEvent::Error(format!("UTF-8 decode error: {e}")));
                    break;
                }
            };

            line_buffer.push_str(&text);

            // 按空行分割 SSE 事件
            while let Some(pos) = line_buffer.find("\n\n") {
                let raw_event = line_buffer[..pos].to_string();
                line_buffer = line_buffer[pos + 2..].to_string();

                let event = parse_sse_frame(&raw_event);
                if matches!(&event, SseEvent::Done) {
                    let _ = tx.send(event);
                    return;
                }
                if tx.send(event).is_err() {
                    return; // 所有接收者已关闭
                }
            }
        }

        // 处理剩余的 buffer
        if !line_buffer.trim().is_empty() {
            let _ = tx.send(parse_sse_frame(&line_buffer));
        }
    });

    rx
}

/// 解析单个 SSE 帧（events separated by \n\n）
fn parse_sse_frame(raw: &str) -> SseEvent {
    let raw = raw.trim();
    if raw.is_empty() {
        return SseEvent::Done;
    }

    let mut data_parts: Vec<String> = Vec::new();
    let mut event_type: Option<String> = None;

    for line in raw.lines() {
        if let Some(stripped) = line.strip_prefix("data:") {
            let data = stripped.trim();
            if data == "[DONE]" {
                return SseEvent::Done;
            }
            data_parts.push(data.to_string());
        } else if let Some(stripped) = line.strip_prefix("event:") {
            event_type = Some(stripped.trim().to_string());
        }
        // 忽略 id: / retry: / 注释行
    }

    match event_type {
        Some(et) if !data_parts.is_empty() => SseEvent::Event {
            event_type: et,
            data: data_parts.join("\n"),
        },
        _ if !data_parts.is_empty() => SseEvent::Data(data_parts.join("\n")),
        _ => SseEvent::Done,
    }
}

/// 尝试将 SSE data 解析为 JSON Value
pub fn parse_json_data(event: &SseEvent) -> Option<serde_json::Value> {
    let data = match event {
        SseEvent::Data(d) => d.as_str(),
        SseEvent::Event { data, .. } => data.as_str(),
        _ => return None,
    };

    data.parse::<serde_json::Value>().ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_sse_frame_text_data() {
        let frame = "data: {\"content\":\"Hello\"}";
        match parse_sse_frame(frame) {
            SseEvent::Data(d) => assert_eq!(d, "{\"content\":\"Hello\"}"),
            _ => panic!("Expected Data event"),
        }
    }

    #[test]
    fn parse_sse_frame_named_event() {
        let frame = "event: message_delta\ndata: {\"delta\":\"world\"}";
        match parse_sse_frame(frame) {
            SseEvent::Event {
                event_type,
                data,
            } => {
                assert_eq!(event_type, "message_delta");
                assert_eq!(data, "{\"delta\":\"world\"}");
            }
            _ => panic!("Expected named Event"),
        }
    }

    #[test]
    fn parse_sse_frame_done() {
        let frame = "data: [DONE]";
        assert!(matches!(parse_sse_frame(frame), SseEvent::Done));
    }

    #[test]
    fn parse_sse_frame_empty() {
        assert!(matches!(parse_sse_frame(""), SseEvent::Done));
    }
}
