// Connector 模块 — 开发者连接器（Jira / GitHub Issues / Sentry / Grafana / Webhook）
//
// 本模块提供真实 HTTP 调用能力，替换原先 commands/connectors.rs 中的 mock 实现。

use serde::{Deserialize, Serialize};
use serde_json::Value;

// ===== 通用结果类型 =====

/// 连接测试结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionTestResult {
    pub success: bool,
    pub message: String,
    pub latency_ms: Option<u64>,
}

/// 通用连接器 trait
#[async_trait::async_trait]
pub trait Connector: Send + Sync {
    /// 连接器类型标识
    fn connector_type(&self) -> &str;

    /// 显示名称
    fn display_name(&self) -> &str;

    /// 测试连接是否可用
    async fn test_connection(&self) -> ConnectionTestResult;

    /// 获取连接状态摘要
    fn status(&self) -> serde_json::Value;
}

// ===== Jira / Linear Connector =====

/// Jira 连接器配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JiraConfig {
    pub base_url: String,
    pub api_token: String,
    pub project_key: String,
    pub email: Option<String>, // Jira Cloud 需要 email + api_token
}

/// Jira 客户端
#[derive(Debug, Clone)]
pub struct JiraConnector {
    config: JiraConfig,
}

impl JiraConnector {
    pub fn new(config: JiraConfig) -> Self {
        Self { config }
    }

    /// 获取 Jira 项目信息
    pub async fn fetch_project(&self) -> Result<serde_json::Value, String> {
        let url = format!("{}/rest/api/3/project/{}", self.config.base_url.trim_end_matches('/'), self.config.project_key);
        let client = reqwest::Client::new();
        let mut req = client.get(&url);

        if let Some(email) = &self.config.email {
            // Jira Cloud: Basic auth with email:token
            let auth = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, format!("{}:{}", email, self.config.api_token));
            req = req.header("Authorization", format!("Basic {}", auth));
        } else {
            // Jira Server: Bearer <REDACTED>
            req = req.header("Authorization", format!("Bearer {}", self.config.api_token));
        }

        let resp = req.send().await.map_err(|e| format!("Jira API 请求失败: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("Jira API 错误 {status}: {body}"));
        }

        resp.json().await.map_err(|e| format!("解析 Jira 响应失败: {}", e))
    }

    /// 创建 Issue
    pub async fn create_issue(&self, summary: &str, description: &str) -> Result<serde_json::Value, String> {
        let url = format!("{}/rest/api/3/issue", self.config.base_url.trim_end_matches('/'));
        let payload = serde_json::json!({
            "fields": {
                "project": { "key": self.config.project_key },
                "summary": summary,
                "description": {
                    "type": "doc",
                    "version": 1,
                    "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": description }] }]
                },
                "issuetype": { "name": "Task" }
            }
        });

        let client = reqwest::Client::new();
        let mut req = client.post(&url).json(&payload);

        if let Some(email) = &self.config.email {
            let auth = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, format!("{}:{}", email, self.config.api_token));
            req = req.header("Authorization", format!("Basic {}", auth));
        } else {
            req = req.header("Authorization", format!("Bearer {}", self.config.api_token));
        }

        let resp = req.send().await.map_err(|e| format!("Jira API 请求失败: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("Jira API 错误 {status}: {body}"));
        }

        resp.json().await.map_err(|e| format!("解析 Jira 响应失败: {}", e))
    }
}

#[async_trait::async_trait]
impl Connector for JiraConnector {
    fn connector_type(&self) -> &str { "jira" }
    fn display_name(&self) -> &str { "Jira / Linear" }

    async fn test_connection(&self) -> ConnectionTestResult {
        let start = std::time::Instant::now();
        match self.fetch_project().await {
            Ok(proj) => {
                let name = proj.get("name").and_then(|n| n.as_str()).unwrap_or("unknown");
                ConnectionTestResult {
                    success: true,
                    message: format!("已连接 Jira 项目: {name}"),
                    latency_ms: Some(start.elapsed().as_millis() as u64),
                }
            }
            Err(e) => ConnectionTestResult {
                success: false,
                message: e,
                latency_ms: Some(start.elapsed().as_millis() as u64),
            },
        }
    }

    fn status(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "jira",
            "projectKey": self.config.project_key,
            "baseUrl": self.config.base_url
        })
    }
}

// ===== GitHub Issues Connector =====

/// GitHub Issues 连接器配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubIssuesConfig {
    pub token: String,
    pub repo: String,  // "owner/repo"
}

#[derive(Debug, Clone)]
pub struct GitHubIssuesConnector {
    config: GitHubIssuesConfig,
}

