//! Dynamic Workflow Engine Commands (P0-1)
//!
//! DAG-based multi-step orchestration with template management,
//! instance lifecycle, and node execution status tracking.

use std::collections::HashMap;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::State;

use ydsz_flow::workflow::{
    DagScheduler, NodeConfig, NodeType, WorkflowEngine, WorkflowInstance, WorkflowNode,
    WorkflowTemplate,
};

/// 应用级工作流引擎状态
pub struct WorkflowState {
    pub engine: Mutex<WorkflowEngine>,
}

impl WorkflowState {
    pub fn new() -> Self {
        Self {
            engine: Mutex::new(WorkflowEngine::new()),
        }
    }
}

impl Default for WorkflowState {
    fn default() -> Self {
        Self::new()
    }
}

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
    Ok(template_id)
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
    engine
        .create_instance(&template_id, inputs)
        .map_err(|e| e.to_string())
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

/// 完成节点执行
#[tauri::command]
pub fn workflow_node_complete(
    state: State<'_, WorkflowState>,
    request: CompleteNodeRequest,
) -> Result<Vec<String>, String> {
    let mut engine = state.engine.lock().map_err(|e| e.to_string())?;
    engine
        .complete_node(&request.instance_id, &request.node_id, request.output)
        .map_err(|e| e.to_string())
}

/// 标记节点失败
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
        .map_err(|e| e.to_string())
}

/// 暂停工作流实例
#[tauri::command]
pub fn workflow_instance_pause(
    state: State<'_, WorkflowState>,
    instance_id: String,
) -> Result<(), String> {
    let mut engine = state.engine.lock().map_err(|e| e.to_string())?;
    engine
        .pause_instance(&instance_id)
        .map_err(|e| e.to_string())
}

/// 恢复运行工作流实例
#[tauri::command]
pub fn workflow_instance_resume(
    state: State<'_, WorkflowState>,
    instance_id: String,
) -> Result<(), String> {
    let mut engine = state.engine.lock().map_err(|e| e.to_string())?;
    engine
        .resume_instance(&instance_id)
        .map_err(|e| e.to_string())
}
