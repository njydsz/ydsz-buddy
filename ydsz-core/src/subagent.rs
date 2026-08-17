//! # Subagent 运行时派生（P1-4）
//!
//! 允许主 Agent 在 Turn 中动态创建子代理 Worktree 线程。
//!
//! ## 核心概念
//!
//! - **SubagentSpec**：子代理规格（模型、角色、任务描述）
//! - **SubagentInstance**：运行中的子代理实例
//! - **SubagentManager**：管理器（派生、监控、收集结果）
//!
//! ## 运行模式
//!
//! - **Supervisor**：主 Agent 派生子代理独立执行，收集结果
//! - **PeerReview**：多个子代理互审输出，选出最优
//! - **Pipeline**：子代理串行执行，前一个输出是后一个输入

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

// ============================================================================
// 子代理标识与状态
// ============================================================================

/// 子代理唯一标识
pub type SubagentId = String;

/// 子代理运行状态
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SubagentStatus {
    /// 已创建，等待启动
    Pending,
    /// 正在运行
    Running,
    /// 已完成（成功）
    Completed,
    /// 失败
    Failed,
    /// 已取消
    Cancelled,
    /// 超时
    TimedOut,
}

/// 子代理角色
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SubagentRole {
    /// 执行者（独立完成编码任务）
    Executor,
    /// 审查者（审查代码质量）
    Reviewer,
    /// 测试者（编写和执行测试）
    Tester,
    /// 文档者（编写文档和注释）
    Documenter,
    /// 自定义
    Custom,
}

// ============================================================================
// 子代理规格
// ============================================================================

/// 子代理规格
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubagentSpec {
    /// 子代理 ID
    pub id: SubagentId,
    /// 子代理昵称
    pub nickname: String,
    /// 角色
    pub role: SubagentRole,
    /// 任务描述（发送给子代理的 prompt）
    pub task_description: String,
    /// 模型选择（可选，默认继承父 Agent 的模型）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model_override: Option<String>,
    /// 超时时间（秒，默认 300）
    #[serde(default = "default_timeout")]
    pub timeout_secs: u64,
    /// 是否使用独立 Worktree
    #[serde(default = "default_use_worktree")]
    pub use_worktree: bool,
    /// Worktree 分支名（可选）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub worktree_branch: Option<String>,
    /// 依赖的其他子代理 ID（Pipeline 模式）
    #[serde(default)]
    pub depends_on: Vec<SubagentId>,
    /// 额外上下文（如代码片段、文件路径等）
    #[serde(default)]
    pub context: HashMap<String, String>,
}

fn default_timeout() -> u64 {
    300
}

fn default_use_worktree() -> bool {
    true
}

impl SubagentSpec {
    /// 创建新的子代理规格
    pub fn new(nickname: impl Into<String>, task: impl Into<String>) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            nickname: nickname.into(),
            role: SubagentRole::Executor,
            task_description: task.into(),
            model_override: None,
            timeout_secs: default_timeout(),
            use_worktree: default_use_worktree(),
            worktree_branch: None,
            depends_on: Vec::new(),
            context: HashMap::new(),
        }
    }

    /// 设置角色
    pub fn with_role(mut self, role: SubagentRole) -> Self {
        self.role = role;
        self
    }

    /// 设置模型覆盖
    pub fn with_model(mut self, model: impl Into<String>) -> Self {
        self.model_override = Some(model.into());
        self
    }

    /// 设置超时
    pub fn with_timeout(mut self, secs: u64) -> Self {
        self.timeout_secs = secs;
        self
    }

    /// 设置是否使用 Worktree
    pub fn with_worktree(mut self, use_worktree: bool, branch: Option<String>) -> Self {
        self.use_worktree = use_worktree;
        self.worktree_branch = branch;
        self
    }

    /// 添加依赖
    pub fn depends_on(mut self, id: impl Into<SubagentId>) -> Self {
        self.depends_on.push(id.into());
        self
    }

    /// 添加上下文
    pub fn with_context(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.context.insert(key.into(), value.into());
        self
    }
}

// ============================================================================
// 子代理实例（运行中）
// ============================================================================

/// 子代理运行实例
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubagentInstance {
    /// 规格
    pub spec: SubagentSpec,
    /// 当前状态
    pub status: SubagentStatus,
    /// 子代理线程 ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thread_id: Option<String>,
    /// 父 Agent 线程 ID
    pub parent_thread_id: String,
    /// 启动时间
    #[serde(skip_serializing_if = "Option::is_none")]
    pub started_at: Option<DateTime<Utc>>,
    /// 完成时间
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<DateTime<Utc>>,
    /// 执行输出
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output: Option<String>,
    /// 错误信息（失败时）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    /// Worktree 路径
    #[serde(skip_serializing_if = "Option::is_none")]
    pub worktree_path: Option<String>,
}

