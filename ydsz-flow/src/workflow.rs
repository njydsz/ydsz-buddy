// ydsz-flow: Dynamic Workflow Engine MVP
// DAG-based multi-step orchestration with visualization support

use std::collections::{HashMap, HashSet, VecDeque};

use serde::{Deserialize, Serialize};

use uuid::Uuid;

/// 工作流状态
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WorkflowStatus {
    Draft,
    Running,
    Paused,
    Completed,
    Failed,
    Cancelled,
}

/// 工作流节点状态
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum NodeStatus {
    #[default]
    Pending,
    Waiting,
    Running,
    Completed,
    Failed,
    Skipped,
}

/// 节点类型
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum NodeType {
    /// 执行 Agent 任务（调用 LLM 完成特定任务）
    AgentTask,
    /// 条件分支
    Condition,
    /// 并行扇出（同时启动多个节点）
    Parallel,
    /// 等待人工确认
    HumanGate,
    /// 工具调用（执行 shell/exec/webhook）
    ToolCall,
}

/// 工作流节点（DAG 中的一个步骤）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowNode {
    pub id: String,
    pub name: String,
    pub node_type: NodeType,
    /// 依赖的前置节点 ID 列表
    pub depends_on: Vec<String>,
    /// 节点配置（不同类型的参数不同）
    pub config: NodeConfig,
    /// 运行时状态
    #[serde(default)]
    pub status: NodeStatus,
    /// 执行结果摘要
    pub output: Option<serde_json::Value>,
    /// 错误信息（如果失败）
    pub error: Option<String>,
    /// 开始/结束时间
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
}

/// 节点配置（多态）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeConfig {
    /// AgentTask: prompt 模板
    pub prompt: Option<String>,
    /// AgentTask: 指定的 provider/model
    pub model: Option<String>,
    /// Condition: 分支条件表达式（如 "node_1.output.passed == true"）
    pub condition: Option<String>,
    /// ToolCall: 命令字符串
    pub command: Option<String>,
    /// ToolCall: webhook URL
    pub webhook_url: Option<String>,
    /// 重试次数（默认 0）
    #[serde(default)]
    pub retry_count: u32,
    /// 超时秒数（可选）
    pub timeout_secs: Option<u64>,
    /// 注入的上下文变量名
    #[serde(default)]
    pub inject_context: Vec<String>,
}

/// 工作流模板定义（可复用）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowTemplate {
    pub id: String,
    pub name: String,
    pub description: String,
    pub version: String,
    /// 节点列表
    pub nodes: Vec<WorkflowNode>,
    /// 输入变量定义
    #[serde(default)]
    pub inputs: Vec<WorkflowInput>,
    /// 标签（用于分类）
    #[serde(default)]
    pub tags: Vec<String>,
}

/// 输入变量定义
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowInput {
    pub name: String,
    pub description: String,
    #[serde(default)]
    pub required: bool,
    pub default_value: Option<String>,
    #[serde(rename = "type", default = "default_input_type")]
    pub input_type: String,
}

fn default_input_type() -> String {
    "string".to_string()
}

/// 工作流实例（运行时的执行）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowInstance {
    pub id: String,
    pub template_id: String,
    pub template_name: String,
    pub status: WorkflowStatus,
    pub nodes: Vec<WorkflowNode>,
    /// 输入参数值
    #[serde(default)]
    pub input_values: HashMap<String, String>,
    /// 全局上下文（节点间共享数据）
    #[serde(default)]
    pub context: HashMap<String, serde_json::Value>,
    pub created_at: String,
    pub updated_at: String,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
}

/// 工作流事件（用于前端时间线持久化）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowEvent {
    pub id: String,
    pub workflow_instance_id: String,
    pub node_id: Option<String>,
    pub event_type: String,
    pub payload: serde_json::Value,
    pub occurred_at: String,
}

/// 内置工作流模板库
pub mod templates {
    use super::*;

