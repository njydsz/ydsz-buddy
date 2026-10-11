//! GitHub Connector 预置

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubConfig {
    pub token: String,
    pub owner: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateIssueRequest {
    pub repo: String,
    pub title: String,
    pub body: Option<String>,
    pub labels: Option<Vec<String>>,
}

#[derive(Debug, Clone)]
pub struct GitHubConnector {
    pub config: GitHubConfig,
}

impl GitHubConnector {
    pub fn new(config: GitHubConfig) -> Result<Self, String> {
        Ok(Self { config })
    }

    pub async fn fetch_repos(&self) -> Result<serde_json::Value, String> {
        Err("not implemented".to_string())
    }

    pub async fn fetch_issues(&self, _repo: &str) -> Result<serde_json::Value, String> {
        Err("not implemented".to_string())
    }

    pub async fn fetch_prs(&self, _repo: &str) -> Result<serde_json::Value, String> {
        Err("not implemented".to_string())
    }

    pub async fn create_issue(
        &self,
        _repo: &str,
        _req: CreateIssueRequest,
    ) -> Result<serde_json::Value, String> {
        Err("not implemented".to_string())
    }
}
