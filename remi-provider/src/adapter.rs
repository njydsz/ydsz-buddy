//! Provider 适配器 trait 定义模块
//!
//! 本模块定义了所有 AI Provider 适配器必须实现的标准接口，
//! 包括会话生命周期管理、消息发送、事件流订阅等核心功能。
//!
//! # 核心概念
//!
//! - **[`ProviderAdapter`]**: 适配器 trait，定义了与 Provider 交互的标准接口
//! - **[`ProviderCapabilities`]**: 适配器能力声明，描述 Provider 支持的功能特性
//! - **[`SessionModelSwitchMode`]**: 会话内模型切换模式枚举
//!
//! # 设计原则
//!
//! - **统一接口**：屏蔽不同 Provider 的实现差异，提供一致的调用方式
//! - **异步优先**：所有操作均为异步，适配 I/O 密集型场景
//! - **线程安全**：要求实现 `Send + Sync`，支持并发访问
//! - **可扩展性**：部分方法提供默认实现，新适配器可选择性覆盖
//! - **最小接口**：只包含必要的核心方法，避免过度抽象
//!
//! # 会话生命周期
//!
//! 典型的会话生命周期如下：
//!
//! ```text
//! ┌─────────────┐
//! │ start_session│ ← 创建并启动会话
//! └──────┬──────┘
//!        ↓
//! ┌─────────────┐
//! │  send_turn  │ ← 发送用户消息，获取响应（可多次调用）
//! └──────┬──────┘
//!        ↓
//! ┌─────────────┐
//! │ steer_turn  │ ← （可选）在运行中重定向对话
//! └──────┬──────┘
//!        ↓
//! ┌──────────────┐
//! │interrupt_turn│ ← （可选）中断正在执行的 Turn
//! └──────┬───────┘
//!        ↓
//! ┌─────────────┐
//! │stop_session │ ← 停止并清理会话
//! └─────────────┘
//! ```
//!
//! # 模块依赖
//!
//! - 依赖 `remi_core::provider` 中的核心类型定义
//! - 被 [`crate::adapters`] 中的具体适配器实现依赖
//! - 被 [`crate::service`] 中的服务门面依赖
//!
//! # 使用示例
//!
//! ```rust,ignore
//! use remi_provider::adapter::{ProviderAdapter, ProviderCapabilities};
//! use async_trait::async_trait;
//!
//! #[async_trait]
//! impl ProviderAdapter for MyAdapter {
//!     fn provider_kind(&self) -> ProviderKind {
//!         ProviderKind::Custom
//!     }
//!
//!     fn capabilities(&self) -> ProviderCapabilities {
//!         ProviderCapabilities {
//!             session_model_switch: SessionModelSwitchMode::InSession,
//!             supports_skill_mentions: true,
//!             // ... 其他能力配置
//!         }
//!     }
//!
//!     async fn start_session(&self, input: ProviderSessionStartInput) -> ProviderResult<ProviderSession> {
//!         // 实现会话启动逻辑
//!     }
//!
//!     // ... 实现其他必需方法
//! }
//! ```

use async_trait::async_trait;
use remi_core::provider::{
    ProviderKind, ProviderRuntimeEvent, ProviderSession, ProviderSessionStartInput,
    ProviderTurnStartResult, TurnInput,
};
use serde::{Deserialize, Serialize};
use tokio::sync::broadcast;

use crate::error::ProviderResult;

/// Provider 适配器能力声明
///
/// 描述某个 Provider 适配器支持的功能特性，上层业务可根据此信息
/// 动态调整行为，实现功能降级或特性增强。
///
/// # 字段说明
///
/// - `session_model_switch`: 会话中模型切换模式
/// - `supports_skill_mentions`: 是否支持技能提及（@mention 方式调用技能）
/// - `supports_skill_discovery`: 是否支持技能发现（自动发现可用技能）
/// - `supports_native_slash_command_discovery`: 是否支持原生命令发现（/command 形式）
/// - `supports_runtime_model_list`: 是否支持运行时获取可用模型列表
/// - `supports_turn_steering`: 是否支持 Turn 转向（在运行中重定向对话方向）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderCapabilities {
    /// 会话中模型切换模式，决定切换模型时是否需要重启会话
    pub session_model_switch: SessionModelSwitchMode,

    /// 是否支持技能提及功能
    ///
    /// 启用后，用户可以在对话中通过 @mention 方式显式调用特定技能
    pub supports_skill_mentions: bool,

    /// 是否支持技能发现功能
    ///
    /// 启用后，Provider 可以自动发现并推荐可用的技能
    pub supports_skill_discovery: bool,

    /// 是否支持原生命令发现功能
    ///
    /// 启用后，Provider 可以识别并处理原生的斜杠命令（如 /help、/clear 等）
    pub supports_native_slash_command_discovery: bool,

    /// 是否支持运行时模型列表功能
    ///
    /// 启用后，可以在运行时动态获取 Provider 支持的模型列表
    pub supports_runtime_model_list: bool,

    /// 是否支持 Turn 转向功能
    ///
    /// 启用后，可以在 Turn 执行过程中重定向对话方向，实现更灵活的交互
    pub supports_turn_steering: bool,
}

