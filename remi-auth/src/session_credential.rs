//! 会话凭证管理模块
//!
//! 本模块负责管理系统中所有会话（Session）凭证的生命周期，包括会话的创建、验证、撤销
//! 以及状态跟踪。它是认证子系统的核心组件之一，为上层业务提供统一的会话管理能力。
//!
//! # 核心功能
//!
//! - **会话颁发**：基于 HMAC-SHA256 签名算法生成安全的会话令牌，支持自定义有效期、角色、
//!   认证方式等参数
//! - **令牌验证**：校验令牌的合法性与时效性，返回已验证的会话信息
//! - **WebSocket 令牌**：为 WebSocket 长连接场景提供专用的令牌颁发与验证流程
//! - **会话状态管理**：跟踪会话的连接/断开状态、最后活跃时间等运行时信息
//! - **变更事件广播**：通过 `broadcast` 通道发布会话变更事件（创建、更新、移除），
//!   供下游组件订阅消费
//! - **会话撤销**：支持单个撤销和批量撤销（保留指定会话），撤销时自动广播变更事件
//!
//! # 使用场景
//!
//! - 用户登录后颁发会话凭证，后续请求携带令牌进行身份验证
//! - WebSocket 连接建立前，通过 [`SessionCredentialService::issue_websocket_token`]
//!   获取专用令牌
//! - 管理后台查看所有活跃会话，或强制撤销指定会话
//! - 下游服务通过 [`SessionCredentialService::stream_changes`] 订阅会话变更事件，
//!   实现实时联动
//!
//! # 线程安全
//!
//! 内部的会话存储使用 [`tokio::sync::RwLock`] 保护，支持高并发读取与独占写入，
//! 适用于异步多任务环境。

use std::collections::HashMap;
use std::sync::Arc;

use chrono::{DateTime, Duration, Utc};
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use tokio::sync::{broadcast, RwLock};
use tracing::info;
use uuid::Uuid;

use crate::error::{AuthError, AuthResult};
use crate::secret_store::SecretStore;

/// HMAC-SHA256 签名算法类型别名，用于令牌的签名与校验
type HmacSha256 = Hmac<Sha256>;

/// 会话角色枚举
///
/// 用于标识当前会话所属的角色，不同角色拥有不同的权限级别。
/// 在会话颁发时指定，验证后可从 [`VerifiedSession`] 中获取。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub enum SessionRole {
    /// 所有者角色：拥有最高权限，通常对应服务端的本地管理者或根用户。
    /// 可以执行敏感操作（如撤销其他会话、管理密钥等）。
    Owner,
    /// 客户端角色：普通客户端会话，权限受限，仅能访问被授权的资源。
    /// 绝大多数通过登录或配对流程颁发的会话均属于此角色。
    Client,
}

/// 会话认证方式枚举
///
/// 标识当前会话是通过何种认证流程建立的。不同的认证方式可能对应不同的安全等级
/// 和权限范围。在会话颁发时指定，验证后可从 [`VerifiedSession`] 中获取。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub enum SessionMethod {
    /// 引导凭证认证：通常用于设备首次配对或服务初始化阶段。
    /// 通过预共享的引导密钥（bootstrap token）完成认证，安全性较高。
    Bootstrap,
    /// 配对链接认证：用于客户端与服务端建立配对关系的场景。
    /// 通常通过扫码或点击链接完成配对，适用于移动端或 IoT 设备。
    Pairing,
    /// Bearer 令牌认证：标准的 HTTP Bearer Token 认证方式。
    /// 客户端在请求头中携带 `Authorization: Bearer <token>`，适用于 Web 和 API 场景。
    Bearer,
}

/// 客户端元数据结构体
///
/// 记录发起会话的客户端的基本信息。这些信息在会话颁发时由客户端提供，
/// 用于后续的身份展示、审计日志和设备管理。
///
/// # 使用场景
///
/// - 管理后台展示当前登录的设备列表（名称、平台、版本）
/// - 安全审计时追溯某个会话的来源客户端
/// - 客户端断开后重连时，用于识别同一客户端身份
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClientMetadata {
    /// 客户端名称：人类可读的客户端标识，如 'MyApp Desktop'、'iPhone 客户端' 等。
    /// 该字段为必填项，用于在管理界面展示。
    pub name: String,
    /// 客户端版本：可选字段，记录客户端的软件版本号，如 '1.2.3'。
    /// 用于问题排查和兼容性分析。
    pub version: Option<String>,
    /// 客户端平台：可选字段，记录客户端运行的操作系统或平台，如 'Windows 11'、'iOS 17'。
    /// 用于多端管理和统计分析。
    pub platform: Option<String>,
}

