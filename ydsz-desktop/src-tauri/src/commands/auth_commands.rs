//! 多用户认证与 RBAC + SSO（P0-3 多用户隔离 + P0-2 SSO 认证）
//!
//! 提供：
//! - 本地多用户注册/登录/权限管理（SQLite 持久化）
//! - RBAC 强制校验（Admin 操作必须验证 token 角色）
//! - Token 用量限额管理
//! - SSO：OIDC / 飞书 OAuth 登录框架
//! - 登录失败限流（brute-force throttle）

use crate::commands::auth_store::{
    AuthStore, AuthResult, RegisterRequest, SsoLoginRequest, SsoProvider, UserQuota, UserRole, UserInfo,
};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use dirs;

/// OIDC 配置请求
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct OidcConfigRequest {
    pub issuer_url: String,
    pub client_id: String,
    pub client_secret: String,
    pub redirect_uri: String,
    pub scopes: String,
}

/// OIDC 授权 URL 响应
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct OidcAuthUrlResponse {
    pub authorization_url: String,
    pub state: String,
}

/// 认证状态（SQLite 持久化版）
pub struct AuthState {
    pub store: Arc<Mutex<Option<AuthStore>>>,
}

impl AuthState {
    pub fn new() -> Self {
        Self { store: Arc::new(Mutex::new(None)) }
    }

    /// 初始化 SQLite 存储（在应用启动时调用）
    pub fn init(&self) -> Result<(), String> {
        let db_path = self.db_path();
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("创建数据库目录失败: {}", e))?;
        }
        let store = AuthStore::open(&db_path)
            .map_err(|e| format!("打开认证数据库失败: {}", e))?;
        *self.store.lock().map_err(|_| "锁错误")? = Some(store);
        Ok(())
    }

    fn db_path(&self) -> PathBuf {
        dirs::data_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("ydsz-buddy")
            .join("auth.db")
    }

    fn get_store(&self) -> Result<AuthStore, String> {
        self.store
            .lock()
            .map_err(|_| "锁错误")?
            .clone()
            .ok_or_else(|| "认证系统未初始化，请先调用 init".to_string())
    }
}

impl Clone for AuthState {
    fn clone(&self) -> Self {
        Self { store: Arc::clone(&self.store) }
    }
}

// === 数据库迁移兼容：从旧版内存模型迁移 ==========================

/// 内存→SQLite 迁移辅助（首次启动时检测旧格式 users.json 并导入）
fn migrate_from_json_if_needed(_store: &AuthStore) -> Result<(), String> {
    // 旧版 auth_commands.rs 使用 Vec<UserRecord> 内存存储
    // 本版本直接采用 SQLite，不再需要 JSON 迁移。
    // 如未来需要从 JSON 导入可在此扩展。
    Ok(())
}

// === Tauri 命令 ==================================================

/// 首次启动检测
#[tauri::command]
#[specta::specta]
pub fn auth_check_first_run(
    state: tauri::State<'_, AuthState>,
) -> bool {
    state.get_store()
        .map(|store| store.user_count() == 0)
        .unwrap_or(true)
}

/// 初始化认证系统
#[tauri::command]
#[specta::specta]
pub fn auth_init(
    state: tauri::State<'_, AuthState>,
) -> Result<(), String> {
    state.init()?;
    Ok(())
}

/// 注册用户
#[tauri::command]
#[specta::specta]
pub fn auth_register(
    req: RegisterRequest,
    state: tauri::State<'_, AuthState>,
) -> Result<UserInfo, String> {
    let store = state.get_store()?;
    store.register(req)
}

/// 用户登录
#[tauri::command]
#[specta::specta]
pub fn auth_login(
    username: String,
    password: String,
    state: tauri::State<'_, AuthState>,
) -> Result<AuthResult, String> {
    let store = state.get_store()?;
    store.login(&username, &password)
}

/// 用户登出
#[tauri::command]
#[specta::specta]
pub fn auth_logout(
    token: String,
    state: tauri::State<'_, AuthState>,
) -> Result<(), String> {
    let store = state.get_store()?;
    store.logout(&token)
}

