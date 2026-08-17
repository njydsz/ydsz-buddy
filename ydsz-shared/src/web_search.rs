//! # Web 搜索与内容获取（P0-2）
//!
//! 网页搜索和 URL 内容抓取的基础设施。
//!
//! ## 设计
//!
//! - `WebSearchAdapter` trait 抽象不同搜索引擎（Tavily / SerpAPI / Bing / Brave）
//! - `WebFetchAdapter` trait 抽象 URL 内容提取
//! - 统一的搜索结果和内容提取数据结构

use async_trait::async_trait;
use serde::{Deserialize, Serialize};

// ============================================================================
// 搜索结果
// ============================================================================

/// 搜索结果条目
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebSearchResultItem {
    /// 页面标题
    pub title: String,
    /// 页面 URL
    pub url: String,
    /// 摘要文本
    #[serde(skip_serializing_if = "Option::is_none")]
    pub snippet: Option<String>,
    /// 页面内容（高级搜索时可能包含）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    /// 发布时间
    #[serde(skip_serializing_if = "Option::is_none")]
    pub published_at: Option<String>,
    /// 来源站点
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    /// 相关性评分
    #[serde(default)]
    pub score: f64,
}

/// 搜索结果集合
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebSearchResult {
    /// 查询关键词
    pub query: String,
    /// 结果条目
    pub items: Vec<WebSearchResultItem>,
    /// 总结果数
    #[serde(default)]
    pub total_count: usize,
    /// 搜索耗时（毫秒）
    #[serde(default)]
    pub elapsed_ms: u64,
    /// 使用的搜索引擎
    pub provider: String,
}

impl WebSearchResult {
    /// 将搜索结果格式化为 Markdown
    pub fn to_markdown(&self) -> String {
        let mut lines = vec![format!("🔍 搜索: \"{}\" ({} 条结果)\n", self.query, self.items.len())];

        for (i, item) in self.items.iter().enumerate() {
            lines.push(format!("{}. **{}**", i + 1, item.title));
            lines.push(format!("   🔗 {}", item.url));

            if let Some(ref snippet) = item.snippet {
                lines.push(format!("   📝 {}", snippet));
            }
            lines.push(String::new());
        }

        lines.join("\n")
    }

    /// 转换为简洁的文本摘要
    pub fn to_summary(&self) -> String {
        self.items
            .iter()
            .map(|item| {
                format!(
                    "- {} ({})",
                    item.title,
                    item.url
                )
            })
            .collect::<Vec<_>>()
            .join("\n")
    }
}

// ============================================================================
// Web Fetch 结果
// ============================================================================

/// 内容提取模式
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ExtractMode {
    Markdown,
    Text,
    Html,
}

impl Default for ExtractMode {
    fn default() -> Self {
        ExtractMode::Markdown
    }
}

/// URL 内容抓取结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebFetchResult {
    /// 请求的 URL
    pub url: String,
    /// 是否成功
    pub success: bool,
    /// 提取的内容
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    /// 内容类型
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content_type: Option<String>,
    /// 页面标题
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    /// 提取模式
    #[serde(default)]
    pub extract_mode: ExtractMode,
    /// 错误信息（失败时）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    /// 耗时（毫秒）
    #[serde(default)]
    pub elapsed_ms: u64,
}

impl WebFetchResult {
    /// 创建成功的抓取结果
    pub fn success(url: impl Into<String>, content: impl Into<String>, mode: ExtractMode) -> Self {
        Self {
            url: url.into(),
            success: true,
            content: Some(content.into()),
            content_type: None,
            title: None,
            extract_mode: mode,
            error: None,
            elapsed_ms: 0,
        }
    }

    /// 创建失败的抓取结果
    pub fn failure(url: impl Into<String>, error: impl Into<String>) -> Self {
        Self {
            url: url.into(),
            success: false,
            content: None,
            content_type: None,
            title: None,
            extract_mode: ExtractMode::Markdown,
            error: Some(error.into()),
            elapsed_ms: 0,
        }
    }

    /// 将结果格式化为 Markdown
    pub fn to_markdown(&self) -> String {
        if !self.success {
            return format!("❌ 抓取失败: {} - {}", self.url, self.error.as_deref().unwrap_or("未知错误"));
        }

        let mut lines = vec![];

        if let Some(ref title) = self.title {
            lines.push(format!("## {}", title));
        }

        lines.push(format!("🔗 来源: {}", self.url));

        if let Some(ref content) = self.content {
            lines.push(String::new());
            lines.push(content.clone());
        }

        lines.join("\n")
    }
}

