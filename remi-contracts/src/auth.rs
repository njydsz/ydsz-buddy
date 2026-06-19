//! 认证模块的 RPC 模式定义
//!
//! 本模块定义了"配对 → 颁发令牌 → 校验令牌 → 撤销令牌"完整链路的 DTO。
//! 所有结构体均使用 `camelCase` 序列化约定（通过 `#[serde(rename_all = "camelCase")]` 标注）。
//!
//! # 命名规范
//! - `Input` 后缀：RPC 入参
//! - `Output` 后缀：RPC 出参
//! - `Error` 后缀：RPC 错误类型
//!
//! # 安全注意
//! - 任何包含令牌的字段（如 `session_token`、`pairing_code`）都应仅通过 TLS/HTTPS 传输。
//! - 客户端在日志中打印 DTO 时务必脱敏。

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// 启动认证流程的入参
///
/// 客户端在首次连接或重连时携带 `client_id` 标识自己；可选的 `token` 用于
/// 携带已保存的会话令牌以尝试"静默恢复"。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AuthBootstrapInput {
    /// 客户端标识符（如设备指纹或安装 ID）
    pub client_id: String,
    /// 已保存的会话令牌（可选，用于免交互恢复）
    pub token: Option<String>,
}

/// 认证成功后的出参
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AuthBootstrapOutput {
    /// 会话令牌，客户端应安全保存
    pub session_token: String,
    /// 会话过期时间戳（ISO 8601 字符串）
    pub expires_at: String,
}

/// 创建配对凭证的入参
///
/// 桌面/CLI 端通过此接口生成一次性配对码，供远程设备扫码或复制粘贴完成登录。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AuthCreatePairingCredentialInput {
    /// 发起配对的设备标识符
    pub device_id: String,
    /// 用户可读的设备名称
    pub device_name: String,
}

/// 配对凭证创建成功的出参
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AuthCreatePairingCredentialOutput {
    /// 一次性配对码（如 `ABCD-1234`）
    pub pairing_code: String,
    /// 配对链接（用于扫码或浏览器跳转）
    pub pairing_link: String,
    /// 过期时间戳（ISO 8601 字符串）
    pub expires_at: String,
}

/// 校验认证令牌的入参
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AuthVerifyInput {
    /// 待校验的令牌
    pub token: String,
}

/// 撤销配对链接的入参
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AuthRevokePairingLinkInput {
    /// 待撤销的配对码
    pub code: String,
}

/// 撤销客户端会话的入参
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AuthRevokeClientSessionInput {
    /// 待撤销的会话令牌
    pub token: String,
}

/// 认证相关错误类型
///
/// 使用 `#[serde(tag = "_tag")]` 实现"外部判别式"序列化，方便前端做模式匹配。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, thiserror::Error)]
#[serde(tag = "_tag")]
pub enum AuthError {
    /// 凭证无效
    #[error("凭证无效")]
    InvalidCredentials,
    /// 会话已过期
    #[error("会话已过期")]
    SessionExpired,
    /// 配对链接已过期
    #[error("配对链接已过期")]
    PairingLinkExpired,
    /// 内部错误，附带可读的详细信息
    #[error("内部错误: {message}")]
    Internal { message: String },
}
