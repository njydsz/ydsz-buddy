//! # RBAC 多用户认证框架 (G3-P0)
//!
//! 本地多用户支持 + 角色权限定义。第一版只做本地验证（不依赖外部 OAuth）。
//!
//! ## 用户角色
//!
//! | 角色 | 权限 |
//! |------|------|
//! | `Admin` | 全部权限（用户管理、审批配置等） |
//! | `Developer` | 代码 + 工具执行 + 审批响应 |
//! | `Viewer` | 只读（列出审批、查看配置） |
//!
//! ## 安全设计
//!
//! - 密码使用 HMAC-SHA256 + 随机 salt 哈希存储（argon2 未引入时的本地方案）
//! - Session token 使用 HMAC-SHA256 签名，过期时间 24h
//! - 首次启动时如果无用户，需要注册第一个 Admin

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tracing::{info, warn};

pub mod session;
use crate::auth::session::SessionManager;

// ===== 类型 =====

/// 用户角色
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum UserRole {
    Admin,
    Developer,
    Viewer,
}

impl UserRole {
    /// 角色显示名称
    pub fn display_name(&self) -> &'static str {
        match self {
            UserRole::Admin => "管理员",
            UserRole::Developer => "开发者",
            UserRole::Viewer => "查看者",
        }
    }

    /// 是否为管理员
    pub fn is_admin(&self) -> bool {
        matches!(self, UserRole::Admin)
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

impl std::fmt::Display for UserRole {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            UserRole::Admin => write!(f, "admin"),
            UserRole::Developer => write!(f, "developer"),
            UserRole::Viewer => write!(f, "viewer"),
        }
    }
}

/// 用户记录（持久化）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: String,
    pub username: String,
    pub role: UserRole,
    /// HMAC-SHA256 密码哈希 (hex)
    pub password_hash: String,
    /// 密码 salt (hex)
    pub password_salt: String,
    pub created_at_ms: i64,
    pub last_login_ms: Option<i64>,
}

/// 用户公开信息（不含密码哈希）
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct UserInfo {
    pub id: String,
    pub username: String,
    pub role: String,
    pub created_at_ms: i64,
    pub last_login_ms: Option<i64>,
}

impl From<&User> for UserInfo {
    fn from(u: &User) -> Self {
        Self {
            id: u.id.clone(),
            username: u.username.clone(),
            role: u.role.to_string(),
            created_at_ms: u.created_at_ms,
            last_login_ms: u.last_login_ms,
        }
    }
}

/// 认证响应
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AuthResult {
    pub token: String,
    pub user: UserInfo,
    pub expires_at_ms: i64,
}

// ===== 状态 =====

struct AuthInner {
    users: HashMap<String, User>,
    sessions: SessionManager,
}

/// 认证状态管理
pub struct AuthState {
    inner: Mutex<AuthInner>,
    data_path: PathBuf,
}

impl Default for AuthState {
    fn default() -> Self {
        Self::new()
    }
}

impl AuthState {
    /// 创建新状态（使用默认数据目录）
    pub fn new() -> Self {
        let data_path = dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(".ydsz-buddy")
            .join("auth.json");
        Self::with_path(data_path)
    }

    /// 创建新状态（指定数据文件路径）
    pub fn with_path(data_path: PathBuf) -> Self {
        let state = Self {
            inner: Mutex::new(AuthInner {
                users: HashMap::new(),
                sessions: SessionManager::new(),
            }),
            data_path,
        };
        if let Err(e) = state.load() {
            warn!(error = %e, "加载 auth 数据失败，使用空状态");
        }
        state
    }

    /// 数据文件路径
    pub fn data_path(&self) -> &std::path::Path {
        &self.data_path
    }

