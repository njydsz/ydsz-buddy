//! # Provider 用量快照模块
//!
//! 本模块读取本地 Provider 用量归档文件，生成用量摘要供 UI 展示。
//! 支持 Codex 和 Claude 两种 Provider 的本地会话归档。
//!
//! 迁移自 Peak Code `apps/server/src/providerUsageSnapshot.ts`

use chrono::{DateTime, Datelike};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

/// 用量快照缓存 TTL（30 秒）
const USAGE_CACHE_TTL_MS: i64 = 30_000;
/// 回溯天数
const LOOKBACK_DAYS: i64 = 30;
/// 一天毫秒数
const ONE_DAY_MS: i64 = 24 * 60 * 60 * 1000;
/// 最多扫描的用量文件数
const MAX_RECENT_USAGE_FILES: usize = 2_000;

// ==============================
// 数据结构
// ==============================

/// Provider 种类
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "camelCase")]
pub enum ProviderKind {
    Codex,
    ClaudeAgent,
    Gemini,
    #[serde(other)]
    Unknown,
}

/// 用量限制信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderUsageLimit {
    /// 窗口名称（如 "5h", "Weekly"）
    pub window: String,
    /// 已用百分比
    #[serde(skip_serializing_if = "Option::is_none")]
    pub used_percent: Option<f64>,
    /// 窗口时长（分钟）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub window_duration_mins: Option<f64>,
    /// 重置时间
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resets_at: Option<String>,
}

/// 用量行
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderUsageLine {
    /// 标签（如 "24h", "7d", "30d"）
    pub label: String,
    /// 值（如 "12.5K tokens"）
    pub value: String,
    /// 副标题（如 "3 recent sessions"）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subtitle: Option<String>,
}

/// Provider 用量快照结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderUsageSnapshot {
    /// Provider 类型
    pub provider: String,
    /// 更新时间
    pub updated_at: String,
    /// 用量限制列表
    #[serde(default)]
    pub limits: Vec<ProviderUsageLimit>,
    /// 用量行列表
    #[serde(default)]
    pub usage_lines: Vec<ProviderUsageLine>,
    /// 数据来源
    pub source: String,
}

/// 带缓存的用量快照
struct CachedUsageSnapshot {
    expires_at_ms: i64,
    value: Option<ProviderUsageSnapshot>,
}

// ==============================
// 缓存管理
// ==============================

/// 全局用量快照缓存
static mut USAGE_SNAPSHOT_CACHE: Option<HashMap<String, CachedUsageSnapshot>> = None;

fn get_cache() -> &'static mut HashMap<String, CachedUsageSnapshot> {
    unsafe {
        if USAGE_SNAPSHOT_CACHE.is_none() {
            USAGE_SNAPSHOT_CACHE = Some(HashMap::new());
        }
        USAGE_SNAPSHOT_CACHE.as_mut().unwrap()
    }
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

// ==============================
// 用量计算
// ==============================

/// 格式化紧凑数字（如 1.5K, 2.3M）
fn format_compact_number(value: f64) -> String {
    let abs = value.abs();
    if abs < 1_000.0 {
        format!("{:.0}", value)
    } else if abs < 1_000_000.0 {
        format!("{:.1}K", value / 1_000.0)
    } else {
        format!("{:.1}M", value / 1_000_000.0)
    }
}

/// 格式化 Token 值
fn format_token_value(tokens: u64) -> String {
    format!("{} tokens", format_compact_number(tokens as f64))
}

/// 格式化近期会话数副标题
fn format_recent_sessions_subtitle(session_count: usize) -> Option<String> {
    if session_count == 0 {
        return None;
    }
    Some(format!(
        "{} recent {}",
        session_count,
        if session_count == 1 {
            "session"
        } else {
            "sessions"
        }
    ))
}

/// 构建用量行列表
fn build_usage_lines(
    tokens_24h: u64,
    tokens_7d: u64,
    tokens_30d: u64,
    sessions_24h: usize,
    sessions_7d: usize,
    sessions_30d: usize,
) -> Vec<ProviderUsageLine> {
    vec![
        ProviderUsageLine {
            label: "24h".to_string(),
            value: format_token_value(tokens_24h),
            subtitle: format_recent_sessions_subtitle(sessions_24h),
        },
        ProviderUsageLine {
            label: "7d".to_string(),
            value: format_token_value(tokens_7d),
            subtitle: format_recent_sessions_subtitle(sessions_7d),
        },
        ProviderUsageLine {
            label: "30d".to_string(),
            value: format_token_value(tokens_30d),
            subtitle: format_recent_sessions_subtitle(sessions_30d),
        },
    ]
}

