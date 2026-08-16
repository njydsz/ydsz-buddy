//! # 向量嵌入语义搜索（Code 域能力）
//!
//! 提供双模式语义搜索能力：
//!
//! - **TF-IDF 模式**（[`SemanticIndex`]）：纯 Rust 轻量级实现，无需外部 API
//! - **Embedding 模式**（[`EmbeddingIndex`]）：调用 OpenAI 兼容的 Embedding API，语义精度更高
//!
//! ## 模块架构
//!
//! ```text
//! ┌─────────────────────────────────────────────────────┐
//! │ semantic                                            │
//! ├─────────────────────────────────────────────────────┤
//! │  ┌──────────────┐  ┌──────────────┐  ┌───────────┐ │
//! │  │ SemanticIndex│  │EmbeddingIndex│  │ chunker   │ │
//! │  │ (TF-IDF)     │  │ (Embedding)  │  │ (分块器)  │ │
//! │  └──────────────┘  └──────┬───────┘  └───────────┘ │
//! │                          │                          │
//! │        ┌─────────────────┼─────────────────┐       │
//! │        │                 │                 │       │
//! │  ┌─────┴──────┐  ┌──────┴───────┐         │       │
//! │  │EmbeddingClient│ │ VectorStore  │         │       │
//! │  │ (API 调用)  │  │ (内存向量)    │         │       │
//! │  └────────────┘  └──────────────┘         │       │
//! └─────────────────────────────────────────────────────┘
//! ```
//!
//! ## 使用场景
//!
//! - 代码库语义搜索（比全文检索更智能）
//! - 文档库语义搜索
//! - 知识库问答
//!
//! ## 模式选择
//!
//! | 场景 | 推荐模式 | 原因 |
//! |------|----------|------|
//! | 离线 / 无 API Key | TF-IDF | 零依赖，即开即用 |
//! | 高精度语义检索 | Embedding | 向量相似度更准确 |
//! | 大规模代码库 | Embedding | 支持分块 + 增量索引 |

pub mod chunker;
pub mod embedding;
pub mod embedding_index;
pub mod error;
pub mod hnsw_store;
pub mod vector_store;

pub use chunker::{chunk_code, generate_chunk_id, ChunkConfig, CodeChunk};
pub use embedding::{EmbeddingClient, EmbeddingConfig, EmbeddingResult, DEFAULT_EMBEDDING_MODEL};
pub use embedding_index::{BackendKind, EmbeddingIndex, VectorBackend};
pub use error::SemanticError;
pub use hnsw_store::{
    HnswConfig, HnswVectorStore, HNSW_THRESHOLD, DEFAULT_EF_CONSTRUCTION,
    DEFAULT_EF_SEARCH, DEFAULT_MAX_NB_CONNECTION,
};
pub use vector_store::{cosine_similarity, VectorRecord, VectorSearchResult, VectorStore};

pub type SemanticResult<T> = Result<T, SemanticError>;

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use tracing::info;

// ============================================================================
// 类型定义
// ============================================================================

/// 文档条目
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Document {
    /// 文档 ID
    pub id: String,
    /// 文档路径或标识
    pub path: String,
    /// 文档内容
    pub content: String,
}

/// 搜索结果条目
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SemanticSearchResult {
    /// 文档 ID
    pub id: String,
    /// 文档路径
    pub path: String,
    /// 相关性分数（0-1，越高越相关）
    pub score: f64,
    /// 匹配的片段
    pub snippet: String,
}

/// 搜索响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SemanticSearchResponse {
    /// 搜索查询
    pub query: String,
    /// 结果列表
    pub results: Vec<SemanticSearchResult>,
    /// 索引文档总数
    pub total_docs: usize,
}

// ============================================================================
// SemanticIndex — TF-IDF 语义索引
// ============================================================================

/// TF-IDF 语义索引
///
/// 使用 TF-IDF 算法构建文档的语义索引。
/// 纯 Rust 实现，无需外部 API，适合离线场景。
pub struct SemanticIndex {
    /// 文档列表
    documents: Vec<Document>,
    /// 词项到文档频率的映射（DF）
    doc_freq: HashMap<String, usize>,
    /// 每篇文档的 TF 向量
    doc_tf: Vec<HashMap<String, f64>>,
    /// 词项总数（用于 IDF 计算）
    total_docs: usize,
}

impl SemanticIndex {
    /// 创建空索引
    pub fn new() -> Self {
        Self {
            documents: Vec::new(),
            doc_freq: HashMap::new(),
            doc_tf: Vec::new(),
            total_docs: 0,
        }
    }

    /// 从文件列表构建索引
    pub fn build_from_files(paths: &[String]) -> SemanticResult<Self> {
        info!(count = paths.len(), "构建语义索引");
        let mut index = Self::new();

        for path in paths {
            let content = std::fs::read_to_string(path)
                .map_err(|e| SemanticError::IoError(format!("读取文件失败 {path}: {e}")))?;
            index.add_document(Document {
                id: path.clone(),
                path: path.clone(),
                content,
            });
        }

        Ok(index)
    }

