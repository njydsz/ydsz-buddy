//! 用量统计面板（P1-6）
//!
//! SQLite 持久化用量日志 + 三维度聚合查询（按日/按用户/按模型）+ Tauri 命令。
//! 对标 Octop 的 usage.py + Token Usage 控制面板。

use anyhow::Result;
use parking_lot::Mutex;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Arc;
use chrono::{Datelike, TimeZone, Utc};

/// 用量日志存储
#[derive(Debug, Clone)]
pub struct UsageStatsStore {
    conn: Arc<Mutex<Connection>>,
}

impl UsageStatsStore {
    pub fn open<P: AsRef<Path>>(path: P) -> Result<Self> {
        let conn = Connection::open(path)?;
        let store = Self { conn: Arc::new(Mutex::new(conn)) };
        store.init_tables()?;
        Ok(store)
    }

    pub fn open_in_memory() -> Result<Self> {
        let conn = Connection::open_in_memory()?;
        let store = Self { conn: Arc::new(Mutex::new(conn)) };
        store.init_tables()?;
        Ok(store)
    }

    fn init_tables(&self) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute_batch(r#"
            CREATE TABLE IF NOT EXISTS usage_log (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                ts_ms           INTEGER NOT NULL,
                user_id         TEXT,
                agent_id        TEXT,
                thread_id       TEXT,
                model           TEXT NOT NULL DEFAULT 'unknown',
                provider        TEXT,
                input_tokens    INTEGER NOT NULL DEFAULT 0,
                output_tokens   INTEGER NOT NULL DEFAULT 0,
                cached_tokens   INTEGER NOT NULL DEFAULT 0,
                cost_milli_usd  INTEGER NOT NULL DEFAULT 0,
                source          TEXT NOT NULL DEFAULT 'ui'   -- 'ui' | 'im' | 'cron' | 'api'
            );
            CREATE INDEX IF NOT EXISTS idx_usage_ts ON usage_log(ts_ms);
            CREATE INDEX IF NOT EXISTS idx_usage_user ON usage_log(user_id);
            CREATE INDEX IF NOT EXISTS idx_usage_model ON usage_log(model);
            CREATE INDEX IF NOT EXISTS idx_usage_user_model ON usage_log(user_id, model);
        "#)?;
        Ok(())
    }

