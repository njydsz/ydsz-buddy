//! # 工具权限白名单系统（P2-12）
//!
//! 提供基于白名单的工具权限控制：
//!
//! - [`ToolPermissions`] — 权限配置（白名单 / 黑名单 / 审批模式）
//! - [`PermissionDecision`] — 权限检查结果
//! - [`PermissionMode`] — 权限模式（AllowAll / Allowlist / ApproveEach）
//!
//! ## 设计
//!
//! - 三级权限模式：全部允许 / 白名单 / 逐次审批
//! - 支持黑名单（即使白名单允许也可被黑名单阻止）
//! - 配置可持久化为 JSON 文件
//! - 与 `ToolRegistry` 配合使用

use std::collections::{HashMap, HashSet};

use crate::models::RuntimeMode;
use serde::{Deserialize, Serialize};
use tracing::info;

/// 权限模式
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PermissionMode {
    /// 全部允许（默认，无限制）
    AllowAll,
    /// 仅白名单中的工具允许
    Allowlist,
    /// 每次调用都需要审批
    ApproveEach,
}

impl Default for PermissionMode {
    fn default() -> Self {
        Self::AllowAll
    }
}

/// 权限检查结果
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PermissionDecision {
    /// 允许执行
    Allowed,
    /// 被黑名单拒绝
    Denied,
    /// 需要用户审批
    NeedsApproval,
    /// 工具不在白名单中
    NotInAllowlist,
}

impl PermissionDecision {
    pub fn is_allowed(&self) -> bool {
        matches!(self, Self::Allowed)
    }

    pub fn is_denied(&self) -> bool {
        !self.is_allowed()
    }
}

/// 工具权限配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolPermissions {
    /// 权限模式
    pub mode: PermissionMode,
    /// 白名单（Allowlist 模式下生效）
    #[serde(default)]
    pub allowlist: HashSet<String>,
    /// 黑名单（所有模式下生效，优先级最高）
    #[serde(default)]
    pub blocklist: HashSet<String>,
    /// 按模式覆盖权限
    #[serde(default)]
    pub mode_overrides: HashMap<String, ModePermissionOverride>,
}

/// 按运行时模式的权限覆盖
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModePermissionOverride {
    /// Work 模式下的额外白名单
    #[serde(default)]
    pub work_allowlist: HashSet<String>,
    /// Code 模式下的额外白名单
    #[serde(default)]
    pub code_allowlist: HashSet<String>,
    /// Work 模式下的额外黑名单
    #[serde(default)]
    pub work_blocklist: HashSet<String>,
    /// Code 模式下的额外黑名单
    #[serde(default)]
    pub code_blocklist: HashSet<String>,
}

impl Default for ToolPermissions {
    fn default() -> Self {
        Self {
            mode: PermissionMode::AllowAll,
            allowlist: HashSet::new(),
            blocklist: HashSet::new(),
            mode_overrides: HashMap::new(),
        }
    }
}

impl ToolPermissions {
    /// 创建 AllowAll 模式配置
    pub fn allow_all() -> Self {
        Self::default()
    }

    /// 创建 Allowlist 模式配置
    pub fn allowlist(tools: Vec<String>) -> Self {
        Self {
            mode: PermissionMode::Allowlist,
            allowlist: tools.into_iter().collect(),
            blocklist: HashSet::new(),
            mode_overrides: HashMap::new(),
        }
    }

    /// 创建 ApproveEach 模式配置
    pub fn approve_each() -> Self {
        Self {
            mode: PermissionMode::ApproveEach,
            ..Default::default()
        }
    }

    /// 添加到白名单
    pub fn allow(&mut self, tool: &str) {
        self.allowlist.insert(tool.to_string());
    }

    /// 添加到黑名单
    pub fn block(&mut self, tool: &str) {
        self.blocklist.insert(tool.to_string());
    }

