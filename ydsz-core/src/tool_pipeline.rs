//! # Tool Pipeline 标准化拦截器链
//!
//! 借鉴 DeepSeek Harness 的 pre-execute / execute / post-execute 三阶段流水线设计，
//! 为 ydsz-buddy 的所有工具调用提供统一的拦截器链。
//!
//! ## 核心概念
//!
//! - **ToolContext**：工具调用的上下文（线程、会话、权限、审计信息）
//! - **ToolInput / ToolOutput**：标准化的工具输入/输出包装
//! - **ToolInterceptor**：拦截器 trait，Tower-style middleware
//! - **ToolPipeline**：组合多个拦截器形成处理链
//!
//! ## 内置拦截器
//!
//! | 拦截器 | 阶段 | 职责 |
//! |--------|------|------|
//! | `PermissionAuditInterceptor` | pre | 权限白名单/黑名单校验 |
//! | `ParameterValidationInterceptor` | pre | JSON Schema 参数校验 |
//! | `TimingInterceptor` | pre/post | 执行耗时统计 |
//! | `ActivityLogInterceptor` | post | 写入 Activity 审计日志 |
//! | `ErrorWrapInterceptor` | post | 统一错误包装与脱敏 |
//!
//! ## 使用方式
//!
//! ```ignore
//! let pipeline = ToolPipeline::new()
//!     .add(PermissionAuditInterceptor::new(permissions))
//!     .add(ParameterValidationInterceptor::new())
//!     .add(TimingInterceptor::new())
//!     .add(ActivityLogInterceptor::new(activity_emitter))
//!     .add(ErrorWrapInterceptor::new());
//!
//! let output = pipeline.execute(tool_name, input, &ctx, || {
//!     // 实际工具执行逻辑
//!     tool_impl.run(input)
//! }).await?;
//! ```

use std::collections::HashMap;
use std::fmt;
use std::sync::Arc;
use std::time::Instant;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::{CoreError, CoreResult};

// ============================================================================
// 基础类型
// ============================================================================

/// 工具调用唯一标识
pub type ToolCallId = String;

/// 工具名称
pub type ToolName = String;

/// 工具调用上下文
///
/// 携带一次工具调用的完整上下文信息，贯穿 pre-execute / execute / post-execute 全生命周期。
#[derive(Debug, Clone)]
pub struct ToolContext {
    /// 本次调用的唯一 ID
    pub call_id: ToolCallId,
    /// 关联的线程 ID
    pub thread_id: String,
    /// 关联的 Turn ID
    pub turn_id: String,
    /// 会话 ID（如果有）
    pub session_id: Option<String>,
    /// 调用者身份（user / agent / subagent）
    pub caller: CallerIdentity,
    /// 权限级别
    pub permission_level: PermissionLevel,
    /// 扩展元数据
    pub metadata: HashMap<String, String>,
}

/// 调用者身份
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum CallerIdentity {
    /// 用户直接操作
    User,
    /// AI Agent 自主调用
    Agent,
    /// 子 Agent 调用
    Subagent,
    /// 系统内部调用（调度器、事件处理器等）
    System,
}

/// 权限级别（与 AgentPreset 的 PermissionLevel 对齐）
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PermissionLevel {
    /// 只读
    ReadOnly,
    /// 标准
    Standard,
    /// 完全
    Full,
    /// 沙箱
    Sandboxed,
}

impl Default for PermissionLevel {
    fn default() -> Self {
        Self::Standard
    }
}

/// 工具输入（标准化包装）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolInput {
    /// 工具名称
    pub tool_name: ToolName,
    /// 工具参数（JSON 对象）
    pub arguments: Value,
    /// 请求超时（毫秒，0 表示使用默认值）
    #[serde(default)]
    pub timeout_ms: u64,
}

impl ToolInput {
    /// 创建新的工具输入
    pub fn new(tool_name: impl Into<ToolName>, arguments: Value) -> Self {
        Self {
            tool_name: tool_name.into(),
            arguments,
            timeout_ms: 0,
        }
    }

    /// 设置超时
    pub fn with_timeout(mut self, ms: u64) -> Self {
        self.timeout_ms = ms;
        self
    }
}