impl SubagentInstance {
    /// 从规格创建运行实例
    fn from_spec(spec: SubagentSpec, parent_thread_id: impl Into<String>) -> Self {
        Self {
            spec,
            status: SubagentStatus::Pending,
            thread_id: None,
            parent_thread_id: parent_thread_id.into(),
            started_at: None,
            completed_at: None,
            output: None,
            error: None,
            worktree_path: None,
        }
    }

    /// 是否已完成（成功或失败）
    pub fn is_done(&self) -> bool {
        matches!(
            self.status,
            SubagentStatus::Completed | SubagentStatus::Failed | SubagentStatus::Cancelled | SubagentStatus::TimedOut
        )
    }

    /// 是否正在运行
    pub fn is_running(&self) -> bool {
        self.status == SubagentStatus::Running
    }

    /// 运行耗时（秒）
    pub fn elapsed_secs(&self) -> Option<u64> {
        match (self.started_at, self.completed_at) {
            (Some(start), Some(end)) => Some((end - start).num_seconds() as u64),
            (Some(start), None) => Some((Utc::now() - start).num_seconds() as u64),
            _ => None,
        }
    }
}

// ============================================================================
// 编排拓扑
// =============================================================================

/// 多 Agent 编排拓扑
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OrchestrationTopology {
    /// 主管模式：主 Agent 派生子代理独立执行
    Supervisor,
    /// 同行评审：多个子代理互审输出
    PeerReview,
    /// 流水线：子代理串行执行
    Pipeline,
}

// ============================================================================
// 子代理管理器
// ============================================================================

/// 子代理管理器
///
/// 管理子代理的完整生命周期：创建 → 启动 → 监控 → 收集。
#[derive(Debug, Clone)]
pub struct SubagentManager {
    /// 所有子代理实例
    instances: HashMap<SubagentId, SubagentInstance>,
    /// 编排拓扑
    topology: OrchestrationTopology,
    /// 父 Agent 线程 ID
    parent_thread_id: String,
}

impl SubagentManager {
    /// 创建新的子代理管理器
    pub fn new(parent_thread_id: impl Into<String>, topology: OrchestrationTopology) -> Self {
        Self {
            instances: HashMap::new(),
            topology,
            parent_thread_id: parent_thread_id.into(),
        }
    }

    /// 创建 Supervisor 模式的管理器
    pub fn supervisor(parent_thread_id: impl Into<String>) -> Self {
        Self::new(parent_thread_id, OrchestrationTopology::Supervisor)
    }

    /// 创建 PeerReview 模式的管理器
    pub fn peer_review(parent_thread_id: impl Into<String>) -> Self {
        Self::new(parent_thread_id, OrchestrationTopology::PeerReview)
    }

    /// 创建 Pipeline 模式的管理器
    pub fn pipeline(parent_thread_id: impl Into<String>) -> Self {
        Self::new(parent_thread_id, OrchestrationTopology::Pipeline)
    }

    /// 派生子代理
    pub fn spawn(&mut self, spec: SubagentSpec) -> SubagentId {
        let id = spec.id.clone();
        let instance = SubagentInstance::from_spec(spec, &self.parent_thread_id);
        self.instances.insert(id.clone(), instance);
        id
    }

    /// 批量派生
    pub fn spawn_batch(&mut self, specs: Vec<SubagentSpec>) -> Vec<SubagentId> {
        specs.into_iter().map(|spec| self.spawn(spec)).collect()
    }

    /// 获取子代理实例
    pub fn get(&self, id: &str) -> Option<&SubagentInstance> {
        self.instances.get(id)
    }

    /// 获取子代理实例（可变）
    pub fn get_mut(&mut self, id: &str) -> Option<&mut SubagentInstance> {
        self.instances.get_mut(id)
    }

    /// 启动子代理
    pub fn start(&mut self, id: &str) -> bool {
        if let Some(instance) = self.instances.get_mut(id) {
            instance.status = SubagentStatus::Running;
            instance.started_at = Some(Utc::now());
            true
        } else {
            false
        }
    }

    /// 标记完成
    pub fn complete(&mut self, id: &str, output: impl Into<String>) {
        if let Some(instance) = self.instances.get_mut(id) {
            instance.status = SubagentStatus::Completed;
            instance.completed_at = Some(Utc::now());
            instance.output = Some(output.into());
        }
    }

    /// 标记失败
    pub fn fail(&mut self, id: &str, error: impl Into<String>) {
        if let Some(instance) = self.instances.get_mut(id) {
            instance.status = SubagentStatus::Failed;
            instance.completed_at = Some(Utc::now());
            instance.error = Some(error.into());
        }
    }

    /// 列出所有子代理
    pub fn list(&self) -> Vec<&SubagentInstance> {
        self.instances.values().collect()
    }

