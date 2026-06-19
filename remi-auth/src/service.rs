//! 认证服务门面

use std::sync::Arc;

use chrono::{DateTime, Utc};
use tracing::{info, warn};

use crate::error::{AuthError, AuthResult};
use crate::session_credential::{
    ClientMetadata, ClientSession, IssuedSession, SessionCredentialService, SessionMethod,
    SessionRole, VerifiedSession,
};

/// 认证请求
#[derive(Debug, Clone)]
pub struct AuthRequest {
    /// HTTP 头
    pub headers: std::collections::HashMap<String, String>,
    /// Cookie
    pub cookies: std::collections::HashMap<String, String>,
    /// URL
    pub url: Option<String>,
}

/// 已认证的会话
#[derive(Debug, Clone)]
pub struct AuthenticatedSession {
    /// 会话 ID
    pub session_id: String,
    /// 主题
    pub subject: String,
    /// 认证方式
    pub method: SessionMethod,
    /// 角色
    pub role: SessionRole,
    /// 过期时间
    pub expires_at: Option<DateTime<Utc>>,
}

/// 配对凭证结果
#[derive(Debug, Clone)]
pub struct PairingCredentialResult {
    /// 配对码
    pub pairing_code: String,
    /// 过期时间
    pub expires_at: DateTime<Utc>,
}

/// 配对链接
#[derive(Debug, Clone)]
pub struct PairingLink {
    /// 链接 ID
    pub id: String,
    /// 配对码
    pub pairing_code: String,
    /// 角色
    pub role: SessionRole,
    /// 创建时间
    pub created_at: DateTime<Utc>,
    /// 过期时间
    pub expires_at: DateTime<Utc>,
    /// 是否已使用
    pub is_used: bool,
}

/// WebSocket 令牌结果
#[derive(Debug, Clone)]
pub struct WebSocketTokenResult {
    /// 令牌
    pub token: String,
    /// 过期时间
    pub expires_at: DateTime<Utc>,
}

/// 认证服务描述
#[derive(Debug, Clone)]
pub struct AuthDescriptor {
    /// 服务器名称
    pub server_name: String,
    /// 是否需要认证
    pub requires_auth: bool,
    /// 支持的认证方式
    pub supported_methods: Vec<SessionMethod>,
}

/// 认证服务
pub struct AuthService {
    credential_service: Arc<SessionCredentialService>,
}

impl AuthService {
    /// 创建新的认证服务
    pub fn new(credential_service: Arc<SessionCredentialService>) -> Self {
        Self { credential_service }
    }

    /// 获取认证描述
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

    /// 交换引导凭证
    pub async fn exchange_bootstrap_credential(
        &self,
        credential: &str,
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

    /// 颁发配对凭证
    pub async fn issue_pairing_credential(
        &self,
        role: Option<SessionRole>,
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

    /// 列出配对链接
    pub async fn list_pairing_links(&self) -> AuthResult<Vec<PairingLink>> {
        // TODO: 实现配对链接列表
        Ok(vec![])
    }

    /// 撤销配对链接
    pub async fn revoke_pairing_link(&self, id: &str) -> AuthResult<bool> {
        info!("撤销配对链接: {}", id);
        // TODO: 实现配对链接撤销
        Ok(false)
    }

    /// 列出客户端会话
    pub async fn list_client_sessions(
        &self,
        _current_session_id: &str,
    ) -> AuthResult<Vec<ClientSession>> {
        self.credential_service.list_active().await
    }

    /// 撤销客户端会话
    pub async fn revoke_client_session(
        &self,
        _current_session_id: &str,
        target_session_id: &str,
    ) -> AuthResult<bool> {
        self.credential_service.revoke(target_session_id).await
    }

    /// 撤销除当前会话外的所有会话
    pub async fn revoke_other_client_sessions(
        &self,
        current_session_id: &str,
    ) -> AuthResult<u32> {
        self.credential_service
            .revoke_all_except(current_session_id)
            .await
    }

    /// 认证 HTTP 请求
    pub async fn authenticate_http_request(
        &self,
        request: &AuthRequest,
    ) -> AuthResult<AuthenticatedSession> {
        // 从 Authorization 头获取令牌
        let token = request
            .headers
            .get("authorization")
            .and_then(|v| v.strip_prefix("Bearer "))
            .or_else(|| request.cookies.get(self.credential_service.cookie_name()));

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

    /// 认证 WebSocket 升级请求
    pub async fn authenticate_websocket_upgrade(
        &self,
        request: &AuthRequest,
    ) -> AuthResult<AuthenticatedSession> {
        // 从查询参数或头获取令牌
        let token = request
            .headers
            .get("authorization")
            .and_then(|v| v.strip_prefix("Bearer "))
            .or_else(|| request.cookies.get(self.credential_service.cookie_name()));

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

    /// 颁发 WebSocket 令牌
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

    /// 颁发启动配对 URL
    pub async fn issue_startup_pairing_url(&self, base_url: &str) -> AuthResult<String> {
        let credential = self.issue_pairing_credential(Some(SessionRole::Owner)).await?;
        Ok(format!(
            "{}/pair?code={}",
            base_url, credential.pairing_code
        ))
    }
}
