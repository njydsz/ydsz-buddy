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

// ============================================================================
// 运行时权限动态升降级（P1 增强）
// ============================================================================

use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

/// 权限调整动作
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum PermissionAdjustment {
    /// 临时提升（带超时自动恢复）
    Escalate { tool: String, duration_secs: u64 },
    /// 临时降级
    Deescalate { tool: String, level: String },
    /// 重置为默认
    Reset { tool: String },
}

/// 动态权限状态
#[derive(Debug, Clone)]
pub struct DynamicPermissionState {
    inner: Arc<Mutex<DynamicPermissionInner>>,
}

#[derive(Debug, Clone, Default)]
struct DynamicPermissionInner {
    /// 当前活动的权限调整: tool_name -> (adjustment, expires_at)
    active_adjustments: HashMap<String, (PermissionAdjustment, Option<Instant>)>,
    /// 违规计数: tool_name -> count
    violation_count: HashMap<String, u32>,
    /// 自动降级阈值（连续违规次数）
    auto_deescalate_threshold: u32,
}

impl DynamicPermissionState {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(DynamicPermissionInner {
                active_adjustments: HashMap::new(),
                violation_count: HashMap::new(),
                auto_deescalate_threshold: 3,
            })),
        }
    }

    /// 应用权限调整
    pub fn apply_adjustment(&self, adjustment: PermissionAdjustment) -> Result<(), String> {
        let mut inner = self.inner.lock().map_err(|e| e.to_string())?;

        match &adjustment {
            PermissionAdjustment::Escalate { tool, duration_secs } => {
                let expires = Duration::from_secs(*duration_secs);
                inner.active_adjustments.insert(
                    tool.clone(),
                    (adjustment.clone(), Some(Instant::now() + expires)),
                );
                info!(tool = %tool, secs = duration_secs, "权限临时提升");
            }
            PermissionAdjustment::Deescalate { tool, level: _ } => {
                // 降级不设置超时，直到手动重置
                inner.active_adjustments.insert(
                    tool.clone(),
                    (adjustment.clone(), None),
                );
                info!(tool = %tool, "权限降级");
            }
            PermissionAdjustment::Reset { tool } => {
                inner.active_adjustments.remove(tool);
                inner.violation_count.remove(tool);
                info!(tool = %tool, "权限重置为默认");
            }
        }

        Ok(())
    }

    /// 记录一次违规并判断是否需要自动降级
    pub fn record_violation(&self, tool: &str) -> bool {
        let mut inner = match self.inner.lock() {
            Ok(g) => g,
            Err(_) => return false,
        };

        let count = inner.violation_count.entry(tool.to_string()).or_insert(0);
        *count += 1;

        if *count >= inner.auto_deescalate_threshold {
            // 触发自动降级
            warn!(tool = %tool, violations = *count, "违规次数过多，自动降级权限");
            inner.active_adjustments.insert(
                tool.to_string(),
                (
                    PermissionAdjustment::Deescalate {
                        tool: tool.to_string(),
                        level: "readonly".to_string(),
                    },
                    None,
                ),
            );
            true
        } else {
            false
        }
    }

    /// 清理过期的调整
    pub fn cleanup_expired(&self) -> Vec<String> {
        let mut inner = match self.inner.lock() {
            Ok(g) => g,
            Err(_) => return Vec::new(),
        };

        let now = Instant::now();
        let expired: Vec<String> = inner
            .active_adjustments
            .iter()
            .filter(|(_, (_, exp))| exp.map_or(false, |e| now > e))
            .map(|(tool, _)| tool.clone())
            .collect();

        for tool in &expired {
            inner.active_adjustments.remove(tool);
            info!(tool = %tool, "过期权限调整已自动清除");
        }

        expired
    }

    /// 查询工具当前的动态调整（考虑过期）
    pub fn get_effective_adjustment(&self, tool: &str) -> Option<PermissionAdjustment> {
        let mut inner = self.inner.lock().ok()?;

        if let Some((adj, expires)) = inner.active_adjustments.get(tool) {
            if let Some(exp) = expires {
                if Instant::now() > *exp {
                    // 已过期
                    return None;
                }
            }
            Some(adj.clone())
        } else {
            None
        }
    }

    /// 列出所有活动调整
    pub fn list_active(&self) -> Vec<(String, PermissionAdjustment, Option<u64>)> {
        let inner = match self.inner.lock() {
            Ok(g) => g,
            Err(_) => return Vec::new(),
        };

        let now = Instant::now();
        inner
            .active_adjustments
            .iter()
            .filter(|(_, (_, exp))| exp.map_or(true, |e| now <= e))
            .map(|(tool, (adj, exp))| {
                let remaining_secs = exp.map(|e| {
                    let remaining = e.saturating_duration_since(now);
                    remaining.as_secs()
                });
                (tool.clone(), adj.clone(), remaining_secs)
            })
            .collect()
    }

    /// 设置自动降级阈值
    pub fn set_deescalate_threshold(&self, threshold: u32) {
        if let Ok(mut inner) = self.inner.lock() {
            inner.auto_deescalate_threshold = threshold;
        }
    }

    /// 获取违规统计
    pub fn get_violation_stats(&self) -> HashMap<String, u32> {
        self.inner.lock().map(|i| i.violation_count.clone()).unwrap_or_default()
    }
}

impl Default for DynamicPermissionState {
    fn default() -> Self {
        Self::new()
    }
}

// ---- Tauri 命令 ----

/// 应用运行时权限调整
#[tauri::command]
#[specta::specta]
pub async fn permissions_dynamic_adjust(
    state: State<'_, DynamicPermissionState>,
    adjustment: PermissionAdjustment,
) -> Result<(), String> {
    state.apply_adjustment(adjustment)
}

/// 列出所有活动的动态权限调整
#[tauri::command]
#[specta::specta]
pub async fn permissions_dynamic_list(
    state: State<'_, DynamicPermissionState>,
) -> Result<Vec<serde_json::Value>, String> {
    let active = state.list_active();
    let result: Vec<serde_json::Value> = active
        .into_iter()
        .map(|(tool, adj, remaining)| {
            serde_json::json!({
                "tool": tool,
                "adjustment": adj,
                "remainingSecs": remaining,
            })
        })
        .collect();
    Ok(result)
}

/// 查询工具的动态权限调整状态
#[tauri::command]
#[specta::specta]
pub async fn permissions_dynamic_get(
    state: State<'_, DynamicPermissionState>,
    tool: String,
) -> Result<Option<PermissionAdjustment>, String> {
    Ok(state.get_effective_adjustment(&tool))
}

/// 设置自动降级阈值
#[tauri::command]
#[specta::specta]
pub async fn permissions_set_deescalate_threshold(
    state: State<'_, DynamicPermissionState>,
    threshold: u32,
) -> Result<(), String> {
    state.set_deescalate_threshold(threshold);
    info!(threshold = threshold, "自动降级阈值已设置");
    Ok(())
}

/// 获取违规统计
#[tauri::command]
#[specta::specta]
pub async fn permissions_get_violations(
    state: State<'_, DynamicPermissionState>,
) -> Result<HashMap<String, u32>, String> {
    Ok(state.get_violation_stats())
}

/// 清理过期调整
#[tauri::command]
#[specta::specta]
pub async fn permissions_cleanup_expired(
    state: State<'_, DynamicPermissionState>,
) -> Result<Vec<String>, String> {
    Ok(state.cleanup_expired())
}
