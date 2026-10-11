//! # Provider Token Usage 强制追踪 + AI 占比分析（增强版）
//!
//! ## 功能
//!
//! 1. **Token Usage 强制追踪**: 每次 LLM Provider 调用后，自动将 token 消耗写入事件存储。
//!    解决原先 `should` 级别（非强制）导致的审计缺失问题。
//!
//! 2. **AI 生产占比分析**: 追踪每次 Turn 的输出分类为：
//!    - `ai`: 纯 AI 生成（Agent 自主输出）
//!    - `mixed`: AI 生成 + 人类修改（默认分类）
//!    - `human`: 纯人类输入（用户直接编辑/粘贴）
//!
//! ## 命令
//!
//! | 命令 | 说明 |
//! |------|------|
//! | `token_usage_record` | 记录一次 Provider token 消耗 |
//! | `token_usage_get_stats` | 获取 token 使用统计 |
//! | `ai_ratio_record_turn` | 记录 Turn AI 占比快照 |
//! | `ai_ratio_get_stats` | 获取 AI 占比统计 |
//! | `ai_ratio_classify_turn` | 对 Turn 进行 AI/Human/Mixed 分类 |

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use tauri::State;
use tracing::info;

use ydsz_shared::persistence::SqliteEventStore;

// ===== DTOs =====

/// Token 使用记录请求
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenUsageRecord {
    pub provider: String,
    pub model: String,
    pub thread_id: String,
    pub turn_id: String,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cached_input_tokens: u64,
    pub cost_usd: Option<f64>,
}

/// Token 使用统计
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenUsageStats {
    pub total_calls: u64,
    pub total_input_tokens: u64,
    pub total_output_tokens: u64,
    pub total_cached_tokens: u64,
    pub total_cost_usd: f64,
    pub by_provider: HashMap<String, ProviderTokenStat>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderTokenStat {
    pub calls: u64,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cost_usd: f64,
}

/// Turn 贡献者类型
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ContributorType {
    /// 纯 AI 生成（Agent 自主输出）
    Ai,
    /// AI 生成 + 人类修改
    Mixed,
    /// 纯人类输入
    Human,
}

impl std::fmt::Display for ContributorType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ContributorType::Ai => write!(f, "ai"),
            ContributorType::Mixed => write!(f, "mixed"),
            ContributorType::Human => write!(f, "human"),
        }
    }
}

/// AI 占比快照
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiRatioSnapshot {
    pub thread_id: String,
    pub turn_id: String,
    pub contributor_type: String,
    pub ai_lines: u32,
    pub human_lines: u32,
    pub mixed_lines: u32,
    pub total_lines: u32,
    pub ai_ratio: f64,  // 0.0 - 1.0
    pub recorded_at: String,
    pub model: Option<String>,
    pub provider: Option<String>,
}

/// AI 占比汇总统计
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiRatioStats {
    pub total_turns: u64,
    pub ai_turns: u64,
    pub mixed_turns: u64,
    pub human_turns: u64,
    pub overall_ai_ratio: f64,
    pub total_ai_lines: u32,
    pub total_human_lines: u32,
    pub total_mixed_lines: u32,
}

// ===== 状态 =====

/// Token 追踪状态（内存聚合 + 事件存储双写）
#[derive(Debug, Clone)]
pub struct TokenTrackingState {
    inner: Arc<Mutex<TokenTrackingInner>>,
}

#[derive(Debug, Clone, Default)]
struct TokenTrackingInner {
    stats: TokenUsageStats,
    ai_snapshots: Vec<AiRatioSnapshot>,
}