    /// 从目录递归构建索引
    pub fn build_from_directory(dir: &str, extensions: &[&str]) -> SemanticResult<Self> {
        info!(dir = %dir, "从目录构建语义索引");
        let mut index = Self::new();
        let root = Path::new(dir);

        for entry in walkdir::WalkDir::new(root)
            .max_depth(10)
            .into_iter()
            .flatten()
        {
            if entry.file_type().is_file() {
                let path = entry.path();
                let ext = path
                    .extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("");

                if extensions.is_empty() || extensions.contains(&ext) {
                    if let Ok(content) = std::fs::read_to_string(path) {
                        let path_str = path.to_string_lossy().to_string();
                        index.add_document(Document {
                            id: path_str.clone(),
                            path: path_str,
                            content,
                        });
                    }
                }
            }
        }

        Ok(index)
    }

    /// 添加单篇文档
    pub fn add_document(&mut self, doc: Document) {
        let tokens = tokenize(&doc.content);
        let total_tokens = tokens.len() as f64;

        // 计算 TF
        let mut tf: HashMap<String, f64> = HashMap::new();
        for token in &tokens {
            *tf.entry(token.clone()).or_insert(0.0) += 1.0;
        }
        // 归一化 TF
        for v in tf.values_mut() {
            *v /= total_tokens.max(1.0);
        }

        // 更新 DF
        for term in tf.keys() {
            *self.doc_freq.entry(term.clone()).or_insert(0) += 1;
        }

        self.total_docs += 1;
        self.documents.push(doc);
        self.doc_tf.push(tf);
    }

    /// 搜索
    pub fn search(&self, query: &str, max_results: usize) -> SemanticSearchResponse {
        let query_tokens = tokenize(query);
        let query_tf = compute_query_tf(&query_tokens);

        // 计算每篇文档的相似度（cosine similarity 近似）
        let mut scored: Vec<(usize, f64)> = self
            .doc_tf
            .iter()
            .enumerate()
            .map(|(idx, doc_tf)| {
                let score = self.compute_similarity(&query_tf, doc_tf);
                (idx, score)
            })
            .filter(|(_, score)| *score > 0.0)
            .collect();

        // 按分数降序排序
        scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        scored.truncate(max_results);

        let results = scored
            .into_iter()
            .map(|(idx, score)| {
                let doc = &self.documents[idx];
                let snippet = extract_snippet(&doc.content, query, 200);
                SemanticSearchResult {
                    id: doc.id.clone(),
                    path: doc.path.clone(),
                    score,
                    snippet,
                }
            })
            .collect();

        SemanticSearchResponse {
            query: query.to_string(),
            results,
            total_docs: self.total_docs,
        }
    }

    /// 计算 query 与文档的相似度
    fn compute_similarity(
        &self,
        query_tf: &HashMap<String, f64>,
        doc_tf: &HashMap<String, f64>,
    ) -> f64 {
        let mut score = 0.0;
        for (term, qtf) in query_tf {
            if let Some(dtf) = doc_tf.get(term) {
                let df = self.doc_freq.get(term).copied().unwrap_or(1) as f64;
                let idf = ((self.total_docs as f64) / df).ln();
                score += qtf * dtf * idf;
            }
        }
        // 归一化到 0-1 范围（使用 sigmoid）
        score = 1.0 / (1.0 + (-score).exp());
        score
    }

    /// 文档数量
    pub fn len(&self) -> usize {
        self.total_docs
    }

    /// 是否为空
    pub fn is_empty(&self) -> bool {
        self.total_docs == 0
    }
}