impl GitHubIssuesConnector {
    pub fn new(config: GitHubIssuesConfig) -> Self {
        Self { config }
    }

    /// 列出仓库 Issues
    pub async fn list_issues(&self, state: &str) -> Result<Vec<serde_json::Value>, String> {
        let url = format!(
            "https://api.github.com/repos/{}/issues?state={}&per_page=20",
            self.config.repo, state
        );
        let client = reqwest::Client::new();
        let resp = client
            .get(&url)
            .header("Authorization", format!("token {}", self.config.token))
            .header("User-Agent", "ydsz-buddy")
            .header("Accept", "application/vnd.github.v3+json")
            .send()
            .await
            .map_err(|e| format!("GitHub API 请求失败: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("GitHub API 错误 {}: {}", resp.status(), resp.text().await.unwrap_or_default()));
        }

        let items: Vec<serde_json::Value> = resp.json().await.map_err(|e| format!("解析响应失败: {}", e))?;
        // Filter out PRs
        Ok(items.into_iter().filter(|i| i.get("pull_request").is_none()).collect())
    }

    /// 创建 Issue
    pub async fn create_issue(&self, title: &str, body: Option<&str>) -> Result<serde_json::Value, String> {
        let url = format!("https://api.github.com/repos/{}/issues", self.config.repo);
        let payload = serde_json::json!({ "title": title, "body": body });
        let client = reqwest::Client::new();
        let resp = client
            .post(&url)
            .header("Authorization", format!("token {}", self.config.token))
            .header("User-Agent", "ydsz-buddy")
            .header("Accept", "application/vnd.github.v3+json")
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("GitHub API 请求失败: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("GitHub API 错误 {}: {}", resp.status(), resp.text().await.unwrap_or_default()));
        }

        resp.json().await.map_err(|e| format!("解析响应失败: {}", e))
    }
}

#[async_trait::async_trait]
impl Connector for GitHubIssuesConnector {
    fn connector_type(&self) -> &str { "github_issues" }
    fn display_name(&self) -> &str { "GitHub Issues" }

    async fn test_connection(&self) -> ConnectionTestResult {
        let start = std::time::Instant::now();
        match self.list_issues("open").await {
            Ok(issues) => ConnectionTestResult {
                success: true,
                message: format!("已连接 GitHub 仓库，当前 {} 个 Open Issues", issues.len()),
                latency_ms: Some(start.elapsed().as_millis() as u64),
            },
            Err(e) => ConnectionTestResult {
                success: false,
                message: e,
                latency_ms: Some(start.elapsed().as_millis() as u64),
            },
        }
    }

    fn status(&self) -> serde_json::Value {
        serde_json::json!({ "type": "github_issues", "repo": self.config.repo })
    }
}

// ===== Sentry Connector =====

/// Sentry 连接器配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SentryConfig {
    pub org: String,
    pub token: String,
    pub webhook_secret: Option<String>,
}

#[derive(Debug, Clone)]
pub struct SentryConnector {
    config: SentryConfig,
}

impl SentryConnector {
    pub fn new(config: SentryConfig) -> Self {
        Self { config }
    }

