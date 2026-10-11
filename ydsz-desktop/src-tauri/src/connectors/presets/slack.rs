use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlackConfig { pub token: String, pub channel: Option<String> }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SendMessageRequest {
    pub channel: String,
    pub text: String,
}

#[derive(Debug, Clone)]
pub struct SlackConnector {
    pub config: SlackConfig,
}

impl SlackConnector {
    pub fn new(config: SlackConfig) -> Result<Self, String> {
        Ok(Self { config })
    }

    pub async fn list_channels(&self) -> Result<Vec<String>, String> {
        let _ = &self.config;
        Ok(vec![])
    }

    pub async fn send_message(&self, _req: SendMessageRequest) -> Result<serde_json::Value, String> {
        Ok(serde_json::json!({"status": "stub"}))
    }

    pub async fn read_history(&self, _channel: &str, _limit: u32) -> Result<Vec<String>, String> {
        Ok(vec![])
    }
}

pub fn test_connection() -> bool { true }
