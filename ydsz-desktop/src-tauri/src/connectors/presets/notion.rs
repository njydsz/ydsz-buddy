//! # Notion 连接器预置实例
//!
//! 连接 Notion API，读写页面/数据库。
//! 使用 Internal Integration Token 认证。

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Notion 连接器配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotionConfig {
    /// Internal Integration Token (secret_xxx)
    pub token: String,
    /// API 版本
    #[serde(default = "default_api_version")]
    pub api_version: String,
}

fn default_api_version() -> String {
    "2022-06-28".to_string()
}

/// 页面搜索结果项
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PageInfo {
    pub id: String,
    pub title: String,
    pub url: String,
    pub last_edited_time: String,
}

/// 页面内容
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PageContent {
    pub id: String,
    pub title: String,
    pub content_blocks: Value,
    pub url: String,
    pub last_edited_time: String,
}

/// 创建页面请求
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePageRequest {
    /// 父页面 ID 或数据库 ID
    pub parent_id: String,
    /// 父类型：page_id 或 database_id
    #[serde(default = "default_parent_type")]
    pub parent_type: String,
    /// 页面标题
    pub title: String,
    /// 页面内容（纯文本或 Markdown）
    pub content: Option<String>,
}

fn default_parent_type() -> String {
    "page_id".to_string()
}

/// Notion 连接器客户端
#[derive(Debug, Clone)]
pub struct NotionConnector {
    config: NotionConfig,
    client: reqwest::Client,
}

impl NotionConnector {
    /// 创建新的 Notion 连接器
    pub fn new(config: NotionConfig) -> Result<Self, String> {
        let mut headers = reqwest::header::HeaderMap::new();
        headers.insert(
            reqwest::header::AUTHORIZATION,
            format!("Bearer {}", config.token)
                .parse()
                .map_err(|e| format!("构建 Authorization header 失败: {}", e))?,
        );
        headers.insert(
            "Notion-Version",
            config
                .api_version
                .parse()
                .map_err(|e| format!("构建 Notion-Version header 失败: {}", e))?,
        );
        headers.insert(
            reqwest::header::CONTENT_TYPE,
            "application/json"
                .parse()
                .map_err(|e| format!("构建 Content-Type header 失败: {}", e))?,
        );

        let client = reqwest::Client::builder()
            .default_headers(headers)
            .build()
            .map_err(|e| format!("创建 HTTP client 失败: {}", e))?;

        Ok(Self { config, client })
    }

    /// 搜索页面/数据库
    pub async fn search_pages(&self, query: &str) -> Result<Vec<PageInfo>, String> {
        let url = "https://api.notion.com/v1/search";
        let body = serde_json::json!({
            "query": query,
            "filter": { "value": "page", "property": "object" },
            "page_size": 20
        });

        let resp = self
            .client
            .post(url)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("请求失败: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("Notion API 返回错误: {}", resp.status()));
        }

        let result: Value = resp
            .json()
            .await
            .map_err(|e| format!("解析响应失败: {}", e))?;

        let items = result
            .get("results")
            .and_then(|v| v.as_array())
            .ok_or("响应格式不正确")?;

        Ok(items
            .iter()
            .take(20)
            .filter_map(|item| {
                let title = extract_notion_title(item)?;
                Some(PageInfo {
                    id: item.get("id")?.as_str()?.to_string(),
                    title,
                    url: item.get("url")?.as_str()?.to_string(),
                    last_edited_time: item.get("last_edited_time")?.as_str()?.to_string(),
                })
            })
            .collect())
    }

    /// 读取页面内容
    pub async fn read_page(&self, page_id: &str) -> Result<PageContent, String> {
        // 获取页面元数据
        let meta_url = format!("https://api.notion.com/v1/pages/{}", page_id);
        let meta_resp = self
            .client
            .get(&meta_url)
            .send()
            .await
            .map_err(|e| format!("请求页面元数据失败: {}", e))?;

        if !meta_resp.status().is_success() {
            return Err(format!(
                "Notion API 返回错误: {}",
                meta_resp.status()
            ));
        }

        let meta: Value = meta_resp
            .json()
            .await
            .map_err(|e| format!("解析页面元数据失败: {}", e))?;

        let title = extract_notion_title(&meta).unwrap_or_default();
        let url = meta
            .get("url")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let last_edited = meta
            .get("last_edited_time")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        // 获取页面块内容
        let blocks_url = format!(
            "https://api.notion.com/v1/blocks/{}/children?page_size=50",
            page_id
        );
        let blocks_resp = self
            .client
            .get(&blocks_url)
            .send()
            .await
            .map_err(|e| format!("请求页面内容失败: {}", e))?;

        let content_blocks = if blocks_resp.status().is_success() {
            blocks_resp
                .json()
                .await
                .map_err(|e| format!("解析页面内容失败: {}", e))?
        } else {
            Value::Null
        };

        Ok(PageContent {
            id: page_id.to_string(),
            title,
            content_blocks,
            url,
            last_edited_time: last_edited,
        })
    }

    /// 创建新页面
    pub async fn create_page(&self, req: CreatePageRequest) -> Result<PageInfo, String> {
        let url = "https://api.notion.com/v1/pages";

        let parent = match req.parent_type.as_str() {
            "database_id" => {
                serde_json::json!({ "database_id": req.parent_id })
            }
            _ => {
                serde_json::json!({ "page_id": req.parent_id })
            }
        };

        let children = req.content.map(|text| {
            vec![serde_json::json!({
                "object": "block",
                "type": "paragraph",
                "paragraph": {
                    "rich_text": [{ "type": "text", "text": { "content": text } }]
                }
            })]
        });

        let mut body = serde_json::json!({
            "parent": parent,
            "properties": {
                "title": {
                    "title": [{ "type": "text", "text": { "content": req.title } }]
                }
            }
        });

        if let Some(blocks) = children {
            if let Some(obj) = body.as_object_mut() {
                obj.insert("children".to_string(), Value::Array(blocks));
            }
        }

        let resp = self
            .client
            .post(url)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("请求失败: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("Notion API 返回错误: {}", resp.status()));
        }

        let result: Value = resp
            .json()
            .await
            .map_err(|e| format!("解析响应失败: {}", e))?;

        Ok(PageInfo {
            id: result
                .get("id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            title: req.title,
            url: result
                .get("url")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            last_edited_time: result
                .get("last_edited_time")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
        })
    }
}

/// 从 Notion 页面对象中提取标题
fn extract_notion_title(page: &Value) -> Option<String> {
    let title_field = page.get("properties")?.get("title")?;
    let title_arr = title_field.get("title").or_else(|| {
        // pages 返回的 properties.title
        title_field.get("title")
    })?;
    let first = title_arr.as_array()?.first()?;
    first
        .get("plain_text")
        .or_else(|| first.get("text")?.get("content"))
        .and_then(|v| v.as_str())
        .map(String::from)
}
