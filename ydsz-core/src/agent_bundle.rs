//! # Agent Bundle（声明式智能体包）
//!
//! 将 Agent 的完整运行时行为声明式地组合在一起，是 AgentPreset 的超集。
//!
//! ## 核心概念
//!
//! 一个 Bundle 声明了 Agent 的**全部运行时契约**：
//!
//! - **基础 Preset**：权限级别、工具集、上下文压缩策略
//! - **拦截器链顺序**：pre-execute / post-execute 拦截器的有序组合
//! - **错误恢复策略**：失败时的重试、降级、升级行为
//! - **多 Agent 编排拓扑**：父子 Agent 间的协作模式
//!
//! ## 声明式组合
//!
//! Bundle 遵循"声明优于配置"原则：
//!
//! - 声明意图（"我要一个带审计的代码助手"），而非具体实现
//! - Bundle 之间可以继承和覆盖（`extends` 字段）
//! - 运行时根据 Bundle 声明组合出对应的 Pipeline 和 Loop
//!
//! ## 与 Preset 的关系
//!
//! - `AgentPreset`：面向用户的"预设模板"（选择即应用）
//! - `AgentBundle`：面向系统的"运行契约"（被 Preset 引用或独立使用）
//! - 一个 Preset 隐式包含一个默认 Bundle；高级用户可直接定义 Bundle

use serde::{Deserialize, Serialize};
use std::collections::HashSet;

use crate::models::InteractionMode;

// ============================================================================
// Bundle 身份与继承
// ============================================================================

/// Bundle 唯一标识
pub type BundleId = String;

/// # Agent Bundle（声明式智能体包）
///
/// 定义 Agent 的完整运行时行为契约。
///
/// ## 字段说明
///
/// - `id`: 全局唯一标识
/// - `name`: 显示名称
/// - `description`: 用途描述
/// - `extends`: 继承自另一个 Bundle（可选，形成继承链）
/// - `interceptor_chain`: 拦截器链的有序配置
/// - `error_recovery`: 错误恢复策略
/// - `orchestration`: 多 Agent 编排拓扑
/// - `runtime_overrides`: 运行时行为微调
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentBundle {
    /// 唯一标识
    pub id: BundleId,
    /// 显示名称
    pub name: String,
    /// 用途描述
    pub description: String,
    /// 是否为内置 Bundle（内置不可删除）
    #[serde(default)]
    pub builtin: bool,
    /// 继承自另一个 Bundle（可选，最多一级继承，运行时展平）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extends: Option<BundleId>,
    /// 拦截器链的有序配置
    #[serde(default)]
    pub interceptor_chain: InterceptorChainConfig,
    /// 错误恢复策略
    #[serde(default)]
    pub error_recovery: ErrorRecoveryStrategy,
    /// 多 Agent 编排拓扑
    #[serde(skip_serializing_if = "Option::is_none")]
    pub orchestration: Option<OrchestrationTopology>,
    /// 运行时行为微调
    #[serde(default)]
    pub runtime_overrides: RuntimeOverrides,
}

// ============================================================================
// 拦截器链配置
// ============================================================================

/// # 拦截器链配置
///
/// 声明工具执行时应用的拦截器及其顺序。
///
/// ## 执行顺序
///
/// 拦截器按照 `stages` 数组顺序组成 Pipeline:
/// - `PreExecute` 阶段：按数组顺序依次执行（先注册先执行）
/// - `Execute` 阶段：调用实际工具实现
/// - `PostExecute` 阶段：按数组逆序依次执行（后注册先执行，类似洋葱模型）
///
/// ## 示例
///
/// ```ignore
/// InterceptorChainConfig::new()
///     .add(InterceptorStage::PreExecute, "permission_audit")
///     .add(InterceptorStage::PreExecute, "param_validation")
///     .add(InterceptorStage::PreExecute, "timing_start")
///     .add(InterceptorStage::PostExecute, "timing_end")
///     .add(InterceptorStage::PostExecute, "activity_log")
///     .add(InterceptorStage::PostExecute, "error_wrap")
/// ```
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InterceptorChainConfig {
    /// 有序的拦截器阶段声明列表
    #[serde(default)]
    pub stages: Vec<InterceptorStageDecl>,
    /// 是否启用缓存（相同输入跳过 pre-execute 阶段）
    #[serde(default)]
    pub enable_caching: bool,
    /// 阶段执行超时（毫秒，0 表示无限制）
    #[serde(default)]
    pub stage_timeout_ms: u64,
}

