//! # 自进化能力框架命令模块 (G18-P2)
//!
//! 建立「对话 → 自动沉淀为可复用技能」的框架基础。
//!
//! ## 命令清单
//!
//! | 命令 | 说明 |
//! |------|------|
//! | `evolution_rules_list` | 列出所有进化规则 |
//! | `evolution_rules_save` | 创建或更新进化规则 |
//! | `evolution_rules_toggle` | 启用/禁用进化规则 |
//! | `evolution_skills_list` | 列出所有生成的技能 |
//! | `evolution_skill_approve` | 审批通过技能 |
//! | `evolution_skill_reject` | 拒绝技能 |
//! | `evolution_analyze_conversation` | 分析对话并尝试提取技能 |

use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::State;
use tracing::{info, warn};

// --- 数据类型定义 ---

/// 进化触发条件
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum EvolutionTrigger {
    /// 任务完成且轮次足够时触发
    #[serde(rename_all = "camelCase")]
    TaskCompleted { min_turns: u32 },
    /// 同一工具重复使用时触发
    #[serde(rename_all = "camelCase")]
    ToolRepeated { tool: String, min_uses: u32 },
    /// 用户给出正向反馈时触发
    UserFeedbackPositive,
}

/// 进化规则定义
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct EvolutionRule {
    pub id: String,
    pub name: String,
    pub trigger: EvolutionTrigger,
    /// 提取技能用的 LLM prompt 模板
    pub extract_prompt: String,
    pub enabled: bool,
    pub created_at: String,
    pub updated_at: String,
}

/// 生成技能的状态
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum SkillStatus {
    PendingReview,
    Approved,
    Rejected,
}

impl std::fmt::Display for SkillStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SkillStatus::PendingReview => write!(f, "pendingReview"),
            SkillStatus::Approved => write!(f, "approved"),
            SkillStatus::Rejected => write!(f, "rejected"),
        }
    }
}

impl std::str::FromStr for SkillStatus {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "pendingReview" | "PendingReview" => Ok(SkillStatus::PendingReview),
            "approved" | "Approved" => Ok(SkillStatus::Approved),
            "rejected" | "Rejected" => Ok(SkillStatus::Rejected),
            _ => Err(format!("Unknown SkillStatus: {}", s)),
        }
    }
}

/// 从对话中自动生成的技能
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedSkill {
    pub id: String,
    pub name: String,
    pub source_conversation_id: String,
    pub script_content: String,
    pub generated_at_ms: i64,
    pub status: SkillStatus,
    /// 触发该技能生成的规则 ID
    pub rule_id: String,
    /// 审批备注
    pub review_note: Option<String>,
}

/// 对话分析结果
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ConversationAnalysis {
    pub conversation_id: String,
    pub turn_count: u32,
    pub tool_use_counts: std::collections::HashMap<String, u32>,
    pub has_positive_feedback: bool,
    /// 匹配到的规则 ID 列表
    pub matched_rules: Vec<String>,
}

// --- 状态管理 ---

/// 进化框架状态
pub struct EvolutionState {
    rules: Mutex<Vec<EvolutionRule>>,
    skills: Mutex<Vec<GeneratedSkill>>,
}

impl Default for EvolutionState {
    fn default() -> Self {
        Self::new()
    }
}

impl EvolutionState {
    pub fn new() -> Self {
        Self {
            rules: Mutex::new(Self::default_rules()),
            skills: Mutex::new(Vec::new()),
        }
    }