/// 已颁发的会话结构体
///
/// 表示一次成功颁发的会话凭证，包含会话 ID、签名令牌、认证方式、客户端信息、
/// 过期时间和角色。该结构体由 [`SessionCredentialService::issue`] 方法返回，
/// 是客户端完成认证后获得的'通行证'。
///
/// # 使用场景
///
/// - 登录接口返回给客户端，客户端保存 `token` 用于后续请求认证
/// - 服务端记录颁发的会话信息，用于后续查询和审计
/// - 配合 `expires_at` 实现客户端本地的令牌过期检测
///
/// # 安全提示
///
/// `token` 字段是敏感凭证，应通过安全通道（如 HTTPS）传输，客户端应妥善存储，
/// 避免泄露到日志或前端代码中。
#[derive(Debug, Clone, Serialize)]
pub struct IssuedSession {
    /// 会话唯一标识符：使用 UUID v4 生成，全局唯一。
    /// 用于在服务端标识和管理该会话（如撤销、查询状态）。
    pub session_id: String,
    /// 签名令牌：经过 HMAC-SHA256 签名的凭证字符串，格式为 `{session_id}:{expires_at}.{signature}`。
    /// 客户端需在后续请求中携带此令牌进行身份验证。
    pub token: String,
    /// 认证方式：标识该会话是通过何种认证流程建立的（引导、配对或 Bearer）。
    pub method: SessionMethod,
    /// 客户端元数据：记录发起该会话的客户端信息（名称、版本、平台）。
    pub client: ClientMetadata,
    /// 过期时间：令牌的绝对过期时间点（UTC）。超过此时间后，令牌将被视为无效。
    pub expires_at: DateTime<Utc>,
    /// 会话角色：标识该会话所属的角色（Owner 或 Client），决定权限范围。
    pub role: SessionRole,
}

/// 已验证的会话结构体
///
/// 表示经过令牌验证后返回的会话信息。与 [`IssuedSession`] 相比，额外包含 `subject` 字段，
/// 用于标识会话所属的用户或实体。该结构体由 [`SessionCredentialService::verify`] 方法返回，
/// 是中间件或业务逻辑判断用户身份的依据。
///
/// # 使用场景
///
/// - HTTP 中间件验证请求令牌后，将 [`VerifiedSession`] 注入请求上下文
/// - WebSocket 握手阶段验证令牌，获取用户身份和权限信息
/// - 业务逻辑层根据 `subject` 和 `role` 进行权限校验
///
/// # 与 IssuedSession 的区别
///
/// - [`IssuedSession`] 是'颁发时'的视图，不包含 `subject`（由服务端内部记录）
/// - [`VerifiedSession`] 是'验证时'的视图，包含完整的身份信息，`expires_at` 为可选字段
#[derive(Debug, Clone)]
pub struct VerifiedSession {
    /// 会话唯一标识符：与颁发时生成的 `session_id` 一致。
    pub session_id: String,
    /// 签名令牌：客户端携带的原始令牌字符串。
    pub token: String,
    /// 认证方式：该会话建立时使用的认证方式。
    pub method: SessionMethod,
    /// 客户端元数据：发起该会话的客户端信息。
    pub client: ClientMetadata,
    /// 过期时间：令牌的绝对过期时间点。某些特殊场景（如永久令牌）可能为 `None`。
    pub expires_at: Option<DateTime<Utc>>,
    /// 主题标识：标识该会话所属的用户或实体，如用户 ID、设备 ID 等。
    /// 默认值为 'local'，表示本地会话。
    pub subject: String,
    /// 会话角色：该会话所属的角色（Owner 或 Client）。
    pub role: SessionRole,
}

/// 客户端会话信息结构体
///
/// 用于对外暴露的会话状态视图，包含会话的运行时状态信息（如连接状态、最后活跃时间）。
/// 该结构体通常用于管理后台展示当前活跃会话列表，或用于审计和监控。
///
/// # 使用场景
///
/// - 管理后台展示'当前登录设备'列表
/// - 监控系统统计活跃会话数量、连接状态分布
/// - 安全审计追溯某个会话的创建时间和活跃情况
///
/// # 与 StoredSession 的区别
///
/// - [`ClientSession`] 是对外暴露的精简视图，不包含敏感的 `token` 和 `subject` 字段
/// - [`StoredSession`] 是内部存储的完整视图，包含所有字段
#[derive(Debug, Clone, Serialize)]
pub struct ClientSession {
    /// 会话唯一标识符
    pub session_id: String,
    /// 客户端名称：人类可读的客户端标识
    pub client_name: String,
    /// 认证方式：该会话建立时使用的认证方式
    pub method: SessionMethod,
    /// 会话角色：该会话所属的角色（Owner 或 Client）
    pub role: SessionRole,
    /// 连接状态：标识该会话当前是否处于已连接状态（如 WebSocket 已建立连接）
    pub is_connected: bool,
    /// 创建时间：会话颁发的时间点（UTC）
    pub created_at: DateTime<Utc>,
    /// 最后活跃时间：会话最后一次产生活动的时间点。
    /// 如果会话创建后尚未有任何活动，则为 `None`。
    pub last_active_at: Option<DateTime<Utc>>,
    /// 过期时间：会话的绝对过期时间点（UTC）
    pub expires_at: DateTime<Utc>,
}

