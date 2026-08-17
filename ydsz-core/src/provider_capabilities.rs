//! # Provider Capability Declaration（Provider 能力声明系统）
//!
//! 将 Provider 和模型的能力声明形式化，实现运行时能力匹配与校验。
//!
//! ## 核心概念
//!
//! - **ModelCapabilities**：单个模型的能力描述（上下文长度、工具调用、视觉等）
//! - **ProviderAdapter trait**：Provider 适配器的统一契约，声明自身能力
//! - **CapabilityMatcher**：校验 Provider/Model 是否满足 Agent Bundle 的需求
//!
//! ## 设计目的
//!
//! 借鉴 DeepSeek Harness 的 Provider Capabilities 设计，解决以下问题：
//!
//! - 工具调用前可预检 Provider 是否支持
//! - 模型选择时可根据任务需求自动匹配最佳 Provider
//! - 新增 Provider 只需实现 trait，无需修改调度逻辑
//!
//! ## 能力维度
//!
//! | 维度 | 说明 | 影响 |
//! |------|------|------|
//! | 工具调用 | function_call、parallel_calls、streaming | 决定 Pipeline 执行策略 |
//! | 视觉 | 图片输入、多模态 | 影响附件处理方式 |
//! | 上下文 | max_tokens、token 计数方式 | 影响压缩策略触发 |
//! | 交互 | 审查、分叉、引导、用户输入 | 影响可用交互模式 |
//! | 执行 | 沙箱、worktree、并发 Turn | 影响运行时环境配置 |

use serde::{Deserialize, Serialize};
use std::collections::HashSet;

use crate::provider::ProviderKind;

// ============================================================================
// 模型能力描述
// ============================================================================

/// # 模型能力描述
///
/// 描述单个 AI 模型在技术层面支持的能力。
///
/// 与 [`crate::provider::ProviderCapabilities`] 的区别：
/// - `ProviderCapabilities` 是面向用户的"功能开关"
/// - `ModelCapabilities` 是面向系统的"技术规格"
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelCapabilities {
    /// 模型名称
    pub model: String,
    /// Provider 类型
    pub provider: ProviderKind,
    /// 最大上下文 token 数
    pub max_context_tokens: u32,
    /// 最大输出 token 数
    pub max_output_tokens: u32,
    /// 工具调用能力
    #[serde(default)]
    pub tool_support: ToolSupport,
    /// 视觉能力
    #[serde(default)]
    pub vision: VisionCapability,
    /// 支持的交互模式
    #[serde(default)]
    pub interaction_modes: HashSet<InteractionMode>,
    /// 是否支持流式输出
    #[serde(default = "default_true")]
    pub supports_streaming: bool,
    /// 是否支持结构化输出（JSON schema 约束）
    #[serde(default)]
    pub supports_structured_output: bool,
    /// 是否支持系统消息
    #[serde(default = "default_true")]
    pub supports_system_message: bool,
    /// 每次请求的最大工具调用次数（0 表示无限制）
    #[serde(default)]
    pub max_tool_calls_per_request: u32,
    /// 模型家族标识（如 "claude-3"、"gpt-4" 等，用于跨版本能力推断）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model_family: Option<String>,
}

/// # 工具调用能力
///
/// 描述模型在工具调用方面的具体能力级别。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum ToolSupport {
    /// 不支持工具调用
    None,
    /// 基础工具调用（单次调用，无并行）
    Basic,
    /// 支持并行工具调用
    Parallel {
        /// 最大并行调用数
        max_parallel: u32,
    },
    /// 完全支持（并行 + 流式工具调用）
    Full {
        /// 最大并行调用数
        max_parallel: u32,
        /// 是否支持流式工具调用结果
        streaming_results: bool,
    },
}

/// # 视觉能力
///
/// 描述模型的视觉输入处理能力。
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VisionCapability {
    /// 是否支持图片输入
    #[serde(default)]
    pub enabled: bool,
    /// 支持的图片 MIME 类型
    #[serde(default)]
    pub supported_formats: Vec<String>,
    /// 单次请求最大图片数量
    #[serde(default)]
    pub max_images_per_request: u32,
    /// 是否支持高分辨率图片
    #[serde(default)]
    pub supports_high_resolution: bool,
    /// 是否支持图片 URL（而非仅 base64）
    #[serde(default)]
    pub supports_url: bool,
}

/// # 交互模式
///
/// 描述模型支持的高级交互模式。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InteractionMode {
    /// 对话
    Chat,
    /// 规划
    Plan,
    /// 自主执行
    Agent,
    /// 代码审查
    Review,
    /// 任务模式
    Task,
    /// 引导对话（中断当前 Turn 并插入新指令）
    Steer,
}

