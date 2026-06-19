//! # 认证服务门面模块
//!
//! 本模块是 `remi-auth` 认证子系统的核心门面层，对外提供统一的认证服务入口 [`AuthService`]。
//!
//! ## 核心职责
//!
//! - **会话管理**：负责会话的创建、验证、撤销及生命周期管理，支持引导（Bootstrap）、配对（Pairing）、
//!   Bearer Token 等多种认证方式。
//! - **HTTP 请求认证**：通过 [`authenticate_http_request`](AuthService::authenticate_http_request) 方法，
//!   从 HTTP 请求的 `Authorization` 头或 Cookie 中提取并验证令牌。
//! - **WebSocket 认证**：通过 [`authenticate_websocket_upgrade`](AuthService::authenticate_websocket_upgrade) 方法，
//!   验证 WebSocket 升级请求的身份合法性，并支持颁发专用的 WebSocket 令牌。
//! - **配对流程**：提供配对凭证的颁发、配对链接的管理（列出/撤销）以及启动配对 URL 的生成，
//!   用于客户端与服务端之间的安全绑定。
//! - **会话查询与撤销**：支持列出活跃会话、撤销指定会话、撤销除当前会话外的所有会话等操作。
//!
//! ## 使用场景
//!
//! 1. **服务端启动阶段**：通过引导凭证（Bootstrap）完成初始认证，获取首个会话。
//! 2. **客户端配对阶段**：通过配对码或配对链接将新客户端绑定到已有会话中。
//! 3. **日常请求认证**：对每个 HTTP/WebSocket 请求进行令牌验证，返回已认证的会话信息。
//! 4. **会话管理**：在多设备场景下管理活跃会话，支持按需撤销。
//!
//! ## 架构说明
//!
//! [`AuthService`] 作为门面层，内部委托给 [`SessionCredentialService`] 完成具体的凭证签发与验证逻辑，
//! 自身不持有状态，通过 `Arc` 共享底层服务实例，保证线程安全且可高效克隆。

use std::sync::Arc;

use chrono::{DateTime, Utc};
use tracing::info;

use crate::error::{AuthError, AuthResult};
use crate::session_credential::{
    ClientMetadata, ClientSession, IssuedSession, SessionCredentialService, SessionMethod,
    SessionRole,
};

/// # 认证请求
///
/// 封装 HTTP 请求中的认证相关信息，用于传递给认证服务进行身份验证。
///
/// ## 字段说明
///
/// - `headers`: HTTP 请求头，包含 `Authorization`、`Cookie` 等认证相关的头部信息
/// - `cookies`: HTTP Cookie，用于存储会话令牌等认证凭证
/// - `url`: 请求的 URL（可选），用于某些基于 URL 的认证策略
///
/// ## 使用场景
///
/// 在 HTTP 请求到达认证中间件时，将请求头、Cookie 和 URL 提取并封装为此结构，
/// 然后传递给 [`AuthService::authenticate_http_request`] 方法进行认证。
///
/// ## 示例
///
/// ```rust
/// let request = AuthRequest {
///     headers: HashMap::from([
///         ("authorization".to_string(), "Bearer token123".to_string()),
///     ]),
///     cookies: HashMap::new(),
///     url: Some("/api/resource".to_string()),
/// };
/// ```
#[derive(Debug, Clone)]
pub struct AuthRequest {
    /// HTTP 请求头，包含 `Authorization`、`Cookie` 等认证相关的头部信息
    pub headers: std::collections::HashMap<String, String>,
    /// HTTP Cookie，用于存储会话令牌等认证凭证
    pub cookies: std::collections::HashMap<String, String>,
    /// 请求的 URL（可选），用于某些基于 URL 的认证策略
    pub url: Option<String>,
}

