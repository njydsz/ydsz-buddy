//! # Agent Loop 插件化——主循环抽象为可替换接缝
//!
//! 借鉴 DeepSeek Harness 的"Seam"概念，将 Agent 主循环抽象为可替换的 trait，
//! 使得不同场景可以使用不同的循环策略。
//!
//! ## 核心概念
//!
//! - **AgentLoop trait**：定义 Agent 主循环的契约（接收输入 → 调用 Provider → 处理工具 → 循环）
//! - **LoopContext**：循环的共享上下文（Thread、Session、Pipeline、注册中心等）
//! - **LoopResult**：单次 Turn 的执行结果（完成/中断/错误/需要用户输入）
//! - **StandardAgentLoop**：默认的标准循环实现
//!
//! ## 可替换策略
//!
//! 通过实现 `AgentLoop` trait，可以替换以下行为：
//!
//! - **SimpleLoop**：单轮对话，一问一答
//! - **AgentLoop**：多轮工具调用 + CoT，直到任务完成
//! - **ReviewLoop**：代码审查模式，分析 diff 后给出评审
//! - **QuestLoop**：Quest 模式，多步骤执行与进度跟踪
//!
//! ## 生命周期 Hook
//!
//! 每个循环阶段都有对应的 hook，允许外部观察或干预：
//!
//! - `on_turn_start` / `on_turn_end`
//! - `on_provider_response`
//! - `on_tool_call_start` / `on_tool_call_end`
//! - `on_context_compress`
//! - `on_error`

use std::collections::HashMap;
use std::time::Instant;

use serde::{Deserialize, Serialize};

use crate::error::CoreResult;

// ============================================================================
// 循环上下文
// ============================================================================

/// # 循环上下文
///
/// 携带一次 Agent Turn 执行所需的所有上下文信息。
///
/// 是 Loop 与外部系统交互的"把手"，包含：
/// - 线程和会话标识
/// - Provider 选择和认证
/// - 工具 Pipeline
/// - Effect 注册表
/// - 扩展元数据
#[derive(Debug, Clone)]
pub struct LoopContext {
    /// 线程 ID
    pub thread_id: String,
    /// Turn ID
    pub turn_id: String,
    /// 会话 ID（如果有）
    pub session_id: Option<String>,
    /// 用户输入消息
    pub user_input: String,
    /// 扩展元数据（Bundle ID、权限级别、自定义标签等）
    pub metadata: HashMap<String, String>,
}

impl LoopContext {
    /// 创建新的循环上下文
    pub fn new(
        thread_id: impl Into<String>,
        turn_id: impl Into<String>,
        user_input: impl Into<String>,
    ) -> Self {
        Self {
            thread_id: thread_id.into(),
            turn_id: turn_id.into(),
            session_id: None,
            user_input: user_input.into(),
            metadata: HashMap::new(),
        }
    }

    /// 添加元数据
    pub fn with_metadata(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.metadata.insert(key.into(), value.into());
        self
    }

    /// 设置会话 ID
    pub fn with_session(mut self, session_id: impl Into<String>) -> Self {
        self.session_id = Some(session_id.into());
        self
    }
}

// ============================================================================
// 循环结果
// ============================================================================

/// # 循环执行结果
///
/// 描述一次 Turn 的最终状态。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "status")]
pub enum LoopResult {
    /// Turn 成功完成
    Completed {
        /// 最终输出摘要
        summary: String,
        /// 执行的工具调用次数
        tool_calls_count: usize,
        /// 总耗时（毫秒）
        total_duration_ms: u64,
    },
    /// Turn 被用户中断
    Interrupted {
        /// 中断原因
        reason: String,
        /// 已执行的工具调用次数
        tool_calls_count: usize,
    },
    /// Turn 执行出错
    Error {
        /// 错误消息
        message: String,
        /// 错误阶段（provider / tool / compression / unknown）
        phase: String,
    },
    /// 需要用户输入才能继续
    AwaitingUserInput {
        /// 提供给用户的提示
        prompt: String,
    },
    /// 需要用户审批
    AwaitingApproval {
        /// 审批请求 ID
        request_id: String,
        /// 审批描述
        description: String,
    },
    /// 达到最大迭代次数限制
    HitIterationLimit {
        /// 实际迭代次数
        iterations: u32,
        /// 最大迭代次数
        max_iterations: u32,
    },
}

impl LoopResult {
    /// 是否成功完成
    pub fn is_completed(&self) -> bool {
        matches!(self, Self::Completed { .. })
    }