    /// 检查工具是否被允许执行
    pub fn check(&self, tool_name: &str, mode: &RuntimeMode) -> PermissionDecision {
        // 1. 先检查全局黑名单
        if self.blocklist.contains(tool_name) {
            return PermissionDecision::Denied;
        }

        // 2. 检查模式覆盖的黑名单
        if let Some(override_cfg) = self.find_override(mode) {
            let blocklist = match mode {
                RuntimeMode::Work => &override_cfg.work_blocklist,
                RuntimeMode::Code => &override_cfg.code_blocklist,
            };
            if blocklist.contains(tool_name) {
                return PermissionDecision::Denied;
            }
        }

        // 3. 根据模式检查
        match self.mode {
            PermissionMode::AllowAll => PermissionDecision::Allowed,
            PermissionMode::Allowlist => {
                // 检查全局白名单
                if self.allowlist.contains(tool_name) {
                    return PermissionDecision::Allowed;
                }
                // 检查模式覆盖的白名单
                if let Some(override_cfg) = self.find_override(mode) {
                    let allowlist = match mode {
                        RuntimeMode::Work => &override_cfg.work_allowlist,
                        RuntimeMode::Code => &override_cfg.code_allowlist,
                    };
                    if allowlist.contains(tool_name) {
                        return PermissionDecision::Allowed;
                    }
                }
                PermissionDecision::NotInAllowlist
            }
            PermissionMode::ApproveEach => PermissionDecision::NeedsApproval,
        }
    }

    /// 查找模式覆盖配置
    fn find_override(&self, _mode: &RuntimeMode) -> Option<&ModePermissionOverride> {
        // 使用固定的 key（简化实现）
        self.mode_overrides.get("default")
    }

    /// 从 JSON 文件加载
    pub fn load_from_file(path: &str) -> Result<Self, String> {
        let content = std::fs::read_to_string(path)
            .map_err(|e| format!("读取权限配置失败: {e}"))?;
        serde_json::from_str(&content).map_err(|e| format!("解析权限配置失败: {e}"))
    }

    /// 保存到 JSON 文件
    pub fn save_to_file(&self, path: &str) -> Result<(), String> {
        let content = serde_json::to_string_pretty(self)
            .map_err(|e| format!("序列化权限配置失败: {e}"))?;
        std::fs::write(path, content)
            .map_err(|e| format!("写入权限配置失败: {e}"))
    }

    /// 获取当前白名单列表
    pub fn allowed_tools(&self) -> Vec<String> {
        let mut tools: Vec<String> = self.allowlist.iter().cloned().collect();
        tools.sort();
        tools
    }

    /// 获取当前黑名单列表
    pub fn blocked_tools(&self) -> Vec<String> {
        let mut tools: Vec<String> = self.blocklist.iter().cloned().collect();
        tools.sort();
        tools
    }
}

// ============================================================================
// 权限管理器
// ============================================================================

/// 权限管理器
///
/// 维护工具权限配置，提供权限检查接口。
pub struct PermissionManager {
    permissions: std::sync::Mutex<ToolPermissions>,
    /// 审批回调（在 ApproveEach 模式下被调用）
    approval_callback: Option<Box<dyn Fn(&str) -> bool + Send + Sync>>,
}

impl Default for PermissionManager {
    fn default() -> Self {
        Self::new()
    }
}

impl PermissionManager {
    /// 创建新的权限管理器（默认 AllowAll）
    pub fn new() -> Self {
        Self {
            permissions: std::sync::Mutex::new(ToolPermissions::default()),
            approval_callback: None,
        }
    }

    /// 创建指定模式的权限管理器
    pub fn with_mode(mode: PermissionMode) -> Self {
        Self {
            permissions: std::sync::Mutex::new(ToolPermissions {
                mode,
                ..Default::default()
            }),
            approval_callback: None,
        }
    }

    /// 从配置创建
    pub fn from_config(config: ToolPermissions) -> Self {
        Self {
            permissions: std::sync::Mutex::new(config),
            approval_callback: None,
        }
    }

    /// 设置审批回调
    pub fn set_approval_callback<F>(&mut self, callback: F)
    where
        F: Fn(&str) -> bool + Send + Sync + 'static,
    {
        self.approval_callback = Some(Box::new(callback));
    }

    /// 检查工具权限
    pub fn check(&self, tool_name: &str, mode: &RuntimeMode) -> PermissionDecision {
        let permissions = self.permissions.lock().unwrap();
        let decision = permissions.check(tool_name, mode);
        drop(permissions);

        // 如果需要审批，调用回调
        if decision == PermissionDecision::NeedsApproval {
            if let Some(ref callback) = self.approval_callback {
                if callback(tool_name) {
                    return PermissionDecision::Allowed;
                } else {
                    return PermissionDecision::Denied;
                }
            }
        }

        decision
    }

    /// 添加白名单
    pub fn allow(&self, tool: &str) {
        let mut perms = self.permissions.lock().unwrap();
        perms.allow(tool);
    }

    /// 添加黑名单
    pub fn block(&self, tool: &str) {
        let mut perms = self.permissions.lock().unwrap();
        perms.block(tool);
    }

    /// 设置权限模式
    pub fn set_mode(&self, mode: PermissionMode) {
        let mut perms = self.permissions.lock().unwrap();
        perms.mode = mode;
    }