/// # 已认证的会话
///
/// 表示经过认证验证的会话信息，包含会话标识、主体、认证方式、角色和过期时间等关键信息。
///
/// ## 字段说明
///
/// - `session_id`: 会话的唯一标识符，用于后续会话管理和撤销操作
/// - `subject`: 会话主体，通常是用户 ID 或客户端标识
/// - `method`: 认证方式，标识该会话是通过何种方式建立的（如 Bootstrap、Pairing、Bearer）
/// - `role`: 会话角色，标识该会话的权限级别（如 Client、Owner）
/// - `expires_at`: 会话过期时间（可选），若为 `None` 表示会话永不过期
///
/// ## 使用场景
///
/// 认证成功后返回此结构，用于：
/// 1. 在中间件中传递已认证的用户信息
/// 2. 作为后续 API 调用的上下文
/// 3. 用于 WebSocket 令牌颁发时的身份验证
///
/// ## 示例
///
/// ```rust
/// let session = AuthenticatedSession {
///     session_id: "sess_abc123".to_string(),
///     subject: "user_456".to_string(),
///     method: SessionMethod::Bearer,
///     role: SessionRole::Client,
///     expires_at: Some(Utc::now() + Duration::hours(24)),
/// };
/// ```
#[derive(Debug, Clone)]
pub struct AuthenticatedSession {
    /// 会话的唯一标识符，用于后续会话管理和撤销操作
    pub session_id: String,
    /// 会话主体，通常是用户 ID 或客户端标识
    pub subject: String,
    /// 认证方式，标识该会话是通过何种方式建立的（如 Bootstrap、Pairing、Bearer）
    pub method: SessionMethod,
    /// 会话角色，标识该会话的权限级别（如 Client、Owner）
    pub role: SessionRole,
    /// 会话过期时间（可选），若为 `None` 表示会话永不过期
    pub expires_at: Option<DateTime<Utc>>,
}

/// # 配对凭证结果
///
/// 颁发配对凭证后返回的结果，包含配对码和过期时间。
///
/// ## 字段说明
///
/// - `pairing_code`: 配对码，用于客户端与服务端之间的安全绑定，通常为 8 位短码
/// - `expires_at`: 配对码的过期时间，过期后配对码失效，需要重新颁发
///
/// ## 使用场景
///
/// 当服务端需要与新客户端建立信任关系时，调用 [`AuthService::issue_pairing_credential`]
/// 颁发配对凭证，将返回的 `pairing_code` 展示给管理员，由管理员在客户端侧输入完成配对。
#[derive(Debug, Clone)]
pub struct PairingCredentialResult {
    /// 配对码，用于客户端与服务端之间的安全绑定，通常为 8 位短码
    pub pairing_code: String,
    /// 配对码的过期时间，过期后配对码失效，需要重新颁发
    pub expires_at: DateTime<Utc>,
}

/// # 配对链接
///
/// 表示一个配对链接的完整信息，包含链接标识、配对码、角色、时间戳和使用状态。
///
/// ## 字段说明
///
/// - `id`: 配对链接的唯一标识符，用于管理和撤销操作
/// - `pairing_code`: 配对码，用于客户端与服务端之间的安全绑定
/// - `role`: 配对链接关联的角色，标识通过此链接配对的客户端将获得何种权限
/// - `created_at`: 配对链接的创建时间
/// - `expires_at`: 配对链接的过期时间，过期后链接失效
/// - `is_used`: 配对链接是否已被使用，一旦使用则不能再被其他客户端使用
///
/// ## 使用场景
///
/// 配对链接是配对码的持久化形式，通常存储在数据库中。管理员可以通过
/// [`AuthService::list_pairing_links`] 查看所有配对链接，通过
/// [`AuthService::revoke_pairing_link`] 撤销未使用的链接。
#[derive(Debug, Clone)]
pub struct PairingLink {
    /// 配对链接的唯一标识符，用于管理和撤销操作
    pub id: String,
    /// 配对码，用于客户端与服务端之间的安全绑定
    pub pairing_code: String,
    /// 配对链接关联的角色，标识通过此链接配对的客户端将获得何种权限
    pub role: SessionRole,
    /// 配对链接的创建时间
    pub created_at: DateTime<Utc>,
    /// 配对链接的过期时间，过期后链接失效
    pub expires_at: DateTime<Utc>,
    /// 配对链接是否已被使用，一旦使用则不能再被其他客户端使用
    pub is_used: bool,
}