    /// 创建默认进化规则
    fn default_rules() -> Vec<EvolutionRule> {
        let now = chrono::Utc::now().to_rfc3339();
        vec![
            EvolutionRule {
                id: "rule-task-complex".to_string(),
                name: "复杂任务模式提取".to_string(),
                trigger: EvolutionTrigger::TaskCompleted { min_turns: 8 },
                extract_prompt: r#"分析以下对话，提取可复用的工作流模式。
要求：1) 关注工具调用序列 2) 提炼为 SKILL.md 格式 3) 提取关键参数为可配置变量

对话内容：
{conversation_content}

请输出标准的 SKILL.md 格式：
# Skill: {skill_name}
## 触发条件
## 工具调用序列
## 可配置参数
## 注意事项"#.to_string(),
                enabled: true,
                created_at: now.clone(),
                updated_at: now.clone(),
            },
            EvolutionRule {
                id: "rule-tool-repeated".to_string(),
                name: "重复工具调用提取".to_string(),
                trigger: EvolutionTrigger::ToolRepeated {
                    tool: "bash".to_string(),
                    min_uses: 5,
                },
                extract_prompt: r#"用户在同一对话中多次使用了 {tool} 工具。
分析以下对话，提炼出可复用的命令模板：

对话内容：
{conversation_content}

请提取：
# Skill: {skill_name}
## 命令模板
## 参数说明
## 使用示例"#.to_string(),
                enabled: true,
                created_at: now.clone(),
                updated_at: now.clone(),
            },
            EvolutionRule {
                id: "rule-positive-feedback".to_string(),
                name: "正向反馈经验提取".to_string(),
                trigger: EvolutionTrigger::UserFeedbackPositive,
                extract_prompt: r#"用户对以下对话中的解决方案给出了正向反馈。
分析对话并提取为可复用技能：

对话内容：
{conversation_content}

请输出：
# Skill: {skill_name}
## 问题描述
## 解决方案
## 适用场景"#.to_string(),
                enabled: false,
                created_at: now.clone(),
                updated_at: now,
            },
        ]
    }
}

// --- 文件持久化 ---

fn evolution_data_dir() -> PathBuf {
    if let Some(home) = std::env::var_os("USERPROFILE") {
        return PathBuf::from(home).join(".ydsz-buddy").join("evolution");
    }
    if let Some(home) = std::env::var_os("HOME") {
        return PathBuf::from(home).join(".ydsz-buddy").join("evolution");
    }
    PathBuf::from(".ydsz-buddy/evolution")
}

fn rules_file_path() -> PathBuf {
    evolution_data_dir().join("rules.json")
}

fn skills_file_path() -> PathBuf {
    evolution_data_dir().join("skills.json")
}

fn persist_rules(rules: &Vec<EvolutionRule>) -> Result<(), String> {
    let path = rules_file_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
    }
    let json = serde_json::to_string_pretty(rules).map_err(|e| format!("序列化失败: {}", e))?;
    std::fs::write(&path, json).map_err(|e| format!("写入失败: {}", e))?;
    Ok(())
}

fn persist_skills(skills: &Vec<GeneratedSkill>) -> Result<(), String> {
    let path = skills_file_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
    }
    let json = serde_json::to_string_pretty(skills).map_err(|e| format!("序列化失败: {}", e))?;
    std::fs::write(&path, json).map_err(|e| format!("写入失败: {}", e))?;
    Ok(())
}

fn load_rules() -> Vec<EvolutionRule> {
    let path = rules_file_path();
    if !path.exists() {
        return EvolutionState::default_rules();
    }
    match std::fs::read_to_string(&path) {
        Ok(json) => serde_json::from_str(&json).unwrap_or_else(|e| {
            warn!("解析 rules.json 失败: {}, 使用默认规则", e);
            EvolutionState::default_rules()
        }),
        Err(e) => {
            warn!("读取 rules.json 失败: {}, 使用默认规则", e);
            EvolutionState::default_rules()
        }
    }
}

fn load_skills() -> Vec<GeneratedSkill> {
    let path = skills_file_path();
    if !path.exists() {
        return Vec::new();
    }
    match std::fs::read_to_string(&path) {
        Ok(json) => serde_json::from_str(&json).unwrap_or_else(|e| {
            warn!("解析 skills.json 失败: {}, 使用空列表", e);
            Vec::new()
        }),
        Err(e) => {
            warn!("读取 skills.json 失败: {}, 使用空列表", e);
            Vec::new()
        }
    }
}

// --- Tauri 命令 ---

