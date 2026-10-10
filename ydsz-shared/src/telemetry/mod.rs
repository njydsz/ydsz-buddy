//! # 遥测与指标系统
//!
//! 提供本地埋点计数 + 环形缓冲区 + Token/Cost 追踪能力。
//! 所有数据仅存本地内存（可选持久化到 SqliteEventStore），
//! 对齐 ZCode telemetry 的 8 类核心 Span:
//! agent_turn, agent_step, tool_execution, command_execution,
//! context_compaction, detached_operation, model_call, model_attempt.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Instant;

use parking_lot::Mutex;
use serde::{Deserialize, Serialize};

// ============================================================================
// Token Usage — Token 计量结构
// ============================================================================

/// 单次 LLM 调用的 token 计量
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenUsage {
    /// 输入 token 数（prompt）
    pub input_tokens: u64,
    /// 输出 token 数（completion）
    pub output_tokens: u64,
    /// 缓存命中 token 数（prompt cache hit）
    pub cached_input_tokens: u64,
    /// 估算成本（USD）
    pub cost_usd: f64,
}

impl TokenUsage {
    /// 创建零值
    pub fn zero() -> Self {
        Self { input_tokens: 0, output_tokens: 0, cached_input_tokens: 0, cost_usd: 0.0 }
    }

    /// 计算总 token 消耗
    pub fn total_tokens(&self) -> u64 {
        self.input_tokens + self.output_tokens
    }

    /// 计算实际收费 token (input - cached)
    pub fn billable_input_tokens(&self) -> u64 {
        self.input_tokens.saturating_sub(self.cached_input_tokens)
    }

    /// 累加另一个 TokenUsage
    pub fn add(&mut self, other: &TokenUsage) {
        self.input_tokens += other.input_tokens;
        self.output_tokens += other.output_tokens;
        self.cached_input_tokens += other.cached_input_tokens;
        self.cost_usd += other.cost_usd;
    }
}

impl Default for TokenUsage {
    fn default() -> Self {
        Self::zero()
    }
}

// ============================================================================
// 模型定价 — 按 Provider 和 Model 分列
// ============================================================================

/// 模型定价信息（per 1M tokens, USD）
#[derive(Debug, Clone)]
pub struct ModelPricing {
    pub provider: String,
    pub model: String,
    pub input_price_per_million: f64,
    pub output_price_per_million: f64,
    pub cached_input_price_per_million: f64,
}

impl ModelPricing {
    /// 计算给定 TokenUsage 的成本
    pub fn calculate_cost(&self, usage: &TokenUsage) -> f64 {
        let billable_input = usage.billable_input_tokens() as f64 / 1_000_000.0;
        let cached = usage.cached_input_tokens as f64 / 1_000_000.0;
        let output = usage.output_tokens as f64 / 1_000_000.0;

        billable_input * self.input_price_per_million
            + cached * self.cached_input_price_per_million
            + output * self.output_price_per_million
    }
}