// ============================================================================
// 搜索 Adapter Trait
// ============================================================================

/// Web 搜索 Adapter
///
/// 不同搜索引擎后端实现此 trait。
#[async_trait]
pub trait WebSearchAdapter: Send + Sync {
    /// 获取 Adapter 名称
    fn name(&self) -> &str;

    /// 执行搜索
    async fn search(
        &self,
        query: &str,
        max_results: usize,
        search_depth: &str,
    ) -> anyhow::Result<WebSearchResult>;

    /// 检查服务是否可用
    async fn is_available(&self) -> bool {
        true
    }
}

/// Web Fetch Adapter
///
/// URL 内容提取后端实现此 trait。
#[async_trait]
pub trait WebFetchAdapter: Send + Sync {
    /// 获取 Adapter 名称
    fn name(&self) -> &str;

    /// 抓取 URL 内容
    async fn fetch(
        &self,
        url: &str,
        extract_mode: ExtractMode,
        max_length: Option<usize>,
    ) -> anyhow::Result<WebFetchResult>;

    /// 检查服务是否可用
    async fn is_available(&self) -> bool {
        true
    }
}

// ============================================================================
// Tavily 搜索 Adapter
// ============================================================================

/// Tavily 搜索配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TavilyConfig {
    /// API Key
    pub api_key: String,
    /// 搜索深度（basic / advanced）
    #[serde(default = "default_search_depth")]
    pub search_depth: String,
    /// 基础 URL
    #[serde(default = "default_tavily_base_url")]
    pub base_url: String,
}

fn default_search_depth() -> String {
    "basic".to_string()
}

fn default_tavily_base_url() -> String {
    "https://api.tavily.com".to_string()
}

impl Default for TavilyConfig {
    fn default() -> Self {
        Self {
            api_key: String::new(),
            search_depth: default_search_depth(),
            base_url: default_tavily_base_url(),
        }
    }
}

/// Tavily 搜索 Adapter
///
/// 基于 Tavily API（专为 AI 应用优化的搜索引擎）。
#[derive(Debug, Clone)]
pub struct TavilySearchAdapter {
    config: TavilyConfig,
}

impl TavilySearchAdapter {
    /// 创建新的 Tavily 搜索 Adapter
    pub fn new(config: TavilyConfig) -> Self {
        Self { config }
    }

    /// 创建带 API Key 的 Adapter
    pub fn with_api_key(api_key: impl Into<String>) -> Self {
        Self {
            config: TavilyConfig {
                api_key: api_key.into(),
                ..Default::default()
            },
        }
    }
}

#[async_trait]
impl WebSearchAdapter for TavilySearchAdapter {
    fn name(&self) -> &str {
        "tavily"
    }

    async fn search(
        &self,
        query: &str,
        _max_results: usize,
        _search_depth: &str,
    ) -> anyhow::Result<WebSearchResult> {
        // 实际实现需要调用 Tavily API
        // POST https://api.tavily.com/search
        // Body: { "query": "...", "max_results": 5, "search_depth": "basic" }

        if self.config.api_key.is_empty() {
            return Err(anyhow::anyhow!("Tavily API Key 未配置"));
        }

        // 返回占位结果
        Ok(WebSearchResult {
            query: query.to_string(),
            items: vec![],
            total_count: 0,
            elapsed_ms: 0,
            provider: self.name().to_string(),
        })
    }

    async fn is_available(&self) -> bool {
        !self.config.api_key.is_empty()
    }
}

// ============================================================================
// 简单 URL 抓取 Adapter
// ============================================================================

/// 简单 URL 抓取 Adapter
///
/// 使用 HTTP 客户端 + HTML 解析器抓取页面内容。
#[derive(Debug, Clone)]
pub struct SimpleFetchAdapter {
    /// 最大内容长度
    pub max_length: usize,
    /// User-Agent
    pub user_agent: String,
}

impl SimpleFetchAdapter {
    /// 创建新的 Adapter
    pub fn new() -> Self {
        Self {
            max_length: 50_000,
            user_agent: "ydsz-buddy/0.4.0 (Web Fetch Bot)".to_string(),
        }
    }

    /// 设置最大内容长度
    pub fn with_max_length(mut self, max_length: usize) -> Self {
        self.max_length = max_length;
        self
    }
}