impl InterceptorChainConfig {
    /// 创建空的拦截器链配置
    pub fn new() -> Self {
        Self::default()
    }

    /// 添加一个拦截器阶段（builder 风格）
    pub fn add(mut self, stage_type: InterceptorStageType, name: impl Into<String>) -> Self {
        self.stages.push(InterceptorStageDecl {
            stage_type,
            name: name.into(),
            enabled: true,
        });
        self
    }

    /// 添加一个拦截器阶段（指定启用状态）
    pub fn add_with_flag(
        mut self,
        stage_type: InterceptorStageType,
        name: impl Into<String>,
        enabled: bool,
    ) -> Self {
        self.stages.push(InterceptorStageDecl {
            stage_type,
            name: name.into(),
            enabled,
        });
        self
    }

    /// 启用缓存
    pub fn with_caching(mut self, enable: bool) -> Self {
        self.enable_caching = enable;
        self
    }

    /// 设置阶段超时
    pub fn with_timeout(mut self, timeout_ms: u64) -> Self {
        self.stage_timeout_ms = timeout_ms;
        self
    }

    /// 获取所有启用的预执行拦截器名称（按注册顺序）
    pub fn pre_execute_names(&self) -> Vec<&str> {
        self.stages
            .iter()
            .filter(|s| s.enabled && s.stage_type == InterceptorStageType::PreExecute)
            .map(|s| s.name.as_str())
            .collect()
    }

    /// 获取所有启用的后执行拦截器名称（按注册顺序）
    pub fn post_execute_names(&self) -> Vec<&str> {
        self.stages
            .iter()
            .filter(|s| s.enabled && s.stage_type == InterceptorStageType::PostExecute)
            .map(|s| s.name.as_str())
            .collect()
    }

    /// 检查是否包含指定名称的拦截器
    pub fn contains(&self, name: &str) -> bool {
        self.stages.iter().any(|s| s.name == name)
    }
}

/// # 拦截器阶段声明
///
/// 单个拦截器的声明（名称 + 阶段类型 + 启用状态）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InterceptorStageDecl {
    /// 阶段类型
    pub stage_type: InterceptorStageType,
    /// 拦截器名称（对应 ToolInterceptor 的 name() 返回值）
    pub name: String,
    /// 是否启用
    #[serde(default = "default_true")]
    pub enabled: bool,
}

fn default_true() -> bool {
    true
}

/// # 拦截器阶段类型
///
/// 标识拦截器在工具执行流程中的位置。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InterceptorStageType {
    /// 前置处理
    PreExecute,
    /// 后置处理
    PostExecute,
}

// ============================================================================
// 错误恢复策略
// ============================================================================

/// # 错误恢复策略
///
/// 定义工具执行失败时的恢复行为。
///
/// ## 恢复流程
///
/// ```text
/// 工具执行失败
///     │
///     ├─ retry 策略 → 重试 N 次（带指数退避）
///     │
///     ├─ fallback 策略 → 调用降级工具
///     │
///     └─ escalation 策略 → 上报给父 Agent 或用户
/// ```
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorRecoveryStrategy {
    /// 重试配置
    #[serde(default)]
    pub retry: RetryConfig,
    /// 降级配置（可选）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fallback: Option<FallbackConfig>,
    /// 升级配置
    #[serde(default)]
    pub escalation: EscalationConfig,
}

impl Default for ErrorRecoveryStrategy {
    fn default() -> Self {
        Self {
            retry: RetryConfig::default(),
            fallback: None,
            escalation: EscalationConfig::default(),
        }
    }
}