/// 获取内置定价表（主要模型）
pub fn builtin_pricing_table() -> Vec<ModelPricing> {
    vec![
        // === Anthropic Claude ===
        ModelPricing { provider: "ClaudeAgent".into(), model: "claude-3-5-sonnet-20241022".into(), input_price_per_million: 3.0, output_price_per_million: 15.0, cached_input_price_per_million: 0.3 },
        ModelPricing { provider: "ClaudeAgent".into(), model: "claude-3-opus-20240229".into(), input_price_per_million: 15.0, output_price_per_million: 75.0, cached_input_price_per_million: 1.5 },
        ModelPricing { provider: "ClaudeAgent".into(), model: "claude-3-haiku-20240307".into(), input_price_per_million: 0.25, output_price_per_million: 1.25, cached_input_price_per_million: 0.03 },
        // === OpenAI ===
        ModelPricing { provider: "Codex".into(), model: "gpt-4o".into(), input_price_per_million: 2.5, output_price_per_million: 10.0, cached_input_price_per_million: 1.25 },
        ModelPricing { provider: "Codex".into(), model: "gpt-4o-mini".into(), input_price_per_million: 0.15, output_price_per_million: 0.6, cached_input_price_per_million: 0.075 },
        ModelPricing { provider: "Codex".into(), model: "o1-preview".into(), input_price_per_million: 15.0, output_price_per_million: 60.0, cached_input_price_per_million: 7.5 },
        // === DeepSeek ===
        ModelPricing { provider: "DeepSeek".into(), model: "deepseek-chat".into(), input_price_per_million: 0.27, output_price_per_million: 1.1, cached_input_price_per_million: 0.07 },
        ModelPricing { provider: "DeepSeek".into(), model: "deepseek-reasoner".into(), input_price_per_million: 0.55, output_price_per_million: 2.19, cached_input_price_per_million: 0.14 },
        // === Google Gemini ===
        ModelPricing { provider: "Gemini".into(), model: "gemini-1.5-pro".into(), input_price_per_million: 1.25, output_price_per_million: 5.0, cached_input_price_per_million: 0.31 },
        ModelPricing { provider: "Gemini".into(), model: "gemini-1.5-flash".into(), input_price_per_million: 0.075, output_price_per_million: 0.3, cached_input_price_per_million: 0.02 },
        // === xAI Grok ===
        ModelPricing { provider: "Grok".into(), model: "grok-2-1212".into(), input_price_per_million: 2.0, output_price_per_million: 10.0, cached_input_price_per_million: 0.5 },
    ]
}

/// 查找指定模型的定价
pub fn find_pricing<'a>(table: &'a [ModelPricing], provider: &str, model: &str) -> Option<&'a ModelPricing> {
    // 精确匹配
    if let Some(p) = table.iter().find(|p| p.provider == provider && p.model == model) {
        return Some(p);
    }
    // 模糊匹配（模型名前缀）
    table.iter().find(|p| p.provider == provider && model.starts_with(&p.model[..p.model.len().min(10)]))
}

// ============================================================================
// TelemetryCounters — 扩展 Token 计数器
// ============================================================================

/// 实时指标计数器
#[derive(Debug, Default)]
pub struct TelemetryCounters {
    pub provider_calls: AtomicU64,
    pub provider_errors: AtomicU64,
    pub tool_executions: AtomicU64,
    pub tool_errors: AtomicU64,
    pub approvals_granted: AtomicU64,
    pub approvals_denied: AtomicU64,
    pub security_blocks: AtomicU64,
    pub session_creations: AtomicU64,
    pub skill_body_loads: AtomicU64,
    // Token 追踪
    pub total_input_tokens: AtomicU64,
    pub total_output_tokens: AtomicU64,
    pub total_cached_tokens: AtomicU64,
    // Cost 累计（放大 10000 倍存储为 u64，即 0.0001 USD 精度）
    pub total_cost_milli_usd: AtomicU64,
}

impl TelemetryCounters {
    /// 记录 token 消耗
    pub fn record_tokens(&self, usage: &TokenUsage) {
        self.total_input_tokens.fetch_add(usage.input_tokens, Ordering::Relaxed);
        self.total_output_tokens.fetch_add(usage.output_tokens, Ordering::Relaxed);
        self.total_cached_tokens.fetch_add(usage.cached_input_tokens, Ordering::Relaxed);
        let cost_milli = (usage.cost_usd * 10000.0) as u64;
        self.total_cost_milli_usd.fetch_add(cost_milli, Ordering::Relaxed);
    }

    /// 获取累计 token usage
    pub fn token_usage(&self) -> TokenUsage {
        TokenUsage {
            input_tokens: self.total_input_tokens.load(Ordering::Relaxed),
            output_tokens: self.total_output_tokens.load(Ordering::Relaxed),
            cached_input_tokens: self.total_cached_tokens.load(Ordering::Relaxed),
            cost_usd: self.total_cost_milli_usd.load(Ordering::Relaxed) as f64 / 10000.0,
        }
    }
}

