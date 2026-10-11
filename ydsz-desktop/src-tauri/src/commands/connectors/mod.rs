//! # 开发者专属 Connector 连接器
//!
//! 连接第三方开发者工具：Jira/Linear、GitHub Issues、Sentry、Grafana、Webhook。
//! 对标 Octop 的 Connectors/Agently/QCC 连接器体系 — 但专注开发者场景。
//!
//! 当前为骨架实现，提供完整的类型定义和 UI 展示。
//! 未来各连接器的实际调用逻辑可按需填充。

pub mod presets;

use tauri::State;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use tracing::info;

use ydsz_core::commands::OrchestrationCommand;
use crate::ServerState;

// ===== 类型 =====

/// 连接器元信息（展示在 UI）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectorInfo {
    pub conn_type: String,
    pub display_name: String,
    pub description: String,
    pub icon_bg: String,
    pub auth_type: String,       // "api_key" | "oauth" | "basic" | "token"
    pub config_schema: Value,    // JSON Schema for connector config
}

/// 全局连接器注册表（桌面端持有各通道 handle 引用）
/// 当前为占位实现；实际通道句柄存入对应子模块状态
#[derive(Debug, Default)]
pub struct ConnectorsState;

impl ConnectorsState {
    pub fn new() -> Self {
        Self
    }
}

// ===== Tauri Commands（stub 实现）=====

#[tauri::command]
#[specta::specta]
pub fn connector_list() -> Result<Vec<ConnectorInfo>, String> {
    Ok(vec![])
}

#[tauri::command]
#[specta::specta]
pub fn connector_list_instances() -> Result<Vec<serde_json::Value>, String> {
    Ok(vec![])
}

#[tauri::command]
#[specta::specta]
pub fn connector_test_connection(conn_type: String) -> Result<bool, String> {
    let _ = conn_type;
    Err("not implemented".to_string())
}

#[tauri::command]
#[specta::specta]
pub fn connector_get_default_config(conn_type: String) -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({ "type": conn_type }))
}

#[tauri::command]
#[specta::specta]
pub fn connector_register(conn_type: String, _config: serde_json::Value) -> Result<String, String> {
    let _ = conn_type;
    Err("not implemented".to_string())
}

#[tauri::command]
#[specta::specta]
pub fn connector_unregister(instance_id: String) -> Result<(), String> {
    let _ = instance_id;
    Err("not implemented".to_string())
}