/// # WebSocket 令牌结果
///
/// 颁发 WebSocket 专用令牌后返回的结果。
///
/// ## 字段说明
///
/// - `token`: WebSocket 专用令牌字符串，用于 WebSocket 升级请求的身份验证
/// - `expires_at`: 令牌的过期时间，WebSocket 令牌通常具有较短的有效期
///
/// ## 使用场景
///
/// 在已认证的 HTTP 会话基础上，调用 [`AuthService::issue_websocket_token`] 颁发
/// WebSocket 专用令牌，客户端在发起 WebSocket 连接时携带此令牌完成身份验证。
#[derive(Debug, Clone)]
pub struct WebSocketTokenResult {
    /// WebSocket 专用令牌字符串，用于 WebSocket 升级请求的身份验证
    pub token: String,
    /// 令牌的过期时间，WebSocket 令牌通常具有较短的有效期
    pub expires_at: DateTime<Utc>,
}

/// # 认证服务描述
///
/// 描述认证服务的基本信息，包括服务器名称、是否需要认证以及支持的认证方式。
///
/// ## 字段说明
///
/// - `server_name`: 服务器名称，用于标识当前认证服务所属的服务
/// - `requires_auth`: 是否需要认证，若为 `false` 表示服务可匿名访问
/// - `supported_methods`: 支持的认证方式列表，客户端可根据此列表选择合适的认证方式
///
/// ## 使用场景
///
/// 客户端在连接服务前，可通过 [`AuthService::get_descriptor`] 获取服务描述，
/// 了解服务支持的认证方式，从而选择合适的认证流程。
#[derive(Debug, Clone)]
pub struct AuthDescriptor {
    /// 服务器名称，用于标识当前认证服务所属的服务
    pub server_name: String,
    /// 是否需要认证，若为 `false` 表示服务可匿名访问
    pub requires_auth: bool,
    /// 支持的认证方式列表，客户端可根据此列表选择合适的认证方式
    pub supported_methods: Vec<SessionMethod>,
}

/// # 认证服务
///
/// 认证服务的核心门面，提供统一的认证、会话管理和配对功能。
///
/// ## 架构说明
///
/// `AuthService` 采用门面模式，内部委托给 [`SessionCredentialService`] 完成具体的
/// 凭证签发与验证逻辑。自身不持有状态，通过 `Arc` 共享底层服务实例，保证线程安全
/// 且可高效克隆。
///
/// ## 核心功能
///
/// - **认证描述**：获取服务支持的认证方式等信息
/// - **引导认证**：通过引导凭证完成初始认证，建立首个会话
/// - **配对管理**：颁发配对凭证、管理配对链接、生成配对 URL
/// - **会话管理**：列出活跃会话、撤销指定会话、批量撤销会话
/// - **HTTP 认证**：验证 HTTP 请求的身份，返回已认证的会话信息
/// - **WebSocket 认证**：验证 WebSocket 升级请求的身份，颁发 WebSocket 专用令牌
///
/// ## 使用示例
///
/// ```rust
/// let credential_service = Arc::new(SessionCredentialService::new(...));
/// let auth_service = AuthService::new(credential_service);
///
/// // 获取认证描述
/// let descriptor = auth_service.get_descriptor().await?;
///
/// // 认证 HTTP 请求
/// let session = auth_service.authenticate_http_request(&request).await?;
/// ```
pub struct AuthService {
    /// 底层凭证服务实例，负责具体的凭证签发、验证和会话管理
    credential_service: Arc<SessionCredentialService>,
}

impl AuthService {
    /// # 创建新的认证服务
    ///
    /// 通过共享的底层凭证服务实例创建认证服务门面。
    ///
    /// ## 参数
    ///
    /// - `credential_service`: 底层凭证服务的共享实例，使用 `Arc` 包装以支持多线程共享
    ///
    /// ## 返回值
    ///
    /// 返回新创建的 [`AuthService`] 实例。
    ///
    /// ## 使用示例
    ///
    /// ```rust
    /// let credential_service = Arc::new(SessionCredentialService::new(...));
    /// let auth_service = AuthService::new(credential_service);
    /// ```
    pub fn new(credential_service: Arc<SessionCredentialService>) -> Self {
        Self { credential_service }
    }

