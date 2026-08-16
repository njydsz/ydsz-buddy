//! # MCP 集成命令模块
//!
//! 提供与 Model Context Protocol 相关的 Tauri 命令，支持添加/编辑/删除/测试
//! MCP 服务器配置，以及列出已启用的服务器。
//!
//! ## 命令清单
//!
//! | 命令 | 说明 |
//! |------|------|
//! | `mcp_list_servers` | 列出工作区下所有已配置的 MCP 服务器 |
//! | `mcp_add_server` | 添加 MCP 服务器配置 |
//! | `mcp_update_server` | 更新 MCP 服务器配置 |
//! | `mcp_remove_server` | 删除 MCP 服务器配置 |
//! | `mcp_test_connection` | 测试 MCP 服务器连接（spawn 进程 → initialize → 拉取 tools） |
//! | `mcp_list_presets` | 列出内置 MCP 预设模板（filesystem/fetch/memory/github） |
//! | `mcp_list_tools` | 列出某服务器下所有可用工具（含 input_schema） |
//! | `mcp_call_tool` | 调用 MCP 工具(P1-2 新增,打通 AI → MCP 执行链) |
//!
//! ## 状态管理
//!
//! MCP 状态由工作区根目录下的 `.ydsz/mcp.json` 持久化（参考 [ydsz_code::mcp::config::McpStore]）。
//! 已启动的活跃客户端缓存在 [McpState] 中（按 server_id 索引），通过 Mutex 保证线程安全。
//! 应用重启后清空，下次使用时按需重新启动。
//!
//! ## P1-2 修复
//!
//! - **McpState 注入 Tauri runtime**(此前缺失导致 `mcp_test_connection` / `mcp_list_tools` 运行时失败)
//! - **新增 `mcp_call_tool` 命令**(此前 AI 只能列出工具,无法实际调用)

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::State;
use tracing::{info, warn};

use ydsz_code::mcp::{
    builtin_presets, McpClient, McpContent, McpError, McpServerConfig, McpServerPreset,
    McpServerStatus, McpStore, McpTool, McpToolCallResult, McpTransportType,
};

// 库级 McpState（含 reconnect/health_check 能力）
pub use ydsz_code::mcp::state::McpState;

// 列出工作区下所有 MCP 服务器配置
///
/// # 参数
///
/// - `workspace_root`: 工作区根目录路径
///
/// # 返回值
///
/// 配置文件中的所有服务器（含状态、最后连接时间等运行时字段）
#[tauri::command]
#[specta::specta]
pub async fn mcp_list_servers(workspace_root: String) -> Result<Vec<McpServerConfig>, String> {
    let path = PathBuf::from(&workspace_root);
    let store = McpStore::load_or_init(&path).map_err(|e| e.to_string())?;
    Ok(store.servers)
}

/// 添加 MCP 服务器配置
#[tauri::command]
#[specta::specta]
pub async fn mcp_add_server(workspace_root: String, config: McpServerConfig) -> Result<(), String> {
    let path = PathBuf::from(&workspace_root);
    let mut store = McpStore::load_or_init(&path).map_err(|e| e.to_string())?;
    if store.find(&config.id).is_some() {
        return Err(format!("MCP 服务器已存在: {}", config.id));
    }
    store.upsert(config);
    store.save(&path).map_err(|e| e.to_string())?;
    Ok(())
}

/// 更新 MCP 服务器配置
#[tauri::command]
#[specta::specta]
pub async fn mcp_update_server(workspace_root: String, config: McpServerConfig) -> Result<(), String> {
    let path = PathBuf::from(&workspace_root);
    let mut store = McpStore::load_or_init(&path).map_err(|e| e.to_string())?;
    if store.find(&config.id).is_none() {
        return Err(format!("MCP 服务器不存在: {}", config.id));
    }
    store.upsert(config);
    store.save(&path).map_err(|e| e.to_string())?;
    Ok(())
}

/// 删除 MCP 服务器配置
#[tauri::command]
#[specta::specta]
pub async fn mcp_remove_server(workspace_root: String, server_id: String) -> Result<(), String> {
    let path = PathBuf::from(&workspace_root);
    let mut store = McpStore::load_or_init(&path).map_err(|e| e.to_string())?;
    store.remove(&server_id).map_err(|e| e.to_string())?;
    store.save(&path).map_err(|e| e.to_string())?;
    Ok(())
}

