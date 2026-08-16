//! # 语义搜索错误类型

use thiserror::Error;

#[derive(Debug, Error)]
pub enum SemanticError {
    #[error("IO 错误: {0}")]
    IoError(String),

    #[error("索引为空")]
    EmptyIndex,

    #[error("网络错误: {0}")]
    NetworkError(String),

    #[error("Embedding API 错误: {0}")]
    EmbeddingError(String),

    #[error("向量维度不匹配: 期望 {expected}, 实际 {actual}")]
    VectorDimensionMismatch { expected: usize, actual: usize },
}
