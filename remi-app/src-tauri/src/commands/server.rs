//! # 服务器相关命令模块
//!
//! 本模块提供与服务器配置、环境、设置等相关的 Tauri 命令。

use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::State;

/// 服务器状态管理器
pub struct ServerState {
    config: Arc<Mutex<serde_json::Value>>,
    environment: Arc<Mutex<serde_json::Value>>,
    settings: Arc<Mutex<serde_json::Value>>,
}

impl ServerState {
    pub fn new() -> Self {
        Self {
            config: Arc::new(Mutex::new(serde_json::json!({}))),
            environment: Arc::new(Mutex::new(serde_json::json!({
                "platform": std::env::consts::OS,
                "arch": std::env::consts::ARCH,
            }))),
            settings: Arc::new(Mutex::new(serde_json::json!({}))),
        }
    }
}

#[tauri::command]
pub async fn server_get_config(
    state: State<'_, ServerState>,
) -> Result<serde_json::Value, String> {
    let config = state.config.lock().map_err(|e| e.to_string())?;
    Ok(config.clone())
}

#[tauri::command]
pub async fn server_get_environment(
    state: State<'_, ServerState>,
) -> Result<serde_json::Value, String> {
    let env = state.environment.lock().map_err(|e| e.to_string())?;
    Ok(env.clone())
}

#[tauri::command]
pub async fn server_get_settings(
    state: State<'_, ServerState>,
) -> Result<serde_json::Value, String> {
    let settings = state.settings.lock().map_err(|e| e.to_string())?;
    Ok(settings.clone())
}

#[tauri::command]
pub async fn server_update_settings(
    state: State<'_, ServerState>,
    settings: serde_json::Value,
) -> Result<(), String> {
    let mut current = state.settings.lock().map_err(|e| e.to_string())?;
    *current = settings;
    Ok(())
}

#[tauri::command]
pub async fn server_refresh_providers() -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub async fn server_update_provider(
    provider: serde_json::Value,
) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub async fn server_list_worktrees() -> Result<Vec<serde_json::Value>, String> {
    Ok(vec![])
}

#[tauri::command]
pub async fn server_get_provider_usage_snapshot() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({}))
}

#[tauri::command]
pub async fn server_get_diagnostics() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({}))
}

#[tauri::command]
pub async fn server_upsert_keybinding(
    keybinding: serde_json::Value,
) -> Result<(), String> {
    Ok(())
}
