//! Session 管理（本地 JWT 模拟，使用 HMAC-SHA256 签名）
//!
//! Token 过期机制（24h），全内存维护验证状态。
//!
//! Token 格式: base64("." 分隔) header.body.signature
//! - header: {"v":1,"alg":"HS256"}
//! - body: {"sub":user_id,"name":username,"role":role,"iat":ms,"exp":ms}
//! - signature: HMAC-SHA256(secret, "header.body")

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use uuid::Uuid;

use super::UserRole;

// HMAC-SHA256 类型别名
type HmacSha256 = Hmac<Sha256>;

/// Session 有效期（毫秒）：24 小时
pub const SESSION_DURATION_MS: i64 = 24 * 60 * 60 * 1000;

/// Salt 长度（字节）
const SALT_LEN: usize = 16;

/// Token 签名密钥（每次启动随机生成，保证进程内有效）
fn signing_key() -> Vec<u8> {
    use std::sync::OnceLock;
    static KEY: OnceLock<Vec<u8>> = OnceLock::new();
    KEY.get_or_init(|| Uuid::new_v4().as_bytes().to_vec()).clone()
}

/// JWT header
#[derive(Debug, Serialize, Deserialize)]
struct TokenHeader {
    ver: u32,
    alg: String,
}

impl Default for TokenHeader {
    fn default() -> Self {
        Self {
            ver: 1,
            alg: "HS256".into(),
        }
    }
}

/// JWT body
#[derive(Debug, Serialize, Deserialize)]
struct TokenBody {
    /// user_id
    sub: String,
    /// username
    name: String,
    /// role
    role: String,
    /// issued at (ms)
    iat: i64,
    /// expires at (ms)
    exp: i64,
}

/// Session 记录
pub struct Session {
    pub user_id: String,
    pub username: String,
    pub role: UserRole,
    pub created_at_ms: i64,
    pub expires_at_ms: i64,
}

impl Clone for Session {
    fn clone(&self) -> Self {
        Self {
            user_id: self.user_id.clone(),
            username: self.username.clone(),
            role: self.role,
            created_at_ms: self.created_at_ms,
            expires_at_ms: self.expires_at_ms,
        }
    }
}

/// Session 管理器
pub struct SessionManager {
    inner: Mutex<HashMap<String, Session>>, // token → Session
}

impl Default for SessionManager {
    fn default() -> Self {
        Self::new()
    }
}

impl SessionManager {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(HashMap::new()),
        }
    }

    /// 创建新 session，返回 token
    pub fn create_session(&self, user_id: &str, username: &str, role: UserRole) -> String {
        let now = current_ms();
        let expires_at = now + SESSION_DURATION_MS;

        let header = TokenHeader::default();
        let body = TokenBody {
            sub: user_id.into(),
            name: username.into(),
            role: role.to_string(),
            iat: now,
            exp: expires_at,
        };

        let header_json = serde_json::to_string(&header).unwrap_or_default();
        let body_json = serde_json::to_string(&body).unwrap_or_default();
        let header_b64 = base64_encode_str(&header_json);
        let body_b64 = base64_encode_str(&body_json);

        let signing_input = format!("{}.{}", header_b64, body_b64);
        let signature = sign(&signing_input);
        let sig_b64 = base64_encode(&signature);

        let token = format!("{}.{}.{}", header_b64, body_b64, sig_b64);

        let session = Session {
            user_id: user_id.into(),
            username: username.into(),
            role,
            created_at_ms: now,
            expires_at_ms: expires_at,
        };

        if let Ok(mut sessions) = self.inner.lock() {
            self_cleanup_expired(&mut sessions);
            sessions.insert(token.clone(), session);
        }

        token
    }

    /// 验证 token，返回 Session（如果有效且未过期）
    pub fn verify(&self, token: &str) -> Option<Session> {
        let sessions = self.inner.lock().ok()?;

        let session = sessions.get(token)?.clone();

        // 检查过期
        if current_ms() > session.expires_at_ms {
            return None;
        }

        // 验证签名（防篡改）
        let parts: Vec<&str> = token.split('.').collect();
        if parts.len() != 3 {
            return None;
        }
        let signing_input = format!("{}.{}", parts[0], parts[1]);
        let expected_sig = sign(&signing_input);
        let actual_sig = base64_decode(parts[2])?;

        if expected_sig != actual_sig {
            return None;
        }

        Some(session)
    }

    /// 撤销指定 token
    pub fn revoke(&self, token: &str) {
        if let Ok(mut sessions) = self.inner.lock() {
            sessions.remove(token);
        }
    }

    /// 撤销某用户的所有 session
    pub fn revoke_all_for_user(&self, user_id: &str) {
        if let Ok(mut sessions) = self.inner.lock() {
            sessions.retain(|_, s| s.user_id != user_id);
        }
    }
}