// ==============================
// 文件扫描
// ==============================

/// 安全读取目录
fn safe_read_dir(path: &std::path::Path) -> Vec<PathBuf> {
    match std::fs::read_dir(path) {
        Ok(entries) => entries.filter_map(|e| e.ok().map(|e| e.path())).collect(),
        Err(_) => vec![],
    }
}

/// 获取文件修改时间
fn get_file_mtime_ms(path: &std::path::Path) -> i64 {
    std::fs::metadata(path)
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// 列出最近的用量文件
fn list_recent_files(paths: Vec<PathBuf>) -> Vec<PathBuf> {
    let mut files_with_mtime: Vec<(PathBuf, i64)> = paths
        .into_iter()
        .map(|p| {
            let mtime = get_file_mtime_ms(&p);
            (p, mtime)
        })
        .collect();

    files_with_mtime.sort_by(|a, b| b.1.cmp(&a.1));
    files_with_mtime.truncate(MAX_RECENT_USAGE_FILES);

    files_with_mtime.into_iter().map(|(p, _)| p).collect()
}

/// 列出 Codex 会话文件
fn list_codex_session_files(sessions_root: &std::path::Path) -> Vec<PathBuf> {
    let now = chrono::Local::now();
    let mut candidates = Vec::new();

    for offset in 0..=LOOKBACK_DAYS {
        let date = now - chrono::Duration::days(offset);
        let day_dir = sessions_root.join(format!(
            "{}/{:02}/{:02}",
            date.year(),
            date.month(),
            date.day()
        ));

        for entry in safe_read_dir(&day_dir) {
            if let Some(ext) = entry.extension() {
                if ext == "jsonl" {
                    candidates.push(entry);
                }
            }
        }
    }

    list_recent_files(candidates)
}

/// 列出 Claude 转录文件
fn list_claude_transcript_files(projects_root: &std::path::Path) -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    for project_dir in safe_read_dir(projects_root) {
        if !project_dir.is_dir() {
            continue;
        }
        for entry in safe_read_dir(&project_dir) {
            if let Some(ext) = entry.extension() {
                if ext == "jsonl" {
                    candidates.push(entry);
                }
            }
        }
    }

    list_recent_files(candidates)
}

// ==============================
// Codex 用量解析
// ==============================

/// 读取 Codex 用量摘要
fn read_codex_session_summary(path: &std::path::Path) -> Option<(i64, u64)> {
    let contents = std::fs::read_to_string(path).ok()?;
    let mut latest_timestamp_ms: i64 = 0;
    let mut latest_tokens: u64 = 0;

    for line in contents.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        let parsed: serde_json::Value = serde_json::from_str(line).ok()?;
        let record = parsed.as_object()?;

        // 只处理 event_msg / token_count
        if record.get("type")?.as_str()? != "event_msg" {
            continue;
        }
        let payload = record.get("payload")?.as_object()?;
        if payload.get("type")?.as_str()? != "token_count" {
            continue;
        }

        // 时间戳
        let timestamp_str = record
            .get("timestamp")
            .or_else(|| payload.get("timestamp"))
            .and_then(|v| v.as_str())?;
        let timestamp_ms = chrono::DateTime::parse_from_rfc3339(timestamp_str)
            .ok()
            .map(|dt| dt.timestamp_millis())?;
        if timestamp_ms > latest_timestamp_ms {
            latest_timestamp_ms = timestamp_ms;
        } else {
            continue;
        }

        // Token 数量
        let info = payload.get("info").and_then(|v| v.as_object());
        let total_usage = info
            .and_then(|i| {
                i.get("total_token_usage")
                    .or_else(|| i.get("totalTokenUsage"))
                    .or_else(|| i.get("total"))
            })
            .or_else(|| {
                payload
                    .get("total_token_usage")
                    .or_else(|| payload.get("totalTokenUsage"))
                    .or_else(|| payload.get("total"))
            })
            .and_then(|v| v.as_object());

        let tokens = total_usage
            .and_then(|tu| {
                tu.get("total_tokens")
                    .or_else(|| tu.get("totalTokens"))
            })
            .or_else(|| info.and_then(|i| i.get("total_tokens").or_else(|| i.get("totalTokens"))))
            .or_else(|| payload.get("total_tokens").or_else(|| payload.get("totalTokens")))
            .and_then(|v| v.as_u64())
            .unwrap_or(0);

        if tokens > 0 {
            latest_tokens = tokens;
        }
    }

    if latest_timestamp_ms > 0 {
        Some((latest_timestamp_ms, latest_tokens))
    } else {
        None
    }
}

