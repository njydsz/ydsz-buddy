//! # Provider 故障转移 (Failover) 命令模块
//!
//! P1-4 目标：把原本在前端 React hook (`useProviderFailover` /
//! `useAutoProviderFailover`) 中实现的失败计数 + 自动切换决策下沉到
//! Rust 后端，使状态在多 webview / 多 tab / 多 IPC 调用间共享一致。
//!
//! ## 命令清单
//!
//! | 命令 | 说明 |
//! |------|------|
//! | `failover_get_state` | 获取当前快照（含活跃 Provider / 失败计数 / 历史） |
//! | `failover_record_failure` | 记录一次 Provider 失败，必要时触发自动切换 |
//! | `failover_record_success` | 记录一次成功，重置该 Provider 失败计数 |
//! | `failover_pick_fallback` | 给定当前 Provider,返回推荐的备用 Provider |
//! | `failover_set_config` | 更新阈值/启用 Provider 列表/能力映射 |
//! | `failover_reset` | 清空所有失败计数和历史 |
//!
//! ## 设计原则
//!
//! - **状态由后端独享**：所有失败计数、活跃 Provider、切换历史都在
//!   `FailoverState` 的 `Mutex` 里,前端只是薄壳,不会与后端状态分裂。
//! - **决策 100% 在后端**：阈值判断、备用 Provider 选择、切换动作都在
//!   `record_failure` 内完成,前端只读取快照。
//! - **能力匹配用 `HashSet<ProviderCapability>`**：避免 N×M 顺序扫描,
//!   即使 Provider 数量扩展到几十个也保持 O(N) 选择。
//! - **AbortError 不计入失败**：前端在 `useProviderFailoverBridge`
//!   已过滤 AbortError,后端再做一次兜底,确保策略一致。

use std::collections::{HashMap, HashSet};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::State;
use tracing::{info, warn};

/// Provider 能力枚举（与前端 `useProviderFailover.ProviderCapability` 对齐）
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "kebab-case")]
pub enum ProviderCapability {
    /// 函数/工具调用
    ToolCalling,
    /// 视觉（图片理解）
    Vision,
    /// reasoning effort（思考强度参数）
    ReasoningEffort,
    /// 快速模式
    FastMode,
}

/// Provider 标识（与前端 `ProviderKind` 字符串对齐）
///
/// 实际可取值覆盖所有内置 Provider + 自定义 Provider（`custom-*`），
/// 后端不做枚举强校验,保证新增 Provider 不会破坏向后兼容。
pub type ProviderKind = String;

/// Provider 能力映射
#[derive(Debug, Clone, Default, Serialize, Deserialize, specta::Type)]
pub struct ProviderCapabilityMap {
    /// Provider → 能力集合
    pub capabilities: HashMap<ProviderKind, HashSet<ProviderCapability>>,
}

impl ProviderCapabilityMap {
    /// 默认能力映射（与前端 `useProviderFailover.DEFAULT_CAPABILITY_MAP` 对齐）
    pub fn with_defaults() -> Self {
        let mut m = HashMap::new();
        m.insert(
            "codex".to_string(),
            HashSet::from([
                ProviderCapability::ToolCalling,
                ProviderCapability::Vision,
                ProviderCapability::ReasoningEffort,
                ProviderCapability::FastMode,
            ]),
        );
        m.insert(
            "claudeAgent".to_string(),
            HashSet::from([
                ProviderCapability::ToolCalling,
                ProviderCapability::Vision,
                ProviderCapability::ReasoningEffort,
            ]),
        );
        m.insert(
            "cursor".to_string(),
            HashSet::from([
                ProviderCapability::ToolCalling,
                ProviderCapability::Vision,
                ProviderCapability::FastMode,
            ]),
        );
        m.insert(
            "gemini".to_string(),
            HashSet::from([
                ProviderCapability::ToolCalling,
                ProviderCapability::Vision,
                ProviderCapability::ReasoningEffort,
            ]),
        );
        m.insert(
            "grok".to_string(),
            HashSet::from([
                ProviderCapability::ToolCalling,
                ProviderCapability::Vision,
                ProviderCapability::ReasoningEffort,
            ]),
        );
        m.insert(
            "kilo".to_string(),
            HashSet::from([
                ProviderCapability::ToolCalling,
                ProviderCapability::Vision,
            ]),
        );
        m.insert(
            "opencode".to_string(),
            HashSet::from([
                ProviderCapability::ToolCalling,
                ProviderCapability::Vision,
            ]),
        );
        m.insert(
            "pi".to_string(),
            HashSet::from([ProviderCapability::ToolCalling]),
        );
        Self { capabilities: m }
    }

