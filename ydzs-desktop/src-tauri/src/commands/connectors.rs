//! # 开发者专属 Connector 连接器
//!
//! 连接第三方开发者工具：Jira/Linear、GitHub Issues、Sentry、Grafana、Webhook。
//! 对标 Octop 的 Connectors/Agently/QCC 连接器体系 — 但专注开发者场景。
//!
//! 当前为骨架实现，提供完整的类型定义和 UI 展示。
//! 未来各连接器的实际调用逻辑可按需填充。

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

/// 连接测试结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectorTestResult {
    pub success: bool,
    pub message: String,
    pub latency_ms: Option<u64>,
}

/// 已注册的连接器实例
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectorInstance {
    pub id: String,
    pub conn_type: String,
    pub display_name: String,
    pub status: String,          // "connected" | "disconnected" | "error"
    pub connected_at: Option<String>,
}

/// 连接器注册表（内存存根）
#[derive(Debug, Clone)]
pub struct ConnectorsState {
    instances: std::sync::Arc<std::sync::Mutex<HashMap<String, ConnectorInstance>>>,
}

impl ConnectorsState {
    pub fn new() -> Self {
        Self {
            instances: std::sync::Arc::new(std::sync::Mutex::new(HashMap::new())),
        }
    }
}

impl Default for ConnectorsState {
    fn default() -> Self {
        Self::new()
    }
}

// ===== 内置连接器定义 =====

fn get_available_connectors() -> Vec<ConnectorInfo> {
    vec![
        ConnectorInfo {
            conn_type: "jira".into(),
            display_name: "Jira / Linear".into(),
            description: "任务工单联动，Agent 可创建/更新工单".into(),
            icon_bg: "#0052CC".into(),
            auth_type: "api_key".into(),
            config_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "baseUrl": { "type": "string", "description": "Jira base URL" },
                    "apiToken": { "type": "string", "description": "API Token" },
                    "projectKey": { "type": "string", "description": "项目 Key" }
                },
                "required": ["baseUrl", "apiToken", "projectKey"]
            }),
        },
        ConnectorInfo {
            conn_type: "github_issues".into(),
            display_name: "GitHub Issues".into(),
            description: "Issue↔修复闭环：Agent 收到 Issue → 自动生成 PR → 更新 Issue 状态".into(),
            icon_bg: "#24292e".into(),
            auth_type: "token".into(),
            config_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "token": { "type": "string", "description": "GitHub Personal Access Token" },
                    "repo": { "type": "string", "description": "仓库 (owner/repo)" }
                },
                "required": ["token", "repo"]
            }),
        },
        ConnectorInfo {
            conn_type: "sentry".into(),
            display_name: "Sentry 告警".into(),
            description: "告警→Agent 自动分析根因→创建修复 PR".into(),
            icon_bg: "#362d59".into(),
            auth_type: "token".into(),
            config_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "org": { "type": "string", "description": "组织 slug" },
                    "token": { "type": "string", "description": "Auth Token" },
                    "webhookSecret": { "type": "string", "description": "Webhook Secret" }
                },
                "required": ["org", "token"]
            }),
        },
        ConnectorInfo {
            conn_type: "grafana".into(),
            display_name: "Grafana 看板".into(),
            description: "看板截图→Agent 解读异常→推动处置".into(),
            icon_bg: "#F46800".into(),
            auth_type: "api_key".into(),
            config_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "baseUrl": { "type": "string", "description": "Grafana URL" },
                    "apiKey": { "type": "string", "description": "API Key" },
                    "dashboardUid": { "type": "string", "description": "看板 UID" }
                },
                "required": ["baseUrl", "apiKey"]
            }),
        },
        ConnectorInfo {
            conn_type: "webhook".into(),
            display_name: "通用 Webhook".into(),
            description: "接收外部 Webhook 事件，触发 Agent 响应".into(),
            icon_bg: "#6366f1".into(),
            auth_type: "basic".into(),
            config_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "endpoint": { "type": "string", "description": "Webhook endpoint path" },
                    "secret": { "type": "string", "description": "签名密钥" }
                },
                "required": ["endpoint"]
            }),
        },
    ]
}

// ===== Tauri 命令 =====

/// 列出可用连接器类型（静态定义 + 动态注册）
#[tauri::command]
#[specta::specta]
pub async fn connector_list() -> Result<Vec<ConnectorInfo>, String> {
    Ok(get_available_connectors())
}

/// 列出已注册的连接器实例
#[tauri::command]
#[specta::specta]
pub async fn connector_list_instances(
    state: State<'_, ConnectorsState>,
) -> Result<Vec<ConnectorInstance>, String> {
    let instances = state.instances.lock().unwrap();
    Ok(instances.values().cloned().collect())
}

/// 测试连接器连接（真实 HTTP 调用）
#[tauri::command]
#[specta::specta]
pub async fn connector_test_connection(
    _state: State<'_, ServerState>,
    conn_type: String,
    config: Value,
) -> Result<ConnectorTestResult, String> {
    info!(conn_type = %conn_type, "Connector: 测试连接");

    // 构建真实连接器实例并执行 HTTP 测试
    let connector = crate::connectors::build_connector(&conn_type, config)
        .map_err(|e| format!("构建连接器失败: {e}"))?;

    let result = connector.test_connection().await;
    Ok(ConnectorTestResult {
        success: result.success,
        message: result.message,
        latency_ms: result.latency_ms,
    })
}

/// 获取连接器的默认配置模板
#[tauri::command]
#[specta::specta]
pub async fn connector_get_default_config(
    conn_type: String,
) -> Result<Value, String> {
    let connectors = get_available_connectors();
    connectors
        .into_iter()
        .find(|c| c.conn_type == conn_type)
        .map(|c| c.config_schema)
        .ok_or(format!("不存在的连接器类型: {}", conn_type))
}

/// 注册/激活一个新的连接器实例
#[tauri::command]
#[specta::specta]
pub async fn connector_register(
    state: State<'_, ConnectorsState>,
    conn_type: String,
    display_name: String,
    _config: Value,
) -> Result<ConnectorInstance, String> {
    info!(conn_type = %conn_type, "Connector: 注册");

    let instance = ConnectorInstance {
        id: uuid::Uuid::new_v4().to_string(),
        conn_type,
        display_name,
        status: "connected".into(),
        connected_at: Some(chrono::Utc::now().to_rfc3339()),
    };

    state.instances.lock().unwrap().insert(instance.id.clone(), instance.clone());
    Ok(instance)
}

/// 注销连接器实例
#[tauri::command]
#[specta::specta]
pub async fn connector_unregister(
    state: State<'_, ConnectorsState>,
    id: String,
) -> Result<bool, String> {
    info!(id = %id, "Connector: 注销");
    Ok(state.instances.lock().unwrap().remove(&id).is_some())
}