impl Default for SemanticIndex {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================================
// 分词器（TF-IDF 模式使用）
// ============================================================================

/// 分词函数：支持中英文混合
fn tokenize(text: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let lower = text.to_lowercase();

    // 按非字母数字字符分割
    let mut current = String::new();
    for ch in lower.chars() {
        if ch.is_alphanumeric() || ch == '_' {
            current.push(ch);
        } else {
            if !current.is_empty() {
                // 驼峰分割
                tokens.extend(split_camel_case(&current));
                current.clear();
            }
            // 中文字符单独成词
            if is_cjk(ch) {
                tokens.push(ch.to_string());
            }
        }
    }
    if !current.is_empty() {
        tokens.extend(split_camel_case(&current));
    }

    // 过滤停用词和过短的词
    tokens
        .into_iter()
        .filter(|t| t.len() > 1 || is_cjk(t.chars().next().unwrap_or(' ')))
        .collect()
}

/// 判断是否为 CJK 字符
fn is_cjk(ch: char) -> bool {
    let code = ch as u32;
    (0x4E00..=0x9FFF).contains(&code) || (0x3400..=0x4DBF).contains(&code)
}

/// 驼峰分割：camelCase -> [camel, case]
fn split_camel_case(s: &str) -> Vec<String> {
    let mut result = Vec::new();
    let mut current = String::new();

    for ch in s.chars() {
        if ch.is_uppercase() && !current.is_empty() {
            result.push(current.clone());
            current.clear();
        }
        current.push(ch);
    }
    if !current.is_empty() {
        result.push(current);
    }
    result
}

/// 计算 query 的 TF
fn compute_query_tf(tokens: &[String]) -> HashMap<String, f64> {
    let total = tokens.len() as f64;
    let mut tf: HashMap<String, f64> = HashMap::new();
    for token in tokens {
        *tf.entry(token.clone()).or_insert(0.0) += 1.0;
    }
    for v in tf.values_mut() {
        *v /= total.max(1.0);
    }
    tf
}

/// 提取查询匹配的片段
fn extract_snippet(content: &str, query: &str, max_len: usize) -> String {
    let max_len = max_len.min(200);
    let lower_content = content.to_lowercase();
    let lower_query = query.to_lowercase();

    // 找到第一个匹配位置
    let pos = lower_content
        .find(&lower_query)
        .or_else(|| {
            // 尝试匹配第一个查询词
            let first_word = lower_query.split_whitespace().next()?;
            lower_content.find(first_word)
        });

    match pos {
        Some(p) => {
            let start = p.saturating_sub(max_len / 3);
            let end = (start + max_len).min(content.len());
            let mut snippet = content[start..end].to_string();
            if start > 0 {
                snippet.insert_str(0, "...");
            }
            if end < content.len() {
                snippet.push_str("...");
            }
            snippet
        }
        None => content.chars().take(max_len).collect(),
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tokenize_english() {
        let tokens = tokenize("hello world foo_bar");
        assert!(tokens.contains(&"hello".to_string()));
        assert!(tokens.contains(&"world".to_string()));
        assert!(tokens.contains(&"foo_bar".to_string()));
    }

    #[test]
    fn test_tokenize_camel_case() {
        let tokens = tokenize("camelCaseString");
        assert!(tokens.contains(&"camel".to_string()));
        assert!(tokens.contains(&"case".to_string()));
        assert!(tokens.contains(&"string".to_string()));
    }

    #[test]
    fn test_tokenize_chinese() {
        let tokens = tokenize("你好世界 hello");
        assert!(tokens.contains(&"你".to_string()));
        assert!(tokens.contains(&"好".to_string()));
        assert!(tokens.contains(&"hello".to_string()));
    }

    #[test]
    fn test_build_and_search() {
        let mut index = SemanticIndex::new();
        index.add_document(Document {
            id: "1".into(),
            path: "auth.rs".into(),
            content: "user authentication login password session token".into(),
        });
        index.add_document(Document {
            id: "2".into(),
            path: "db.rs".into(),
            content: "database connection pool query insert update delete".into(),
        });
        index.add_document(Document {
            id: "3".into(),
            path: "auth_middleware.rs".into(),
            content: "authentication middleware token verify session check".into(),
        });

        let result = index.search("authentication login", 10);
        assert!(!result.results.is_empty());
        // auth.rs 和 auth_middleware.rs 应该排在前面
        assert!(result.results[0].path.contains("auth"));
    }

    #[test]
    fn test_search_no_results() {
        let mut index = SemanticIndex::new();
        index.add_document(Document {
            id: "1".into(),
            path: "test.rs".into(),
            content: "hello world".into(),
        });

        let result = index.search("nonexistent_xyz", 10);
        assert!(result.results.is_empty());
    }

    #[test]
    fn test_empty_index() {
        let index = SemanticIndex::new();
        let result = index.search("test", 10);
        assert!(result.results.is_empty());
        assert_eq!(result.total_docs, 0);
    }

    #[test]
    fn test_extract_snippet() {
        let content = "This is a long text that contains the search query somewhere in the middle.";
        let snippet = extract_snippet(content, "search query", 50);
        assert!(snippet.contains("search query"));
    }

    #[test]
    fn test_index_from_documents() {
        let mut index = SemanticIndex::new();
        for i in 0..5 {
            index.add_document(Document {
                id: format!("doc_{i}"),
                path: format!("file_{i}.rs"),
                content: format!("document number {i} with some unique content"),
            });
        }
        assert_eq!(index.len(), 5);

        let result = index.search("document unique", 3);
        assert!(result.results.len() <= 3);
    }

    #[test]
    fn test_is_cjk() {
        assert!(is_cjk('你'));
        assert!(is_cjk('好'));
        assert!(!is_cjk('a'));
        assert!(!is_cjk('1'));
    }

    #[test]
    fn test_split_camel_case() {
        let parts = split_camel_case("helloWorld");
        assert_eq!(parts, vec!["hello", "World"]);

        let parts = split_camel_case("simple");
        assert_eq!(parts, vec!["simple"]);
    }
}