    /// 代码审查 => 修复 => 测试 => 提 PR
    pub fn code_review_pipeline() -> WorkflowTemplate {
        WorkflowTemplate {
            id: "builtin-code-review".into(),
            name: "代码审查流水线".into(),
            description: "自动审查代码质量、修复问题、运行测试、提 PR".into(),
            version: "1.0.0".into(),
            inputs: vec![
                WorkflowInput {
                    name: "code_path".into(),
                    description: "要审查的文件或目录路径".into(),
                    required: true,
                    default_value: None,
                    input_type: "path".into(),
                },
                WorkflowInput {
                    name: "language".into(),
                    description: "编程语言".into(),
                    required: false,
                    default_value: Some("auto-detect".into()),
                    input_type: "string".into(),
                },
            ],
            tags: vec!["git".into(), "code-review".into(), "pr".into()],
            nodes: vec![
                WorkflowNode {
                    id: "analyze".into(),
                    name: "代码分析".into(),
                    node_type: NodeType::AgentTask,
                    depends_on: vec![],
                    config: NodeConfig {
                        prompt: Some("分析 {{input.code_path}} 的代码质量，找出潜在问题、安全风险和改进建议。语言：{{input.language}}".into()),
                        model: None,
                        condition: None,
                        command: None,
                        webhook_url: None,
                        retry_count: 1,
                        timeout_secs: Some(300),
                        inject_context: vec![],
                    },
                    status: NodeStatus::Pending,
                    output: None,
                    error: None,
                    started_at: None,
                    finished_at: None,
                },
                WorkflowNode {
                    id: "fix".into(),
                    name: "自动修复".into(),
                    node_type: NodeType::AgentTask,
                    depends_on: vec!["analyze".into()],
                    config: NodeConfig {
                        prompt: Some("基于分析结果 '{{node_1.output}}' 修复代码中的问题，输出 diff 或修改后的代码".into()),
                        model: None,
                        condition: None,
                        command: None,
                        webhook_url: None,
                        retry_count: 2,
                        timeout_secs: Some(600),
                        inject_context: vec!["analyze".into()],
                    },
                    status: NodeStatus::Pending,
                    output: None,
                    error: None,
                    started_at: None,
                    finished_at: None,
                },
                WorkflowNode {
                    id: "test".into(),
                    name: "运行测试".into(),
                    node_type: NodeType::ToolCall,
                    depends_on: vec!["fix".into()],
                    config: NodeConfig {
                        prompt: None,
                        model: None,
                        condition: None,
                        command: Some("cd {{input.code_path}} && npm test || cargo test || make test".into()),
                        webhook_url: None,
                        retry_count: 0,
                        timeout_secs: Some(300),
                        inject_context: vec![],
                    },
                    status: NodeStatus::Pending,
                    output: None,
                    error: None,
                    started_at: None,
                    finished_at: None,
                },
                WorkflowNode {
                    id: "confirm_pr".into(),
                    name: "确认提 PR".into(),
                    node_type: NodeType::HumanGate,
                    depends_on: vec!["test".into()],
                    config: NodeConfig {
                        prompt: Some("测试已通过。是否自动提交并创建 Pull Request？请检查 diff：{{node_2.output}}".into()),
                        model: None,
                        condition: None,
                        command: None,
                        webhook_url: None,
                        retry_count: 0,
                        timeout_secs: None,
                        inject_context: vec!["fix".into(), "test".into()],
                    },
                    status: NodeStatus::Pending,
                    output: None,
                    error: None,
                    started_at: None,
                    finished_at: None,
                },
                WorkflowNode {
                    id: "create_pr".into(),
                    name: "创建 PR".into(),
                    node_type: NodeType::AgentTask,
                    depends_on: vec!["confirm_pr".into()],
                    config: NodeConfig {
                        prompt: Some("基于所有变更创建 Pull Request，包括描述、标签和审查者建议".into()),
                        model: None,
                        condition: None,
                        command: None,
                        webhook_url: None,
                        retry_count: 1,
                        timeout_secs: Some(120),
                        inject_context: vec!["analyze".into(), "fix".into(), "test".into()],
                    },
                    status: NodeStatus::Pending,
                    output: None,
                    error: None,
                    started_at: None,
                    finished_at: None,
                },
            ],
        }
    }