/// 测试 MCP 服务器连接
///
/// 启动配置的进程并完成 MCP 握手（initialize + tools/list），成功后将客户端
/// 缓存到 [McpState] 供后续调用。失败时返回详细错误。
#[tauri::command]
#[specta::specta]
pub async fn mcp_test_connection(
    state: State<'_, McpState>,
    workspace_root: String,
    server_id: String,
) -> Result<McpTestResult, String> {
    info!(server_id = %server_id, "MCP 连接测试");
    let path = PathBuf::from(&workspace_root);
    let mut store = McpStore::load_or_init(&path).map_err(|e| e.to_string())?;
    let config = store
        .find(&server_id)
        .cloned()
        .ok_or_else(|| format!("MCP 服务器不存在: {server_id}"))?;
    if !config.enabled {
        return Err(McpError::ServerDisabled(config.id.clone()).to_string());
    }

    // 启动客户端（根据 transport_type 自动选择 stdio / SSE）
    let client = match McpClient::start_from_config(&config).await {
        Ok(c) => c,
        Err(e) => {
            update_status(&mut store, &server_id, McpServerStatus::Error, Some(e.to_string()));
            store.save(&path).map_err(|err| err.to_string())?;
            return Err(e.to_string());
        }
    };
    let info = client.info().unwrap_or_else(|| ydsz_code::mcp::McpServerInfo {
        name: "unknown".into(),
        version: "0.0.0".into(),
        protocol_version: "unknown".into(),
        tools: Vec::new(),
    });
    let tools = info.tools.clone();
    let tool_names: Vec<String> = tools.iter().map(|t| t.name.clone()).collect();

    // 缓存客户端
    let arc_client = Arc::new(client);
    state.insert(server_id.clone(), arc_client.clone()).await;

    // 更新状态到 Connected
    update_status(
        &mut store,
        &server_id,
        McpServerStatus::Connected,
        None,
    );
    store.save(&path).map_err(|e| e.to_string())?;

    Ok(McpTestResult {
        server_name: info.name,
        server_version: info.version,
        protocol_version: info.protocol_version,
        tool_count: tools.len(),
        tool_names,
    })
}

/// 列出所有内置 MCP 预设模板
#[tauri::command]
#[specta::specta]
pub async fn mcp_list_presets() -> Result<Vec<McpServerPreset>, String> {
    Ok(builtin_presets())
}

/// 列出某 MCP 服务器下所有可用工具
///
/// 优先从缓存的活跃客户端获取；无缓存则按需启动。
#[tauri::command]
#[specta::specta]
pub async fn mcp_list_tools(
    state: State<'_, McpState>,
    workspace_root: String,
    server_id: String,
) -> Result<Vec<McpTool>, String> {
    let path = PathBuf::from(&workspace_root);
    let store = McpStore::load_or_init(&path).map_err(|e| e.to_string())?;
    let config = store
        .find(&server_id)
        .cloned()
        .ok_or_else(|| format!("MCP 服务器不存在: {server_id}"))?;

    // 检查缓存(使用公开 API 而非直接访问 clients 字段)
    if let Some(client) = state.get(&server_id).await {
        let tools = client.fetch_tools().await.map_err(|e| e.to_string())?;
        return Ok(tools);
    }

    // 无缓存则启动
    let client = McpClient::start_from_config(&config)
        .await
        .map_err(|e| e.to_string())?;
    let tools = client.fetch_tools().await.map_err(|e| e.to_string())?;
    let arc_client = Arc::new(client);
    state.insert(server_id.clone(), arc_client).await;
    Ok(tools)
}

/// 测试连接结果
#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct McpTestResult {
    pub server_name: String,
    pub server_version: String,
    pub protocol_version: String,
    pub tool_count: usize,
    pub tool_names: Vec<String>,
}

// ============================================================================
// P1-2: mcp_call_tool 命令
// ============================================================================

