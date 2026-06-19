//! # Auth 模块错误类型
//!
//! 本模块定义了认证与授权过程中可能产生的所有错误类型。
//!
//! 基于 `thiserror` 派生 `Display` 和 `Error` trait，提供统一的错误分类与友好的中文错误信息。
//! 同时通过 [`AuthResult`] 类型别名简化函数签名中的错误处理。
//!
//! ## 错误分类
//!
//! | 变体 | 用途 | 典型场景 |
//! |------|------|----------|
//! | [`AuthenticationFailed`](AuthError::AuthenticationFailed) | 认证失败 | 令牌无效、凭证错误 |
//! | [`InvalidToken`](AuthError::InvalidToken) | 令牌无效 | 令牌格式错误、签名验证失败 |
//! | [`TokenExpired`](AuthError::TokenExpired) | 令牌已过期 | 会话超时、令牌失效 |
//! | [`SessionNotFound`](AuthError::SessionNotFound) | 会话不存在 | 会话已撤销、会话 ID 无效 |
//! | [`Forbidden`](AuthError::Forbidden) | 权限不足 | 角色权限不匹配 |
//! | [`SecretStoreError`](AuthError::SecretStoreError) | 密钥存储错误 | 密钥读写失败 |
//! | [`PairingLinkNotFound`](AuthError::PairingLinkNotFound) | 配对链接不存在 | 配对码无效或已过期 |
//! | [`InternalError`](AuthError::InternalError) | 内部错误 | 系统异常、不可恢复错误 |

use thiserror::Error;

/// # Auth 错误类型
///
/// 认证与授权模块的统一错误枚举，涵盖认证全流程中可能出现的错误场景。
/// 使用 [`thiserror`] 派生 [`std::error::Error`] 实现，
/// 每个变体通过 `#[error(...)]` 属性定义人类可读的错误消息格式。
///
/// ## 错误处理建议
///
/// - [`AuthenticationFailed`](AuthError::AuthenticationFailed)、
///   [`InvalidToken`](AuthError::InvalidToken) 和 [`TokenExpired`](AuthError::TokenExpired)
///   属于**客户端错误**，应返回 401 状态码并提示用户重新认证
/// - [`Forbidden`](AuthError::Forbidden) 属于**权限错误**，应返回 403 状态码
/// - [`SecretStoreError`](AuthError::SecretStoreError) 和
///   [`InternalError`](AuthError::InternalError) 属于**系统错误**，应记录日志并返回 500 状态码
#[derive(Error, Debug)]
pub enum AuthError {
    /// 认证失败
    ///
    /// 当用户提供的凭证无效或认证流程失败时返回。
    ///
    /// - `String` — 具体的认证失败原因描述
    #[error("认证失败: {0}")]
    AuthenticationFailed(String),

    /// 令牌无效
    ///
    /// 当提供的令牌格式不正确、签名验证失败或令牌不存在时返回。
    #[error("令牌无效")]
    InvalidToken,

    /// 令牌已过期
    ///
    /// 当提供的令牌已超过有效期时返回。
    /// 客户端应使用刷新令牌或重新认证获取新令牌。
    #[error("令牌已过期")]
    TokenExpired,

    /// 会话不存在
    ///
    /// 当请求的会话 ID 不存在或已被撤销时返回。
    ///
    /// - `String` — 会话 ID
    #[error("会话不存在: {0}")]
    SessionNotFound(String),

    /// 权限不足
    ///
    /// 当用户的角色权限不足以执行请求的操作时返回。
    ///
    /// - `String` — 权限不足的原因描述
    #[error("权限不足: {0}")]
    Forbidden(String),

    /// 密钥存储错误
    ///
    /// 当密钥的读取、写入或删除操作失败时返回。
    ///
    /// - `String` — 具体的存储错误原因描述
    #[error("密钥存储错误: {0}")]
    SecretStoreError(String),

    /// 配对链接不存在
    ///
    /// 当请求的配对码无效、已过期或已被使用时返回。
    ///
    /// - `String` — 配对码
    #[error("配对链接不存在: {0}")]
    PairingLinkNotFound(String),

    /// 内部错误
    ///
    /// 当发生未预期的系统内部错误时返回。
    /// 此类错误通常表示程序 Bug 或不可恢复的异常，应记录详细日志并上报。
    ///
    /// - `String` — 具体的内部错误原因描述
    #[error("内部错误: {0}")]
    InternalError(String),
}

/// # Auth 结果类型
///
/// 基于 [`AuthError`] 的结果类型别名，用于简化函数签名。
/// 所有认证模块的操作均应返回此类型。
///
/// ## 泛型参数
///
/// - `T` — 操作成功时返回的值类型
///
/// ## 使用示例
///
/// ```rust
/// use remi_auth::AuthResult;
///
/// fn authenticate_user() -> AuthResult<String> {
///     Ok("session_token".to_string())
/// }
/// ```
pub type AuthResult<T> = Result<T, AuthError>;
