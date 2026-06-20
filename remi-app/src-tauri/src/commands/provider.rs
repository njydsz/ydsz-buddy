//! # AI 模型提供商管理命令模块
//!
//! 本模块提供与 AI 模型提供商相关的 Tauri 命令，支持模型列表查询、API Key 配置等功能。
//!
//! ## 模块职责
//!
//! - 管理 AI 模型提供商的 API Key
//! - 提供可用模型列表查询
//! - 维护提供商状态
//!
//! ## 核心功能
//!
//! 1. **模型列表**：获取支持的 AI 模型列表（可按提供商过滤）
//! 2. **API Key 管理**：设置和存储各提供商的 API Key
//! 3. **状态查询**：获取各提供商的配置状态
//!
//! ## 使用场景
//!
//! - 前端需要显示可用模型列表时调用 `list_models`
//! - 用户配置 API Key 时调用 `set_api_key`
//! - 前端需要检查提供商配置状态时调用 `get_provider_status`
//!
//! ## 设计说明
//!
//! - API Key 存储在内存中（通过 `Mutex<HashMap>`），应用重启后会丢失
//! - 当前支持的提供商：OpenAI、Anthropic
//! - 模型列表硬编码在代码中，后续可改为动态获取

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::State;

use remi_core::provider::ProviderKind;
use remi_provider::ProviderService;

/// 提供商状态管理器
///
/// 持有所有 AI 模型提供商的 API Key 配置和 ProviderService 实例。
///
/// # 字段说明
///
/// - `api_keys`: 存储各提供商 API Key 的 HashMap，键为提供商名称，值为 API Key
/// - `service`: ProviderService 实例，提供模型/Agent 查询和健康检查
///
/// # 使用场景
///
/// 在 `lib.rs` 中通过 `.manage(ProviderState::new())` 注入，
/// 各命令通过 `State<'_, ProviderState>` 参数获取该状态。
pub struct ProviderState {
    api_keys: Arc<Mutex<HashMap<String, String>>>,
    service: Arc<ProviderService>,
}

impl ProviderState {
    /// 创建新的提供商状态管理器
    ///
    /// 初始化空的 API Key 存储和新的 ProviderService 实例。
    ///
    /// # 返回值
    ///
    /// 返回初始化后的 `ProviderState` 实例
    pub fn new() -> Self {
        Self {
            api_keys: Arc::new(Mutex::new(HashMap::new())),
            service: Arc::new(ProviderService::new()),
        }
    }

    /// 获取 ProviderService 引用
    ///
    /// 返回内部持有的 `ProviderService` 的 `Arc` 引用，
    /// 供需要调用 Provider 查询方法的命令使用。
    pub fn service(&self) -> Arc<ProviderService> {
        self.service.clone()
    }
}

/// 列出可用模型命令
///
/// 获取支持的 AI 模型列表，可按提供商过滤。
/// 通过 `ProviderService::list_models()` 查询，返回静态模型目录。
///
/// # 参数
///
/// - `state`: 提供商状态管理器（通过 Tauri State 注入）
/// - `provider`: 可选的提供商名称过滤条件（如 "codex"、"claudeAgent"）
///   - 如果提供，仅返回该提供商的模型
///   - 如果不提供，返回所有已注册提供商的模型
///
/// # 返回值
///
/// - `Ok(Vec<serde_json::Value>)`: 查询成功，返回模型信息列表
/// - `Err(String)`: 查询失败
#[tauri::command]
pub async fn list_models(
    state: State<'_, ProviderState>,
    provider: Option<String>,
) -> Result<Vec<serde_json::Value>, String> {
    let service = state.service();

    if let Some(provider_str) = provider {
        // 按指定提供商过滤
        let kind = parse_provider_kind(&provider_str)
            .ok_or_else(|| format!("未知的 Provider: {}", provider_str))?;
        service
            .list_models(kind)
            .await
            .map_err(|e| e.to_string())
    } else {
        // 返回所有 Provider 的模型
        let all_kinds = [
            ProviderKind::Codex,
            ProviderKind::ClaudeAgent,
            ProviderKind::Cursor,
            ProviderKind::Gemini,
            ProviderKind::Grok,
            ProviderKind::Kilo,
            ProviderKind::OpenCode,
            ProviderKind::Pi,
        ];
        let mut all_models = Vec::new();
        for kind in all_kinds {
            let models = service
                .list_models(kind)
                .await
                .map_err(|e| e.to_string())?;
            all_models.extend(models);
        }
        Ok(all_models)
    }
}

