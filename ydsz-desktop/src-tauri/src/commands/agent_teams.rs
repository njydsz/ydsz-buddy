//! # AgentTeams 编排命令模块 (G13-P2)
//!
//! 提供多 Agent 协作团队的可视化编排管理，包括团队配置的 CRUD、
//! 工作流步骤的 DAG 展示、以及团队任务的执行。

use std::collections::HashMap;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::State;
use tracing::info;

// ============================================================================
// 数据结构
// ============================================================================

/// 团队配置
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct TeamConfig {
    pub id: String,
    pub name: String,
    pub description: String,
    pub coordinator_id: String,
    pub members: Vec<TeamMember>,
    pub workflow: Vec<WorkflowStep>,
}

/// 团队成员
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct TeamMember {
    pub agent_id: String,
    pub role: String,
    pub skills: Vec<String>,
}

/// 工作流步骤
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct WorkflowStep {
    pub id: String,
    pub name: String,
    pub assignee: String,
    pub depends_on: Vec<String>,
    pub prompt_template: String,
}

/// 团队摘要信息（列表视图用）
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct TeamSummary {
    pub id: String,
    pub name: String,
    pub description: String,
    pub member_count: usize,
    pub step_count: usize,
}

/// 预设模板定义
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct TeamTemplate {
    pub id: String,
    pub name: String,
    pub description: String,
    pub coordinator_id: String,
    pub members: Vec<TeamMember>,
    pub workflow: Vec<WorkflowStep>,
}

/// 团队执行输入
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct TeamExecuteInput {
    pub team_id: String,
    pub input: String,
}

/// 团队执行结果
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct TeamExecuteResult {
    pub team_id: String,
    pub status: String,
    pub step_results: Vec<StepResult>,
}

/// 单步执行结果
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct StepResult {
    pub step_id: String,
    pub step_name: String,
    pub assignee: String,
    pub status: String,
    pub output: String,
}

// ============================================================================
// 状态管理
// ============================================================================

/// AgentTeams 状态管理器
pub struct AgentTeamsState {
    teams: Mutex<HashMap<String, TeamConfig>>,
}

impl AgentTeamsState {
    pub fn new() -> Self {
        Self {
            teams: Mutex::new(HashMap::new()),
        }
    }
}

