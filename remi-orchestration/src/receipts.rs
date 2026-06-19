//! 运行时回执总线（RuntimeReceiptBus）。
//!
//! 大厂标准的编排引擎要求反应器以**可观察**的方式完成副作用：
//! - 反应器执行完成后必须发送一条**回执**（Receipt）
//! - 编排引擎、外部订阅者、UI 都能订阅回执流
//! - 回执可与 `OrchestrationEvent` 关联（causation_id）但**不**混入事件流
//!
//! 这避免了"fire-and-forget"反应器难以调试的痛点，同时保持事件流
//! 的纯净（事件流 = 真相来源；回执流 = 副作用观察）。
//!
//! # 用法
//!
//! ```no_run
//! use remi_orchestration::receipts::{RuntimeReceiptBus, ReceiptKind};
//!
//! let bus = RuntimeReceiptBus::new(256);
//! let mut rx = bus.subscribe();
//! // 发送回执
//! bus.publish(ReceiptKind::CheckpointCompleted { /* ... */ });
//! ```

use remi_contracts::ThreadId;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::broadcast;
use tracing::trace;
use uuid::Uuid;

/// 运行时回执类型。
///
/// 回执是反应器完成副作用后向外部世界发出的"我已完成"通知，
/// 与编排事件解耦，使 UI/HTTP/调试器能精确知道副作用落点。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "_tag")]
pub enum ReceiptKind {
    /// 检查点已写入磁盘。
    CheckpointCompleted {
        thread_id: ThreadId,
        checkpoint_id: String,
        turn_id: Uuid,
        duration_ms: u64,
    },
    /// 检查点写入失败。
    CheckpointFailed {
        thread_id: ThreadId,
        checkpoint_id: String,
        error: String,
    },
    /// 轮次已转为静默（无新事件）。
    TurnQuiescent {
        thread_id: ThreadId,
        turn_id: Uuid,
        idle_ms: u64,
    },
    /// Diff 已最终化（写入 projection_diff_blobs）。
    DiffFinalized {
        thread_id: ThreadId,
        turn_id: Uuid,
        files_changed: u32,
        blob_size: usize,
    },
    /// 摄取已空闲（没有新事件需要处理）。
    IngestionIdle {
        thread_id: ThreadId,
        last_event_seq: i64,
    },
    /// Git 自动提交已完成。
    GitAutoCommitCompleted {
        thread_id: ThreadId,
        commit_sha: String,
        files_committed: u32,
    },
    /// Git 自动提交失败。
    GitAutoCommitFailed {
        thread_id: ThreadId,
        error: String,
    },
    /// 通知已投递。
    NotificationDelivered {
        channel: String,
        target: String,
    },
    /// 遥测已上报。
    TelemetryReported {
        event_name: String,
        duration_ms: u64,
    },
    /// 审批请求已发送到 UI。
    ApprovalRequestedDelivered {
        request_id: Uuid,
        thread_id: ThreadId,
    },
    /// 自定义回执。
    Custom {
        kind: String,
        payload: serde_json::Value,
    },
}

/// 运行时回执。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeReceipt {
    /// 回执唯一 ID。
    pub receipt_id: Uuid,
    /// 关联的编排事件 ID（如有）。
    pub causation_event_id: Option<String>,
    /// 关联的会话 ID（如有）。
    pub thread_id: Option<ThreadId>,
    /// 回执创建时间戳。
    pub timestamp: String,
    /// 回执具体类型。
    pub kind: ReceiptKind,
}

impl RuntimeReceipt {
    /// 创建一个新回执。
    pub fn new(kind: ReceiptKind) -> Self {
        Self {
            receipt_id: Uuid::new_v4(),
            causation_event_id: None,
            thread_id: None,
            timestamp: chrono::Utc::now().to_rfc3339(),
            kind,
        }
    }

    /// 关联一个事件 ID。
    pub fn with_causation(mut self, event_id: impl Into<String>) -> Self {
        self.causation_event_id = Some(event_id.into());
        self
    }

    /// 关联一个会话 ID。
    pub fn with_thread(mut self, thread_id: ThreadId) -> Self {
        self.thread_id = Some(thread_id);
        self
    }
}