/// 会话内模型切换模式
///
/// 定义了在会话进行中切换 AI 模型时的行为模式，
/// 不同 Provider 对模型切换的支持程度不同。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum SessionModelSwitchMode {
    /// 会话内直接切换
    ///
    /// 无需重启会话即可切换到新模型，保持对话上下文连续性
    InSession,

    /// 需要重启会话
    ///
    /// 切换模型时必须重启会话，会丢失当前会话状态
    RestartSession,

    /// 不支持模型切换
    ///
    /// 该 Provider 不支持在会话中切换模型
    Unsupported,
}

/// Provider 适配器 trait
///
/// 定义了与 AI Provider 交互的标准接口，所有具体的 Provider 实现
/// （如 Claude、Codex、Cursor 等）都必须实现此 trait。
///
/// # 设计原则
///
/// - **统一接口**：屏蔽不同 Provider 的实现差异
/// - **异步支持**：所有操作均为异步，适配 I/O 密集型场景
/// - **线程安全**：要求实现 `Send + Sync`，支持并发访问
/// - **可扩展性**：部分方法提供默认实现，新适配器可选择性覆盖
///
/// # 生命周期
///
/// 典型的会话生命周期：
/// 1. `start_session` - 创建并启动会话
/// 2. `send_turn` - 发送用户消息并获取响应
/// 3. `steer_turn` - （可选）在运行中重定向对话
/// 4. `interrupt_turn` - （可选）中断正在执行的 Turn
/// 5. `stop_session` - 停止并清理会话
///
/// # 示例
///
/// ```rust,ignore
/// #[async_trait]
/// impl ProviderAdapter for MyAdapter {
///     fn provider_kind(&self) -> ProviderKind {
///         ProviderKind::Custom
///     }
///
///     async fn start_session(&self, input: ProviderSessionStartInput) -> ProviderResult<ProviderSession> {
///         // 实现会话启动逻辑
///     }
///
///     // ... 实现其他必需方法
/// }
/// ```
#[async_trait]
pub trait ProviderAdapter: Send + Sync {
    /// 获取 Provider 类型标识
    ///
    /// 返回此适配器对应的 Provider 类型，用于路由和识别。
    ///
    /// # 返回值
    ///
    /// 返回 `ProviderKind` 枚举值，标识具体的 Provider 类型
    fn provider_kind(&self) -> ProviderKind;

    /// 获取适配器能力声明
    ///
    /// 返回此适配器支持的功能特性列表，上层业务可根据此信息
    /// 动态调整行为。
    ///
    /// # 返回值
    ///
    /// 返回 `ProviderCapabilities` 结构体，描述适配器的能力
    fn capabilities(&self) -> ProviderCapabilities;

    /// 启动新的会话
    ///
    /// 创建并初始化一个新的 Provider 会话，分配必要的资源。
    ///
    /// # 参数
    ///
    /// - `input`: 会话启动输入参数，包含 thread_id、模型选择等配置
    ///
    /// # 返回值
    ///
    /// - `Ok(ProviderSession)`: 成功创建的会话信息
    /// - `Err(ProviderError)`: 启动失败，可能原因包括资源不足、配置错误等
    ///
    /// # 错误
    ///
    /// - `SessionAlreadyExists`: 如果 thread_id 对应的会话已存在
    /// - `AdapterError`: 如果底层 Provider 启动失败
    async fn start_session(&self, input: ProviderSessionStartInput) -> ProviderResult<ProviderSession>;