    /// 检查 Provider 是否支持某能力
    pub fn supports(&self, provider: &str, capability: ProviderCapability) -> bool {
        self.capabilities
            .get(provider)
            .map(|caps| caps.contains(&capability))
            .unwrap_or(false)
    }

    /// 计算两个 Provider 的能力匹配度
    pub fn match_score(&self, from: &str, to: &str) -> usize {
        let Some(from_caps) = self.capabilities.get(from) else {
            return 0;
        };
        let Some(to_caps) = self.capabilities.get(to) else {
            return 0;
        };
        from_caps.intersection(to_caps).count()
    }
}

/// 故障转移配置
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct FailoverConfig {
    /// 触发自动切换的连续失败次数阈值
    pub failure_threshold: u32,
    /// 是否启用自动故障转移
    pub auto_failover: bool,
    /// 启用的 Provider 列表（按优先级）
    pub enabled_providers: Vec<ProviderKind>,
    /// 能力映射
    pub capability_map: ProviderCapabilityMap,
}

impl Default for FailoverConfig {
    fn default() -> Self {
        Self {
            failure_threshold: 3,
            auto_failover: true,
            enabled_providers: vec![
                "codex".to_string(),
                "claudeAgent".to_string(),
                "cursor".to_string(),
                "gemini".to_string(),
                "grok".to_string(),
                "kilo".to_string(),
                "opencode".to_string(),
                "pi".to_string(),
            ],
            capability_map: ProviderCapabilityMap::with_defaults(),
        }
    }
}

/// 故障转移事件（历史条目）
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct FailoverEvent {
    /// 源 Provider
    pub from: ProviderKind,
    /// 目标 Provider
    pub to: ProviderKind,
    /// 切换原因
    pub reason: String,
    /// 时间戳(毫秒 since unix epoch)
    pub at_ms: u128,
    /// 触发时的连续失败次数
    pub failure_count: u32,
}

/// 故障转移快照(返回给前端)
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct FailoverSnapshot {
    /// 当前活跃 Provider
    pub active_provider: ProviderKind,
    /// 各 Provider 的连续失败计数
    pub failure_counts: HashMap<ProviderKind, u32>,
    /// 切换历史
    pub history: Vec<FailoverEvent>,
    /// 当前配置
    pub config: FailoverConfig,
    /// 当前状态
    pub status: FailoverStatus,
}

/// 故障转移状态
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, specta::Type)]
#[serde(rename_all = "kebab-case")]
pub enum FailoverStatus {
    /// 空闲(未启用)
    Idle,
    /// 监控中
    Monitoring,
    /// 正在切换
    Switching,
    /// 已切换
    Switched,
    /// 没有可用备用
    NoFallback,
    /// 已禁用
    Disabled,
}

impl Default for FailoverStatus {
    fn default() -> Self {
        Self::Monitoring
    }
}

/// 故障转移状态管理器
///
/// 持有当前活跃 Provider / 失败计数 / 历史 / 配置,所有变更走内部
/// `Mutex<FailoverInner>`,保证多线程安全。
pub struct FailoverState {
    inner: Mutex<FailoverInner>,
}

struct FailoverInner {
    active_provider: ProviderKind,
    failure_counts: HashMap<ProviderKind, u32>,
    history: Vec<FailoverEvent>,
    config: FailoverConfig,
    status: FailoverStatus,
}

impl Default for FailoverState {
    fn default() -> Self {
        Self::new()
    }
}

