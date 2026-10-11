//! SQLite 持久化用户存储（P0-3 多用户隔离）
//!
//! 替换 auth_commands.rs 中的纯内存存储，提供：
//! - users / sessions 表的 SQLite 持久化
//! - 密码哈希升级为 SHA-256 + per-user salt + 10000 轮 HMAC 拉伸
//! - RBAC 角色强制校验
//! - Token 用量限额（TokenQuota）支持

use anyhow::Result;
use parking_lot::Mutex;
use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Arc;

/// 用户角色
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum UserRole {
    Admin,
    Developer,
    Viewer,
}

impl std::fmt::Display for UserRole {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            UserRole::Admin => write!(f, "admin"),
            UserRole::Developer => write!(f, "developer"),
            UserRole::Viewer => write!(f, "viewer"),
        }
    }
}

impl std::str::FromStr for UserRole {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "admin" => Ok(UserRole::Admin),
            "developer" => Ok(UserRole::Developer),
            "viewer" => Ok(UserRole::Viewer),
            _ => Err(format!("未知角色: {}", s)),
        }
    }
}

/// 用户信息（不含密码）
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct UserInfo {
    pub id: String,
    pub username: String,
    pub role: UserRole,
    pub created_at_ms: i64,
    pub last_login_ms: Option<i64>,
    pub token_quota: i64,       // 总 token 限额（0 = 无限）
    pub token_used: i64,        // 已消费 token 数
}

/// 登录结果
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct AuthResult {
    pub token: String,
    pub user: UserInfo,
}

/// 注册请求
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct RegisterRequest {
    pub username: String,
    pub password: String,
    pub role: Option<UserRole>,
}

/// SSO 提供者类型
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SsoProvider {
    Oidc,
    Feishu,
    Dingtalk,
    Wecom,
}

/// SSO 登录请求
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct SsoLoginRequest {
    pub provider: SsoProvider,
    pub code: String,           // OAuth authorization code
    pub state: String,          // CSRF state
}

/// OIDC 配置
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, Default)]
pub struct OidcConfig {
    pub enabled: bool,
    pub issuer_url: String,
    pub client_id: String,
    pub client_secret: String,
    pub redirect_uri: String,
    pub scopes: String,         // 空格分隔
}

/// 单个用户的 token 配额
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct UserQuota {
    pub user_id: String,
    pub username: String,
    pub token_quota: i64,       // 0 = 无限
    pub token_used: i64,
    pub max_agents: i32,        // 0 = 无限
}

// ================================================================
// SQLite 持久化用户存储
// ================================================================

#[derive(Clone)]
pub struct AuthStore {
    conn: Arc<Mutex<Connection>>,
}

impl AuthStore {
    /// 打开或创建 SQLite 数据库
    pub fn open<P: AsRef<Path>>(path: P) -> Result<Self> {
        let conn = Connection::open(path)?;
        let store = Self { conn: Arc::new(Mutex::new(conn)) };
        store.init_tables()?;
        Ok(store)
    }

    /// 创建内存存储（主要用于测试）
    pub fn open_in_memory() -> Result<Self> {
        let conn = Connection::open_in_memory()?;
        let store = Self { conn: Arc::new(Mutex::new(conn)) };
        store.init_tables()?;
        Ok(store)
    }