/// # 重试配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RetryConfig {
    /// 最大重试次数（0 表示不重试）
    #[serde(default = "default_max_retries")]
    pub max_retries: u32,
    /// 初始退避时间（毫秒）
    #[serde(default = "default_initial_backoff_ms")]
    pub initial_backoff_ms: u64,
    /// 最大退避时间（毫秒）
    #[serde(default = "default_max_backoff_ms")]
    pub max_backoff_ms: u64,
    /// 退避倍数（指数退避的基数）
    #[serde(default = "default_backoff_multiplier")]
    pub backoff_multiplier: f64,
    /// 触发重试的错误类型（空表示所有错误都重试）
    #[serde(default)]
    pub retry_on: HashSet<RetryableError>,
}

fn default_max_retries() -> u32 {
    2
}
fn default_initial_backoff_ms() -> u64 {
    100
}
fn default_max_backoff_ms() -> u64 {
    5000
}
fn default_backoff_multiplier() -> f64 {
    2.0
}

impl Default for RetryConfig {
    fn default() -> Self {
        Self {
            max_retries: default_max_retries(),
            initial_backoff_ms: default_initial_backoff_ms(),
            max_backoff_ms: default_max_backoff_ms(),
            backoff_multiplier: default_backoff_multiplier(),
            retry_on: HashSet::new(),
        }
    }
}

/// # 可重试的错误类型
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RetryableError {
    /// 超时
    Timeout,
    /// 网络错误
    Network,
    /// 限流（rate limit）
    RateLimited,
    /// 服务不可用（503 等）
    ServiceUnavailable,
    /// 所有错误类型
    All,
}

/// # 降级配置
///
/// 定义工具失败时的降级行为。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FallbackConfig {
    /// 原始工具名 → 降级工具名 映射
    pub tool_fallbacks: Vec<ToolFallback>,
    /// 降级失败时是否静默忽略（不抛错误）
    #[serde(default)]
    pub silent: bool,
}

/// # 工具降级映射
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolFallback {
    /// 原始工具名
    pub from_tool: String,
    /// 降级工具名
    pub to_tool: String,
    /// 降级条件（匹配错误消息的正则或子字符串）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub when_error_contains: Option<String>,
}

/// # 升级配置
///
/// 定义工具失败时的上报行为。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EscalationConfig {
    /// 超过重试次数后是否升级到父 Agent
    #[serde(default = "default_true")]
    pub escalate_to_parent: bool,
    /// 升级时携带的最后 N 条 Activity 数量
    #[serde(default = "default_escalation_context")]
    pub context_activity_count: usize,
    // 是否提示用户干预（Agent 模式下弹出确认框）
    #[serde(default)]
    pub notify_user: bool,
}

fn default_escalation_context() -> usize {
    5
}

impl Default for EscalationConfig {
    fn default() -> Self {
        Self {
            escalate_to_parent: true,
            context_activity_count: default_escalation_context(),
            notify_user: false,
        }
    }
}

// ============================================================================
// 多 Agent 编排拓扑
// ============================================================================

/// # 编排拓扑
///
/// 定义多 Agent 之间的协作结构。
///
/// ## 拓扑类型
///
/// - `SingleAgent`：单 Agent 模式（默认）
/// - `Supervisor`：Supervisor 模式——一个主任 Agent 调度多个子 Agent
/// - `PeerReview`：对等评审模式——多个 Agent 互相审查结果
/// - `Pipeline`：流水线模式——Agent 串行处理，前一个输出是后一个输入
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum OrchestrationTopology {
    /// 单 Agent（无多 Agent 编排）
    SingleAgent,
    /// Supervisor 模式：一个 Supervisor 调度多个 Worker
    Supervisor {
        /// 子 Agent 的 Bundle ID 列表
        worker_bundles: Vec<BundleId>,
        /// Worker 交互模式（每个 Worker 使用的模式）
        worker_mode: InteractionMode,
        /// 最大并行 Worker 数量
        #[serde(default = "default_max_parallel")]
        max_parallel: usize,
        /// 结果聚合策略
        #[serde(default)]
        aggregation: SupervisorAggregation,
    },
    /// 对等评审模式：多个 Agent 独立执行后互审
    PeerReview {
        /// 评审者 Bundle ID 列表
        reviewer_bundles: Vec<BundleId>,
        /// 最小通过票数
        #[serde(default = "default_min_pass_votes")]
        min_pass_votes: usize,
        /// 是否要求全票通过
        #[serde(default)]
        unanimous: bool,
    },
    /// 流水线模式：Agent 串行，前一个输出是后一个输入
    Pipeline {
        /// 流水线阶段（有序的 Bundle ID 列表）
        stages: Vec<PipelineStageDecl>,
        /// 阶段间是否传递完整上下文
        #[serde(default = "default_true")]
        propagate_context: bool,
        /// 阶段失败时是否中断整个流水线
        #[serde(default = "default_true")]
        abort_on_failure: bool,
    },
}

