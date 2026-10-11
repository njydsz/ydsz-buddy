//! # 审计导出命令模块
//!
//! 提供审计日志导出功能，支持按时间范围和线程过滤事件流，
//! 导出为 JSON / Markdown / CSV 格式。
//!
//! ## 命令清单
//!
//! | 命令 | 说明 |
//! |------|------|
//! | `audit_export` | 导出审计日志（JSON/Markdown/CSV） |
//!
//! ## 使用场景
//!
//! - 事件时间线工具栏的"导出审计"按钮
//! - 合规性审计需求
//! - 问题排查与调试

use std::path::PathBuf;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tracing::info;

use ydsz_shared::persistence::event_store::EventStore;
use ydsz_shared::persistence::SqliteEventStore;

/// 导出格式
#[derive(Debug, Clone, Copy, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum AuditExportFormat {
    /// JSON 格式
    Json,
    /// Markdown 格式
    Markdown,
    /// CSV 格式
    Csv,
}

/// 审计导出参数
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct AuditExportParams {
    /// 线程 ID（可选，不传则导出全局事件）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thread_id: Option<String>,
    /// 起始时间（ISO 8601 格式，可选）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from: Option<String>,
    /// 结束时间（ISO 8601 格式，可选）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub to: Option<String>,
    /// 导出格式
    pub format: AuditExportFormat,
    /// 输出文件路径
    pub output_path: String,
}

/// 审计导出结果
#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct AuditExportResult {
    /// 导出的事件数量
    pub count: usize,
    /// 输出文件路径
    pub output_path: String,
    /// 导出时间
    pub exported_at: String,
}

/// 导出审计日志
///
/// 从事件存储中读取事件，按时间范围和线程过滤后，
/// 导出为 JSON / Markdown / CSV 格式文件。
///
/// # 参数
///
/// - `params`: 导出参数（线程 ID、时间范围、格式、输出路径）
///
/// # 返回值
///
/// - `Ok(AuditExportResult)`: 导出成功，返回事件数量和输出路径
/// - `Err(String)`: 导出失败
#[tauri::command]
#[specta::specta]
pub async fn audit_export(
    params: AuditExportParams,
    event_store: tauri::State<'_, SqliteEventStore>,
) -> Result<AuditExportResult, String> {
    info!(
        thread_id = ?params.thread_id,
        from = ?params.from,
        to = ?params.to,
        format = ?params.format,
        output_path = %params.output_path,
        "导出审计日志"
    );

    // 解析时间范围
    let from_dt = params
        .from
        .as_ref()
        .map(|s| DateTime::parse_from_rfc3339(s).map(|dt| dt.with_timezone(&Utc)))
        .transpose()
        .map_err(|e| format!("Invalid from timestamp: {}", e))?;

    let to_dt = params
        .to
        .as_ref()
        .map(|s| DateTime::parse_from_rfc3339(s).map(|dt| dt.with_timezone(&Utc)))
        .transpose()
        .map_err(|e| format!("Invalid to timestamp: {}", e))?;

    // 读取所有事件（从序列号 0 开始，限制 100000 条）
    let events = event_store
        .read_events(0, 100_000)
        .map_err(|e| format!("Failed to read events: {}", e))?;

    // 过滤事件
    let filtered_events: Vec<_> = events
        .into_iter()
        .filter(|event| {
            // 时间范围过滤
            if let Some(from) = from_dt {
                if let Ok(event_dt) = DateTime::parse_from_rfc3339(&event.occurred_at) {
                    if event_dt.with_timezone(&Utc) < from {
                        return false;
                    }
                }
            }
            if let Some(to) = to_dt {
                if let Ok(event_dt) = DateTime::parse_from_rfc3339(&event.occurred_at) {
                    if event_dt.with_timezone(&Utc) > to {
                        return false;
                    }
                }
            }

            // 线程 ID 过滤
            if let Some(thread_id) = &params.thread_id {
                if event.stream_id != *thread_id {
                    return false;
                }
            }

            true
        })
        .collect();

    let count = filtered_events.len();

    // 生成导出内容
    let content = match params.format {
        AuditExportFormat::Json => {
            let export_data = serde_json::json!({
                "exported_at": Utc::now().to_rfc3339(),
                "thread_id": params.thread_id,
                "from": params.from,
                "to": params.to,
                "count": count,
                "events": filtered_events,
            });
            serde_json::to_string_pretty(&export_data).map_err(|e| format!("JSON serialization failed: {}", e))?
        }
        AuditExportFormat::Markdown => {
            let mut lines = Vec::new();
            let header = if let Some(thread_id) = &params.thread_id {
                format!("线程审计导出 · {}", thread_id)
            } else {
                "全局审计导出".to_string()
            };
            lines.push(format!("# {}", header));
            lines.push(String::new());
            lines.push(format!("- 生成时间：{}", Utc::now().to_rfc3339()));
            lines.push(format!("- 事件数量：{}", count));
            if let Some(from) = &params.from {
                lines.push(format!("- 起始时间：{}", from));
            }
            if let Some(to) = &params.to {
                lines.push(format!("- 结束时间：{}", to));
            }
            lines.push(String::new());
            lines.push("| 序号 | 时间 | 类型 | 聚合根 | 流 ID |".to_string());
            lines.push("| --- | --- | --- | --- | --- |".to_string());

            for event in &filtered_events {
                lines.push(format!(
                    "| {} | {} | `{}` | {} | {} |",
                    event.sequence,
                    event.occurred_at,
                    event.event_type,
                    event.aggregate_kind,
                    event.stream_id
                ));
            }

            lines.join("\n")
        }
        AuditExportFormat::Csv => {
            let mut rows = Vec::new();
            rows.push("sequence,occurred_at,event_type,aggregate_kind,stream_id".to_string());
            for event in &filtered_events {
                rows.push(format!(
                    "{},{},{},{},{}",
                    event.sequence,
                    csv_escape(&event.occurred_at),
                    csv_escape(&event.event_type),
                    csv_escape(&event.aggregate_kind),
                    csv_escape(&event.stream_id),
                ));
            }
            rows.join("\n")
        }
    };

    // 写入文件
    let output_path = PathBuf::from(&params.output_path);
    if let Some(parent) = output_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {}", e))?;
    }
    std::fs::write(&output_path, content).map_err(|e| format!("Failed to write file: {}", e))?;

    Ok(AuditExportResult {
        count,
        output_path: params.output_path,
        exported_at: Utc::now().to_rfc3339(),
    })
}

/// CSV 字段转义：包含逗号、双引号或换行时，用双引号包裹，内部双引号转义为两个双引号
fn csv_escape(value: &str) -> String {
    if value.contains(',') || value.contains('"') || value.contains('\n') {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value.to_string()
    }
}
