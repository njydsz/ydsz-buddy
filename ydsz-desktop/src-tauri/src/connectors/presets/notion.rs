use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotionConfig { pub token: String, pub database_id: Option<String> }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreatePageRequest {
    pub title: String,
    pub content: Option<String>,
}

#[derive(Debug, Clone)]
pub struct NotionConnector {
    pub config: NotionConfig,
}

impl NotionConnector {
    pub fn new(config: NotionConfig) -> Result<Self, String> {
        Ok(Self { config })
    }

    pub async fn search_pages(&self, _query: &str) -> Result<Vec<String>, String> {
        Ok(vec![])
    }

    pub async fn read_page(&self, _page_id: &str) -> Result<serde_json::Value, String> {
        Ok(serde_json::json!({"status": "stub"}))
    }

    pub async fn create_page(&self, _req: CreatePageRequest) -> Result<serde_json::Value, String> {
        Ok(serde_json::json!({"status": "stub"}))
    }
}

pub fn test_connection() -> bool { true }