/// 会话凭证变更事件枚举
///
/// 用于广播会话状态变更的事件类型。下游组件可以通过订阅 [`SessionCredentialService::stream_changes`]
/// 接收这些事件，实现实时联动（如更新 UI、同步状态、触发审计日志等）。
///
/// # 使用场景
///
/// - 管理后台实时监听会话创建和撤销事件，动态更新在线设备列表
/// - 审计服务记录所有会话变更，用于安全合规
/// - 网关服务根据会话变更刷新路由表或连接池
#[derive(Debug, Clone)]
pub enum SessionCredentialChange {
    /// 客户端会话创建或更新事件
    ///
    /// 当新会话被颁发，或现有会话的状态（如连接状态、最后活跃时间）发生变更时触发。
    /// 携带最新的 [`ClientSession`] 快照，订阅者可据此更新本地缓存或 UI。
    ClientUpserted(ClientSession),
    /// 客户端会话移除事件
    ///
    /// 当会话被撤销（通过 [`SessionCredentialService::revoke`] 或
    /// [`SessionCredentialService::revoke_all_except`]）时触发。
    /// 携带被移除会话的 `session_id`，订阅者可据此清理本地资源。
    ClientRemoved(String),
}

/// 内部存储的会话数据结构
///
/// 该结构体用于在服务端内存中存储完整的会话信息，包含所有字段（包括敏感的 `token` 和 `subject`）。
/// 与对外暴露的 [`ClientSession`] 不同，该结构体不直接暴露给外部调用者，仅在
/// [`SessionCredentialService`] 内部使用。
///
/// # 设计说明
///
/// - 使用 `HashMap<String, StoredSession>` 作为内存存储，以 `session_id` 为键
/// - 通过 [`tokio::sync::RwLock`] 保护，支持并发读取和独占写入
/// - 包含完整的会话生命周期信息：创建时间、过期时间、连接状态、最后活跃时间等
struct StoredSession {
    /// 会话唯一标识符：作为 HashMap 的键，全局唯一
    session_id: String,
    /// 签名令牌：经过 HMAC-SHA256 签名的凭证字符串
    token: String,
    /// 认证方式：该会话建立时使用的认证方式
    method: SessionMethod,
    /// 客户端元数据：发起该会话的客户端信息
    client: ClientMetadata,
    /// 主题标识：该会话所属的用户或实体（如用户 ID、设备 ID）
    subject: String,
    /// 会话角色：该会话所属的角色（Owner 或 Client）
    role: SessionRole,
    /// 创建时间：会话颁发的时间点（UTC）
    created_at: DateTime<Utc>,
    /// 过期时间：会话的绝对过期时间点（UTC）
    expires_at: DateTime<Utc>,
    /// 连接状态：标识该会话当前是否处于已连接状态
    is_connected: bool,
    /// 最后活跃时间：会话最后一次产生活动的时间点
    last_active_at: Option<DateTime<Utc>>,
}

