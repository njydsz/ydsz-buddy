//! # Connector 预置实例 Tauri 命令（G16-P1）
//!
//! 列出、连接、调用、断开预置连接器实例。
//! 支持 GitHub、Notion、Slack 三种预置连接器。

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;
use tracing::info;

use crate::commands::connectors::presets::github::{
    CreateIssueRequest, GitHubConfig, GitHubConnector,
};
use crate::commands::connectors::presets::notion::{
    CreatePageRequest, NotionConfig, NotionConnector,
};
use crate::commands::connectors::presets::slack::{
    SendMessageRequest, SlackConfig, SlackConnector,
};

// ===== 类型定义 =====

/// 预置连接器展示信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectorPresetInfo {
    pub id: String,
    pub display_name: String,
    pub description: String,
    pub auth_type: String,
    pub config_schema: Value,
    pub available_actions: Vec<String>,
}

/// 预置连接器注册表
pub struct ConnectorPresetsState {
    github_instances: Arc<Mutex<HashMap<String, GitHubConnector>>>,
    notion_instances: Arc<Mutex<HashMap<String, NotionConnector>>>,
    slack_instances: Arc<Mutex<HashMap<String, SlackConnector>>>,
}

impl ConnectorPresetsState {
    pub fn new() -> Self {
        Self {
            github_instances: Arc::new(Mutex::new(HashMap::new())),
            notion_instances: Arc::new(Mutex::new(HashMap::new())),
            slack_instances: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

impl Default for ConnectorPresetsState {
    fn default() -> Self {
        Self::new()
    }
}

// ===== 预置定义 =====

/// 列出所有可用的预置连接器信息
fn get_preset_infos() -> Vec<ConnectorPresetInfo> {
    vec![
        ConnectorPresetInfo {
            id: "github".to_string(),
            display_name: "GitHub".to_string(),
            description: "连接 GitHub API，获取仓库/issue/PR 信息，创建工单".to_string(),
            auth_type: "token".to_string(),
            config_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "token": { "type": "string", "description": "GitHub Personal Access Token" },
                    "owner": { "type": "string", "description": "用户名或组织名（可选）" }
                },
                "required": ["token"]
            }),
            available_actions: vec![
                "fetch_repos".to_string(),
                "fetch_issues".to_string(),
                "fetch_prs".to_string(),
                "create_issue".to_string(),
            ],
        },
        ConnectorPresetInfo {
            id: "notion".to_string(),
            display_name: "Notion".to_string(),
            description: "连接 Notion API，读写页面/数据库".to_string(),
            auth_type: "token".to_string(),
            config_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "token": { "type": "string", "description": "Internal Integration Token (secret_xxx)" },
                    "apiVersion": { "type": "string", "description": "API 版本", "default": "2022-06-28" }
                },
                "required": ["token"]
            }),
            available_actions: vec![
                "search_pages".to_string(),
                "read_page".to_string(),
                "create_page".to_string(),
            ],
        },
        ConnectorPresetInfo {
            id: "slack".to_string(),
            display_name: "Slack".to_string(),
            description: "连接 Slack API，读写消息".to_string(),
            auth_type: "token".to_string(),
            config_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "token": { "type": "string", "description": "Bot Token (xoxb-xxx)" }
                },
                "required": ["token"]
            }),
            available_actions: vec![
                "list_channels".to_string(),
                "send_message".to_string(),
                "read_history".to_string(),
            ],
        },
    ]
}

// ===== Tauri 命令 =====

/// 列出所有可用预置连接器
#[tauri::command]
#[specta::specta]
pub async fn connector_presets_list() -> Result<Vec<ConnectorPresetInfo>, String> {
    Ok(get_preset_infos())
}

/// 连接到指定预置服务
#[tauri::command]
#[specta::specta]
pub async fn connector_presets_connect(
    state: State<'_, ConnectorPresetsState>,
    connector_id: String,
    config: Value,
) -> Result<String, String> {
    info!(connector_id = %connector_id, "Connector Preset: 连接");

    let instance_id = uuid::Uuid::new_v4().to_string();

    match connector_id.as_str() {
        "github" => {
            let gh_config: GitHubConfig = serde_json::from_value(config)
                .map_err(|e| format!("配置参数错误: {}", e))?;
            let connector = GitHubConnector::new(gh_config)?;
            state
                .github_instances
                .lock()
                .unwrap()
                .insert(instance_id.clone(), connector);
        }
        "notion" => {
            let notion_config: NotionConfig = serde_json::from_value(config)
                .map_err(|e| format!("配置参数错误: {}", e))?;
            let connector = NotionConnector::new(notion_config)?;
            state
                .notion_instances
                .lock()
                .unwrap()
                .insert(instance_id.clone(), connector);
        }
        "slack" => {
            let slack_config: SlackConfig = serde_json::from_value(config)
                .map_err(|e| format!("配置参数错误: {}", e))?;
            let connector = SlackConnector::new(slack_config)?;
            state
                .slack_instances
                .lock()
                .unwrap()
                .insert(instance_id.clone(), connector);
        }
        _ => return Err(format!("不支持的连接器类型: {}", connector_id)),
    }

    info!(instance_id = %instance_id, "Connector Preset: 连接成功");
    Ok(instance_id)
}

