//! # HITL (Human-in-the-Loop) 审批装配
//!
//! 管理工具调用审批流程：
//! - Agent 发起高风险操作时创建 ApprovalRequest
//! - 前端展示待审批列表
//! - 用户决定批准/拒绝后通过 approval_respond 响应
//!
//! 对标 Octop 的 HITL 审批 + ToolGuard 安全策略。

use tauri::State;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tracing::info;

use ydsz_core::commands::OrchestrationCommand;
use crate::ServerState;

// ===== 类型 =====

/// 审批请求（Agent 发起高风险操作时创建）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApprovalRequest {
    pub id: String,
    pub thread_id: String,
    pub turn_id: String,
    pub tool_name: String,
    pub tool_call_id: String,
    pub parameters: serde_json::Value,
    pub requested_at: String,
    pub status: String,  // "pending" | "approved" | "rejected" | "timeout"
}

/// 审批状态存储（内存 + 未来可持久化到 ThreadStore）
#[derive(Debug, Clone)]
pub struct ApprovalsState {
    inner: Arc<Mutex<Vec<ApprovalRequest>>>,
    pub rules: Arc<Mutex<Vec<ApprovalRule>>>,
    pub history: Arc<Mutex<Vec<ApprovalHistoryEntry>>>,
}

impl ApprovalsState {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(Vec::new())),
            rules: Arc::new(Mutex::new(Vec::new())),
            history: Arc::new(Mutex::new(Vec::new())),
        }
    }

    pub fn list_pending(&self) -> Vec<ApprovalRequest> {
        self.inner
            .lock()
            .unwrap()
            .iter()
            .filter(|r| r.status == "pending")
            .cloned()
            .collect()
    }

    pub fn push(&self, req: ApprovalRequest) {
        self.inner.lock().unwrap().push(req);
    }

    pub fn respond(&self, request_id: &str, approved: bool) -> Option<ApprovalRequest> {
        let mut inner = self.inner.lock().unwrap();
        if let Some(req) = inner.iter_mut().find(|r| r.id == request_id) {
            req.status = if approved { "approved".into() } else { "rejected".into() };
            return Some(req.clone());
        }
        None
    }
}

impl Default for ApprovalsState {
    fn default() -> Self {
        Self::new()
    }
}

// ===== Tauri 命令 =====

/// 列出待审批的操作
#[tauri::command]
#[specta::specta]
pub async fn approval_list_pending(
    state: State<'_, ApprovalsState>,
) -> Result<Vec<ApprovalRequest>, String> {
    Ok(state.list_pending())
}

/// 审批响应（批准/拒绝）
#[tauri::command]
#[specta::specta]
pub async fn approval_respond(
    state: State<'_, ApprovalsState>,
    request_id: String,
    approved: bool,
    reason: Option<String>,
) -> Result<ApprovalRequest, String> {
    info!(request_id = %request_id, approved = approved, reason = ?reason, "HITL: 审批响应");

    match state.respond(&request_id, approved) {
        Some(req) => {
            // 记录审批事件到审计日志（如果 event store 可用）
            info!(request_id = %req.id, tool = %req.tool_name, "审批已处理");
            Ok(req)
        }
        None => Err(format!("审批请求未找到: {}", request_id)),
    }
}

/// Agent 发起审批请求（供 ToolPipeline 调用）
#[tauri::command]
#[specta::specta]
pub async fn approval_create(
    state: State<'_, ApprovalsState>,
    thread_id: String,
    turn_id: String,
    tool_name: String,
    tool_call_id: String,
    parameters: serde_json::Value,
) -> Result<String, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let req = ApprovalRequest {
        id: id.clone(),
        thread_id,
        turn_id,
        tool_name,
        tool_call_id,
        parameters,
        requested_at: chrono::Utc::now().to_rfc3339(),
        status: "pending".into(),
    };
    state.push(req);
    Ok(id)
}

// === G17: HITL 审批增强 — 规则引擎 + 超时处理 + 审批历史 ===

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct ApprovalRule {
    pub id: String,
    pub name: String,
    pub trigger: ApprovalTrigger,
    pub require_approval: bool,
    pub auto_approve_after_secs: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "snake_case", tag = "type")]
pub enum ApprovalTrigger {
    ShellCommandRisky { pattern: String },
    FileSystemWrite { path_pattern: String },
    NetworkRequest { host_pattern: String },
    AiToolCostExceeds { max_cost: f64 },
    ToolNameExact { tool_name: String },
    ToolNameContains { tool_name: String },
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct ApprovalHistoryEntry {
    pub id: String,
    pub tool_name: String,
    pub decision: String,       // "approved" | "rejected" | "timeout_approved" | "timeout_rejected"
    pub decided_at_ms: i64,
    pub auto: bool,
}

#[tauri::command]
#[specta::specta]
pub fn approval_rules_list(
    state: State<'_, ApprovalsState>,
) -> Vec<ApprovalRule> {
    state.rules.lock().map(|r| r.clone()).unwrap_or_default()
}

#[tauri::command]
#[specta::specta]
pub fn approval_rules_save(
    rule: ApprovalRule,
    state: State<'_, ApprovalsState>,
) -> Result<(), String> {
    if let Ok(mut rules) = state.rules.lock() {
        rules.retain(|r| r.id != rule.id);
        rules.push(rule);
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn approval_rules_delete(
    rule_id: String,
    state: State<'_, ApprovalsState>,
) -> Result<(), String> {
    if let Ok(mut rules) = state.rules.lock() {
        rules.retain(|r| r.id != rule_id);
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn approval_list_history(
    state: State<'_, ApprovalsState>,
) -> Vec<ApprovalHistoryEntry> {
    state.history.lock().map(|h| h.clone()).unwrap_or_default()
}

#[tauri::command]
#[specta::specta]
pub fn approval_process_timeouts(
    state: State<'_, ApprovalsState>,
) -> Result<u32, String> {
    let now = chrono::Utc::now();
    let mut processed = 0u32;

    if let Ok(mut requests) = state.inner.lock() {
        for req in requests.iter_mut() {
            if req.status != "pending" {
                continue;
            }

            let requested_at = match chrono::DateTime::parse_from_rfc3339(&req.requested_at) {
                Ok(dt) => dt.with_timezone(&chrono::Utc),
                Err(_) => continue,
            };

            let elapsed = now.signed_duration_since(requested_at).num_seconds() as u64;
            let timeout_secs = 300; // 默认 5 分钟超时

            if elapsed >= timeout_secs {
                req.status = "approved".into();
                processed += 1;

                let history_entry = ApprovalHistoryEntry {
                    id: req.id.clone(),
                    tool_name: req.tool_name.clone(),
                    decision: "timeout_approved".into(),
                    decided_at_ms: now.timestamp_millis(),
                    auto: true,
                };
                if let Ok(mut history) = state.history.lock() {
                    history.push(history_entry);
                }

                info!("[HITL] Auto-approved after timeout: {} ({})", req.tool_name, req.id);
            }
        }
    }

    Ok(processed)
}