/// 会话凭证服务结构体
///
/// 核心服务组件，负责管理所有会话凭证的生命周期。提供会话颁发、验证、撤销、状态跟踪
/// 以及变更事件广播等功能。
///
/// # 线程安全
///
/// - 内部使用 [`tokio::sync::RwLock`] 保护会话存储，支持异步并发访问
/// - 使用 [`tokio::sync::broadcast`] 通道广播变更事件，支持多订阅者
/// - [`SecretStore`] 通过 `Arc` 共享，支持跨任务访问
///
/// # 使用示例
///
///```rust,ignore
/// #[tokio::main]
/// async fn main() {
/// let secret_store = Arc::new(SecretStore::new());
/// let service = SessionCredentialService::new(secret_store);
/// 
/// // 颁发会话
/// let issued = service.issue(None, None, None, None, None).await?;
/// 
/// // 验证令牌
/// let verified = service.verify(&issued.token).await?;
/// }
pub struct SessionCredentialService {
    /// 密钥存储：用于获取或生成令牌签名密钥，通过 `Arc` 实现跨任务共享
    secret_store: Arc<SecretStore>,
    /// 会话存储：内存中的会话映射表，以 `session_id` 为键。
    /// 使用 `RwLock` 保护，支持高并发读取和独占写入。
    sessions: RwLock<HashMap<String, StoredSession>>,
    /// 变更事件广播通道发送端：用于发布会话变更事件（创建、更新、移除）。
    /// 通道容量为 1000，超出时旧事件会被丢弃。
    change_tx: broadcast::Sender<SessionCredentialChange>,
    /// Cookie 名称：用于在 HTTP 响应中设置会话令牌的 Cookie 名称。
    /// 默认值为 'remi_session'。
    cookie_name: String,
    /// 默认会话有效期（小时）：当颁发会话时未指定 TTL 时使用的默认值。
    /// 默认值为 72 小时（3 天）。
    default_ttl_hours: i64,
}

impl SessionCredentialService {
    /// 创建新的会话凭证服务实例
    ///
    /// # 参数
    ///
    /// - `secret_store`: 密钥存储的共享引用，用于获取或生成令牌签名密钥
    ///
    /// # 返回值
    ///
    /// 返回初始化完成的 [`SessionCredentialService`] 实例，默认配置如下：
    /// - Cookie 名称: `'remi_session'`
    /// - 默认会话有效期: 72 小时（3 天）
    /// - 变更事件通道容量: 1000
    ///
    /// # 使用示例
    ///
    ///```rust,ignore
    /// let secret_store = Arc::new(SecretStore::new());
    /// let service = SessionCredentialService::new(secret_store);
    /// ```
    pub fn new(secret_store: Arc<SecretStore>) -> Self {
        let (change_tx, _) = broadcast::channel(1000);

        Self {
            secret_store,
            sessions: RwLock::new(HashMap::new()),
            change_tx,
            cookie_name: "remi_session".to_string(),
            default_ttl_hours: 72,
        }
    }

    /// 获取会话令牌的 Cookie 名称
    ///
    /// # 返回值
    ///
    /// 返回用于 HTTP 响应中设置会话令牌的 Cookie 名称字符串引用。
    /// 默认值为 `'remi_session'`。
    ///
    /// # 使用场景
    ///
    /// - HTTP 中间件在设置 Cookie 时获取名称
    /// - 客户端解析 Cookie 时确认键名
    pub fn cookie_name(&self) -> &str {
        &self.cookie_name
    }

    /// 颁发新的会话凭证
    ///
    /// 生成一个唯一的会话 ID 和签名令牌，将会话信息存储到内存中，并返回颁发的会话对象。
    /// 所有参数均为可选，未提供时使用默认值。
    ///
    /// # 参数
    ///
    /// - `ttl_hours`: 会话有效期（小时）。默认使用 [`default_ttl_hours`](Self::default_ttl_hours)（72 小时）
    /// - `subject`: 会话所属的用户或实体标识。默认为 `'local'`
    /// - `method`: 认证方式。默认为 [`SessionMethod::Bootstrap`]
    /// - `role`: 会话角色。默认为 [`SessionRole::Client`]
    /// - `client`: 客户端元数据。默认为名称 `'unknown'` 的空元数据
    ///
    /// # 返回值
    ///
    /// - `Ok(IssuedSession)`: 颁发成功，返回包含会话 ID、令牌、角色等信息的会话对象
    /// - `Err(AuthError)`: 颁发失败，可能的错误包括密钥存储访问失败、签名生成失败等
    ///
    /// # 使用示例
    ///
    ///```rust,ignore
    /// #[tokio::main]
    /// async fn main() {
    /// // 使用默认参数颁发会话
    /// let issued = service.issue(None, None, None, None, None).await?;
    /// 
    /// // 自定义参数颁发会话
    /// let issued = service.issue(
    ///
    ///     Some(24),                                    // 24 小时有效期
    ///
    ///     Some('user_123'.to_string()),                // 用户 ID
    ///
    ///     Some(SessionMethod::Bearer),                 // Bearer 认证
    ///
    ///     Some(SessionRole::Client),                   // 客户端角色
    ///
    ///     Some(ClientMetadata {                        // 客户端信息
    ///         name: 'MyApp'.to_string(),
    ///         version: Some('1.0.0'.to_string()),
    ///         platform: Some('Windows'.to_string()),
    ///     }),
    /// ).await?;
    /// }
    pub async fn issue(
        &self,
        ttl_hours: Option<i64>,
        subject: Option<String>,
        method: Option<SessionMethod>,
        role: Option<SessionRole>,
        client: Option<ClientMetadata>,
    ) -> AuthResult<IssuedSession> {
        let session_id = Uuid::new_v4().to_string();
        let ttl = Duration::hours(ttl_hours.unwrap_or(self.default_ttl_hours));
        let expires_at = Utc::now() + ttl;
        let method = method.unwrap_or(SessionMethod::Bootstrap);
        let role = role.unwrap_or(SessionRole::Client);
        let subject = subject.unwrap_or_else(|| "local".to_string());
        let client = client.unwrap_or(ClientMetadata {
            name: "unknown".to_string(),
            version: None,
            platform: None,
        });

        // 使用 HMAC-SHA256 算法生成签名令牌
        let token = self.sign_token(&session_id, &expires_at).await?;

        info!("颁发会话: session_id={}, role={:?}", session_id, role);

        // 将会话信息存储到内存映射表中，加写锁保证线程安全
        {
            let mut sessions = self.sessions.write().await;
            sessions.insert(
                session_id.clone(),
                StoredSession {
                    session_id: session_id.clone(),
                    token: token.clone(),
                    method: method.clone(),
                    client: client.clone(),
                    subject,
                    role: role.clone(),
                    created_at: Utc::now(),
                    expires_at,
                    is_connected: false,
                    last_active_at: None,
                },
            );
        }

        Ok(IssuedSession {
            session_id,
            token,
            method,
            client,
            expires_at,
            role,
        })
    }

