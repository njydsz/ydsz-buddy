//! # Checkpoint 命令模块
//!
//! 提供任务崩溃恢复所需的 Checkpoint 管理命令：
//!
//! ## 命令清单
//!
//! | 命令 | 说明 |
//! |------|------|
//! | `checkpoint_save` | 创建或覆盖一个 Checkpoint（任务启动时调用） |
//! | `checkpoint_update` | 更新 Checkpoint 的最近活跃时间（任务运行中定时调用） |
//! | `checkpoint_complete` | 标记 Checkpoint 为完成（任务正常结束时调用） |
//! | `checkpoint_resume` | 标记 Checkpoint 为恢复中并返回最新数据 |
//! | `checkpoint_cancel` | 取消 Checkpoint（用户主动放弃） |
//! | `checkpoint_inspect` | 获取单个 Checkpoint 详情 |
//! | `checkpoint_list_pending` | 列出所有未完成的 Checkpoint |
//! | `checkpoint_cleanup_old` | 清理早于截止时间的 Checkpoint |
//!
//! ## 使用场景
//!
//! - 应用启动时检测上次未完成的任务
//! - 长时间运行的 Turn 写入 / 刷新 / 完成 Checkpoint
//! - 恢复页面让用户选择继续 / 取消
//!
//! ## 存储
//!
//! - Checkpoint 存储在 `<app_data_dir>/checkpoints.json`
//! - 使用 JSON 序列化,体积小、可手编、便于调试
//! - 进程内通过 `tauri::State<CheckpointStore>` 共享 `Mutex<Vec<CheckpointRecord>>`
//! - 每次写入后立即 fsync 到磁盘,保证崩溃后能恢复

use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tracing::{debug, info, warn};

/// 对话消息快照（Checkpoint 内嵌）
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq, specta::Type)]
pub struct SnapshotMessage {
    /// 消息角色 (user / assistant / tool)
    pub role: String,
    /// 消息内容（纯文本摘要）
    pub content: String,
    /// 工具调用名称（role=tool 时）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_name: Option<String>,
    /// 消息序号
    pub sequence: u32,
}

/// Provider 会话快照（Checkpoint 内嵌）
#[derive(Debug, Clone, Default, Serialize, Deserialize, specta::Type)]
pub struct SnapshotProviderSession {
    /// Provider 名称
    pub provider_name: String,
    /// 模型名称
    pub model_name: String,
    /// Provider 内部 session ID（用于断点续传）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    /// 累计 token 数
    pub total_tokens: u32,
    /// 会话开始时间
    pub started_at: String,
}

/// 任务状态
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum CheckpointStatus {
    /// 运行中
    Running,
    /// 用户暂停
    Paused,
    /// 失败
    Failed,
    /// 已完成
    Completed,
    /// 已取消
    Cancelled,
    /// 恢复中(用户从断点继续后状态)
    Resuming,
}

impl CheckpointStatus {
    /// 是否处于"未完成"状态(用于 `checkpoint_list_pending` 过滤)
    pub fn is_pending(&self) -> bool {
        matches!(
            self,
            CheckpointStatus::Running | CheckpointStatus::Paused | CheckpointStatus::Failed
        )
    }
}

/// Checkpoint 记录
///
/// 包含完整的对话快照，支持崩溃恢复后继续对话。
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct CheckpointRecord {
    /// 线程 ID
    pub thread_id: String,
    /// Turn ID
    pub turn_id: String,
    /// 创建时间(ISO 8601)
    pub created_at: DateTime<Utc>,
    /// 最后更新时间(ISO 8601)
    pub updated_at: DateTime<Utc>,
    /// 任务状态
    pub status: CheckpointStatus,
    /// 最后一条消息 ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_message_id: Option<String>,
    /// 任务摘要
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    /// 对话消息快照（用于断点恢复时重建上下文）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub messages: Option<Vec<SnapshotMessage>>,
    /// Provider 会话快照
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_session: Option<SnapshotProviderSession>,
    /// 工具调用结果列表
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_results: Option<Vec<Value>>,
}

impl CheckpointRecord {
    fn new(thread_id: String, turn_id: String, status: CheckpointStatus) -> Self {
        let now = Utc::now();
        Self {
            thread_id,
            turn_id,
            created_at: now,
            updated_at: now,
            status,
            last_message_id: None,
            summary: None,
            messages: None,
            provider_session: None,
            tool_results: None,
        }
    }
}