impl TokenTrackingState {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(TokenTrackingInner {
                stats: TokenUsageStats {
                    total_calls: 0,
                    total_input_tokens: 0,
                    total_output_tokens: 0,
                    total_cached_tokens: 0,
                    total_cost_usd: 0.0,
                    by_provider: HashMap::new(),
                },
                ai_snapshots: Vec::new(),
            })),
        }
    }

    pub fn record_usage(&self, record: &TokenUsageRecord) {
        let mut inner = self.inner.lock().unwrap();
        inner.stats.total_calls += 1;
        inner.stats.total_input_tokens += record.input_tokens;
        inner.stats.total_output_tokens += record.output_tokens;
        inner.stats.total_cached_tokens += record.cached_input_tokens;
        if let Some(cost) = record.cost_usd {
            inner.stats.total_cost_usd += cost;
        }

        let provider_stat = inner
            .stats
            .by_provider
            .entry(record.provider.clone())
            .or_insert(ProviderTokenStat {
                calls: 0,
                input_tokens: 0,
                output_tokens: 0,
                cost_usd: 0.0,
            });
        provider_stat.calls += 1;
        provider_stat.input_tokens += record.input_tokens;
        provider_stat.output_tokens += record.output_tokens;
        if let Some(cost) = record.cost_usd {
            provider_stat.cost_usd += cost;
        }
    }

    pub fn get_stats(&self) -> TokenUsageStats {
        self.inner.lock().unwrap().stats.clone()
    }

    pub fn record_ai_snapshot(&self, snapshot: AiRatioSnapshot) {
        let mut inner = self.inner.lock().unwrap();
        inner.ai_snapshots.push(snapshot);
    }

    pub fn get_ai_stats(&self) -> AiRatioStats {
        let inner = self.inner.lock().unwrap();
        let total = inner.ai_snapshots.len() as u64;

        let mut ai_turns = 0;
        let mut mixed_turns = 0;
        let mut human_turns = 0;
        let mut total_ai_lines = 0;
        let mut total_human_lines = 0;
        let mut total_mixed_lines = 0;

        for s in &inner.ai_snapshots {
            total_ai_lines += s.ai_lines;
            total_human_lines += s.human_lines;
            total_mixed_lines += s.mixed_lines;
            match s.contributor_type.as_str() {
                "ai" => ai_turns += 1,
                "mixed" => mixed_turns += 1,
                "human" => human_turns += 1,
                _ => {}
            }
        }

        let total_lines = total_ai_lines + total_human_lines + total_mixed_lines;
        let overall_ratio = if total_lines > 0 {
            (total_ai_lines as f64 + total_mixed_lines as f64 * 0.5) / total_lines as f64
        } else {
            0.0
        };

        AiRatioStats {
            total_turns: total,
            ai_turns,
            mixed_turns,
            human_turns,
            overall_ai_ratio: overall_ratio,
            total_ai_lines,
            total_human_lines,
            total_mixed_lines,
        }
    }

    pub fn list_ai_snapshots(&self) -> Vec<AiRatioSnapshot> {
        self.inner.lock().unwrap().ai_snapshots.clone()
    }
}

impl Default for TokenTrackingState {
    fn default() -> Self {
        Self::new()
    }
}

// ===== Tauri Commands =====

/// 记录 Provider Token 消耗（写入事件存储 + 内存统计）
#[tauri::command]
#[specta::specta]
pub async fn token_usage_record(
    state: State<'_, TokenTrackingState>,
    event_store: State<'_, SqliteEventStore>,
    record: TokenUsageRecord,
) -> Result<String, String> {
    info!(
        provider = %record.provider,
        model = %record.model,
        input = record.input_tokens,
        output = record.output_tokens,
        "Token usage recorded"
    );

    // 1. 写入事件存储（审计）
    let event_payload = serde_json::json!({
        "provider": &record.provider,
        "model": &record.model,
        "threadId": &record.thread_id,
        "turnId": &record.turn_id,
        "inputTokens": record.input_tokens,
        "outputTokens": record.output_tokens,
        "cachedInputTokens": record.cached_input_tokens,
        "costUsd": record.cost_usd,
        "eventVersion": "2.0",
    });

    let event_id = event_store
        .append("token_usage", "system", &record.thread_id, &event_payload)
        .map_err(|e| format!("写入 token 事件失败: {e}"))?;

    // 2. 更新内存统计
    state.record_usage(&record);

    Ok(event_id)
}

/// 获取 Token 使用统计
#[tauri::command]
#[specta::specta]
pub async fn token_usage_get_stats(
    state: State<'_, TokenTrackingState>,
) -> Result<TokenUsageStats, String> {
    Ok(state.get_stats())
}