fn default_max_parallel() -> usize {
    3
}
fn default_min_pass_votes() -> usize {
    2
}

/// # Supervisor 聚合策略
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SupervisorAggregation {
    /// 第一个成功的结果
    #[default]
    FirstSuccess,
    /// 多数投票
    MajorityVote,
    /// 合并所有结果
    MergeAll,
    /// Supervisor 决定（AI 判断最佳结果）
    SupervisorDecides,
}

/// # 流水线阶段声明
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PipelineStageDecl {
    /// 阶段名称
    pub name: String,
    /// 使用的 Bundle ID
    pub bundle_id: BundleId,
    /// 阶段失败时的重试次数（0 表示不重试）
    #[serde(default)]
    pub retries: u32,
}

// ============================================================================
// 运行时行为微调
// ============================================================================

/// # 运行时行为微调
///
/// 对 Bundle 默认行为的细粒度控制。
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeOverrides {
    /// 工具调用超时覆盖（毫秒，0 表示使用全局默认值）
    #[serde(default)]
    pub tool_timeout_ms: Option<u64>,
    /// 并发工具调用数覆盖
    #[serde(default)]
    pub max_concurrent_tools: Option<usize>,
    /// 输出 token 限制覆盖
    #[serde(default)]
    pub max_output_tokens: Option<u32>,
    /// 自定义元数据（传递给拦截器链）
    #[serde(default)]
    pub metadata: Vec<MetaEntry>,
}

/// # 元数据键值对
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetaEntry {
    pub key: String,
    pub value: String,
}

// ============================================================================
// Agent Bundle 方法
// ============================================================================

impl AgentBundle {
    /// 创建新的 Builder
    pub fn builder(id: impl Into<BundleId>, name: impl Into<String>) -> AgentBundleBuilder {
        AgentBundleBuilder::new(id, name)
    }

    /// 获取完整的拦截器链名称列表（从继承链合并）
    ///
    /// 当前实现中，继承的拦截器链优先使用子 Bundle 的配置。
    /// 如果子 Bundle 未覆盖，则回退到父 Bundle。
    pub fn effective_pre_execute_names(&self, parent: Option<&Self>) -> Vec<String> {
        let own = self.interceptor_chain.pre_execute_names();
        if !own.is_empty() {
            return own.into_iter().map(String::from).collect();
        }
        parent
            .map(|p| p.interceptor_chain.pre_execute_names())
            .map(|v| v.into_iter().map(String::from).collect())
            .unwrap_or_default()
    }

    pub fn effective_post_execute_names(&self, parent: Option<&Self>) -> Vec<String> {
        let own = self.interceptor_chain.post_execute_names();
        if !own.is_empty() {
            return own.into_iter().map(String::from).collect();
        }
        parent
            .map(|p| p.interceptor_chain.post_execute_names())
            .map(|v| v.into_iter().map(String::from).collect())
            .unwrap_or_default()
    }

    /// 是否为多 Agent 编排 Bundle
    pub fn is_multi_agent(&self) -> bool {
        !matches!(
            self.orchestration,
            None | Some(OrchestrationTopology::SingleAgent)
        )
    }

