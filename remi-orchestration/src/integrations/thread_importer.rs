//! Thread 导入器。
//!
//! 大厂标准：用户可能从 ChatGPT、Cursor、Markdown 笔记等多个源
//! 迁移历史会话。本模块提供统一的导入接口，将外部数据
//! 规范化为 [`ImportedThread`]。

use chrono::{DateTime, Utc};
use remi_contracts::{MessageRole, ThreadId};
use serde::{Deserialize, Serialize};

/// 导入源标识。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum ImportSource {
    /// ChatGPT 导出的 JSON 格式。
    ChatGpt,
    /// Cursor 导出的 JSON 格式。
    Cursor,
    /// Markdown 文件。
    Markdown,
    /// 通用 JSON 格式（remi-code 原生）。
    Json,
    /// OpenAI 兼容 API 的会话历史。
    OpenAiCompatible,
}

impl std::fmt::Display for ImportSource {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::ChatGpt => write!(f, "chatgpt"),
            Self::Cursor => write!(f, "cursor"),
            Self::Markdown => write!(f, "markdown"),
            Self::Json => write!(f, "json"),
            Self::OpenAiCompatible => write!(f, "openai-compatible"),
        }
    }
}

/// 已导入的消息。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportedMessage {
    /// 原始消息 ID（如有）。
    pub id: Option<String>,
    /// 消息角色。
    pub role: MessageRole,
    /// 消息内容。
    pub content: String,
    /// 消息时间戳。
    pub timestamp: Option<DateTime<Utc>>,
}

/// 已导入的会话。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportedThread {
    /// 原始会话 ID。
    pub original_id: Option<String>,
    /// 会话标题。
    pub title: Option<String>,
    /// 消息列表。
    pub messages: Vec<ImportedMessage>,
    /// 导入源。
    pub source: ImportSource,
    /// 创建时间。
    pub created_at: Option<DateTime<Utc>>,
}

impl ImportedThread {
    /// 构造一个新导入的会话。
    pub fn new(source: ImportSource) -> Self {
        Self {
            original_id: None,
            title: None,
            messages: Vec::new(),
            source,
            created_at: Some(Utc::now()),
        }
    }
}

/// 导入统计信息。
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ImportStats {
    /// 导入的会话数。
    pub threads_imported: u32,
    /// 导入的消息数。
    pub messages_imported: u32,
    /// 跳过的消息数（解析失败等）。
    pub messages_skipped: u32,
    /// 错误数。
    pub errors: u32,
}

/// Thread 导入器 trait。
#[async_trait::async_trait]
pub trait ThreadImporter: Send + Sync {
    /// 声明该导入器支持的源。
    fn source(&self) -> ImportSource;

    /// 从原始内容中解析出 [`ImportedThread`]。
    async fn parse(&self, content: &str) -> Result<Vec<ImportedThread>, remi_core::Error>;
}

/// 通用 JSON 导入器。
pub struct JsonThreadImporter;

#[async_trait::async_trait]
impl ThreadImporter for JsonThreadImporter {
    fn source(&self) -> ImportSource {
        ImportSource::Json
    }

    async fn parse(&self, content: &str) -> Result<Vec<ImportedThread>, remi_core::Error> {
        let value: serde_json::Value = serde_json::from_str(content)
            .map_err(|e| remi_core::Error::Parse(format!("JSON 解析失败: {e}")))?;
        // 支持单会话或多会话
        if let Some(arr) = value.as_array() {
            let threads: Vec<ImportedThread> = serde_json::from_value(value.clone())
                .map_err(|e| remi_core::Error::Parse(format!("反序列化失败: {e}")))?;
            Ok(threads)
        } else {
            let thread: ImportedThread = serde_json::from_value(value)
                .map_err(|e| remi_core::Error::Parse(format!("反序列化失败: {e}")))?;
            Ok(vec![thread])
        }
    }
}

/// ChatGPT 导出 JSON 导入器。
pub struct ChatGptThreadImporter;

#[async_trait::async_trait]
impl ThreadImporter for ChatGptThreadImporter {
    fn source(&self) -> ImportSource {
        ImportSource::ChatGpt
    }

    async fn parse(&self, content: &str) -> Result<Vec<ImportedThread>, remi_core::Error> {
        // ChatGPT 导出的 JSON 结构：
        // [{ "title": "...", "create_time": ..., "mapping": { ... } }]
        let value: serde_json::Value = serde_json::from_str(content)
            .map_err(|e| remi_core::Error::Parse(format!("ChatGPT JSON 解析失败: {e}")))?;
        let arr = value
            .as_array()
            .ok_or_else(|| remi_core::Error::Parse("ChatGPT 导出应为数组".to_string()))?;
        let mut threads = Vec::new();
        for item in arr {
            let mut thread = ImportedThread::new(ImportSource::ChatGpt);
            thread.title = item
                .get("title")
                .and_then(|t| t.as_str())
                .map(String::from);
            if let Some(mapping) = item.get("mapping").and_then(|m| m.as_object()) {
                // 按时间排序 message
                let mut messages: Vec<(f64, ImportedMessage)> = Vec::new();
                for (_id, node) in mapping {
                    if let Some(msg) = node.get("message") {
                        if let Some(content) = msg.get("content") {
                            let parts = content
                                .get("parts")
                                .and_then(|p| p.as_array())
                                .cloned()
                                .unwrap_or_default();
                            let text = parts
                                .iter()
                                .filter_map(|p| p.as_str())
                                .collect::<Vec<_>>()
                                .join("\n");
                            if text.is_empty() {
                                continue;
                            }
                            let role_str = msg
                                .get("author")
                                .and_then(|a| a.get("role"))
                                .and_then(|r| r.as_str())
                                .unwrap_or("user");
                            let role = match role_str {
                                "assistant" => MessageRole::Assistant,
                                "system" => MessageRole::System,
                                _ => MessageRole::User,
                            };
                            let create_time = msg
                                .get("create_time")
                                .and_then(|t| t.as_f64())
                                .unwrap_or(0.0);
                            messages.push((
                                create_time,
                                ImportedMessage {
                                    id: Some(_id.clone()),
                                    role,
                                    content: text,
                                    timestamp: None,
                                },
                            ));
                        }
                    }
                }
                messages.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));
                thread.messages = messages.into_iter().map(|(_, m)| m).collect();
            }
            thread.original_id = item
                .get("id")
                .and_then(|i| i.as_str())
                .map(String::from);
            threads.push(thread);
        }
        Ok(threads)
    }
}