// ============================================================================
// TelemetryEvent — 扩展 ProviderCall 含 TokenUsage
// ============================================================================

/// 遥测事件类型
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TelemetryEvent {
    /// Provider 调用（含 Token 计量）
    ProviderCall {
        provider: String,
        model: String,
        elapsed_ms: u64,
        success: bool,
        error: Option<String>,
        #[serde(default)]
        usage: Option<TokenUsage>,
    },
    /// 工具执行
    ToolExecution {
        tool_name: String,
        elapsed_ms: u64,
        success: bool,
    },
    /// 审批事件
    Approval {
        request_id: String,
        approved: bool,
        wait_ms: u64,
    },
    /// 安全拒绝
    SecurityBlock {
        reason: String,
        tool_name: Option<String>,
        path: Option<String>,
    },
    /// Extension/Skill/MCP 状态变化
    PluginLifecycle {
        plugin_kind: String,
        name: String,
        action: String,
    },
    /// 会话生命周期
    Session {
        action: String,
        thread_id: String,
    },
    /// 上下文压缩
    ContextCompaction {
        session_id: String,
        turns_compressed: u32,
        tokens_before: u64,
        tokens_after: u64,
    },
    /// 通用 Span（对齐 ZCode 遥测模型）
    Span {
        name: String,
        elapsed_ms: u64,
        attributes: HashMap<String, String>,
    },
}

// ============================================================================
// TelemetryCollector
// ============================================================================

/// 轻量级遥测收集器
#[derive(Debug, Clone)]
pub struct TelemetryCollector {
    counters: Arc<TelemetryCounters>,
    recent_events: Arc<Mutex<Vec<(String, TelemetryEvent)>>>,
    buffer_capacity: usize,
    pricing_table: Arc<Vec<ModelPricing>>,
}

impl TelemetryCollector {
    pub fn new() -> Self {
        Self {
            counters: Arc::new(TelemetryCounters::default()),
            recent_events: Arc::new(Mutex::new(Vec::with_capacity(200))),
            buffer_capacity: 200,
            pricing_table: Arc::new(builtin_pricing_table()),
        }
    }

    /// 使用自定义定价表
    pub fn with_pricing_table(pricing: Vec<ModelPricing>) -> Self {
        Self {
            counters: Arc::new(TelemetryCounters::default()),
            recent_events: Arc::new(Mutex::new(Vec::with_capacity(200))),
            buffer_capacity: 200,
            pricing_table: Arc::new(pricing),
        }
    }

    /// 计算 TokenUsage（含自动定价）
    pub fn calculate_usage(&self, provider: &str, model: &str, input_tokens: u64, output_tokens: u64, cached_tokens: u64) -> TokenUsage {
        let mut usage = TokenUsage {
            input_tokens,
            output_tokens,
            cached_input_tokens: cached_tokens,
            cost_usd: 0.0,
        };
        if let Some(pricing) = find_pricing(&self.pricing_table, provider, model) {
            usage.cost_usd = pricing.calculate_cost(&usage);
        }
        usage
    }