/// 工具输出（标准化包装）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolOutput {
    /// 是否成功
    pub success: bool,
    /// 输出结果（成功时为工具返回值，失败时为错误描述）
    pub result: Value,
    /// 执行耗时（毫秒）
    pub elapsed_ms: u64,
    /// 工具名称（回显）
    pub tool_name: ToolName,
    /// 调用 ID（回显）
    pub call_id: ToolCallId,
    /// 输出摘要（用于 UI 展示和日志）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
}

impl ToolOutput {
    /// 创建成功输出
    pub fn success(
        tool_name: impl Into<ToolName>,
        call_id: impl Into<ToolCallId>,
        result: Value,
        elapsed_ms: u64,
    ) -> Self {
        Self {
            success: true,
            result,
            elapsed_ms,
            tool_name: tool_name.into(),
            call_id: call_id.into(),
            summary: None,
        }
    }

    /// 创建失败输出
    pub fn failure(
        tool_name: impl Into<ToolName>,
        call_id: impl Into<ToolCallId>,
        error: impl Into<String>,
        elapsed_ms: u64,
    ) -> Self {
        Self {
            success: false,
            result: serde_json::json!({ "error": error.into() }),
            elapsed_ms,
            tool_name: tool_name.into(),
            call_id: call_id.into(),
            summary: None,
        }
    }

    /// 设置摘要
    pub fn with_summary(mut self, summary: impl Into<String>) -> Self {
        self.summary = Some(summary.into());
        self
    }
}

/// 工具执行错误
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolError {
    /// 错误阶段
    pub phase: ToolPhase,
    /// 错误码
    pub code: ToolErrorCode,
    /// 错误消息
    pub message: String,
    /// 工具名称
    pub tool_name: ToolName,
    /// 调用 ID
    pub call_id: ToolCallId,
    /// 是否可重试
    #[serde(default)]
    pub retryable: bool,
}

/// 工具执行阶段
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ToolPhase {
    /// 前置处理阶段（权限校验、参数校验等）
    PreExecute,
    /// 实际执行阶段
    Execute,
    /// 后置处理阶段（日志、脱敏等）
    PostExecute,
}

/// 工具错误码
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ToolErrorCode {
    /// 权限不足
    PermissionDenied,
    /// 参数校验失败
    InvalidArguments,
    /// 工具未找到
    ToolNotFound,
    /// 执行超时
    Timeout,
    /// 执行错误
    ExecutionFailed,
    /// 结果脱敏触发
    SanitizationTriggered,
    /// 内部错误
    Internal,
}

impl fmt::Display for ToolError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "[{}] {} (tool={}, call_id={}, phase={:?})",
            self.code.as_str(),
            self.message,
            self.tool_name,
            self.call_id,
            self.phase
        )
    }
}

impl std::error::Error for ToolError {}

impl ToolError {
    /// 转换为 CoreError
    pub fn into_core_error(self) -> CoreError {
        CoreError::ToolError {
            tool_name: self.tool_name,
            call_id: self.call_id,
            message: self.message,
        }
    }

    /// 获取错误码字符串
    pub fn code_str(&self) -> &str {
        self.code.as_str()
    }
}

impl ToolErrorCode {
    /// 获取字符串表示
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::PermissionDenied => "permission_denied",
            Self::InvalidArguments => "invalid_arguments",
            Self::ToolNotFound => "tool_not_found",
            Self::Timeout => "timeout",
            Self::ExecutionFailed => "execution_failed",
            Self::SanitizationTriggered => "sanitization_triggered",
            Self::Internal => "internal",
        }
    }
}

// ============================================================================
// 拦截器 Trait
// ============================================================================

/// 工具拦截器（Tower-style middleware）
///
/// 每个拦截器可以在工具调用前后插入处理逻辑。
/// 拦截器通过 `Arc<dyn ToolInterceptor>` 共享，因此必须实现 `Send + Sync`。
#[async_trait]
pub trait ToolInterceptor: Send + Sync {
    /// 拦截器名称（用于日志和调试）
    fn name(&self) -> &'static str;

    /// 前置处理
    ///
    /// 返回 `Ok(modified_input)` 继续执行，返回 `Err(ToolError)` 中止。
    /// 默认实现直接透传 input。
    async fn pre_execute(
        &self,
        _input: ToolInput,
        _ctx: &ToolContext,
    ) -> CoreResult<ToolInput> {
        Ok(_input)
    }