/// 验证 token 并获取当前用户
#[tauri::command]
#[specta::specta]
pub fn auth_current_user(
    token: String,
    state: tauri::State<'_, AuthState>,
) -> Option<UserInfo> {
    state.get_store().ok()?.validate_and_get_user(&token)
}

/// 列出所有用户（Admin only）
#[tauri::command]
#[specta::specta]
pub fn auth_list_users(
    admin_token: String,
    state: tauri::State<'_, AuthState>,
) -> Result<Vec<UserInfo>, String> {
    let store = state.get_store()?;
    // RBAC 强制校验
    let user = store.validate_and_get_user(&admin_token)
        .ok_or_else(|| "未授权：token 无效或已过期".to_string())?;
    if user.role != UserRole::Admin {
        return Err("未授权：需要 Admin 角色".to_string());
    }
    Ok(store.list_users())
}

/// 删除用户（Admin only）—— RBAC 强制
#[tauri::command]
#[specta::specta]
pub fn auth_delete_user(
    user_id: String,
    admin_token: String,
    state: tauri::State<'_, AuthState>,
) -> Result<(), String> {
    let store = state.get_store()?;
    // RBAC 强制校验
    let user = store.validate_and_get_user(&admin_token)
        .ok_or_else(|| "未授权：token 无效或已过期".to_string())?;
    if user.role != UserRole::Admin {
        return Err("未授权：需要 Admin 角色".to_string());
    }
    // 防止删除自己
    if user.id == user_id {
        return Err("不能删除当前登录的用户".to_string());
    }
    store.delete_user(&user_id)
}

/// 设置用户 token 限额（Admin only）
#[tauri::command]
#[specta::specta]
pub fn auth_set_quota(
    user_id: String,
    token_quota: i64,
    admin_token: String,
    state: tauri::State<'_, AuthState>,
) -> Result<(), String> {
    let store = state.get_store()?;
    let user = store.validate_and_get_user(&admin_token)
        .ok_or_else(|| "未授权：token 无效或已过期".to_string())?;
    if user.role != UserRole::Admin {
        return Err("未授权：需要 Admin 角色".to_string());
    }
    store.set_user_quota(&user_id, token_quota)
}

/// 查询用户配额
#[tauri::command]
#[specta::specta]
pub fn auth_get_quota(
    user_id: String,
    admin_token: String,
    state: tauri::State<'_, AuthState>,
) -> Result<UserQuota, String> {
    let store = state.get_store()?;
    let user = store.validate_and_get_user(&admin_token)
        .ok_or_else(|| "未授权：token 无效或已过期".to_string())?;
    if user.role != UserRole::Admin {
        return Err("未授权：需要 Admin 角色".to_string());
    }
    store.check_quota(&user_id)
}

/// 查询自己的配额
#[tauri::command]
#[specta::specta]
pub fn auth_my_quota(
    token: String,
    state: tauri::State<'_, AuthState>,
) -> Result<UserQuota, String> {
    let store = state.get_store()?;
    let user = store.validate_and_get_user(&token)
        .ok_or_else(|| "未授权：token 无效或已过期".to_string())?;
    store.check_quota(&user.id)
}

// === SSO 认证 ==============================================

/// 生成 OIDC 授权 URL（PKCE）
#[tauri::command]
#[specta::specta]
pub fn auth_oidc_start(
    config: OidcConfigRequest,
    state: tauri::State<'_, AuthState>,
) -> Result<OidcAuthUrlResponse, String> {
    use rand::Rng;
    use sha2::{Sha256, Digest};

    // 1. 生成 PKCE code_verifier
    let mut rng = rand::thread_rng();
    let code_verifier: String = (0..64)
        .map(|_| {
            let idx = rng.gen_range(0..62);
            b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[idx] as char
        })
        .collect();

    // 2. 生成 code_challenge (S256)
    let mut hasher = Sha256::new();
    hasher.update(code_verifier.as_bytes());
    let code_challenge = base64::encode(&hasher.finalize())
        .replace('+', "-").replace('/', "_").replace('=', "");

    // 3. 生成 state
    let store = state.get_store()?;
    let state_val = store.create_oidc_state("oidc", &code_verifier)?;

    // 4. 构建授权 URL
    let scope = if config.scopes.is_empty() { "openid email profile".to_string() } else { config.scopes.clone() };
    let auth_url = format!(
        "{}/authorize?client_id={}&response_type=code&scope={}&redirect_uri={}&state={}&code_challenge={}&code_challenge_method=S256",
        config.issuer_url.trim_end_matches('/'),
        urlencoding::encode(&config.client_id),
        urlencoding::encode(&scope),
        urlencoding::encode(&config.redirect_uri),
        urlencoding::encode(&state_val),
        urlencoding::encode(&code_challenge),
    );

    Ok(OidcAuthUrlResponse {
        authorization_url: auth_url,
        state: state_val,
    })
}

