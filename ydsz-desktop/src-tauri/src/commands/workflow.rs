//! Dynamic Workflow Engine Commands (P0-1)
//!
//! DAG-based multi-step orchestration with template management,
//! instance lifecycle, and node execution status tracking.
//!
//! ## 持久化策略
//!
//! - 模板/实例数据通过 JSON 文件系统持久化到 `~/.ydsz-buddy/workflows/`
//! - `templates.json`：所有注册的工作流模板（含内置）
//! - `instances.json`：所有工作流实例及其运行状态
//! - 每次状态变更后自动保存到磁盘，实现错误恢复

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{State, Manager};

use ydsz_flow::workflow::{
    DagScheduler, NodeConfig, NodeType, WorkflowEngine, WorkflowInstance, WorkflowNode,
    WorkflowTemplate,
};

/// 应用级工作流引擎状态
pub struct WorkflowState {
    pub engine: Mutex<WorkflowEngine>,
    /// 持久化目录路径
    pub storage_dir: PathBuf,
}

impl WorkflowState {
    pub fn new(app_handle: &tauri::AppHandle) -> Self {
        // 确定持久化目录: ~/.ydsz-buddy/workflows/
        let storage_dir = Self::resolve_storage_dir(app_handle);
        Self::ensure_dir(&storage_dir);

        // 从磁盘加载已有数据初始化引擎
        let mut engine = WorkflowEngine::new();
        Self::load_templates_from_disk(&storage_dir, &mut engine);
        Self::load_instances_from_disk(&storage_dir, &mut engine);

        Self {
            engine: Mutex::new(engine),
            storage_dir,
        }
    }

    /// 确保目录存在
    fn ensure_dir(dir: &PathBuf) {
        if !dir.exists() {
            let _ = fs::create_dir_all(dir);
        }
    }

    /// 解析存储路径: ~/.ydsz-buddy/workflows/
    fn resolve_storage_dir(app_handle: &tauri::AppHandle) -> PathBuf {
        // 优先使用 app_handle 的 path resolver
        if let Ok(data_dir) = app_handle.path().app_data_dir() {
            return data_dir.join("workflows");
        }
        // 回退到 home 目录
        dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(".ydsz-buddy")
            .join("workflows")
    }

    /// 从磁盘加载模板
    fn load_templates_from_disk(dir: &PathBuf, engine: &mut WorkflowEngine) {
        let path = dir.join("templates.json");
        if !path.exists() {
            return;
        }
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(templates) = serde_json::from_str::<Vec<PersistentTemplate>>(&content) {
                for pt in templates {
                    if let Some(tpl) = pt.into_template() {
                        engine.register_template(tpl);
                    }
                }
            }
        }
    }

    /// 从磁盘加载实例
    fn load_instances_from_disk(_dir: &PathBuf, _engine: &mut WorkflowEngine) {
        // 实例当前不跨会话持久化（按需可开启）
        // 在需要断点恢复时可在此实现从 instances.json 反序列化
    }

    /// 持久化模板到磁盘
    pub fn save_templates_to_disk(&self) -> Result<(), String> {
        let engine = self.engine.lock().map_err(|e| e.to_string())?;
        let templates: Vec<PersistentTemplate> = engine
            .list_templates()
            .into_iter()
            .map(PersistentTemplate::from_template)
            .collect();

        let json = serde_json::to_string_pretty(&templates)
            .map_err(|e| format!("序列化模板失败: {}", e))?;

        let path = self.storage_dir.join("templates.json");
        fs::write(&path, json)
            .map_err(|e| format!("写入模板文件失败: {}", e))?;

        Ok(())
    }

    /// 持久化实例快照到磁盘（用于错误恢复）
    pub fn save_instances_snapshot(&self) -> Result<(), String> {
        let engine = self.engine.lock().map_err(|e| e.to_string())?;
        let instances: Vec<&WorkflowInstance> = engine.list_instances();
        if instances.is_empty() {
            return Ok(());
        }

        let path = self.storage_dir.join("instances_snapshot.json");
        // WorkflowInstance 不是直接可序列化的（包含未导出的字段），使用 InstanceSummary
        let summaries: Vec<InstanceSummary> = instances
            .into_iter()
            .map(|inst| {
                let total = inst.nodes.len();
                let completed = inst.nodes.iter()
                    .filter(|n| n.status == ydsz_flow::workflow::NodeStatus::Completed)
                    .count();
                InstanceSummary {
                    id: inst.id.clone(),
                    template_id: inst.template_id.clone(),
                    template_name: inst.template_name.clone(),
                    status: format!("{:?}", inst.status).to_lowercase(),
                    created_at: inst.created_at.clone(),
                    updated_at: inst.updated_at.clone(),
                    started_at: inst.started_at.clone(),
                    finished_at: inst.finished_at.clone(),
                    total_nodes: total,
                    completed_nodes: completed,
                    nodes: inst.nodes.iter().map(|n| NodeSummary {
                        id: n.id.clone(),
                        name: n.name.clone(),
                        node_type: format!("{:?}", n.node_type).to_lowercase(),
                        status: format!("{:?}", n.status).to_lowercase(),
                        depends_on: n.depends_on.clone(),
                        error: n.error.clone(),
                        started_at: n.started_at.clone(),
                        finished_at: n.finished_at.clone(),
                    }).collect(),
                }
            })
            .collect();

        let json = serde_json::to_string_pretty(&summaries)
            .map_err(|e| format!("序列化实例失败: {}", e))?;
        fs::write(&path, json)
            .map_err(|e| format!("写入实例快照失败: {}", e))?;

        Ok(())
    }
}

