//! # HITL (Human-in-the-Loop) 审批装配（增强版）
//!
//! 管理工具调用审批流程：
//! - Agent 发起高风险操作时创建 ApprovalRequest
//! - 前端展示待审批列表
//! - 用户决定批准/拒绝后通过 approval_respond 响应
//!
//! ## 增强功能
//!
//! | 功能 | 说明 |
//! |------|------|
//! | 条件审批规则 | 基于风险评分、工具类型、调度时间自动路由审批级别 |
//! | 审批委托 | 用户可将审批权限持久委托给另一个用户（如请假/出差场景） |
//! | 审批策略 | 并行审批（任意一个通过即通过）/ 串行审批（按顺序逐一通过） |
//!
//! 对标 Octop 的 HITL 审批 + ToolGuard 安全策略。

use tauri::State;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tracing::{info, warn};

use ydsz_core::commands::OrchestrationCommand;
use crate::ServerState;

// ===== 类型 =====

/// 审批发起人身份
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ApprovalRequester {
    Agent,
    SubAgent,
    User,
    System,
}

/// 审批风险等级
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "snake_case")]
pub enum RiskLevel {
    Low,
    Medium,
    High,
    Critical,
}

/// 审批策略
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ApprovalStrategy {
    /// 单一审批：任何一个审批人通过即通过
    Single,
    /// 并行审批：所有审批人中任意一个通过即通过
    Parallel,
    /// 串行审批：按顺序逐一通过
    Sequential,
    /// 全员同意：所有审批人必须全部通过
    Unanimous,
}

/// 审批请求（Agent/SubAgent 发起高风险操作时创建）
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
    pub status: String,  // "pending" | "approved" | "rejected" | "delegated" | "timeout"
    pub risk_level: String, // "low" | "medium" | "high" | "critical"
    pub strategy: String, // "single" | "parallel" | "sequential" | "unanimous"
    pub assignee: Option<String>,  // 指定审批人（"any" 或具体用户名）
    pub asked_assignees: Vec<String>,  // 已询问过的审批人
    pub responses: Vec<ApprovalResponse>,  // 审批人响应记录
    pub description: Option<String>,  // 人类可读的审批描述
    pub requester: String, // "agent" | "subagent" | "user" | "system"
}

/// 单个审批人响应
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApprovalResponse {
    pub assignee: String,
    pub approved: bool,
    pub reason: Option<String>,
    pub responded_at: String,
}

/// 审批规则（条件路由）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApprovalRule {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    /// 工具名称前缀匹配（如 "bash", "multi_edit"）
    pub tool_prefix: Option<Vec<String>>,
    /// 参数中包含某个 key 时触发
    pub param_contains: Option<Vec<String>>,
    /// 风险等级阈值（>= 该等级触发）
    pub min_risk: Option<String>,
    /// 审批策略
    pub strategy: String,
    /// 指定审批人列表（为空则任意）
    pub assignees: Vec<String>,
    /// 超时秒数
    pub timeout_seconds: Option<i64>,
}

/// 审批委托
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApprovalDelegation {
    pub id: String,
    pub from_user: String,     // 委托人
    pub to_user: String,       // 被委托人
    pub created_at: String,
    pub expires_at: Option<String>,  // None = 永久
    pub enabled: bool,
    /// 仅委托特定工具类型的审批（None = 全部）
    pub scope: Option<Vec<String>>,
}

// ===== 状态 =====

/// 审批状态存储
#[derive(Debug, Clone)]
pub struct ApprovalsState {
    inner: Arc<Mutex<ApprovalsInner>>,
}

#[derive(Debug, Clone)]
struct ApprovalsInner {
    requests: Vec<ApprovalRequest>,
    rules: Vec<ApprovalRule>,
    delegations: Vec<ApprovalDelegation>,
}