    /// 后置处理
    ///
    /// 返回 `Ok(modified_output)` 继续传递，返回 `Err(ToolError)` 转换为错误。
    /// 默认实现直接透传 output。
    async fn post_execute(
        &self,
        _output: ToolOutput,
        _ctx: &ToolContext,
    ) -> CoreResult<ToolOutput> {
        Ok(_output)
    }

    /// 错误处理
    ///
    /// 当 pre/post/execute 阶段发生错误时，拦截器有机会转换或包装错误。
    /// 默认实现直接透传错误。
    async fn on_error(
        &self,
        _error: ToolError,
        _ctx: &ToolContext,
    ) -> CoreResult<ToolError> {
        Ok(_error)
    }
}

/// 类型别名：共享的拦截器引用
pub type InterceptorRef = Arc<dyn ToolInterceptor>;

// ============================================================================
// 内置拦截器实现
// ============================================================================

/// 权限审计拦截器
///
/// 在 pre-execute 阶段校验调用者是否有权限执行目标工具。
pub struct PermissionAuditInterceptor {
    /// 工具名 → 所需最低权限级别
    required_level: HashMap<ToolName, PermissionLevel>,
    /// 黑名单工具（任何权限都不允许）
    blacklist: Vec<ToolName>,
}

impl PermissionAuditInterceptor {
    pub fn new() -> Self {
        Self {
            required_level: HashMap::new(),
            blacklist: Vec::new(),
        }
    }

    /// 设置工具的最低权限要求
    pub fn require(mut self, tool_name: impl Into<ToolName>, level: PermissionLevel) -> Self {
        self.required_level.insert(tool_name.into(), level);
        self
    }

    /// 添加工具到黑名单
    pub fn block(mut self, tool_name: impl Into<ToolName>) -> Self {
        self.blacklist.push(tool_name.into());
        self
    }

    /// 检查权限级别是否满足要求
    fn level_satisfies(&self, actual: PermissionLevel, required: PermissionLevel) -> bool {
        use PermissionLevel::*;
        match (required, actual) {
            (ReadOnly, _) => true,
            (Standard, Standard) | (Standard, Full) | (Standard, Sandboxed) => true,
            (Full, Full) => true,
            (Sandboxed, Sandboxed) | (Sandboxed, Full) => true,
            _ => false,
        }
    }
}

impl Default for PermissionAuditInterceptor {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl ToolInterceptor for PermissionAuditInterceptor {
    fn name(&self) -> &'static str {
        "PermissionAudit"
    }

    async fn pre_execute(
        &self,
        input: ToolInput,
        ctx: &ToolContext,
    ) -> CoreResult<ToolInput> {
        // 检查黑名单
        if self.blacklist.contains(&input.tool_name) {
            return Err(ToolError {
                phase: ToolPhase::PreExecute,
                code: ToolErrorCode::PermissionDenied,
                message: format!("Tool '{}' is blocklisted", input.tool_name),
                tool_name: input.tool_name,
                call_id: ctx.call_id.clone(),
                retryable: false,
            }
            .into_core_error());
        }

        // 检查权限级别
        if let Some(&required) = self.required_level.get(&input.tool_name) {
            if !self.level_satisfies(ctx.permission_level, required) {
                return Err(ToolError {
                    phase: ToolPhase::PreExecute,
                    code: ToolErrorCode::PermissionDenied,
                    message: format!(
                        "Tool '{}' requires {:?} permission, caller has {:?}",
                        input.tool_name, required, ctx.permission_level
                    ),
                    tool_name: input.tool_name,
                    call_id: ctx.call_id.clone(),
                    retryable: false,
                }
                .into_core_error());
            }
        }

        Ok(input)
    }
}

/// 参数校验拦截器
///
/// 在 pre-execute 阶段校验工具参数是否符合 JSON Schema。
pub struct ParameterValidationInterceptor {
    /// 工具名 → JSON Schema
    schemas: HashMap<ToolName, Value>,
}

impl ParameterValidationInterceptor {
    pub fn new() -> Self {
        Self {
            schemas: HashMap::new(),
        }
    }