/// 列出所有进化规则
#[tauri::command]
#[specta::specta]
pub fn evolution_rules_list(
    state: State<'_, EvolutionState>,
) -> Result<Vec<EvolutionRule>, String> {
    let rules = state.rules.lock().map_err(|e| format!("锁错误: {}", e))?;
    Ok(rules.clone())
}

/// 创建或更新进化规则
#[tauri::command]
#[specta::specta]
pub fn evolution_rules_save(
    state: State<'_, EvolutionState>,
    rule: EvolutionRule,
) -> Result<String, String> {
    let mut rules = state.rules.lock().map_err(|e| format!("锁错误: {}", e))?;
    let now = chrono::Utc::now().to_rfc3339();

    if let Some(existing) = rules.iter_mut().find(|r| r.id == rule.id) {
        // 更新已有规则
        existing.name = rule.name;
        existing.trigger = rule.trigger;
        existing.extract_prompt = rule.extract_prompt;
        existing.updated_at = now;
        info!("更新进化规则: {}", rule.id);
        persist_rules(&rules)?;
        Ok(rule.id)
    } else {
        // 新增规则
        let mut new_rule = rule;
        new_rule.created_at = now.clone();
        new_rule.updated_at = now;
        let id = new_rule.id.clone();
        rules.push(new_rule);
        info!("新增进化规则: {}", id);
        persist_rules(&rules)?;
        Ok(id)
    }
}

/// 启用/禁用进化规则
#[tauri::command]
#[specta::specta]
pub fn evolution_rules_toggle(
    state: State<'_, EvolutionState>,
    id: String,
    enabled: bool,
) -> Result<(), String> {
    let mut rules = state.rules.lock().map_err(|e| format!("锁错误: {}", e))?;
    if let Some(rule) = rules.iter_mut().find(|r| r.id == id) {
        rule.enabled = enabled;
        rule.updated_at = chrono::Utc::now().to_rfc3339();
        info!("切换进化规则 {} enabled={}", id, enabled);
        persist_rules(&rules)?;
        Ok(())
    } else {
        Err(format!("规则不存在: {}", id))
    }
}

/// 列出所有生成的技能
#[tauri::command]
#[specta::specta]
pub fn evolution_skills_list(
    state: State<'_, EvolutionState>,
) -> Result<Vec<GeneratedSkill>, String> {
    let skills = state.skills.lock().map_err(|e| format!("锁错误: {}", e))?;
    Ok(skills.clone())
}

/// 审批通过技能
#[tauri::command]
#[specta::specta]
pub async fn evolution_skill_approve(
    state: State<'_, EvolutionState>,
    id: String,
    note: Option<String>,
) -> Result<(), String> {
    let mut skills = state.skills.lock().map_err(|e| format!("锁错误: {}", e))?;
    if let Some(skill) = skills.iter_mut().find(|s| s.id == id) {
        skill.status = SkillStatus::Approved;
        skill.review_note = note;
        info!("技能已通过审批: {}", id);
        persist_skills(&skills)?;
        Ok(())
    } else {
        Err(format!("技能不存在: {}", id))
    }
}

/// 拒绝技能
#[tauri::command]
#[specta::specta]
pub async fn evolution_skill_reject(
    state: State<'_, EvolutionState>,
    id: String,
    note: Option<String>,
) -> Result<(), String> {
    let mut skills = state.skills.lock().map_err(|e| format!("锁错误: {}", e))?;
    if let Some(skill) = skills.iter_mut().find(|s| s.id == id) {
        skill.status = SkillStatus::Rejected;
        skill.review_note = note;
        info!("技能已拒绝: {}", id);
        persist_skills(&skills)?;
        Ok(())
    } else {
        Err(format!("技能不存在: {}", id))
    }
}