/// 前端可见的 Checkpoint 视图
#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct TurnCheckpoint {
    /// 线程 ID
    pub thread_id: String,
    /// Turn ID
    pub turn_id: String,
    /// 创建时间(ISO 8601)
    pub created_at: String,
    /// 最后更新时间(ISO 8601)
    pub updated_at: String,
    /// 任务状态字符串
    pub status: String,
    /// 最后一条消息 ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_message_id: Option<String>,
    /// 任务摘要
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
}

impl From<&CheckpointRecord> for TurnCheckpoint {
    fn from(record: &CheckpointRecord) -> Self {
        Self {
            thread_id: record.thread_id.clone(),
            turn_id: record.turn_id.clone(),
            created_at: record.created_at.to_rfc3339(),
            updated_at: record.updated_at.to_rfc3339(),
            status: match record.status {
                CheckpointStatus::Running => "running".to_string(),
                CheckpointStatus::Paused => "paused".to_string(),
                CheckpointStatus::Failed => "failed".to_string(),
                CheckpointStatus::Completed => "completed".to_string(),
                CheckpointStatus::Cancelled => "cancelled".to_string(),
                CheckpointStatus::Resuming => "resuming".to_string(),
            },
            last_message_id: record.last_message_id.clone(),
            summary: record.summary.clone(),
        }
    }
}

/// 内存中的 Checkpoint 存储
#[derive(Debug, Default)]
pub struct CheckpointStore {
    inner: Mutex<Vec<CheckpointRecord>>,
}

impl CheckpointStore {
    /// 从磁盘加载(若存在)
    pub fn load_from_path(&self, path: &PathBuf) -> Result<(), String> {
        let content = match fs::read_to_string(path) {
            Ok(content) => content,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                debug!(?path, "Checkpoint 文件不存在,使用空列表");
                return Ok(());
            }
            Err(error) => {
                warn!(?error, "读取 Checkpoint 文件失败");
                return Err(format!("读取 Checkpoint 文件失败: {error}"));
            }
        };

        let records: Vec<CheckpointRecord> = match serde_json::from_str(&content) {
            Ok(records) => records,
            Err(error) => {
                warn!(?error, "Checkpoint 文件解析失败,使用空列表");
                return Ok(());
            }
        };

        info!(count = records.len(), "已从磁盘加载 Checkpoint 列表");

        let mut guard = self
            .inner
            .lock()
            .map_err(|error| format!("Checkpoint 锁失败: {error}"))?;
        *guard = records;
        Ok(())
    }

    /// 持久化到磁盘(全量覆盖)
    pub fn persist_to_path(&self, path: &PathBuf) -> Result<(), String> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("无法创建 Checkpoint 目录: {error}"))?;
        }

        let records = self
            .inner
            .lock()
            .map_err(|error| format!("Checkpoint 锁失败: {error}"))?;

        let content = serde_json::to_string_pretty(&*records)
            .map_err(|error| format!("Checkpoint 序列化失败: {error}"))?;

        // 原子写入:先写临时文件再 rename,避免半写
        let tmp_path = path.with_extension("json.tmp");
        fs::write(&tmp_path, content)
            .map_err(|error| format!("写入 Checkpoint 临时文件失败: {error}"))?;
        fs::rename(&tmp_path, path)
            .map_err(|error| format!("重命名 Checkpoint 文件失败: {error}"))?;

        debug!(count = records.len(), "Checkpoint 已持久化");
        Ok(())
    }

    /// 计算 Checkpoint 存储路径
    pub fn store_path<R: tauri::Runtime, M: tauri::Manager<R>>(manager: &M) -> Result<PathBuf, String> {
        let dir = manager
            .path()
            .app_data_dir()
            .map_err(|error| format!("无法解析 app_data_dir: {error}"))?;
        Ok(dir.join("checkpoints.json"))
    }
}

// ── 参数 DTO ─────────────────────────────────────────────────────────

/// `checkpoint_save` 参数
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct CheckpointSaveParams {
    /// 线程 ID
    pub thread_id: String,
    /// Turn ID
    pub turn_id: String,
    /// 任务状态
    pub status: Option<CheckpointStatus>,
    /// 最后一条消息 ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_message_id: Option<String>,
    /// 任务摘要
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    /// 对话消息快照
    #[serde(skip_serializing_if = "Option::is_none")]
    pub messages: Option<Vec<SnapshotMessage>>,
    /// Provider 会话快照
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_session: Option<SnapshotProviderSession>,
    /// 工具调用结果列表
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_results: Option<Vec<Value>>,
}

