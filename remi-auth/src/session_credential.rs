//! 会话凭证服务

use std::collections::HashMap;
use std::sync::Arc;

use chrono::{DateTime, Duration, Utc};
use hmac::{Hmac, Mac};
use sha2::Sha256;
use tokio::sync::{broadcast, RwLock};
use tracing::{info, warn};
use uuid::Uuid;

use crate::error::{AuthError, AuthResult};
use crate::secret_store::SecretStore;

type HmacSha256 = Hmac<Sha256>;

/// 会话角色
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SessionRole {
    /// 所有者
    Owner,
    /// 客户端
    Client,
}

/// 会话认证方式
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SessionMethod {
    /// 引导凭证
    Bootstrap,
    /// 配对链接
    Pairing,
    /// Bearer 令牌
    Bearer,
}

/// 客户端元数据
#[derive(Debug, Clone)]
pub struct ClientMetadata {
    /// 客户端名称
    pub name: String,
    /// 客户端版本
    pub version: Option<String>,
    /// 客户端平台
    pub platform: Option<String>,
}

/// 已颁发的会话
#[derive(Debug, Clone)]
pub struct IssuedSession {
    /// 会话 ID
    pub session_id: String,
    /// 令牌
    pub token: String,
    /// 认证方式
    pub method: SessionMethod,
    /// 客户端元数据
    pub client: ClientMetadata,
    /// 过期时间
    pub expires_at: DateTime<Utc>,
    /// 角色
    pub role: SessionRole,
}

/// 已验证的会话
#[derive(Debug, Clone)]
pub struct VerifiedSession {
    /// 会话 ID
    pub session_id: String,
    /// 令牌
    pub token: String,
    /// 认证方式
    pub method: SessionMethod,
    /// 客户端元数据
    pub client: ClientMetadata,
    /// 过期时间
    pub expires_at: Option<DateTime<Utc>>,
    /// 主题
    pub subject: String,
    /// 角色
    pub role: SessionRole,
}

/// 客户端会话信息
#[derive(Debug, Clone)]
pub struct ClientSession {
    /// 会话 ID
    pub session_id: String,
    /// 客户端名称
    pub client_name: String,
    /// 认证方式
    pub method: SessionMethod,
    /// 角色
    pub role: SessionRole,
    /// 是否已连接
    pub is_connected: bool,
    /// 创建时间
    pub created_at: DateTime<Utc>,
    /// 最后活跃时间
    pub last_active_at: Option<DateTime<Utc>>,
    /// 过期时间
    pub expires_at: DateTime<Utc>,
}

/// 会话凭证变更事件
#[derive(Debug, Clone)]
pub enum SessionCredentialChange {
    /// 客户端更新/创建
    ClientUpserted(ClientSession),
    /// 客户端移除
    ClientRemoved(String),
}

/// 存储的会话数据
struct StoredSession {
    session_id: String,
    token: String,
    method: SessionMethod,
    client: ClientMetadata,
    subject: String,
    role: SessionRole,
    created_at: DateTime<Utc>,
    expires_at: DateTime<Utc>,
    is_connected: bool,
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