    /// 发送 Turn（对话轮次）
    ///
    /// 将用户消息发送到 Provider，并启动一个新的对话轮次。
    ///
    /// # 参数
    ///
    /// - `input`: Turn 输入参数，包含消息内容、上下文等信息
    ///
    /// # 返回值
    ///
    /// - `Ok(ProviderTurnStartResult)`: Turn 启动成功，返回 turn_id 等信息
    /// - `Err(ProviderError)`: 发送失败，可能原因包括会话不存在、网络错误等
    ///
    /// # 错误
    ///
    /// - `SessionNotFound`: 如果 thread_id 对应的会话不存在
    /// - `AdapterError`: 如果底层 Provider 发送失败
    async fn send_turn(&self, input: TurnInput) -> ProviderResult<ProviderTurnStartResult>;

    /// 转向 Turn（重定向运行中的对话）
    ///
    /// 在 Turn 执行过程中重定向对话方向，实现更灵活的交互控制。
    /// 这是一个可选方法，默认返回不支持错误。
    ///
    /// # 参数
    ///
    /// - `input`: Turn 输入参数，包含新的对话方向信息
    ///
    /// # 返回值
    ///
    /// - `Ok(ProviderTurnStartResult)`: 转向成功
    /// - `Err(ProviderError)`: 转向失败或不支持此操作
    ///
    /// # 默认实现
    ///
    /// 默认返回 `UnsupportedOperation` 错误，支持此功能的适配器应覆盖此方法
    async fn steer_turn(&self, _input: TurnInput) -> ProviderResult<ProviderTurnStartResult> {
        Err(crate::error::ProviderError::UnsupportedOperation(
            "steer_turn not supported".to_string(),
        ))
    }

    /// 中断正在执行的 Turn
    ///
    /// 停止指定 Turn 的执行，释放相关资源。
    ///
    /// # 参数
    ///
    /// - `thread_id`: 会话线程 ID
    /// - `turn_id`: 可选的 Turn ID，如果为 None 则中断该会话中所有正在执行的 Turn
    ///
    /// # 返回值
    ///
    /// - `Ok(())`: 中断成功
    /// - `Err(ProviderError)`: 中断失败
    ///
    /// # 错误
    ///
    /// - `SessionNotFound`: 如果 thread_id 对应的会话不存在
    /// - `AdapterError`: 如果底层 Provider 中断失败
    async fn interrupt_turn(&self, thread_id: &str, turn_id: Option<&str>) -> ProviderResult<()>;

    /// 停止指定会话
    ///
    /// 清理会话资源，终止所有相关的后台任务。
    ///
    /// # 参数
    ///
    /// - `thread_id`: 要停止的会话线程 ID
    ///
    /// # 返回值
    ///
    /// - `Ok(())`: 停止成功
    /// - `Err(ProviderError)`: 停止失败
    ///
    /// # 错误
    ///
    /// - `SessionNotFound`: 如果 thread_id 对应的会话不存在
    /// - `AdapterError`: 如果底层 Provider 停止失败
    async fn stop_session(&self, thread_id: &str) -> ProviderResult<()>;

    /// 停止所有会话
    ///
    /// 清理该适配器管理的所有会话资源，通常在关闭或重置时使用。
    ///
    /// # 返回值
    ///
    /// - `Ok(())`: 停止成功
    /// - `Err(ProviderError)`: 停止失败
    async fn stop_all(&self) -> ProviderResult<()>;

    /// 列出当前所有活跃会话
    ///
    /// 返回该适配器管理的所有会话信息。
    ///
    /// # 返回值
    ///
    /// - `Ok(Vec<ProviderSession>)`: 会话列表
    /// - `Err(ProviderError)`: 获取失败
    async fn list_sessions(&self) -> ProviderResult<Vec<ProviderSession>>;

    /// 检查是否存在指定会话
    ///
    /// 快速检查指定 thread_id 的会话是否存在。
    ///
    /// # 参数
    ///
    /// - `thread_id`: 要检查的会话线程 ID
    ///
    /// # 返回值
    ///
    /// - `Ok(true)`: 会话存在
    /// - `Ok(false)`: 会话不存在
    /// - `Err(ProviderError)`: 检查失败
    async fn has_session(&self, thread_id: &str) -> ProviderResult<bool>;

