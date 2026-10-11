//! Slack Connector 预置

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlackConfig {
    pub token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SendMessageRequest {
    pub channel: String,
    pub text: String,
    pub thread_ts: Option<String>,
}

#[derive(Debug, Clone)]
pub struct SlackConnector {
    pub config: SlackConfig,
}

impl SlackConnector {
    pub fn new(config: SlackConfig) -> Result<Self, String> {
        Ok(Self { config })
    }

    pub async fn list_channels(&self) -> Result<serde_json::Value, String> {
        Err("not implemented".to_string())
    }

    pub async fn send_message(&self, _req: SendMessageRequest) -> Result<serde_json::Value, String> {
        Err("not implemented".to_string())
    }

    pub async fn read_history(&self, _channel: &str, _limit: u32) -> Result<serde_json::Value, String> {
        Err("not implemented".to_string())
    }
}