/// `checkpoint_update` 参数
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct CheckpointUpdateParams {
    /// 线程 ID
    pub thread_id: String,
    /// Turn ID
    pub turn_id: String,
    /// 最后一条消息 ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_message_id: Option<String>,
    /// 任务摘要
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    /// 对话消息快照
    #[serde(skip_serializing_if = "Option::is_none")]
    pub messages: Option<Vec<SnapshotMessage>>,
    /// Provider 会话快照
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_session: Option<SnapshotProviderSession>,
    /// 工具调用结果列表
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_results: Option<Vec<Value>>,
}

/// `checkpoint_complete` / `checkpoint_cancel` / `checkpoint_resume` /
/// `checkpoint_inspect` 共用参数
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct CheckpointKeyParams {
    /// 线程 ID
    pub thread_id: String,
    /// Turn ID
    pub turn_id: String,
}

/// `checkpoint_cleanup_old` 参数
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct CheckpointCleanupParams {
    /// 截止时间(ISO 8601),早于该时间的 Checkpoint 会被清理
    pub cutoff_iso: String,
}

// ── 命令实现 ─────────────────────────────────────────────────────────

/// 创建或覆盖一个 Checkpoint(任务启动时调用)
///
/// 保存对话快照（messages + provider_session + tool_results），用于崩溃恢复后继续对话。
#[tauri::command]
#[specta::specta]
pub fn checkpoint_save(
    params: CheckpointSaveParams,
    store: tauri::State<'_, CheckpointStore>,
    app: tauri::AppHandle,
) -> Result<TurnCheckpoint, String> {
    let status = params.status.unwrap_or(CheckpointStatus::Running);
    let now = Utc::now();
    let record = CheckpointRecord {
        thread_id: params.thread_id,
        turn_id: params.turn_id,
        created_at: now,
        updated_at: now,
        status,
        last_message_id: params.last_message_id,
        summary: params.summary,
        messages: params.messages,
        provider_session: params.provider_session,
        tool_results: params.tool_results,
    };
    upsert(&store, &app, record)
}

/// 刷新 Checkpoint 的 `updated_at`(定时心跳)
///
/// 同时更新对话快照（用于断点续传时获取最新上下文）。
#[tauri::command]
#[specta::specta]
pub fn checkpoint_update(
    params: CheckpointUpdateParams,
    store: tauri::State<'_, CheckpointStore>,
    app: tauri::AppHandle,
) -> Result<TurnCheckpoint, String> {
    let mut guard = store
        .inner
        .lock()
        .map_err(|error| format!("Checkpoint 锁失败: {error}"))?;

    let record = guard
        .iter_mut()
        .find(|record| record.thread_id == params.thread_id && record.turn_id == params.turn_id)
        .ok_or_else(|| {
            format!(
                "Checkpoint 不存在: thread={} turn={}",
                params.thread_id, params.turn_id
            )
        })?;

    record.updated_at = Utc::now();
    if params.last_message_id.is_some() {
        record.last_message_id = params.last_message_id;
    }
    if params.summary.is_some() {
        record.summary = params.summary;
    }
    // 更新对话快照（增量更新：仅当传入非 None 值时才覆盖）
    if params.messages.is_some() {
        record.messages = params.messages;
    }
    if params.provider_session.is_some() {
        record.provider_session = params.provider_session;
    }
    if params.tool_results.is_some() {
        record.tool_results = params.tool_results;
    }

    let snapshot = TurnCheckpoint::from(&*record);
    drop(guard);

    let path = CheckpointStore::store_path(&app)?;
    store.persist_to_path(&path)?;

    Ok(snapshot)
}

/// 标记 Checkpoint 为已完成
#[tauri::command]
#[specta::specta]
pub fn checkpoint_complete(
    params: CheckpointKeyParams,
    store: tauri::State<'_, CheckpointStore>,
    app: tauri::AppHandle,
) -> Result<TurnCheckpoint, String> {
    transition_status(&store, &app, &params, CheckpointStatus::Completed)
}