    /// 回滚对话历史
    ///
    /// 将对话历史回滚指定的 Turn 数量，用于撤销操作或错误恢复。
    /// 这是一个可选方法，默认返回不支持错误。
    ///
    /// # 参数
    ///
    /// - `thread_id`: 会话线程 ID
    /// - `num_turns`: 要回滚的 Turn 数量
    ///
    /// # 返回值
    ///
    /// - `Ok(())`: 回滚成功
    /// - `Err(ProviderError)`: 回滚失败或不支持此操作
    ///
    /// # 默认实现
    ///
    /// 默认返回 `UnsupportedOperation` 错误，支持此功能的适配器应覆盖此方法
    async fn rollback_conversation(&self, _thread_id: &str, _num_turns: u32) -> ProviderResult<()> {
        Err(crate::error::ProviderError::UnsupportedOperation(
            "rollback_conversation not supported".to_string(),
        ))
    }

    /// 压缩对话上下文
    ///
    /// 对长对话进行压缩，减少上下文长度以优化性能和成本。
    /// 这是一个可选方法，默认返回不支持错误。
    ///
    /// # 参数
    ///
    /// - `thread_id`: 会话线程 ID
    ///
    /// # 返回值
    ///
    /// - `Ok(())`: 压缩成功
    /// - `Err(ProviderError)`: 压缩失败或不支持此操作
    ///
    /// # 默认实现
    ///
    /// 默认返回 `UnsupportedOperation` 错误，支持此功能的适配器应覆盖此方法
    async fn compact_thread(&self, _thread_id: &str) -> ProviderResult<()> {
        Err(crate::error::ProviderError::UnsupportedOperation(
            "compact_thread not supported".to_string(),
        ))
    }

    /// 启动代码审查
    ///
    /// 启动 Provider 原生的代码审查流程。
    /// 这是一个可选方法，默认返回不支持错误。
    ///
    /// # 参数
    ///
    /// - `input`: 审查输入，包含 thread_id、审查目标等信息
    ///
    /// # 返回值
    ///
    /// - `Ok(ProviderTurnStartResult)`: 审查启动成功
    /// - `Err(ProviderError)`: 启动失败或不支持此操作
    ///
    /// # 默认实现
    ///
    /// 默认返回 `UnsupportedOperation` 错误，支持此功能的适配器应覆盖此方法
    async fn start_review(
        &self,
        _input: remi_core::provider::ProviderStartReviewInput,
    ) -> ProviderResult<ProviderTurnStartResult> {
        Err(crate::error::ProviderError::UnsupportedOperation(
            "start_review not supported".to_string(),
        ))
    }

    /// 响应审批请求
    ///
    /// 对 Provider 发出的审批请求做出决策（批准或拒绝）。
    ///
    /// # 参数
    ///
    /// - `thread_id`: 会话线程 ID
    /// - `request_id`: 审批请求 ID
    /// - `decision`: 审批决策
    ///
    /// # 返回值
    ///
    /// - `Ok(())`: 响应成功
    /// - `Err(ProviderError)`: 响应失败
    async fn respond_to_request(
        &self,
        _thread_id: &str,
        _request_id: &str,
        _decision: remi_core::provider::ProviderApprovalDecision,
    ) -> ProviderResult<()> {
        Err(crate::error::ProviderError::UnsupportedOperation(
            "respond_to_request not supported".to_string(),
        ))
    }

    /// 响应用户输入请求
    ///
    /// 对 Provider 发出的结构化用户输入请求提供答案。
    ///
    /// # 参数
    ///
    /// - `thread_id`: 会话线程 ID
    /// - `request_id`: 请求 ID
    /// - `answers`: 用户输入答案
    ///
    /// # 返回值
    ///
    /// - `Ok(())`: 响应成功
    /// - `Err(ProviderError)`: 响应失败
    async fn respond_to_user_input(
        &self,
        _thread_id: &str,
        _request_id: &str,
        _answers: remi_core::provider::ProviderUserInputAnswers,
    ) -> ProviderResult<()> {
        Err(crate::error::ProviderError::UnsupportedOperation(
            "respond_to_user_input not supported".to_string(),
        ))
    }

    /// 读取线程快照
    ///
    /// 获取 Provider 线程的当前状态快照，包括所有 Turn 的信息。
    ///
    /// # 参数
    ///
    /// - `thread_id`: 会话线程 ID
    ///
    /// # 返回值
    ///
    /// - `Ok(ProviderThreadSnapshot)`: 线程快照
    /// - `Err(ProviderError)`: 读取失败
    async fn read_thread(
        &self,
        _thread_id: &str,
    ) -> ProviderResult<remi_core::provider::ProviderThreadSnapshot> {
        Err(crate::error::ProviderError::UnsupportedOperation(
            "read_thread not supported".to_string(),
        ))
    }

