//! # 运行时收据总线
//!
//! 本模块实现了运行时收据的发布-订阅机制，用于在编排层内部传递重要的运行时事件。
//!
//! ## 核心职责
//!
//! - 发布和订阅运行时收据（Receipt）
//! - 支持检查点基线捕获、差异最终确定、Turn 处理静止等事件
//! - 通过广播通道实现多订阅者并发消费
//!
//! ## 架构设计
//!
//! ```text
//! ┌─────────────────────────────────────────────────────────┐
//! │                RuntimeReceiptBus                         │
//! ├─────────────────────────────────────────────────────────┤
//! │                                                          │
//! │  ┌──────────────┐    ┌──────────────────────────────┐  │
//! │  │ publish()    │───→│  broadcast::Sender           │  │
//! │  │ (发布收据)   │    │  (广播通道发送端)              │  │
//! │  └──────────────┘    └──────────────────────────────┘  │
//! │                          │                              │
//! │                          ↓                              │
//! │  ┌──────────────┐    ┌──────────────────────────────┐  │
//! │  │ stream()     │←───│  broadcast::Receiver         │  │
//! │  │ (订阅收据流) │    │  (广播通道接收端)              │  │
//! │  └──────────────┘    └──────────────────────────────┘  │
//! │                                                          │
//! └─────────────────────────────────────────────────────────┘
//! ```
//!
//! ## 收据类型
//!
//! | 类型 | 说明 |
//! |------|------|
//! | `CheckpointBaselineCaptured` | 检查点基线已捕获 |
//! | `CheckpointDiffFinalized` | 检查点差异已最终确定 |
//! | `TurnProcessingQuiesced` | Turn 处理已静止 |

use remi_core::models::{CheckpointId, ThreadId, TurnId};
use serde::{Deserialize, Serialize};
use tokio::sync::broadcast;

/// # 运行时收据枚举
///
/// 系统所有运行时收据的聚合类型。每个变体对应一个具体的收据结构体。
/// 收据通过 `serde` 的标签联合机制序列化，使用 `_type` 字段区分变体。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "_type", rename_all = "kebab-case")]
pub enum OrchestrationRuntimeReceipt {
    /// 检查点基线已捕获
    #[serde(rename = "checkpoint.baseline.captured")]
    CheckpointBaselineCaptured(CheckpointBaselineCapturedReceipt),

    /// 检查点差异已最终确定
    #[serde(rename = "checkpoint.diff.finalized")]
    CheckpointDiffFinalized(CheckpointDiffFinalizedReceipt),

    /// Turn 处理已静止
    #[serde(rename = "turn.processing.quiesced")]
    TurnProcessingQuiesced(TurnProcessingQuiescedReceipt),
}

/// # 检查点基线捕获收据
///
/// 当检查点基线被成功捕获时产生。
///
/// ## 字段说明
///
/// - `thread_id`: 线程 ID
/// - `checkpoint_turn_count`: 检查点 Turn 计数
/// - `checkpoint_ref`: 检查点引用
/// - `created_at`: 创建时间
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckpointBaselineCapturedReceipt {
    /// 线程 ID
    pub thread_id: ThreadId,
    /// 检查点 Turn 计数
    pub checkpoint_turn_count: u32,
    /// 检查点引用
    pub checkpoint_ref: CheckpointId,
    /// 创建时间（UTC）
    pub created_at: chrono::DateTime<chrono::Utc>,
}

/// # 检查点差异最终确定收据
///
/// 当检查点差异被最终确定时产生。
///
/// ## 字段说明
///
/// - `thread_id`: 线程 ID
/// - `turn_id`: Turn ID
/// - `checkpoint_turn_count`: 检查点 Turn 计数
/// - `checkpoint_ref`: 检查点引用
/// - `status`: 状态（ready / missing / error）
/// - `created_at`: 创建时间
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckpointDiffFinalizedReceipt {
    /// 线程 ID
    pub thread_id: ThreadId,
    /// Turn ID
    pub turn_id: TurnId,
    /// 检查点 Turn 计数
    pub checkpoint_turn_count: u32,
    /// 检查点引用
    pub checkpoint_ref: CheckpointId,
    /// 状态
    pub status: CheckpointDiffStatus,
    /// 创建时间（UTC）
    pub created_at: chrono::DateTime<chrono::Utc>,
}

/// # 检查点差异状态枚举
///
/// 表示检查点差异的最终状态。
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum CheckpointDiffStatus {
    /// 差异已准备好
    Ready,
    /// 差异缺失
    Missing,
    /// 差异处理出错
    Error,
}