    /// 文档生成流水线
    pub fn documentation_generator() -> WorkflowTemplate {
        WorkflowTemplate {
            id: "builtin-docs-gen".into(),
            name: "文档自动生成".into(),
            description: "扫描代码生成 API 文档、README 和使用示例".into(),
            version: "1.0.0".into(),
            inputs: vec![
                WorkflowInput {
                    name: "source_dir".into(),
                    description: "源码目录".into(),
                    required: true,
                    default_value: None,
                    input_type: "path".into(),
                },
            ],
            tags: vec!["docs".into(), "automation".into()],
            nodes: vec![
                WorkflowNode {
                    id: "scan".into(),
                    name: "代码扫描".into(),
                    node_type: NodeType::AgentTask,
                    depends_on: vec![],
                    config: NodeConfig {
                        prompt: Some("扫描 {{input.source_dir}} 中的所有公共接口、类型和函数签名，生成结构化摘要".into()),
                        model: None,
                        condition: None,
                        command: None,
                        webhook_url: None,
                        retry_count: 1,
                        timeout_secs: Some(300),
                        inject_context: vec![],
                    },
                    status: NodeStatus::Pending,
                    output: None,
                    error: None,
                    started_at: None,
                    finished_at: None,
                },
                WorkflowNode {
                    id: "gen-api".into(),
                    name: "API 文档".into(),
                    node_type: NodeType::AgentTask,
                    depends_on: vec!["scan".into()],
                    config: NodeConfig {
                        prompt: Some("基于扫描结果生成 API 文档（OpenAPI/Swagger 格式或 Markdown 格式）".into()),
                        model: None,
                        condition: None,
                        command: None,
                        webhook_url: None,
                        retry_count: 1,
                        timeout_secs: Some(300),
                        inject_context: vec!["scan".into()],
                    },
                    status: NodeStatus::Pending,
                    output: None,
                    error: None,
                    started_at: None,
                    finished_at: None,
                },
                WorkflowNode {
                    id: "gen-readme".into(),
                    name: "README 更新".into(),
                    node_type: NodeType::AgentTask,
                    depends_on: vec!["scan".into()],
                    config: NodeConfig {
                        prompt: Some("基于代码结构和 API 生成清晰的 README.md，包含安装、使用示例和架构说明".into()),
                        model: None,
                        condition: None,
                        command: None,
                        webhook_url: None,
                        retry_count: 1,
                        timeout_secs: Some(300),
                        inject_context: vec!["scan".into()],
                    },
                    status: NodeStatus::Pending,
                    output: None,
                    error: None,
                    started_at: None,
                    finished_at: None,
                },
                WorkflowNode {
                    id: "write-files".into(),
                    name: "写入文档".into(),
                    node_type: NodeType::ToolCall,
                    depends_on: vec!["gen-api".into(), "gen-readme".into()],
                    config: NodeConfig {
                        prompt: None,
                        model: None,
                        condition: None,
                        command: Some("echo '{{node_2.output}}' > {{input.source_dir}}/API.md && echo '{{node_3.output}}' > {{input.source_dir}}/README.md".into()),
                        webhook_url: None,
                        retry_count: 0,
                        timeout_secs: Some(30),
                        inject_context: vec![],
                    },
                    status: NodeStatus::Pending,
                    output: None,
                    error: None,
                    started_at: None,
                    finished_at: None,
                },
            ],
        }
    }

    /// 获取所有内置模板
    pub fn all_builtin_templates() -> Vec<WorkflowTemplate> {
        vec![code_review_pipeline(), documentation_generator()]
    }
}

/// DAG 调度器
pub struct DagScheduler;

impl DagScheduler {
    /// 计算可执行的就绪节点（所有前置依赖已完成）
    pub fn find_ready_nodes(instance: &WorkflowInstance) -> Vec<String> {
        let completed: HashSet<&str> = instance
            .nodes
            .iter()
            .filter(|n| n.status == NodeStatus::Completed)
            .map(|n| n.id.as_str())
            .collect();

        instance
            .nodes
            .iter()
            .filter(|n| {
                n.status == NodeStatus::Pending
                    && n.depends_on.iter().all(|dep| completed.contains(dep.as_str()))
            })
            .map(|n| n.id.clone())
            .collect()
    }

    /// 检测循环依赖
    pub fn detect_cycle(nodes: &[WorkflowNode]) -> Option<Vec<String>> {
        let mut visited = HashSet::new();
        let mut stack = HashSet::new();

        for node in nodes {
            if Self::dfs_cycle(node.id.as_str(), nodes, &mut visited, &mut stack) {
                    return Some(stack.into_iter().collect());
            }
        }
        None
    }