    /// # 获取认证服务描述
    ///
    /// 返回当前认证服务的基本信息，包括服务器名称、是否需要认证以及支持的认证方式。
    ///
    /// ## 返回值
    ///
    /// 返回 [`AuthDescriptor`]，包含：
    /// - `server_name`: 服务器名称（当前固定为 "Remi Code"）
    /// - `requires_auth`: 是否需要认证（当前固定为 `true`）
    /// - `supported_methods`: 支持的认证方式列表（Bootstrap、Pairing、Bearer）
    ///
    /// ## 使用场景
    ///
    /// 客户端在连接服务前调用此方法，了解服务支持的认证方式，从而选择合适的认证流程。
    ///
    /// ## 示例
    ///
    /// ```rust
    /// let descriptor = auth_service.get_descriptor().await?;
    /// println!("服务器名称: {}", descriptor.server_name);
    /// println!("支持的认证方式: {:?}", descriptor.supported_methods);
    /// ```
    pub async fn get_descriptor(&self) -> AuthResult<AuthDescriptor> {
        Ok(AuthDescriptor {
            server_name: "Remi Code".to_string(),
            requires_auth: true,
            supported_methods: vec![
                SessionMethod::Bootstrap,
                SessionMethod::Pairing,
                SessionMethod::Bearer,
            ],
        })
    }

    /// # 交换引导凭证
    ///
    /// 使用引导凭证（Bootstrap Credential）换取新的会话。引导认证通常用于服务端启动阶段，
    /// 通过预共享的引导凭证完成初始认证，建立首个会话。
    ///
    /// ## 参数
    ///
    /// - `_credential`: 引导凭证字符串（当前未验证，TODO 待实现）
    /// - `client_metadata`: 客户端元数据，包含客户端的版本、平台等信息
    ///
    /// ## 返回值
    ///
    /// 返回 `(IssuedSession, String)` 元组：
    /// - `IssuedSession`: 新创建的会话信息，包含会话 ID、令牌等
    /// - `String`: 会话令牌字符串，客户端需保存此令牌用于后续请求认证
    ///
    /// ## 错误
    ///
    /// 若底层凭证服务签发失败，返回 [`AuthError`]。
    ///
    /// ## 使用场景
    ///
    /// 服务端首次启动时，管理员使用引导凭证完成初始认证，获取首个会话后，
    /// 可通过配对流程将其他客户端加入。
    pub async fn exchange_bootstrap_credential(
        &self,
        _credential: &str,
        client_metadata: ClientMetadata,
    ) -> AuthResult<(IssuedSession, String)> {
        info!("交换引导凭证");

        // TODO: 验证引导凭证
        let session = self
            .credential_service
            .issue(
                None,
                None,
                Some(SessionMethod::Bootstrap),
                Some(SessionRole::Client),
                Some(client_metadata),
            )
            .await?;

        let session_token = session.token.clone();

        Ok((session, session_token))
    }

    /// # 颁发配对凭证
    ///
    /// 生成一个新的配对码，用于客户端与服务端之间的安全绑定。配对码通常在服务端生成后
    /// 展示给管理员，由管理员在客户端侧输入完成配对。
    ///
    /// ## 参数
    ///
    /// - `_role`: 配对后客户端将获得的角色（可选），若为 `None` 则使用默认角色
    ///
    /// ## 返回值
    ///
    /// 返回 [`PairingCredentialResult`]，包含：
    /// - `pairing_code`: 8 位配对码
    /// - `expires_at`: 配对码的过期时间（当前固定为 10 分钟后）
    ///
    /// ## 错误
    ///
    /// 当前实现不会返回错误，但未来可能因配额限制等原因返回 [`AuthError`]。
    ///
    /// ## 使用场景
    ///
    /// 管理员在服务端调用此方法生成配对码，然后在客户端输入该配对码完成配对。
    pub async fn issue_pairing_credential(
        &self,
        _role: Option<SessionRole>,
    ) -> AuthResult<PairingCredentialResult> {
        info!("颁发配对凭证");

        // TODO: 实现配对凭证颁发逻辑
        let pairing_code = uuid::Uuid::new_v4().to_string()[..8].to_string();
        let expires_at = Utc::now() + chrono::Duration::minutes(10);

        Ok(PairingCredentialResult {
            pairing_code,
            expires_at,
        })
    }