    /// 保存到磁盘
    pub fn save(&self) -> Result<(), String> {
        let inner = self.inner.lock().map_err(|e| e.to_string())?;
        if let Some(parent) = self.data_path.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
        }
        let json = serde_json::to_string_pretty(&inner.users).map_err(|e| e.to_string())?;
        fs::write(&self.data_path, json).map_err(|e| format!("写入文件失败: {}", e))?;
        Ok(())
    }

    /// 从磁盘加载
    pub fn load(&self) -> Result<(), String> {
        if !self.data_path.exists() {
            return Ok(());
        }
        let content = fs::read_to_string(&self.data_path).map_err(|e| e.to_string())?;
        if content.trim().is_empty() {
            return Ok(());
        }
        let users: HashMap<String, User> =
            serde_json::from_str(&content).map_err(|e| format!("解析 JSON 失败: {}", e))?;
        let mut inner = self.inner.lock().map_err(|e| e.to_string())?;
        inner.users = users;
        info!(path = ?self.data_path, user_count = inner.users.len(), "已加载 auth 数据");
        Ok(())
    }

    /// 用户数量
    pub fn user_count(&self) -> Result<usize, String> {
        let inner = self.inner.lock().map_err(|e| e.to_string())?;
        Ok(inner.users.len())
    }

    /// 是否没有用户（首次启动）
    pub fn is_empty(&self) -> bool {
        self.user_count().unwrap_or(0) == 0
    }

    /// 注册用户
    pub fn register(&self, username: &str, password: &str, role: UserRole) -> Result<UserInfo, String> {
        if username.trim().is_empty() {
            return Err("用户名不能为空".into());
        }
        if username.len() < 2 {
            return Err("用户名至少 2 个字符".into());
        }
        if password.len() < 6 {
            return Err("密码至少 6 个字符".into());
        }
        let mut inner = self.inner.lock().map_err(|e| e.to_string())?;
        if inner.users.contains_key(username) {
            return Err(format!("用户 '{}' 已存在", username));
        }

        let salt = crate::auth::session::generate_salt();
        let password_hash = crate::auth::session::hash_password(password, &salt);

        let user = User {
            id: uuid::Uuid::new_v4().to_string(),
            username: username.to_string(),
            role,
            password_hash,
            password_salt: hex::encode(&salt),
            created_at_ms: chrono::Utc::now().timestamp_millis(),
            last_login_ms: None,
        };

        let info = UserInfo::from(&user);
        inner.users.insert(username.to_string(), user);

        // 持久化
        let json = serde_json::to_string_pretty(&inner.users).map_err(|e| e.to_string())?;
        if let Some(parent) = self.data_path.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
        }
        fs::write(&self.data_path, json).map_err(|e| format!("写入文件失败: {}", e))?;

        info!(username = %username, role = %role, "新用户注册成功");
        Ok(info)
    }

    /// 登录验证
    pub fn login(&self, username: &str, password: &str) -> Result<AuthResult, String> {
        let mut inner = self.inner.lock().map_err(|e| e.to_string())?;
        let user = inner
            .users
            .get_mut(username)
            .ok_or_else(|| "用户名或密码错误".to_string())?;

        let salt = hex::decode(&user.password_salt).map_err(|e| format!("解析 salt 失败: {}", e))?;
        let expected_hash = &user.password_hash;
        if !crate::auth::session::verify_password(password, &salt, expected_hash) {
            return Err("用户名或密码错误".into());
        }

        // 更新最后登录时间
        user.last_login_ms = Some(chrono::Utc::now().timestamp_millis());

        // 创建 session
        let token = inner.sessions.create_session(&user.id, username, user.role);

        // 持久化（更新 last_login_ms）
        let json = serde_json::to_string_pretty(&inner.users).map_err(|e| e.to_string())?;
        if let Some(parent) = self.data_path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let _ = fs::write(&self.data_path, json);

        Ok(AuthResult {
            token,
            user: UserInfo::from(&*user),
            expires_at_ms: chrono::Utc::now().timestamp_millis()
                + crate::auth::session::SESSION_DURATION_MS,
        })
    }

    /// 验证 token 并返回用户信息
    pub fn verify_token(&self, token: &str) -> Option<UserInfo> {
        let inner = self.inner.lock().ok()?;
        let session = inner.sessions.verify(token)?;
        let user = inner.users.values().find(|u| u.id == session.user_id)?;
        Some(UserInfo::from(user))
    }

    /// 登出（使 token 失效）
    pub fn logout(&self, token: &str) {
        if let Ok(mut inner) = self.inner.lock() {
            inner.sessions.revoke(token);
        }
    }

    /// 列出所有用户（Admin only）
    pub fn list_users(&self) -> Result<Vec<UserInfo>, String> {
        let inner = self.inner.lock().map_err(|e| e.to_string())?;
        Ok(inner.users.values().map(UserInfo::from).collect())
    }

    /// 删除用户（Admin only，不能删除自己）
    pub fn delete_user(&self, current_user_id: &str, target_id: &str) -> Result<(), String> {
        if current_user_id == target_id {
            return Err("不能删除当前登录的用户".into());
        }
        let mut inner = self.inner.lock().map_err(|e| e.to_string())?;
        let target = inner.users.values().find(|u| u.id == target_id);
        let username = match target {
            Some(u) => u.username.clone(),
            None => return Err(format!("用户 {} 不存在", target_id)),
        };
        inner.users.remove(&username);
        inner.sessions.revoke_all_for_user(target_id);

        // 持久化
        if let Ok(json) = serde_json::to_string_pretty(&inner.users) {
            let _ = fs::write(&self.data_path, json);
        }

        info!(deleted_user = %username, "用户已删除");
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_state() -> AuthState {
        AuthState::with_path(
            std::env::temp_dir()
                .join(format!("ydsz-auth-test-{}", uuid::Uuid::new_v4())),
        )
    }

    #[test]
    fn register_and_login() {
        let state = make_state();
        state
            .register("alice", "password123", UserRole::Admin)
            .unwrap();
        let result = state.login("alice", "password123").unwrap();
        assert_eq!(result.user.username, "alice");

        // 验证 token
        let info = state.verify_token(&result.token).unwrap();
        assert_eq!(info.username, "alice");
    }

    #[test]
    fn wrong_password() {
        let state = make_state();
        state
            .register("bob", "password123", UserRole::Developer)
            .unwrap();
        assert!(state.login("bob", "wrongpassword").is_err());
    }

    #[test]
    fn duplicate_username_rejected() {
        let state = make_state();
        state
            .register("charlie", "password123", UserRole::Viewer)
            .unwrap();
        assert!(state
            .register("charlie", "otherpass", UserRole::Viewer)
            .is_err());
    }

    #[test]
    fn list_users() {
        let state = make_state();
        state
            .register("admin1", "password123", UserRole::Admin)
            .unwrap();
        state
            .register("dev1", "password123", UserRole::Developer)
            .unwrap();
        let users = state.list_users().unwrap();
        assert_eq!(users.len(), 2);
    }

    #[test]
    fn short_password_rejected() {
        let state = make_state();
        assert!(state.register("test", "123", UserRole::Viewer).is_err());
    }
}
