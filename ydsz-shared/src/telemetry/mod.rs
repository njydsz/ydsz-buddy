//! # 遥测与指标系统
//!
//! 提供本地埋点计数 + 环形缓冲区能力。所有数据仅存本地内存（可选持久化到 SqliteEventStore），
//! 不依赖外部遥测服务（PostHog/OTel），符合全程可追溯定位。

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Instant;

use parking_lot::Mutex;
use serde::{Deserialize, Serialize};

/// 遥测事件类型
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TelemetryEvent {
    /// Provider 调用
    ProviderCall {
        provider: String,
        model: String,
        elapsed_ms: u64,
        success: bool,
        error: Option<String>,
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
}

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
}

/// 轻量级遥测收集器
#[derive(Debug, Clone)]
pub struct TelemetryCollector {
    counters: Arc<TelemetryCounters>,
    recent_events: Arc<Mutex<Vec<(String, TelemetryEvent)>>>,
    buffer_capacity: usize,
}

impl TelemetryCollector {
    pub fn new() -> Self {
        Self {
            counters: Arc::new(TelemetryCounters::default()),
            recent_events: Arc::new(Mutex::new(Vec::with_capacity(200))),
            buffer_capacity: 200,
        }
    }

    /// 记录一个遥测事件
    pub fn record(&self, event: TelemetryEvent) {
        match &event {
            TelemetryEvent::ProviderCall { success, .. } => {
                self.counters.provider_calls.fetch_add(1, Ordering::Relaxed);
                if !*success {
                    self.counters.provider_errors.fetch_add(1, Ordering::Relaxed);
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
        }

        let mut buf = self.recent_events.lock();
        let ts = chrono::Utc::now().to_rfc3339();
        buf.push((ts, event));
        if buf.len() > self.buffer_capacity {
            buf.remove(0);
        }
    }

    /// 获取计数器快照
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
        map
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
        self.recent_events.lock().clear();
    }
}

impl Default for TelemetryCollector {
    fn default() -> Self {
        Self::new()
    }
}

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

    pub fn finish(self, success: bool, error: Option<String>) {
        let elapsed = self.start.elapsed().as_millis() as u64;
        self.collector.record(TelemetryEvent::ProviderCall {
            provider: self.provider,
            model: self.model,
            elapsed_ms: elapsed,
            success,
            error,
        });
    }
}