    /// 获取内置 Bundle 列表
    pub fn builtin_bundles() -> Vec<Self> {
        vec![Self::standard_bundle()]
    }

    /// 标准 Bundle：完整功能，无多 Agent 编排
    fn standard_bundle() -> Self {
        Self {
            id: "builtin-standard-bundle".to_string(),
            name: "Standard Bundle".to_string(),
            description: "完整拦截器链 + 标准错误恢复，适合大多数开发场景".to_string(),
            builtin: true,
            extends: None,
            interceptor_chain: InterceptorChainConfig::new()
                .add(InterceptorStageType::PreExecute, "permission_audit")
                .add(InterceptorStageType::PreExecute, "param_validation")
                .add(InterceptorStageType::PreExecute, "timing_start")
                .add(InterceptorStageType::PostExecute, "timing_end")
                .add(InterceptorStageType::PostExecute, "activity_log")
                .add(InterceptorStageType::PostExecute, "error_wrap"),
            error_recovery: ErrorRecoveryStrategy::default(),
            orchestration: Some(OrchestrationTopology::SingleAgent),
            runtime_overrides: RuntimeOverrides::default(),
        }
    }
}

// ============================================================================
// Builder
// ============================================================================

/// Agent Bundle 构建器
pub struct AgentBundleBuilder {
    bundle: AgentBundle,
}

impl AgentBundleBuilder {
    pub fn new(id: impl Into<BundleId>, name: impl Into<String>) -> Self {
        Self {
            bundle: AgentBundle {
                id: id.into(),
                name: name.into(),
                description: String::new(),
                builtin: false,
                extends: None,
                interceptor_chain: InterceptorChainConfig::default(),
                error_recovery: ErrorRecoveryStrategy::default(),
                orchestration: Some(OrchestrationTopology::SingleAgent),
                runtime_overrides: RuntimeOverrides::default(),
            },
        }
    }

    pub fn description(mut self, desc: impl Into<String>) -> Self {
        self.bundle.description = desc.into();
        self
    }

    pub fn extends(mut self, parent: impl Into<BundleId>) -> Self {
        self.bundle.extends = Some(parent.into());
        self
    }

    pub fn interceptor_chain(mut self, chain: InterceptorChainConfig) -> Self {
        self.bundle.interceptor_chain = chain;
        self
    }

    pub fn error_recovery(mut self, strategy: ErrorRecoveryStrategy) -> Self {
        self.bundle.error_recovery = strategy;
        self
    }

    pub fn orchestration(mut self, topo: OrchestrationTopology) -> Self {
        self.bundle.orchestration = Some(topo);
        self
    }

    pub fn runtime_overrides(mut self, overrides: RuntimeOverrides) -> Self {
        self.bundle.runtime_overrides = overrides;
        self
    }

    pub fn build(self) -> AgentBundle {
        self.bundle
    }
}

// ============================================================================
// 辅助函数
// ============================================================================

/// 创建标准拦截器链配置（便捷函数）
pub fn standard_interceptor_chain() -> InterceptorChainConfig {
    InterceptorChainConfig::new()
        .add(InterceptorStageType::PreExecute, "permission_audit")
        .add(InterceptorStageType::PreExecute, "param_validation")
        .add(InterceptorStageType::PreExecute, "timing_start")
        .add(InterceptorStageType::PostExecute, "timing_end")
        .add(InterceptorStageType::PostExecute, "activity_log")
        .add(InterceptorStageType::PostExecute, "error_wrap")
}

/// 创建无拦截器的裸链配置（便捷函数）
pub fn bare_interceptor_chain() -> InterceptorChainConfig {
    InterceptorChainConfig::default()
}

/// 创建只读安全拦截器链配置（便捷函数）
pub fn read_only_interceptor_chain() -> InterceptorChainConfig {
    InterceptorChainConfig::new()
        .add(InterceptorStageType::PreExecute, "permission_audit")
        .add(InterceptorStageType::PostExecute, "activity_log")
}

