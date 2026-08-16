use thiserror::Error;

#[derive(Debug, Error)]
pub enum IndexerError {
    #[error("索引构建失败: {0}")]
    BuildFailed(String),
    #[error("解析失败: {0}")]
    ParseFailed(String),
    /// tree-sitter 解析错误
    #[error("AST 解析错误: {0}")]
    ParseError(String),
    /// 不支持的文件类型/语言
    #[error("不支持的文件: {0}")]
    UnsupportedFile(String),
    #[error("IO 错误: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON 错误: {0}")]
    Json(#[from] serde_json::Error),
}