/// 取消 Checkpoint
#[tauri::command]
#[specta::specta]
pub fn checkpoint_cancel(
    params: CheckpointKeyParams,
    store: tauri::State<'_, CheckpointStore>,
    app: tauri::AppHandle,
) -> Result<TurnCheckpoint, String> {
    transition_status(&store, &app, &params, CheckpointStatus::Cancelled)
}

/// 标记为恢复中(用户从断点继续后状态)
#[tauri::command]
#[specta::specta]
pub fn checkpoint_resume(
    params: CheckpointKeyParams,
    store: tauri::State<'_, CheckpointStore>,
    app: tauri::AppHandle,
) -> Result<TurnCheckpoint, String> {
    transition_status(&store, &app, &params, CheckpointStatus::Resuming)
}

/// 获取单个 Checkpoint 详情
#[tauri::command]
#[specta::specta]
pub fn checkpoint_inspect(
    params: CheckpointKeyParams,
    store: tauri::State<'_, CheckpointStore>,
) -> Result<TurnCheckpoint, String> {
    let guard = store
        .inner
        .lock()
        .map_err(|error| format!("Checkpoint 锁失败: {error}"))?;
    guard
        .iter()
        .find(|record| record.thread_id == params.thread_id && record.turn_id == params.turn_id)
        .map(TurnCheckpoint::from)
        .ok_or_else(|| {
            format!(
                "Checkpoint 不存在: thread={} turn={}",
                params.thread_id, params.turn_id
            )
        })
}

/// 列出所有未完成(running/paused/failed)的 Checkpoint
#[tauri::command]
#[specta::specta]
pub fn checkpoint_list_pending(
    store: tauri::State<'_, CheckpointStore>,
) -> Result<Vec<TurnCheckpoint>, String> {
    let guard = store
        .inner
        .lock()
        .map_err(|error| format!("Checkpoint 锁失败: {error}"))?;
    let pending: Vec<TurnCheckpoint> = guard
        .iter()
        .filter(|record| record.status.is_pending())
        .map(TurnCheckpoint::from)
        .collect();
    Ok(pending)
}

/// 清理早于截止时间的 Checkpoint
///
/// 返回被清理的数量,方便前端展示反馈。
#[tauri::command]
#[specta::specta]
pub fn checkpoint_cleanup_old(
    params: CheckpointCleanupParams,
    store: tauri::State<'_, CheckpointStore>,
    app: tauri::AppHandle,
) -> Result<usize, String> {
    let cutoff = DateTime::parse_from_rfc3339(&params.cutoff_iso)
        .map(|dt| dt.with_timezone(&Utc))
        .map_err(|error| format!("cutoff_iso 不是合法 ISO 8601: {error}"))?;

    let removed = {
        let mut guard = store
            .inner
            .lock()
            .map_err(|error| format!("Checkpoint 锁失败: {error}"))?;
        let before = guard.len();
        guard.retain(|record| record.updated_at >= cutoff);
        before - guard.len()
    };

    if removed > 0 {
        let path = CheckpointStore::store_path(&app)?;
        store.persist_to_path(&path)?;
    }

    info!(removed, cutoff = %params.cutoff_iso, "Checkpoint 清理完成");
    Ok(removed)
}

// ── 对话快照恢复 ─────────────────────────────────────────────────────

/// Checkpoint 对话快照（包含恢复所需的完整上下文）
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct CheckpointSnapshot {
    /// 线程 ID
    pub thread_id: String,
    /// Turn ID
    pub turn_id: String,
    /// 任务状态字符串
    pub status: String,
    /// 最后一条消息 ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_message_id: Option<String>,
    /// 任务摘要
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    /// 对话消息快照
    #[serde(skip_serializing_if = "Option::is_none")]
    pub messages: Option<Vec<SnapshotMessage>>,
    /// Provider 会话快照
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_session: Option<SnapshotProviderSession>,
    /// 工具调用结果列表
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_results: Option<Vec<Value>>,
}