impl Default for SimpleFetchAdapter {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl WebFetchAdapter for SimpleFetchAdapter {
    fn name(&self) -> &str {
        "simple-fetch"
    }

    async fn fetch(
        &self,
        url: &str,
        extract_mode: ExtractMode,
        max_length: Option<usize>,
    ) -> anyhow::Result<WebFetchResult> {
        // 实际实现需要：
        // 1. 发送 HTTP GET 请求
        // 2. 解析 HTML 提取正文
        // 3. 根据 extract_mode 转换格式

        let _ = (extract_mode, max_length);

        // 检查 URL 格式
        if !url.starts_with("http://") && !url.starts_with("https://") {
            return Ok(WebFetchResult::failure(url, "URL 必须以 http:// 或 https:// 开头"));
        }

        Ok(WebFetchResult::failure(
            url,
            "SimpleFetch 需要 reqwest + html2text 依赖",
        ))
    }
}

// ============================================================================
// Web 服务（聚合搜索 + 抓取）
// ============================================================================

/// Web 搜索与抓取服务
///
/// 聚合搜索和抓取 Adapter，提供统一的高层 API。
pub struct WebService {
    search_adapter: Option<Box<dyn WebSearchAdapter>>,
    fetch_adapter: Option<Box<dyn WebFetchAdapter>>,
}

impl WebService {
    /// 创建新的 Web 服务
    pub fn new() -> Self {
        Self {
            search_adapter: None,
            fetch_adapter: None,
        }
    }

    /// 设置搜索 Adapter
    pub fn with_search(mut self, adapter: Box<dyn WebSearchAdapter>) -> Self {
        self.search_adapter = Some(adapter);
        self
    }

    /// 设置抓取 Adapter
    pub fn with_fetch(mut self, adapter: Box<dyn WebFetchAdapter>) -> Self {
        self.fetch_adapter = Some(adapter);
        self
    }

    /// 执行搜索
    pub async fn search(
        &self,
        query: &str,
        max_results: usize,
    ) -> anyhow::Result<WebSearchResult> {
        match &self.search_adapter {
            Some(adapter) => adapter.search(query, max_results, "basic").await,
            None => Err(anyhow::anyhow!("未配置搜索 Adapter")),
        }
    }

    /// 抓取 URL
    pub async fn fetch(&self, url: &str) -> anyhow::Result<WebFetchResult> {
        match &self.fetch_adapter {
            Some(adapter) => adapter.fetch(url, ExtractMode::Markdown, None).await,
            None => Err(anyhow::anyhow!("未配置抓取 Adapter")),
        }
    }

    /// 检查搜索服务是否可用
    pub async fn is_search_available(&self) -> bool {
        match &self.search_adapter {
            Some(adapter) => adapter.is_available().await,
            None => false,
        }
    }

    /// 检查抓取服务是否可用
    pub async fn is_fetch_available(&self) -> bool {
        match &self.fetch_adapter {
            Some(adapter) => adapter.is_available().await,
            None => false,
        }
    }
}

impl Default for WebService {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================================
// 测试
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_search_result_markdown() {
        let result = WebSearchResult {
            query: "Rust async programming".to_string(),
            items: vec![
                WebSearchResultItem {
                    title: "Async Rust Guide".to_string(),
                    url: "https://example.com/async".to_string(),
                    snippet: Some("Learn async programming in Rust".to_string()),
                    content: None,
                    published_at: None,
                    source: Some("example.com".to_string()),
                    score: 0.95,
                },
            ],
            total_count: 1,
            elapsed_ms: 120,
            provider: "tavily".to_string(),
        };

        let md = result.to_markdown();
        assert!(md.contains("Async Rust Guide"));
        assert!(md.contains("example.com/async"));
    }

    #[test]
    fn test_fetch_result_failure() {
        let result = WebFetchResult::failure("https://example.com", "Connection timeout");
        assert!(!result.success);
        assert_eq!(result.error, Some("Connection timeout".to_string()));
    }

    #[test]
    fn test_tavily_config_default() {
        let config = TavilyConfig::default();
        assert_eq!(config.search_depth, "basic");
        assert_eq!(config.base_url, "https://api.tavily.com");
    }

    #[test]
    fn test_extract_mode_default() {
        let mode = ExtractMode::default();
        assert_eq!(mode, ExtractMode::Markdown);
    }

    #[tokio::test]
    async fn test_web_service_not_configured() {
        let service = WebService::new();
        assert!(!service.is_search_available().await);
        assert!(!service.is_fetch_available().await);
    }
}