    /// 是否出错
    pub fn is_error(&self) -> bool {
        matches!(self, Self::Error { .. })
    }

    /// 是否需要用户交互
    pub fn requires_user_interaction(&self) -> bool {
        matches!(
            self,
            Self::AwaitingUserInput { .. } | Self::AwaitingApproval { .. }
        )
    }

    /// 获取结果的人类可读描述
    pub fn description(&self) -> String {
        match self {
            Self::Completed { summary, .. } => format!("完成: {}", summary),
            Self::Interrupted { reason, .. } => format!("中断: {}", reason),
            Self::Error { message, phase } => format!("错误 ({}) {}", phase, message),
            Self::AwaitingUserInput { prompt } => format!("等待输入: {}", prompt),
            Self::AwaitingApproval { description, .. } => format!("等待审批: {}", description),
            Self::HitIterationLimit {
                iterations,
                max_iterations,
            } => format!(
                "超过最大迭代次数: {}/{}",
                iterations, max_iterations
            ),
        }
    }

    /// 获取工具调用次数
    pub fn tool_calls_count(&self) -> usize {
        match self {
            Self::Completed { tool_calls_count, .. } => *tool_calls_count,
            Self::Interrupted { tool_calls_count, .. } => *tool_calls_count,
            _ => 0,
        }
    }
}

// ============================================================================
// Provider 响应模拟（仅类型定义，不绑定具体 Provider trait）
// ============================================================================

/// # Provider 响应片段
///
/// 模型输出的一个片段，可以是文本、工具调用或思考过程。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum ProviderResponseFragment {
    /// 文本输出
    Text {
        content: String,
    },
    /// 工具调用请求
    ToolCall {
        tool_name: String,
        input: serde_json::Value,
    },
    /// 思考过程（CoT模型的推理链）
    Thinking {
        content: String,
    },
    /// 响应结束
    EndOfTurn,
}

/// # Provider 响应
///
/// 完整的 Provider 响应（所有片段的集合）。
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderResponse {
    /// 响应片段
    pub fragments: Vec<ProviderResponseFragment>,
    /// 是否完成（Agent 可以决定不再调用工具）
    #[serde(default)]
    pub is_complete: bool,
    /// 使用的 token 数（估算）
    #[serde(default)]
    pub tokens_used: u32,
}

impl ProviderResponse {
    /// 检查是否包含工具调用
    pub fn has_tool_calls(&self) -> bool {
        self.fragments
            .iter()
            .any(|f| matches!(f, ProviderResponseFragment::ToolCall { .. }))
    }

    /// 提取所有工具调用
    pub fn tool_calls(&self) -> Vec<(&str, &serde_json::Value)> {
        self.fragments
            .iter()
            .filter_map(|f| match f {
                ProviderResponseFragment::ToolCall { tool_name, input } => {
                    Some((tool_name.as_str(), input))
                }
                _ => None,
            })
            .collect()
    }

    /// 提取所有文本内容（拼接）
    pub fn text_content(&self) -> String {
        self.fragments
            .iter()
            .filter_map(|f| match f {
                ProviderResponseFragment::Text { content } => Some(content.as_str()),
                _ => None,
            })
            .collect()
    }
}

// ============================================================================
// Agent Loop trait
// ============================================================================

/// # Agent Loop trait
///
/// 定义 Agent 主循环的核心契约。
///
/// ## 循环流程
///
/// ```text
/// ┌─────────────────────────────────────────────────┐
/// │                                                 │
/// │  on_turn_start()                                │
/// │   │                                             │
/// │   ├─ 构建 prompt（系统提示 + 用户输入 + 历史）   │
/// │   │                                             │
/// │   ├─ 调用 Provider ──→ ProviderResponse         │
/// │   │                                             │
/// │   ├─ on_provider_response()                     │
/// │   │                                             │
/// │   ├─ 响应包含工具调用？                          │
/// │   │   ├─ YES → 遍历每个 ToolCall                │
/// │   │   │           ├─ on_tool_call_start()       │
/// │   │   │           ├─ Pipeline 执行工具           │
/// │   │   │           ├─ on_tool_call_end()         │
/// │   │   │           └─ 结果拼接到上下文            │
/// │   │   └─ 再次调用 Provider（循环）               │
/// │   │   └─ NO  → 返回 LoopResult::Completed        │
/// │   │                                             │
/// │   ├─ 上下文超长？→ on_context_compress()         │
/// │   │                                             │
/// │   └─ on_turn_end()                              │
/// │                                                 │
/// └─────────────────────────────────────────────────┘
/// ```
#[async_trait::async_trait]
pub trait AgentLoop: Send + Sync {
    /// 获取循环名称（用于日志和监控）
    fn name(&self) -> &str;