impl ApprovalsState {
    pub fn new() -> Self {
        // 加载默认规则
        let default_rules = vec![
            // 规则 1: shell/exec 类命令 → 高级审批
            ApprovalRule {
                id: "rule-shell-dangerous".into(),
                name: "Shell 高风险命令".into(),
                enabled: true,
                tool_prefix: Some(vec!["bash".into(), "shell".into(), "exec".into()]),
                param_contains: Some(vec!["rm -rf".into(), "sudo".into(), "chmod 777".into()]),
                min_risk: Some("high".into()),
                strategy: "single".into(),
                assignees: vec![],
                timeout_seconds: Some(300),
            },
            // 规则 2: git push --force 或 main 分支推送 → 高级审批
            ApprovalRule {
                id: "rule-git-push-main".into(),
                name: "Git 推送受保护分支".into(),
                enabled: true,
                tool_prefix: Some(vec!["git_push".into()]),
                param_contains: Some(vec!["--force".into(), "main".into(), "master".into()]),
                min_risk: Some("high".into()),
                strategy: "single".into(),
                assignees: vec![],
                timeout_seconds: Some(300),
            },
            // 规则 3: 文件写入到系统敏感路径 → 需高级审批
            ApprovalRule {
                id: "rule-fs-system-path".into(),
                name: "文件系统系统路径".into(),
                enabled: true,
                tool_prefix: Some(vec!["write".into(), "multi_edit".into()]),
                param_contains: Some(vec!["C:\\Windows".into(), "/etc/".into(), "/usr/".into()]),
                min_risk: Some("critical".into()),
                strategy: "single".into(),
                assignees: vec![],
                timeout_seconds: Some(600),
            },
        ];

        Self {
            inner: Arc::new(Mutex::new(ApprovalsInner {
                requests: Vec::new(),
                rules: default_rules,
                delegations: Vec::new(),
            })),
        }
    }

    // ---- 规则管理 ----

    pub fn list_rules(&self) -> Vec<ApprovalRule> {
        self.inner.lock().unwrap().rules.clone()
    }

    pub fn add_rule(&self, rule: ApprovalRule) {
        let mut inner = self.inner.lock().unwrap();
        inner.rules.push(rule);
        info!(rule_count = inner.rules.len(), "审批规则已更新");
    }

    pub fn remove_rule(&self, rule_id: &str) -> bool {
        let mut inner = self.inner.lock().unwrap();
        let before = inner.rules.len();
        inner.rules.retain(|r| r.id != rule_id);
        inner.rules.len() < before
    }

    pub fn update_rule(&self, rule_id: &str, enabled: bool) -> bool {
        let mut inner = self.inner.lock().unwrap();
        if let Some(rule) = inner.rules.iter_mut().find(|r| r.id == rule_id) {
            rule.enabled = enabled;
            true
        } else {
            false
        }
    }

    /// 根据规则计算工具的风险等级和审批策略
    pub fn evaluate_risk(&self, tool_name: &str, params: &serde_json::Value) -> (RiskLevel, ApprovalStrategy, Vec<String>) {
        let inner = self.inner.lock().unwrap();
        let params_str = params.to_string();

        let mut max_risk = RiskLevel::Low;
        let mut strategy = ApprovalStrategy::Single;
        let mut assignees = Vec::new();

        for rule in &inner.rules {
            if !rule.enabled { continue; }

            let mut matches = false;

            // Check tool_prefix
            if let Some(prefixes) = &rule.tool_prefix {
                if prefixes.iter().any(|p| tool_name.starts_with(p)) {
                    matches = true;
                }
            }

            // Check param_contains
            if !matches {
                if let Some(keywords) = &rule.param_contains {
                    if keywords.iter().any(|kw| params_str.contains(kw)) {
                        matches = true;
                    }
                }
            }

            if matches {
                // Compare risk level
                let rule_risk = parse_risk_level(rule.min_risk.as_deref().unwrap_or("low"));
                if rule_risk > max_risk {
                    max_risk = rule_risk;

                    // Parse strategy
                    strategy = match rule.strategy.as_str() {
                        "parallel" => ApprovalStrategy::Parallel,
                        "sequential" => ApprovalStrategy::Sequential,
                        "unanimous" => ApprovalStrategy::Unanimous,
                        _ => ApprovalStrategy::Single,
                    };

                    // Merge assignees
                    if !rule.assignees.is_empty() {
                        assignees = rule.assignees.clone();
                    }
                }
            }
        }

        (max_risk, strategy, assignees)
    }

    // ---- 委托管理 ----