    /// 验证会话令牌的合法性
    ///
    /// 根据令牌查找对应的会话，并检查会话是否已过期。验证通过后返回包含完整身份信息的
    /// [`VerifiedSession`] 对象。
    ///
    /// # 参数
    ///
    /// - `token`: 待验证的会话令牌字符串，格式为 `{session_id}:{expires_at}.{signature}`
    ///
    /// # 返回值
    ///
    /// - `Ok(VerifiedSession)`: 验证通过，返回包含会话 ID、主题、角色等完整信息的会话对象
    /// - `Err(AuthError::InvalidToken)`: 令牌无效，未找到匹配的会话
    /// - `Err(AuthError::TokenExpired)`: 令牌已过期，超过 `expires_at` 指定的时间
    ///
    /// # 使用示例
    ///
    ///```rust,ignore
    /// #[tokio::main]
    /// async fn main() {
    /// // 验证客户端携带的令牌
    /// match service.verify(&token).await {
    ///     Ok(session) => {
    ///         println!("用户 {} 验证通过", session.subject);
    ///         // 继续处理请求...
    ///     }
    ///     Err(AuthError::InvalidToken) => {
    ///         // 返回 401 Unauthorized
    ///     }
    ///     Err(AuthError::TokenExpired) => {
    ///         // 返回 401，提示客户端重新登录
    ///     }
    ///     Err(e) => {
    ///         // 处理其他错误
    ///     }
    /// }
    /// }
    pub async fn verify(&self, token: &str) -> AuthResult<VerifiedSession> {
        // 加读锁查找会话，支持并发读取
        let sessions = self.sessions.read().await;

        // 遍历所有会话，查找令牌匹配的会话
        let session = sessions
            .values()
            .find(|s| s.token == token)
            .ok_or(AuthError::InvalidToken)?;

        // 检查会话是否已过期
        if session.expires_at < Utc::now() {
            return Err(AuthError::TokenExpired);
        }

        Ok(VerifiedSession {
            session_id: session.session_id.clone(),
            token: session.token.clone(),
            method: session.method.clone(),
            client: session.client.clone(),
            expires_at: Some(session.expires_at),
            subject: session.subject.clone(),
            role: session.role.clone(),
        })
    }