impl Default for AgentTeamsState {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================================
// 预设模板
// ============================================================================

/// 获取预设团队模板列表
fn builtin_templates() -> Vec<TeamTemplate> {
    vec![
        TeamTemplate {
            id: "code-review-team".to_string(),
            name: "代码评审团队".to_string(),
            description: "多人协作完成代码审查，包括风格检查、逻辑审查、安全扫描和建议汇总".to_string(),
            coordinator_id: "lead-reviewer".to_string(),
            members: vec![
                TeamMember {
                    agent_id: "lead-reviewer".to_string(),
                    role: "首席审查者".to_string(),
                    skills: vec!["code-review".to_string(), "architecture".to_string()],
                },
                TeamMember {
                    agent_id: "style-checker".to_string(),
                    role: "代码风格检查员".to_string(),
                    skills: vec!["linting".to_string(), "formatting".to_string()],
                },
                TeamMember {
                    agent_id: "security-auditor".to_string(),
                    role: "安全审计员".to_string(),
                    skills: vec!["security".to_string(), "vulnerability-scan".to_string()],
                },
                TeamMember {
                    agent_id: "perf-analyzer".to_string(),
                    role: "性能分析员".to_string(),
                    skills: vec!["performance".to_string(), "profiling".to_string()],
                },
            ],
            workflow: vec![
                WorkflowStep {
                    id: "receive-code".to_string(),
                    name: "接收代码变更".to_string(),
                    assignee: "lead-reviewer".to_string(),
                    depends_on: vec![],
                    prompt_template: "分析以下代码变更的整体架构和意图: {{input}}".to_string(),
                },
                WorkflowStep {
                    id: "check-style".to_string(),
                    name: "检查代码风格".to_string(),
                    assignee: "style-checker".to_string(),
                    depends_on: vec!["receive-code".to_string()],
                    prompt_template: "检查代码风格和可维护性问题: {{input}}".to_string(),
                },
                WorkflowStep {
                    id: "audit-security".to_string(),
                    name: "安全审计".to_string(),
                    assignee: "security-auditor".to_string(),
                    depends_on: vec!["receive-code".to_string()],
                    prompt_template: "审查代码中的安全隐患和漏洞: {{input}}".to_string(),
                },
                WorkflowStep {
                    id: "analyze-perf".to_string(),
                    name: "分析性能".to_string(),
                    assignee: "perf-analyzer".to_string(),
                    depends_on: vec!["receive-code".to_string()],
                    prompt_template: "分析代码的性能瓶颈和优化空间: {{input}}".to_string(),
                },
                WorkflowStep {
                    id: "synthesize".to_string(),
                    name: "汇总评审报告".to_string(),
                    assignee: "lead-reviewer".to_string(),
                    depends_on: vec![
                        "check-style".to_string(),
                        "audit-security".to_string(),
                        "analyze-perf".to_string(),
                    ],
                    prompt_template: "汇总以下审查结果，生成综合评审报告:\n风格: {{check-style}}\n安全: {{audit-security}}\n性能: {{analyze-perf}}".to_string(),
                },
            ],
        },
        TeamTemplate {
            id: "doc-writing-team".to_string(),
            name: "文档编写团队".to_string(),
            description: "协作编写技术文档，包括 API 文档、README 和使用指南".to_string(),
            coordinator_id: "doc-lead".to_string(),
            members: vec![
                TeamMember {
                    agent_id: "doc-lead".to_string(),
                    role: "文档负责人".to_string(),
                    skills: vec!["technical-writing".to_string(), "information-architecture".to_string()],
                },
                TeamMember {
                    agent_id: "api-writer".to_string(),
                    role: "API 文档工程师".to_string(),
                    skills: vec!["api-documentation".to_string(), "openapi".to_string()],
                },
                TeamMember {
                    agent_id: "example-curator".to_string(),
                    role: "示例编排员".to_string(),
                    skills: vec!["code-examples".to_string(), "tutorials".to_string()],
                },
            ],
            workflow: vec![
                WorkflowStep {
                    id: "plan-doc".to_string(),
                    name: "规划文档结构".to_string(),
                    assignee: "doc-lead".to_string(),
                    depends_on: vec![],
                    prompt_template: "为 {{input}} 规划文档结构和章节大纲".to_string(),
                },
                WorkflowStep {
                    id: "write-api".to_string(),
                    name: "编写 API 文档".to_string(),
                    assignee: "api-writer".to_string(),
                    depends_on: vec!["plan-doc".to_string()],
                    prompt_template: "根据结构编写详细的 API 文档: {{input}}".to_string(),
                },
                WorkflowStep {
                    id: "write-examples".to_string(),
                    name: "编写示例代码".to_string(),
                    assignee: "example-curator".to_string(),
                    depends_on: vec!["plan-doc".to_string()],
                    prompt_template: "根据文档结构编写丰富的示例代码: {{input}}".to_string(),
                },
                WorkflowStep {
                    id: "finalize-doc".to_string(),
                    name: "汇总最终文档".to_string(),
                    assignee: "doc-lead".to_string(),
                    depends_on: vec!["write-api".to_string(), "write-examples".to_string()],
                    prompt_template: "汇总 API 文档和示例为完整文档: {{write-api}} + {{write-examples}}".to_string(),
                },
            ],
        },
        TeamTemplate {
            id: "data-analysis-team".to_string(),
            name: "数据分析团队".to_string(),
            description: "多角色协作完成数据分析任务，包括数据清洗、统计分析、可视化和报告撰写".to_string(),
            coordinator_id: "analysis-lead".to_string(),
            members: vec![
                TeamMember {
                    agent_id: "analysis-lead".to_string(),
                    role: "分析负责人".to_string(),
                    skills: vec!["data-science".to_string(), "project-management".to_string()],
                },
                TeamMember {
                    agent_id: "data-cleaner".to_string(),
                    role: "数据清洗员".to_string(),
                    skills: vec!["data-cleaning".to_string(), "etl".to_string()],
                },
                TeamMember {
                    agent_id: "statistician".to_string(),
                    role: "统计分析员".to_string(),
                    skills: vec!["statistics".to_string(), "hypothesis-testing".to_string()],
                },
                TeamMember {
                    agent_id: "viz-specialist".to_string(),
                    role: "可视化专员".to_string(),
                    skills: vec!["data-visualization".to_string(), "charting".to_string()],
                },
            ],
            workflow: vec![
                WorkflowStep {
                    id: "understand-data".to_string(),
                    name: "理解数据".to_string(),
                    assignee: "analysis-lead".to_string(),
                    depends_on: vec![],
                    prompt_template: "分析数据集的结构和质量: {{input}}".to_string(),
                },
                WorkflowStep {
                    id: "clean-data".to_string(),
                    name: "清洗数据".to_string(),
                    assignee: "data-cleaner".to_string(),
                    depends_on: vec!["understand-data".to_string()],
                    prompt_template: "清洗和预处理数据: {{input}}".to_string(),
                },
                WorkflowStep {
                    id: "analyze".to_string(),
                    name: "统计分析".to_string(),
                    assignee: "statistician".to_string(),
                    depends_on: vec!["clean-data".to_string()],
                    prompt_template: "对清洗后的数据进行统计分析: {{input}}".to_string(),
                },
                WorkflowStep {
                    id: "visualize".to_string(),
                    name: "生成可视化".to_string(),
                    assignee: "viz-specialist".to_string(),
                    depends_on: vec!["analyze".to_string()],
                    prompt_template: "基于分析结果制作数据可视化: {{input}}".to_string(),
                },
                WorkflowStep {
                    id: "report".to_string(),
                    name: "生成分析报告".to_string(),
                    assignee: "analysis-lead".to_string(),
                    depends_on: vec!["visualize".to_string()],
                    prompt_template: "汇总所有分析成果，生成最终报告: {{analyze}} + {{visualize}}".to_string(),
                },
            ],
        },
    ]
}

// ============================================================================
// Tauri 命令
// ============================================================================

/// 列出所有团队配置（包括预设模板）
#[tauri::command]
#[specta::specta]
pub async fn agent_teams_list(
    state: State<'_, AgentTeamsState>,
) -> Result<Vec<TeamSummary>, String> {
    let teams = state.teams.lock().map_err(|e| e.to_string())?;
    let mut summaries: Vec<TeamSummary> = teams
        .values()
        .map(|t| TeamSummary {
            id: t.id.clone(),
            name: t.name.clone(),
            description: t.description.clone(),
            member_count: t.members.len(),
            step_count: t.workflow.len(),
        })
        .collect();

    // 追加预设模板摘要（带 template- 前缀以区分）
    for tmpl in builtin_templates() {
        summaries.push(TeamSummary {
            id: tmpl.id,
            name: tmpl.name,
            description: tmpl.description,
            member_count: tmpl.members.len(),
            step_count: tmpl.workflow.len(),
        });
    }

    Ok(summaries)
}

/// 获取单个团队配置
#[tauri::command]
#[specta::specta]
pub async fn agent_teams_get(
    state: State<'_, AgentTeamsState>,
    id: String,
) -> Result<Option<TeamConfig>, String> {
    // 先从已保存团队中查找
    let teams = state.teams.lock().map_err(|e| e.to_string())?;
    if let Some(team) = teams.get(&id) {
        return Ok(Some(team.clone()));
    }
    drop(teams);

    // 从预设模板中查找
    for tmpl in builtin_templates() {
        if tmpl.id == id {
            return Ok(Some(TeamConfig {
                id: tmpl.id,
                name: tmpl.name,
                description: tmpl.description,
                coordinator_id: tmpl.coordinator_id,
                members: tmpl.members,
                workflow: tmpl.workflow,
            }));
        }
    }

    Ok(None)
}

/// 保存团队配置
#[tauri::command]
#[specta::specta]
pub async fn agent_teams_save(
    state: State<'_, AgentTeamsState>,
    config: TeamConfig,
) -> Result<String, String> {
    let mut teams = state.teams.lock().map_err(|e| e.to_string())?;
    let id = config.id.clone();
    info!(team_id = %id, team_name = %config.name, "保存团队配置");
    teams.insert(id.clone(), config);
    Ok(id)
}

/// 删除团队配置
#[tauri::command]
#[specta::specta]
pub async fn agent_teams_delete(
    state: State<'_, AgentTeamsState>,
    id: String,
) -> Result<(), String> {
    let mut teams = state.teams.lock().map_err(|e| e.to_string())?;
    info!(team_id = %id, "删除团队配置");
    teams.remove(&id);
    Ok(())
}

/// 执行团队协作任务
#[tauri::command]
#[specta::specta]
pub async fn agent_teams_execute(
    state: State<'_, AgentTeamsState>,
    team_id: String,
    input: String,
) -> Result<TeamExecuteResult, String> {
    // 先获取团队配置
    let team = {
        let teams = state.teams.lock().map_err(|e| e.to_string())?;
        if let Some(t) = teams.get(&team_id) {
            t.clone()
        } else {
            // 从模板中查找
            let mut found = None;
            for tmpl in builtin_templates() {
                if tmpl.id == team_id {
                    found = Some(TeamConfig {
                        id: tmpl.id,
                        name: tmpl.name,
                        description: tmpl.description,
                        coordinator_id: tmpl.coordinator_id,
                        members: tmpl.members,
                        workflow: tmpl.workflow,
                    });
                    break;
                }
            }
            found.ok_or_else(|| format!("团队 '{}' 不存在", team_id))?
        }
    };

    info!(
        team_id = %team_id,
        team_name = %team.name,
        input_len = input.len(),
        "执行团队协作任务"
    );

    // 按依赖拓扑顺序模拟执行各步骤
    let mut completed_steps: HashMap<String, StepResult> = HashMap::new();
    let mut step_queue: Vec<String> = Vec::new();

    // 找到没有依赖的步骤作为起点
    for step in &team.workflow {
        if step.depends_on.is_empty() {
            step_queue.push(step.id.clone());
        }
    }

    // 简单的拓扑排序执行
    while !step_queue.is_empty() {
        let step_id = step_queue.remove(0);

        // 找到步骤定义
        let step = team.workflow.iter().find(|s| s.id == step_id);
        let Some(step) = step else { continue };

        // 检查依赖是否全部完成
        let deps_satisfied = step.depends_on.iter().all(|dep| completed_steps.contains_key(dep));
        if !deps_satisfied {
            // 重新放到队列末尾，等待依赖完成
            step_queue.push(step_id.clone());
            // 防止死循环：如果所有剩余步骤的依赖都没完成，退出
            if step_queue.iter().all(|sid| {
                team.workflow
                    .iter()
                    .find(|s| s.id == *sid)
                    .map(|s| !s.depends_on.iter().all(|d| completed_steps.contains_key(d)))
                    .unwrap_or(true)
            }) {
                break;
            }
            continue;
        }

        // 模拟执行：收集依赖的输出作为上下文
        let dep_outputs: Vec<String> = step
            .depends_on
            .iter()
            .filter_map(|dep| completed_steps.get(dep).map(|r| r.output.clone()))
            .collect();

        let prompt = step
            .prompt_template
            .replace("{{input}}", &input)
            .replace("{{team}}", &team.name);

        // 模拟输出
        let output = format!(
            "[{}] 角色 '{}' 完成了任务 '{}': 收到输入（{} 字符），处理了 {} 个依赖上下文，使用提示模板生成结果。",
            step.assignee,
            step.assignee,
            step.name,
            input.len(),
            dep_outputs.len()
        );

        let result = StepResult {
            step_id: step.id.clone(),
            step_name: step.name.clone(),
            assignee: step.assignee.clone(),
            status: "completed".to_string(),
            output,
        };

        completed_steps.insert(step_id.clone(), result);

        // 将下游步骤加入队列
        for next_step in &team.workflow {
            if next_step.depends_on.contains(&step_id) && !step_queue.contains(&next_step.id)
                && !completed_steps.contains_key(&next_step.id)
            {
                step_queue.push(next_step.id.clone());
            }
        }
    }

    // 收集未执行步骤（依赖死锁或拓扑异常）
    let mut step_results: Vec<StepResult> = Vec::new();
    for step in &team.workflow {
        if let Some(result) = completed_steps.get(&step.id) {
            step_results.push(result.clone());
        } else {
            step_results.push(StepResult {
                step_id: step.id.clone(),
                step_name: step.name.clone(),
                assignee: step.assignee.clone(),
                status: "skipped".to_string(),
                output: "步骤因依赖未满足而被跳过".to_string(),
            });
        }
    }

    let success_count = step_results.iter().filter(|r| r.status == "completed").count();
    let status = if success_count == step_results.len() {
        "success".to_string()
    } else if success_count > 0 {
        "partial".to_string()
    } else {
        "failed".to_string()
    };

    Ok(TeamExecuteResult {
        team_id,
        status,
        step_results,
    })
}

/// 获取预设团队模板列表
#[tauri::command]
#[specta::specta]
pub async fn agent_teams_templates() -> Result<Vec<TeamTemplate>, String> {
    Ok(builtin_templates())
}

/// 从预设模板创建团队配置
#[tauri::command]
#[specta::specta]
pub async fn agent_teams_create_from_template(
    state: State<'_, AgentTeamsState>,
    template_id: String,
) -> Result<TeamConfig, String> {
    let tmpl = builtin_templates()
        .into_iter()
        .find(|t| t.id == template_id)
        .ok_or_else(|| format!("模板 '{}' 不存在", template_id))?;

    let config = TeamConfig {
        id: format!("team-{}", uuid::Uuid::new_v4()),
        name: tmpl.name,
        description: tmpl.description,
        coordinator_id: tmpl.coordinator_id,
        members: tmpl.members,
        workflow: tmpl.workflow,
    };

    let mut teams = state.teams.lock().map_err(|e| e.to_string())?;
    teams.insert(config.id.clone(), config.clone());

    info!(team_id = %config.id, template_id = %template_id, "从模板创建团队配置");
    Ok(config)
}