/// 运行时回执总线。
///
/// 基于 tokio::sync::broadcast 实现，支持多订阅者。
/// 默认容量 256，溢出时回执会被丢弃（仅打印 trace 警告）。
#[derive(Clone)]
pub struct RuntimeReceiptBus {
    tx: broadcast::Sender<RuntimeReceipt>,
}

impl std::fmt::Debug for RuntimeReceiptBus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("RuntimeReceiptBus")
            .field("receiver_count", &self.tx.receiver_count())
            .finish()
    }
}

impl Default for RuntimeReceiptBus {
    fn default() -> Self {
        Self::new(256)
    }
}

impl RuntimeReceiptBus {
    /// 创建一个新的回执总线。
    pub fn new(capacity: usize) -> Self {
        let (tx, _) = broadcast::channel(capacity);
        Self { tx }
    }

    /// 发送一条回执（不关心接收者数量）。
    pub fn publish(&self, kind: ReceiptKind) {
        self.publish_with_id(None, None, kind);
    }

    /// 发送一条带上下文的回执。
    pub fn publish_with_id(
        &self,
        causation_event_id: Option<String>,
        thread_id: Option<ThreadId>,
        kind: ReceiptKind,
    ) {
        let mut receipt = RuntimeReceipt::new(kind);
        receipt.causation_event_id = causation_event_id;
        receipt.thread_id = thread_id;
        // send 失败仅表示无订阅者；正常情况。
        match self.tx.send(receipt) {
            Ok(n) => trace!(receivers = n, "回执已广播"),
            Err(_) => trace!("回执发送失败：没有订阅者"),
        }
    }

    /// 订阅回执流。
    pub fn subscribe(&self) -> broadcast::Receiver<RuntimeReceipt> {
        self.tx.subscribe()
    }

    /// 当前订阅者数量。
    pub fn receiver_count(&self) -> usize {
        self.tx.receiver_count()
    }
}

/// 共享指针别名。
pub type SharedReceiptBus = Arc<RuntimeReceiptBus>;

/// 反应器回执助手 trait。
///
/// 反应器实现该 trait 后可简化回执发送逻辑。
pub trait ReceiptEmitter: Send + Sync {
    /// 发出回执。
    fn emit(&self, kind: ReceiptKind);
}

impl ReceiptEmitter for RuntimeReceiptBus {
    fn emit(&self, kind: ReceiptKind) {
        self.publish(kind);
    }
}

impl ReceiptEmitter for Arc<RuntimeReceiptBus> {
    fn emit(&self, kind: ReceiptKind) {
        self.publish(kind);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_publish_and_subscribe() {
        let bus = RuntimeReceiptBus::new(16);
        let mut rx = bus.subscribe();

        bus.publish(ReceiptKind::CheckpointCompleted {
            thread_id: ThreadId::new(),
            checkpoint_id: "cp-1".to_string(),
            turn_id: Uuid::new_v4(),
            duration_ms: 42,
        });

        let receipt = rx.recv().await.unwrap();
        assert!(matches!(receipt.kind, ReceiptKind::CheckpointCompleted { .. }));
    }

    #[tokio::test]
    async fn test_publish_with_context() {
        let bus = RuntimeReceiptBus::new(16);
        let mut rx = bus.subscribe();
        let thread_id = ThreadId::new();

        bus.publish_with_id(
            Some("evt-1".to_string()),
            Some(thread_id),
            ReceiptKind::DiffFinalized {
                thread_id,
                turn_id: Uuid::new_v4(),
                files_changed: 3,
                blob_size: 1024,
            },
        );

        let receipt = rx.recv().await.unwrap();
        assert_eq!(receipt.causation_event_id.as_deref(), Some("evt-1"));
        assert_eq!(receipt.thread_id, Some(thread_id));
    }

    #[test]
    fn test_receipt_new_with_causation() {
        let thread_id = ThreadId::new();
        let receipt = RuntimeReceipt::new(ReceiptKind::TurnQuiescent {
            thread_id,
            turn_id: Uuid::new_v4(),
            idle_ms: 100,
        })
        .with_causation("evt-42")
        .with_thread(thread_id);

        assert_eq!(receipt.causation_event_id.as_deref(), Some("evt-42"));
        assert_eq!(receipt.thread_id, Some(thread_id));
    }
}
