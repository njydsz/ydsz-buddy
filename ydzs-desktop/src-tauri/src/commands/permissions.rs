//! # 工具权限白名单命令模块
//!
//! 提供工具权限管理相关的 Tauri 命令。
//!
//! ## 命令清单
//!
//! | 命令 | 说明 |
//! |------|------|
//! | `permissions_get` | 获取当前权限配置 |
//! | `permissions_set_mode` | 设置权限模式 |
//! | `permissions_allow` | 添加白名单 |
//! | `permissions_block` | 添加黑名单 |
//! | `permissions_check` | 检查工具权限 |
//! | `permissions_filter` | 过滤允许的工具 |
//! | `permissions_load_preset` | 加载预设模板 |

use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::State;
use tracing::info;

use ydsz_core::tool_permissions::{
    PermissionManager, PermissionMode, PermissionDecision, ToolPermissions,
    safe_readonly_preset, full_trust_preset, approve_each_preset,
};
use ydsz_core::models::RuntimeMode;

/// 权限管理器状态
pub struct PermissionsState {
    /// 权限管理器(pub 供同 crate 的 runner.rs 等模块直接构造测试状态)
    pub manager: Mutex<PermissionManager>,
}

impl Default for PermissionsState {
    fn default() -> Self {
        Self::new()
    }
}

impl PermissionsState {
    pub fn new() -> Self {
        Self {
            manager: Mutex::new(PermissionManager::new()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct ToolPermissionsDto {
    pub mode: String,
    pub allowlist: Vec<String>,
    pub blocklist: Vec<String>,
}

impl From<ToolPermissions> for ToolPermissionsDto {
    fn from(p: ToolPermissions) -> Self {
        Self {
            mode: match p.mode {
                PermissionMode::AllowAll => "allow_all",
                PermissionMode::Allowlist => "allowlist",
                PermissionMode::ApproveEach => "approve_each",
            }.to_string(),
            allowlist: p.allowed_tools(),
            blocklist: p.blocked_tools(),
        }
    }
}

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

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct PermissionDecisionDto {
    pub decision: String,
    pub allowed: bool,
}

impl From<PermissionDecision> for PermissionDecisionDto {
    fn from(d: PermissionDecision) -> Self {
        let s = match d {
            PermissionDecision::Allowed => "allowed",
            PermissionDecision::Denied => "denied",
            PermissionDecision::NeedsApproval => "needs_approval",
            PermissionDecision::NotInAllowlist => "not_in_allowlist",
        };
        Self {
            decision: s.to_string(),
            allowed: d.is_allowed(),
        }
    }
}

#[derive(Debug, Clone, Deserialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum PermissionModeDto {
    AllowAll,
    Allowlist,
    ApproveEach,
}

impl From<PermissionModeDto> for PermissionMode {
    fn from(dto: PermissionModeDto) -> Self {
        match dto {
            PermissionModeDto::AllowAll => Self::AllowAll,
            PermissionModeDto::Allowlist => Self::Allowlist,
            PermissionModeDto::ApproveEach => Self::ApproveEach,
        }
    }
}

#[derive(Debug, Clone, Deserialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum PresetDto {
    SafeReadonly,
    FullTrust,
    ApproveEach,
}

/// 获取当前权限配置
#[tauri::command]
#[specta::specta]
pub async fn permissions_get(
    state: State<'_, PermissionsState>,
) -> Result<ToolPermissionsDto, String> {
    let mgr = state.manager.lock().map_err(|e| e.to_string())?;
    Ok(mgr.snapshot().into())
}

/// 设置权限模式
#[tauri::command]
#[specta::specta]
pub async fn permissions_set_mode(
    state: State<'_, PermissionsState>,
    mode: PermissionModeDto,
) -> Result<(), String> {
    info!(mode = ?mode, "设置权限模式");
    let mgr = state.manager.lock().map_err(|e| e.to_string())?;
    mgr.set_mode(mode.into());
    Ok(())
}

/// 添加白名单
#[tauri::command]
#[specta::specta]
pub async fn permissions_allow(
    state: State<'_, PermissionsState>,
    tool: String,
) -> Result<(), String> {
    info!(tool = %tool, "添加白名单");
    let mgr = state.manager.lock().map_err(|e| e.to_string())?;
    mgr.allow(&tool);
    Ok(())
}

/// 添加黑名单
#[tauri::command]
#[specta::specta]
pub async fn permissions_block(
    state: State<'_, PermissionsState>,
    tool: String,
) -> Result<(), String> {
    info!(tool = %tool, "添加黑名单");
    let mgr = state.manager.lock().map_err(|e| e.to_string())?;
    mgr.block(&tool);
    Ok(())
}

/// 检查工具权限
#[tauri::command]
#[specta::specta]
pub async fn permissions_check(
    state: State<'_, PermissionsState>,
    tool: String,
    mode: RuntimeModeDto,
) -> Result<PermissionDecisionDto, String> {
    let mgr = state.manager.lock().map_err(|e| e.to_string())?;
    let decision = mgr.check(&tool, &mode.into());
    Ok(decision.into())
}

/// 过滤允许的工具
#[tauri::command]
#[specta::specta]
pub async fn permissions_filter(
    state: State<'_, PermissionsState>,
    tools: Vec<String>,
    mode: RuntimeModeDto,
) -> Result<Vec<String>, String> {
    let mgr = state.manager.lock().map_err(|e| e.to_string())?;
    Ok(mgr.filter_allowed(&tools, &mode.into()))
}

/// 加载预设模板
#[tauri::command]
#[specta::specta]
pub async fn permissions_load_preset(
    state: State<'_, PermissionsState>,
    preset: PresetDto,
) -> Result<(), String> {
    info!(preset = ?preset, "加载权限预设");
    let preset_config = match preset {
        PresetDto::SafeReadonly => safe_readonly_preset(),
        PresetDto::FullTrust => full_trust_preset(),
        PresetDto::ApproveEach => approve_each_preset(),
    };
    let mut mgr = state.manager.lock().map_err(|e| e.to_string())?;
    *mgr = PermissionManager::from_config(preset_config);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_permissions_state_creation() {
        let state = PermissionsState::new();
        assert!(state.manager.lock().is_ok());
    }
}
