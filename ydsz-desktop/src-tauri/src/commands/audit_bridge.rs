//! # ToolPipeline → Event Sourcing 审计桥接
//!
//! 将 `ydsz_core::hooks::EventSink` 桥接到 `SqliteEventStore`（Tauri State），
//! 使 ToolPipeline 的 `ActivityLogInterceptor` 能将每次工具调用写入审计事件存储。
//!
//! ## 功能
//!
//! - `EventStoreAdapter`：包装 `SqliteEventStore`，实现 `EventSink` trait
//! - `ToolCallEventEmitter`：供 Tauri 命令便捷地发出 tool_call 审计事件
//!
//! ## 端到端闭环
//!
//! 解决了原先 `ActivityLogInterceptor` 仅做 `tracing::info!` 而造成审计日志为空的问题。
//! 现在每个经过 ToolPipeline 的工具调用都会自动产生 `tool_call` 事件记录。

use std::sync::Arc;

use serde_json::Value;
use tracing::info;

use ydsz_core::error::CoreResult;
use ydsz_core::hooks::EventSink;

/// 事件存储适配器：将 SqliteEventStore 桥接到 ydsz_core::EventSink
///
/// 此类解决架构分层中 ydsz-core（定义 EventSink trait）与 ydzsz-shared
/// （提供 SqliteEventStore 实现）之间的连接问题，避免 ydsz-core 反向依赖 ydzsz-shared。
#[derive(Clone)]
pub struct EventStoreAdapter {
    event_store: ydsz_shared::persistence::SqliteEventStore,
}

impl EventStoreAdapter {
    /// 创建新的适配器
    pub fn new(event_store: ydsz_shared::persistence::SqliteEventStore) -> Self {
        Self { event_store }
    }

    /// 获取内部 Arc（用于传入 ActivityLogInterceptor）
    pub fn into_shared(self) -> Arc<dyn EventSink> {
        Arc::new(self)
    }
}

impl EventSink for EventStoreAdapter {
    async fn append_event(
        &self,
        event_type: &str,
        stream_id: &str,
        payload: &Value,
    ) -> CoreResult<()> {
        info!(
            event_type = %event_type,
            stream_id = %stream_id,
            "审计事件写入"
        );

        self.event_store
            .append(event_type, "system", stream_id, payload)
            .map_err(|e| ydsz_core::error::CoreError::InternalError(format!(
                "写入事件失败: {e}"
            )))
    }
}

/// 便捷函数：构建带真实事件写入的标准 ToolPipeline
///
/// 用法：
/// ```ignore
/// let pipeline = build_audited_pipeline(Some(event_store), permissions);
/// ```
#[allow(dead_code)]
pub fn build_audited_pipeline(
    event_store: Option<ydsz_shared::persistence::SqliteEventStore>,
    required_permissions: Option<std::collections::HashMap<String, ydsz_core::tool_pipeline::PermissionLevel>>,
) -> ydsz_core::tool_pipeline::ToolPipeline {
    use ydsz_core::tool_pipeline::{
        ActivityLogInterceptor, ErrorWrapInterceptor, PermissionAuditInterceptor,
        ParameterValidationInterceptor, ToolPipeline,
    };

    // ActivityLog: 带事件写入能力
    let mut activity_log = ActivityLogInterceptor::new().log_full_payload(false);
    if let Some(store) = event_store {
        activity_log = activity_log.with_event_sink(
            EventStoreAdapter::new(store).into_shared()
        );
    }

    // 权限拦截器
    let mut perm_audit = PermissionAuditInterceptor::new();
    if let Some(perms) = required_permissions {
        for (tool, level) in perms {
            perm_audit = perm_audit.require(tool, level);
        }
    }

    ToolPipeline::new()
        .add(perm_audit)
        .add(ParameterValidationInterceptor::new())
        .add(activity_log)
        .add(ErrorWrapInterceptor::new())
}

/// 直接手动发出审计事件（适用于未走 pipeline 的命令级别执行）
///
/// 对于不走 ToolPipeline 的 Tauri 命令，可以调用此函数手动追加审计事件。
#[allow(dead_code)]
pub fn emit_tool_call_event(
    event_store: &ydsz_shared::persistence::SqliteEventStore,
    tool_name: &str,
    thread_id: &str,
    success: bool,
    elapsed_ms: u64,
    summary: Option<&str>,
) -> Result<String, String> {
    let payload = serde_json::json!({
        "toolName": tool_name,
        "threadId": thread_id,
        "success": success,
        "elapsedMs": elapsed_ms,
        "summary": summary,
        "source": "manual_emit",
    });

    event_store
        .append("tool_call", "system", thread_id, &payload)
        .map_err(|e| format!("写入审计事件失败: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use ydsz_core::hooks::EventSink;

    #[tokio::test]
    async fn test_event_store_adapter() {
        let store = ydsz_shared::persistence::SqliteEventStore::open_in_memory()
            .expect("Failed to create test store");

        let adapter = EventStoreAdapter::new(store.clone());
        let payload = serde_json::json!({
            "toolName": "test_tool",
            "success": true,
            "elapsedMs": 42,
        });

        let result = adapter
            .append_event("tool_call", "thread-1", &payload)
            .await;

        assert!(result.is_ok(), "EventSink 写入应成功");

        // Verify the event was actually stored
        let events = store.query(Some("tool_call"), Some("thread-1"), Some(10))
            .expect("查询失败");
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].event_type, "tool_call");
    }

    #[tokio::test]
    async fn test_build_audited_pipeline() {
        let store = ydsz_shared::persistence::SqliteEventStore::open_in_memory()
            .expect("Failed to create test store");

        let pipeline = build_audited_pipeline(Some(store), None);
        assert_eq!(pipeline.interceptor_count(), 4);
        assert_eq!(pipeline.interceptor_names()[0], "PermissionAudit");
        assert_eq!(pipeline.interceptor_names()[2], "ActivityLog");
    }

    #[tokio::test]
    async fn test_build_pipeline_without_store() {
        let pipeline = build_audited_pipeline(None, None);
        assert_eq!(pipeline.interceptor_count(), 4);
        // 没有 store 时 ActivityLog 降级为纯 tracing，不丢失功能
    }

    #[test]
    fn test_emit_tool_call_event() {
        let store = ydsz_shared::persistence::SqliteEventStore::open_in_memory()
            .expect("Failed to create test store");

        let id = emit_tool_call_event(
            &store,
            "grep",
            "thread-42",
            true,
            15,
            Some("Found 3 matches"),
        );

        assert!(id.is_ok(), "手动事件发出应成功");

        let events = store.query(Some("tool_call"), Some("thread-42"), Some(10)).unwrap();
        assert_eq!(events.len(), 1);
    }
}
