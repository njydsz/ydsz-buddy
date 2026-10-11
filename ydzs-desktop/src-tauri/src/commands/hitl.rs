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
}

impl ApprovalsState {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(Vec::new())),
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