/// MCP 工具调用输入
#[derive(Debug, Clone, Deserialize, specta::Type)]
pub struct McpCallToolInput {
    /// 工作区根目录
    pub workspace_root: String,
    /// MCP 服务器 ID
    pub server_id: String,
    /// 要调用的工具名
    pub tool_name: String,
    /// 工具参数(JSON 对象)
    #[serde(default = "serde_json::Value::default")]
    pub arguments: serde_json::Value,
}

/// MCP 内容块 DTO(前端契约层)
///
/// ydsz_code::mcp::McpContent 没有 specta::Type,
/// 这里用 DTO 包装以支持前端类型生成。
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum McpContentDto {
    Text { text: String },
    Image { data: String, mime_type: String },
    Resource { uri: String, text: Option<String> },
    Unknown,
}

impl From<McpContent> for McpContentDto {
    fn from(c: McpContent) -> Self {
        match c {
            McpContent::Text { text } => McpContentDto::Text { text },
            McpContent::Image { data, mime_type } => McpContentDto::Image { data, mime_type },
            McpContent::Resource { uri, text } => McpContentDto::Resource { uri, text },
            McpContent::Unknown => McpContentDto::Unknown,
        }
    }
}

/// MCP 工具调用结果 DTO
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct McpToolCallResultDto {
    /// 内容块列表
    pub content: Vec<McpContentDto>,
    /// 是否出错
    pub is_error: bool,
}

impl From<McpToolCallResult> for McpToolCallResultDto {
    fn from(r: McpToolCallResult) -> Self {
        Self {
            content: r.content.into_iter().map(Into::into).collect(),
            is_error: r.is_error,
        }
    }
}

/// 调用 MCP 工具
///
/// 从缓存的活跃客户端调用指定工具。若客户端未缓存,则按需启动。
///
/// # 参数
///
/// - `workspace_root`: 工作区根目录
/// - `server_id`: MCP 服务器 ID
/// - `tool_name`: 要调用的工具名(来自 `mcp_list_tools` 返回的 `McpTool.name`)
/// - `arguments`: 工具参数(JSON 对象,结构由工具的 `input_schema` 定义)
#[tauri::command]
#[specta::specta]
pub async fn mcp_call_tool(
    state: State<'_, McpState>,
    input: McpCallToolInput,
) -> Result<McpToolCallResultDto, String> {
    info!(
        server_id = %input.server_id,
        tool_name = %input.tool_name,
        "MCP 调用工具"
    );
    let path = PathBuf::from(&input.workspace_root);
    let store = McpStore::load_or_init(&path).map_err(|e| e.to_string())?;
    let config = store
        .find(&input.server_id)
        .cloned()
        .ok_or_else(|| format!("MCP 服务器不存在: {}", input.server_id))?;
    if !config.enabled {
        return Err(McpError::ServerDisabled(config.id.clone()).to_string());
    }

    // 检查缓存(使用公开 API)
    let cached = state.get(&input.server_id).await;

    let result = if let Some(client) = cached {
        // 使用缓存的活跃客户端
        client
            .call_tool(&input.tool_name, input.arguments)
            .await
            .map_err(|e| e.to_string())?
    } else {
        // 无缓存则启动
        info!(server_id = %input.server_id, "MCP 客户端未缓存,按需启动");
        let client = McpClient::start_from_config(&config)
            .await
            .map_err(|e| e.to_string())?;
        let arc_client = Arc::new(client);
        state.insert(input.server_id.clone(), arc_client.clone()).await;
        arc_client
            .call_tool(&input.tool_name, input.arguments)
            .await
            .map_err(|e| e.to_string())?
    };

    Ok(result.into())
}

/// 内部辅助：将指定服务器的状态写入 store 并落盘
fn update_status(
    store: &mut McpStore,
    server_id: &str,
    status: McpServerStatus,
    error: Option<String>,
) {
    if let Some(server) = store.find_mut(server_id) {
        server.status = status;
        server.error = error;
        if matches!(server.status, McpServerStatus::Connected) {
            let now = chrono::Utc::now().timestamp_millis();
            server.last_connected_at = Some(now);
        }
    } else {
        warn!(server_id, "MCP 服务器在 store 中不存在");
    }
}