    fn dfs_cycle<'a>(
        current: &str,
        nodes: &'a [WorkflowNode],
        visited: &mut HashSet<String>,
        stack: &mut HashSet<String>,
    ) -> bool {
        if stack.contains(current) {
            return true;
        }
        if visited.contains(current) {
            return false;
        }

        visited.insert(current.to_string());
        stack.insert(current.to_string());

        if let Some(node) = nodes.iter().find(|n| n.id == current) {
            for _dep in &node.depends_on {
                // 注意：这里的边是 depends_on 指向的，我们需要反向搜索
                // 实际上 depends_on 列表中的节点需要先于当前节点完成
                // 所以我们需要检查：对于每个依赖于 current 的节点...
                // 简化：直接从 current 出发看它的下游
                if let Some(downstream) = nodes.iter().find(|n| n.depends_on.contains(&current.to_string())) {
                    if Self::dfs_cycle(downstream.id.as_str(), nodes, visited, stack) {
                        return true;
                    }
                }
            }
        }

        stack.remove(current);
        false
    }

    /// 拓扑排序（用于确定合理执行顺序）
    pub fn topological_sort(nodes: &[WorkflowNode]) -> Option<Vec<String>> {
        let mut in_degree: HashMap<&str, usize> = HashMap::new();
        let mut adj: HashMap<&str, Vec<&str>> = HashMap::new();

        for node in nodes {
            in_degree.entry(&node.id).or_insert(0);
            for dep in &node.depends_on {
                adj.entry(dep.as_str()).or_default().push(&node.id);
                *in_degree.entry(&node.id).or_insert(0) += 1;
            }
        }

        let mut queue: VecDeque<&str> = in_degree
            .iter()
            .filter(|(_, &deg)| deg == 0)
            .map(|(id, _)| *id)
            .collect();

        let mut result = Vec::new();
        while let Some(id) = queue.pop_front() {
            result.push(id.to_string());
            if let Some(neighbors) = adj.get(id) {
                for &neighbor in neighbors {
                    if let Some(deg) = in_degree.get_mut(neighbor) {
                        *deg -= 1;
                        if *deg == 0 {
                            queue.push_back(neighbor);
                        }
                    }
                }
            }
        }

        if result.len() == nodes.len() {
            Some(result)
        } else {
            None // 存在环
        }
    }
}

impl WorkflowInstance {
    /// 从模板创建工作流实例
    pub fn from_template(template: &WorkflowTemplate, inputs: HashMap<String, String>) -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        Self {
            id: Uuid::new_v4().to_string(),
            template_id: template.id.clone(),
            template_name: template.name.clone(),
            status: WorkflowStatus::Draft,
            nodes: template.nodes.clone(),
            input_values: inputs,
            context: HashMap::new(),
            created_at: now.clone(),
            updated_at: now,
            started_at: None,
            finished_at: None,
        }
    }

    /// 启动工作流
    pub fn start(&mut self) {
        self.status = WorkflowStatus::Running;
        self.started_at = Some(chrono::Utc::now().to_rfc3339());
        self.updated_at = chrono::Utc::now().to_rfc3339();
    }

    /// 推进：标记节点完成，更新 DAG 状态
    pub fn complete_node(&mut self, node_id: &str, output: Option<serde_json::Value>) -> Vec<String> {
        if let Some(node) = self.nodes.iter_mut().find(|n| n.id == node_id) {
            node.status = NodeStatus::Completed;
            node.output = output;
            node.finished_at = Some(chrono::Utc::now().to_rfc3339());
            
            // 将节点输出存入全局上下文
            if let Some(ref out) = node.output {
                self.context.insert(format!("{}_output", node.id), out.clone());
            }
        }

        self.updated_at = chrono::Utc::now().to_rfc3339();
        
        // 检查是否所有节点都完成了
        let all_done = self.nodes.iter().all(|n| {
            matches!(n.status, NodeStatus::Completed | NodeStatus::Failed | NodeStatus::Skipped)
        });
        
        if all_done {
            let any_failed = self.nodes.iter().any(|n| n.status == NodeStatus::Failed);
            if any_failed {
                self.status = WorkflowStatus::Failed;
            } else {
                self.status = WorkflowStatus::Completed;
                self.finished_at = Some(self.updated_at.clone());
            }
        }

        // 返回新就绪的节点
        DagScheduler::find_ready_nodes(self)
    }

    /// 标记节点失败
    pub fn fail_node(&mut self, node_id: &str, error: &str) {
        if let Some(node) = self.nodes.iter_mut().find(|n| n.id == node_id) {
            node.status = NodeStatus::Failed;
            node.error = Some(error.to_string());
            node.finished_at = Some(chrono::Utc::now().to_rfc3339());
        }
        self.status = WorkflowStatus::Failed;
        self.updated_at = chrono::Utc::now().to_rfc3339();
    }

    /// 暂停工作流
    pub fn pause(&mut self) {
        if self.status == WorkflowStatus::Running {
            self.status = WorkflowStatus::Paused;
            self.updated_at = chrono::Utc::now().to_rfc3339();
        }
    }

    /// 恢复运行
    pub fn resume(&mut self) {
        if self.status == WorkflowStatus::Paused {
            self.status = WorkflowStatus::Running;
            self.updated_at = chrono::Utc::now().to_rfc3339();
        }
    }

    /// 取消工作流（将运行中和待执行的节点标记为取消）
    pub fn cancel(&mut self) {
        if self.status == WorkflowStatus::Running || self.status == WorkflowStatus::Paused {
            self.status = WorkflowStatus::Cancelled;
            self.finished_at = Some(chrono::Utc::now().to_rfc3339());
            self.updated_at = chrono::Utc::now().to_rfc3339();
            for node in &mut self.nodes {
                if matches!(node.status, NodeStatus::Pending | NodeStatus::Waiting | NodeStatus::Running) {
                    node.status = NodeStatus::Skipped;
                    node.finished_at = Some(chrono::Utc::now().to_rfc3339());
                }
            }
        }
    }
}