/// 设置 API Key 命令
///
/// 为指定提供商设置 API Key。
///
/// # 参数
///
/// - `state`: 提供商状态管理器（通过 Tauri State 注入）
/// - `provider`: 提供商名称（如 "openai"、"anthropic"）
/// - `key`: API Key 字符串
///
/// # 返回值
///
/// - `Ok(())`: 设置成功
/// - `Err(String)`: 设置失败（如锁获取失败）
///
/// # 使用示例
///
/// ```javascript
/// // 前端调用示例
/// await window.__TAURI__.invoke('set_api_key', {
///     provider: 'openai',
///     key: 'sk-xxx-xxx-xxx'
/// });
/// ```
///
/// # 注意事项
///
/// - API Key 仅存储在内存中，应用重启后会丢失
/// - 如果该提供商已有 API Key，会被新值覆盖
/// - 建议前端在设置前进行 Key 格式验证
#[tauri::command]
pub async fn set_api_key(
    state: State<'_, ProviderState>,
    provider: String,
    key: String,
) -> Result<(), String> {
    let mut api_keys = state.api_keys.lock().map_err(|e| e.to_string())?;
    api_keys.insert(provider, key);
    Ok(())
}

/// 获取提供商状态命令
///
/// 获取所有提供商的 API Key 配置状态。
///
/// # 参数
///
/// - `state`: 提供商状态管理器
///
/// # 返回值
///
/// - `Ok(Value)`: 查询成功，返回 JSON 对象，格式如下：
///   ```json
///   {
///       "openai": { "configured": true },
///       "anthropic": { "configured": false }
///   }
///   ```
/// - `Err(String)`: 查询失败
///
/// # 使用示例
///
/// ```javascript
/// // 前端调用示例
/// const status = await window.__TAURI__.invoke('get_provider_status');
/// if (status.openai.configured) {
///     console.log('OpenAI 已配置');
/// }
/// ```
///
/// # 设计说明
///
/// - `configured` 字段表示该提供商是否已设置 API Key（非空）
/// - 仅返回已设置过 Key 的提供商（未设置的不会出现在结果中）
#[tauri::command]
pub async fn get_provider_status(
    state: State<'_, ProviderState>,
) -> Result<serde_json::Value, String> {
    let api_keys = state.api_keys.lock().map_err(|e| e.to_string())?;
    
    let mut status = serde_json::Map::new();
    // 遍历所有已配置的提供商
    for (provider, key) in api_keys.iter() {
        status.insert(
            provider.clone(),
            serde_json::json!({
                "configured": !key.is_empty(),
            }),
        );
    }
    
    Ok(serde_json::Value::Object(status))
}

// ========== 以下为前端 bridge 调用的补充命令 ==========

#[tauri::command]
pub async fn provider_get_composer_capabilities(
    state: State<'_, ProviderState>,
    input: serde_json::Value,
) -> Result<serde_json::Value, String> {
    // 尝试从 input 中解析 provider 字段
    let provider_str = input
        .get("provider")
        .and_then(|v| v.as_str())
        .unwrap_or("claudeAgent");

    let kind = parse_provider_kind(provider_str)
        .ok_or_else(|| format!("未知的 Provider: {}", provider_str))?;
    let service = state.service();
    let adapter = service.get_adapter(kind).await.map_err(|e| e.to_string())?;
    let caps = adapter.capabilities();

    Ok(serde_json::json!({
        "tools": [],
        "skills": [],
        "plugins": [],
        "capabilities": {
            "session_model_switch": caps.session_model_switch,
            "supports_skill_mentions": caps.supports_skill_mentions,
            "supports_skill_discovery": caps.supports_skill_discovery,
            "supports_native_slash_command_discovery": caps.supports_native_slash_command_discovery,
            "supports_runtime_model_list": caps.supports_runtime_model_list,
            "supports_turn_steering": caps.supports_turn_steering
        }
    }))
}

