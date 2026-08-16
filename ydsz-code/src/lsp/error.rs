use thiserror::Error;

#[derive(Debug, Error)]
pub enum LspError {
    #[error("LSP 服务器启动失败: {0}")]
    ServerStartFailed(String),
    #[error("LSP 通信失败: {0}")]
    CommunicationFailed(String),
    #[error("不支持的语言: {0}")]
    UnsupportedLanguage(String),
    #[error("IO 错误: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON 错误: {0}")]
    Json(#[from] serde_json::Error),
}