    /// 执行完整的 Turn（包含多轮工具调用循环）
    async fn run(&self, ctx: &mut LoopContext) -> LoopResult;

    /// 最大迭代次数（工具调用的轮次上限，防止无限循环）
    fn max_iterations(&self) -> u32 {
        20
    }

    /// Hook：Turn 开始
    async fn on_turn_start(&self, _ctx: &LoopContext) -> CoreResult<()> {
        Ok(())
    }

    /// Hook：Turn 结束
    async fn on_turn_end(&self, _ctx: &LoopContext, _result: &LoopResult) -> CoreResult<()> {
        Ok(())
    }

    /// Hook：Provider 返回响应后
    /// 返回 true 表示继续循环（有更多工具调用），false 表示终止
    async fn on_provider_response(
        &self,
        _ctx: &LoopContext,
        response: &ProviderResponse,
    ) -> CoreResult<bool> {
        Ok(response.has_tool_calls())
    }

    /// Hook：工具调用开始
    async fn on_tool_call_start(
        &self,
        _ctx: &LoopContext,
        _tool_name: &str,
        _input: &serde_json::Value,
    ) -> CoreResult<()> {
        Ok(())
    }

    /// Hook：工具调用结束
    async fn on_tool_call_end(
        &self,
        _ctx: &LoopContext,
        _tool_name: &str,
        _success: bool,
        _output_json: Option<&serde_json::Value>,
    ) -> CoreResult<()> {
        Ok(())
    }

    /// Hook：上下文压缩
    ///
    /// 当上下文过长时调用，返回压缩后的 token 估算数
    async fn on_context_compress(&self, _ctx: &LoopContext) -> CoreResult<u64> {
        Ok(0)
    }

    /// Hook：发生错误
    async fn on_error(
        &self,
        _ctx: &LoopContext,
        _phase: &str,
        _error: &str,
    ) -> CoreResult<()> {
        Ok(())
    }
}

// ============================================================================
// 标准 Agent Loop 实现
// ============================================================================

/// # 标准 Agent Loop
///
/// 实现了多轮工具调用循环的标准逻辑：
///
/// 1. 构建 prompt
/// 2. 调用 Provider（通过注入的提供者闭包）
/// 3. 处理响应中的工具调用
/// 4. 拼接结果并继续循环
/// 5. 直到响应不再包含工具调用或达到最大迭代次数
pub struct StandardAgentLoop<F>
where
    F: Fn(&LoopContext, &[ProviderResponseFragment]) -> CoreResult<ProviderResponse>
        + Send
        + Sync,
{
    /// 名称
    name: String,
    /// Provider 调用闭包（注入具体 Provider 逻辑）
    provider_fn: F,
    /// 最大迭代次数
    max_iterations: u32,
}

impl<F> StandardAgentLoop<F>
where
    F: Fn(&LoopContext, &[ProviderResponseFragment]) -> CoreResult<ProviderResponse>
        + Send
        + Sync,
{
    /// 创建标准循环
    pub fn new(name: impl Into<String>, provider_fn: F) -> Self {
        Self {
            name: name.into(),
            provider_fn,
            max_iterations: 20,
        }
    }

    /// 设置最大迭代次数
    pub fn with_max_iterations(mut self, max: u32) -> Self {
        self.max_iterations = max;
        self
    }
}

