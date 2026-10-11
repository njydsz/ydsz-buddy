//! # GitHub 连接器预置实例
//!
//! 连接 GitHub API，获取仓库/issue/PR 信息。
//! 使用 Personal Access Token 认证，依赖 reqwest 发送 HTTP 请求。

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// GitHub 连接器配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubConfig {
    /// GitHub Personal Access Token
    pub token: String,
    /// 用户名或组织名（可选）
    pub owner: Option<String>,
}

/// 仓库摘要信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoInfo {
    pub name: String,
    pub full_name: String,
    pub description: Option<String>,
    pub stars: u32,
    pub forks: u32,
    pub open_issues: u32,
    pub language: Option<String>,
    pub url: String,
}

/// Issue 摘要信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IssueInfo {
    pub number: u32,
    pub title: String,
    pub state: String,
    pub author: String,
    pub labels: Vec<String>,
    pub url: String,
    pub created_at: String,
}

/// PR 摘要信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrInfo {
    pub number: u32,
    pub title: String,
    pub state: String,
    pub author: String,
    pub source_branch: String,
    pub target_branch: String,
    pub url: String,
    pub created_at: String,
}

/// 创建 Issue 请求
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateIssueRequest {
    pub title: String,
    pub body: Option<String>,
    pub labels: Option<Vec<String>>,
}

/// GitHub 连接器客户端
#[derive(Debug, Clone)]
pub struct GitHubConnector {
    config: GitHubConfig,
    client: reqwest::Client,
}

impl GitHubConnector {
    /// 创建新的 GitHub 连接器
    pub fn new(config: GitHubConfig) -> Result<Self, String> {
        let mut headers = reqwest::header::HeaderMap::new();
        headers.insert(
            reqwest::header::AUTHORIZATION,
            format!("token {}", config.token)
                .parse()
                .map_err(|e| format!("构建 Authorization header 失败: {}", e))?,
        );
        headers.insert(
            reqwest::header::USER_AGENT,
            "ydsz-buddy"
                .parse()
                .map_err(|e| format!("构建 User-Agent header 失败: {}", e))?,
        );
        headers.insert(
            reqwest::header::ACCEPT,
            "application/vnd.github.v3+json"
                .parse()
                .map_err(|e| format!("构建 Accept header 失败: {}", e))?,
        );

        let client = reqwest::Client::builder()
            .default_headers(headers)
            .build()
            .map_err(|e| format!("创建 HTTP client 失败: {}", e))?;

        Ok(Self { config, client })
    }

    /// 获取当前用户仓库列表
    pub async fn fetch_repos(&self) -> Result<Vec<RepoInfo>, String> {
        let url = "https://api.github.com/user/repos?sort=updated&per_page=30";
        let resp = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|e| format!("请求失败: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("GitHub API 返回错误: {}", resp.status()));
        }

        let repos: Value = resp
            .json()
            .await
            .map_err(|e| format!("解析响应失败: {}", e))?;

        let items = repos.as_array().ok_or("响应格式不正确")?;
        Ok(items
            .iter()
            .take(30)
            .filter_map(|r| {
                Some(RepoInfo {
                    name: r.get("name")?.as_str()?.to_string(),
                    full_name: r.get("full_name")?.as_str()?.to_string(),
                    description: r.get("description").and_then(|v| v.as_str()).map(String::from),
                    stars: r.get("stargazers_count")?.as_u64()? as u32,
                    forks: r.get("forks_count")?.as_u64()? as u32,
                    open_issues: r.get("open_issues_count")?.as_u64()? as u32,
                    language: r.get("language").and_then(|v| v.as_str()).map(String::from),
                    url: r.get("html_url")?.as_str()?.to_string(),
                })
            })
            .collect())
    }

    /// 获取仓库的 Issue 列表
    pub async fn fetch_issues(&self, repo: &str) -> Result<Vec<IssueInfo>, String> {
        let url = format!(
            "https://api.github.com/repos/{}/issues?state=open&per_page=20",
            repo
        );
        let resp = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("请求失败: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("GitHub API 返回错误: {}", resp.status()));
        }

        let issues: Value = resp
            .json()
            .await
            .map_err(|e| format!("解析响应失败: {}", e))?;

        let items = issues.as_array().ok_or("响应格式不正确")?;
        Ok(items
            .iter()
            .filter(|i| i.get("pull_request").is_none()) // 过滤掉 PR
            .take(20)
            .filter_map(|i| {
                Some(IssueInfo {
                    number: i.get("number")?.as_u64()? as u32,
                    title: i.get("title")?.as_str()?.to_string(),
                    state: i.get("state")?.as_str()?.to_string(),
                    author: i.get("user")?.get("login")?.as_str()?.to_string(),
                    labels: i
                        .get("labels")
                        .and_then(|l| l.as_array())
                        .map(|arr| {
                            arr.iter()
                                .filter_map(|l| l.get("name")?.as_str().map(String::from))
                                .collect()
                        })
                        .unwrap_or_default(),
                    url: i.get("html_url")?.as_str()?.to_string(),
                    created_at: i.get("created_at")?.as_str()?.to_string(),
                })
            })
            .collect())
    }

    /// 获取仓库的 PR 列表
    pub async fn fetch_prs(&self, repo: &str) -> Result<Vec<PrInfo>, String> {
        let url = format!(
            "https://api.github.com/repos/{}/pulls?state=open&per-page=20",
            repo
        );
        let resp = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("请求失败: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("GitHub API 返回错误: {}", resp.status()));
        }

        let prs: Value = resp
            .json()
            .await
            .map_err(|e| format!("解析响应失败: {}", e))?;

        let items = prs.as_array().ok_or("响应格式不正确")?;
        Ok(items
            .iter()
            .take(20)
            .filter_map(|p| {
                Some(PrInfo {
                    number: p.get("number")?.as_u64()? as u32,
                    title: p.get("title")?.as_str()?.to_string(),
                    state: p.get("state")?.as_str()?.to_string(),
                    author: p.get("user")?.get("login")?.as_str()?.to_string(),
                    source_branch: p.get("head")?.get("ref")?.as_str()?.to_string(),
                    target_branch: p.get("base")?.get("ref")?.as_str()?.to_string(),
                    url: p.get("html_url")?.as_str()?.to_string(),
                    created_at: p.get("created_at")?.as_str()?.to_string(),
                })
            })
            .collect())
    }

    /// 创建新 Issue
    pub async fn create_issue(
        &self,
        repo: &str,
        req: CreateIssueRequest,
    ) -> Result<IssueInfo, String> {
        let url = format!("https://api.github.com/repos/{}/issues", repo);
        let body = serde_json::json!({
            "title": req.title,
            "body": req.body,
            "labels": req.labels,
        });

        let resp = self
            .client
            .post(&url)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("请求失败: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("GitHub API 返回错误: {}", resp.status()));
        }

        let result: Value = resp
            .json()
            .await
            .map_err(|e| format!("解析响应失败: {}", e))?;

        Ok(IssueInfo {
            number: result.get("number").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
            title: result
                .get("title")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            state: result
                .get("state")
                .and_then(|v| v.as_str())
                .unwrap_or("open")
                .to_string(),
            author: result
                .get("user")
                .and_then(|u| u.get("login"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            labels: vec![],
            url: result
                .get("html_url")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            created_at: result
                .get("created_at")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
        })
    }
}