    /// 获取当前权限配置快照
    pub fn snapshot(&self) -> ToolPermissions {
        self.permissions.lock().unwrap().clone()
    }

    /// 从文件加载配置
    pub fn load_from_file(&self, path: &str) -> Result<(), String> {
        let config = ToolPermissions::load_from_file(path)?;
        let mut perms = self.permissions.lock().unwrap();
        *perms = config;
        info!(path = %path, "加载权限配置");
        Ok(())
    }

    /// 保存配置到文件
    pub fn save_to_file(&self, path: &str) -> Result<(), String> {
        let perms = self.permissions.lock().unwrap();
        perms.save_to_file(path)
    }

    /// 批量检查工具权限
    pub fn check_batch(&self, tool_names: &[String], mode: &RuntimeMode) -> HashMap<String, PermissionDecision> {
        tool_names
            .iter()
            .map(|name| (name.clone(), self.check(name, mode)))
            .collect()
    }

    /// 过滤出允许执行的工具列表
    pub fn filter_allowed(&self, tool_names: &[String], mode: &RuntimeMode) -> Vec<String> {
        tool_names
            .iter()
            .filter(|name| self.check(name, mode).is_allowed())
            .cloned()
            .collect()
    }
}

// ============================================================================
// 预设权限模板
// ============================================================================

/// 安全预设：仅允许读取类工具
pub fn safe_readonly_preset() -> ToolPermissions {
    ToolPermissions {
        mode: PermissionMode::Allowlist,
        allowlist: vec![
            "search_web".to_string(),
            "search_fetch_url".to_string(),
            "search_fetch_url_summary".to_string(),
            "browser_extract".to_string(),
            "browser_get_page_source".to_string(),
            "browser_screenshot".to_string(),
            "browser_get_title".to_string(),
            "browser_get_url".to_string(),
            "office_docx_read".to_string(),
            "office_xlsx_read".to_string(),
            "office_pdf_extract".to_string(),
            "sandbox_analyze_csv".to_string(),
            "sandbox_analyze_json".to_string(),
            "fs_list_directory".to_string(),
            "fs_read_file".to_string(),
            "fs_search_files".to_string(),
            "fs_file_info".to_string(),
            "indexer_search_symbols".to_string(),
            "indexer_search_text".to_string(),
            "semantic_search".to_string(),
            "lsp_goto_definition".to_string(),
            "lsp_references".to_string(),
            "lsp_hover".to_string(),
            "lsp_diagnostics".to_string(),
            "ocr_recognize_text".to_string(),
            "ocr_recognize_from_path".to_string(),
        ]
        .into_iter()
        .collect(),
        blocklist: HashSet::new(),
        mode_overrides: HashMap::new(),
    }
}

/// 完全信任预设：允许所有工具
pub fn full_trust_preset() -> ToolPermissions {
    ToolPermissions::allow_all()
}