/// 加载 Codex 用量快照
fn load_codex_usage_snapshot(home_dir: &std::path::Path) -> Option<ProviderUsageSnapshot> {
    let codex_home = std::env::var("CODEX_HOME")
        .ok()
        .map(PathBuf::from)
        .unwrap_or_else(|| home_dir.join(".codex"));

    let sessions_root = codex_home.join("sessions");
    if !sessions_root.exists() {
        return None;
    }

    let session_files = list_codex_session_files(&sessions_root);
    if session_files.is_empty() {
        return None;
    }

    let mut summaries: Vec<(i64, u64)> = Vec::new();
    for file in &session_files {
        if let Some(summary) = read_codex_session_summary(file) {
            summaries.push(summary);
        }
    }

    if summaries.is_empty() {
        return None;
    }

    let latest = summaries
        .iter()
        .max_by_key(|(ts, _)| *ts)
        .map(|(ts, _)| *ts)?;
    let now = now_ms();
    let cutoff_24h = now - ONE_DAY_MS;
    let cutoff_7d = now - 7 * ONE_DAY_MS;
    let cutoff_30d = now - LOOKBACK_DAYS * ONE_DAY_MS;

    let recent_24h: Vec<_> = summaries.iter().filter(|(ts, _)| *ts >= cutoff_24h).collect();
    let recent_7d: Vec<_> = summaries.iter().filter(|(ts, _)| *ts >= cutoff_7d).collect();
    let recent_30d: Vec<_> = summaries.iter().filter(|(ts, _)| *ts >= cutoff_30d).collect();

    Some(ProviderUsageSnapshot {
        provider: "codex".to_string(),
        updated_at: DateTime::from_timestamp_millis(latest)
            .unwrap_or_default()
            .to_rfc3339(),
        limits: vec![],
        usage_lines: build_usage_lines(
            recent_24h.iter().map(|(_, t)| *t).sum(),
            recent_7d.iter().map(|(_, t)| *t).sum(),
            recent_30d.iter().map(|(_, t)| *t).sum(),
            recent_24h.len(),
            recent_7d.len(),
            recent_30d.len(),
        ),
        source: "codex-session-archive".to_string(),
    })
}

// ==============================
// Claude 用量解析
// ==============================

/// 读取 Claude 用量样本
fn read_claude_usage_samples(path: &std::path::Path) -> Vec<(i64, u64, String)> {
    let contents = match std::fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return vec![],
    };

    let mut samples: Vec<(i64, u64, String)> = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for (idx, line) in contents.lines().enumerate() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        let parsed: serde_json::Value = match serde_json::from_str(line) {
            Ok(v) => v,
            Err(_) => continue,
        };
        let record = match parsed.as_object() {
            Some(r) => r,
            None => continue,
        };

        // 只处理 assistant 类型
        if record.get("type").and_then(|v| v.as_str()) != Some("assistant") {
            continue;
        }

        let message = match record.get("message").and_then(|v| v.as_object()) {
            Some(m) => m,
            None => continue,
        };
        let usage = match message.get("usage").and_then(|v| v.as_object()) {
            Some(u) => u,
            None => continue,
        };

        let input_tokens = usage.get("input_tokens").and_then(|v| v.as_u64()).unwrap_or(0)
            + usage
                .get("cache_creation_input_tokens")
                .and_then(|v| v.as_u64())
                .unwrap_or(0)
            + usage
                .get("cache_read_input_tokens")
                .and_then(|v| v.as_u64())
                .unwrap_or(0);
        let output_tokens = usage.get("output_tokens").and_then(|v| v.as_u64()).unwrap_or(0);
        let total_tokens = usage
            .get("total_tokens")
            .and_then(|v| v.as_u64())
            .unwrap_or(input_tokens + output_tokens);

        if total_tokens == 0 {
            continue;
        }

        let timestamp_str = match record.get("timestamp").and_then(|v| v.as_str()) {
            Some(t) => t,
            None => continue,
        };
        let timestamp_ms = match chrono::DateTime::parse_from_rfc3339(timestamp_str) {
            Ok(dt) => dt.timestamp_millis(),
            Err(_) => continue,
        };

        let session_id = record
            .get("sessionId")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .to_string();

        let dedupe_key = format!(
            "{}:{}",
            session_id,
            record
                .get("requestId")
                .or_else(|| message.get("id"))
                .or_else(|| record.get("uuid"))
                .and_then(|v| v.as_str())
                .unwrap_or(&format!("{}", idx))
        );

        if seen.insert(dedupe_key) {
            samples.push((timestamp_ms, total_tokens, session_id));
        }
    }

    samples
}