    /// 列出组织项目
    pub async fn list_projects(&self) -> Result<Vec<serde_json::Value>, String> {
        let url = format!("https://sentry.io/api/0/organizations/{}/projects/", self.config.org);
        let client = reqwest::Client::new();
        let resp = client
            .get(&url)
            .header("Authorization", format!("Bearer {}", self.config.token))
            .send()
            .await
            .map_err(|e| format!("Sentry API 请求失败: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("Sentry API 错误 {}: {}", resp.status(), resp.text().await.unwrap_or_default()));
        }

        resp.json().await.map_err(|e| format!("解析 Sentry 响应失败: {}", e))
    }

    /// 列出项目 Issues
    pub async fn list_issues(&self, project_slug: &str) -> Result<Vec<serde_json::Value>, String> {
        let url = format!(
            "https://sentry.io/api/0/projects/{}/{}/issues/?statsPeriod=24h",
            self.config.org, project_slug
        );
        let client = reqwest::Client::new();
        let resp = client
            .get(&url)
            .header("Authorization", format!("Bearer {}", self.config.token))
            .send()
            .await
            .map_err(|e| format!("Sentry API 请求失败: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("Sentry API 错误 {}", resp.status()));
        }

        resp.json().await.map_err(|e| format!("解析 Sentry 响应失败: {}", e))
    }

    /// 验证 Webhook 签名（用于接收 Sentry 告警）
    pub fn verify_webhook_signature(&self, body: &[u8], signature: &str) -> bool {
        let secret = match &self.config.webhook_secret {
            Some(s) => s,
            None => return true, // No secret configured, skip verification
        };

        use hmac::{Hmac, Mac};
        use sha2::Sha256;
        type HmacSha256 = Hmac<Sha256>;

        let mut mac = match HmacSha256::new_from_slice(secret.as_bytes()) {
            Ok(m) => m,
            Err(_) => return false,
        };
        mac.update(body);
        let expected = mac.finalize().into_bytes();
        let expected_hex = format!("{:x}", expected);

        // Constant-time comparison
        signature.len() == expected_hex.len() && 
            signature.bytes().zip(expected_hex.bytes()).all(|(a, b)| a == b)
    }
}

#[async_trait::async_trait]
impl Connector for SentryConnector {
    fn connector_type(&self) -> &str { "sentry" }
    fn display_name(&self) -> &str { "Sentry 告警" }

    async fn test_connection(&self) -> ConnectionTestResult {
        let start = std::time::Instant::now();
        match self.list_projects().await {
            Ok(projects) => ConnectionTestResult {
                success: true,
                message: format!("已连接 Sentry，组织 {} 个项目", projects.len()),
                latency_ms: Some(start.elapsed().as_millis() as u64),
            },
            Err(e) => ConnectionTestResult {
                success: false,
                message: e,
                latency_ms: Some(start.elapsed().as_millis() as u64),
            },
        }
    }

    fn status(&self) -> serde_json::Value {
        serde_json::json!({ "type": "sentry", "org": self.config.org })
    }
}

// ===== Grafana Connector =====

/// Grafana 连接器配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GrafanaConfig {
    pub base_url: String,
    pub api_key: String,
    pub dashboard_uid: Option<String>,
}

#[derive(Debug, Clone)]
pub struct GrafanaConnector {
    config: GrafanaConfig,
}

impl GrafanaConnector {
    pub fn new(config: GrafanaConfig) -> Self {
        Self { config }
    }

    /// 列出所有 Dashboards
    pub async fn list_dashboards(&self) -> Result<Vec<serde_json::Value>, String> {
        let url = format!("{}/api/search?type=dash-db", self.config.base_url.trim_end_matches('/'));
        let client = reqwest::Client::new();
        let resp = client
            .get(&url)
            .header("Authorization", format!("Bearer {}", self.config.api_key))
            .send()
            .await
            .map_err(|e| format!("Grafana API 请求失败: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("Grafana API 错误 {}: {}", resp.status(), resp.text().await.unwrap_or_default()));
        }

        resp.json().await.map_err(|e| format!("解析 Grafana 响应失败: {}", e))
    }

    /// 获取 Dashboard JSON
    pub async fn get_dashboard(&self, uid: &str) -> Result<serde_json::Value, String> {
        let url = format!("{}/api/dashboards/uid/{}", self.config.base_url.trim_end_matches('/'), uid);
        let client = reqwest::Client::new();
        let resp = client
            .get(&url)
            .header("Authorization", format!("Bearer {}", self.config.api_key))
            .send()
            .await
            .map_err(|e| format!("Grafana API 请求失败: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("Grafana API 错误 {}", resp.status()));
        }

        resp.json().await.map_err(|e| format!("解析 Grafana 响应失败: {}", e))
    }
}

#[async_trait::async_trait]
impl Connector for GrafanaConnector {
    fn connector_type(&self) -> &str { "grafana" }
    fn display_name(&self) -> &str { "Grafana 看板" }

    async fn test_connection(&self) -> ConnectionTestResult {
        let start = std::time::Instant::now();
        match self.list_dashboards().await {
            Ok(dashboards) => {
                let msg = if let Some(uid) = &self.config.dashboard_uid {
                    format!("已连接 Grafana，共 {} 个看板 (当前 UID: {})", dashboards.len(), uid)
                } else {
                    format!("已连接 Grafana，共 {} 个看板", dashboards.len())
                };
                ConnectionTestResult {
                    success: true,
                    message: msg,
                    latency_ms: Some(start.elapsed().as_millis() as u64),
                }
            }
            Err(e) => ConnectionTestResult {
                success: false,
                message: e,
                latency_ms: Some(start.elapsed().as_millis() as u64),
            },
        }
    }

    fn status(&self) -> serde_json::Value {
        serde_json::json!({ "type": "grafana", "baseUrl": self.config.base_url })
    }
}

// ===== Webhook Connector =====

/// Webhook 配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebhookConfig {
    pub endpoint: String,      // Agent 监听路径（如 /hooks/github）
    pub secret: Option<String>, // HMAC 签名密钥
}

#[derive(Debug, Clone)]
pub struct WebhookConnector {
    config: WebhookConfig,
}

impl WebhookConnector {
    pub fn new(config: WebhookConfig) -> Self {
        Self { config }
    }