/// 分析对话并尝试提取技能
#[tauri::command]
#[specta::specta]
pub async fn evolution_analyze_conversation(
    state: State<'_, EvolutionState>,
    conversation_id: String,
    turn_count: u32,
    tool_use_counts: std::collections::HashMap<String, u32>,
    has_positive_feedback: bool,
) -> Result<Option<GeneratedSkill>, String> {
    info!("开始分析对话 {} ({} turns)", conversation_id, turn_count);

    let rules = state.rules.lock().map_err(|e| format!("锁错误: {}", e))?;

    // 检查哪些规则被触发
    let mut matched_rule: Option<&EvolutionRule> = None;
    for rule in rules.iter() {
        if !rule.enabled {
            continue;
        }
        match &rule.trigger {
            EvolutionTrigger::TaskCompleted { min_turns } => {
                if turn_count >= *min_turns {
                    matched_rule = Some(rule);
                    break;
                }
            }
            EvolutionTrigger::ToolRepeated { tool, min_uses } => {
                if let Some(&count) = tool_use_counts.get(tool) {
                    if count >= *min_uses {
                        matched_rule = Some(rule);
                        break;
                    }
                }
            }
            EvolutionTrigger::UserFeedbackPositive => {
                if has_positive_feedback {
                    matched_rule = Some(rule);
                    break;
                }
            }
        }
    }

    let rule = match matched_rule {
        Some(r) => r,
        None => {
            info!("对话 {} 未触发任何进化规则", conversation_id);
            return Ok(None);
        }
    };

    info!("对话 {} 触发规则: {}", conversation_id, rule.name);

    // 生成技能占位内容（实际实现需要调用 LLM）
    let now_ms = chrono::Utc::now().timestamp_millis();
    let skill_id = format!("skill-{}-{}", rule.id, &conversation_id[..8.min(conversation_id.len())]);

    let skill = GeneratedSkill {
        id: skill_id.clone(),
        name: format!("从对话提取[{}]", rule.name),
        source_conversation_id: conversation_id.clone(),
        script_content: format!(
            "# Skill: 从对话提取\n\n\
             ## 来源\n\
             - 对话 ID: {}\n\
             - 触发规则: {}\n\
             - 创建时间: {}\n\
             \n\
             ## 待填充内容\n\
             *此技能由进化框架自动生成，需补充实际内容*\n\
             \n\
             ## 触发条件\n\
             - 轮次: {}\n\
             - 工具使用: {:?}\n\
             - 正向反馈: {}\n",
            conversation_id,
            rule.name,
            chrono::Utc::now().to_rfc3339(),
            turn_count,
            tool_use_counts,
            has_positive_feedback
        ),
        generated_at_ms: now_ms,
        status: SkillStatus::PendingReview,
        rule_id: rule.id.clone(),
        review_note: None,
    };

    // 添加到状态中
    drop(rules); // 释放读锁
    let mut skills = state.skills.lock().map_err(|e| format!("锁错误: {}", e))?;
    skills.push(skill.clone());
    persist_skills(&skills)?;

    info!("对话 {} 分析完成，生成技能: {}", conversation_id, skill_id);
    Ok(Some(skill))
}

/// 获取对话分析报告（不含 LLM 调用，纯数据统计）
#[tauri::command]
#[specta::specta]
pub fn evolution_analyze_preview(
    state: State<'_, EvolutionState>,
    conversation_id: String,
    turn_count: u32,
    tool_use_counts: std::collections::HashMap<String, u32>,
    has_positive_feedback: bool,
) -> Result<ConversationAnalysis, String> {
    let rules = state.rules.lock().map_err(|e| format!("锁错误: {}", e))?;

    let matched_rules: Vec<String> = rules
        .iter()
        .filter(|rule| {
            if !rule.enabled {
                return false;
            }
            match &rule.trigger {
                EvolutionTrigger::TaskCompleted { min_turns } => turn_count >= *min_turns,
                EvolutionTrigger::ToolRepeated { tool, min_uses } => {
                    tool_use_counts.get(tool).map_or(false, |&c| c >= *min_uses)
                }
                EvolutionTrigger::UserFeedbackPositive => has_positive_feedback,
            }
        })
        .map(|r| r.id.clone())
        .collect();

    Ok(ConversationAnalysis {
        conversation_id,
        turn_count,
        tool_use_counts,
        has_positive_feedback,
        matched_rules,
    })
}