/// Markdown 导入器 —— 简单格式：`## user\n文本\n## assistant\n文本`。
pub struct MarkdownThreadImporter;

#[async_trait::async_trait]
impl ThreadImporter for MarkdownThreadImporter {
    fn source(&self) -> ImportSource {
        ImportSource::Markdown
    }

    async fn parse(&self, content: &str) -> Result<Vec<ImportedThread>, remi_core::Error> {
        let mut thread = ImportedThread::new(ImportSource::Markdown);
        let mut current_role: Option<MessageRole> = None;
        let mut current_content = String::new();
        for line in content.lines() {
            if let Some(role) = line.strip_prefix("## ") {
                if let Some(r) = current_role.take() {
                    thread.messages.push(ImportedMessage {
                        id: None,
                        role: r,
                        content: current_content.trim().to_string(),
                        timestamp: None,
                    });
                    current_content.clear();
                }
                current_role = Some(match role.trim().to_lowercase().as_str() {
                    "assistant" | "ai" | "bot" => MessageRole::Assistant,
                    "system" => MessageRole::System,
                    _ => MessageRole::User,
                });
            } else if current_role.is_some() {
                if !current_content.is_empty() {
                    current_content.push('\n');
                }
                current_content.push_str(line);
            }
        }
        if let Some(r) = current_role.take() {
            thread.messages.push(ImportedMessage {
                id: None,
                role: r,
                content: current_content.trim().to_string(),
                timestamp: None,
            });
        }
        if thread.messages.is_empty() {
            return Err(remi_core::Error::Parse("未发现任何消息".to_string()));
        }
        Ok(vec![thread])
    }
}

/// 统一导入器：根据源自动选择解析器。
pub struct UnifiedThreadImporter {
    json: JsonThreadImporter,
    chatgpt: ChatGptThreadImporter,
    markdown: MarkdownThreadImporter,
}

impl Default for UnifiedThreadImporter {
    fn default() -> Self {
        Self::new()
    }
}

impl UnifiedThreadImporter {
    /// 创建一个新的统一导入器。
    pub fn new() -> Self {
        Self {
            json: JsonThreadImporter,
            chatgpt: ChatGptThreadImporter,
            markdown: MarkdownThreadImporter,
        }
    }

    /// 根据源自动解析。
    pub async fn parse(
        &self,
        source: ImportSource,
        content: &str,
    ) -> Result<Vec<ImportedThread>, remi_core::Error> {
        match source {
            ImportSource::ChatGpt => self.chatgpt.parse(content).await,
            ImportSource::Json | ImportSource::OpenAiCompatible | ImportSource::Cursor => {
                self.json.parse(content).await
            }
            ImportSource::Markdown => self.markdown.parse(content).await,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_json_importer_single_thread() {
        let importer = JsonThreadImporter;
        let content = serde_json::json!({
            "source": "Json",
            "messages": [
                {"role": "User", "content": "Hello"},
                {"role": "Assistant", "content": "Hi!"}
            ]
        })
        .to_string();
        let threads = importer.parse(&content).await.unwrap();
        assert_eq!(threads.len(), 1);
        assert_eq!(threads[0].messages.len(), 2);
    }

    #[tokio::test]
    async fn test_markdown_importer() {
        let importer = MarkdownThreadImporter;
        let content = "## user\nHello\n## assistant\nHi there\n## user\nBye";
        let threads = importer.parse(content).await.unwrap();
        assert_eq!(threads.len(), 1);
        assert_eq!(threads[0].messages.len(), 3);
        assert_eq!(threads[0].messages[0].role, MessageRole::User);
        assert_eq!(threads[0].messages[1].role, MessageRole::Assistant);
    }

    #[tokio::test]
    async fn test_chatgpt_importer() {
        let importer = ChatGptThreadImporter;
        let content = serde_json::json!([{
            "id": "abc",
            "title": "Test",
            "create_time": 1234.5,
            "mapping": {
                "node-1": {
                    "message": {
                        "author": {"role": "user"},
                        "content": {"parts": ["Hello"]},
                        "create_time": 100.0
                    }
                },
                "node-2": {
                    "message": {
                        "author": {"role": "assistant"},
                        "content": {"parts": ["Hi!"]},
                        "create_time": 200.0
                    }
                }
            }
        }])
        .to_string();
        let threads = importer.parse(&content).await.unwrap();
        assert_eq!(threads.len(), 1);
        assert_eq!(threads[0].messages.len(), 2);
        assert_eq!(threads[0].messages[0].role, MessageRole::User);
    }
}
