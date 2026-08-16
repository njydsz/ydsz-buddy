//! # Web Search 命令模块
//!
//! 提供互联网搜索和 URL 内容抓取相关的 Tauri 命令，
//! 直接调用 ydsz-shared crate 的 SearchService。
//!
//! ## 命令清单
//!
//! | 命令 | 说明 |
//! |------|------|
//! | `search_web` | 执行网页搜索（自动选择搜索引擎） |
//! | `search_web_with_engine` | 使用指定搜索引擎搜索 |
//! | `search_fetch_url` | 抓取 URL 内容（返回纯文本） |
//! | `search_fetch_url_summary` | 抓取 URL 内容（返回结构化摘要） |

use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::State;
use tracing::info;

use ydsz_work::search::{SearchConfig, SearchEngine, SearchService};

/// 搜索状态管理器
///
/// 持有 SearchService 实例，通过互斥锁保证线程安全。
pub struct SearchState {
    service: Mutex<SearchService>,
}

impl Default for SearchState {
    fn default() -> Self {
        Self::new()
    }
}

impl SearchState {
    /// 创建新的搜索状态管理器
    pub fn new() -> Self {
        let service = SearchService::new(SearchConfig::default());
        Self {
            service: Mutex::new(service),
        }
    }
}

/// 搜索引擎选项（前端可传入）
#[derive(Debug, Clone, Deserialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum SearchEngineInput {
    /// 自动选择（根据环境变量）
    Auto,
    /// DuckDuckGo（默认，无需 API Key）
    DuckDuckGo,
    /// Google Custom Search API
    Google,
    /// Bing Search API
    Bing,
}

impl From<SearchEngineInput> for Option<SearchEngine> {
    fn from(input: SearchEngineInput) -> Self {
        match input {
            SearchEngineInput::Auto => None,
            SearchEngineInput::DuckDuckGo => Some(SearchEngine::DuckDuckGo),
            SearchEngineInput::Google => Some(SearchEngine::Google),
            SearchEngineInput::Bing => Some(SearchEngine::Bing),
        }
    }
}

/// 搜索结果条目
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct WebSearchResultItem {
    /// 结果标题
    pub title: String,
    /// 结果 URL
    pub url: String,
    /// 摘要描述
    pub snippet: String,
}

/// 搜索响应
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct WebSearchResponseDto {
    /// 搜索查询
    pub query: String,
    /// 结果列表
    pub results: Vec<WebSearchResultItem>,
    /// 搜索引擎标识
    pub engine: String,
    /// 总结果数
    pub total: usize,
}

/// URL 抓取摘要
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct UrlSummaryDto {
    /// 最终 URL（可能经过重定向）
    pub url: String,
    /// 页面标题
    pub title: String,
    /// 提取的纯文本
    pub text: String,
    /// 原始内容字节长度
    pub content_length: usize,
}

/// 执行网页搜索
///
/// 根据环境变量自动选择搜索引擎后端。
///
/// # 参数
///
/// - `query`: 搜索查询字符串
///
/// # 返回值
///
/// - `Ok(WebSearchResponseDto)`: 搜索成功
/// - `Err(String)`: 搜索失败
#[tauri::command]
#[specta::specta]
pub async fn search_web(
    state: State<'_, SearchState>,
    query: String,
) -> Result<WebSearchResponseDto, String> {
    info!(query = %query, "执行网页搜索");
    let service = state.service.lock().map_err(|e| e.to_string())?.clone();
    let response = service.search(&query).await.map_err(|e| e.to_string())?;

    Ok(WebSearchResponseDto {
        query: response.query,
        results: response
            .results
            .into_iter()
            .map(|r| WebSearchResultItem {
                title: r.title,
                url: r.url,
                snippet: r.snippet,
            })
            .collect(),
        engine: response.engine,
        total: response.total,
    })
}

/// 使用指定搜索引擎搜索
///
/// # 参数
///
/// - `query`: 搜索查询字符串
/// - `engine`: 搜索引擎（auto / duckduckgo / google / bing）
#[tauri::command]
#[specta::specta]
pub async fn search_web_with_engine(
    state: State<'_, SearchState>,
    query: String,
    engine: SearchEngineInput,
) -> Result<WebSearchResponseDto, String> {
    info!(query = %query, engine = ?engine, "使用指定搜索引擎搜索");
    let service = state.service.lock().map_err(|e| e.to_string())?.clone();

    let response = match Option::<SearchEngine>::from(engine) {
        Some(e) => service.search_with_engine(&query, e).await,
        None => service.search(&query).await,
    }
    .map_err(|e| e.to_string())?;

    Ok(WebSearchResponseDto {
        query: response.query,
        results: response
            .results
            .into_iter()
            .map(|r| WebSearchResultItem {
                title: r.title,
                url: r.url,
                snippet: r.snippet,
            })
            .collect(),
        engine: response.engine,
        total: response.total,
    })
}

/// 抓取 URL 内容（返回纯文本）
///
/// # 参数
///
/// - `url`: 要抓取的 URL
///
/// # 返回值
///
/// - `Ok(String)`: 抓取成功，返回纯文本内容
/// - `Err(String)`: 抓取失败
#[tauri::command]
#[specta::specta]
pub async fn search_fetch_url(
    state: State<'_, SearchState>,
    url: String,
) -> Result<String, String> {
    info!(url = %url, "抓取 URL 内容");
    let service = state.service.lock().map_err(|e| e.to_string())?.clone();
    service.fetch_url(&url).await.map_err(|e| e.to_string())
}

/// 抓取 URL 内容（返回结构化摘要）
///
/// # 参数
///
/// - `url`: 要抓取的 URL
///
/// # 返回值
///
/// - `Ok(UrlSummaryDto)`: 抓取成功，返回标题 + 纯文本 + 元数据
/// - `Err(String)`: 抓取失败
#[tauri::command]
#[specta::specta]
pub async fn search_fetch_url_summary(
    state: State<'_, SearchState>,
    url: String,
) -> Result<UrlSummaryDto, String> {
    info!(url = %url, "抓取 URL 摘要");
    let service = state.service.lock().map_err(|e| e.to_string())?.clone();
    let summary = service.fetch_url_summary(&url).await.map_err(|e| e.to_string())?;

    Ok(UrlSummaryDto {
        url: summary.url,
        title: summary.title,
        text: summary.text,
        content_length: summary.content_length,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_search_engine_input_conversion() {
        let auto: Option<SearchEngine> = SearchEngineInput::Auto.into();
        assert!(auto.is_none());

        let ddg: Option<SearchEngine> = SearchEngineInput::DuckDuckGo.into();
        assert_eq!(ddg, Some(SearchEngine::DuckDuckGo));

        let google: Option<SearchEngine> = SearchEngineInput::Google.into();
        assert_eq!(google, Some(SearchEngine::Google));
    }

    #[test]
    fn test_search_state_creation() {
        let state = SearchState::new();
        assert!(state.service.lock().is_ok());
    }
}