/// 工作流引擎错误
#[derive(Debug, thiserror::Error)]
pub enum WorkflowError {
    #[error("模板未找到: {0}")]
    TemplateNotFound(String),
    #[error("工作流实例未找到: {0}")]
    InstanceNotFound(String),
    #[error("DAG 存在循环依赖")]
    CyclicDependency,
    #[error("输入参数缺失: {0}")]
    MissingInput(String),
    #[error("无效的节点类型转换")]
    InvalidNodeType,
    #[error("工作流状态不允许此操作: {0:?}")]
    InvalidState(WorkflowStatus),
}

/// 工作流引擎（管理模板和实例）
#[derive(Debug, Clone)]
pub struct WorkflowEngine {
    templates: HashMap<String, WorkflowTemplate>,
    instances: HashMap<String, WorkflowInstance>,
}

impl WorkflowEngine {
    pub fn new() -> Self {
        let mut engine = Self {
            templates: HashMap::new(),
            instances: HashMap::new(),
        };
        // 注册内置模板
        for tpl in templates::all_builtin_templates() {
            engine.register_template(tpl);
        }
        engine
    }

    /// 注册工作流模板
    pub fn register_template(&mut self, template: WorkflowTemplate) {
        self.templates.insert(template.id.clone(), template);
    }

    /// 移除工作流模板
    pub fn remove_template(&mut self, id: &str) -> bool {
        self.templates.remove(id).is_some()
    }

    /// 列出所有模板
    pub fn list_templates(&self) -> Vec<&WorkflowTemplate> {
        self.templates.values().collect()
    }

    /// 按标签筛选模板
    pub fn find_templates_by_tag(&self, tag: &str) -> Vec<&WorkflowTemplate> {
        self.templates
            .values()
            .filter(|t| t.tags.iter().any(|t| t == tag))
            .collect()
    }

    /// 创建并启动实例
    pub fn create_instance(
        &mut self,
        template_id: &str,
        inputs: HashMap<String, String>,
    ) -> Result<String, WorkflowError> {
        let template = self
            .templates
            .get(template_id)
            .ok_or(WorkflowError::TemplateNotFound(template_id.into()))?;

        // 验证必填输入
        for input_def in &template.inputs {
            if input_def.required && !inputs.contains_key(&input_def.name) {
                return Err(WorkflowError::MissingInput(input_def.name.clone()));
            }
        }

        let mut instance = WorkflowInstance::from_template(template, inputs);
        instance.start();
        let id = instance.id.clone();
        self.instances.insert(id.clone(), instance);
        Ok(id)
    }

    /// 获取实例
    pub fn get_instance(&self, id: &str) -> Option<&WorkflowInstance> {
        self.instances.get(id)
    }

    pub fn get_instance_mut(&mut self, id: &str) -> Option<&mut WorkflowInstance> {
        self.instances.get_mut(id)
    }