/// OIDC 回调处理
#[tauri::command]
#[specta::specta]
pub fn auth_oidc_callback(
    state: String,
    code: String,
    config: OidcConfigRequest,
    tauri_state: tauri::State<'_, AuthState>,
) -> Result<AuthResult, String> {
    let store = tauri_state.get_store()?;

    // 1. 消费 state，获取 code_verifier
    let code_verifier = store.consume_oidc_state(&state)
        .ok_or_else(|| "State 无效或已过期".to_string())?;

    // 2. Token Exchange（调用 issuer 的 token endpoint）
    let token_response = exchange_oidc_token(
        &config.issuer_url,
        &config.client_id,
        &config.client_secret,
        &config.redirect_uri,
        &code,
        &code_verifier,
    ).map_err(|e| format!("OIDC Token Exchange 失败: {}", e))?;

    // 3. 解析 ID Token 获取用户身份
    let (subject, username, email) = parse_id_token(&token_response.id_token)
        .map_err(|e| format!("ID Token 解析失败: {}",e))?;

    // 4. 查找或创建用户
    let user_info = store.resolve_or_create_sso_user("oidc", &subject, &username, email.as_deref())?;

    // 5. 创建 session
    let token = store.create_session_for_user(&user_info.id)?;

    Ok(AuthResult { token, user: user_info })
}

/// OIDC Token Exchange（HTTP POST token endpoint）
fn exchange_oidc_token(
    issuer_url: &str,
    client_id: &str,
    client_secret: &str,
    redirect_uri: &str,
    code: &str,
    code_verifier: &str,
) -> Result<TokenResponse, String> {
    let client = reqwest::blocking::Client::new();
    let token_url = format!("{}/token", issuer_url.trim_end_matches('/'));

    let params = [
        ("grant_type", "authorization_code"),
        ("client_id", client_id),
        ("client_secret", client_secret),
        ("redirect_uri", redirect_uri),
        ("code", code),
        ("code_verifier", code_verifier),
    ];

    let resp = client.post(&token_url)
        .form(&params)
        .send()
        .map_err(|e| e.to_string())?;

    let token_resp: TokenResponse = resp.json()
        .map_err(|e| format!("JSON 解析失败: {}",e))?;

    Ok(token_resp)
}

#[derive(Debug, serde::Deserialize)]
struct TokenResponse {
    access_token: String,
    id_token: String,
    token_type: String,
    #[serde(default)]
    refresh_token: Option<String>,
    #[serde(default)]
    expires_in: Option<u64>,
}

/// 解析 ID Token（简化版：base64 decode payload 段）
fn parse_id_token(id_token: &str) -> Result<(String, String, Option<String>), String> {
    let parts: Vec<&str> = id_token.split('.').collect();
    if parts.len() != 3 {
        return Err("ID Token 格式错误".to_string());
    }

    // base64url decode payload
    let payload_b64 = parts[1].replace('-', "+").replace('_', "/");
    let padded = match payload_b64.len() % 4 {
        0 => payload_b64,
        n => format!("{}{}", payload_b64, "=".repeat(4 - n)),
    };
    let payload_bytes = base64::decode(&padded)
        .map_err(|e| format!("Base64 解码失败: {}",e))?;
    let claims: serde_json::Value = serde_json::from_slice(&payload_bytes)
        .map_err(|_| "ID Token JSON 解析失败".to_string())?;

    let subject = claims["sub"].as_str().unwrap_or("").to_string();
    let username = claims["preferred_username"].as_str()
        .or_else(|| claims["name"].as_str())
        .or_else(|| claims["email"].as_str())
        .unwrap_or("oidc_user")
        .to_string();
    let email = claims["email"].as_str().map(|s| s.to_string());

    Ok((subject, username, email))
}