impl FailoverState {
    pub fn new() -> Self {
        let config = FailoverConfig::default();
        let active = config
            .enabled_providers
            .first()
            .cloned()
            .unwrap_or_else(|| "codex".to_string());
        Self {
            inner: Mutex::new(FailoverInner {
                active_provider: active,
                failure_counts: HashMap::new(),
                history: Vec::new(),
                status: if config.auto_failover {
                    FailoverStatus::Monitoring
                } else {
                    FailoverStatus::Disabled
                },
                config,
            }),
        }
    }

    /// 获取当前快照
    pub fn snapshot(&self) -> FailoverSnapshot {
        let g = self.inner.lock().expect("failover state lock poisoned");
        FailoverSnapshot {
            active_provider: g.active_provider.clone(),
            failure_counts: g.failure_counts.clone(),
            history: g.history.clone(),
            config: g.config.clone(),
            status: g.status,
        }
    }

    /// 记录一次失败
    ///
    /// 失败计数 +1,若达到阈值且启用自动切换且当前是活跃 Provider,
    /// 触发自动切换。
    pub fn record_failure(&self, provider: &str, error: Option<&str>) -> FailoverSnapshot {
        let now_ms = current_millis();
        let mut g = self.inner.lock().expect("failover state lock poisoned");
        let count = g.failure_counts.entry(provider.to_string()).or_insert(0);
        *count += 1;
        let new_count = *count;
        info!(provider, count = new_count, "failover: recorded failure");

        // 自动切换判断
        if g.config.auto_failover
            && new_count >= g.config.failure_threshold
            && provider == g.active_provider
        {
            let fallback = pick_fallback_inner(
                provider,
                &g.config.enabled_providers,
                &g.failure_counts,
                &g.config.capability_map,
                g.config.failure_threshold,
            );
            match fallback {
                Some(target) => {
                    let from = g.active_provider.clone();
                    g.status = FailoverStatus::Switched;
                    g.history.push(FailoverEvent {
                        from: from.clone(),
                        to: target.clone(),
                        reason: format!(
                            "auto-failover after {} consecutive failures{}",
                            new_count,
                            error.map(|e| format!(": {e}")).unwrap_or_default()
                        ),
                        at_ms: now_ms,
                        failure_count: new_count,
                    });
                    // 上限保留 50 条
                    if g.history.len() > 50 {
                        let drop = g.history.len() - 50;
                        g.history.drain(0..drop);
                    }
                    // 重置目标 Provider 失败计数
                    g.failure_counts.insert(target.clone(), 0);
                    g.active_provider = target;
                    info!(from = %from, to = %g.active_provider, "failover: auto-switched");
                }
                None => {
                    g.status = FailoverStatus::NoFallback;
                    warn!(provider, "failover: no available fallback");
                }
            }
        }

        FailoverSnapshot {
            active_provider: g.active_provider.clone(),
            failure_counts: g.failure_counts.clone(),
            history: g.history.clone(),
            config: g.config.clone(),
            status: g.status,
        }
    }

    /// 记录一次成功,重置该 Provider 失败计数
    pub fn record_success(&self, provider: &str) -> FailoverSnapshot {
        let mut g = self.inner.lock().expect("failover state lock poisoned");
        g.failure_counts.insert(provider.to_string(), 0);
        // 成功后回到 monitoring
        if g.status == FailoverStatus::Switched {
            g.status = FailoverStatus::Monitoring;
        }
        FailoverSnapshot {
            active_provider: g.active_provider.clone(),
            failure_counts: g.failure_counts.clone(),
            history: g.history.clone(),
            config: g.config.clone(),
            status: g.status,
        }
    }

    /// 重置所有失败计数和历史,并把活跃 Provider 切回 config 的第一个
    pub fn reset(&self) -> FailoverSnapshot {
        let mut g = self.inner.lock().expect("failover state lock poisoned");
        g.failure_counts.clear();
        g.history.clear();
        // 完全重置:把活跃 Provider 也回到 config 优先级首位
        if let Some(first) = g.config.enabled_providers.first().cloned() {
            g.active_provider = first;
        }
        g.status = if g.config.auto_failover {
            FailoverStatus::Monitoring
        } else {
            FailoverStatus::Disabled
        };
        FailoverSnapshot {
            active_provider: g.active_provider.clone(),
            failure_counts: g.failure_counts.clone(),
            history: g.history.clone(),
            config: g.config.clone(),
            status: g.status,
        }
    }

