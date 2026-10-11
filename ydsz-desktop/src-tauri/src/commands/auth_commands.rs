//! 多用户认证与 RBAC 框架（G3-P0）
//!
//! 提供本地多用户注册/登录/权限管理功能。
//! 第一版使用本地 JSON 持久化 + HMAC-SHA256 会话 token。

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;

/// 用户角色
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum UserRole {
    Admin,      // 管理员
    Developer,  // 开发者
    Viewer,     // 查看者
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

/// 用户记录（内部，含密码哈希）
#[derive(Debug, Clone, Serialize, Deserialize)]
struct UserRecord {
    pub id: String,
    pub username: String,
    pub password_hash: String,
    pub salt: String,
    pub role: UserRole,
    pub created_at_ms: i64,
    pub last_login_ms: Option<i64>,
}

/// 会话记录
#[derive(Debug, Clone, Serialize, Deserialize)]
struct SessionRecord {
    pub user_id: String,
    pub username: String,
    pub token_hash: String,
    pub created_at_ms: i64,
    pub expires_at_ms: i64,
}

/// 认证状态
pub struct AuthState {
    pub users: Mutex<Vec<UserRecord>>,
    pub sessions: Mutex<Vec<SessionRecord>>,
}

impl AuthState {
    pub fn new() -> Self {
        Self {
            users: Mutex::new(Vec::new()),
            sessions: Mutex::new(Vec::new()),
        }
    }

    /// 计算密码哈希 (SHA-256 + salt)
    fn hash_password(password: &str, salt: &str) -> String {
        use sha2::{Sha256, Digest};
        let mut hasher = Sha256::new();
        hasher.update(salt.as_bytes());
        hasher.update(password.as_bytes());
        hasher.update(b"ydsz-buddy-auth-v1");
        format!("{:x}", hasher.finalize())
    }

    /// 生成随机 salt
    fn generate_salt() -> String {
        use rand::Rng;
        let mut rng = rand::thread_rng();
        let bytes: Vec<u8> = (0..16).map(|_| rng.gen()).collect();
        base64::encode(&bytes)
    }

    /// 生成 token
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

    /// 获取用户数量
    pub fn user_count(&self) -> usize {
        self.users.lock().map(|u| u.len()).unwrap_or(0)
    }

    /// 根据用户名查找用户
    fn find_user_by_username(&self, username: &str) -> Option<UserRecord> {
        self.users.lock().ok()?
            .iter()
            .find(|u| u.username == username)
            .cloned()
    }

    /// 根据 ID 查找用户
    fn find_user_by_id(&self, id: &str) -> Option<UserRecord> {
        self.users.lock().ok()?
            .iter()
            .find(|u| u.id == id)
            .cloned()
    }

    /// 验证 token 是否有效
    fn validate_token(&self, token: &str) -> Option<SessionRecord> {
        let sessions = self.sessions.lock().ok()?;
        let now = chrono::Utc::now().timestamp_millis();
        sessions.iter()
            .find(|s| s.token_hash == token && s.expires_at_ms > now)
            .cloned()
    }

    /// 注册用户
    pub fn register(&self, req: RegisterRequest) -> Result<UserInfo, String> {
        if req.username.trim().is_empty() {
            return Err("用户名不能为空".into());
        }
        if req.password.len() < 6 {
            return Err("密码长度不能小于 6 位".into());
        }

        let mut users = self.users.lock().map_err(|_| "锁错误")?;

        if users.iter().any(|u| u.username == req.username) {
            return Err(format!("用户名 '{}' 已存在", req.username));
        }

        // 如果没有用户，自动为 Admin
        let role = if users.is_empty() {
            UserRole::Admin
        } else {
            req.role.unwrap_or(UserRole::Viewer)
        };

        let user_id = format!("user_{}", chrono::Utc::now().timestamp_millis());
        let salt = Self::generate_salt();
        let password_hash = Self::hash_password(&req.password, &salt);

        let record = UserRecord {
            id: user_id.clone(),
            username: req.username.clone(),
            password_hash,
            salt,
            role: role.clone(),
            created_at_ms: chrono::Utc::now().timestamp_millis(),
            last_login_ms: None,
        };

        users.push(record);

        Ok(UserInfo {
            id: user_id,
            username: req.username,
            role,
            created_at_ms: chrono::Utc::now().timestamp_millis(),
            last_login_ms: None,
        })
    }

    /// 登录
    pub fn login(&self, username: &str, password: &str) -> Result<AuthResult, String> {
        let mut users = self.users.lock().map_err(|_| "锁错误")?;

        let user_idx = users.iter()
            .position(|u| u.username == username)
            .ok_or_else(|| "用户名或密码错误".to_string())?;

        let hash = Self::hash_password(password, &users[user_idx].salt);

        if hash != users[user_idx].password_hash {
            return Err("用户名或密码错误".to_string());
        }

        // 更新最后登录时间
        let now = chrono::Utc::now().timestamp_millis();
        let user_id = users[user_idx].id.clone();
        let user_username = users[user_idx].username.clone();
        let user_role = users[user_idx].role.clone();
        let user_created_at = users[user_idx].created_at_ms;
        users[user_idx].last_login_ms = Some(now);

        // 创建会话
        let token = Self::generate_token(username);
        let session = SessionRecord {
            user_id: user_id.clone(),
            username: user_username.clone(),
            token_hash: token.clone(),
            created_at_ms: now,
            expires_at_ms: now + 24 * 60 * 60 * 1000,
        };

        if let Ok(mut sessions) = self.sessions.lock() {
            sessions.push(session);
        }

        let user_info = UserInfo {
            id: user_id,
            username: user_username,
            role: user_role,
            created_at_ms: user_created_at,
            last_login_ms: Some(now),
        };

        Ok(AuthResult {
            token,
            user: user_info,
        })
    }

    /// 登出（清除所有会话）
    pub fn logout(&self, token: &str) -> Result<(), String> {
        let mut sessions = self.sessions.lock().map_err(|_| "锁错误")?;
        let initial_len = sessions.len();
        sessions.retain(|s| s.token_hash != token);
        if sessions.len() == initial_len {
            return Err("无效的 token".into());
        }
        Ok(())
    }

    /// 验证 token 并返回用户信息
    pub fn validate_and_get_user(&self, token: &str) -> Option<UserInfo> {
        let session = self.validate_token(token)?;
        let user = self.find_user_by_id(&session.user_id)?;
        Some(UserInfo {
            id: user.id,
            username: user.username,
            role: user.role,
            created_at_ms: user.created_at_ms,
            last_login_ms: user.last_login_ms,
        })
    }

    /// 列出所有用户（Admin only）
    pub fn list_users(&self) -> Vec<UserInfo> {
        self.users.lock()
            .map(|users| users.iter().map(|u| UserInfo {
                id: u.id.clone(),
                username: u.username.clone(),
                role: u.role.clone(),
                created_at_ms: u.created_at_ms,
                last_login_ms: u.last_login_ms,
            }).collect())
            .unwrap_or_default()
    }

    /// 删除用户（Admin only）
    pub fn delete_user(&self, user_id: &str) -> Result<(), String> {
        let mut users = self.users.lock().map_err(|_| "锁错误")?;
        let initial_len = users.len();
        users.retain(|u| u.id != user_id);
        if users.len() == initial_len {
            return Err("用户不存在".into());
        }
        Ok(())
    }
}

// === Tauri 命令 ===

/// 首次启动检测
#[tauri::command]
#[specta::specta]
pub fn auth_check_first_run(
    state: tauri::State<'_, AuthState>,
) -> bool {
    state.user_count() == 0
}

/// 注册用户
#[tauri::command]
#[specta::specta]
pub fn auth_register(
    req: RegisterRequest,
    state: tauri::State<'_, AuthState>,
) -> Result<UserInfo, String> {
    state.register(req)
}

/// 用户登录
#[tauri::command]
#[specta::specta]
pub fn auth_login(
    username: String,
    password: String,
    state: tauri::State<'_, AuthState>,
) -> Result<AuthResult, String> {
    state.login(&username, &password)
}

/// 用户登出
#[tauri::command]
#[specta::specta]
pub fn auth_logout(
    token: String,
    state: tauri::State<'_, AuthState>,
) -> Result<(), String> {
    state.logout(&token)
}

/// 验证 token 并获取当前用户
#[tauri::command]
#[specta::specta]
pub fn auth_current_user(
    token: String,
    state: tauri::State<'_, AuthState>,
) -> Option<UserInfo> {
    state.validate_and_get_user(&token)
}

/// 列出所有用户（Admin only）
#[tauri::command]
#[specta::specta]
pub fn auth_list_users(
    _admin_token: String,
    state: tauri::State<'_, AuthState>,
) -> Vec<UserInfo> {
    // TODO: 验证 admin_token 属于 Admin 角色
    state.list_users()
}

/// 删除用户（Admin only）
#[tauri::command]
#[specta::specta]
pub fn auth_delete_user(
    user_id: String,
    _admin_token: String,
    state: tauri::State<'_, AuthState>,
) -> Result<(), String> {
    // TODO: 验证 admin_token 属于 Admin 角色
    state.delete_user(&user_id)
}
