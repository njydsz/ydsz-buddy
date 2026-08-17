//! # Agent Preset（智能体预设模式）
//!
//! 将 Agent 的运行配置抽象为可自由组合的 Preset（预设）。
//!
//! ## 核心概念
//!
//! 一个 Preset 组合了：
//! - **SystemPrompt 模板**：系统提示词（可包含占位符）
//! - **工具集**：可用的工具白名单/黑名单
//! - **上下文压缩策略**：何时压缩、压缩强度
//! - **子 Agent 能力**：是否允许 spawn 子 Agent
//! - **权限级别**：文件读写、命令执行的权限边界
//! - **默认模型**：推荐的 Provider + Model 组合
//!
//! ## 内置预设
//!
//! | 预设 | 说明 |
//! |------|------|
//! | `standard` | 完整工具链，适合日常开发 |
//! | `ptc` | 程序化工具调用，适合基准测试 |
//! | `minimal` | 仅 shell + 文件编辑，最精简模式 |
//! | `creative` | 用于试验新插件和组合新预设 |

use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use uuid::Uuid;

use crate::provider::ModelSelection;

/// Preset ID
pub type PresetId = String;

/// Permission Level（权限级别）
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PermissionLevel {
    /// 只读模式，不允许文件写入和执行命令
    ReadOnly,
    /// 标准模式，可读写文件、执行白名单命令（默认）
    #[default]
    Standard,
    /// 完全模式，无限制（需用户确认危险操作）
    Full,
    /// 沙箱模式，所有操作在隔离沙箱中执行
    Sandboxed,
}

/// Context Compression Strategy（上下文压缩策略）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompressionStrategy {
    /// 触发压缩的上下文使用率阈值（百分比）
    #[serde(default = "default_compression_threshold")]
    pub trigger_threshold_percent: f64,
    /// 压缩后保留的最近消息数量
    #[serde(default = "default_keep_recent")]
    pub keep_recent_messages: usize,
    /// 最大摘要字符长度
    #[serde(default = "default_max_summary")]
    pub max_summary_length: usize,
    /// 是否启用分层压缩
    #[serde(default)]
    pub hierarchical: bool,
    /// 是否保留工具调用结果
    #[serde(default = "default_keep_tool_results")]
    pub keep_tool_results: bool,
}

fn default_compression_threshold() -> f64 {
    80.0
}
fn default_keep_recent() -> usize {
    10
}
fn default_max_summary() -> usize {
    2000
}
fn default_keep_tool_results() -> bool {
    true
}

impl Default for CompressionStrategy {
    fn default() -> Self {
        Self {
            trigger_threshold_percent: default_compression_threshold(),
            keep_recent_messages: default_keep_recent(),
            max_summary_length: default_max_summary(),
            hierarchical: false,
            keep_tool_results: default_keep_tool_results(),
        }
    }
}

/// SubAgent Capability（子 Agent 能力）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubAgentCapability {
    /// 是否允许 spawn 子 Agent
    #[serde(default = "default_true")]
    pub allowed: bool,
    /// 最大并发子 Agent 数量
    #[serde(default = "default_max_concurrent")]
    pub max_concurrent: usize,
    /// 允许的角色列表
    #[serde(default)]
    pub allowed_roles: Vec<String>,
}

fn default_true() -> bool {
    true
}
fn default_max_concurrent() -> usize {
    5
}

impl Default for SubAgentCapability {
    fn default() -> Self {
        Self {
            allowed: true,
            max_concurrent: 5,
            allowed_roles: vec![],
        }
    }
}

/// Agent Preset（完整定义）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentPreset {
    /// 唯一 ID
    pub id: PresetId,
    /// 显示名称
    pub name: String,
    /// 描述
    pub description: String,
    /// 是否为内置预设（内置不可删除）
    #[serde(default)]
    pub builtin: bool,
    /// 系统提示词模板
    pub system_prompt_template: String,
    /// 工具白名单（空表示不限制）
    #[serde(default)]
    pub tool_allowlist: HashSet<String>,
    /// 工具黑名单
    #[serde(default)]
    pub tool_blocklist: HashSet<String>,
    /// 权限级别
    #[serde(default)]
    pub permission_level: PermissionLevel,
    /// 上下文压缩策略
    #[serde(default)]
    pub compression: CompressionStrategy,
    /// 子 Agent 能力
    #[serde(default)]
    pub subagent: SubAgentCapability,
    /// 推荐模型选择
    #[serde(default)]
    pub recommended_model: Option<ModelSelection>,
    /// 创建时间
    pub created_at: String,
    /// 更新时间
    pub updated_at: String,
}

/// 创建预设请求
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePresetRequest {
    pub name: String,
    pub description: Option<String>,
    pub system_prompt_template: String,
    pub tool_allowlist: Option<HashSet<String>>,
    pub tool_blocklist: Option<HashSet<String>>,
    pub permission_level: Option<PermissionLevel>,
    pub compression: Option<CompressionStrategy>,
    pub subagent: Option<SubAgentCapability>,
    pub recommended_model: Option<ModelSelection>,
}