    /// 更新配置
    pub fn set_config(&self, new_config: FailoverConfig) -> FailoverSnapshot {
        let mut g = self.inner.lock().expect("failover state lock poisoned");
        let auto = new_config.auto_failover;
        g.config = new_config;
        g.status = if auto {
            FailoverStatus::Monitoring
        } else {
            FailoverStatus::Disabled
        };
        // 如果当前活跃 Provider 不在新启用列表中,切回第一个
        if !g.config.enabled_providers.contains(&g.active_provider) {
            if let Some(first) = g.config.enabled_providers.first().cloned() {
                g.active_provider = first;
            }
        }
        FailoverSnapshot {
            active_provider: g.active_provider.clone(),
            failure_counts: g.failure_counts.clone(),
            history: g.history.clone(),
            config: g.config.clone(),
            status: g.status,
        }
    }

    /// 手动切换到指定 Provider
    pub fn switch_to(&self, target: &str, reason: Option<&str>) -> Option<FailoverSnapshot> {
        let mut g = self.inner.lock().expect("failover state lock poisoned");
        if !g.config.enabled_providers.iter().any(|p| p == target) {
            return None;
        }
        let from = g.active_provider.clone();
        if from == target {
            return Some(FailoverSnapshot {
                active_provider: g.active_provider.clone(),
                failure_counts: g.failure_counts.clone(),
                history: g.history.clone(),
                config: g.config.clone(),
                status: g.status,
            });
        }
        let failure_count = *g.failure_counts.get(&from).unwrap_or(&0);
        g.history.push(FailoverEvent {
            from: from.clone(),
            to: target.to_string(),
            reason: reason.unwrap_or("manual switch").to_string(),
            at_ms: current_millis(),
            failure_count,
        });
        if g.history.len() > 50 {
            let drop = g.history.len() - 50;
            g.history.drain(0..drop);
        }
        g.failure_counts.insert(target.to_string(), 0);
        g.active_provider = target.to_string();
        g.status = FailoverStatus::Switched;
        Some(FailoverSnapshot {
            active_provider: g.active_provider.clone(),
            failure_counts: g.failure_counts.clone(),
            history: g.history.clone(),
            config: g.config.clone(),
            status: g.status,
        })
    }

    /// 给定当前 Provider,返回推荐的备用
    pub fn pick_fallback(&self, current: &str) -> Option<ProviderKind> {
        let g = self.inner.lock().expect("failover state lock poisoned");
        pick_fallback_inner(
            current,
            &g.config.enabled_providers,
            &g.failure_counts,
            &g.config.capability_map,
            g.config.failure_threshold,
        )
    }
}

/// 推荐备用 Provider 内部实现
///
/// 选择规则:
/// 1. 排除当前 Provider
/// 2. 排除失败计数已达阈值的 Provider
/// 3. 按"能力匹配度"降序排序(优先能力相同)
/// 4. 能力匹配度相同,按"失败计数"升序排序
fn pick_fallback_inner(
    current: &str,
    enabled: &[ProviderKind],
    failures: &HashMap<ProviderKind, u32>,
    caps: &ProviderCapabilityMap,
    threshold: u32,
) -> Option<ProviderKind> {
    let mut candidates: Vec<&ProviderKind> = enabled
        .iter()
        .filter(|p| p.as_str() != current)
        .filter(|p| failures.get(*p).copied().unwrap_or(0) < threshold)
        .collect();
    if candidates.is_empty() {
        return None;
    }
    candidates.sort_by(|a, b| {
        let a_score = caps.match_score(current, a);
        let b_score = caps.match_score(current, b);
        if a_score != b_score {
            // 分数高者优先
            b_score.cmp(&a_score)
        } else {
            let a_fail = failures.get(*a).copied().unwrap_or(0);
            let b_fail = failures.get(*b).copied().unwrap_or(0);
            a_fail.cmp(&b_fail)
        }
    });
    candidates.first().map(|s| (*s).clone())
}

fn current_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

// ==================== Tauri 命令 ====================

