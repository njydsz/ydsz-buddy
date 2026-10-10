//! 遥测与指标命令模块
//!
//! 暴露 TelemetryCollector 数据给前端 PerformanceDashboard / DiagnosticsPanel：
//!
//! | 命令 | 说明 |
//! |------|------|
//! | `telemetry_get_stats` | 获取计数器快照 + 健康分 |
//! | `telemetry_get_recent_events` | 获取最近 N 条事件 |
//! | `telemetry_record_event` | 从前端记录事件 |
//! | `telemetry_reset_counters` | 重置计数器 |

use serde_json::Value;

use ydsz_shared::telemetry::{TelemetryCollector, TelemetryEvent};

/// 获取统计快照 (计数器 + 健康分)
#[tauri::command]
#[specta::specta]
pub fn telemetry_get_stats(
    collector: tauri::State<'_, TelemetryCollector>,
) -> Result<serde_json::Value, String> {
    let counters = collector.snapshot_counters();
    let health_score = collector.provider_health_score();
    let tool_rate = collector.tool_success_rate();

    Ok(serde_json::json!({
        "counters": counters,
        "provider_health_score": health_score,
        "tool_success_rate": tool_rate,
    }))
}

/// 获取最近 N 条事件
#[tauri::command]
#[specta::specta]
pub fn telemetry_get_recent_events(
    collector: tauri::State<'_, TelemetryCollector>,
    limit: Option<usize>,
) -> Result<Vec<(String, Value)>, String> {
    let events = collector.recent_events(limit.unwrap_or(50));
    let result = events
        .into_iter()
        .map(|(ts, event)| {
            let event_json = serde_json::to_value(&event).unwrap_or(Value::Null);
            (ts, event_json)
        })
        .collect();
    Ok(result)
}

/// 从前端记录遥测事件
#[tauri::command]
#[specta::specta]
pub fn telemetry_record_event(
    collector: tauri::State<'_, TelemetryCollector>,
    event: TelemetryEvent,
) -> Result<(), String> {
    collector.record(event);
    Ok(())
}

/// 重置所有计数器（仅在开发者模式调用）
#[tauri::command]
#[specta::specta]
pub fn telemetry_reset_counters(
    collector: tauri::State<'_, TelemetryCollector>,
) -> Result<(), String> {
    collector.reset_counters();
    Ok(())
}

/// 获取聚合诊断数据 (为 DiagnosticsPanel 准备)
#[tauri::command]
#[specta::specta]
pub fn telemetry_get_diagnostics(
    collector: tauri::State<'_, TelemetryCollector>,
) -> Result<serde_json::Value, String> {
    let counters = collector.snapshot_counters();
    let health_score = collector.provider_health_score();
    let tool_rate = collector.tool_success_rate();
    let recent = collector.recent_events(20);

    let recent_summary: Vec<serde_json::Value> = recent
        .into_iter()
        .map(|(ts, event)| {
            serde_json::json!({
                "timestamp": ts,
                "event": event,
            })
        })
        .collect();

    Ok(serde_json::json!({
        "counters": counters,
        "provider_health_score": health_score,
        "tool_success_rate": tool_rate,
        "recent_events": recent_summary,
        "report_generated_at": chrono::Utc::now().to_rfc3339(),
    }))
}