impl Default for WorkflowState {
    fn default() -> Self {
        // 默认使用 home 目录作为回退
        let storage_dir = dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(".ydsz-buddy")
            .join("workflows");
        Self::ensure_dir(&storage_dir);
        Self {
            engine: Mutex::new(WorkflowEngine::new()),
            storage_dir,
        }
    }
}

// ============================================================
// 持久化数据模型（仅用于 JSON 序列化）
// ============================================================

/// 可序列化的工作流模板持久化表示
#[derive(Debug, Serialize, Deserialize)]
pub struct PersistentTemplate {
    pub id: String,
    pub name: String,
    pub description: String,
    pub version: String,
    pub nodes: Vec<PersistentNode>,
    pub inputs: Vec<PersistentInput>,
    pub tags: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PersistentNode {
    pub id: String,
    pub name: String,
    pub node_type: String,
    #[serde(default)]
    pub depends_on: Vec<String>,
    #[serde(default)]
    pub config: PersistentNodeConfig,
}

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct PersistentNodeConfig {
    pub prompt: Option<String>,
    pub model: Option<String>,
    pub condition: Option<String>,
    pub command: Option<String>,
    pub webhook_url: Option<String>,
    #[serde(default)]
    pub retry_count: u32,
    pub timeout_secs: Option<u64>,
    #[serde(default)]
    pub inject_context: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PersistentInput {
    pub name: String,
    pub description: String,
    #[serde(default)]
    pub required: bool,
    pub default_value: Option<String>,
    #[serde(default)]
    pub input_type: String,
}

impl PersistentTemplate {
    pub fn from_template(tpl: &WorkflowTemplate) -> Self {
        Self {
            id: tpl.id.clone(),
            name: tpl.name.clone(),
            description: tpl.description.clone(),
            version: tpl.version.clone(),
            nodes: tpl.nodes.iter().map(|n| PersistentNode {
                id: n.id.clone(),
                name: n.name.clone(),
                node_type: format!("{:?}", n.node_type),
                depends_on: n.depends_on.clone(),
                config: PersistentNodeConfig {
                    prompt: n.config.prompt.clone(),
                    model: n.config.model.clone(),
                    condition: n.config.condition.clone(),
                    command: n.config.command.clone(),
                    webhook_url: n.config.webhook_url.clone(),
                    retry_count: n.config.retry_count,
                    timeout_secs: n.config.timeout_secs,
                    inject_context: n.config.inject_context.clone(),
                },
            }).collect(),
            inputs: tpl.inputs.iter().map(|i| PersistentInput {
                name: i.name.clone(),
                description: i.description.clone(),
                required: i.required,
                default_value: i.default_value.clone(),
                input_type: i.input_type.clone(),
            }).collect(),
            tags: tpl.tags.clone(),
        }
    }

    pub fn into_template(self) -> Option<WorkflowTemplate> {
        let nodes: Vec<WorkflowNode> = self.nodes.into_iter().map(|n| {
            let nt = match n.node_type.as_str() {
                "AgentTask" | "agent_task" => NodeType::AgentTask,
                "Condition" | "condition" => NodeType::Condition,
                "Parallel" | "parallel" => NodeType::Parallel,
                "HumanGate" | "human_gate" => NodeType::HumanGate,
                "ToolCall" | "tool_call" => NodeType::ToolCall,
                _ => NodeType::AgentTask,
            };
            WorkflowNode {
                id: n.id,
                name: n.name,
                node_type: nt,
                depends_on: n.depends_on,
                config: NodeConfig {
                    prompt: n.config.prompt,
                    model: n.config.model,
                    condition: n.config.condition,
                    command: n.config.command,
                    webhook_url: n.config.webhook_url,
                    retry_count: n.config.retry_count,
                    timeout_secs: n.config.timeout_secs,
                    inject_context: n.config.inject_context,
                },
                status: ydsz_flow::workflow::NodeStatus::Pending,
                output: None,
                error: None,
                started_at: None,
                finished_at: None,
            }
        }).collect();

        Some(WorkflowTemplate {
            id: self.id,
            name: self.name,
            description: self.description,
            version: self.version,
            nodes,
            inputs: self.inputs.into_iter().map(|i| ydsz_flow::workflow::WorkflowInput {
                name: i.name,
                description: i.description,
                required: i.required,
                default_value: i.default_value,
                input_type: i.input_type,
            }).collect(),
            tags: self.tags,
        })
    }
}

// ============================================================
// 请求/响应 DTO
// ============================================================

/// 创建工作流模板的请求
#[derive(Debug, Deserialize)]
pub struct CreateTemplateRequest {
    pub name: String,
    pub description: Option<String>,
    pub version: Option<String>,
    pub nodes: Vec<WorkflowNodeRequest>,
    pub inputs: Option<Vec<WorkflowInputRequest>>,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
pub struct WorkflowNodeRequest {
    pub id: Option<String>,
    pub name: String,
    #[serde(rename = "node_type")]
    pub node_type: String,
    pub depends_on: Option<Vec<String>>,
    pub config: NodeConfigRequest,
}

#[derive(Debug, Deserialize)]
pub struct NodeConfigRequest {
    pub prompt: Option<String>,
    pub model: Option<String>,
    pub condition: Option<String>,
    pub command: Option<String>,
    pub webhook_url: Option<String>,
    pub retry_count: Option<u32>,
    pub timeout_secs: Option<u64>,
    pub inject_context: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
pub struct WorkflowInputRequest {
    pub name: String,
    pub description: Option<String>,
    pub required: Option<bool>,
    pub default_value: Option<String>,
    pub input_type: Option<String>,
}

/// 创建工作流实例的请求
#[derive(Debug, Deserialize)]
pub struct CreateInstanceRequest {
    pub template_id: Option<String>,
    pub template_name: Option<String>,
    pub inputs: Option<HashMap<String, String>>,
}

/// 完成节点的请求
#[derive(Debug, Deserialize)]
pub struct CompleteNodeRequest {
    pub instance_id: String,
    pub node_id: String,
    pub output: Option<serde_json::Value>,
}

/// 节点摘要（用于前端时间线）
#[derive(Debug, Serialize)]
pub struct NodeSummary {
    pub id: String,
    pub name: String,
    pub node_type: String,
    pub status: String,
    pub depends_on: Vec<String>,
    pub error: Option<String>,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
}

/// 工作流实例摘要（前端列表用）
#[derive(Debug, Serialize)]
pub struct InstanceSummary {
    pub id: String,
    pub template_id: String,
    pub template_name: String,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
    pub total_nodes: usize,
    pub completed_nodes: usize,
    pub nodes: Vec<NodeSummary>,
}

// ============================================================
// Tauri Commands
// ============================================================

/// 列出所有注册的工作流模板（含内置）
#[tauri::command]
pub fn workflow_template_list(
    state: State<'_, WorkflowState>,
) -> Result<Vec<WorkflowTemplate>, String> {
    let engine = state.engine.lock().map_err(|e| e.to_string())?;
    Ok(engine.list_templates().into_iter().cloned().collect())
}

/// 按标签筛选工作流模板
#[tauri::command]
pub fn workflow_template_find_by_tag(
    state: State<'_, WorkflowState>,
    tag: String,
) -> Result<Vec<WorkflowTemplate>, String> {
    let engine = state.engine.lock().map_err(|e| e.to_string())?;
    Ok(engine
        .find_templates_by_tag(&tag)
        .into_iter()
        .cloned()
        .collect())
}

/// 注册自定义工作流模板
#[tauri::command]
pub fn workflow_template_create(
    state: State<'_, WorkflowState>,
    request: CreateTemplateRequest,
) -> Result<String, String> {
    let mut engine = state.engine.lock().map_err(|e| e.to_string())?;

    let nodes: Vec<WorkflowNode> = request
        .nodes
        .into_iter()
        .enumerate()
        .map(|(i, n)| {
            let nt = match n.node_type.as_str() {
                "agent_task" => NodeType::AgentTask,
                "condition" => NodeType::Condition,
                "parallel" => NodeType::Parallel,
                "human_gate" => NodeType::HumanGate,
                "tool_call" => NodeType::ToolCall,
                _ => NodeType::AgentTask,
            };
            WorkflowNode {
                id: n.id.unwrap_or_else(|| format!("node_{}", i + 1)),
                name: n.name,
                node_type: nt,
                depends_on: n.depends_on.unwrap_or_default(),
                config: NodeConfig {
                    prompt: n.config.prompt,
                    model: n.config.model,
                    condition: n.config.condition,
                    command: n.config.command,
                    webhook_url: n.config.webhook_url,
                    retry_count: n.config.retry_count.unwrap_or(0),
                    timeout_secs: n.config.timeout_secs,
                    inject_context: n.config.inject_context.unwrap_or_default(),
                },
                status: ydsz_flow::workflow::NodeStatus::Pending,
                output: None,
                error: None,
                started_at: None,
                finished_at: None,
            }
        })
        .collect();

    let template_id = uuid::Uuid::new_v4().to_string();
    let template = WorkflowTemplate {
        id: template_id.clone(),
        name: request.name,
        description: request.description.unwrap_or_default(),
        version: request.version.unwrap_or_else(|| "1.0.0".to_string()),
        nodes,
        inputs: request.inputs.map(|inputs| {
            inputs
                .into_iter()
                .map(|i| ydsz_flow::workflow::WorkflowInput {
                    name: i.name,
                    description: i.description.unwrap_or_default(),
                    required: i.required.unwrap_or(false),
                    default_value: i.default_value,
                    input_type: i.input_type.unwrap_or_else(|| "string".to_string()),
                })
                .collect()
        }).unwrap_or_default(),
        tags: request.tags.unwrap_or_default(),
    };

    // 校验 DAG 无环
    if DagScheduler::detect_cycle(&template.nodes).is_some() {
        return Err("工作流存在循环依赖，无法创建".to_string());
    }

    engine.register_template(template);

    // 持久化到磁盘
    drop(engine);
    state.save_templates_to_disk()?;

    Ok(template_id)
}

/// 删除工作流模板
#[tauri::command]
pub fn workflow_template_delete(
    state: State<'_, WorkflowState>,
    template_id: String,
) -> Result<(), String> {
    let mut engine = state.engine.lock().map_err(|e| e.to_string())?;
    let removed = engine.remove_template(&template_id);
    drop(engine);
    if removed {
        state.save_templates_to_disk()?;
    }
    Ok(())
}

/// 创建工作流实例（从模板）
#[tauri::command]
pub fn workflow_instance_create(
    state: State<'_, WorkflowState>,
    request: CreateInstanceRequest,
) -> Result<String, String> {
    let mut engine = state.engine.lock().map_err(|e| e.to_string())?;
    let template_id = request.template_id.ok_or("template_id 不能为空")?;
    let inputs = request.inputs.unwrap_or_default();
    let id = engine
        .create_instance(&template_id, inputs)
        .map_err(|e| e.to_string())?;

    // 持久化快照
    drop(engine);
    let _ = state.save_instances_snapshot();

    Ok(id)
}

/// 列出所有工作流实例
#[tauri::command]
pub fn workflow_instance_list(
    state: State<'_, WorkflowState>,
) -> Result<Vec<InstanceSummary>, String> {
    let engine = state.engine.lock().map_err(|e| e.to_string())?;
    let instances: Vec<InstanceSummary> = engine
        .list_instances()
        .into_iter()
        .map(|inst| {
            let total = inst.nodes.len();
            let completed = inst
                .nodes
                .iter()
                .filter(|n| {
                    n.status == ydsz_flow::workflow::NodeStatus::Completed
                })
                .count();
            InstanceSummary {
                id: inst.id.clone(),
                template_id: inst.template_id.clone(),
                template_name: inst.template_name.clone(),
                status: format!("{:?}", inst.status).to_lowercase(),
                created_at: inst.created_at.clone(),
                updated_at: inst.updated_at.clone(),
                started_at: inst.started_at.clone(),
                finished_at: inst.finished_at.clone(),
                total_nodes: total,
                completed_nodes: completed,
                nodes: inst
                    .nodes
                    .iter()
                    .map(|n| NodeSummary {
                        id: n.id.clone(),
                        name: n.name.clone(),
                        node_type: format!("{:?}", n.node_type).to_lowercase(),
                        status: format!("{:?}", n.status).to_lowercase(),
                        depends_on: n.depends_on.clone(),
                        error: n.error.clone(),
                        started_at: n.started_at.clone(),
                        finished_at: n.finished_at.clone(),
                    })
                    .collect(),
            }
        })
        .collect();
    Ok(instances)
}

/// 获取单个实例详情
#[tauri::command]
pub fn workflow_instance_get(
    state: State<'_, WorkflowState>,
    instance_id: String,
) -> Result<Option<WorkflowInstance>, String> {
    let engine = state.engine.lock().map_err(|e| e.to_string())?;
    Ok(engine.get_instance(&instance_id).cloned())
}

/// 获取就绪节点
#[tauri::command]
pub fn workflow_instance_ready_nodes(
    state: State<'_, WorkflowState>,
    instance_id: String,
) -> Result<Vec<NodeSummary>, String> {
    let engine = state.engine.lock().map_err(|e| e.to_string())?;
    let ready = engine
        .get_ready_nodes(&instance_id)
        .map_err(|e| e.to_string())?;
    Ok(ready
        .into_iter()
        .map(|n| NodeSummary {
            id: n.id.clone(),
            name: n.name.clone(),
            node_type: format!("{:?}", n.node_type).to_lowercase(),
            status: format!("{:?}", n.status).to_lowercase(),
            depends_on: n.depends_on.clone(),
            error: n.error.clone(),
            started_at: n.started_at.clone(),
            finished_at: n.finished_at.clone(),
        })
        .collect())
}

/// 完成节点执行（带自动快照）
#[tauri::command]
pub fn workflow_node_complete(
    state: State<'_, WorkflowState>,
    request: CompleteNodeRequest,
) -> Result<Vec<String>, String> {
    let mut engine = state.engine.lock().map_err(|e| e.to_string())?;
    let next_nodes = engine
        .complete_node(&request.instance_id, &request.node_id, request.output)
        .map_err(|e| e.to_string())?;

    // 自动持久化
    drop(engine);
    let _ = state.save_instances_snapshot();

    Ok(next_nodes)
}

/// 标记节点失败（带自动快照）
#[tauri::command]
pub fn workflow_node_fail(
    state: State<'_, WorkflowState>,
    instance_id: String,
    node_id: String,
    error: String,
) -> Result<(), String> {
    let mut engine = state.engine.lock().map_err(|e| e.to_string())?;
    engine
        .fail_node(&instance_id, &node_id, &error)
        .map_err(|e| e.to_string())?;

    // 自动持久化
    drop(engine);
    let _ = state.save_instances_snapshot();

    Ok(())
}

/// 暂停工作流实例（持久化快照）
#[tauri::command]
pub fn workflow_instance_pause(
    state: State<'_, WorkflowState>,
    instance_id: String,
) -> Result<(), String> {
    let mut engine = state.engine.lock().map_err(|e| e.to_string())?;
    engine
        .pause_instance(&instance_id)
        .map_err(|e| e.to_string())?;

    drop(engine);
    let _ = state.save_instances_snapshot();
    Ok(())
}

/// 恢复运行工作流实例（持久化快照）
#[tauri::command]
pub fn workflow_instance_resume(
    state: State<'_, WorkflowState>,
    instance_id: String,
) -> Result<(), String> {
    let mut engine = state.engine.lock().map_err(|e| e.to_string())?;
    engine
        .resume_instance(&instance_id)
        .map_err(|e| e.to_string())?;

    drop(engine);
    let _ = state.save_instances_snapshot();
    Ok(())
}

/// 取消工作流实例
#[tauri::command]
pub fn workflow_instance_cancel(
    state: State<'_, WorkflowState>,
    instance_id: String,
) -> Result<(), String> {
    let mut engine = state.engine.lock().map_err(|e| e.to_string())?;
    engine
        .cancel_instance(&instance_id)
        .map_err(|e| e.to_string())?;

    drop(engine);
    let _ = state.save_instances_snapshot();
    Ok(())
}

/// 获取持久化存储路径（供前端查询）
#[tauri::command]
pub fn workflow_storage_dir(
    state: State<'_, WorkflowState>,
) -> Result<String, String> {
    Ok(state.storage_dir.to_string_lossy().to_string())
}