    /// 记录一次用量
    pub fn record(&self, record: &UsageRecord) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute(
            "INSERT INTO usage_log (ts_ms, user_id, agent_id, thread_id, model, provider, input_tokens, output_tokens, cached_tokens, cost_milli_usd, source)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            rusqlite::params![
                record.ts_ms,
                &record.user_id,
                &record.agent_id,
                &record.thread_id,
                &record.model,
                &record.provider,
                record.input_tokens as i64,
                record.output_tokens as i64,
                record.cached_tokens as i64,
                record.cost_milli_usd as i64,
                &record.source,
            ],
        )?;
        Ok(())
    }

    /// 按日聚合查询
    pub fn summary_by_day(&self, days: Option<u32>) -> Result<Vec<DayUsageBucket>> {
        let conn = self.conn.lock();
        let cutoff = days.map(|d| Utc::now().timestamp_millis() - (d as i64) * 86400_000);

        let sql = if cutoff.is_some() {
            "SELECT ts_ms / 86400000 * 86400000 AS day_ms,
                    COALESCE(SUM(input_tokens), 0) AS input_tokens,
                    COALESCE(SUM(output_tokens), 0) AS output_tokens,
                    COALESCE(SUM(cached_tokens), 0) AS cached_tokens,
                    COALESCE(SUM(cost_milli_usd), 0) AS cost_milli_usd,
                    COUNT(*) AS call_count
             FROM usage_log WHERE ts_ms > ?1
             GROUP BY day_ms ORDER BY day_ms ASC"
        } else {
            "SELECT ts_ms / 86400000 * 86400000 AS day_ms,
                    COALESCE(SUM(input_tokens), 0) AS input_tokens,
                    COALESCE(SUM(output_tokens), 0) AS output_tokens,
                    COALESCE(SUM(cached_tokens), 0) AS cached_tokens,
                    COALESCE(SUM(cost_milli_usd), 0) AS cost_milli_usd,
                    COUNT(*) AS call_count
             FROM usage_log
             GROUP BY day_ms ORDER BY day_ms ASC"
        };

        let mut stmt = conn.prepare(sql)?;
        let rows = if let Some(c) = cutoff {
            stmt.query_map(rusqlite::params![c], row_to_day_bucket)?
        } else {
            stmt.query_map([], row_to_day_bucket)?
        };

        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    /// 按用户聚合
    pub fn summary_by_user(&self, days: Option<u32>) -> Result<Vec<UserUsageBucket>> {
        let conn = self.conn.lock();
        let cutoff = days.map(|d| Utc::now().timestamp_millis() - (d as i64) * 86400_000);

        let sql = if cutoff.is_some() {
            "SELECT COALESCE(user_id, 'anonymous') AS user_id,
                    COALESCE(SUM(input_tokens), 0) AS input_tokens,
                    COALESCE(SUM(output_tokens), 0) AS output_tokens,
                    COALESCE(SUM(cached_tokens), 0) AS cached_tokens,
                    COALESCE(SUM(cost_milli_usd), 0) AS cost_milli_usd,
                    COUNT(*) AS call_count
             FROM usage_log WHERE ts_ms > ?1
             GROUP BY user_id ORDER BY call_count DESC"
        } else {
            "SELECT COALESCE(user_id, 'anonymous') AS user_id,
                    COALESCE(SUM(input_tokens), 0) AS input_tokens,
                    COALESCE(SUM(output_tokens), 0) AS output_tokens,
                    COALESCE(SUM(cached_tokens), 0) AS cached_tokens,
                    COALESCE(SUM(cost_milli_usd), 0) AS cost_milli_usd,
                    COUNT(*) AS call_count
             FROM usage_log
             GROUP BY user_id ORDER BY call_count DESC"
        };

        let mut stmt = conn.prepare(sql)?;
        let rows = if let Some(c) = cutoff {
            stmt.query_map(rusqlite::params![c], row_to_user_bucket)?
        } else {
            stmt.query_map([], row_to_user_bucket)?
        };

        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    /// 按模型聚合
    pub fn summary_by_model(&self, days: Option<u32>) -> Result<Vec<ModelUsageBucket>> {
        let conn = self.conn.lock();
        let cutoff = days.map(|d| Utc::now().timestamp_millis() - (d as i64) * 86400_000);

        let sql = if cutoff.is_some() {
            "SELECT model,
                    COALESCE(SUM(input_tokens), 0) AS input_tokens,
                    COALESCE(SUM(output_tokens), 0) AS output_tokens,
                    COALESCE(SUM(cached_tokens), 0) AS cached_tokens,
                    COALESCE(SUM(cost_milli_usd), 0) AS cost_milli_usd,
                    COUNT(*) AS call_count
             FROM usage_log WHERE ts_ms > ?1
             GROUP BY model ORDER BY call_count DESC"
        } else {
            "SELECT model,
                    COALESCE(SUM(input_tokens), 0) AS input_tokens,
                    COALESCE(SUM(output_tokens), 0) AS output_tokens,
                    COALESCE(SUM(cached_tokens), 0) AS cached_tokens,
                    COALESCE(SUM(cost_milli_usd), 0) AS cost_milli_usd,
                    COUNT(*) AS call_count
             FROM usage_log
             GROUP BY model ORDER BY call_count DESC"
        };

        let mut stmt = conn.prepare(sql)?;
        let rows = if let Some(c) = cutoff {
            stmt.query_map(rusqlite::params![c], row_to_model_bucket)?
        } else {
            stmt.query_map([], row_to_model_bucket)?
        };

        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    /// 总览统计
    pub fn total_summary(&self, days: Option<u32>) -> Result<TotalUsageSummary> {
        let conn = self.conn.lock();
        let cutoff = days.map(|d| Utc::now().timestamp_millis() - (d as i64) * 86400_000);

        let sql = if cutoff.is_some() {
            "SELECT COALESCE(SUM(input_tokens), 0),
                    COALESCE(SUM(output_tokens), 0),
                    COALESCE(SUM(cached_tokens), 0),
                    COALESCE(SUM(cost_milli_usd), 0),
                    COUNT(DISTINCT user_id),
                    COUNT(*)
             FROM usage_log WHERE ts_ms > ?1"
        } else {
            "SELECT COALESCE(SUM(input_tokens), 0),
                    COALESCE(SUM(output_tokens), 0),
                    COALESCE(SUM(cached_tokens), 0),
                    COALESCE(SUM(cost_milli_usd), 0),
                    COUNT(DISTINCT user_id),
                    COUNT(*)
             FROM usage_log"
        };

        let result = if let Some(c) = cutoff {
            conn.query_row(sql, rusqlite::params![c], row_to_total_summary)
        } else {
            conn.query_row(sql, [], row_to_total_summary)
        };

        result.map_err(|e| e.into())
    }
}

// ──────────── 行转换闭包 ────────────

fn row_to_day_bucket(row: &rusqlite::Row<'_>) -> rusqlite::Result<DayUsageBucket> {
    Ok(DayUsageBucket {
        day_ms: row.get(0)?,
        input_tokens: row.get::<_, i64>(1)? as u64,
        output_tokens: row.get::<_, i64>(2)? as u64,
        cached_tokens: row.get::<_, i64>(3)? as u64,
        cost_milli_usd: row.get::<_, i64>(4)? as u64,
        call_count: row.get::<_, i64>(5)? as u64,
    })
}

fn row_to_user_bucket(row: &rusqlite::Row<'_>) -> rusqlite::Result<UserUsageBucket> {
    Ok(UserUsageBucket {
        user_id: row.get(0)?,
        input_tokens: row.get::<_, i64>(1)? as u64,
        output_tokens: row.get::<_, i64>(2)? as u64,
        cached_tokens: row.get::<_, i64>(3)? as u64,
        cost_milli_usd: row.get::<_, i64>(4)? as u64,
        call_count: row.get::<_, i64>(5)? as u64,
    })
}

fn row_to_model_bucket(row: &rusqlite::Row<'_>) -> rusqlite::Result<ModelUsageBucket> {
    Ok(ModelUsageBucket {
        model: row.get(0)?,
        input_tokens: row.get::<_, i64>(1)? as u64,
        output_tokens: row.get::<_, i64>(2)? as u64,
        cached_tokens: row.get::<_, i64>(3)? as u64,
        cost_milli_usd: row.get::<_, i64>(4)? as u64,
        call_count: row.get::<_, i64>(5)? as u64,
    })
}

fn row_to_total_summary(row: &rusqlite::Row<'_>) -> rusqlite::Result<TotalUsageSummary> {
    Ok(TotalUsageSummary {
        total_input_tokens: row.get::<_, i64>(0)? as u64,
        total_output_tokens: row.get::<_, i64>(1)? as u64,
        total_cached_tokens: row.get::<_, i64>(2)? as u64,
        total_cost_milli_usd: row.get::<_, i64>(3)? as u64,
        unique_users: row.get::<_, i64>(4)? as u32,
        total_calls: row.get::<_, i64>(5)? as u64,
    })
}

// ──────────── 数据结构 ────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageRecord {
    pub ts_ms: i64,
    pub user_id: Option<String>,
    pub agent_id: Option<String>,
    pub thread_id: Option<String>,
    pub model: String,
    pub provider: Option<String>,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cached_tokens: u64,
    pub cost_milli_usd: u64,
    pub source: String,  // "ui" / "im" / "cron" / "api"
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct DayUsageBucket {
    pub day_ms: i64,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cached_tokens: u64,
    pub cost_milli_usd: u64,
    pub call_count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct UserUsageBucket {
    pub user_id: String,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cached_tokens: u64,
    pub cost_milli_usd: u64,
    pub call_count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct ModelUsageBucket {
    pub model: String,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cached_tokens: u64,
    pub cost_milli_usd: u64,
    pub call_count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct TotalUsageSummary {
    pub total_input_tokens: u64,
    pub total_output_tokens: u64,
    pub total_cached_tokens: u64,
    pub total_cost_milli_usd: u64,
    pub unique_users: u32,
    pub total_calls: u64,
}

// ──────────── Tauri 状态与命令 ────────────

pub struct UsageStatsState {
    pub store: Arc<Mutex<Option<UsageStatsStore>>>,
}

impl UsageStatsState {
    pub fn new() -> Self {
        Self { store: Arc::new(Mutex::new(None)) }
    }

    pub fn init(&self) -> Result<(), String> {
        let db_path = Self::db_path();
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("创建用量数据库目录失败: {}", e))?;
        }
        let store = UsageStatsStore::open(&db_path)
            .map_err(|e| format!("打开用量数据库失败: {}", e))?;
        *self.store.lock() = Some(store);
        Ok(())
    }

    fn db_path() -> std::path::PathBuf {
        dirs::data_dir()
            .unwrap_or_else(|| std::path::PathBuf::from("."))
            .join("ydsz-buddy")
            .join("usage.db")
    }

    fn get_store(&self) -> Result<UsageStatsStore, String> {
        let guard = self.store.lock();
        (*guard).clone().ok_or_else(|| "用量统计未初始化".to_string())
    }
}

impl Clone for UsageStatsState {
    fn clone(&self) -> Self { Self { store: Arc::clone(&self.store) } }
}

/// 初始化用量统计
#[tauri::command]
#[specta::specta]
pub fn usage_init(state: tauri::State<'_, UsageStatsState>) -> Result<(), String> {
    state.init()
}

/// 记录一次用量
#[tauri::command]
#[specta::specta]
pub fn usage_record(
    record: UsageRecord,
    state: tauri::State<'_, UsageStatsState>,
) -> Result<(), String> {
    let store = state.get_store()?;
    store.record(&record).map_err(|e| e.to_string())
}

/// 按日聚合查询
#[tauri::command]
#[specta::specta]
pub fn usage_summary_by_day(
    days: Option<u32>,
    state: tauri::State<'_, UsageStatsState>,
) -> Result<Vec<DayUsageBucket>, String> {
    let store = state.get_store()?;
    store.summary_by_day(days).map_err(|e| e.to_string())
}

/// 按用户聚合查询
#[tauri::command]
#[specta::specta]
pub fn usage_summary_by_user(
    days: Option<u32>,
    state: tauri::State<'_, UsageStatsState>,
) -> Result<Vec<UserUsageBucket>, String> {
    let store = state.get_store()?;
    store.summary_by_user(days).map_err(|e| e.to_string())
}

/// 按模型聚合查询
#[tauri::command]
#[specta::specta]
pub fn usage_summary_by_model(
    days: Option<u32>,
    state: tauri::State<'_, UsageStatsState>,
) -> Result<Vec<ModelUsageBucket>, String> {
    let store = state.get_store()?;
    store.summary_by_model(days).map_err(|e| e.to_string())
}

/// 总览统计
#[tauri::command]
#[specta::specta]
pub fn usage_total_summary(
    days: Option<u32>,
    state: tauri::State<'_, UsageStatsState>,
) -> Result<TotalUsageSummary, String> {
    let store = state.get_store()?;
    store.total_summary(days).map_err(|e| e.to_string())
}