/// 调用预置连接器功能
#[tauri::command]
#[specta::specta]
pub async fn connector_presets_call(
    state: State<'_, ConnectorPresetsState>,
    connector_id: String,
    action: String,
    params: Value,
) -> Result<Value, String> {
    info!(
        connector_id = %connector_id,
        action = %action,
        "Connector Preset: 调用"
    );

    match connector_id.as_str() {
        "github" => call_github(&state, &action, &params).await,
        "notion" => call_notion(&state, &action, &params).await,
        "slack" => call_slack(&state, &action, &params).await,
        _ => Err(format!("不支持的连接器类型: {}", connector_id)),
    }
}

async fn call_github(
    state: &State<'_, ConnectorPresetsState>,
    action: &str,
    params: &Value,
) -> Result<Value, String> {
    // 使用第一个可用的 GitHub 实例
    let connector = {
        let instances = state.github_instances.lock().unwrap();
        instances.values().next().cloned()
    };

    let connector = connector.ok_or("没有已连接的 GitHub 实例，请先调用 connect")?;

    match action {
        "fetch_repos" => {
            let repos = connector.fetch_repos().await?;
            serde_json::to_value(&repos).map_err(|e| e.to_string())
        }
        "fetch_issues" => {
            let repo = params
                .get("repo")
                .and_then(|v| v.as_str())
                .ok_or("缺少 repo 参数")?;
            let issues = connector.fetch_issues(repo).await?;
            serde_json::to_value(&issues).map_err(|e| e.to_string())
        }
        "fetch_prs" => {
            let repo = params
                .get("repo")
                .and_then(|v| v.as_str())
                .ok_or("缺少 repo 参数")?;
            let prs = connector.fetch_prs(repo).await?;
            serde_json::to_value(&prs).map_err(|e| e.to_string())
        }
        "create_issue" => {
            let repo = params
                .get("repo")
                .and_then(|v| v.as_str())
                .ok_or("缺少 repo 参数")?;
            let req: CreateIssueRequest = serde_json::from_value(params.clone())
                .map_err(|e| format!("解析 createIssue 参数失败: {}", e))?;
            let issue = connector.create_issue(repo, req).await?;
            serde_json::to_value(&issue).map_err(|e| e.to_string())
        }
        _ => Err(format!("GitHub 不支持的动作: {}", action)),
    }
}

async fn call_notion(
    state: &State<'_, ConnectorPresetsState>,
    action: &str,
    params: &Value,
) -> Result<Value, String> {
    let connector = {
        let instances = state.notion_instances.lock().unwrap();
        instances.values().next().cloned()
    };

    let connector = connector.ok_or("没有已连接的 Notion 实例，请先调用 connect")?;

    match action {
        "search_pages" => {
            let query = params
                .get("query")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let pages = connector.search_pages(query).await?;
            serde_json::to_value(&pages).map_err(|e| e.to_string())
        }
        "read_page" => {
            let page_id = params
                .get("pageId")
                .and_then(|v| v.as_str())
                .ok_or("缺少 pageId 参数")?;
            let page = connector.read_page(page_id).await?;
            serde_json::to_value(&page).map_err(|e| e.to_string())
        }
        "create_page" => {
            let req: CreatePageRequest = serde_json::from_value(params.clone())
                .map_err(|e| format!("解析 createPage 参数失败: {}", e))?;
            let page = connector.create_page(req).await?;
            serde_json::to_value(&page).map_err(|e| e.to_string())
        }
        _ => Err(format!("Notion 不支持的动作: {}", action)),
    }
}

async fn call_slack(
    state: &State<'_, ConnectorPresetsState>,
    action: &str,
    params: &Value,
) -> Result<Value, String> {
    let connector = {
        let instances = state.slack_instances.lock().unwrap();
        instances.values().next().cloned()
    };

    let connector = connector.ok_or("没有已连接的 Slack 实例，请先调用 connect")?;

    match action {
        "list_channels" => {
            let channels = connector.list_channels().await?;
            serde_json::to_value(&channels).map_err(|e| e.to_string())
        }
        "send_message" => {
            let req: SendMessageRequest = serde_json::from_value(params.clone())
                .map_err(|e| format!("解析 sendMessage 参数失败: {}", e))?;
            let msg = connector.send_message(req).await?;
            serde_json::to_value(&msg).map_err(|e| e.to_string())
        }
        "read_history" => {
            let channel = params
                .get("channel")
                .and_then(|v| v.as_str())
                .ok_or("缺少 channel 参数")?;
            let limit = params
                .get("limit")
                .and_then(|v| v.as_u64())
                .unwrap_or(20) as u32;
            let history = connector.read_history(channel, limit).await?;
            serde_json::to_value(&history).map_err(|e| e.to_string())
        }
        _ => Err(format!("Slack 不支持的动作: {}", action)),
    }
}

/// 断开预置连接器
#[tauri::command]
#[specta::specta]
pub async fn connector_presets_disconnect(
    state: State<'_, ConnectorPresetsState>,
    connector_id: String,
) -> Result<(), String> {
    info!(connector_id = %connector_id, "Connector Preset: 断开");

    match connector_id.as_str() {
        "github" => state.github_instances.lock().unwrap().clear(),
        "notion" => state.notion_instances.lock().unwrap().clear(),
        "slack" => state.slack_instances.lock().unwrap().clear(),
        _ => return Err(format!("不支持的连接器类型: {}", connector_id)),
    };
    Ok(())
}
