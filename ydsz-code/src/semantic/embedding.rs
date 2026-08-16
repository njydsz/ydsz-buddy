//! # Embedding API 客户端
//!
//! 调用 OpenAI 兼容的 `/embeddings` 端点生成文本向量，
//! 用于语义代码检索。支持任意 OpenAI 兼容端点（含 OneAPI / Ollama 等）。
//!
//! ## 设计
//!
//! - 使用 `reqwest` 异步 HTTP 客户端
//! - 支持批量嵌入（最多 64 条/请求）
//! - 自动截断超长文本（> 8000 字符）
//! - 超时保护（30s）

use serde::{Deserialize, Serialize};

use super::SemanticResult;
use super::error::SemanticError;

/// Embedding 请求配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmbeddingConfig {
    /// API base URL，如 `https://api.openai.com/v1`
    pub base_url: String,
    /// API Key
    pub api_key: String,
    /// embedding 模型名，如 `text-embedding-3-small`
    pub model: String,
}

/// 单次 embedding 请求结果
#[derive(Debug, Clone)]
pub struct EmbeddingResult {
    /// 生成的向量
    pub vector: Vec<f64>,
    /// 消耗的 token 数（如果 API 返回）
    pub token_count: Option<u32>,
}

/// 默认 embedding 模型
pub const DEFAULT_EMBEDDING_MODEL: &str = "text-embedding-3-small";

/// 最大批量文本数（避免单次请求过大）
const MAX_BATCH_SIZE: usize = 64;

/// 最大单文本长度（超出截断）
const MAX_INPUT_LENGTH: usize = 8000;

/// 请求超时（秒）
const REQUEST_TIMEOUT_SECS: u64 = 30;

/// OpenAI 兼容的 embeddings 请求体
#[derive(Serialize)]
struct EmbeddingRequest {
    model: String,
    input: Vec<String>,
}

/// OpenAI 兼容的 embeddings 响应体
#[derive(Deserialize)]
struct EmbeddingResponse {
    data: Vec<EmbeddingData>,
    usage: Option<EmbeddingUsage>,
}

#[derive(Deserialize)]
struct EmbeddingData {
    embedding: Vec<f64>,
}

#[derive(Deserialize)]
struct EmbeddingUsage {
    total_tokens: Option<u32>,
}

/// 标准化 base URL，移除尾部斜杠
fn normalize_base_url(base_url: &str) -> String {
    base_url.trim().trim_end_matches('/').to_string()
}

/// Embedding 客户端
pub struct EmbeddingClient {
    config: EmbeddingConfig,
    client: reqwest::Client,
}

impl EmbeddingClient {
    /// 创建新的 embedding 客户端
    pub fn new(config: EmbeddingConfig) -> SemanticResult<Self> {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(REQUEST_TIMEOUT_SECS))
            .build()
            .map_err(|e| SemanticError::NetworkError(format!("创建 HTTP 客户端失败: {e}")))?;

        Ok(Self { config, client })
    }

    /// 对单个文本生成 embedding 向量
    pub async fn embed_text(&self, text: &str) -> SemanticResult<EmbeddingResult> {
        let results = self.embed_batch(&[text]).await?;
        results.into_iter().next().ok_or(SemanticError::EmbeddingError(
            "API 返回空结果".to_string(),
        ))
    }

    /// 对多个文本批量生成 embedding 向量
    ///
    /// 自动分批处理（每批最多 64 条），自动截断超长文本。
    pub async fn embed_batch(&self, texts: &[&str]) -> SemanticResult<Vec<EmbeddingResult>> {
        if texts.is_empty() {
            return Ok(Vec::new());
        }

        // 分批处理
        let mut all_results = Vec::with_capacity(texts.len());
        for chunk in texts.chunks(MAX_BATCH_SIZE) {
            let results = self.embed_batch_single(chunk).await?;
            all_results.extend(results);
        }

        Ok(all_results)
    }

    /// 单次批量请求（内部方法）
    async fn embed_batch_single(&self, texts: &[&str]) -> SemanticResult<Vec<EmbeddingResult>> {
        // 截断超长文本
        let truncated: Vec<String> = texts
            .iter()
            .map(|t| {
                if t.len() > MAX_INPUT_LENGTH {
                    t[..MAX_INPUT_LENGTH].to_string()
                } else {
                    t.to_string()
                }
            })
            .collect();

        let url = format!("{}/embeddings", normalize_base_url(&self.config.base_url));

        let request_body = EmbeddingRequest {
            model: self.config.model.clone(),
            input: truncated,
        };

        let mut request_builder = self
            .client
            .post(&url)
            .header("Content-Type", "application/json")
            .json(&request_body);

        if !self.config.api_key.is_empty() {
            request_builder = request_builder.bearer_auth(&self.config.api_key);
        }

        let response = request_builder
            .send()
            .await
            .map_err(|e| SemanticError::NetworkError(format!("Embedding API 请求失败: {e}")))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(SemanticError::EmbeddingError(format!(
                "Embedding API 错误 {status}: {}",
                &body[..body.len().min(200)]
            )));
        }

        let data: EmbeddingResponse = response
            .json()
            .await
            .map_err(|e| SemanticError::EmbeddingError(format!("解析 Embedding API 响应失败: {e}")))?;

        if data.data.len() != texts.len() {
            return Err(SemanticError::EmbeddingError(format!(
                "Embedding API 返回 {} 个向量，期望 {} 个",
                data.data.len(),
                texts.len()
            )));
        }

        let token_count = data.usage.and_then(|u| u.total_tokens);

        Ok(data
            .data
            .into_iter()
            .map(|entry| EmbeddingResult {
                vector: entry.embedding,
                token_count,
            })
            .collect())
    }

    /// 获取配置的模型名
    pub fn model(&self) -> &str {
        &self.config.model
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_base_url() {
        assert_eq!(normalize_base_url("https://api.openai.com/v1/"), "https://api.openai.com/v1");
        assert_eq!(normalize_base_url("https://api.openai.com/v1"), "https://api.openai.com/v1");
        assert_eq!(normalize_base_url("  https://example.com/v1//  "), "https://example.com/v1");
    }

    #[test]
    fn test_embedding_config_serialization() {
        let config = EmbeddingConfig {
            base_url: "https://api.openai.com/v1".into(),
            api_key: "sk-test".into(),
            model: "text-embedding-3-small".into(),
        };
        let json = serde_json::to_string(&config).unwrap();
        let deserialized: EmbeddingConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.base_url, config.base_url);
        assert_eq!(deserialized.api_key, config.api_key);
        assert_eq!(deserialized.model, config.model);
    }
}