    /// 记录一个遥测事件
    pub fn record(&self, event: TelemetryEvent) {
        match &event {
            TelemetryEvent::ProviderCall { success, usage, .. } => {
                self.counters.provider_calls.fetch_add(1, Ordering::Relaxed);
                if !*success {
                    self.counters.provider_errors.fetch_add(1, Ordering::Relaxed);
                }
                if let Some(u) = usage {
                    self.counters.record_tokens(u);
                }
            }
            TelemetryEvent::ToolExecution { success, .. } => {
                self.counters.tool_executions.fetch_add(1, Ordering::Relaxed);
                if !*success {
                    self.counters.tool_errors.fetch_add(1, Ordering::Relaxed);
                }
            }
            TelemetryEvent::Approval { approved, .. } => {
                if *approved {
                    self.counters.approvals_granted.fetch_add(1, Ordering::Relaxed);
                } else {
                    self.counters.approvals_denied.fetch_add(1, Ordering::Relaxed);
                }
            }
            TelemetryEvent::SecurityBlock { .. } => {
                self.counters.security_blocks.fetch_add(1, Ordering::Relaxed);
            }
            TelemetryEvent::Session { action, .. } => {
                if action == "create" {
                    self.counters.session_creations.fetch_add(1, Ordering::Relaxed);
                }
            }
            TelemetryEvent::PluginLifecycle { action, .. } => {
                if action == "load_body" {
                    self.counters.skill_body_loads.fetch_add(1, Ordering::Relaxed);
                }
            }
            _ => {}
        }

        let mut buf = self.recent_events.lock();
        let ts = chrono::Utc::now().to_rfc3339();
        buf.push((ts, event));
        if buf.len() > self.buffer_capacity {
            buf.remove(0);
        }
    }

    /// 获取计数器快照（含 Token/Cost）
    pub fn snapshot_counters(&self) -> HashMap<String, u64> {
        let mut map = HashMap::new();
        macro_rules! insert {
            ($key:expr, $field:ident) => {
                map.insert($key.into(), self.counters.$field.load(Ordering::Relaxed));
            };
        }
        insert!("provider_calls", provider_calls);
        insert!("provider_errors", provider_errors);
        insert!("tool_executions", tool_executions);
        insert!("tool_errors", tool_errors);
        insert!("approvals_granted", approvals_granted);
        insert!("approvals_denied", approvals_denied);
        insert!("security_blocks", security_blocks);
        insert!("session_creations", session_creations);
        insert!("skill_body_loads", skill_body_loads);
        insert!("total_input_tokens", total_input_tokens);
        insert!("total_output_tokens", total_output_tokens);
        insert!("total_cached_tokens", total_cached_tokens);
        map
    }

    /// 获取累计 Token 使用
    pub fn total_token_usage(&self) -> TokenUsage {
        self.counters.token_usage()
    }

    /// 获取最近 N 条事件
    pub fn recent_events(&self, limit: usize) -> Vec<(String, TelemetryEvent)> {
        let buf = self.recent_events.lock();
        let start = buf.len().saturating_sub(limit);
        buf[start..].to_vec()
    }

    /// 计算 Provider 健康度分数 (0-100)
    pub fn provider_health_score(&self) -> f64 {
        let calls = self.counters.provider_calls.load(Ordering::Relaxed);
        let errors = self.counters.provider_errors.load(Ordering::Relaxed);
        if calls == 0 { return 100.0; }
        ((calls - errors) as f64 / calls as f64) * 100.0
    }

    /// 计算工具执行成功率 (0-100)
    pub fn tool_success_rate(&self) -> f64 {
        let total = self.counters.tool_executions.load(Ordering::Relaxed);
        let errors = self.counters.tool_errors.load(Ordering::Relaxed);
        if total == 0 { return 100.0; }
        ((total - errors) as f64 / total as f64) * 100.0
    }

    /// 计算平均每次调用的 token 消耗
    pub fn avg_tokens_per_call(&self) -> f64 {
        let calls = self.counters.provider_calls.load(Ordering::Relaxed);
        if calls == 0 { return 0.0; }
        let total = self.counters.total_input_tokens.load(Ordering::Relaxed)
            + self.counters.total_output_tokens.load(Ordering::Relaxed);
        total as f64 / calls as f64
    }

    /// 计算平均每次调用成本 (USD)
    pub fn avg_cost_per_call(&self) -> f64 {
        let calls = self.counters.provider_calls.load(Ordering::Relaxed);
        if calls == 0 { return 0.0; }
        self.counters.token_usage().cost_usd / calls as f64
    }