impl Default for ToolSupport {
    fn default() -> Self {
        Self::None
    }
}

fn default_true() -> bool {
    true
}

impl Default for ModelCapabilities {
    fn default() -> Self {
        Self {
            model: "unknown".to_string(),
            provider: ProviderKind::Glm,
            max_context_tokens: 8192,
            max_output_tokens: 4096,
            tool_support: ToolSupport::None,
            vision: VisionCapability::default(),
            interaction_modes: HashSet::new(),
            supports_streaming: true,
            supports_structured_output: false,
            supports_system_message: true,
            max_tool_calls_per_request: 0,
            model_family: None,
        }
    }
}

impl ModelCapabilities {
    /// 创建一个基础能力描述的快捷方法
    pub fn new(provider: ProviderKind, model: impl Into<String>) -> Self {
        Self {
            model: model.into(),
            provider,
            ..Default::default()
        }
    }

    /// 设置上下文长度
    pub fn with_context_tokens(mut self, max_input: u32, max_output: u32) -> Self {
        self.max_context_tokens = max_input;
        self.max_output_tokens = max_output;
        self
    }

    /// 设置工具支持
    pub fn with_tool_support(mut self, support: ToolSupport) -> Self {
        self.tool_support = support;
        self
    }

    /// 设置视觉能力
    pub fn with_vision(mut self, vision: VisionCapability) -> Self {
        self.vision = vision;
        self
    }

    /// 添加支持的交互模式
    pub fn with_interaction_mode(mut self, mode: InteractionMode) -> Self {
        self.interaction_modes.insert(mode);
        self
    }

    /// 检查是否支持特定的工具调用形式
    pub fn supports_parallel_tool_calls(&self) -> bool {
        matches!(
            self.tool_support,
            ToolSupport::Parallel { .. } | ToolSupport::Full { .. }
        )
    }

    /// 获取最大并行工具调用数
    pub fn max_parallel_tool_calls(&self) -> u32 {
        match self.tool_support {
            ToolSupport::None | ToolSupport::Basic => 1,
            ToolSupport::Parallel { max_parallel } | ToolSupport::Full { max_parallel, .. } => {
                max_parallel
            }
        }
    }

    /// 检查是否支持指定的交互模式
    pub fn supports_interaction(&self, mode: InteractionMode) -> bool {
        self.interaction_modes.contains(&mode)
    }

    /// 检查是否支持结构化输出
    pub fn can_use_json_schema(&self) -> bool {
        self.supports_structured_output
    }
}

// ============================================================================
// Provider Adapter Trait
// ============================================================================

/// # Provider Adapter trait
///
/// 定义 AI Provider 适配器的统一契约。
///
/// 每个 Provider 适配器（Codex、Claude Agent、Cursor 等）需要实现此 trait，
/// 声明自身和当前模型的能力。
///
/// ## 设计目的
///
/// - 统一的 Provider 能力查询接口
/// - 运行时能力匹配（根据 Agent Bundle 需求选择最佳 Provider）
/// - 新增 Provider 的实现与调度逻辑解耦
///
/// ## 实现要求
///
/// - `name()` 返回唯一标识（应与 `ProviderKind` 的 Display 一致）
/// - `capabilities()` 应返回编译期已知的静态能力描述
/// - `check_health()` 异步检查 Provider 是否可用
#[async_trait::async_trait]
pub trait ProviderAdapter: Send + Sync {
    /// 返回 Provider 的唯一名称
    fn name(&self) -> &str;

    /// 返回 Provider 类型
    fn kind(&self) -> ProviderKind;

    /// 返回当前模型的能力描述
    fn capabilities(&self) -> &ModelCapabilities;

    /// 异步检查 Provider 健康状态
    async fn check_health(&self) -> ProviderHealth;

    /// 返回 Provider 支持的工具名称列表
    fn supported_tools(&self) -> &[&str];

    /// 是否支持给定的工具名称
    fn supports_tool(&self, tool_name: &str) -> bool {
        self.supported_tools().contains(&tool_name)
    }
}