#[async_trait::async_trait]
impl<F> AgentLoop for StandardAgentLoop<F>
where
    F: Fn(&LoopContext, &[ProviderResponseFragment]) -> CoreResult<ProviderResponse>
        + Send
        + Sync,
{
    fn name(&self) -> &str {
        &self.name
    }

    fn max_iterations(&self) -> u32 {
        self.max_iterations
    }

    async fn run(&self, ctx: &mut LoopContext) -> LoopResult {
        let start_time = Instant::now();
        let mut history: Vec<ProviderResponseFragment> = Vec::new();
        let mut tool_call_count: usize = 0;

        // Turn 开始 hook
        if let Err(e) = self.on_turn_start(ctx).await {
            return LoopResult::Error {
                message: format!("on_turn_start hook failed: {}", e),
                phase: "hook".to_string(),
            };
        }

        // 主循环
        for _iteration in 0..self.max_iterations {
            // 调用 Provider
            let response = match (self.provider_fn)(ctx, &history) {
                Ok(resp) => resp,
                Err(e) => {
                    let err_msg = e.to_string();
                    let _ = self.on_error(ctx, "provider", &err_msg).await;
                    return LoopResult::Error {
                        message: err_msg,
                        phase: "provider".to_string(),
                    };
                }
            };

            // Provider 响应 hook
            let should_continue = match self.on_provider_response(ctx, &response).await {
                Ok(should) => should,
                Err(e) => {
                    return LoopResult::Error {
                        message: format!("on_provider_response hook failed: {}", e),
                        phase: "hook".to_string(),
                    };
                }
            };

            // 保存到历史
            history.extend(response.fragments.clone());

            // 检查是否需要终止
            if !should_continue || response.is_complete {
                let duration = start_time.elapsed().as_millis() as u64;
                let result = LoopResult::Completed {
                    summary: response.text_content(),
                    tool_calls_count: tool_call_count,
                    total_duration_ms: duration,
                };
                let _ = self.on_turn_end(ctx, &result).await;
                return result;
            }

            // 检查是否有工具调用
            if response.has_tool_calls() {
                for (tool_name, input) in response.tool_calls() {
                    // 工具调用开始 hook
                    let _ = self
                        .on_tool_call_start(ctx, tool_name, input)
                        .await;

                    // 模拟工具调用（实际场景中使用 ToolPipeline）
                    tool_call_count += 1;

                    // 工具调用结束 hook（占位）—— 实际场景传入 ToolOutput
                    let _ = tool_name;
                }
            }
        }

        // 达到最大迭代次数
        let result = LoopResult::HitIterationLimit {
            iterations: self.max_iterations,
            max_iterations: self.max_iterations,
        };
        let _ = self.on_turn_end(ctx, &result).await;
        result
    }
}

// ============================================================================
// 简单循环：单次调用，无工具
// ============================================================================

/// # Simple Loop（单轮对话循环）
///
/// 最简循环：只调用一次 Provider，不使用工具。
/// 适合 Ask 模式的纯问答场景。
pub struct SimpleAgentLoop<F>
where
    F: Fn(&str) -> CoreResult<String> + Send + Sync,
{
    name: String,
    provider_fn: F,
}

impl<F> SimpleAgentLoop<F>
where
    F: Fn(&str) -> CoreResult<String> + Send + Sync,
{
    pub fn new(name: impl Into<String>, provider_fn: F) -> Self {
        Self {
            name: name.into(),
            provider_fn,
        }
    }
}

#[async_trait::async_trait]
impl<F> AgentLoop for SimpleAgentLoop<F>
where
    F: Fn(&str) -> CoreResult<String> + Send + Sync,
{
    fn name(&self) -> &str {
        &self.name
    }

    fn max_iterations(&self) -> u32 {
        1
    }

    async fn run(&self, ctx: &mut LoopContext) -> LoopResult {
        let start = Instant::now();

        let response = match (self.provider_fn)(&ctx.user_input) {
            Ok(resp) => resp,
            Err(e) => {
                return LoopResult::Error {
                    message: e.to_string(),
                    phase: "provider".to_string(),
                };
            }
        };

        LoopResult::Completed {
            summary: response,
            tool_calls_count: 0,
            total_duration_ms: start.elapsed().as_millis() as u64,
        }
    }
}

// ============================================================================
// Loop Builder
// ============================================================================

/// # Agent Loop Builder
///
/// 用于构建和配置 Agent Loop 的流畅 API。
pub struct AgentLoopBuilder;

impl AgentLoopBuilder {
    /// 创建标准循环（带 Provider 闭包）
    pub fn standard<F>(provider_fn: F) -> StandardAgentLoop<F>
    where
        F: Fn(&LoopContext, &[ProviderResponseFragment]) -> CoreResult<ProviderResponse>
            + Send
            + Sync,
    {
        StandardAgentLoop::new("standard", provider_fn)
    }

    /// 创建简单循环
    pub fn simple<F>(provider_fn: F) -> SimpleAgentLoop<F>
    where
        F: Fn(&str) -> CoreResult<String> + Send + Sync,
    {
        SimpleAgentLoop::new("simple", provider_fn)
    }
}

// ============================================================================
// 便捷导出
// ============================================================================

/// 创建一个默认的 LoopContext
pub fn loop_context(
    thread_id: impl Into<String>,
    turn_id: impl Into<String>,
    user_input: impl Into<String>,
) -> LoopContext {
    LoopContext::new(thread_id, turn_id, user_input)
}