    /// 重置所有计数器
    pub fn reset_counters(&self) {
        self.counters.provider_calls.store(0, Ordering::Relaxed);
        self.counters.provider_errors.store(0, Ordering::Relaxed);
        self.counters.tool_executions.store(0, Ordering::Relaxed);
        self.counters.tool_errors.store(0, Ordering::Relaxed);
        self.counters.approvals_granted.store(0, Ordering::Relaxed);
        self.counters.approvals_denied.store(0, Ordering::Relaxed);
        self.counters.security_blocks.store(0, Ordering::Relaxed);
        self.counters.session_creations.store(0, Ordering::Relaxed);
        self.counters.skill_body_loads.store(0, Ordering::Relaxed);
        self.counters.total_input_tokens.store(0, Ordering::Relaxed);
        self.counters.total_output_tokens.store(0, Ordering::Relaxed);
        self.counters.total_cached_tokens.store(0, Ordering::Relaxed);
        self.counters.total_cost_milli_usd.store(0, Ordering::Relaxed);
        self.recent_events.lock().clear();
    }

    /// 获取定价表引用
    pub fn pricing_table(&self) -> &[ModelPricing] {
        &self.pricing_table
    }
}

impl Default for TelemetryCollector {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================================
// ProviderCallTimer — RAII 计时器 (含 Token 追踪)
// ============================================================================

/// Provider 调用计时器（RAII 模式）
pub struct ProviderCallTimer {
    collector: TelemetryCollector,
    provider: String,
    model: String,
    start: Instant,
}

impl ProviderCallTimer {
    pub fn start(
        collector: &TelemetryCollector,
        provider: impl Into<String>,
        model: impl Into<String>,
    ) -> Self {
        Self {
            collector: collector.clone(),
            provider: provider.into(),
            model: model.into(),
            start: Instant::now(),
        }
    }

    /// 结束计时并记录（含 token 使用）
    pub fn finish_with_usage(self, success: bool, error: Option<String>, usage: Option<TokenUsage>) {
        let elapsed = self.start.elapsed().as_millis() as u64;
        self.collector.record(TelemetryEvent::ProviderCall {
            provider: self.provider.clone(),
            model: self.model.clone(),
            elapsed_ms: elapsed,
            success,
            error,
            usage,
        });
    }

    /// 结束计时（无 token 使用信息）
    pub fn finish(self, success: bool, error: Option<String>) {
        self.finish_with_usage(success, error, None);
    }

    /// 结束计时（自动计算成本）
    pub fn finish_with_tokens(self, success: bool, error: Option<String>, input_tokens: u64, output_tokens: u64, cached_tokens: u64) {
        let usage = self.collector.calculate_usage(&self.provider, &self.model, input_tokens, output_tokens, cached_tokens);
        self.finish_with_usage(success, error, Some(usage));
    }
}

// ============================================================================
// 单元测试
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn token_usage_zero() {
        let u = TokenUsage::zero();
        assert_eq!(u.total_tokens(), 0);
        assert_eq!(u.cost_usd, 0.0);
    }

    #[test]
    fn token_usage_add() {
        let mut a = TokenUsage { input_tokens: 100, output_tokens: 50, cached_input_tokens: 20, cost_usd: 0.01 };
        let b = TokenUsage { input_tokens: 200, output_tokens: 100, cached_input_tokens: 30, cost_usd: 0.02 };
        a.add(&b);
        assert_eq!(a.input_tokens, 300);
        assert_eq!(a.output_tokens, 150);
        assert_eq!(a.cached_input_tokens, 50);
        assert_eq!(a.cost_usd, 0.03);
    }

    #[test]
    fn billable_input_tokens() {
        let u = TokenUsage { input_tokens: 1000, output_tokens: 500, cached_input_tokens: 300, cost_usd: 0.0 };
        assert_eq!(u.billable_input_tokens(), 700);
    }

