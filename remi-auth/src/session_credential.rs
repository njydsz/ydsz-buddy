//! 会话凭证服务模块
//!
//! # 模块职责
//!
//! 本模块负责系统中所有会话（Session）凭证的生命周期管理，包括会话的创建、签名、验证、
//! 撤销以及状态跟踪。它是认证子系统（`remi-auth`）的核心组件之一，为上层业务提供统一的
//! 会话管理能力。
//!
//! # 核心功能
//!
//! - **会话颁发**：基于 HMAC-SHA256 签名算法生成安全的会话令牌，支持自定义 TTL、角色、
//!   认证方式等参数。
//! - **令牌验证**：校验令牌的合法性与时效性，返回已验证的会话信息。
//! - **WebSocket 令牌**：为 WebSocket 长连接场景提供专用的令牌颁发与验证流程。
//! - **会话状态管理**：跟踪会话的连接/断开状态、最后活跃时间等运行时信息。
//! - **变更事件广播**：通过 `broadcast` 通道发布会话变更事件（创建、更新、移除），
//!   供下游组件订阅消费。
//! - **会话撤销**：支持单个撤销和批量撤销（保留指定会话），撤销时自动广播变更事件。
//!
//! # 使用场景
//!
//! - 用户登录后颁发会话凭证，后续请求携带令牌进行身份验证。
//! - WebSocket 连接建立前，通过 [`SessionCredentialService::issue_websocket_token`]
//!   获取专用令牌。
//! - 管理后台查看所有活跃会话，或强制撤销指定会话。
//! - 下游服务通过 [`SessionCredentialService::stream_changes`] 订阅会话变更事件，
//!   实现实时联动。
//!
//! # 线程安全
//!
//! 内部的会话存储使用 [`tokio::sync::RwLock`] 保护，支持高并发读取与独占写入，
//! 适用于异步多任务环境。

use std::collections::HashMap;
use std::sync::Arc;

use chrono::{DateTime, Duration, Utc};
use hmac::{Hmac, Mac};
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
#[derive(Debug, Clone, PartialEq, Eq)]
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
#[derive(Debug, Clone, PartialEq, Eq)]
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
#[derive(Debug, Clone)]
pub struct ClientMetadata {
    /// 客户端名称：人类可读的客户端标识，如 "MyApp Desktop"、"iPhone 客户端" 等。
    /// 该字段为必填项，用于在管理界面展示。
    pub name: String,
    /// 客户端版本：可选字段，记录客户端的软件版本号，如 "1.2.3"。
    /// 用于问题排查和兼容性分析。
    pub version: Option<String>,
    /// 客户端平台：可选字段，记录客户端运行的操作系统或平台，如 "Windows 11"、"iOS 17"。
    /// 用于多端管理和统计分析。
    pub platform: Option<String>,
}

/// 已颁发的会话结构体
///
/// 表示一次成功颁发的会话凭证，包含会话 ID、签名令牌、认证方式、客户端信息、
/// 过期时间和角色。该结构体由 [`SessionCredentialService::issue`] 方法返回，
/// 是客户端完成认证后获得的"通行证"。
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
#[derive(Debug, Clone)]
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
/// - [`IssuedSession`] 是"颁发时"的视图，不包含 `subject`（由服务端内部记录）
/// - [`VerifiedSession`] 是"验证时"的视图，包含完整的身份信息，`expires_at` 为可选字段
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
    /// 默认值为 "local"，表示本地会话。
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
/// - 管理后台展示"当前登录设备"列表
/// - 监控系统统计活跃会话数量、连接状态分布
/// - 安全审计追溯某个会话的创建时间和活跃情况
///
/// # 与 StoredSession 的区别
///
/// - [`ClientSession`] 是对外暴露的精简视图，不包含敏感的 `token` 和 `subject` 字段
/// - [`StoredSession`] 是内部存储的完整视图，包含所有字段
#[derive(Debug, Clone)]
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

