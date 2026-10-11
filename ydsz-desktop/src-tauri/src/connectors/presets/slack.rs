//! # Slack 连接器预置实例
//!
//! 连接 Slack API，读写消息。
//! 使用 Bot Token (xoxb-xxx) 认证，需要 chat:write 等 scope。

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Slack 连接器配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlackConfig {
    /// Bot Token (xoxb-xxx)
    pub token: String,
}

/// 频道信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelInfo {
    pub id: String,
    pub name: String,
    pub is_private: bool,
    pub is_member: bool,
    pub topic: Option<String>,
    pub purpose: Option<String>,
    pub member_count: Option<u32>,
}

/// 消息信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageInfo {
    pub ts: String,
    pub user: Option<String>,
    pub text: String,
    pub channel: String,
    pub thread_ts: Option<String>,
}

/// 发送消息请求
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendMessageRequest {
    pub channel: String,
    pub text: String,
    /// 是否以 Bot 身份发送（false = 以用户身份）
    #[serde(default = "default_as_user")]
    pub as_user: bool,
}

fn default_as_user() -> bool {
    false
}

/// Slack 连接器客户端
#[derive(Debug, Clone)]
pub struct SlackConnector {
    config: SlackConfig,
    client: reqwest::Client,
}

impl SlackConnector {
    /// 创建新的 Slack 连接器
    pub fn new(config: SlackConfig) -> Result<Self, String> {
        let mut headers = reqwest::header::HeaderMap::new();
        headers.insert(
            reqwest::header::AUTHORIZATION,
            format!("Bearer {}", config.token)
                .parse()
                .map_err(|e| format!("构建 Authorization header 失败: {}", e))?,
        );

        let client = reqwest::Client::builder()
            .default_headers(headers)
            .build()
            .map_err(|e| format!("创建 HTTP client 失败: {}", e))?;

        Ok(Self { config, client })
    }

    /// 列出工作区频道
    pub async fn list_channels(&self) -> Result<Vec<ChannelInfo>, String> {
        let url = "https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=50";
        let resp = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|e| format!("请求失败: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("Slack API 返回 HTTP 错误: {}", resp.status()));
        }

        let result: Value = resp
            .json()
            .await
            .map_err(|e| format!("解析响应失败: {}", e))?;

        let ok = result
            .get("ok")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        if !ok {
            let err = result
                .get("error")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown_error");
            return Err(format!("Slack API 返回错误: {}", err));
        }

        let items = result
            .get("channels")
            .and_then(|v| v.as_array())
            .ok_or("响应格式不正确: 缺少 channels")?;

        Ok(items
            .iter()
            .take(50)
            .filter_map(|c| {
                Some(ChannelInfo {
                    id: c.get("id")?.as_str()?.to_string(),
                    name: c.get("name")?.as_str()?.to_string(),
                    is_private: c.get("is_private")?.as_bool()?,
                    is_member: c.get("is_member")?.as_bool().unwrap_or(false),
                    topic: c
                        .get("topic")
                        .and_then(|v| v.get("value"))
                        .and_then(|v| v.as_str())
                        .map(String::from),
                    purpose: c
                        .get("purpose")
                        .and_then(|v| v.get("value"))
                        .and_then(|v| v.as_str())
                        .map(String::from),
                    member_count: c.get("num_members").and_then(|v| v.as_u64()).map(|n| n as u32),
                })
            })
            .collect())
    }

    /// 发送消息到频道
    pub async fn send_message(&self, req: SendMessageRequest) -> Result<MessageInfo, String> {
        let url = "https://slack.com/api/chat.postMessage";
        let body = serde_json::json!({
            "channel": req.channel,
            "text": req.text,
            "as_user": req.as_user,
        });

        let resp = self
            .client
            .post(url)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("请求失败: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("Slack API 返回 HTTP 错误: {}", resp.status()));
        }

        let result: Value = resp
            .json()
            .await
            .map_err(|e| format!("解析响应失败: {}", e))?;

        let ok = result
            .get("ok")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        if !ok {
            let err = result
                .get("error")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown_error");
            return Err(format!("Slack API 返回错误: {}", err));
        }

        let msg = result.get("message").cloned().unwrap_or_default();

        Ok(MessageInfo {
            ts: result
                .get("ts")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            user: msg
                .get("user")
                .and_then(|v| v.as_str())
                .map(String::from),
            text: msg
                .get("text")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            channel: req.channel,
            thread_ts: msg
                .get("thread_ts")
                .and_then(|v| v.as_str())
                .map(String::from),
        })
    }

    /// 读取频道消息历史
    pub async fn read_history(
        &self,
        channel: &str,
        limit: u32,
    ) -> Result<Vec<MessageInfo>, String> {
        let url = format!(
            "https://slack.com/api/conversations.history?channel={}&limit={}",
            channel, limit
        );
        let resp = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("请求失败: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("Slack API 返回 HTTP 错误: {}", resp.status()));
        }

        let result: Value = resp
            .json()
            .await
            .map_err(|e| format!("解析响应失败: {}", e))?;

        let ok = result
            .get("ok")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        if !ok {
            let err = result
                .get("error")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown_error");
            return Err(format!("Slack API 返回错误: {}", err));
        }

        let items = result
            .get("messages")
            .and_then(|v| v.as_array())
            .ok_or("响应格式不正确: 缺少 messages")?;

        Ok(items
            .iter()
            .take(limit as usize)
            .filter_map(|m| {
                Some(MessageInfo {
                    ts: m.get("ts")?.as_str()?.to_string(),
                    user: m.get("user").and_then(|v| v.as_str()).map(String::from),
                    text: m.get("text")?.as_str()?.to_string(),
                    channel: channel.to_string(),
                    thread_ts: m.get("thread_ts").and_then(|v| v.as_str()).map(String::from),
                })
            })
            .collect())
    }
}
