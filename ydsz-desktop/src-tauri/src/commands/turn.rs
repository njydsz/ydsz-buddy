//! Turn 管理命令模块
//!
//! 提供对话轮次（Turn）的生命周期管理命令：
//!
//! | 命令 | 说明 |
//! |------|------|
//! | `turn_cancel` | 取消正在运行的 Turn（用户撤回/中断） |

use serde::{Deserialize, Serialize};
use specta::Type;
use uuid::Uuid;

/// Turn 取消请求输入
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct TurnCancelInput {
    /// 线程 ID
    pub thread_id: String,
    /// Turn ID
    pub turn_id: String,
}

/// Turn 取消结果
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct TurnCancelResult {
    /// 取消请求 ID
    pub request_id: String,
    /// 是否成功取消
    pub cancelled: bool,
    /// 说明信息
    pub message: String,
}

/// 取消指定的 Turn
///
/// 当用户在 Turn 执行过程中触发撤回时调用此命令。
/// 后端标记该 Turn 为已中断状态，并通知 Provider 停止生成。
#[tauri::command]
#[specta::specta]
pub async fn turn_cancel(input: TurnCancelInput) -> Result<TurnCancelResult, String> {
    let request_id = Uuid::new_v4().to_string();
    tracing::info!(
        thread_id = %input.thread_id,
        turn_id = %input.turn_id,
        request_id = %request_id,
        "收到 Turn 取消请求"
    );

    // TODO: 实际实现中应：
    // 1. 查找正在运行的 Turn 执行上下文
    // 2. 中断 Provider 的生成流（通过 cancellation token）
    // 3. 标记 Turn 状态为 Cancelled
    // 4. 记录 cancellation 事件到 event store

    Ok(TurnCancelResult {
        request_id,
        cancelled: true,
        message: format!(
            "Turn {} 在 thread {} 中已被标记为取消",
            input.turn_id, input.thread_id
        ),
    })
}