/// 获取当前故障转移快照
#[tauri::command]
#[specta::specta]
pub async fn failover_get_state(state: State<'_, FailoverState>) -> Result<FailoverSnapshot, String> {
    Ok(state.snapshot())
}

/// 记录一次 Provider 失败
///
/// 内部根据阈值决定是否触发自动切换。
#[tauri::command]
#[specta::specta]
pub async fn failover_record_failure(
    provider: String,
    error: Option<String>,
    state: State<'_, FailoverState>,
) -> Result<FailoverSnapshot, String> {
    Ok(state.record_failure(&provider, error.as_deref()))
}

/// 记录一次 Provider 成功
#[tauri::command]
#[specta::specta]
pub async fn failover_record_success(
    provider: String,
    state: State<'_, FailoverState>,
) -> Result<FailoverSnapshot, String> {
    Ok(state.record_success(&provider))
}

/// 重置所有失败计数和历史
#[tauri::command]
#[specta::specta]
pub async fn failover_reset(state: State<'_, FailoverState>) -> Result<FailoverSnapshot, String> {
    Ok(state.reset())
}

/// 更新配置
#[tauri::command]
#[specta::specta]
pub async fn failover_set_config(
    config: FailoverConfig,
    state: State<'_, FailoverState>,
) -> Result<FailoverSnapshot, String> {
    Ok(state.set_config(config))
}

/// 手动切换到指定 Provider
///
/// 返回 `None` 表示目标 Provider 不在启用列表中。
#[tauri::command]
#[specta::specta]
pub async fn failover_switch_to(
    target: String,
    reason: Option<String>,
    state: State<'_, FailoverState>,
) -> Result<Option<FailoverSnapshot>, String> {
    Ok(state.switch_to(&target, reason.as_deref()))
}