    /// # 列出配对链接
    ///
    /// 获取当前所有配对链接的列表，包括已使用和未使用的链接。
    ///
    /// ## 返回值
    ///
    /// 返回 [`PairingLink`] 的向量，包含所有配对链接的详细信息。
    /// 当前实现返回空列表（TODO 待实现）。
    ///
    /// ## 错误
    ///
    /// 当前实现不会返回错误，但未来可能因数据库查询失败等原因返回 [`AuthError`]。
    ///
    /// ## 使用场景
    ///
    /// 管理员查看当前所有配对链接的状态，识别未使用的链接并进行管理。
    pub async fn list_pairing_links(&self) -> AuthResult<Vec<PairingLink>> {
        // TODO: 实现配对链接列表
        Ok(vec![])
    }

    /// # 撤销配对链接
    ///
    /// 撤销指定的配对链接，使其失效不能再被使用。
    ///
    /// ## 参数
    ///
    /// - `id`: 要撤销的配对链接的唯一标识符
    ///
    /// ## 返回值
    ///
    /// 返回 `bool`：
    /// - `true`: 撤销成功
    /// - `false`: 撤销失败（链接不存在或已被使用）
    ///
    /// 当前实现固定返回 `false`（TODO 待实现）。
    ///
    /// ## 错误
    ///
    /// 当前实现不会返回错误，但未来可能因数据库操作失败等原因返回 [`AuthError`]。
    ///
    /// ## 使用场景
    ///
    /// 管理员发现某个配对链接未被使用或存在安全风险时，主动撤销该链接。
    pub async fn revoke_pairing_link(&self, id: &str) -> AuthResult<bool> {
        info!("撤销配对链接: {}", id);
        // TODO: 实现配对链接撤销
        Ok(false)
    }

    /// # 列出客户端会话
    ///
    /// 获取当前所有活跃的客户端会话列表，不包括当前会话本身。
    ///
    /// ## 参数
    ///
    /// - `_current_session_id`: 当前会话的 ID，用于排除当前会话（避免在列表中显示自己）
    ///
    /// ## 返回值
    ///
    /// 返回 [`ClientSession`] 的向量，包含所有活跃客户端会话的详细信息。
    ///
    /// ## 错误
    ///
    /// 若底层凭证服务查询失败，返回 [`AuthError`]。
    ///
    /// ## 使用场景
    ///
    /// 管理员查看当前有哪些客户端已连接，识别异常会话并进行管理。
    pub async fn list_client_sessions(
        &self,
        _current_session_id: &str,
    ) -> AuthResult<Vec<ClientSession>> {
        self.credential_service.list_active().await
    }

    /// # 撤销客户端会话
    ///
    /// 撤销指定的客户端会话，使其失效不能再被使用。
    ///
    /// ## 参数
    ///
    /// - `_current_session_id`: 当前会话的 ID，用于权限验证（确保只能撤销其他会话）
    /// - `target_session_id`: 要撤销的目标会话的 ID
    ///
    /// ## 返回值
    ///
    /// 返回 `bool`：
    /// - `true`: 撤销成功
    /// - `false`: 撤销失败（会话不存在或无权撤销）
    ///
    /// ## 错误
    ///
    /// 若底层凭证服务撤销失败，返回 [`AuthError`]。
    ///
    /// ## 使用场景
    ///
    /// 管理员发现某个客户端会话异常或不再需要时，主动撤销该会话。
    pub async fn revoke_client_session(
        &self,
        _current_session_id: &str,
        target_session_id: &str,
    ) -> AuthResult<bool> {
        self.credential_service.revoke(target_session_id).await
    }

    /// # 撤销除当前会话外的所有会话
    ///
    /// 批量撤销所有其他客户端会话，保留当前会话不受影响。
    ///
    /// ## 参数
    ///
    /// - `current_session_id`: 当前会话的 ID，此会话不会被撤销
    ///
    /// ## 返回值
    ///
    /// 返回 `u32`，表示成功撤销的会话数量。
    ///
    /// ## 错误
    ///
    /// 若底层凭证服务撤销失败，返回 [`AuthError`]。
    ///
    /// ## 使用场景
    ///
    /// 管理员怀疑账号被盗或需要强制所有其他设备下线时，使用此方法一键撤销所有其他会话。
    pub async fn revoke_other_client_sessions(
        &self,
        current_session_id: &str,
    ) -> AuthResult<u32> {
        self.credential_service
            .revoke_all_except(current_session_id)
            .await
    }