    /// 注册工具的 JSON Schema
    pub fn register_schema(mut self, tool_name: impl Into<ToolName>, schema: Value) -> Self {
        self.schemas.insert(tool_name.into(), schema);
        self
    }
}

impl Default for ParameterValidationInterceptor {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl ToolInterceptor for ParameterValidationInterceptor {
    fn name(&self) -> &'static str {
        "ParameterValidation"
    }

    async fn pre_execute(
        &self,
        input: ToolInput,
        ctx: &ToolContext,
    ) -> CoreResult<ToolInput> {
        if let Some(schema) = self.schemas.get(&input.tool_name) {
            // 基础 schema 校验：检查 arguments 是否为对象类型
            if !input.arguments.is_object() {
                return Err(ToolError {
                    phase: ToolPhase::PreExecute,
                    code: ToolErrorCode::InvalidArguments,
                    message: format!(
                        "Tool '{}' expects object arguments, got {}",
                        input.tool_name,
                        json_type_name(&input.arguments)
                    ),
                    tool_name: input.tool_name.clone(),
                    call_id: ctx.call_id.clone(),
                    retryable: false,
                }
                .into_core_error());
            }

            // 检查 required 字段
            if let Some(required_fields) = schema.get("required").and_then(|v| v.as_array()) {
                let args_obj = input.arguments.as_object().unwrap();
                for field in required_fields {
                    if let Some(field_name) = field.as_str() {
                        if !args_obj.contains_key(field_name) {
                            return Err(ToolError {
                                phase: ToolPhase::PreExecute,
                                code: ToolErrorCode::InvalidArguments,
                                message: format!(
                                    "Tool '{}' missing required field: '{}'",
                                    input.tool_name, field_name
                                ),
                                tool_name: input.tool_name.clone(),
                                call_id: ctx.call_id.clone(),
                                retryable: false,
                            }
                            .into_core_error());
                        }
                    }
                }
            }
        }
        Ok(input)
    }
}

/// 耗时统计拦截器
///
/// 在 pre-execute 记录开始时间，在 post-execute 计算耗时并写入 ToolOutput。
pub struct TimingInterceptor;

impl TimingInterceptor {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl ToolInterceptor for TimingInterceptor {
    fn name(&self) -> &'static str {
        "Timing"
    }
}

/// 活动日志拦截器
///
/// 在 post-execute 阶段将工具调用结果写入 Activity 审计日志。
pub struct ActivityLogInterceptor {
    /// 是否记录完整 payload（否则只记录摘要）
    log_full_payload: bool,
}

impl ActivityLogInterceptor {
    pub fn new() -> Self {
        Self {
            log_full_payload: false,
        }
    }

    /// 设置是否记录完整 payload
    pub fn log_full_payload(mut self, yes: bool) -> Self {
        self.log_full_payload = yes;
        self
    }
}

impl Default for ActivityLogInterceptor {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl ToolInterceptor for ActivityLogInterceptor {
    fn name(&self) -> &'static str {
        "ActivityLog"
    }

    async fn post_execute(
        &self,
        output: ToolOutput,
        _ctx: &ToolContext,
    ) -> CoreResult<ToolOutput> {
        // 这里仅做结构化日志输出；实际 Activity 写入由编排引擎消费 ToolOutput 后处理
        // 保持拦截器无状态，不直接依赖 ActivityEmitter
        tracing::info!(
            tool = %output.tool_name,
            call_id = %output.call_id,
            success = output.success,
            elapsed_ms = output.elapsed_ms,
            "tool_executed"
        );
        Ok(output)
    }
}

/// 错误包装拦截器
///
/// 在 post-execute 阶段统一处理错误：脱敏敏感信息、标准化错误格式。
pub struct ErrorWrapInterceptor {
    /// 需要脱敏的字段名
    sensitive_fields: Vec<String>,
}

impl ErrorWrapInterceptor {
    pub fn new() -> Self {
        Self {
            sensitive_fields: vec![
                "api_key".to_string(),
                "token".to_string(),
                "password".to_string(),
                "secret".to_string(),
            ],
        }
    }

    /// 添加需要脱敏的字段名
    pub fn sensitive_field(mut self, field: impl Into<String>) -> Self {
        self.sensitive_fields.push(field.into());
        self
    }
}

