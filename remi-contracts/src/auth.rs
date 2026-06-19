//! 认证模式定义。

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// 启动认证的输入参数。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct AuthBootstrapInput {
    /// 客户端标识符。
    pub client_id: String,
    /// 启动令牌（如需要）。
    pub token: Option<String>,
}

/// 认证成功后的输出。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct AuthBootstrapOutput {
    /// 会话令牌。
    pub session_token: String,
    /// 会话过期时间戳（ISO 8601 格式）。
    pub expires_at: String,
}

/// 创建配对凭证的输入参数。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct AuthCreatePairingCredentialInput {
    /// 设备标识符。
    pub device_id: String,
    /// 设备名称。
    pub device_name: String,
}

/// 配对凭证创建成功的输出。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct AuthCreatePairingCredentialOutput {
    /// 配对码。
    pub pairing_code: String,
    /// 配对链接（用于基于 URL 的配对）。
    pub pairing_link: String,
    /// 过期时间戳（ISO 8601 格式）。
    pub expires_at: String,
}

/// 验证认证令牌的输入参数。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct AuthVerifyInput {
    /// 待验证的令牌。
    pub token: String,
}

/// 撤销配对链接的输入参数。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct AuthRevokePairingLinkInput {
    /// 待撤销的配对码。
    pub code: String,
}

/// 撤销客户端会话的输入参数。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct AuthRevokeClientSessionInput {
    /// 待撤销的会话令牌。
    pub token: String,
}

/// 认证错误类型。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, thiserror::Error)]
#[serde(tag = "_tag")]
pub enum AuthError {
    /// 凭证无效。
    #[error("凭证无效")]
    InvalidCredentials,
    /// 会话已过期。
    #[error("会话已过期")]
    SessionExpired,
    /// 配对链接已过期。
    #[error("配对链接已过期")]
    PairingLinkExpired,
    /// 内部错误。
    #[error("内部错误: {message}")]
    Internal { message: String },
}