    /// 颁发 WebSocket 专用令牌
    ///
    /// 为指定的会话生成一个用于 WebSocket 连接的令牌。该令牌与常规会话令牌使用相同的签名机制，
    /// 但默认有效期较短（24 小时），适用于长连接场景。
    ///
    /// # 参数
    ///
    /// - `session_id`: 目标会话的唯一标识符。该会话必须已通过 [`issue`](Self::issue) 方法创建
    /// - `ttl_hours`: 令牌有效期（小时）。默认为 24 小时
    ///
    /// # 返回值
    ///
    /// - `Ok((String, DateTime<Utc>))`: 颁发成功，返回元组 `(令牌字符串, 过期时间)`
    /// - `Err(AuthError)`: 颁发失败，可能的错误包括密钥存储访问失败、签名生成失败等
    ///
    /// # 使用场景
    ///
    /// - 客户端在建立 WebSocket 连接前，先通过此方法获取专用令牌
    /// - 令牌通过 WebSocket 握手请求的查询参数或子协议传递
    /// - 服务端在握手阶段调用 [`verify_websocket_token`](Self::verify_websocket_token) 验证令牌
    ///
    /// # 使用示例
    ///
    ///```rust,ignore
    /// #[tokio::main]
    /// async fn main() {
    /// // 为现有会话颁发 WebSocket 令牌
    /// let (ws_token, expires_at) = service.issue_websocket_token(&session_id, None).await?;
    /// 
    /// // 自定义有效期（例如 1 小时）
    /// let (ws_token, expires_at) = service.issue_websocket_token(&session_id, Some(1)).await?;
    /// }
    pub async fn issue_websocket_token(
        &self,
        session_id: &str,
        ttl_hours: Option<i64>,
    ) -> AuthResult<(String, DateTime<Utc>)> {
        let ttl = Duration::hours(ttl_hours.unwrap_or(24));
        let expires_at = Utc::now() + ttl;

        let token = self.sign_token(session_id, &expires_at).await?;

        info!("颁发 WebSocket 令牌: session_id={}", session_id);

        Ok((token, expires_at))
    }

    /// 验证 WebSocket 令牌
    ///
    /// 验证客户端在 WebSocket 握手阶段携带的令牌。内部直接调用 [`verify`](Self::verify) 方法，
    /// 使用相同的验证逻辑。
    ///
    /// # 参数
    ///
    /// - `token`: 待验证的 WebSocket 令牌字符串
    ///
    /// # 返回值
    ///
    /// - `Ok(VerifiedSession)`: 验证通过，返回会话信息
    /// - `Err(AuthError)`: 验证失败，错误类型与 [`verify`](Self::verify) 方法相同
    ///
    /// # 使用场景
    ///
    /// - WebSocket 服务端在握手回调中调用此方法验证客户端身份
    /// - 验证通过后将 [`VerifiedSession`] 注入 WebSocket 会话上下文
    pub async fn verify_websocket_token(&self, token: &str) -> AuthResult<VerifiedSession> {
        self.verify(token).await
    }

    /// 列出所有活跃的会话
    ///
    /// 遍历内存中的会话存储，筛选出尚未过期的会话，并转换为对外暴露的 [`ClientSession`] 视图。
    /// 返回的列表不包含敏感的 `token` 和 `subject` 字段。
    ///
    /// # 返回值
    ///
    /// - `Ok(Vec<ClientSession>)`: 返回当前所有活跃会话的列表。如果无活跃会话，返回空向量
    /// - `Err(AuthError)`: 获取读锁失败时返回错误（理论上不会发生）
    ///
    /// # 使用场景
    ///
    /// - 管理后台展示'当前登录设备'列表
    /// - 监控系统统计活跃会话数量
    /// - 安全审计追溯当前所有有效会话
    ///
    /// # 使用示例
    ///
    ///```rust,ignore
    /// #[tokio::main]
    /// async fn main() {
    /// let active_sessions = service.list_active().await?;
    /// println!('当前活跃会话数: {}', active_sessions.len());
    /// for session in active_sessions {
    ///     println!('会话 ID: {}, 客户端: {}, 已连接: {}',
    ///         session.session_id, session.client_name, session.is_connected);
    /// }
    /// }
    pub async fn list_active(&self) -> AuthResult<Vec<ClientSession>> {
        let sessions = self.sessions.read().await;
        let now = Utc::now();

        // 筛选未过期的会话，并转换为 ClientSession 视图
        let active: Vec<ClientSession> = sessions
            .values()
            .filter(|s| s.expires_at > now)
            .map(|s| ClientSession {
                session_id: s.session_id.clone(),
                client_name: s.client.name.clone(),
                method: s.method.clone(),
                role: s.role.clone(),
                is_connected: s.is_connected,
                created_at: s.created_at,
                last_active_at: s.last_active_at,
                expires_at: s.expires_at,
            })
            .collect();

        Ok(active)
    }