/// 审批模式预设：每次调用都需要审批
pub fn approve_each_preset() -> ToolPermissions {
    ToolPermissions::approve_each()
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_allow_all_mode() {
        let perms = ToolPermissions::allow_all();
        let decision = perms.check("search_web", &RuntimeMode::Work);
        assert_eq!(decision, PermissionDecision::Allowed);
    }

    #[test]
    fn test_allowlist_mode_allowed() {
        let perms = ToolPermissions::allowlist(vec!["search_web".to_string()]);
        let decision = perms.check("search_web", &RuntimeMode::Work);
        assert_eq!(decision, PermissionDecision::Allowed);
    }

    #[test]
    fn test_allowlist_mode_not_in_list() {
        let perms = ToolPermissions::allowlist(vec!["search_web".to_string()]);
        let decision = perms.check("runner_execute", &RuntimeMode::Code);
        assert_eq!(decision, PermissionDecision::NotInAllowlist);
    }

    #[test]
    fn test_blocklist_overrides_allowlist() {
        let mut perms = ToolPermissions::allowlist(vec!["search_web".to_string()]);
        perms.block("search_web");
        let decision = perms.check("search_web", &RuntimeMode::Work);
        assert_eq!(decision, PermissionDecision::Denied);
    }

    #[test]
    fn test_approve_each_mode() {
        let perms = ToolPermissions::approve_each();
        let decision = perms.check("search_web", &RuntimeMode::Work);
        assert_eq!(decision, PermissionDecision::NeedsApproval);
    }

    #[test]
    fn test_permission_manager_allow_all() {
        let mgr = PermissionManager::new();
        assert!(mgr.check("any_tool", &RuntimeMode::Work).is_allowed());
    }

    #[test]
    fn test_permission_manager_allowlist() {
        let mgr = PermissionManager::from_config(ToolPermissions::allowlist(vec![
            "search_web".to_string(),
        ]));
        assert!(mgr.check("search_web", &RuntimeMode::Work).is_allowed());
        assert!(!mgr.check("runner_execute", &RuntimeMode::Code).is_allowed());
    }

    #[test]
    fn test_permission_manager_block() {
        let mgr = PermissionManager::new();
        mgr.block("dangerous_tool");
        assert!(!mgr.check("dangerous_tool", &RuntimeMode::Work).is_allowed());
        assert!(mgr.check("safe_tool", &RuntimeMode::Work).is_allowed());
    }

    #[test]
    fn test_permission_manager_approval_callback() {
        let mut mgr = PermissionManager::with_mode(PermissionMode::ApproveEach);
        mgr.set_approval_callback(|tool_name| tool_name == "approved_tool");

        assert!(mgr.check("approved_tool", &RuntimeMode::Work).is_allowed());
        assert!(!mgr.check("unapproved_tool", &RuntimeMode::Work).is_allowed());
    }

    #[test]
    fn test_permission_manager_filter_allowed() {
        let mgr = PermissionManager::from_config(ToolPermissions::allowlist(vec![
            "search_web".to_string(),
            "fs_read_file".to_string(),
        ]));

        let tools = vec![
            "search_web".to_string(),
            "runner_execute".to_string(),
            "fs_read_file".to_string(),
            "blocked".to_string(),
        ];
        let allowed = mgr.filter_allowed(&tools, &RuntimeMode::Work);
        assert_eq!(allowed.len(), 2);
        assert!(allowed.contains(&"search_web".to_string()));
        assert!(allowed.contains(&"fs_read_file".to_string()));
    }

    #[test]
    fn test_safe_readonly_preset() {
        let perms = safe_readonly_preset();
        // 读取工具应该被允许
        assert!(perms.check("search_web", &RuntimeMode::Work).is_allowed());
        assert!(perms.check("fs_read_file", &RuntimeMode::Work).is_allowed());
        // 写入/执行工具不应该被允许
        assert!(!perms.check("runner_execute", &RuntimeMode::Code).is_allowed());
        assert!(!perms.check("fs_write_file", &RuntimeMode::Work).is_allowed());
        assert!(!perms.check("multi_edit_execute", &RuntimeMode::Code).is_allowed());
    }

    #[test]
    fn test_full_trust_preset() {
        let perms = full_trust_preset();
        assert!(perms.check("any_tool", &RuntimeMode::Work).is_allowed());
        assert!(perms.check("any_tool", &RuntimeMode::Code).is_allowed());
    }

    #[test]
    fn test_save_and_load() {
        let perms = ToolPermissions::allowlist(vec!["tool_a".to_string(), "tool_b".to_string()]);
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("permissions.json");

        perms.save_to_file(path.to_str().unwrap()).unwrap();
        assert!(path.exists());

        let loaded = ToolPermissions::load_from_file(path.to_str().unwrap()).unwrap();
        assert_eq!(loaded.mode, PermissionMode::Allowlist);
        assert!(loaded.allowlist.contains("tool_a"));
        assert!(loaded.allowlist.contains("tool_b"));
    }

    #[test]
    fn test_permission_decision_helpers() {
        assert!(PermissionDecision::Allowed.is_allowed());
        assert!(!PermissionDecision::Allowed.is_denied());
        assert!(PermissionDecision::Denied.is_denied());
        assert!(PermissionDecision::NeedsApproval.is_denied());
        assert!(PermissionDecision::NotInAllowlist.is_denied());
    }

    #[test]
    fn test_check_batch() {
        let mgr = PermissionManager::from_config(ToolPermissions::allowlist(vec![
            "tool_a".to_string(),
        ]));
        let tools = vec!["tool_a".to_string(), "tool_b".to_string()];
        let results = mgr.check_batch(&tools, &RuntimeMode::Work);
        assert_eq!(results.len(), 2);
        assert_eq!(results["tool_a"], PermissionDecision::Allowed);
        assert_eq!(results["tool_b"], PermissionDecision::NotInAllowlist);
    }

    #[test]
    fn test_set_mode() {
        let mgr = PermissionManager::new();
        assert!(mgr.check("any", &RuntimeMode::Work).is_allowed());

        mgr.set_mode(PermissionMode::Allowlist);
        assert!(!mgr.check("any", &RuntimeMode::Work).is_allowed());
    }
}
