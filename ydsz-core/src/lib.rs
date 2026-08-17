//! # 云顶数字 Core - 核心领域模型与合约
//!
//! 本 crate 是 ydsz 工作区的核心基础库，定义了跨模块共享的领域模型、事件、命令和错误类型。
//!
//! ## 模块概览
//!
//! - [`models`] - 领域模型定义，包含项目、线程、消息、会话等核心实体
//! - [`provider`] - AI Provider 相关类型，包括 Provider 类型、模型选择、运行时事件等
//! - [`events`] - 编排事件定义，基于事件溯源（Event Sourcing）模式的领域事件
//! - [`commands`] - 编排命令定义，用于驱动状态变更的命令对象
//! - [`error`] - 统一的错误类型与结果别名
//!
//! ## 设计原则
//!
//! - 所有类型均派生 `Serialize` / `Deserialize`，支持 JSON 序列化
//! - 事件与命令采用带标签的枚举（tagged enum），便于序列化时区分变体
//! - 使用 `chrono::DateTime<Utc>` 统一时间表示
//! - 使用 `uuid::Uuid` 作为全局唯一标识符
//!
//! ## 架构定位
//!
//! 本 crate 是整个 ydsz 工作区的'领域语言'层，被以下模块依赖：
//!
//! - `ydsz_core:` - 编排引擎（Flow Engine），消费本 crate 的事件与命令
//! - `ydsz-work = {` - 持久化层，将本 crate 的领域模型存入数据库
//! - `ydsz-flow` - AI Provider 集成，依赖 [`provider`] 子模块
//! - `ydsz-provider` - WebSocket / HTTP 服务，序列化本 crate 的类型与前端交互
//!
//! ## 使用建议
//!
//! - 在修改领域模型时，需同步更新 `ydsz-work = {` 的数据库 schema
//! - 新增事件/命令时遵循 `{聚合根}.{动作}` 命名规范（如 `thread.turn-start`）
//! - 所有时间字段统一使用 `DateTime<Utc>`，避免时区歧义

/// 编排命令定义，包含项目与线程的所有可执行命令
///
/// 命令通过编排引擎（`ydsz_core:`）处理，产生领域事件，实现 CQRS 模式的'写'侧。
pub mod commands;
/// 统一错误类型与结果别名
///
/// 涵盖核心层的输入校验、资源未找到、序列化失败、无效操作和内部错误等场景。
pub mod error;
/// 编排事件定义，基于事件溯源模式的领域事件
///
/// 所有状态变更均通过事件表达，是领域模型'事实'的唯一来源。
pub mod events;
/// 领域模型定义，包含核心业务实体与值对象
///
/// 定义项目、线程、消息、活动、检查点等核心实体，是整个系统业务语义的基础。
pub mod models;
/// AI Provider 相关类型定义，包括 Provider 类型、模型选择、运行时事件等
///
/// 抽象不同 AI Provider 的差异，提供统一的 Provider 交互契约。
pub mod provider;

/// 工具注册表与模式过滤（P1-7）
///
/// 根据 RuntimeMode 过滤可用工具，确保 Work/Code 模式只暴露各自域的工具。
pub mod tool_registry;

/// Agent Preset（智能体预设模式）
///
/// 将 Agent 配置抽象为可自由组合的 Preset，包括系统提示词模板、工具集、
/// 上下文压缩策略、子 Agent 能力和权限级别。
pub mod preset;

/// 工具权限白名单系统（P2-12）
///
/// 提供基于白名单/黑名单/审批模式的工具权限控制。
pub mod tool_permissions;

/// 工具执行标准化拦截器链（pre-execute / execute / post-execute 三阶段流水线）。
///
/// 借鉴 DeepSeek Harness 的工具执行流水线设计，为所有工具调用提供统一的
/// 权限审计、参数校验、耗时统计、活动日志和错误脱敏等拦截能力。
pub mod tool_pipeline;

/// 声明式 Agent Bundle（智能体运行契约包）。
///
/// 将 Agent 的完整运行时行为声明式组合：拦截器链顺序、错误恢复策略、
/// 多 Agent 编排拓扑。是 AgentPreset 的超集，面向系统运行时。
pub mod agent_bundle;

/// Provider 能力声明系统（ModelCapabilities + ProviderAdapter trait）。
///
/// 将 Provider/模型的能力形式化声明，实现运行时能力匹配与校验。
/// 借鉴 DeepSeek Harness 的 Provider Capabilities 设计。
pub mod provider_capabilities;

/// Effect 注册表——可逆副作用追踪。
///
/// 将文件系统写入、Git 操作、工具注册等副作用建模为可逆操作，
/// 确保 Turn 失败或中断时能回滚到一致状态。
pub mod effect_registry;

/// Agent Loop 插件化——主循环抽象为可替换接缝。
///
/// 借鉴 DeepSeek Harness 的 Seam 概念，将 Agent 主循环抽象为 AgentLoop trait，
/// 使不同场景可替换不同的循环策略（Simple、Standard、Review、Quest）。
pub mod agent_loop;

#[cfg(test)]
mod tests;

#[cfg(test)]
mod contract_tests;

/// 重导出 error 模块中的所有公开类型，方便外部直接使用
pub use error::*;