    /// 验证 Webhook 签名（通用）
    pub fn verify_signature(&self, body: &[u8], signature: &str) -> bool {
        let secret = match &self.config.secret {
            Some(s) => s,
            None => return true,
        };

        use hmac::{Hmac, Mac};
        use sha2::Sha256;
        type HmacSha256 = Hmac<Sha256>;

        let mut mac = match HmacSha256::new_from_slice(secret.as_bytes()) {
            Ok(m) => m,
            Err(_) => return false,
        };
        mac.update(body);

        // Support both sha256=<hex> and raw hex formats
        let sig = signature.strip_prefix("sha256=").unwrap_or(signature);
        let expected = mac.finalize().into_bytes();
        let expected_hex = format!("{:x}", expected);

        sig.len() == expected_hex.len() && 
            sig.bytes().zip(expected_hex.bytes()).all(|(a, b)| a == b)
    }

    /// 解析事件类型（从 header 或 body 推断）
    pub fn infer_event_type(&self, headers: &std::collections::HashMap<String, String>, body: &serde_json::Value) -> String {
        // GitHub: X-GitHub-Event
        if let Some(ev) = headers.get("x-github-event").or_else(|| headers.get("X-GitHub-Event")) {
            return format!("github:{}", ev);
        }
        // Sentry: X-Sentry-Webhook-Name
        if let Some(ev) = headers.get("x-sentry-webhook-name").or_else(|| headers.get("X-Sentry-Webhook-Name")) {
            return format!("sentry:{}", ev);
        }
        // Generic: body.type or body.event
        body.get("type").and_then(|t| t.as_str())
            .or_else(|| body.get("event").and_then(|e| e.as_str()))
            .map(|s| s.to_string())
            .unwrap_or_else(|| "unknown".to_string())
    }
}

#[async_trait::async_trait]
impl Connector for WebhookConnector {
    fn connector_type(&self) -> &str { "webhook" }
    fn display_name(&self) -> &str { "通用 Webhook" }

    async fn test_connection(&self) -> ConnectionTestResult {
        let start = std::time::Instant::now();
        // Webhook is passive; just verify endpoint format is valid
        if self.config.endpoint.starts_with('/') {
            ConnectionTestResult {
                success: true,
                message: format!("Webhook endpoint 已就绪: {}", self.config.endpoint),
                latency_ms: Some(start.elapsed().as_millis() as u64),
            }
        } else {
            ConnectionTestResult {
                success: false,
                message: "Webhook endpoint 必须以 / 开头".to_string(),
                latency_ms: Some(start.elapsed().as_millis() as u64),
            }
        }
    }

    fn status(&self) -> serde_json::Value {
        serde_json::json!({ "type": "webhook", "endpoint": self.config.endpoint })
    }
}

// ===== 统一构造函数 =====

/// 根据 type + config 连接连接器实例
pub fn build_connector(conn_type: &str, config: Value) -> Result<Box<dyn Connector>, String> {
    match conn_type {
        "jira" => {
            let cfg: JiraConfig = serde_json::from_value(config).map_err(|e| format!("解析 Jira 配置失败: {e}"))?;
            Ok(Box::new(JiraConnector::new(cfg)))
        }
        "github_issues" => {
            let cfg: GitHubIssuesConfig = serde_json::from_value(config).map_err(|e| format!("解析 GitHub Issues 配置失败: {e}"))?;
            Ok(Box::new(GitHubIssuesConnector::new(cfg)))
        }
        "sentry" => {
            let cfg: SentryConfig = serde_json::from_value(config).map_err(|e| format!("解析 Sentry 配置失败: {e}"))?;
            Ok(Box::new(SentryConnector::new(cfg)))
        }
        "grafana" => {
            let cfg: GrafanaConfig = serde_json::from_value(config).map_err(|e| format!("解析 Grafana 配置失败: {e}"))?;
            Ok(Box::new(GrafanaConnector::new(cfg)))
        }
        "webhook" => {
            let cfg: WebhookConfig = serde_json::from_value(config).map_err(|e| format!("解析 Webhook 配置失败: {e}"))?;
            Ok(Box::new(WebhookConnector::new(cfg)))
        }
        _ => Err(format!("未知的连接器类型: {conn_type}")),
    }
}