#[tauri::command]
pub async fn provider_compact_thread(
    state: State<'_, ProviderState>,
    input: serde_json::Value,
) -> Result<(), String> {
    let thread_id = input
        .get("threadId")
        .and_then(|v| v.as_str())
        .ok_or("缺少 threadId 参数")?;
    let provider_str = input
        .get("provider")
        .and_then(|v| v.as_str())
        .ok_or("缺少 provider 参数")?;

    let kind = parse_provider_kind(provider_str)
        .ok_or_else(|| format!("未知的 Provider: {}", provider_str))?;
    let service = state.service();
    service
        .compact_thread(thread_id, kind)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn provider_list_commands(
    _input: serde_json::Value,
) -> Result<Vec<serde_json::Value>, String> {
    // 命令列表依赖于活跃的 Provider 会话，当前无会话时返回空列表
    Ok(vec![])
}

#[tauri::command]
pub async fn provider_list_skills(
    _input: serde_json::Value,
) -> Result<Vec<serde_json::Value>, String> {
    // 技能列表依赖于活跃的 Provider 会话，当前无会话时返回空列表
    Ok(vec![])
}

#[tauri::command]
pub async fn provider_list_plugins(
    _input: serde_json::Value,
) -> Result<Vec<serde_json::Value>, String> {
    // 插件列表依赖于活跃的 Provider 会话，当前无会话时返回空列表
    Ok(vec![])
}

#[tauri::command]
pub async fn provider_read_plugin(
    input: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let plugin_id = input
        .get("pluginId")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    Err(format!("未找到插件: {}", plugin_id))
}

#[tauri::command]
pub async fn provider_list_agents(
    state: State<'_, ProviderState>,
    input: serde_json::Value,
) -> Result<Vec<serde_json::Value>, String> {
    let provider_str = input
        .get("provider")
        .and_then(|v| v.as_str())
        .unwrap_or("claudeAgent");

    let kind = parse_provider_kind(provider_str)
        .ok_or_else(|| format!("未知的 Provider: {}", provider_str))?;
    let service = state.service();
    service
        .list_agents(kind)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn skills_list_local() -> Result<Vec<serde_json::Value>, String> {
    // 本地技能列表，当前返回空（后续可从文件系统扫描）
    Ok(vec![])
}

/// 解析 ProviderKind 字符串
///
/// 支持以下格式（大小写不敏感）：
/// - "codex" → ProviderKind::Codex
/// - "claudeAgent" / "claudeagent" / "claude" → ProviderKind::ClaudeAgent
/// - "cursor" → ProviderKind::Cursor
/// - "gemini" → ProviderKind::Gemini
/// - "grok" → ProviderKind::Grok
/// - "kilo" → ProviderKind::Kilo
/// - "opencode" → ProviderKind::OpenCode
/// - "pi" → ProviderKind::Pi
fn parse_provider_kind(s: &str) -> Option<ProviderKind> {
    let lower = s.to_lowercase();
    match lower.as_str() {
        "codex" | "openai" => Some(ProviderKind::Codex),
        "claudeagent" | "claude" | "anthropic" => Some(ProviderKind::ClaudeAgent),
        "cursor" => Some(ProviderKind::Cursor),
        "gemini" | "google" => Some(ProviderKind::Gemini),
        "grok" | "xai" => Some(ProviderKind::Grok),
        "kilo" => Some(ProviderKind::Kilo),
        "opencode" => Some(ProviderKind::OpenCode),
        "pi" | "inflection" => Some(ProviderKind::Pi),
        _ => None,
    }
}