    #[test]
    fn model_pricing_calculation() {
        let pricing = ModelPricing {
            provider: "TestProvider".into(),
            model: "test-model".into(),
            input_price_per_million: 3.0,
            output_price_per_million: 15.0,
            cached_input_price_per_million: 0.3,
        };
        let usage = TokenUsage { input_tokens: 1_000_000, output_tokens: 500_000, cached_input_tokens: 200_000, cost_usd: 0.0 };
        let cost = pricing.calculate_cost(&usage);
        // 800K billable input * $3/M + 200K cached * $0.3/M + 500K output * $15/M
        assert!(cost > 0.0);
        assert!(cost < 100.0);  // sanity
    }

    #[test]
    fn builtin_pricing_not_empty() {
        let table = builtin_pricing_table();
        assert!(table.len() >= 10);
    }

    #[test]
    fn find_pricing_exact() {
        let table = builtin_pricing_table();
        let found = find_pricing(&table, "DeepSeek", "deepseek-chat");
        assert!(found.is_some());
        assert_eq!(found.unwrap().input_price_per_million, 0.27);
    }

    #[test]
    fn telemetry_collector_records_tokens() {
        let collector = TelemetryCollector::new();
        let usage = collector.calculate_usage("DeepSeek", "deepseek-chat", 1000, 500, 200);
        collector.record(TelemetryEvent::ProviderCall {
            provider: "DeepSeek".into(),
            model: "deepseek-chat".into(),
            elapsed_ms: 1200,
            success: true,
            error: None,
            usage: Some(usage.clone()),
        });

        let total = collector.total_token_usage();
        assert_eq!(total.input_tokens, 1000);
        assert_eq!(total.output_tokens, 500);
        assert_eq!(total.cached_input_tokens, 200);
        assert!(total.cost_usd > 0.0);
    }

    #[test]
    fn provider_call_timer() {
        let collector = TelemetryCollector::new();
        let timer = ProviderCallTimer::start(&collector, "ClaudeAgent", "claude-3-5-sonnet-20241022");
        timer.finish_with_tokens(true, None, 2000, 800, 500);

        let total = collector.total_token_usage();
        assert_eq!(total.input_tokens, 2000);
        assert_eq!(total.output_tokens, 800);
        let snapshot = collector.snapshot_counters();
        assert_eq!(snapshot["provider_calls"], 1);
    }

    #[test]
    fn avg_calculations() {
        let collector = TelemetryCollector::new();
        collector.record(TelemetryEvent::ProviderCall {
            provider: "Test".into(), model: "test".into(),
            elapsed_ms: 100, success: true, error: None,
            usage: Some(TokenUsage { input_tokens: 1000, output_tokens: 500, cached_input_tokens: 0, cost_usd: 0.01 }),
        });
        collector.record(TelemetryEvent::ProviderCall {
            provider: "Test".into(), model: "test".into(),
            elapsed_ms: 200, success: true, error: None,
            usage: Some(TokenUsage { input_tokens: 3000, output_tokens: 1000, cached_input_tokens: 500, cost_usd: 0.03 }),
        });

        assert_eq!(collector.avg_tokens_per_call(), 2750.0);
        assert_eq!(collector.avg_cost_per_call(), 0.02);
    }

    #[test]
    fn reset_counters() {
        let collector = TelemetryCollector::new();
        collector.record(TelemetryEvent::Session { action: "create".into(), thread_id: "t1".into() });
        collector.record(TelemetryEvent::ProviderCall {
            provider: "Test".into(), model: "test".into(),
            elapsed_ms: 100, success: false, error: Some("err".into()),
            usage: Some(TokenUsage { input_tokens: 100, output_tokens: 50, cached_input_tokens: 10, cost_usd: 0.001 }),
        });

        collector.reset_counters();
        let snap = collector.snapshot_counters();
        assert_eq!(snap["session_creations"], 0);
        assert_eq!(snap["provider_calls"], 0);
        let total = collector.total_token_usage();
        assert_eq!(total.total_tokens(), 0);
    }
}