impl Default for ErrorWrapInterceptor {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl ToolInterceptor for ErrorWrapInterceptor {
    fn name(&self) -> &'static str {
        "ErrorWrap"
    }

    async fn post_execute(
        &self,
        output: ToolOutput,
        _ctx: &ToolContext,
    ) -> CoreResult<ToolOutput> {
        if !output.success {
            // 对错误结果做脱敏：
            // 1. 对 JSON 对象中命名字段直接替换
            // 2. 对字符串值中的 key=value 模式做正则替换
            let result = Self::sanitize_value(output.result.clone(), &self.sensitive_fields);
            return Ok(ToolOutput { result, ..output });
        }
        Ok(output)
    }

    async fn on_error(
        &self,
        error: ToolError,
        _ctx: &ToolContext,
    ) -> CoreResult<ToolError> {
        // 确保错误消息中不包含敏感信息（key=value 模式）
        let message = Self::sanitize_string(&error.message, &self.sensitive_fields);
        if message != error.message {
            Ok(ToolError { message, ..error })
        } else {
            Ok(error)
        }
    }
}

impl ErrorWrapInterceptor {
    /// 递归清理 JSON 值中的敏感信息
    fn sanitize_value(value: Value, sensitive_fields: &[String]) -> Value {
        match value {
            Value::Object(mut map) => {
                for (k, v) in map.iter_mut() {
                    if sensitive_fields.iter().any(|s| s.eq_ignore_ascii_case(k)) {
                        *v = Value::String("***REDACTED***".to_string());
                    } else {
                        *v = Self::sanitize_value(v.clone(), sensitive_fields);
                    }
                }
                Value::Object(map)
            }
            Value::String(s) => {
                Value::String(Self::sanitize_string(&s, sensitive_fields))
            }
            Value::Array(arr) => {
                Value::Array(arr.into_iter().map(|v| Self::sanitize_value(v, sensitive_fields)).collect())
            }
            other => other,
        }
    }

    /// 清理字符串中的 key=value 模式敏感信息
    ///
    /// 不引入 regex 依赖，使用简单的字符串扫描实现。
    /// 对每个敏感字段，查找 `field=value` 模式并替换 value 为 `***REDACTED***`。
    fn sanitize_string(s: &str, sensitive_fields: &[String]) -> String {
        let mut result = s.to_string();
        for field in sensitive_fields {
            // 查找 field= 模式，替换后续非空白字符
            let marker = format!("{}=", field.to_lowercase());
            result = Self::redact_after_marker(&result, &marker);
        }
        result
    }

    /// 在字符串中查找 marker，将其后的非空白字符替换为 ***REDACTED***
    ///
    /// 使用 char_indices 安全处理 UTF-8 多字节字符。
    fn redact_after_marker(s: &str, marker: &str) -> String {
        let lower = s.to_lowercase();
        let mut output = String::with_capacity(s.len());
        let mut matched_up_to: Option<usize> = None;

        for (idx, ch) in s.char_indices() {
            // 跳过已脱敏区域
            if let Some(end) = matched_up_to {
                if idx < end {
                    continue;
                }
                matched_up_to = None;
            }

            // 检查从当前位置开始是否匹配 marker（不区分大小写）
            if lower[idx..].starts_with(marker) {
                // 输出 marker 部分（保持原始大小写）
                output.push_str(&s[idx..idx + marker.len()]);
                let value_start = idx + marker.len();
                // 查找 value 结束位置（空白字符或字符串结尾）
                let value_end = s[value_start..]
                    .char_indices()
                    .find(|(_, c)| c.is_ascii_whitespace())
                    .map(|(wi, _)| value_start + wi)
                    .unwrap_or(s.len());
                output.push_str("***REDACTED***");
                matched_up_to = Some(value_end);
            } else {
                output.push(ch);
            }
        }
        output
    }
}

// ============================================================================
// Pipeline 组合器
// ============================================================================

/// 工具执行器 trait（实际执行逻辑的抽象）
#[async_trait]
pub trait ToolExecutor: Send + Sync {
    /// 执行工具
    async fn execute(&self, input: ToolInput, ctx: &ToolContext) -> CoreResult<ToolOutput>;
}

/// 工具管道
///
/// 组合多个拦截器形成处理链，按注册顺序执行 pre_execute，
/// 逆序执行 post_execute（类似 Tower 的 middleware 栈）。
pub struct ToolPipeline {
    interceptors: Vec<InterceptorRef>,
}

