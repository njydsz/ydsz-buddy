//! # 事件存储补充命令
//!
//! 提供追加事件到 SqliteEventStore 的 Tauri 命令，
//! 确保审计事件不会因为只注入 State 而无法被写入。
//!
//! 通过 `OrchestrationCommand` 分发的命令结果如果不主动追加事件到 store，
//! `audit_export` 总是导出空列表。此模块提供手动 append 入口。

use tauri::State;
use tracing::info;

use ydsz_shared::persistence::SqliteEventStore;

/// 追加一个审计事件到事件存储
#[tauri::command]
#[specta::specta]
pub async fn event_store_append(
    event_store: State<'_, SqliteEventStore>,
    event_type: String,
    stream_id: Option<String>,
    payload: serde_json::Value,
) -> Result<String, String> {
    info!(event_type = %event_type, "追加审计事件");

    let id = event_store
        .append(
            &event_type,
            "system",
            stream_id.as_deref().unwrap_or("global"),
            &payload,
        )
        .map_err(|e| format!("Failed to append event: {}", e))?;

    Ok(id)
}

/// 查询审计事件（按类型和流 ID 过滤）
#[tauri::command]
#[specta::specta]
pub async fn event_store_query(
    event_store: State<'_, SqliteEventStore>,
    event_type: Option<String>,
    stream_id: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<ydsz_shared::persistence::EventRecord>, String> {
    event_store
        .query(event_type.as_deref(), stream_id.as_deref(), limit)
        .map_err(|e| format!("Failed to query events: {}", e))
}

/// 获取事件总数
#[tauri::command]
#[specta::specta]
pub async fn event_store_count(
    event_store: State<'_, SqliteEventStore>,
) -> Result<u64, String> {
    event_store
        .count()
        .map_err(|e| format!("Failed to count events: {}", e))
}