/// # Provider 健康状态
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderHealth {
    /// 是否可用
    pub available: bool,
    /// 延迟（毫秒，可选）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latency_ms: Option<u64>,
    /// 状态消息
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

// ============================================================================
// 能力匹配
// ============================================================================

/// # 能力匹配器
///
/// 检查 Provider/Model 是否满足任务需求。
///
/// ## 匹配规则
///
/// - 上下文长度足够
/// - 工具调用能力满足要求
/// - 交互模式兼容
/// - 视觉能力满足需求（如果涉及图片）
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityMatcher {
    /// 所需的最小上下文 token 数
    #[serde(default)]
    pub min_context_tokens: u32,
    /// 所需的工具支持级别
    #[serde(default)]
    pub required_tool_support: ToolSupport,
    /// 所需交互模式
    #[serde(default)]
    pub required_interaction_modes: HashSet<InteractionMode>,
    /// 是否要求视觉能力
    #[serde(default)]
    pub requires_vision: bool,
    /// 是否要求流式输出
    #[serde(default)]
    pub requires_streaming: bool,
}

impl CapabilityMatcher {
    /// 创建空的匹配器（无任何要求，所有 Provider 都满足）
    pub fn new() -> Self {
        Self::default()
    }

    /// 设置最小上下文要求
    pub fn require_context_tokens(mut self, tokens: u32) -> Self {
        self.min_context_tokens = tokens;
        self
    }

    /// 设置工具支持要求
    pub fn require_tool_support(mut self, support: ToolSupport) -> Self {
        self.required_tool_support = support;
        self
    }

    /// 添加交互模式要求
    pub fn require_interaction(mut self, mode: InteractionMode) -> Self {
        self.required_interaction_modes.insert(mode);
        self
    }

    /// 要求视觉能力
    pub fn require_vision(mut self, require: bool) -> Self {
        self.requires_vision = require;
        self
    }

    /// 要求流式输出
    pub fn require_streaming(mut self, require: bool) -> Self {
        self.requires_streaming = require;
        self
    }

    /// 检查模型能力是否满足当前要求
    pub fn matches(&self, caps: &ModelCapabilities) -> CapabilityMatchResult {
        let mut issues = Vec::new();

        // 上下文长度检查
        if caps.max_context_tokens < self.min_context_tokens {
            issues.push(CapabilityIssue::InsufficientContext {
                required: self.min_context_tokens,
                actual: caps.max_context_tokens,
            });
        }

        // 工具支持检查
        match (&self.required_tool_support, &caps.tool_support) {
            (ToolSupport::Full { .. }, ToolSupport::None)
            | (ToolSupport::Full { .. }, ToolSupport::Basic)
            | (ToolSupport::Parallel { .. }, ToolSupport::None)
            | (ToolSupport::Parallel { .. }, ToolSupport::Basic) => {
                issues.push(CapabilityIssue::InsufficientToolSupport {
                    required: format!("{:?}", self.required_tool_support),
                    actual: format!("{:?}", caps.tool_support),
                });
            }
            _ => {}
        }

        // 交互模式检查
        for mode in &self.required_interaction_modes {
            if !caps.interaction_modes.contains(mode) {
                issues.push(CapabilityIssue::UnsupportedInteractionMode {
                    mode: *mode,
                });
            }
        }

        // 视觉要求检查
        if self.requires_vision && !caps.vision.enabled {
            issues.push(CapabilityIssue::VisionRequired);
        }

        // 流式输出要求检查
        if self.requires_streaming && !caps.supports_streaming {
            issues.push(CapabilityIssue::StreamingRequired);
        }

        if issues.is_empty() {
            CapabilityMatchResult::Compatible
        } else {
            CapabilityMatchResult::Incompatible { issues }
        }
    }
}

/// # 能力匹配结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "status")]
pub enum CapabilityMatchResult {
    /// 完全兼容
    Compatible,
    /// 不兼容（附带具体问题列表）
    Incompatible {
        /// 不满足的需求列表
        issues: Vec<CapabilityIssue>,
    },
}

/// # 能力不匹配问题
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "type")]
pub enum CapabilityIssue {
    /// 上下文长度不足
    InsufficientContext {
        required: u32,
        actual: u32,
    },
    /// 工具支持级别不足
    InsufficientToolSupport {
        required: String,
        actual: String,
    },
    /// 不支持的交互模式
    UnsupportedInteractionMode {
        mode: InteractionMode,
    },
    /// 需要视觉能力但模型不支持
    VisionRequired,
    /// 需要流式输出但模型不支持
    StreamingRequired,
}

impl CapabilityMatchResult {
    /// 是否兼容
    pub fn is_compatible(&self) -> bool {
        matches!(self, Self::Compatible)
    }

    /// 获取不兼容的问题列表（兼容时返回空）
    pub fn issues(&self) -> &[CapabilityIssue] {
        match self {
            Self::Compatible => &[],
            Self::Incompatible { issues } => issues,
        }
    }
}

// ============================================================================
// 内嵌 Provider（用于测试和默认行为）
// ============================================================================