    pub fn list_delegations(&self) -> Vec<ApprovalDelegation> {
        self.inner.lock().unwrap().delegations.clone()
    }

    pub fn add_delegation(&self, delegation: ApprovalDelegation) {
        let mut inner = self.inner.lock().unwrap();
        inner.delegations.push(delegation);
        info!(count = inner.delegations.len(), "审批委托已更新");
    }

    pub fn revoke_delegation(&self, delegation_id: &str) -> bool {
        let mut inner = self.inner.lock().unwrap();
        let before = inner.delegations.len();
        inner.delegations.retain(|d| d.id != delegation_id);
        inner.delegations.len() < before
    }

    /// 解析有效的委托（from_user → to_user），考虑过期时间和范围
    pub fn resolve_effective_assignee(&self, original_assignee: &str, tool_name: &str) -> String {
        let inner = self.inner.lock().unwrap();
        let now = chrono::Utc::now();

        for d in &inner.delegations {
            if !d.enabled { continue; }
            if d.from_user != original_assignee { continue; }

            // Check expiration
            if let Some(expires) = &d.expires_at {
                if let Ok(exp) = chrono::DateTime::parse_from_rfc3339(expires) {
                    if now > exp { continue; }
                }
            }

            // Check scope
            if let Some(scope) = &d.scope {
                if !scope.iter().any(|s| tool_name.starts_with(s)) {
                    continue;
                }
            }

            info!(from = %d.from_user, to = %d.to_user, "审批委托生效");
            return d.to_user.clone();
        }

        original_assignee.to_string()
    }

    // ---- 请求生命周期 ----

    pub fn list_pending(&self) -> Vec<ApprovalRequest> {
        self.inner.lock().unwrap().requests.iter()
            .filter(|r| r.status == "pending" || r.status == "delegated")
            .cloned()
            .collect()
    }

    pub fn get_request(&self, id: &str) -> Option<ApprovalRequest> {
        self.inner.lock().unwrap().requests.iter().find(|r| r.id == id).cloned()
    }

    pub fn push(&self, mut req: ApprovalRequest) {
        let mut inner = self.inner.lock().unwrap();

        // Resolve delegation
        if let Some(ref assignee) = req.assignee {
            let resolved = self.resolve_effective_assignee(assignee, &req.tool_name);
            if resolved != *assignee {
                info!(original = %assignee, resolved = %resolved, "审批人已委托");
                req.assignee = Some(resolved.clone());
                req.status = "delegated".into();
                req.asked_assignees.push(resolved);
            }
        }

        inner.requests.push(req);
    }

    pub fn respond(
        &self,
        request_id: &str,
        assignee: &str,
        approved: bool,
        reason: Option<&str>,
    ) -> Option<ApprovalRequest> {
        let mut inner = self.inner.lock().unwrap();
        if let Some(req) = inner.requests.iter_mut().find(|r| r.id == request_id) {
            // Record response
            req.responses.push(ApprovalResponse {
                assignee: assignee.to_string(),
                approved,
                reason: reason.map(|s| s.to_string()),
                responded_at: chrono::Utc::now().to_rfc3339(),
            });

            // Determine status based on strategy
            match req.strategy.as_str() {
                "unanimous" => {
                    // All assignees must approve
                    let total_approvals = req.responses.iter().filter(|r| r.approved).count();
                    let total_rejections = req.responses.iter().filter(|r| !r.approved).count();

                    if total_rejections > 0 {
                        req.status = "rejected".into();
                    } else if total_approvals >= req.assignee.as_ref().map(|_| 1).unwrap_or(1) {
                        // For unanimous with single assignee, one approval suffices
                        req.status = "approved".into();
                    }
                }
                "parallel" | "single" => {
                    if approved {
                        req.status = "approved".into();
                    } else {
                        // Check if more assignees to ask
                        req.status = "rejected".into();
                    }
                }
                "sequential" => {
                    if approved {
                        req.status = "approved".into();
                    } else {
                        req.status = "rejected".into();
                    }
                }
                _ => {
                    if approved {
                        req.status = "approved".into();
                    } else {
                        req.status = "rejected".into();
                    }
                }
            }

            return Some(req.clone());
        }
        None
    }