    /// 订阅会话变更事件
    ///
    /// 返回一个广播通道的接收端，用于接收 [`SessionCredentialChange`] 事件。
    /// 多个订阅者可以同时监听，每个订阅者都会收到完整的事件流。
    ///
    /// # 返回值
    ///
    /// 返回 [`broadcast::Receiver<SessionCredentialChange>`]，可用于异步接收会话变更事件。
    ///
    /// # 使用场景
    ///
    /// - 管理后台实时监听会话创建和撤销事件，动态更新在线设备列表
    /// - 审计服务记录所有会话变更，用于安全合规
    /// - 网关服务根据会话变更刷新路由表或连接池
    ///
    /// # 使用示例
    ///
    ///```rust,ignore
    /// #[tokio::main]
    /// async fn main() {
    /// let mut rx = service.stream_changes();
    /// 
    /// // 在异步任务中监听事件
    /// tokio::spawn(async move {
    ///     while let Ok(event) = rx.recv().await {
    ///         match event {
    ///             SessionCredentialChange::ClientUpserted(session) => {
    ///                 println!("会话创建/更新: {}", session.session_id);
    ///             }
    ///             SessionCredentialChange::ClientRemoved(session_id) => {
    ///                 println!("会话移除: {}", session_id);
    ///             }
    ///         }
    ///     }
    /// });
    /// }
    pub fn stream_changes(&self) -> broadcast::Receiver<SessionCredentialChange> {
        self.change_tx.subscribe()
    }

    /// 撤销指定的会话
    ///
    /// 从内存存储中移除指定 `session_id` 对应的会话，并广播 [`SessionCredentialChange::ClientRemoved`]
    /// 事件。撤销后，该会话的令牌将立即失效。
    ///
    /// # 参数
    ///
    /// - `session_id`: 待撤销会话的唯一标识符
    ///
    /// # 返回值
    ///
    /// - `Ok(true)`: 撤销成功，会话存在且已被移除
    /// - `Ok(false)`: 撤销失败，指定 `session_id` 的会话不存在
    /// - `Err(AuthError)`: 获取写锁失败时返回错误（理论上不会发生）
    ///
    /// # 使用场景
    ///
    /// - 用户主动登出时撤销当前会话
    /// - 管理员强制下线某个设备时撤销对应会话
    /// - 安全检测到异常行为时紧急撤销可疑会话
    ///
    /// # 使用示例
    ///
    ///```rust,ignore
    /// #[tokio::main]
    /// async fn main() {
    /// if service.revoke(&session_id).await? {
    ///     println!('会话已成功撤销');
    /// } else {
    ///     println!('会话不存在');
    /// }
    /// }
    pub async fn revoke(&self, session_id: &str) -> AuthResult<bool> {
        info!("撤销会话: {}", session_id);

        let mut sessions = self.sessions.write().await;
        let removed = sessions.remove(session_id).is_some();

        // 撤销成功后广播移除事件
        if removed {
            let _ = self.change_tx.send(SessionCredentialChange::ClientRemoved(
                session_id.to_string(),
            ));
        }

        Ok(removed)
    }

    /// 撤销除指定会话外的所有会话
    ///
    /// 批量移除内存存储中除指定 `session_id` 外的所有会话，并为每个被移除的会话广播
    /// [`SessionCredentialChange::ClientRemoved`] 事件。适用于'踢出其他所有设备'的场景。
    ///
    /// # 参数
    ///
    /// - `session_id`: 需要保留的会话唯一标识符。该会话不会被撤销
    ///
    /// # 返回值
    ///
    /// - `Ok(u32)`: 撤销成功，返回被撤销的会话数量
    /// - `Err(AuthError)`: 获取写锁失败时返回错误（理论上不会发生）
    ///
    /// # 使用场景
    ///
    /// - 用户修改密码后，保留当前会话，撤销所有其他设备的会话
    /// - 安全检测到账号被盗用时，强制下线所有其他设备
    /// - 管理员清理异常会话时，保留管理会话
    ///
    /// # 使用示例
    ///
    ///```rust,ignore
    /// #[tokio::main]
    /// async fn main() {
    /// let revoked_count = service.revoke_all_except(&current_session_id).await?;
    /// println!('已撤销 {} 个会话', revoked_count);
    /// }
    pub async fn revoke_all_except(&self, session_id: &str) -> AuthResult<u32> {
        info!("撤销除 {} 外的所有会话", session_id);

        let mut sessions = self.sessions.write().await;
        // 收集需要移除的会话 ID（排除指定保留的会话）
        let keys_to_remove: Vec<String> = sessions
            .keys()
            .filter(|k| *k != session_id)
            .cloned()
            .collect();

        let count = keys_to_remove.len() as u32;

        // 逐个移除并广播事件
        for key in keys_to_remove {
            sessions.remove(&key);
            let _ = self.change_tx.send(SessionCredentialChange::ClientRemoved(key));
        }

        Ok(count)
    }