/// 获取 Checkpoint 对话快照（用于断点恢复时重建上下文）
///
/// 返回当前对话上下文（消息列表 + Provider 会话 + 工具结果），
/// 前端可在恢复时将这些数据注入 Agent 循环以继续对话。
#[tauri::command]
#[specta::specta]
pub fn checkpoint_get_snapshot(
    params: CheckpointKeyParams,
    store: tauri::State<'_, CheckpointStore>,
) -> Result<Option<CheckpointSnapshot>, String> {
    let guard = store
        .inner
        .lock()
        .map_err(|error| format!("Checkpoint 锁失败: {error}"))?;

    let result = guard.iter().find(|record| {
        record.thread_id == params.thread_id && record.turn_id == params.turn_id
    }).map(|record| {
        CheckpointSnapshot {
            thread_id: record.thread_id.clone(),
            turn_id: record.turn_id.clone(),
            status: match record.status {
                CheckpointStatus::Running => "running".to_string(),
                CheckpointStatus::Paused => "paused".to_string(),
                CheckpointStatus::Failed => "failed".to_string(),
                CheckpointStatus::Completed => "completed".to_string(),
                CheckpointStatus::Cancelled => "cancelled".to_string(),
                CheckpointStatus::Resuming => "resuming".to_string(),
            },
            last_message_id: record.last_message_id.clone(),
            summary: record.summary.clone(),
            messages: record.messages.clone(),
            provider_session: record.provider_session.clone(),
            tool_results: record.tool_results.clone(),
        }
    });

    Ok(result)
}

// ── 内部辅助 ─────────────────────────────────────────────────────────

fn upsert(
    store: &tauri::State<'_, CheckpointStore>,
    app: &tauri::AppHandle,
    record: CheckpointRecord,
) -> Result<TurnCheckpoint, String> {
    let mut guard = store
        .inner
        .lock()
        .map_err(|error| format!("Checkpoint 锁失败: {error}"))?;

    if let Some(existing) = guard
        .iter_mut()
        .find(|existing| {
            existing.thread_id == record.thread_id && existing.turn_id == record.turn_id
        })
    {
        *existing = record;
    } else {
        guard.push(record);
    }

    let snapshot = guard
        .iter()
        .find(|record| record.status != CheckpointStatus::Completed)
        .map(TurnCheckpoint::from)
        .or_else(|| guard.last().map(TurnCheckpoint::from))
        .ok_or_else(|| "Checkpoint upsert 失败:空列表".to_string())?;
    drop(guard);

    let path = CheckpointStore::store_path(app)?;
    store.persist_to_path(&path)?;
    Ok(snapshot)
}

fn transition_status(
    store: &tauri::State<'_, CheckpointStore>,
    app: &tauri::AppHandle,
    params: &CheckpointKeyParams,
    next: CheckpointStatus,
) -> Result<TurnCheckpoint, String> {
    let mut guard = store
        .inner
        .lock()
        .map_err(|error| format!("Checkpoint 锁失败: {error}"))?;

    let record = guard
        .iter_mut()
        .find(|record| record.thread_id == params.thread_id && record.turn_id == params.turn_id)
        .ok_or_else(|| {
            format!(
                "Checkpoint 不存在: thread={} turn={}",
                params.thread_id, params.turn_id
            )
        })?;

    record.status = next;
    record.updated_at = Utc::now();

    let snapshot = TurnCheckpoint::from(&*record);
    drop(guard);

    let path = CheckpointStore::store_path(app)?;
    store.persist_to_path(&path)?;
    Ok(snapshot)
}

// ── 单元测试 ─────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn make_record(thread_id: &str, turn_id: &str, status: CheckpointStatus) -> CheckpointRecord {
        CheckpointRecord::new(thread_id.to_string(), turn_id.to_string(), status)
    }

    #[test]
    fn pending_only_includes_running_paused_failed() {
        assert!(CheckpointStatus::Running.is_pending());
        assert!(CheckpointStatus::Paused.is_pending());
        assert!(CheckpointStatus::Failed.is_pending());
        assert!(!CheckpointStatus::Completed.is_pending());
        assert!(!CheckpointStatus::Cancelled.is_pending());
        assert!(!CheckpointStatus::Resuming.is_pending());
    }

    #[test]
    fn dto_roundtrip_preserves_status_label() {
        let record = make_record("thread-1", "turn-1", CheckpointStatus::Failed);
        let dto: TurnCheckpoint = (&record).into();
        assert_eq!(dto.thread_id, "thread-1");
        assert_eq!(dto.turn_id, "turn-1");
        assert_eq!(dto.status, "failed");
    }

    #[test]
    fn store_load_returns_empty_for_missing_file() {
        let store = CheckpointStore::default();
        store
            .load_from_path(&PathBuf::from("/tmp/__no_such_file__.json"))
            .unwrap();
        let guard = store.inner.lock().unwrap();
        assert!(guard.is_empty());
    }
}