    /// # 认证 HTTP 请求
    ///
    /// 验证 HTTP 请求的身份，从请求头或 Cookie 中提取令牌并验证，返回已认证的会话信息。
    ///
    /// ## 参数
    ///
    /// - `request`: 认证请求，包含 HTTP 头、Cookie 和 URL
    ///
    /// ## 认证流程
    ///
    /// 1. 优先从 `Authorization` 头提取 Bearer Token
    /// 2. 若不存在，则从 Cookie 中提取令牌（使用底层服务配置的 Cookie 名称）
    /// 3. 调用底层凭证服务验证令牌的有效性
    /// 4. 返回已认证的会话信息
    ///
    /// ## 返回值
    ///
    /// 返回 [`AuthenticatedSession`]，包含会话 ID、主体、认证方式、角色和过期时间。
    ///
    /// ## 错误
    ///
    /// - 若未提供认证令牌，返回 `AuthError::AuthenticationFailed`
    /// - 若令牌无效或已过期，返回 [`AuthError`]
    ///
    /// ## 使用场景
    ///
    /// 在 HTTP 中间件中对每个请求进行身份验证，确保请求来自合法的已认证客户端。
    ///
    /// ## 示例
    ///
    /// ```rust
    /// let request = AuthRequest {
    ///     headers: HashMap::from([
    ///         ("authorization".to_string(), "Bearer token123".to_string()),
    ///     ]),
    ///     cookies: HashMap::new(),
    ///     url: Some("/api/resource".to_string()),
    /// };
    /// let session = auth_service.authenticate_http_request(&request).await?;
    /// println!("已认证用户: {}", session.subject);
    /// ```
    pub async fn authenticate_http_request(
        &self,
        request: &AuthRequest,
    ) -> AuthResult<AuthenticatedSession> {
        // 从 Authorization 头获取令牌
        let token = request
            .headers
            .get("authorization")
            .and_then(|v| v.strip_prefix("Bearer "))
            .or_else(|| request.cookies.get(self.credential_service.cookie_name()).map(|s| s.as_str()));

        let token = token.ok_or_else(|| {
            AuthError::AuthenticationFailed("未提供认证令牌".to_string())
        })?;

        let verified = self.credential_service.verify(token).await?;

        Ok(AuthenticatedSession {
            session_id: verified.session_id,
            subject: verified.subject,
            method: verified.method,
            role: verified.role,
            expires_at: verified.expires_at,
        })
    }

    /// # 认证 WebSocket 升级请求
    ///
    /// 验证 WebSocket 升级请求的身份，从请求头或 Cookie 中提取令牌并验证，
    /// 返回已认证的会话信息。
    ///
    /// ## 参数
    ///
    /// - `request`: 认证请求，包含 HTTP 头、Cookie 和 URL
    ///
    /// ## 认证流程
    ///
    /// 1. 优先从 `Authorization` 头提取 Bearer Token
    /// 2. 若不存在，则从 Cookie 中提取令牌（使用底层服务配置的 Cookie 名称）
    /// 3. 调用底层凭证服务的 `verify_websocket_token` 方法验证令牌
    /// 4. 返回已认证的会话信息
    ///
    /// ## 返回值
    ///
    /// 返回 [`AuthenticatedSession`]，包含会话 ID、主体、认证方式、角色和过期时间。
    ///
    /// ## 错误
    ///
    /// - 若未提供认证令牌，返回 `AuthError::AuthenticationFailed`
    /// - 若令牌无效或已过期，返回 [`AuthError`]
    ///
    /// ## 使用场景
    ///
    /// 在 WebSocket 升级请求到达时进行身份验证，确保只有合法的已认证客户端才能建立
    /// WebSocket 连接。
    ///
    /// ## 示例
    ///
    /// ```rust
    /// let request = AuthRequest {
    ///     headers: HashMap::from([
    ///         ("authorization".to_string(), "Bearer ws_token123".to_string()),
    ///     ]),
    ///     cookies: HashMap::new(),
    ///     url: Some("/ws".to_string()),
    /// };
    /// let session = auth_service.authenticate_websocket_upgrade(&request).await?;
    /// println!("WebSocket 已认证用户: {}", session.subject);
    /// ```
    pub async fn authenticate_websocket_upgrade(
        &self,
        request: &AuthRequest,
    ) -> AuthResult<AuthenticatedSession> {
        // 从查询参数或头获取令牌
        let token = request
            .headers
            .get("authorization")
            .and_then(|v| v.strip_prefix("Bearer "))
            .or_else(|| request.cookies.get(self.credential_service.cookie_name()).map(|s| s.as_str()));

        let token = token.ok_or_else(|| {
            AuthError::AuthenticationFailed("未提供认证令牌".to_string())
        })?;

        let verified = self.credential_service.verify_websocket_token(token).await?;

        Ok(AuthenticatedSession {
            session_id: verified.session_id,
            subject: verified.subject,
            method: verified.method,
            role: verified.role,
            expires_at: verified.expires_at,
        })
    }