    pub fn count(&self) -> usize {
        self.inner.lock().unwrap().requests.len()
    }
}

impl Default for ApprovalsState {
    fn default() -> Self {
        Self::new()
    }
}

// ===== 辅助函数 =====

fn parse_risk_level(s: &str) -> RiskLevel {
    match s.to_lowercase().as_str() {
        "critical" => RiskLevel::Critical,
        "high" => RiskLevel::High,
        "medium" => RiskLevel::Medium,
        _ => RiskLevel::Low,
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

/// 获取单个审批请求详情
#[tauri::command]
#[specta::specta]
pub async fn approval_get(
    state: State<'_, ApprovalsState>,
    request_id: String,
) -> Result<Option<ApprovalRequest>, String> {
    Ok(state.get_request(&request_id))
}

/// 审批响应（批准/拒绝）
#[tauri::command]
#[specta::specta]
pub async fn approval_respond(
    state: State<'_, ApprovalsState>,
    request_id: String,
    assignee: String,
    approved: bool,
    reason: Option<String>,
) -> Result<ApprovalRequest, String> {
    info!(request_id = %request_id, assignee = %assignee, approved = approved, reason = ?reason, "HITL: 审批响应");

    match state.respond(&request_id, &assignee, approved, reason.as_deref()) {
        Some(req) => {
            info!(request_id = %req.id, tool = %req.tool_name, status = %req.status, "审批已处理");
            Ok(req)
        }
        None => Err(format!("审批请求未找到: {request_id}")),
    }
}

/// Agent 发起审批请求（自动根据规则计算风险等级和策略）
#[tauri::command]
#[specta::specta]
pub async fn approval_create(
    state: State<'_, ApprovalsState>,
    thread_id: String,
    turn_id: String,
    tool_name: String,
    tool_call_id: String,
    parameters: serde_json::Value,
    requester: Option<String>,
) -> Result<String, String> {
    let id = uuid::Uuid::new_v4().to_string();

    // Evaluate risk level and strategy based on rules
    let (risk_level, strategy, assignees) = state.evaluate_risk(&tool_name, &parameters);

    // Build description
    let description = format!(
        "{} 请求执行: {} (风险: {:?})",
        requester.as_deref().unwrap_or("agent"),
        tool_name,
        risk_level
    );

    let req = ApprovalRequest {
        id: id.clone(),
        thread_id,
        turn_id,
        tool_name,
        tool_call_id,
        parameters,
        requested_at: chrono::Utc::now().to_rfc3339(),
        status: "pending".into(),
        risk_level: format!("{:?}", risk_level).to_lowercase(),
        strategy: match strategy {
            ApprovalStrategy::Single => "single",
            ApprovalStrategy::Parallel => "parallel",
            ApprovalStrategy::Sequential => "sequential",
            ApprovalStrategy::Unanimous => "unanimous",
        }.into(),
        assignee: assignees.first().cloned(),
        asked_assignees: Vec::new(),
        responses: Vec::new(),
        description: Some(description),
        requester: requester.unwrap_or_else(|| "agent".into()),
    };

    state.push(req);
    Ok(id)
}

// ---- 规则管理命令 ----

/// 列出所有审批规则
#[tauri::command]
#[specta::specta]
pub async fn approval_list_rules(
    state: State<'_, ApprovalsState>,
) -> Result<Vec<ApprovalRule>, String> {
    Ok(state.list_rules())
}

/// 创建审批规则
#[tauri::command]
#[specta::specta]
pub async fn approval_add_rule(
    state: State<'_, ApprovalsState>,
    name: String,
    tool_prefix: Option<Vec<String>>,
    param_contains: Option<Vec<String>>,
    min_risk: Option<String>,
    strategy: String,
    assignees: Option<Vec<String>>,
    timeout_seconds: Option<i64>,
) -> Result<ApprovalRule, String> {
    let rule = ApprovalRule {
        id: uuid::Uuid::new_v4().to_string(),
        name,
        enabled: true,
        tool_prefix,
        param_contains,
        min_risk,
        strategy,
        assignees: assignees.unwrap_or_default(),
        timeout_seconds,
    };

    state.add_rule(rule.clone());
    Ok(rule)
}

/// 删除审批规则
#[tauri::command]
#[specta::specta]
pub async fn approval_remove_rule(
    state: State<'_, ApprovalsState>,
    rule_id: String,
) -> Result<bool, String> {
    Ok(state.remove_rule(&rule_id))
}

/// 启用/禁用审批规则
#[tauri::command]
#[specta::specta]
pub async fn approval_set_rule_enabled(
    state: State<'_, ApprovalsState>,
    rule_id: String,
    enabled: bool,
) -> Result<bool, String> {
    Ok(state.update_rule(&rule_id, enabled))
}

// ---- 委托管理命令 ----

/// 列出所有审批委托
#[tauri::command]
#[specta::specta]
pub async fn approval_list_delegations(
    state: State<'_, ApprovalsState>,
) -> Result<Vec<ApprovalDelegation>, String> {
    Ok(state.list_delegations())
}

/// 创建审批委托
#[tauri::command]
#[specta::specta]
pub async fn approval_add_delegation(
    state: State<'_, ApprovalsState>,
    from_user: String,
    to_user: String,
    expires_at: Option<String>,
    scope: Option<Vec<String>>,
) -> Result<ApprovalDelegation, String> {
    let delegation = ApprovalDelegation {
        id: uuid::Uuid::new_v4().to_string(),
        from_user,
        to_user,
        created_at: chrono::Utc::now().to_rfc3339(),
        expires_at,
        enabled: true,
        scope,
    };

    state.add_delegation(delegation.clone());
    Ok(delegation)
}

/// 撤回审批委托
#[tauri::command]
#[specta::specta]
pub async fn approval_revoke_delegation(
    state: State<'_, ApprovalsState>,
    delegation_id: String,
) -> Result<bool, String> {
    Ok(state.revoke_delegation(&delegation_id))
}

// ---- 兼容 lib.rs 已注册的命令（别名 / 历史） ----

/// 列出审批规则（别名，保持与 lib.rs 已有引用兼容）
#[tauri::command]
#[specta::specta]
pub async fn approval_rules_list(
    state: State<'_, ApprovalsState>,
) -> Result<Vec<ApprovalRule>, String> {
    Ok(state.list_rules())
}

/// 保存/创建审批规则（别名）
#[tauri::command]
#[specta::specta]
pub async fn approval_rules_save(
    state: State<'_, ApprovalsState>,
    name: String,
    tool_prefix: Option<Vec<String>>,
    param_contains: Option<Vec<String>>,
    min_risk: Option<String>,
    strategy: String,
    assignees: Option<Vec<String>>,
    timeout_seconds: Option<i64>,
) -> Result<ApprovalRule, String> {
    approval_add_rule(state, name, tool_prefix, param_contains, min_risk, strategy, assignees, timeout_seconds).await
}

/// 删除审批规则（别名）
#[tauri::command]
#[specta::specta]
pub async fn approval_rules_delete(
    state: State<'_, ApprovalsState>,
    rule_id: String,
) -> Result<bool, String> {
    Ok(state.remove_rule(&rule_id))
}

/// 列出审批历史（所有状态）
#[tauri::command]
#[specta::specta]
pub async fn approval_list_history(
    state: State<'_, ApprovalsState>,
) -> Result<Vec<ApprovalRequest>, String> {
    Ok(state.inner.lock().unwrap().requests.clone())
}

/// 处理超时审批请求
#[tauri::command]
#[specta::specta]
pub async fn approval_process_timeouts(
    state: State<'_, ApprovalsState>,
) -> Result<Vec<String>, String> {
    let mut timed_out = Vec::new();
    {
        let mut inner = state.inner.lock().unwrap();
        let now = chrono::Utc::now();

        for req in inner.requests.iter_mut() {
            if req.status != "pending" && req.status != "delegated" {
                continue;
            }

            // Default timeout: 1 hour for pending requests
            if let Ok(requested) = chrono::DateTime::parse_from_rfc3339(&req.requested_at) {
                if now.signed_duration_since(requested).num_seconds() > 3600 {
                    req.status = "timeout".into();
                    timed_out.push(req.id.clone());
                    info!(request_id = %req.id, "审批请求已超时");
                }
            }
        }
    }

    Ok(timed_out)
}