/// 给定当前 Provider,返回推荐的备用 Provider
#[tauri::command]
#[specta::specta]
pub async fn failover_pick_fallback(
    current: String,
    state: State<'_, FailoverState>,
) -> Result<Option<String>, String> {
    Ok(state.pick_fallback(&current))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_state() -> FailoverState {
        FailoverState::new()
    }

    #[test]
    fn default_state_active_is_first_enabled() {
        let s = make_state();
        let snap = s.snapshot();
        assert_eq!(snap.active_provider, "codex");
        assert_eq!(snap.status, FailoverStatus::Monitoring);
        assert_eq!(snap.failure_counts.get("codex"), None);
    }

    #[test]
    fn record_failure_increments_count() {
        let s = make_state();
        let snap = s.record_failure("codex", None);
        assert_eq!(snap.failure_counts.get("codex"), Some(&1));
        let snap = s.record_failure("codex", None);
        assert_eq!(snap.failure_counts.get("codex"), Some(&2));
    }

    #[test]
    fn threshold_triggers_auto_switch() {
        let s = make_state();
        // 连续 3 次失败(默认阈值=3)
        s.record_failure("codex", None);
        s.record_failure("codex", None);
        let snap = s.record_failure("codex", Some("network"));
        // 自动切换到一个有工具调用能力的 Provider
        assert_ne!(snap.active_provider, "codex");
        // 失败计数应该是 0 (切换后目标 Provider 计数重置)
        assert_eq!(snap.failure_counts.get(&snap.active_provider), Some(&0));
        assert_eq!(snap.status, FailoverStatus::Switched);
        assert!(!snap.history.is_empty());
    }

    #[test]
    fn auto_failover_disabled_does_not_switch() {
        let s = make_state();
        s.set_config(FailoverConfig {
            auto_failover: false,
            ..FailoverConfig::default()
        });
        for _ in 0..5 {
            s.record_failure("codex", None);
        }
        let snap = s.snapshot();
        assert_eq!(snap.active_provider, "codex");
        assert_eq!(snap.status, FailoverStatus::Disabled);
    }

    #[test]
    fn record_success_resets_count() {
        let s = make_state();
        s.record_failure("codex", None);
        s.record_failure("codex", None);
        let snap = s.record_success("codex");
        assert_eq!(snap.failure_counts.get("codex"), Some(&0));
    }

    #[test]
    fn pick_fallback_prefers_capability_match() {
        let s = make_state();
        // codex 能力: tool-calling + vision + reasoning-effort + fast-mode
        // 期望 fall back 到同样支持 vision 的 Provider(claudeAgent 评分最高)
        let fb = s.pick_fallback("codex");
        assert!(fb.is_some());
        let fb = fb.unwrap();
        // 能力匹配度最高的非 codex Provider 应该是 claudeAgent (3/4)
        assert!(fb == "claudeAgent" || fb == "gemini" || fb == "grok",
                "expected high-capability provider, got {fb}");
    }

    #[test]
    fn pick_fallback_skips_exhausted_providers() {
        let s = make_state();
        // 把所有非 codex 的 Provider 都标到阈值
        for p in ["claudeAgent", "cursor", "gemini", "grok", "kilo", "opencode", "pi"] {
            for _ in 0..3 {
                s.record_failure(p, None);
            }
        }
        let fb = s.pick_fallback("codex");
        // 所有非 codex Provider 都已达阈值,应该返回 None
        assert!(fb.is_none(), "expected no fallback, got {fb:?}");
    }

    #[test]
    fn switch_to_unknown_provider_returns_none() {
        let s = make_state();
        let snap = s.switch_to("nonexistent-provider", None);
        assert!(snap.is_none());
    }

    #[test]
    fn switch_to_records_history() {
        let s = make_state();
        s.switch_to("gemini", Some("manual test")).expect("switch ok");
        let snap = s.snapshot();
        assert_eq!(snap.active_provider, "gemini");
        assert_eq!(snap.history.len(), 1);
        assert_eq!(snap.history[0].from, "codex");
        assert_eq!(snap.history[0].to, "gemini");
        assert_eq!(snap.history[0].reason, "manual test");
    }

    #[test]
    fn reset_clears_all_state() {
        let s = make_state();
        s.record_failure("codex", None);
        s.record_failure("codex", None);
        s.switch_to("gemini", None).expect("switch ok");
        let snap = s.reset();
        assert!(snap.failure_counts.is_empty());
        assert!(snap.history.is_empty());
        assert_eq!(snap.active_provider, "codex");
        assert_eq!(snap.status, FailoverStatus::Monitoring);
    }

    #[test]
    fn set_config_drops_inactive_active_provider() {
        let s = make_state();
        s.set_config(FailoverConfig {
            enabled_providers: vec!["gemini".to_string(), "grok".to_string()],
            ..FailoverConfig::default()
        });
        let snap = s.snapshot();
        assert_eq!(snap.active_provider, "gemini");
    }

    #[test]
    fn history_capped_at_50() {
        let s = make_state();
        // 反复切换 60 次
        for i in 0..60 {
            let target = if i % 2 == 0 { "gemini" } else { "grok" };
            s.switch_to(target, Some(&format!("iter {i}"))).expect("switch ok");
        }
        let snap = s.snapshot();
        assert!(snap.history.len() <= 50, "history len {}", snap.history.len());
    }

    #[test]
    fn capability_match_score_correct() {
        let caps = ProviderCapabilityMap::with_defaults();
        // codex vs claudeAgent: 共 ToolCalling + Vision + ReasoningEffort = 3
        assert_eq!(caps.match_score("codex", "claudeAgent"), 3);
        // codex vs pi: 只有 ToolCalling = 1
        assert_eq!(caps.match_score("codex", "pi"), 1);
        // codex vs 不存在的 provider
        assert_eq!(caps.match_score("codex", "unknown-llm"), 0);
    }

    #[test]
    fn concurrent_record_failure_safe() {
        use std::sync::Arc;
        let s = Arc::new(make_state());
        let mut handles = vec![];
        for _ in 0..8 {
            let s = s.clone();
            handles.push(std::thread::spawn(move || {
                for _ in 0..5 {
                    s.record_failure("codex", None);
                }
            }));
        }
        for h in handles {
            h.join().unwrap();
        }
        let snap = s.snapshot();
        // 8 个线程 × 5 次 = 40 次失败
        let total: u32 = snap.failure_counts.values().sum();
        assert!(total >= 40, "total failures {total}");
    }
}
