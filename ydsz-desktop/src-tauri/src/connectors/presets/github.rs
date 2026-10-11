use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubConfig { pub token: String, pub owner: Option<String> }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateIssueRequest {
    pub title: String,
    pub body: Option<String>,
}

#[derive(Debug, Clone)]
pub struct GitHubConnector {
    pub config: GitHubConfig,
}

impl GitHubConnector {
    pub fn new(config: GitHubConfig) -> Result<Self, String> {
        Ok(Self { config })
    }

    pub async fn fetch_repos(&self) -> Result<Vec<String>, String> {
        let _ = &self.config;
        Ok(vec![])
    }

    pub async fn fetch_issues(&self, _repo: &str) -> Result<Vec<String>, String> {
        Ok(vec![])
    }

    pub async fn fetch_prs(&self, _repo: &str) -> Result<Vec<String>, String> {
        Ok(vec![])
    }

    pub async fn create_issue(&self, _repo: &str, _req: CreateIssueRequest) -> Result<serde_json::Value, String> {
        Ok(serde_json::json!({"status": "stub"}))
    }
}

pub fn test_connection() -> bool { true }