impl ToolPipeline {
    /// 创建空管道
    pub fn new() -> Self {
        Self {
            interceptors: Vec::new(),
        }
    }

    /// 添加拦截器（builder 风格）
    pub fn add(mut self, interceptor: impl ToolInterceptor + 'static) -> Self {
        self.interceptors.push(Arc::new(interceptor));
        self
    }

    /// 添加已包装的拦截器
    pub fn add_arc(mut self, interceptor: InterceptorRef) -> Self {
        self.interceptors.push(interceptor);
        self
    }

    /// 执行工具调用（完整流水线）
    pub async fn run(
        &self,
        input: ToolInput,
        ctx: &ToolContext,
        executor: &dyn ToolExecutor,
    ) -> CoreResult<ToolOutput> {
        // 1. Pre-execute 阶段（顺序执行）
        let mut processed_input = input.clone();
        for interceptor in &self.interceptors {
            processed_input = interceptor
                .pre_execute(processed_input, ctx)
                .await
                .map_err(|e| self.wrap_pre_error(e, &interceptor.name()))?;
        }

        // 2. Execute 阶段（带耗时统计）
        let start = Instant::now();
        let mut output = match executor.execute(processed_input.clone(), ctx).await {
            Ok(out) => out,
            Err(e) => {
                let tool_error = ToolError {
                    phase: ToolPhase::Execute,
                    code: ToolErrorCode::ExecutionFailed,
                    message: e.to_string(),
                    tool_name: processed_input.tool_name,
                    call_id: ctx.call_id.clone(),
                    retryable: true,
                };
                // 走错误处理链
                return Err(self.handle_error(tool_error, ctx).await.into_core_error());
            }
        };
        let elapsed_ms = start.elapsed().as_millis() as u64;
        output.elapsed_ms = elapsed_ms;

        // 3. Post-execute 阶段（逆序执行）
        for interceptor in self.interceptors.iter().rev() {
            output = interceptor
                .post_execute(output, ctx)
                .await
                .map_err(|e| self.wrap_post_error(e, &interceptor.name()))?;
        }

        Ok(output)
    }

    /// 获取拦截器数量
    pub fn interceptor_count(&self) -> usize {
        self.interceptors.len()
    }

    /// 获取拦截器名称列表
    pub fn interceptor_names(&self) -> Vec<&'static str> {
        self.interceptors.iter().map(|i| i.name()).collect()
    }

    // ---- 内部辅助 ----

    fn wrap_pre_error(&self, e: CoreError, interceptor_name: &str) -> CoreError {
        tracing::warn!(
            interceptor = interceptor_name,
            error = %e,
            "pre_execute_failed"
        );
        e
    }

    fn wrap_post_error(&self, e: CoreError, interceptor_name: &str) -> CoreError {
        tracing::warn!(
            interceptor = interceptor_name,
            error = %e,
            "post_execute_failed"
        );
        e
    }

    async fn handle_error(&self, mut error: ToolError, ctx: &ToolContext) -> ToolError {
        for interceptor in self.interceptors.iter().rev() {
            match interceptor.on_error(error.clone(), ctx).await {
                Ok(modified) => error = modified,
                Err(_) => break,
            }
        }
        error
    }
}

impl Default for ToolPipeline {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================================
// 便捷构造器
// ============================================================================

/// 创建标准管道（包含所有内置拦截器）
pub fn standard_pipeline() -> ToolPipeline {
    ToolPipeline::new()
        .add(PermissionAuditInterceptor::new())
        .add(ParameterValidationInterceptor::new())
        .add(ActivityLogInterceptor::new())
        .add(ErrorWrapInterceptor::new())
}

/// 创建只读管道（仅审计 + 错误包装，无权限校验）
pub fn read_only_pipeline() -> ToolPipeline {
    ToolPipeline::new()
        .add(ActivityLogInterceptor::new())
        .add(ErrorWrapInterceptor::new())
}

// ============================================================================
// 辅助函数
// ============================================================================

fn json_type_name(value: &Value) -> &'static str {
    match value {
        Value::Null => "null",
        Value::Bool(_) => "boolean",
        Value::Number(_) => "number",
        Value::String(_) => "string",
        Value::Array(_) => "array",
        Value::Object(_) => "object",
    }
}