    /// 读取外部线程快照
    ///
    /// 读取已持久化的 Provider 线程快照，不需要本地应用线程绑定。
    /// 这是一个可选方法，默认返回不支持错误。
    ///
    /// # 参数
    ///
    /// - `external_thread_id`: 外部线程 ID
    /// - `cwd`: 工作目录（可选）
    ///
    /// # 返回值
    ///
    /// - `Ok(ProviderThreadSnapshot)`: 线程快照
    /// - `Err(ProviderError)`: 读取失败或不支持
    async fn read_external_thread(
        &self,
        _external_thread_id: &str,
        _cwd: Option<&str>,
    ) -> ProviderResult<remi_core::provider::ProviderThreadSnapshot> {
        Err(crate::error::ProviderError::UnsupportedOperation(
            "read_external_thread not supported".to_string(),
        ))
    }

    /// 回滚线程
    ///
    /// 将 Provider 线程回滚指定的 Turn 数量。
    ///
    /// # 参数
    ///
    /// - `thread_id`: 会话线程 ID
    /// - `num_turns`: 要回滚的 Turn 数量
    ///
    /// # 返回值
    ///
    /// - `Ok(ProviderThreadSnapshot)`: 回滚后的线程快照
    /// - `Err(ProviderError)`: 回滚失败
    async fn rollback_thread(
        &self,
        _thread_id: &str,
        _num_turns: u32,
    ) -> ProviderResult<remi_core::provider::ProviderThreadSnapshot> {
        Err(crate::error::ProviderError::UnsupportedOperation(
            "rollback_thread not supported".to_string(),
        ))
    }

    /// 分叉线程
    ///
    /// 将一个 Provider 线程分叉为另一个持久化的线程游标。
    /// 这是一个可选方法，默认返回不支持错误。
    ///
    /// # 参数
    ///
    /// - `input`: 分叉输入，包含源线程 ID、目标线程 ID 等
    ///
    /// # 返回值
    ///
    /// - `Ok(ProviderForkThreadResult)`: 分叉结果
    /// - `Err(ProviderError)`: 分叉失败或不支持
    async fn fork_thread(
        &self,
        _input: remi_core::provider::ProviderForkThreadInput,
    ) -> ProviderResult<remi_core::provider::ProviderForkThreadResult> {
        Err(crate::error::ProviderError::UnsupportedOperation(
            "fork_thread not supported".to_string(),
        ))
    }

    /// 获取 Composer 能力
    ///
    /// 读取 Provider 特定的 Composer 能力声明。
    /// 这是一个可选方法，默认返回不支持错误。
    ///
    /// # 返回值
    ///
    /// - `Ok(ProviderComposerCapabilities)`: 能力声明
    /// - `Err(ProviderError)`: 获取失败或不支持
    async fn get_composer_capabilities(
        &self,
    ) -> ProviderResult<remi_core::provider::ProviderComposerCapabilities> {
        Err(crate::error::ProviderError::UnsupportedOperation(
            "get_composer_capabilities not supported".to_string(),
        ))
    }

    /// 列出技能
    ///
    /// 列出指定工作目录下可用的技能。
    /// 这是一个可选方法，默认返回不支持错误。
    ///
    /// # 参数
    ///
    /// - `input`: 列出技能输入，包含 cwd 等信息
    ///
    /// # 返回值
    ///
    /// - `Ok(ProviderListSkillsResult)`: 技能列表
    /// - `Err(ProviderError)`: 列出失败或不支持
    async fn list_skills(
        &self,
        _input: remi_core::provider::ProviderListSkillsInput,
    ) -> ProviderResult<remi_core::provider::ProviderListSkillsResult> {
        Err(crate::error::ProviderError::UnsupportedOperation(
            "list_skills not supported".to_string(),
        ))
    }

    /// 列出命令
    ///
    /// 列出 Provider 原生的斜杠命令。
    /// 这是一个可选方法，默认返回不支持错误。
    ///
    /// # 参数
    ///
    /// - `input`: 列出命令输入，包含 cwd 等信息
    ///
    /// # 返回值
    ///
    /// - `Ok(ProviderListCommandsResult)`: 命令列表
    /// - `Err(ProviderError)`: 列出失败或不支持
    async fn list_commands(
        &self,
        _input: remi_core::provider::ProviderListCommandsInput,
    ) -> ProviderResult<remi_core::provider::ProviderListCommandsResult> {
        Err(crate::error::ProviderError::UnsupportedOperation(
            "list_commands not supported".to_string(),
        ))
    }