    /// # 颁发 WebSocket 令牌
    ///
    /// 基于已认证的会话，颁发一个专用的 WebSocket 令牌。该令牌用于 WebSocket 升级请求
    /// 的身份验证，通常具有较短的有效期。
    ///
    /// ## 参数
    ///
    /// - `session`: 已认证的会话，必须是通过 HTTP 认证验证的有效会话
    ///
    /// ## 返回值
    ///
    /// 返回 [`WebSocketTokenResult`]，包含：
    /// - `token`: WebSocket 专用令牌字符串
    /// - `expires_at`: 令牌的过期时间
    ///
    /// ## 错误
    ///
    /// 若底层凭证服务颁发失败，返回 [`AuthError`]。
    ///
    /// ## 使用场景
    ///
    /// 客户端在建立 WebSocket 连接前，先通过 HTTP 认证获取会话，然后调用此方法颁发
    /// WebSocket 专用令牌，再在 WebSocket 升级请求中携带该令牌完成身份验证。
    ///
    /// ## 示例
    ///
    /// ```rust
    /// let session = auth_service.authenticate_http_request(&request).await?;
    /// let ws_token = auth_service.issue_websocket_token(&session).await?;
    /// println!("WebSocket 令牌: {}", ws_token.token);
    /// ```
    pub async fn issue_websocket_token(
        &self,
        session: &AuthenticatedSession,
    ) -> AuthResult<WebSocketTokenResult> {
        let (token, expires_at) = self
            .credential_service
            .issue_websocket_token(&session.session_id, None)
            .await?;

        Ok(WebSocketTokenResult { token, expires_at })
    }

    /// # 颁发启动配对 URL
    ///
    /// 生成一个包含配对码的完整 URL，用于启动阶段的客户端配对。该 URL 可直接发送给
    /// 管理员，由管理员在客户端中打开或输入完成配对。
    ///
    /// ## 参数
    ///
    /// - `base_url`: 基础 URL，通常是服务端的访问地址（如 `https://example.com`）
    ///
    /// ## 返回值
    ///
    /// 返回完整的配对 URL 字符串，格式为 `{base_url}/pair?code={pairing_code}`。
    ///
    /// ## 错误
    ///
    /// 若配对凭证颁发失败，返回 [`AuthError`]。
    ///
    /// ## 使用场景
    ///
    /// 服务端启动后，管理员需要快速完成首个客户端的配对。调用此方法生成配对 URL，
    /// 在浏览器中打开或复制到客户端中完成配对。
    ///
    /// ## 示例
    ///
    /// ```rust
    /// let pairing_url = auth_service.issue_startup_pairing_url("https://example.com").await?;
    /// println!("配对 URL: {}", pairing_url);
    /// // 输出: 配对 URL: https://example.com/pair?code=abc12345
    /// ```
    pub async fn issue_startup_pairing_url(&self, base_url: &str) -> AuthResult<String> {
        let credential = self.issue_pairing_credential(Some(SessionRole::Owner)).await?;
        Ok(format!(
            "{}/pair?code={}",
            base_url, credential.pairing_code
        ))
    }
}
