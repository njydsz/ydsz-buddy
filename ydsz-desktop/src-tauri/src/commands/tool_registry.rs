//! # 工具注册表命令模块
//!
//! 提供工具列表查询和模式过滤相关的 Tauri 命令。
//!
//! ## 命令清单
//!
//! | 命令 | 说明 |
//! |------|------|
//! | `tool_registry_list` | 列出所有工具 |
//! | `tool_registry_filter` | 根据运行时模式过滤工具 |
//! | `tool_registry_check` | 检查工具是否可用 |

use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::State;
use tracing::info;

use ydsz_core::models::RuntimeMode;
use ydsz_core::tool_registry::{ToolRegistry, ToolDescriptor, ToolDomain};

/// 工具注册表状态
pub struct ToolRegistryState {
    registry: Mutex<ToolRegistry>,
}

impl Default for ToolRegistryState {
    fn default() -> Self {
        Self::new()
    }
}

impl ToolRegistryState {
    pub fn new() -> Self {
        Self {
            registry: Mutex::new(ToolRegistry::with_builtin_tools()),
        }
    }
}

/// 工具描述 DTO
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct ToolDescriptorDto {
    pub name: String,
    pub domain: String,
    pub description: String,
    pub parameters: serde_json::Value,
}

impl From<&ToolDescriptor> for ToolDescriptorDto {
    fn from(t: &ToolDescriptor) -> Self {
        Self {
            name: t.name.clone(),
            domain: match t.domain {
                ToolDomain::Work => "work",
                ToolDomain::Code => "code",
                ToolDomain::Shared => "shared",
            }.to_string(),
            description: t.description.clone(),
            parameters: t.parameters.clone(),
        }
    }
}

/// 运行时模式 DTO
#[derive(Debug, Clone, Deserialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum RuntimeModeDto {
    Work,
    Code,
}

impl From<RuntimeModeDto> for RuntimeMode {
    fn from(dto: RuntimeModeDto) -> Self {
        match dto {
            RuntimeModeDto::Work => Self::Work,
            RuntimeModeDto::Code => Self::Code,
        }
    }
}

/// 列出所有工具
#[tauri::command]
#[specta::specta]
pub async fn tool_registry_list(
    state: State<'_, ToolRegistryState>,
) -> Result<Vec<ToolDescriptorDto>, String> {
    info!("列出所有工具");
    let registry = state.registry.lock().map_err(|e| e.to_string())?;
    Ok(registry.all().into_iter().map(Into::into).collect())
}

/// 根据运行时模式过滤工具
#[tauri::command]
#[specta::specta]
pub async fn tool_registry_filter(
    state: State<'_, ToolRegistryState>,
    mode: RuntimeModeDto,
) -> Result<Vec<ToolDescriptorDto>, String> {
    info!(mode = ?mode, "按模式过滤工具");
    let registry = state.registry.lock().map_err(|e| e.to_string())?;
    let mode: RuntimeMode = mode.into();
    Ok(registry.filter_by_mode(&mode).into_iter().map(Into::into).collect())
}

/// 检查工具是否可用
#[tauri::command]
#[specta::specta]
pub async fn tool_registry_check(
    state: State<'_, ToolRegistryState>,
    tool_name: String,
    mode: RuntimeModeDto,
) -> Result<bool, String> {
    info!(tool = %tool_name, mode = ?mode, "检查工具可用性");
    let registry = state.registry.lock().map_err(|e| e.to_string())?;
    let mode: RuntimeMode = mode.into();
    Ok(registry.is_available(&tool_name, &mode))
}