    /// 列出插件
    ///
    /// 列出当前 Provider/运行时可用的插件。
    /// 这是一个可选方法，默认返回不支持错误。
    ///
    /// # 参数
    ///
    /// - `input`: 列出插件输入
    ///
    /// # 返回值
    ///
    /// - `Ok(ProviderListPluginsResult)`: 插件列表
    /// - `Err(ProviderError)`: 列出失败或不支持
    async fn list_plugins(
        &self,
        _input: remi_core::provider::ProviderListPluginsInput,
    ) -> ProviderResult<remi_core::provider::ProviderListPluginsResult> {
        Err(crate::error::ProviderError::UnsupportedOperation(
            "list_plugins not supported".to_string(),
        ))
    }

    /// 读取插件
    ///
    /// 从市场条目读取单个插件的详细信息。
    /// 这是一个可选方法，默认返回不支持错误。
    ///
    /// # 参数
    ///
    /// - `input`: 读取插件输入
    ///
    /// # 返回值
    ///
    /// - `Ok(ProviderReadPluginResult)`: 插件详情
    /// - `Err(ProviderError)`: 读取失败或不支持
    async fn read_plugin(
        &self,
        _input: remi_core::provider::ProviderReadPluginInput,
    ) -> ProviderResult<remi_core::provider::ProviderReadPluginResult> {
        Err(crate::error::ProviderError::UnsupportedOperation(
            "read_plugin not supported".to_string(),
        ))
    }

    /// 列出模型
    ///
    /// 直接从 Provider 运行时列出可用模型。
    /// 这是一个可选方法，默认返回不支持错误。
    ///
    /// # 参数
    ///
    /// - `input`: 列出模型输入
    ///
    /// # 返回值
    ///
    /// - `Ok(ProviderListModelsResult)`: 模型列表
    /// - `Err(ProviderError)`: 列出失败或不支持
    async fn list_models(
        &self,
        _input: remi_core::provider::ProviderListModelsInput,
    ) -> ProviderResult<remi_core::provider::ProviderListModelsResult> {
        Err(crate::error::ProviderError::UnsupportedOperation(
            "list_models not supported".to_string(),
        ))
    }

    /// 列出代理
    ///
    /// 直接从 Provider 运行时列出可用的子代理。
    /// 这是一个可选方法，默认返回不支持错误。
    ///
    /// # 返回值
    ///
    /// - `Ok(ProviderListAgentsResult)`: 代理列表
    /// - `Err(ProviderError)`: 列出失败或不支持
    async fn list_agents(&self) -> ProviderResult<remi_core::provider::ProviderListAgentsResult> {
        Err(crate::error::ProviderError::UnsupportedOperation(
            "list_agents not supported".to_string(),
        ))
    }

    /// 转录语音
    ///
    /// 将捕获的语音片段转录为纯文本。
    /// 这是一个可选方法，默认返回不支持错误。
    ///
    /// # 参数
    ///
    /// - `input`: 语音转录输入
    ///
    /// # 返回值
    ///
    /// - `Ok(ServerVoiceTranscriptionResult)`: 转录结果
    /// - `Err(ProviderError)`: 转录失败或不支持
    async fn transcribe_voice(
        &self,
        _input: remi_core::provider::ServerVoiceTranscriptionInput,
    ) -> ProviderResult<remi_core::provider::ServerVoiceTranscriptionResult> {
        Err(crate::error::ProviderError::UnsupportedOperation(
            "transcribe_voice not supported".to_string(),
        ))
    }

    /// 获取运行时事件流接收器
    ///
    /// 订阅 Provider 运行时事件流，用于接收异步事件通知，
    /// 如消息更新、状态变化、错误等。
    ///
    /// # 返回值
    ///
    /// - `Ok(broadcast::Receiver<ProviderRuntimeEvent>)`: 事件流接收器
    /// - `Err(ProviderError)`: 订阅失败
    ///
    /// # 使用示例
    ///
    /// ```rust,ignore
    /// let mut rx = adapter.stream_events().await?;
    /// tokio::spawn(async move {
    ///     while let Ok(event) = rx.recv().await {
    ///         // 处理事件
    ///         println!("收到事件: {:?}", event);
    ///     }
    /// });
    /// ```
    async fn stream_events(&self) -> ProviderResult<broadcast::Receiver<ProviderRuntimeEvent>>;
}
