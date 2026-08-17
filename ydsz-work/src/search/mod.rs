use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default)]
pub struct SearchConfig {
    pub api_key: Option<String>,
    pub endpoint: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SearchEngine {
    DuckDuckGo,
    Google,
    Bing,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResultItem {
    pub title: String,
    pub url: String,
    pub snippet: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResponse {
    pub query: String,
    pub results: Vec<SearchResultItem>,
    pub engine: String,
    pub total: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UrlSummary {
    pub url: String,
    pub title: String,
    pub text: String,
    pub content_length: usize,
}

#[derive(Debug, Clone)]
pub struct SearchService {
    config: SearchConfig,
}

impl SearchService {
    pub fn new(config: SearchConfig) -> Self {
        Self { config }
    }

    pub async fn search(&self, query: &str) -> anyhow::Result<SearchResponse> {
        Ok(SearchResponse {
            query: query.to_string(),
            results: vec![],
            engine: "duckduckgo".to_string(),
            total: 0,
        })
    }

    pub async fn search_with_engine(&self, query: &str, engine: SearchEngine) -> anyhow::Result<SearchResponse> {
        let _ = engine;
        self.search(query).await
    }

    pub async fn fetch_url(&self, url: &str) -> anyhow::Result<String> {
        let _ = url;
        Ok(String::new())
    }

    pub async fn fetch_url_summary(&self, url: &str) -> anyhow::Result<UrlSummary> {
        Ok(UrlSummary {
            url: url.to_string(),
            title: String::new(),
            text: String::new(),
            content_length: 0,
        })
    }
}

impl serde::Serialize for SearchService {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where S: serde::Serializer {
        serializer.serialize_none()
    }
}