/// # 静态 Provider 适配器
///
/// 使用静态数据实现的 ProviderAdapter，适用于：
/// - 单元测试中的 Mock
/// - 配置中预定义的 Provider
/// - 不需要网络检查的场景
pub struct StaticProviderAdapter {
    name: String,
    kind: ProviderKind,
    caps: ModelCapabilities,
    tools: Vec<&'static str>,
    healthy: bool,
}

impl StaticProviderAdapter {
    /// 创建静态适配器
    pub fn new(
        name: impl Into<String>,
        kind: ProviderKind,
        caps: ModelCapabilities,
        tools: Vec<&'static str>,
        healthy: bool,
    ) -> Self {
        Self {
            name: name.into(),
            kind,
            caps,
            tools,
            healthy,
        }
    }
}

#[async_trait::async_trait]
impl ProviderAdapter for StaticProviderAdapter {
    fn name(&self) -> &str {
        &self.name
    }

    fn kind(&self) -> ProviderKind {
        self.kind
    }

    fn capabilities(&self) -> &ModelCapabilities {
        &self.caps
    }

    async fn check_health(&self) -> ProviderHealth {
        if self.healthy {
            ProviderHealth {
                available: true,
                latency_ms: Some(50),
                message: None,
            }
        } else {
            ProviderHealth {
                available: false,
                latency_ms: None,
                message: Some("Provider unavailable".to_string()),
            }
        }
    }

    fn supported_tools(&self) -> &[&str] {
        &self.tools
    }
}

// ============================================================================
// 常用模型能力预设
// ============================================================================

/// 返回 GPT-4o 的能力预设
pub fn gpt4o_capabilities() -> ModelCapabilities {
    ModelCapabilities {
        model: "gpt-4o".to_string(),
        provider: ProviderKind::Codex,
        max_context_tokens: 128_000,
        max_output_tokens: 16_384,
        tool_support: ToolSupport::Full {
            max_parallel: 8,
            streaming_results: true,
        },
        vision: VisionCapability {
            enabled: true,
            supported_formats: vec![
                "image/png".to_string(),
                "image/jpeg".to_string(),
                "image/webp".to_string(),
                "image/gif".to_string(),
            ],
            max_images_per_request: 10,
            supports_high_resolution: true,
            supports_url: true,
        },
        interaction_modes: [
            InteractionMode::Chat,
            InteractionMode::Plan,
            InteractionMode::Agent,
            InteractionMode::Review,
            InteractionMode::Steer,
        ]
        .into_iter()
        .collect(),
        supports_streaming: true,
        supports_structured_output: true,
        supports_system_message: true,
        max_tool_calls_per_request: 0,
        model_family: Some("gpt-4".to_string()),
    }
}

/// 返回 Claude 3.5 Sonnet 的能力预设
pub fn claude35_sonnet_capabilities() -> ModelCapabilities {
    ModelCapabilities {
        model: "claude-3-5-sonnet".to_string(),
        provider: ProviderKind::ClaudeAgent,
        max_context_tokens: 200_000,
        max_output_tokens: 8192,
        tool_support: ToolSupport::Full {
            max_parallel: 10,
            streaming_results: true,
        },
        vision: VisionCapability {
            enabled: true,
            supported_formats: vec![
                "image/png".to_string(),
                "image/jpeg".to_string(),
                "image/webp".to_string(),
                "image/gif".to_string(),
            ],
            max_images_per_request: 20,
            supports_high_resolution: true,
            supports_url: false,
        },
        interaction_modes: [
            InteractionMode::Chat,
            InteractionMode::Plan,
            InteractionMode::Agent,
            InteractionMode::Review,
            InteractionMode::Task,
        ]
        .into_iter()
        .collect(),
        supports_streaming: true,
        supports_structured_output: true,
        supports_system_message: true,
        max_tool_calls_per_request: 0,
        model_family: Some("claude-3".to_string()),
    }
}

/// 返回 DeepSeek V3 的能力预设
pub fn deepseek_v3_capabilities() -> ModelCapabilities {
    ModelCapabilities {
        model: "deepseek-v3".to_string(),
        provider: ProviderKind::DeepSeek,
        max_context_tokens: 64_000,
        max_output_tokens: 8192,
        tool_support: ToolSupport::Full {
            max_parallel: 4,
            streaming_results: false,
        },
        vision: VisionCapability::default(),
        interaction_modes: [
            InteractionMode::Chat,
            InteractionMode::Plan,
            InteractionMode::Agent,
        ]
        .into_iter()
        .collect(),
        supports_streaming: true,
        supports_structured_output: true,
        supports_system_message: true,
        max_tool_calls_per_request: 0,
        model_family: Some("deepseek".to_string()),
    }
}