    /// 按状态筛选
    pub fn list_by_status(&self, status: SubagentStatus) -> Vec<&SubagentInstance> {
        self.instances
            .values()
            .filter(|i| i.status == status)
            .collect()
    }

    /// 是否全部完成
    pub fn all_done(&self) -> bool {
        !self.instances.is_empty()
            && self
                .instances
                .values()
                .all(|i| i.is_done())
    }

    /// 获取成功完成的子代理
    pub fn successful(&self) -> Vec<&SubagentInstance> {
        self.list_by_status(SubagentStatus::Completed)
    }

    /// 获取编排拓扑
    pub fn topology(&self) -> OrchestrationTopology {
        self.topology
    }

    /// 获取子代理数量
    pub fn count(&self) -> usize {
        self.instances.len()
    }

    /// 收集所有已完成子代理的输出
    pub fn collect_outputs(&self) -> HashMap<SubagentId, String> {
        self.instances
            .iter()
            .filter(|(_, i)| i.status == SubagentStatus::Completed)
            .filter_map(|(id, i)| i.output.clone().map(|o| (id.clone(), o)))
            .collect()
    }

    /// 生成执行摘要
    pub fn summary(&self) -> String {
        let total = self.instances.len();
        let completed = self.list_by_status(SubagentStatus::Completed).len();
        let failed = self.list_by_status(SubagentStatus::Failed).len();
        let running = self.list_by_status(SubagentStatus::Running).len();
        let pending = self.list_by_status(SubagentStatus::Pending).len();

        format!(
            "Subagent Manager [{}]: {} total, {} completed, {} failed, {} running, {} pending",
            self.topology, total, completed, failed, running, pending
        )
    }
}

impl std::fmt::Display for OrchestrationTopology {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            OrchestrationTopology::Supervisor => write!(f, "supervisor"),
            OrchestrationTopology::PeerReview => write!(f, "peer-review"),
            OrchestrationTopology::Pipeline => write!(f, "pipeline"),
        }
    }
}

// ============================================================================
// 测试
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_subagent_spec_creation() {
        let spec = SubagentSpec::new("Implement Auth", "Implement JWT authentication")
            .with_role(SubagentRole::Executor)
            .with_timeout(600);

        assert_eq!(spec.nickname, "Implement Auth");
        assert_eq!(spec.role, SubagentRole::Executor);
        assert_eq!(spec.timeout_secs, 600);
    }

    #[test]
    fn test_manager_spawn() {
        let mut manager = SubagentManager::supervisor("parent-thread-1");
        let spec = SubagentSpec::new("Task 1", "Do something");

        let id = manager.spawn(spec);
        assert_eq!(manager.count(), 1);
        assert!(manager.get(&id).is_some());
    }

    #[test]
    fn test_manager_lifecycle() {
        let mut manager = SubagentManager::supervisor("parent-thread-1");
        let spec = SubagentSpec::new("Task 1", "Do something");
        let id = manager.spawn(spec);

        // Start
        assert!(manager.start(&id));
        assert!(manager.get(&id).unwrap().is_running());

        // Complete
        manager.complete(&id, "Task done!");
        assert!(manager.get(&id).unwrap().is_done());
        assert_eq!(manager.get(&id).unwrap().output, Some("Task done!".to_string()));

        assert!(manager.all_done());
    }

    #[test]
    fn test_manager_batch() {
        let mut manager = SubagentManager::peer_review("parent-thread-1");
        let specs = vec![
            SubagentSpec::new("Agent A", "Implement feature X").with_model("claude-opus"),
            SubagentSpec::new("Agent B", "Implement feature X").with_model("gpt-5"),
            SubagentSpec::new("Agent C", "Implement feature X").with_model("gemini-2.5"),
        ];

        let ids = manager.spawn_batch(specs);
        assert_eq!(ids.len(), 3);
        assert_eq!(manager.count(), 3);
    }

    #[test]
    fn test_collect_outputs() {
        let mut manager = SubagentManager::supervisor("parent");
        let spec1 = SubagentSpec::new("Task 1", "Do A");
        let spec2 = SubagentSpec::new("Task 2", "Do B");

        let id1 = manager.spawn(spec1);
        let id2 = manager.spawn(spec2);

        manager.start(&id1);
        manager.start(&id2);
        manager.complete(&id1, "Result A");
        manager.complete(&id2, "Result B");

        let outputs = manager.collect_outputs();
        assert_eq!(outputs.len(), 2);
        assert!(outputs.values().any(|v| v == "Result A"));
        assert!(outputs.values().any(|v| v == "Result B"));
    }

    #[test]
    fn test_topology_display() {
        assert_eq!(OrchestrationTopology::Supervisor.to_string(), "supervisor");
        assert_eq!(OrchestrationTopology::PeerReview.to_string(), "peer-review");
        assert_eq!(OrchestrationTopology::Pipeline.to_string(), "pipeline");
    }
}
