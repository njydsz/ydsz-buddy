//! # 多用户 RBAC 认证命令模块 (G3-P0)
//!
//! 提供用户认证、注册、权限管理相关的 Tauri 命令。
//!
//! ## 命令清单
//!
//! | 命令 | 说明 |
//! |------|------|
//! | `auth_login` | 用户登录 |
//! | `auth_logout` | 用户登出 |
//! | `auth_current_user` | 获取当前登录用户 |
//! | `auth_register` | 注册用户（需 token 验证或首次启动） |
//! | `auth_list_users` | 列出所有用户（Admin only） |
//! | `auth_delete_user` | 删除用户（Admin only） |
//! | `auth_check_first_run` | 检查是否首次启动（无用户） |

use tauri::State;
use tracing::{info, warn};

use crate::auth::{AuthState, UserRole, UserInfo};

/// DTO: 登录请求
#[derive(Debug, Clone, serde::Deserialize, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

/// DTO: 注册请求
#[derive(Debug, Clone, serde::Deserialize, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct RegisterRequest {
    pub username: String,
    pub password: String,
    pub role: String, // "admin" | "developer" | "viewer"
}

/// DTO: 当前用户响应
#[derive(Debug, Clone, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct CurrentUserResponse {
    pub user: Option<UserInfo>,
    pub requires_login: bool,
}

/// DTO: 首次运行检查响应
#[derive(Debug, Clone, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct FirstRunResponse {
    pub is_first_run: bool,
    pub user_count: usize,
}

// ===== Tauri 命令 =====

/// 检查是否首次启动
///
/// 如果没有任何用户存在，前端应跳转到注册页面创建首个 Admin。
#[tauri::command]
#[specta::specta]
pub async fn auth_check_first_run(
    state: State<'_, AuthState>,
) -> Result<FirstRunResponse, String> {
    let count = state.user_count().unwrap_or(0);
    Ok(FirstRunResponse {
        is_first_run: count == 0,
        user_count: count,
    })
}

/// 用户登录
#[tauri::command]
#[specta::specta]
pub async fn auth_login(
    state: State<'_, AuthState>,
    username: String,
    password: String,
) -> Result<crate::auth::AuthResult, String> {
    info!(username = %username, "登录请求");
    state.login(&username, &password)
}

/// 用户登出
#[tauri::command]
#[specta::specta]
pub async fn auth_logout(
    state: State<'_, AuthState>,
    token: String,
) -> Result<(), String> {
    state.logout(&token);
    info!("用户登出成功");
    Ok(())
}

/// 获取当前登录用户（通过 token）
///
/// 前端在启动时调用此命令验证持久化的 session。
#[tauri::command]
#[specta::specta]
pub async fn auth_current_user(
    state: State<'_, AuthState>,
    token: Option<String>,
) -> Result<CurrentUserResponse, String> {
    let user = token.and_then(|t| state.verify_token(&t));
    Ok(CurrentUserResponse {
        requires_login: user.is_none(),
        user,
    })
}

/// 注册用户
///
/// 首次启动（无用户）时允许任何人注册首个 Admin。
/// 其他情况下需要 Admin 提供 admin_token。
#[tauri::command]
#[specta::specta]
pub async fn auth_register(
    state: State<'_, AuthState>,
    username: String,
    password: String,
    role: String,
    admin_token: Option<String>,
) -> Result<UserInfo, String> {
    // 验证角色
    let user_role = role.parse::<UserRole>().map_err(|e| e.to_string())?;

    // 如果有用户存在，验证 admin token
    if !state.is_empty() {
        match admin_token {
            Some(token) => {
                let admin = state
                    .verify_token(&token)
                    .ok_or_else(|| "无效的 admin token".to_string())?;
                if admin.role != "admin" {
                    warn!(user = %admin.username, "非管理员尝试注册用户");
                    return Err("只有管理员可以注册新用户".into());
                }
            }
            None => return Err("需要管理员 token 才能注册用户".into()),
        }
    }

    // 首个用户强制为 Admin
    let final_role = if state.is_empty() {
        info!("首个用户注册，强制设为 Admin");
        UserRole::Admin
    } else {
        user_role
    };

    info!(username = %username, role = %final_role, "注册用户");
    state.register(&username, &password, final_role)
}

/// 列出所有用户（Admin only）
#[tauri::command]
#[specta::specta]
pub async fn auth_list_users(
    state: State<'_, AuthState>,
    admin_token: String,
) -> Result<Vec<UserInfo>, String> {
    let admin = state
        .verify_token(&admin_token)
        .ok_or_else(|| "无效的 admin token".to_string())?;
    if admin.role != "admin" {
        warn!(user = %admin.username, "非管理员尝试列出用户");
        return Err("只有管理员可以列出所有用户".into());
    }
    state.list_users()
}

/// 删除用户（Admin only，不能删除自己）
#[tauri::command]
#[specta::specta]
pub async fn auth_delete_user(
    state: State<'_, AuthState>,
    admin_token: String,
    target_user_id: String,
) -> Result<(), String> {
    let admin = state
        .verify_token(&admin_token)
        .ok_or_else(|| "无效的 admin token".to_string())?;
    if admin.role != "admin" {
        warn!(user = %admin.username, "非管理员尝试删除用户");
        return Err("只有管理员可以删除用户".into());
    }
    state.delete_user(&admin.id, &target_user_id)
}