/// 飞书 OAuth 登录入口（生成授权 URL）
#[tauri::command]
#[specta::specta]
pub fn auth_feishu_start(
    app_id: String,
    redirect_uri: String,
    state: tauri::State<'_, AuthState>,
) -> Result<OidcAuthUrlResponse, String> {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    let state_val: String = (0..32).map(|_| format!("{:02x}", rng.gen::<u8>())).collect();

    let store = state.get_store()?;
    store.create_oidc_state("feishu", &state_val)?;

    let auth_url = format!(
        "https://open.feishu.cn/open-apis/authen/v1/authorize?app_id={}&redirect_uri={}&state={}",
        urlencoding::encode(&app_id),
        urlencoding::encode(&redirect_uri),
        urlencoding::encode(&state_val),
    );

    Ok(OidcAuthUrlResponse { authorization_url: auth_url, state: state_val })
}

/// 飞书 OAuth 回调处理
#[tauri::command]
#[specta::specta]
pub fn auth_feishu_callback(
    code: String,
    state: String,
    app_id: String,
    app_secret: String,
    tauri_state: tauri::State<'_, AuthState>,
) -> Result<AuthResult, String> {
    let store = tauri_state.get_store()?;

    // 消费 state
    store.consume_oidc_state(&state)
        .ok_or_else(|| "State 无效或已过期".to_string())?;

    // 1. 获取 tenant_access_token
    let tenant_token = feishu_get_tenant_access_token(&app_id, &app_secret)?;

    // 2. 获取用户信息
    let (open_id, username, email) = feishu_get_user_info(&tenant_token, &code)?;

    // 3. 查找或创建用户
    let user_info = store.resolve_or_create_sso_user("feishu", &open_id, &username, email.as_deref())?;

    // 4. 创建 session
    let token = store.create_session_for_user(&user_info.id)?;

    Ok(AuthResult { token, user: user_info })
}

/// 飞书获取 tenant_access_token
fn feishu_get_tenant_access_token(app_id: &str, app_secret: &str) -> Result<String, String> {
    let client = reqwest::blocking::Client::new();
    let resp = client.post("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal")
        .json(&serde_json::json!({ "app_id": app_id, "app_secret": app_secret }))
        .send()
        .map_err(|e| e.to_string())?;
    let json: serde_json::Value = resp.json().map_err(|e| e.to_string())?;
    json["tenant_access_token"].as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| format!("飞书 API 错误: code={}", json["code"]))
}

/// 飞书获取用户信息
fn feishu_get_user_info(tenant_token: &str, code: &str) -> Result<(String, String, Option<String>), String> {
    let client = reqwest::blocking::Client::new();
    let resp = client.post("https://open.feishu.cn/open-apis/authen/v1/access_token")
        .header("Authorization", format!("Bearer {}", tenant_token))
        .json(&serde_json::json!({ "grant_type": "authorization_code", "code": code }))
        .send()
        .map_err(|e| e.to_string())?;
    let json: serde_json::Value = resp.json().map_err(|e| e.to_string())?;

    let data = &json["data"];
    let open_id = data["open_id"].as_str().unwrap_or("").to_string();
    let name = data["name"].as_str().unwrap_or("feishu_user").to_string();
    let email = data["email"].as_str().map(|s| s.to_string());

    Ok((open_id, name, email))
}

/// 消费 token（Agent 运行时调用）
#[tauri::command]
#[specta::specta]
pub fn auth_consume_tokens(
    token: String,
    tokens: i64,
    state: tauri::State<'_, AuthState>,
) -> Result<(), String> {
    let store = state.get_store()?;
    let user = store.validate_and_get_user(&token)
        .ok_or("未授权")?;

    // 检查限额
    let quota = store.check_quota(&user.id)?;
    if quota.token_quota > 0 && quota.token_used + tokens > quota.token_quota {
        return Err(format!(
            "Token 限额已超：已使用 {}/{}",
            quota.token_used, quota.token_quota
        ));
    }

    store.consume_tokens(&user.id, tokens)
}
