//! # OS Keyring 凭证存储命令模块 (P0-2)
//!
//! 通过 `keyring` crate 接入操作系统原生凭证存储：
//! - macOS → Keychain
//! - Windows → Credential Manager
//! - Linux → Secret Service (libsecret / gnome-keyring)
//!
//! ## 命令清单
//!
//! | 命令 | 说明 |
//! |------|------|
//! | `credential_store_set` | 将 API Key 写入 OS Keyring |
//! | `credential_store_get` | 从 OS Keyring 读取 API Key |
//! | `credential_store_delete` | 从 OS Keyring 删除 API Key |
//! | `credential_store_exists` | 检查凭证是否存在 |
//!
//! ## 安全设计
//!
//! - 凭证以 `ydsz-buddy:{ref}` 为 service name 存入 OS 原生 Keyring
//! - 明文 API Key **不**经过 localStorage / sessionStorage
//! - 后端 `SecretStore`（AES-256-GCM）作为 fallback，此模块为额外的 OS 级保护
//! - 非 Tauri 环境（纯浏览器）自动降级到 `credentialVault` 的 session/local-obfuscated 模式

use tracing::{debug, info, warn};

/// Keyring service name 前缀
const SERVICE_NAME: &str = "ydsz-buddy";

/// 将凭证写入 OS Keyring
#[tauri::command]
#[specta::specta]
pub async fn credential_store_set(
    key_ref: String,
    value: String,
) -> Result<(), String> {
    info!(ref = %key_ref, "写入 OS Keyring 凭证");
    let entry = keyring::Entry::new(SERVICE_NAME, &key_ref)
        .map_err(|e| format!("创建 keyring entry 失败: {}", e))?;
    entry.set_password(&value)
        .map_err(|e| format!("写入 keyring 失败: {}", e))?;
    debug!(ref = %key_ref, "凭证已写入 OS Keyring");
    Ok(())
}

/// 从 OS Keyring 读取凭证
#[tauri::command]
#[specta::specta]
pub async fn credential_store_get(
    key_ref: String,
) -> Result<Option<String>, String> {
    debug!(ref = %key_ref, "读取 OS Keyring 凭证");
    let entry = keyring::Entry::new(SERVICE_NAME, &key_ref)
        .map_err(|e| format!("创建 keyring entry 失败: {}", e))?;
    match entry.get_password() {
        Ok(password) => {
            debug!(ref = %key_ref, "凭证读取成功");
            Ok(Some(password))
        }
        Err(keyring::Error::NoEntry) => {
            debug!(ref = %key_ref, "凭证不存在");
            Ok(None)
        }
        Err(e) => {
            warn!(ref = %key_ref, error = %e, "读取 keyring 失败");
            Err(format!("读取 keyring 失败: {}", e))
        }
    }
}

/// 从 OS Keyring 删除凭证
#[tauri::command]
#[specta::specta]
pub async fn credential_store_delete(
    key_ref: String,
) -> Result<(), String> {
    info!(ref = %key_ref, "删除 OS Keyring 凭证");
    let entry = keyring::Entry::new(SERVICE_NAME, &key_ref)
        .map_err(|e| format!("创建 keyring entry 失败: {}", e))?;
    match entry.delete_credential() {
        Ok(()) => {
            debug!(ref = %key_ref, "凭证已删除");
            Ok(())
        }
        Err(keyring::Error::NoEntry) => {
            // 不存在也算成功
            debug!(ref = %key_ref, "凭证不存在，跳过删除");
            Ok(())
        }
        Err(e) => {
            warn!(ref = %key_ref, error = %e, "删除 keyring 失败");
            Err(format!("删除 keyring 失败: {}", e))
        }
    }
}

/// 检查凭证是否存在
#[tauri::command]
#[specta::specta]
pub async fn credential_store_exists(
    key_ref: String,
) -> Result<bool, String> {
    debug!(ref = %key_ref, "检查 OS Keyring 凭证是否存在");
    let entry = keyring::Entry::new(SERVICE_NAME, &key_ref)
        .map_err(|e| format!("创建 keyring entry 失败: {}", e))?;
    match entry.get_password() {
        Ok(_) => Ok(true),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(e) => {
            warn!(ref = %key_ref, error = %e, "检查 keyring 失败");
            Ok(false)
        }
    }
}