// ============================================================================
// 测试
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    fn test_context() -> ToolContext {
        ToolContext {
            call_id: Uuid::new_v4().to_string(),
            thread_id: "thread-1".to_string(),
            turn_id: "turn-1".to_string(),
            session_id: Some("session-1".to_string()),
            caller: CallerIdentity::Agent,
            permission_level: PermissionLevel::Standard,
            metadata: HashMap::new(),
        }
    }

    fn test_executor() -> impl ToolExecutor {
        struct OkExecutor;
        #[async_trait]
        impl ToolExecutor for OkExecutor {
            async fn execute(
                &self,
                input: ToolInput,
                ctx: &ToolContext,
            ) -> CoreResult<ToolOutput> {
                Ok(ToolOutput::success(
                    input.tool_name,
                    &ctx.call_id,
                    serde_json::json!({"ok": true}),
                    0,
                ))
            }
        }
        OkExecutor
    }

    #[tokio::test]
    async fn empty_pipeline_passes_through() {
        let pipeline = ToolPipeline::new();
        let ctx = test_context();
        let input = ToolInput::new("test_tool", serde_json::json!({"key": "value"}));
        let executor = test_executor();

        let output = pipeline.run(input, &ctx, &executor).await.unwrap();
        assert!(output.success);
        assert_eq!(output.tool_name, "test_tool");
    }

    #[tokio::test]
    async fn permission_denied_for_blocked_tool() {
        let pipeline = ToolPipeline::new()
            .add(PermissionAuditInterceptor::new().block("dangerous_tool"));

        let ctx = test_context();
        let input = ToolInput::new("dangerous_tool", serde_json::json!({}));
        let executor = test_executor();

        let result = pipeline.run(input, &ctx, &executor).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn error_wrap_redacts_sensitive_fields() {
        let pipeline = ToolPipeline::new()
            .add(ErrorWrapInterceptor::new());

        let ctx = test_context();
        let input = ToolInput::new("test", serde_json::json!({}));

        // 模拟一个返回敏感信息的执行器
        struct SensitiveExecutor;
        #[async_trait]
        impl ToolExecutor for SensitiveExecutor {
            async fn execute(
                &self,
                input: ToolInput,
                ctx: &ToolContext,
            ) -> CoreResult<ToolOutput> {
                Ok(ToolOutput::failure(
                    input.tool_name,
                    &ctx.call_id,
                    "api_key=sk-12345 secret=my-secret",
                    0,
                ))
            }
        }

        let output = pipeline.run(input, &ctx, &SensitiveExecutor).await.unwrap();
        assert!(!output.success);
        let result_str = output.result.to_string();
        assert!(!result_str.contains("sk-12345"));
        assert!(!result_str.contains("my-secret"));
    }

    #[tokio::test]
    async fn interceptor_names_listed_correctly() {
        let pipeline = standard_pipeline();
        let names = pipeline.interceptor_names();
        assert_eq!(names.len(), 4);
        assert_eq!(names[0], "PermissionAudit");
        assert_eq!(names[1], "ParameterValidation");
        assert_eq!(names[2], "ActivityLog");
        assert_eq!(names[3], "ErrorWrap");
    }

    #[tokio::test]
    async fn tool_output_builder() {
        let output = ToolOutput::success(
            "read_file",
            "call-123",
            serde_json::json!({"content": "hello"}),
            42,
        )
        .with_summary("Read 1 file");

        assert!(output.success);
        assert_eq!(output.tool_name, "read_file");
        assert_eq!(output.call_id, "call-123");
        assert_eq!(output.elapsed_ms, 42);
        assert_eq!(output.summary.as_deref(), Some("Read 1 file"));
    }

    #[tokio::test]
    async fn tool_error_display() {
        let err = ToolError {
            phase: ToolPhase::PreExecute,
            code: ToolErrorCode::PermissionDenied,
            message: "Access denied".to_string(),
            tool_name: "bash".to_string(),
            call_id: "c1".to_string(),
            retryable: false,
        };
        let display = format!("{}", err);
        assert!(display.contains("permission_denied"));
        assert!(display.contains("bash"));
    }
}