/// 清理过期 session
fn self_cleanup_expired(sessions: &mut HashMap<String, Session>) {
    let now = current_ms();
    sessions.retain(|_, s| s.expires_at_ms > now);
}

// ===== 密码哈希 =====

/// 生成随机 salt
pub fn generate_salt() -> Vec<u8> {
    let mut salt = vec![0u8; SALT_LEN];
    getrandom::getrandom(&mut salt).ok();
    // fallback 到时间戳随机
    if salt.iter().all(|&b| b == 0) {
        let now = current_ms();
        let bytes = now.to_le_bytes();
        salt[..8].copy_from_slice(&bytes);
        let bytes2 = (now ^ 0xDEADBEEF).to_le_bytes();
        salt[8..].copy_from_slice(&bytes2);
    }
    salt
}

/// 哈希密码（HMAC-SHA256 + salt）
pub fn hash_password(password: &str, salt: &[u8]) -> String {
    let key = signing_key();
    let mut mac = HmacSha256::new_from_slice(&key)
        .unwrap_or_else(|_| HmacSha256::new_from_slice(b"ydsz-buddy-fallback-key").expect("HMAC"));
    mac.update(salt);
    mac.update(&key);
    mac.update(password.as_bytes());
    let result = mac.finalize().into_bytes();
    hex::encode(result)
}

/// 验证密码（恒定时间比较）
pub fn verify_password(password: &str, salt: &[u8], expected_hash: &str) -> bool {
    let actual = hash_password(password, salt);
    actual.len() == expected_hash.len()
        && actual
            .bytes()
            .zip(expected_hash.bytes())
            .fold(0u8, |acc, (a, b)| acc | (a ^ b))
            == 0
}

// ===== 工具函数 =====

/// 当前时间（毫秒）
pub fn current_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

/// base64 编码（URL-safe, no pad）
fn base64_encode(data: &[u8]) -> String {
    use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
    URL_SAFE_NO_PAD.encode(data)
}

/// base64 编码（从字符串输入）
fn base64_encode_str(s: &str) -> String {
    base64_encode(s.as_bytes())
}

/// base64 解码
fn base64_decode(s: &str) -> Option<Vec<u8>> {
    use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
    URL_SAFE_NO_PAD.decode(s).ok()
}

fn sign(input: &str) -> Vec<u8> {
    let key = signing_key();
    let mut mac = HmacSha256::new_from_slice(&key)
        .unwrap_or_else(|_| HmacSha256::new_from_slice(b"ydsz-buddy-fallback-key").expect("HMAC"));
    mac.update(input.as_bytes());
    mac.finalize().into_bytes().to_vec()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn salt_has_correct_length() {
        let s = generate_salt();
        assert_eq!(s.len(), SALT_LEN);
    }

    #[test]
    fn password_hash_verifies() {
        let salt = generate_salt();
        let hash = hash_password("mypassword", &salt);
        assert!(verify_password("mypassword", &salt, &hash));
        assert!(!verify_password("wrongpassword", &salt, &hash));
    }

    #[test]
    fn session_create_and_verify() {
        let mgr = SessionManager::new();
        let token = mgr.create_session("user-1", "alice", UserRole::Admin);
        let session = mgr.verify(&token).unwrap();
        assert_eq!(session.user_id, "user-1");
        assert_eq!(session.username, "alice");
        assert!(matches!(session.role, UserRole::Admin));
    }

    #[test]
    fn session_revoke() {
        let mgr = SessionManager::new();
        let token = mgr.create_session("user-1", "alice", UserRole::Admin);
        mgr.revoke(&token);
        assert!(mgr.verify(&token).is_none());
    }

    #[test]
    fn session_tampered_token_fails() {
        let mgr = SessionManager::new();
        let token = mgr.create_session("user-1", "alice", UserRole::Admin);
        let mut parts: Vec<String> = token.split('.').map(String::from).collect();
        if parts.len() == 3 {
            parts[1] = base64_encode_str("{\"tampered\":true}");
        }
        let tampered = parts.join(".");
        assert!(mgr.verify(&tampered).is_none());
    }
}