/// 会话凭证服务
pub struct SessionCredentialService {
    secret_store: Arc<SecretStore>,
    sessions: RwLock<HashMap<String, StoredSession>>,
    change_tx: broadcast::Sender<SessionCredentialChange>,
    cookie_name: String,
    default_ttl_hours: i64,
}

impl SessionCredentialService {
    /// 创建新的会话凭证服务
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

    /// 获取 cookie 名称
    pub fn cookie_name(&self) -> &str {
        &self.cookie_name
    }

    /// 颁发会话
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

        // 生成令牌
        let token = self.sign_token(&session_id, &expires_at).await?;

        info!("颁发会话: session_id={}, role={:?}", session_id, role);

        // 存储会话
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

    /// 验证令牌
    pub async fn verify(&self, token: &str) -> AuthResult<VerifiedSession> {
        // 查找会话
        let sessions = self.sessions.read().await;

        let session = sessions
            .values()
            .find(|s| s.token == token)
            .ok_or(AuthError::InvalidToken)?;

        // 检查过期
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

    /// 颁发 WebSocket 令牌
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
    pub async fn verify_websocket_token(&self, token: &str) -> AuthResult<VerifiedSession> {
        self.verify(token).await
    }

    /// 列出活跃会话
    pub async fn list_active(&self) -> AuthResult<Vec<ClientSession>> {
        let sessions = self.sessions.read().await;
        let now = Utc::now();

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

    /// 订阅变更事件
    pub fn stream_changes(&self) -> broadcast::Receiver<SessionCredentialChange> {
        self.change_tx.subscribe()
    }

    /// 撤销会话
    pub async fn revoke(&self, session_id: &str) -> AuthResult<bool> {
        info!("撤销会话: {}", session_id);

        let mut sessions = self.sessions.write().await;
        let removed = sessions.remove(session_id).is_some();

        if removed {
            let _ = self.change_tx.send(SessionCredentialChange::ClientRemoved(
                session_id.to_string(),
            ));
        }

        Ok(removed)
    }

    /// 撤销除指定会话外的所有会话
    pub async fn revoke_all_except(&self, session_id: &str) -> AuthResult<u32> {
        info!("撤销除 {} 外的所有会话", session_id);

        let mut sessions = self.sessions.write().await;
        let keys_to_remove: Vec<String> = sessions
            .keys()
            .filter(|k| *k != session_id)
            .cloned()
            .collect();

        let count = keys_to_remove.len() as u32;

        for key in keys_to_remove {
            sessions.remove(&key);
            let _ = self.change_tx.send(SessionCredentialChange::ClientRemoved(key));
        }

        Ok(count)
    }

    /// 标记会话已连接
    pub async fn mark_connected(&self, session_id: &str) -> AuthResult<()> {
        let mut sessions = self.sessions.write().await;
        if let Some(session) = sessions.get_mut(session_id) {
            session.is_connected = true;
            session.last_active_at = Some(Utc::now());
        }
        Ok(())
    }

    /// 标记会话已断开
    pub async fn mark_disconnected(&self, session_id: &str) -> AuthResult<()> {
        let mut sessions = self.sessions.write().await;
        if let Some(session) = sessions.get_mut(session_id) {
            session.is_connected = false;
        }
        Ok(())
    }

    /// 签名令牌
    async fn sign_token(&self, session_id: &str, expires_at: &DateTime<Utc>) -> AuthResult<String> {
        let key = self
            .secret_store
            .get_or_create_random("session_signing_key", 32)
            .await
            .map_err(|e| AuthError::SecretStoreError(e.to_string()))?;

        let payload = format!("{}:{}", session_id, expires_at.timestamp());

        let mut mac =
            HmacSha256::new_from_slice(&key).map_err(|e| AuthError::InternalError(e.to_string()))?;
        mac.update(payload.as_bytes());
        let result = mac.finalize();

        let signature = base64::Engine::encode(
            &base64::engine::general_purpose::URL_SAFE_NO_PAD,
            result.into_bytes(),
        );

        Ok(format!("{}.{}", payload, signature))
    }
}