/// 加载 Claude 用量快照
fn load_claude_usage_snapshot(home_dir: &std::path::Path) -> Option<ProviderUsageSnapshot> {
    let projects_root = home_dir.join(".claude").join("projects");
    if !projects_root.exists() {
        return None;
    }

    let transcript_files = list_claude_transcript_files(&projects_root);
    if transcript_files.is_empty() {
        return None;
    }

    let mut all_samples: Vec<(i64, u64, String)> = Vec::new();
    for file in &transcript_files {
        all_samples.extend(read_claude_usage_samples(file));
    }

    if all_samples.is_empty() {
        return None;
    }

    let now = now_ms();
    let cutoff_24h = now - ONE_DAY_MS;
    let cutoff_7d = now - 7 * ONE_DAY_MS;
    let cutoff_30d = now - LOOKBACK_DAYS * ONE_DAY_MS;

    let recent_24h: Vec<_> = all_samples.iter().filter(|(ts, _, _)| *ts >= cutoff_24h).collect();
    let recent_7d: Vec<_> = all_samples.iter().filter(|(ts, _, _)| *ts >= cutoff_7d).collect();
    let recent_30d: Vec<_> = all_samples.iter().filter(|(ts, _, _)| *ts >= cutoff_30d).collect();

    let latest = all_samples.iter().max_by_key(|(ts, _, _)| *ts)?.0;

    Some(ProviderUsageSnapshot {
        provider: "claudeAgent".to_string(),
        updated_at: DateTime::from_timestamp_millis(latest)
            .unwrap_or_default()
            .to_rfc3339(),
        limits: vec![],
        usage_lines: build_usage_lines(
            recent_24h.iter().map(|(_, t, _)| *t).sum(),
            recent_7d.iter().map(|(_, t, _)| *t).sum(),
            recent_30d.iter().map(|(_, t, _)| *t).sum(),
            {
                let ids: std::collections::HashSet<_> =
                    recent_24h.iter().map(|(_, _, s)| s).collect();
                ids.len()
            },
            {
                let ids: std::collections::HashSet<_> =
                    recent_7d.iter().map(|(_, _, s)| s).collect();
                ids.len()
            },
            {
                let ids: std::collections::HashSet<_> =
                    recent_30d.iter().map(|(_, _, s)| s).collect();
                ids.len()
            },
        ),
        source: "claude-project-transcripts".to_string(),
    })
}

// ==============================
// 公共 API
// ==============================

/// 获取 Provider 用量快照
///
/// 读取本地 Provider 用量归档文件，生成用量摘要。
/// 结果会被缓存 30 秒。
pub fn get_provider_usage_snapshot(
    provider: &ProviderKind,
    home_dir: &std::path::Path,
) -> Option<ProviderUsageSnapshot> {
    let cache_key = format!("{:?}:{}", provider, home_dir.display());
    let now = now_ms();

    // 检查缓存
    {
        let cache = get_cache();
        if let Some(entry) = cache.get(&cache_key) {
            if entry.expires_at_ms > now {
                return entry.value.clone();
            }
        }
    }

    // 加载数据
    let result = match provider {
        ProviderKind::Codex => load_codex_usage_snapshot(home_dir),
        ProviderKind::ClaudeAgent => load_claude_usage_snapshot(home_dir),
        _ => None,
    };

    // 更新缓存
    {
        let cache = get_cache();
        cache.insert(
            cache_key,
            CachedUsageSnapshot {
                expires_at_ms: now + USAGE_CACHE_TTL_MS,
                value: result.clone(),
            },
        );
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_compact_number() {
        assert_eq!(format_compact_number(0.0), "0");
        assert_eq!(format_compact_number(500.0), "500");
        assert_eq!(format_compact_number(1500.0), "1.5K");
        assert_eq!(format_compact_number(2_500_000.0), "2.5M");
    }

    #[test]
    fn test_format_token_value() {
        assert_eq!(format_token_value(500), "500 tokens");
        assert_eq!(format_token_value(1500), "1.5K tokens");
    }

    #[test]
    fn test_build_usage_lines() {
        let lines = build_usage_lines(1000, 5000, 20000, 3, 8, 15);
        assert_eq!(lines.len(), 3);
        assert_eq!(lines[0].label, "24h");
        assert_eq!(lines[1].label, "7d");
        assert_eq!(lines[2].label, "30d");
    }

    #[test]
    fn test_cache_behavior() {
        let home = std::path::Path::new("/nonexistent");
        let result = get_provider_usage_snapshot(&ProviderKind::Gemini, home);
        // Gemini 应该返回 None
        assert!(result.is_none());
    }
}