    /// 列出所有实例
    pub fn list_instances(&self) -> Vec<&WorkflowInstance> {
        self.instances.values().collect()
    }

    /// 推进实例的指定节点
    pub fn advance_node(
        &mut self,
        instance_id: &str,
        node_id: &str,
        output: Option<serde_json::Value>,
    ) -> Result<Vec<String>, WorkflowError> {
        let instance = self
            .instances
            .get_mut(instance_id)
            .ok_or(WorkflowError::InstanceNotFound(instance_id.into()))?;
        Ok(instance.complete_node(node_id, output))
    }

    /// 暂停实例
    pub fn pause_instance(&mut self, id: &str) -> Result<(), WorkflowError> {
        let instance = self
            .instances
            .get_mut(id)
            .ok_or(WorkflowError::InstanceNotFound(id.into()))?;
        instance.pause();
        Ok(())
    }

    /// 恢复实例
    pub fn resume_instance(&mut self, id: &str) -> Result<(), WorkflowError> {
        let instance = self
            .instances
            .get_mut(id)
            .ok_or(WorkflowError::InstanceNotFound(id.into()))?;
        instance.resume();
        Ok(())
    }

    /// 取消实例
    pub fn cancel_instance(&mut self, id: &str) -> Result<(), WorkflowError> {
        let instance = self
            .instances
            .get_mut(id)
            .ok_or(WorkflowError::InstanceNotFound(id.into()))?;
        instance.cancel();
        Ok(())
    }

    /// 完成节点执行
    pub fn complete_node(
        &mut self,
        instance_id: &str,
        node_id: &str,
        output: Option<serde_json::Value>,
    ) -> Result<Vec<String>, WorkflowError> {
        let instance = self
            .instances
            .get_mut(instance_id)
            .ok_or(WorkflowError::InstanceNotFound(instance_id.into()))?;
        Ok(instance.complete_node(node_id, output))
    }

    /// 节点执行失败
    pub fn fail_node(
        &mut self,
        instance_id: &str,
        node_id: &str,
        error: &str,
    ) -> Result<(), WorkflowError> {
        let instance = self
            .instances
            .get_mut(instance_id)
            .ok_or(WorkflowError::InstanceNotFound(instance_id.into()))?;
        instance.fail_node(node_id, error);
        Ok(())
    }

    /// 获取就绪节点
    pub fn get_ready_nodes(&self, instance_id: &str) -> Result<Vec<&WorkflowNode>, WorkflowError> {
        let instance = self
            .instances
            .get(instance_id)
            .ok_or(WorkflowError::InstanceNotFound(instance_id.into()))?;
        let ready_ids = DagScheduler::find_ready_nodes(instance);
        Ok(instance
            .nodes
            .iter()
            .filter(|n| ready_ids.contains(&n.id))
            .collect())
    }
}

impl Default for WorkflowEngine {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dag_topological_sort() {
        let tpl = templates::code_review_pipeline();
        let order = DagScheduler::topological_sort(&tpl.nodes).unwrap();
        assert_eq!(order.first().unwrap(), "analyze");
        assert_eq!(order.last().unwrap(), "create_pr");
    }

    #[test]
    fn test_workflow_lifecycle() {
        let tpl = templates::code_review_pipeline();
        let mut engine = WorkflowEngine::new();
        engine.register_template(tpl);

        let id = engine
            .create_instance(
                "builtin-code-review",
                HashMap::from([("code_path".into(), "./src".into())]),
            )
            .unwrap();

        let instance = engine.get_instance(&id).unwrap();
        assert_eq!(instance.status, WorkflowStatus::Running);

        // 模拟第一步完成
        let ready = engine.complete_node(&id, "analyze", Some(serde_json::json!({"issues": 3})));
        assert!(ready.is_ok());
        let next = engine.complete_node(&id, "fix", Some(serde_json::json!({"fixed": 3})));
        assert!(next.is_ok());
    }

    #[test]
    fn test_all_builtin_templates_valid() {
        for tpl in templates::all_builtin_templates() {
            let sorted = DagScheduler::topological_sort(&tpl.nodes);
            assert!(sorted.is_some(), "Template {} has cyclic deps!", tpl.id);
        }
    }

    #[test]
    fn test_builtin_templates_count() {
        assert!(templates::all_builtin_templates().len() >= 2);
    }
}