impl AgentPreset {
    /// 创建新 Preset
    pub fn create(req: CreatePresetRequest) -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        Self {
            id: Uuid::new_v4().to_string(),
            name: req.name,
            description: req.description.unwrap_or_default(),
            builtin: false,
            system_prompt_template: req.system_prompt_template,
            tool_allowlist: req.tool_allowlist.unwrap_or_default(),
            tool_blocklist: req.tool_blocklist.unwrap_or_default(),
            permission_level: req.permission_level.unwrap_or(PermissionLevel::Standard),
            compression: req.compression.unwrap_or_default(),
            subagent: req.subagent.unwrap_or_default(),
            recommended_model: req.recommended_model,
            created_at: now.clone(),
            updated_at: now,
        }
    }

    /// 获取所有内置预设
    pub fn builtin_presets() -> Vec<Self> {
        vec![
            Self::standard_preset(),
            Self::ptc_preset(),
            Self::minimal_preset(),
            Self::creative_preset(),
        ]
    }

    /// 标准预设：完整工具链
    fn standard_preset() -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        Self {
            id: "builtin-standard".to_string(),
            name: "Standard".to_string(),
            description: "完整工具链，适合日常开发".to_string(),
            builtin: true,
            system_prompt_template: r#"You are an AI assistant ydsz-buddy. You help users with software development tasks.

## Capabilities
- Read, write, and edit files
- Execute shell commands
- Search and navigate codebases
- Use git for version control
- Spawn sub-agents for parallel work

## Guidelines
- Always explain your actions
- Ask before making destructive changes
- Use tools proactively to gather context
- Provide concise, actionable responses"#.to_string(),
            tool_allowlist: HashSet::new(),
            tool_blocklist: HashSet::new(),
            permission_level: PermissionLevel::Standard,
            compression: CompressionStrategy::default(),
            subagent: SubAgentCapability::default(),
            recommended_model: None,
            created_at: now.clone(),
            updated_at: now,
        }
    }

    /// PTC 预设：程序化工具调用
    fn ptc_preset() -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        Self {
            id: "builtin-ptc".to_string(),
            name: "PTC".to_string(),
            description: "程序化工具调用模式，适合基准测试".to_string(),
            builtin: true,
            system_prompt_template: r#"You are running in Programmatic Tool Calling (PTC) mode.

## Rules
- Use tools in a structured, deterministic manner
- Minimize unnecessary actions
- Focus on completing the task efficiently
- Do not spawn sub-agents"#.to_string(),
            tool_allowlist: HashSet::new(),
            tool_blocklist: ["browser".to_string(), "voice".to_string()].into_iter().collect(),
            permission_level: PermissionLevel::Standard,
            compression: CompressionStrategy {
                trigger_threshold_percent: 90.0,
                keep_recent_messages: 5,
                max_summary_length: 1000,
                hierarchical: false,
                keep_tool_results: false,
            },
            subagent: SubAgentCapability {
                allowed: false,
                max_concurrent: 0,
                allowed_roles: vec![],
            },
            recommended_model: None,
            created_at: now.clone(),
            updated_at: now,
        }
    }

    /// 极简预设
    fn minimal_preset() -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        Self {
            id: "builtin-minimal".to_string(),
            name: "Minimal".to_string(),
            description: "仅 shell + 文件编辑，最精简模式".to_string(),
            builtin: true,
            system_prompt_template: r#"You are in Minimal mode. You can only:
- Read, write, and edit files
- Execute basic shell commands

You cannot:
- Use browser automation
- Spawn sub-agents
- Access external services"#.to_string(),
            tool_allowlist: ["read_file".to_string(), "write_file".to_string(), "multi_edit".to_string(), "bash".to_string(), "grep".to_string()].into_iter().collect(),
            tool_blocklist: HashSet::new(),
            permission_level: PermissionLevel::ReadOnly,
            compression: CompressionStrategy {
                trigger_threshold_percent: 70.0,
                keep_recent_messages: 8,
                max_summary_length: 1500,
                hierarchical: false,
                keep_tool_results: true,
            },
            subagent: SubAgentCapability {
                allowed: false,
                max_concurrent: 0,
                allowed_roles: vec![],
            },
            recommended_model: None,
            created_at: now.clone(),
            updated_at: now,
        }
    }

    /// 创造模式预设
    fn creative_preset() -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        Self {
            id: "builtin-creative".to_string(),
            name: "Creative".to_string(),
            description: "用于试验新插件和组合新预设".to_string(),
            builtin: true,
            system_prompt_template: r#"You are in Creative mode. This mode is for experimentation.

## Guidelines
- Try new tool combinations
- Test experimental features
- Think outside the box
- Report what works and what doesn't"#.to_string(),
            tool_allowlist: HashSet::new(),
            tool_blocklist: HashSet::new(),
            permission_level: PermissionLevel::Full,
            compression: CompressionStrategy {
                trigger_threshold_percent: 85.0,
                keep_recent_messages: 15,
                max_summary_length: 3000,
                hierarchical: true,
                keep_tool_results: true,
            },
            subagent: SubAgentCapability {
                allowed: true,
                max_concurrent: 10,
                allowed_roles: vec!["researcher".to_string(), "coder".to_string(), "reviewer".to_string()],
            },
            recommended_model: None,
            created_at: now.clone(),
            updated_at: now,
        }
    }
}
