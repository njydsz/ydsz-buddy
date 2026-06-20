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

use serde::Serialize;
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

/// AI 模型信息结构
///
/// 表示单个 AI 模型的基本信息。
///
/// # 字段说明
///
/// - `id`: 模型唯一标识符（如 "gpt-4"、"claude-3-opus"）
/// - `name`: 模型显示名称（如 "GPT-4"、"Claude 3 Opus"）
/// - `provider`: 提供商名称（如 "openai"、"anthropic"）
///
/// # 使用场景
///
/// 作为 `list_models` 命令的返回值元素，用于前端渲染模型选择列表。
#[derive(Debug, Serialize)]
pub struct Model {
    /// 模型 ID
    pub id: String,
    /// 模型显示名称
    pub name: String,
    /// 提供商名称
    pub provider: String,
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
///
/// # 参数
///
/// - `provider`: 可选的提供商名称过滤条件
///   - 如果提供，仅返回该提供商的模型
///   - 如果不提供，返回所有模型
///
/// # 返回值
///
/// - `Ok(Vec<Model>)`: 查询成功，返回模型信息列表
/// - `Err(String)`: 查询失败
///
/// # 使用示例
///
/// ```javascript
/// // 前端调用示例 - 获取所有模型
/// const allModels = await window.__TAURI__.invoke('list_models');
///
/// // 前端调用示例 - 仅获取 OpenAI 模型
/// const openaiModels = await window.__TAURI__.invoke('list_models', {
///     provider: 'openai'
/// });
/// ```
///
/// # 当前支持的模型
///
/// - OpenAI: GPT-4, GPT-3.5 Turbo
/// - Anthropic: Claude 3 Opus, Claude 3 Sonnet
///
/// # 设计说明
///
/// - 模型列表当前硬编码在代码中
/// - 后续可改为从配置文件或远程 API 动态获取
#[tauri::command]
pub async fn list_models(provider: Option<String>) -> Result<Vec<Model>, String> {
    // 硬编码的默认模型列表
    let models = vec![
        Model {
            id: "gpt-4".to_string(),
            name: "GPT-4".to_string(),
            provider: "openai".to_string(),
        },
        Model {
            id: "gpt-3.5-turbo".to_string(),
            name: "GPT-3.5 Turbo".to_string(),
            provider: "openai".to_string(),
        },
        Model {
            id: "claude-3-opus".to_string(),
            name: "Claude 3 Opus".to_string(),
            provider: "anthropic".to_string(),
        },
        Model {
            id: "claude-3-sonnet".to_string(),
            name: "Claude 3 Sonnet".to_string(),
            provider: "anthropic".to_string(),
        },
    ];
    
    // 按提供商过滤（如果提供）
    if let Some(p) = provider {
        Ok(models.into_iter().filter(|m| m.provider == p).collect())
    } else {
        Ok(models)
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
    input: serde_json::Value,
) -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "tools": [],
        "skills": [],
        "plugins": []
    }))
}

#[tauri::command]
pub async fn provider_compact_thread(
    input: serde_json::Value,
) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub async fn provider_list_commands(
    input: serde_json::Value,
) -> Result<Vec<serde_json::Value>, String> {
    Ok(vec![])
}

#[tauri::command]
pub async fn provider_list_skills(
    input: serde_json::Value,
) -> Result<Vec<serde_json::Value>, String> {
    Ok(vec![])
}

#[tauri::command]
pub async fn provider_list_plugins(
    input: serde_json::Value,
) -> Result<Vec<serde_json::Value>, String> {
    Ok(vec![])
}

#[tauri::command]
pub async fn provider_read_plugin(
    input: serde_json::Value,
) -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({}))
}

#[tauri::command]
pub async fn provider_list_agents(
    input: serde_json::Value,
) -> Result<Vec<serde_json::Value>, String> {
    Ok(vec![])
}

#[tauri::command]
pub async fn skills_list_local() -> Result<Vec<serde_json::Value>, String> {
    Ok(vec![])
}