    /// 标记会话为已连接状态
    ///
    /// 更新指定会话的连接状态为 `true`，并记录最后活跃时间为当前时间。
    /// 通常在 WebSocket 连接建立成功或客户端首次发起请求时调用。
    ///
    /// # 参数
    ///
    /// - `session_id`: 待标记会话的唯一标识符
    ///
    /// # 返回值
    ///
    /// - `Ok(())`: 标记成功。如果会话不存在，也不会返回错误（静默忽略）
    /// - `Err(AuthError)`: 获取写锁失败时返回错误（理论上不会发生）
    ///
    /// # 使用场景
    ///
    /// - WebSocket 握手成功后标记会话为已连接
    /// - 客户端发起首次 API 请求时标记为已连接
    /// - 配合 [`list_active`](Self::list_active) 展示在线设备状态
    pub async fn mark_connected(&self, session_id: &str) -> AuthResult<()> {
        let mut sessions = self.sessions.write().await;
        if let Some(session) = sessions.get_mut(session_id) {
            session.is_connected = true;
            session.last_active_at = Some(Utc::now());
        }
        Ok(())
    }

    /// 标记会话为已断开状态
    ///
    /// 更新指定会话的连接状态为 `false`。通常在 WebSocket 连接关闭或客户端长时间无活动时调用。
    /// 注意：该方法不会更新 `last_active_at` 字段。
    ///
    /// # 参数
    ///
    /// - `session_id`: 待标记会话的唯一标识符
    ///
    /// # 返回值
    ///
    /// - `Ok(())`: 标记成功。如果会话不存在，也不会返回错误（静默忽略）
    /// - `Err(AuthError)`: 获取写锁失败时返回错误（理论上不会发生）
    ///
    /// # 使用场景
    ///
    /// - WebSocket 连接关闭时标记会话为已断开
    /// - 心跳检测超时后标记会话为已断开
    /// - 配合 [`list_active`](Self::list_active) 展示离线设备状态
    pub async fn mark_disconnected(&self, session_id: &str) -> AuthResult<()> {
        let mut sessions = self.sessions.write().await;
        if let Some(session) = sessions.get_mut(session_id) {
            session.is_connected = false;
        }
        Ok(())
    }

    /// 使用 HMAC-SHA256 算法签名令牌
    ///
    /// 内部方法，用于生成经过签名的会话令牌。令牌格式为 `{session_id}:{expires_at}.{signature}`，
    /// 其中签名部分使用 Base64 URL 安全编码（无填充）。
    ///
    /// # 参数
    ///
    /// - `session_id`: 会话唯一标识符，作为签名负载的一部分
    /// - `expires_at`: 会话过期时间，其时间戳作为签名负载的一部分
    ///
    /// # 返回值
    ///
    /// - `Ok(String)`: 签名成功，返回格式为 `{session_id}:{expires_at}.{signature}` 的令牌字符串
    /// - `Err(AuthError::SecretStoreError)`: 从密钥存储获取签名密钥失败
    /// - `Err(AuthError::InternalError)`: HMAC 初始化失败（理论上不会发生）
    ///
    /// # 安全说明
    ///
    /// - 签名密钥通过 [`SecretStore::get_or_create_random`] 获取或生成，长度为 32 字节
    /// - 密钥名称为 `'session_signing_key'`，全局唯一
    /// - 使用 HMAC-SHA256 算法保证令牌的完整性和防篡改性
    /// - 签名部分使用 Base64 URL 安全编码，适用于 HTTP 头、Cookie、URL 查询参数等场景
    async fn sign_token(&self, session_id: &str, expires_at: &DateTime<Utc>) -> AuthResult<String> {
        // 从密钥存储获取或生成 32 字节的签名密钥
        let key = self
            .secret_store
            .get_or_create_random("session_signing_key", 32)
            .await
            .map_err(|e| AuthError::SecretStoreError(e.to_string()))?;

        // 构造签名负载：'{session_id}:{expires_at_timestamp}'
        let payload = format!("{}:{}", session_id, expires_at.timestamp());

        // 使用 HMAC-SHA256 算法计算签名
        let mut mac =
            HmacSha256::new_from_slice(&key).map_err(|e| AuthError::InternalError(e.to_string()))?;
        mac.update(payload.as_bytes());
        let result = mac.finalize();

        // 将签名结果进行 Base64 URL 安全编码（无填充）
        let signature = base64::Engine::encode(
            &base64::engine::general_purpose::URL_SAFE_NO_PAD,
            result.into_bytes(),
        );

        // 返回完整令牌：'{payload}.{signature}'
        Ok(format!("{}.{}", payload, signature))
    }
}