/// # Turn 处理静止收据
///
/// 当 Turn 处理进入静止状态时产生。
///
/// ## 字段说明
///
/// - `thread_id`: 线程 ID
/// - `turn_id`: Turn ID
/// - `checkpoint_turn_count`: 检查点 Turn 计数
/// - `created_at`: 创建时间
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TurnProcessingQuiescedReceipt {
    /// 线程 ID
    pub thread_id: ThreadId,
    /// Turn ID
    pub turn_id: TurnId,
    /// 检查点 Turn 计数
    pub checkpoint_turn_count: u32,
    /// 创建时间（UTC）
    pub created_at: chrono::DateTime<chrono::Utc>,
}

/// # 运行时收据总线
///
/// 基于 tokio broadcast 通道实现的发布-订阅系统。
/// 支持多发布者和多订阅者并发操作。
///
/// ## 核心功能
///
/// - `publish`: 发布收据到总线
/// - `subscribe`: 订阅收据流
/// - `stream`: 获取收据流（返回接收端）
pub struct RuntimeReceiptBus {
    /// 广播通道发送端
    sender: broadcast::Sender<OrchestrationRuntimeReceipt>,
}

impl RuntimeReceiptBus {
    /// 创建新的运行时收据总线实例
    ///
    /// # 参数
    ///
    /// - `capacity`: 广播通道容量（最多缓存多少条未消费的消息）
    ///
    /// # 返回值
    ///
    /// 返回新创建的 `RuntimeReceiptBus` 实例
    pub fn new(capacity: usize) -> Self {
        let (sender, _) = broadcast::channel(capacity);
        Self { sender }
    }

    /// 发布收据到总线
    ///
    /// 将收据发送到广播通道，所有订阅者都会收到该收据。
    /// 如果没有订阅者，收据会被丢弃。
    ///
    /// # 参数
    ///
    /// - `receipt`: 要发布的运行时收据
    ///
    /// # 返回值
    ///
    /// 成功时返回 `Ok(())`，失败时返回广播错误
    pub fn publish(&self, receipt: OrchestrationRuntimeReceipt) -> Result<(), broadcast::error::SendError<OrchestrationRuntimeReceipt>> {
        self.sender.send(receipt)?;
        Ok(())
    }

    /// 订阅收据流
    ///
    /// 创建一个新的接收端，用于接收后续发布的收据。
    /// 每个订阅者都会独立接收所有收据的副本。
    ///
    /// # 返回值
    ///
    /// 返回广播通道的接收端
    pub fn subscribe(&self) -> broadcast::Receiver<OrchestrationRuntimeReceipt> {
        self.sender.subscribe()
    }

    /// 获取收据流（返回接收端）
    ///
    /// 这是 `subscribe` 的别名，用于保持与 PeakCode 的 API 一致性。
    ///
    /// # 返回值
    ///
    /// 返回广播通道的接收端
    pub fn stream(&self) -> broadcast::Receiver<OrchestrationRuntimeReceipt> {
        self.subscribe()
    }
}

impl Clone for RuntimeReceiptBus {
    fn clone(&self) -> Self {
        Self {
            sender: self.sender.clone(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    #[tokio::test]
    async fn test_publish_and_subscribe() {
        let bus = RuntimeReceiptBus::new(100);
        let mut receiver = bus.subscribe();

        let receipt = OrchestrationRuntimeReceipt::CheckpointBaselineCaptured(
            CheckpointBaselineCapturedReceipt {
                thread_id: Uuid::new_v4(),
                checkpoint_turn_count: 1,
                checkpoint_ref: "test-ref".to_string(),
                created_at: chrono::Utc::now(),
            },
        );

        bus.publish(receipt.clone()).unwrap();

        let received = receiver.recv().await.unwrap();
        match received {
            OrchestrationRuntimeReceipt::CheckpointBaselineCaptured(r) => {
                assert_eq!(r.checkpoint_turn_count, 1);
            }
            _ => panic!("Unexpected receipt type"),
        }
    }

    #[tokio::test]
    async fn test_multiple_subscribers() {
        let bus = RuntimeReceiptBus::new(100);
        let mut receiver1 = bus.subscribe();
        let mut receiver2 = bus.subscribe();

        let receipt = OrchestrationRuntimeReceipt::TurnProcessingQuiesced(
            TurnProcessingQuiescedReceipt {
                thread_id: ThreadId::new_v4(),
                turn_id: "turn-1".to_string(),
                checkpoint_turn_count: 2,
                created_at: chrono::Utc::now(),
            },
        );

        bus.publish(receipt).unwrap();

        // 两个订阅者都应该收到收据
        let _ = receiver1.recv().await.unwrap();
        let _ = receiver2.recv().await.unwrap();
    }
}