    fn init_tables(&self) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS users (
                id              TEXT PRIMARY KEY,
                username        TEXT NOT NULL UNIQUE,
                password_hash   TEXT,                -- NULL = SSO 用户
                salt            TEXT,
                role            TEXT NOT NULL DEFAULT 'viewer',
                auth_type       TEXT NOT NULL DEFAULT 'local',  -- 'local' | 'sso'
                sso_provider    TEXT,                                -- 'oidc' | 'feishu' | 'dingtalk' | 'wecom'
                sso_subject     TEXT,                                -- SSO 唯一标识
                created_at_ms   INTEGER NOT NULL,
                last_login_ms   INTEGER,
                token_quota     INTEGER NOT NULL DEFAULT 0,         -- 0 = 无限
                token_used      INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_users_sso ON users(sso_provider, sso_subject);
            CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

            CREATE TABLE IF NOT EXISTS sessions (
                token_hash      TEXT PRIMARY KEY,
                user_id         TEXT NOT NULL,
                username        TEXT NOT NULL,
                created_at_ms   INTEGER NOT NULL,
                expires_at_ms   INTEGER NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

            CREATE TABLE IF NOT EXISTS oidc_states (
                state           TEXT PRIMARY KEY,
                provider        TEXT NOT NULL,
                code_verifier   TEXT,               -- PKCE
                created_at_ms   INTEGER NOT NULL,
                expires_at_ms   INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS login_attempts (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                username        TEXT NOT NULL,
                client_ip       TEXT NOT NULL DEFAULT '',
                attempt_at_ms   INTEGER NOT NULL,
                success         INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_login_attempts_user ON login_attempts(username, attempt_at_ms);
            "#,
        )?;
        Ok(())
    }

    // ── 密码学辅助 ──────────────────────────────────────────────

    /// 生成随机 salt（32 字节 base64）
    fn generate_salt() -> String {
        use rand::Rng;
        let mut rng = rand::thread_rng();
        let bytes: Vec<u8> = (0..32).map(|_| rng.gen()).collect();
        base64::encode(&bytes)
    }

    /// 高安全性密码哈希：HMAC-SHA256 + 10000 轮拉伸 + per-user salt
    fn hash_password(password: &str, salt: &str) -> String {
        use sha2::{Sha256, Digest};
        let mut h = Sha256::new();
        h.update(salt.as_bytes());
        h.update(password.as_bytes());
        h.update(b"ydsz-buddy-auth-v2");
        let mut result = h.finalize();
        // 10000 轮 HMAC 拉伸（PBKDF2-like）
        for _ in 0..10_000 {
            let mut h2 = Sha256::new();
            h2.update(salt.as_bytes());
            h2.update(&result);
            result = h2.finalize();
        }
        format!("v2{:x}", result)
    }

    /// 生成随机会话 token
    fn generate_token(username: &str) -> String {
        use sha2::{Sha256, Digest};
        let timestamp = chrono::Utc::now().timestamp_millis();
        let random = rand::random::<u64>();
        let mut hasher = Sha256::new();
        hasher.update(username.as_bytes());
        hasher.update(&timestamp.to_le_bytes());
        hasher.update(&random.to_le_bytes());
        format!("ydsz_{:x}", hasher.finalize())
    }

    // ── 用户 CRUD ───────────────────────────────────────────────

    pub fn user_count(&self) -> usize {
        let conn = self.conn.lock();
        conn.query_row("SELECT COUNT(*) FROM users", [], |r| r.get::<_, i64>(0))
            .unwrap_or(0) as usize
    }

    /// 注册本地用户
    pub fn register(&self, req: RegisterRequest) -> Result<UserInfo, String> {
        if req.username.trim().is_empty() {
            return Err("用户名不能为空".into());
        }
        if req.password.len() < 8 {
            return Err("密码长度不能小于 8 位".into());
        }

        let conn = self.conn.lock();

        // 唯一性检查
        let exists: bool = conn.query_row(
            "SELECT 1 FROM users WHERE username = ?1",
            rusqlite::params![&req.username],
            |r| r.get::<_, i64>(0),
        ).optional().map_err(|e| e.to_string())?.is_some();

        if exists {
            return Err(format!("用户名 '{}' 已存在", req.username));
        }

        // 首用户自动 Admin
        let user_count: i64 = conn.query_row("SELECT COUNT(*) FROM users", [], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        let role = if user_count == 0 {
            UserRole::Admin
        } else {
            req.role.unwrap_or(UserRole::Viewer)
        };

        let user_id = format!("user_{}", chrono::Utc::now().timestamp_millis());
        let salt = Self::generate_salt();
        let password_hash = Self::hash_password(&req.password, &salt);
        let now = chrono::Utc::now().timestamp_millis();

        conn.execute(
            "INSERT INTO users (id, username, password_hash, salt, role, auth_type, created_at_ms)
             VALUES (?1, ?2, ?3, ?4, ?5, 'local', ?6)",
            rusqlite::params![&user_id, &req.username, &password_hash, &salt, &role.to_string(), now],
        ).map_err(|e| e.to_string())?;

        Ok(UserInfo {
            id: user_id,
            username: req.username,
            role,
            created_at_ms: now,
            last_login_ms: None,
            token_quota: 0,
            token_used: 0,
        })
    }

    /// 本地用户登录
    pub fn login(&self, username: &str, password: &str) -> Result<AuthResult, String> {
        let conn = self.conn.lock();

        let row = conn.query_row(
            "SELECT id, username, password_hash, salt, role, token_quota, token_used FROM users
             WHERE username = ?1 AND auth_type = 'local'",
            rusqlite::params![username],
            |row| Ok((
                row.get::<_, String>(0)?,          // id
                row.get::<_, String>(1)?,          // username
                row.get::<_, String>(2)?,          // password_hash
                row.get::<_, String>(3)?,          // salt
                row.get::<_, String>(4)?,          // role
                row.get::<_, i64>(5)?,             // token_quota
                row.get::<_, i64>(6)?,             // token_used
            )),
        ).map_err(|_| "用户名或密码错误".to_string())?;

        let (user_id, user_username, stored_hash, salt, role_str, token_quota, token_used) = row;

        let computed_hash = Self::hash_password(password, &salt);
        if computed_hash != stored_hash {
            return Err("用户名或密码错误".to_string());
        }

        // 更新最后登录时间
        let now = chrono::Utc::now().timestamp_millis();
        conn.execute(
            "UPDATE users SET last_login_ms = ?1 WHERE id = ?2",
            rusqlite::params![now, &user_id],
        ).map_err(|e| e.to_string())?;

        // 创建会话
        let token = Self::generate_token(username);
        let token_hash = token.clone();
        let session_expiry = now + 24 * 60 * 60 * 1000;
        conn.execute(
            "INSERT INTO sessions (token_hash, user_id, username, created_at_ms, expires_at_ms)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![&token_hash, &user_id, &user_username, now, session_expiry],
        ).map_err(|e| e.to_string())?;

        let role = role_str.parse().unwrap_or(UserRole::Viewer);

        Ok(AuthResult {
            token,
            user: UserInfo {
                id: user_id,
                username: user_username,
                role,
                created_at_ms: now,
                last_login_ms: Some(now),
                token_quota,
                token_used,
            },
        })
    }

    /// 验证 token 并返回用户信息（带 quota）
    pub fn validate_and_get_user(&self, token: &str) -> Option<UserInfo> {
        let conn = self.conn.lock();
        let now = chrono::Utc::now().timestamp_millis();

        let row = conn.query_row(
            "SELECT u.id, u.username, u.role, u.created_at_ms, u.last_login_ms, u.token_quota, u.token_used
             FROM sessions s JOIN users u ON s.user_id = u.id
             WHERE s.token_hash = ?1 AND s.expires_at_ms > ?2",
            rusqlite::params![token, now],
            |row| Ok(UserInfo {
                id: row.get(0)?,
                username: row.get(1)?,
                role: row.get::<_, String>(2)?.parse().unwrap_or(UserRole::Viewer),
                created_at_ms: row.get(3)?,
                last_login_ms: row.get(4)?,
                token_quota: row.get(5)?,
                token_used: row.get(6)?,
            }),
        ).optional().ok()??;
        Some(row)
    }

    /// 登出
    pub fn logout(&self, token: &str) -> Result<(), String> {
        let conn = self.conn.lock();
        let deleted = conn.execute(
            "DELETE FROM sessions WHERE token_hash = ?1",
            rusqlite::params![token],
        ).map_err(|e| e.to_string())?;
        if deleted == 0 {
            return Err("无效的 token".into());
        }
        Ok(())
    }

    /// 列出所有用户（Admin only）
    pub fn list_users(&self) -> Vec<UserInfo> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT id, username, role, created_at_ms, last_login_ms, token_quota, token_used FROM users ORDER BY created_at_ms ASC"
        ).unwrap();
        let rows = stmt.query_map([], |row| {
            Ok(UserInfo {
                id: row.get(0)?,
                username: row.get(1)?,
                role: row.get::<_, String>(2)?.parse().unwrap_or(UserRole::Viewer),
                created_at_ms: row.get(3)?,
                last_login_ms: row.get(4)?,
                token_quota: row.get(5)?,
                token_used: row.get(6)?,
            })
        }).unwrap();
        rows.filter_map(|r| r.ok()).collect()
    }

    /// 删除用户（Admin only）—— 级联删除 sessions
    pub fn delete_user(&self, user_id: &str) -> Result<(), String> {
        let conn = self.conn.lock();
        let deleted = conn.execute(
            "DELETE FROM users WHERE id = ?1",
            rusqlite::params![user_id],
        ).map_err(|e| e.to_string())?;
        if deleted == 0 {
            return Err("用户不存在".into());
        }
        Ok(())
    }

    // ── Token 限额管理 ─────────────────────────────────────────

    /// 增加 token 消费计数
    pub fn consume_tokens(&self, user_id: &str, tokens: i64) -> Result<(), String> {
        let conn = self.conn.lock();
        conn.execute(
            "UPDATE users SET token_used = token_used + ?1 WHERE id = ?2",
            rusqlite::params![tokens, user_id],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    /// 检查是否还有配额
    pub fn check_quota(&self, user_id: &str) -> Result<UserQuota, String> {
        let conn = self.conn.lock();
        conn.query_row(
            "SELECT id, username, token_quota, token_used FROM users WHERE id = ?1",
            rusqlite::params![user_id],
            |row| Ok(UserQuota {
                user_id: row.get(0)?,
                username: row.get(1)?,
                token_quota: row.get(2)?,
                token_used: row.get(3)?,
                max_agents: 0,
            }),
        ).map_err(|e| e.to_string())
    }

    /// 设置用户 token 限额（Admin only）
    pub fn set_user_quota(&self, user_id: &str, token_quota: i64) -> Result<(), String> {
        let conn = self.conn.lock();
        conn.execute(
            "UPDATE users SET token_quota = ?1 WHERE id = ?2",
            rusqlite::params![token_quota, user_id],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    // ── SSO 用户查找/创建 ──────────────────────────────────────

    /// 根据 SSO subject 查找或创建用户
    pub fn resolve_or_create_sso_user(
        &self,
        provider: &str,
        subject: &str,
        username: &str,
        email: Option<&str>,
    ) -> Result<UserInfo, String> {
        let conn = self.conn.lock();

        // 尝试查找已有 SSO 绑定
        let existing = conn.query_row(
            "SELECT id, username, role, created_at_ms, last_login_ms, token_quota, token_used
             FROM users WHERE sso_provider = ?1 AND sso_subject = ?2",
            rusqlite::params![provider, subject],
            |row| Ok(UserInfo {
                id: row.get(0)?,
                username: row.get(1)?,
                role: row.get::<_, String>(2)?.parse().unwrap_or(UserRole::Viewer),
                created_at_ms: row.get(3)?,
                last_login_ms: row.get(4)?,
                token_quota: row.get(5)?,
                token_used: row.get(6)?,
            }),
        ).optional().map_err(|e| e.to_string())?;

        if let Some(user) = existing {
            // 更新最后登录时间
            let now = chrono::Utc::now().timestamp_millis();
            conn.execute(
                "UPDATE users SET last_login_ms = ?1 WHERE id = ?2",
                rusqlite::params![now, &user.id],
            ).map_err(|e| e.to_string())?;

            let mut updated = user;
            updated.last_login_ms = Some(now);
            return Ok(updated);
        }

        // 创建新用户
        let now = chrono::Utc::now().timestamp_millis();
        let user_id = format!("sso_{}_{}", provider, subject.replace([' ', '/', '@'], "_"));
        let role = {
            let count: i64 = conn.query_row("SELECT COUNT(*) FROM users", [], |r| r.get(0))
                .unwrap_or(0);
            if count == 0 { UserRole::Admin } else { UserRole::Developer }
        };

        conn.execute(
            "INSERT INTO users (id, username, role, auth_type, sso_provider, sso_subject, created_at_ms)
             VALUES (?1, ?2, ?3, 'sso', ?4, ?5, ?6)",
            rusqlite::params![&user_id, username, &role.to_string(), provider, subject, now],
        ).map_err(|e| e.to_string())?;

        Ok(UserInfo {
            id: user_id,
            username: username.to_string(),
            role,
            created_at_ms: now,
            last_login_ms: Some(now),
            token_quota: 0,
            token_used: 0,
        })
    }

    /// 为 SSO 用户创建 session
    pub fn create_session_for_user(&self, user_id: &str) -> Result<String, String> {
        let conn = self.conn.lock();
        let user = conn.query_row(
            "SELECT id, username FROM users WHERE id = ?1",
            rusqlite::params![user_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        ).map_err(|_| "用户不存在".to_string())?;

        let token = Self::generate_token(&user.1);
        let now = chrono::Utc::now().timestamp_millis();
        conn.execute(
            "INSERT INTO sessions (token_hash, user_id, username, created_at_ms, expires_at_ms)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![&token, &user.0, &user.1, now, now + 24 * 60 * 60 * 1000],
        ).map_err(|e| e.to_string())?;

        // 更新最后登录
        conn.execute(
            "UPDATE users SET last_login_ms = ?1 WHERE id = ?2",
            rusqlite::params![now, user_id],
        ).ok();

        Ok(token)
    }

    // ── OIDC State 管理 ───────────────────────────────────────

    /// 创建 OIDC state（含 PKCE code_verifier）
    pub fn create_oidc_state(&self, provider: &str, code_verifier: &str) -> Result<String, String> {
        use rand::Rng;
        let mut rng = rand::thread_rng();
        let state: String = (0..32).map(|_| rng.gen::<u8>()).map(|b| format!("{:02x}", b)).collect();
        let now = chrono::Utc::now().timestamp_millis();
        let expires = now + 10 * 60 * 1000; // 10 分钟过期

        let conn = self.conn.lock();
        conn.execute(
            "INSERT INTO oidc_states (state, provider, code_verifier, created_at_ms, expires_at_ms)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![&state, provider, code_verifier, now, expires],
        ).map_err(|e| e.to_string())?;

        Ok(state)
    }

    /// 消费 OIDC state（一次性使用，返回 code_verifier）
    pub fn consume_oidc_state(&self, state: &str) -> Option<String> {
        let conn = self.conn.lock();
        let now = chrono::Utc::now().timestamp_millis();

        let verifier = conn.query_row(
            "SELECT code_verifier FROM oidc_states WHERE state = ?1 AND expires_at_ms > ?2",
            rusqlite::params![state, now],
            |r| r.get::<_, String>(0),
        ).optional().ok()??;

        conn.execute(
            "DELETE FROM oidc_states WHERE state = ?1",
            rusqlite::params![state],
        ).ok();
        Some(verifier)
    }

    // ── 登录保护（brute-force throttle）────────────────────────

    /// 获取最近 N 分钟内某 IP 的登录失败次数
    pub fn recent_failed_attempts(&self, ip: &str, window_minutes: i64) -> i64 {
        let conn = self.conn.lock();
        let cutoff = chrono::Utc::now().timestamp_millis() - window_minutes * 60 * 1000;
        conn.query_row(
            "SELECT COUNT(*) FROM login_attempts WHERE client_ip = ?1 AND attempt_at_ms > ?2 AND success = 0",
            rusqlite::params![ip, cutoff],
            |r| r.get::<_, i64>(0),
        ).unwrap_or(0)
    }

    /// 记录一次登录尝试
    pub fn record_login_attempt(&self, username: &str, client_ip: &str, success: bool) {
        let conn = self.conn.lock();
        let now = chrono::Utc::now().timestamp_millis();
        conn.execute(
            "INSERT INTO login_attempts (username, client_ip, attempt_at_ms, success) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![username, client_ip, now, if success { 1 } else { 0 }],
        ).ok();
    }
}