/// 记录 AI 占比快照
#[tauri::command]
#[specta::specta]
pub async fn ai_ratio_record_turn(
    state: State<'_, TokenTrackingState>,
    event_store: State<'_, SqliteEventStore>,
    snapshot: AiRatioSnapshot,
) -> Result<String, String> {
    info!(
        thread_id = %snapshot.thread_id,
        turn_id = %snapshot.turn_id,
        ai_ratio = %snapshot.ai_ratio,
        contributor = %snapshot.contributor_type,
        "AI ratio snapshot recorded"
    );

    // 写入事件存储
    let event_payload = serde_json::json!({
        "threadId": &snapshot.thread_id,
        "turnId": &snapshot.turn_id,
        "contributorType": &snapshot.contributor_type,
        "aiLines": snapshot.ai_lines,
        "humanLines": snapshot.human_lines,
        "mixedLines": snapshot.mixed_lines,
        "totalLines": snapshot.total_lines,
        "aiRatio": snapshot.ai_ratio,
        "model": snapshot.model,
        "provider": snapshot.provider,
    });

    let event_id = event_store
        .append("ai_ratio_snapshot", "system", &snapshot.thread_id, &event_payload)
        .map_err(|e| format!("写入 AI ratio 事件失败: {e}"))?;

    // 更新内存
    state.record_ai_snapshot(snapshot);

    Ok(event_id)
}

/// 获取 AI 占比统计
#[tauri::command]
#[specta::specta]
pub async fn ai_ratio_get_stats(
    state: State<'_, TokenTrackingState>,
) -> Result<AiRatioStats, String> {
    Ok(state.get_ai_stats())
}

/// 获取所有 AI 占比快照
#[tauri::command]
#[specta::specta]
pub async fn ai_ratio_list_snapshots(
    state: State<'_, TokenTrackingState>,
) -> Result<Vec<AiRatioSnapshot>, String> {
    Ok(state.list_ai_snapshots())
}

/// 自动分类 Turn 贡献者类型并记录
///
/// 基于启发式规则自动判断：
/// - Turn 中用户输入行数 > 80% 总内容 → human
/// - Turn 中 AI 输出行数 > 80% → ai
/// - 其他 → mixed
#[tauri::command]
#[specta::specta]
pub async fn ai_ratio_classify_turn(
    state: State<'_, TokenTrackingState>,
    event_store: State<'_, SqliteEventStore>,
    thread_id: String,
    turn_id: String,
    user_lines: u32,
    ai_output_lines: u32,
    model: Option<String>,
    provider: Option<String>,
) -> Result<AiRatioSnapshot, String> {
    let total = user_lines + ai_output_lines;
    let contributor = if total == 0 {
        ContributorType::Mixed
    } else if ai_output_lines > total * 8 / 10 {
        ContributorType::Ai
    } else if user_lines > total * 8 / 10 {
        ContributorType::Human
    } else {
        ContributorType::Mixed
    };

    // 对于 mixed，计算中间行数
    let (ai_lines, human_lines, mixed_lines) = if contributor == ContributorType::Mixed {
        // 非极端行为混合行
        let pure_ai = ai_output_lines.saturating_sub(user_lines) / 2;
        let pure_human = if user_lines > ai_output_lines {
            (user_lines - ai_output_lines) / 2
        } else {
            0
        };
        let mixed = total - pure_ai - pure_human;
        (pure_ai, pure_human, mixed)
    } else if contributor == ContributorType::Ai {
        (ai_output_lines, user_lines, 0)
    } else {
        (ai_output_lines, user_lines, 0)
    };

    let snapshot = AiRatioSnapshot {
        thread_id,
        turn_id,
        contributor_type: contributor.to_string(),
        ai_lines,
        human_lines,
        mixed_lines,
        total_lines: total,
        ai_ratio: if total > 0 { ai_output_lines as f64 / total as f64 } else { 0.0 },
        recorded_at: chrono::Utc::now().to_rfc3339(),
        model,
        provider,
    };

    // 存储
    ai_ratio_record_turn(state, event_store, snapshot.clone()).await?;

    Ok(snapshot)
}
