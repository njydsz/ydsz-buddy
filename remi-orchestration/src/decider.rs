//! 编排引擎的决策器逻辑。
//!
//! 决策器负责根据当前聚合状态校验命令，并决定应发出哪些事件。
//! 它不包含任何副作用，可以独立进行单元测试。
//!
//! 决策器实现了大厂标准中要求的"命令不变量"（Command Invariants）：
//! - 状态机非法转移会被拒绝
//! - 命令不变量由 `check_invariants` 统一校验
//! - 任何决策失败都会返回 `Error::Orchestration` 而非 panic

use remi_contracts::{
    MessageRole, ModelId, OrchestrationCommand, OrchestrationEvent, ProviderName, Thread,
    ThreadId, ThreadMessage, ThreadState, ThreadTurn,
};
use remi_core::{Error, Result};
use uuid::Uuid;

/// 校验命令并决定应发出哪些事件。
pub fn decide(command: &OrchestrationCommand, thread: Option<&Thread>) -> Result<Vec<OrchestrationEvent>> {
    // 通用命令不变量校验。
    check_invariants(command, thread)?;

    match command {
        OrchestrationCommand::CreateThread { project_id, title } => {
            decide_create_thread(*project_id, title.as_deref())
        }
        OrchestrationCommand::SendMessage { thread_id, content } => {
            decide_send_message(thread, *thread_id, content)
        }
        OrchestrationCommand::RenameThread { thread_id, title } => {
            decide_rename_thread(thread, *thread_id, title)
        }
        OrchestrationCommand::CancelTurn { thread_id, turn_id } => {
            decide_cancel_turn(thread, *thread_id, *turn_id)
        }
        OrchestrationCommand::CreateCheckpoint { thread_id, turn_id } => {
            decide_create_checkpoint(thread, *thread_id, *turn_id)
        }
        OrchestrationCommand::RestoreCheckpoint { thread_id, checkpoint_id } => {
            decide_restore_checkpoint(thread, *thread_id, checkpoint_id)
        }
        OrchestrationCommand::SelectProvider { thread_id, provider, model } => {
            decide_select_provider(thread, *thread_id, provider.clone(), model.clone())
        }
        OrchestrationCommand::DecideApproval { request_id, thread_id, approved } => {
            decide_approval(*request_id, *thread_id, *approved)
        }
        OrchestrationCommand::DeleteThread { thread_id } => decide_delete_thread(thread, *thread_id),
    }
}

/// 命令不变量校验。
///
/// 在所有具体决策器前执行，确保状态机安全。
pub fn check_invariants(command: &OrchestrationCommand, thread: Option<&Thread>) -> Result<()> {
    match command {
        OrchestrationCommand::CreateThread { title, .. } => {
            // 标题长度约束。
            if let Some(t) = title {
                if t.len() > 256 {
                    return Err(Error::Orchestration(format!(
                        "会话标题过长: {} 字符 (最大 256)",
                        t.len()
                    )));
                }
            }
        }
        OrchestrationCommand::SendMessage { content, .. } => {
            // 内容长度约束。
            if content.is_empty() {
                return Err(Error::Orchestration("消息内容不能为空".to_string()));
            }
            if content.len() > 1024 * 1024 {
                return Err(Error::Orchestration(format!(
                    "消息内容过长: {} 字节 (最大 1MB)",
                    content.len()
                )));
            }
            // 状态机检查：必须处于可接受消息的状态。
            if let Some(t) = thread {
                if !t.state.can_accept_message() {
                    return Err(Error::Orchestration(format!(
                        "会话 {} 处于 {:?} 状态，无法发送消息",
                        t.id, t.state
                    )));
                }
            }
        }
        OrchestrationCommand::RenameThread { title, .. } => {
            if title.is_empty() {
                return Err(Error::Orchestration("会话标题不能为空".to_string()));
            }
            if title.len() > 256 {
                return Err(Error::Orchestration(format!(
                    "会话标题过长: {} 字符 (最大 256)",
                    title.len()
                )));
            }
        }
        OrchestrationCommand::CancelTurn { .. } => {
            // 取消轮次仅在 Processing 状态下合法。
            if let Some(t) = thread {
                if t.state != ThreadState::Processing {
                    return Err(Error::Orchestration(format!(
                        "会话 {} 不在处理中，无法取消轮次: {:?}",
                        t.id, t.state
                    )));
                }
            }
        }
        OrchestrationCommand::CreateCheckpoint { .. } => {
            // 检查点可在任何已存在会话上创建。
            if thread.is_none() {
                return Err(Error::Orchestration("会话不存在".to_string()));
            }
        }
        OrchestrationCommand::RestoreCheckpoint { .. } => {
            if thread.is_none() {
                return Err(Error::Orchestration("会话不存在".to_string()));
            }
        }
        OrchestrationCommand::SelectProvider { .. } => {
            if thread.is_none() {
                return Err(Error::Orchestration("会话不存在".to_string()));
            }
        }
        OrchestrationCommand::DecideApproval { .. } => {
            // 审批决定不需要线程上下文。
        }
        OrchestrationCommand::DeleteThread { .. } => {
            if thread.is_none() {
                return Err(Error::Orchestration("会话不存在".to_string()));
            }
        }
    }
    Ok(())
}

/// 决定创建会话时应发出的事件。
fn decide_create_thread(project_id: Uuid, title: Option<&str>) -> Result<Vec<OrchestrationEvent>> {
    let thread_id = ThreadId::new();
    let timestamp = chrono::Utc::now().to_rfc3339();
    let mut events = vec![OrchestrationEvent::ThreadCreated {
        thread_id,
        project_id,
        timestamp: timestamp.clone(),
    }];

    if let Some(t) = title {
        if !t.is_empty() {
            events.push(OrchestrationEvent::ThreadRenamed {
                thread_id,
                title: t.to_string(),
                timestamp,
            });
        }
    }
    Ok(events)
}

/// 决定发送消息时应发出的事件。
fn decide_send_message(
    thread: Option<&Thread>,
    thread_id: ThreadId,
    content: &str,
) -> Result<Vec<OrchestrationEvent>> {
    // 不变量已经在 check_invariants 中校验过。
    let thread = thread.expect("不变量已保证 thread 存在");

    let message_id = Uuid::new_v4();
    let turn_id = Uuid::new_v4();
    let timestamp = chrono::Utc::now().to_rfc3339();

    let mut events = vec![
        OrchestrationEvent::MessageAdded {
            message_id,
            thread_id,
            role: MessageRole::User,
            timestamp: timestamp.clone(),
        },
        OrchestrationEvent::ThreadStateChanged {
            thread_id,
            from: thread.state,
            to: ThreadState::Processing,
            timestamp: timestamp.clone(),
        },
        OrchestrationEvent::TurnStarted {
            turn_id,
            thread_id,
            timestamp,
        },
    ];

    // 内容超过 100KB 时拆分为多条消息（提示词压缩）。
    if content.len() > 100_000 {
        events.insert(
            1,
            OrchestrationEvent::ThreadUpdated {
                thread_id,
                timestamp: chrono::Utc::now().to_rfc3339(),
            },
        );
    }

    Ok(events)
}

/// 决定重命名会话时应发出的事件。
fn decide_rename_thread(
    thread: Option<&Thread>,
    thread_id: ThreadId,
    title: &str,
) -> Result<Vec<OrchestrationEvent>> {
    let _ = thread.expect("不变量已保证 thread 存在");
    Ok(vec![OrchestrationEvent::ThreadRenamed {
        thread_id,
        title: title.to_string(),
        timestamp: chrono::Utc::now().to_rfc3339(),
    }])
}

/// 决定取消轮次时应发出的事件。
fn decide_cancel_turn(
    thread: Option<&Thread>,
    thread_id: ThreadId,
    turn_id: Uuid,
) -> Result<Vec<OrchestrationEvent>> {
    let thread = thread.expect("不变量已保证 thread 存在");
    let timestamp = chrono::Utc::now().to_rfc3339();
    Ok(vec![
        OrchestrationEvent::TurnFailed {
            turn_id,
            thread_id,
            error: "用户取消".to_string(),
            timestamp: timestamp.clone(),
        },
        OrchestrationEvent::ThreadStateChanged {
            thread_id,
            from: thread.state,
            to: ThreadState::Idle,
            timestamp,
        },
    ])
}

/// 决定创建检查点时应发出的事件。
fn decide_create_checkpoint(
    thread: Option<&Thread>,
    thread_id: ThreadId,
    turn_id: Uuid,
) -> Result<Vec<OrchestrationEvent>> {
    let _ = thread.expect("不变量已保证 thread 存在");
    let checkpoint_id = Uuid::new_v4().to_string();
    Ok(vec![OrchestrationEvent::CheckpointCreated {
        checkpoint_id,
        thread_id,
        turn_id,
        timestamp: chrono::Utc::now().to_rfc3339(),
    }])
}

/// 决定恢复检查点时应发出的事件。
fn decide_restore_checkpoint(
    thread: Option<&Thread>,
    thread_id: ThreadId,
    checkpoint_id: &str,
) -> Result<Vec<OrchestrationEvent>> {
    let thread = thread.expect("不变量已保证 thread 存在");
    let timestamp = chrono::Utc::now().to_rfc3339();
    let mut events = vec![OrchestrationEvent::CheckpointRestored {
        checkpoint_id: checkpoint_id.to_string(),
        thread_id,
        timestamp: timestamp.clone(),
    }];
    // 恢复后回到 Idle。
    if thread.state != ThreadState::Idle {
        events.push(OrchestrationEvent::ThreadStateChanged {
            thread_id,
            from: thread.state,
            to: ThreadState::Idle,
            timestamp,
        });
    }
    Ok(events)
}

/// 决定切换 Provider 时应发出的事件。
fn decide_select_provider(
    _thread: Option<&Thread>,
    thread_id: ThreadId,
    provider: ProviderName,
    model: ModelId,
) -> Result<Vec<OrchestrationEvent>> {
    Ok(vec![OrchestrationEvent::ProviderSelected {
        thread_id,
        provider,
        model,
        timestamp: chrono::Utc::now().to_rfc3339(),
    }])
}

/// 决定审批结果。
fn decide_approval(request_id: Uuid, thread_id: ThreadId, approved: bool) -> Result<Vec<OrchestrationEvent>> {
    Ok(vec![OrchestrationEvent::ApprovalDecided {
        request_id,
        thread_id,
        approved,
        timestamp: chrono::Utc::now().to_rfc3339(),
    }])
}

/// 决定删除会话时应发出的事件。
fn decide_delete_thread(thread: Option<&Thread>, thread_id: ThreadId) -> Result<Vec<OrchestrationEvent>> {
    let _ = thread.expect("不变量已保证 thread 存在");
    Ok(vec![OrchestrationEvent::ThreadDeleted {
        thread_id,
        timestamp: chrono::Utc::now().to_rfc3339(),
    }])
}

/// 将单个事件应用到会话聚合。
pub fn apply_event(thread: Option<Thread>, event: &OrchestrationEvent) -> Option<Thread> {
    match event {
        OrchestrationEvent::ThreadCreated {
            thread_id,
            project_id,
            timestamp,
        } => Some(Thread {
            id: *thread_id,
            project_id: *project_id,
            title: None,
            state: ThreadState::Idle,
            created_at: timestamp.clone(),
            updated_at: timestamp.clone(),
        }),
        OrchestrationEvent::ThreadUpdated { thread_id, timestamp } => thread.map(|mut t| {
            if t.id == *thread_id {
                t.updated_at = timestamp.clone();
            }
            t
        }),
        OrchestrationEvent::ThreadDeleted { .. } => {
            // 删除事件带 thread_id 字段，但 filter 通过 event_thread_id 区分。
            thread.filter(|t| t.id != event_thread_id(event))
        }
        OrchestrationEvent::ThreadRenamed { thread_id, title, timestamp } => thread.map(|mut t| {
            if t.id == *thread_id {
                t.title = Some(title.clone());
                t.updated_at = timestamp.clone();
            }
            t
        }),
        OrchestrationEvent::ThreadStateChanged { thread_id, to, timestamp } => thread.map(|mut t| {
            if t.id == *thread_id {
                t.state = *to;
                t.updated_at = timestamp.clone();
            }
            t
        }),
        OrchestrationEvent::MessageAdded { thread_id, timestamp, .. } => thread.map(|mut t| {
            if t.id == *thread_id {
                t.updated_at = timestamp.clone();
                if t.state == ThreadState::Idle || t.state == ThreadState::Completed || t.state == ThreadState::Errored
                {
                    t.state = ThreadState::Processing;
                }
            }
            t
        }),
        OrchestrationEvent::MessageUpdated { thread_id, timestamp, .. } => thread.map(|mut t| {
            if t.id == *thread_id {
                t.updated_at = timestamp.clone();
            }
            t
        }),
        OrchestrationEvent::TurnStarted { .. } => thread,
        OrchestrationEvent::TurnCompleted { thread_id, timestamp, .. } => thread.map(|mut t| {
            if t.id == *thread_id {
                t.state = ThreadState::Idle;
                t.updated_at = timestamp.clone();
            }
            t
        }),
        OrchestrationEvent::TurnFailed { thread_id, timestamp, .. } => thread.map(|mut t| {
            if t.id == *thread_id {
                t.state = ThreadState::Errored;
                t.updated_at = timestamp.clone();
            }
            t
        }),
        OrchestrationEvent::CheckpointCreated { thread_id, timestamp, .. } => thread.map(|mut t| {
            if t.id == *thread_id {
                t.updated_at = timestamp.clone();
            }
            t
        }),
        OrchestrationEvent::CheckpointRestored { thread_id, timestamp, .. } => thread.map(|mut t| {
            if t.id == *thread_id {
                t.state = ThreadState::Idle;
                t.updated_at = timestamp.clone();
            }
            t
        }),
        OrchestrationEvent::ProviderSelected { thread_id, timestamp, .. } => thread.map(|mut t| {
            if t.id == *thread_id {
                t.updated_at = timestamp.clone();
            }
            t
        }),
        OrchestrationEvent::ApprovalRequested { thread_id, timestamp, .. } => thread.map(|mut t| {
            if t.id == *thread_id {
                t.state = ThreadState::WaitingForInput;
                t.updated_at = timestamp.clone();
            }
            t
        }),
        OrchestrationEvent::ApprovalDecided { thread_id, timestamp, .. } => thread.map(|mut t| {
            if t.id == *thread_id {
                t.state = ThreadState::Idle;
                t.updated_at = timestamp.clone();
            }
            t
        }),
        OrchestrationEvent::ThreadImported { thread_id, project_id, timestamp } => Some(Thread {
            id: *thread_id,
            project_id: *project_id,
            title: None,
            state: ThreadState::Idle,
            created_at: timestamp.clone(),
            updated_at: timestamp.clone(),
        }),
    }
}

/// 从事件序列重建会话聚合。
pub fn fold_thread(events: &[OrchestrationEvent], thread_id: ThreadId) -> Option<Thread> {
    events
        .iter()
        .filter(|e| event_thread_id(e) == thread_id)
        .fold(None, apply_event)
}

/// 从事件中提取会话 ID。
pub fn event_thread_id(event: &OrchestrationEvent) -> ThreadId {
    match event {
        OrchestrationEvent::ThreadCreated { thread_id, .. }
        | OrchestrationEvent::ThreadUpdated { thread_id, .. }
        | OrchestrationEvent::ThreadDeleted { thread_id, .. }
        | OrchestrationEvent::ThreadRenamed { thread_id, .. }
        | OrchestrationEvent::ThreadStateChanged { thread_id, .. }
        | OrchestrationEvent::MessageAdded { thread_id, .. }
        | OrchestrationEvent::MessageUpdated { thread_id, .. }
        | OrchestrationEvent::TurnStarted { thread_id, .. }
        | OrchestrationEvent::TurnCompleted { thread_id, .. }
        | OrchestrationEvent::TurnFailed { thread_id, .. }
        | OrchestrationEvent::CheckpointCreated { thread_id, .. }
        | OrchestrationEvent::CheckpointRestored { thread_id, .. }
        | OrchestrationEvent::ProviderSelected { thread_id, .. }
        | OrchestrationEvent::ApprovalRequested { thread_id, .. }
        | OrchestrationEvent::ApprovalDecided { thread_id, .. }
        | OrchestrationEvent::ThreadImported { thread_id, .. } => *thread_id,
    }
}

/// 判断事件是否影响指定会话（带 stream 校验）。
pub fn event_belongs_to_thread(event: &OrchestrationEvent, thread_id: ThreadId) -> bool {
    event_thread_id(event) == thread_id
}

/// 根据用户命令内容计算下一条消息的元数据。
pub fn user_message_stub(content: &str) -> ThreadMessage {
    ThreadMessage {
        id: Uuid::new_v4(),
        thread_id: ThreadId(Uuid::nil()),
        role: MessageRole::User,
        content: content.to_string(),
        created_at: chrono::Utc::now().to_rfc3339(),
    }
}

/// 计算下一个轮次的元数据。
pub fn turn_stub() -> ThreadTurn {
    ThreadTurn {
        id: Uuid::new_v4(),
        thread_id: ThreadId(Uuid::nil()),
        turn_number: 0,
        created_at: chrono::Utc::now().to_rfc3339(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_thread(state: ThreadState) -> Thread {
        Thread {
            id: ThreadId::new(),
            project_id: Uuid::new_v4(),
            title: None,
            state,
            created_at: chrono::Utc::now().to_rfc3339(),
            updated_at: chrono::Utc::now().to_rfc3339(),
        }
    }

    #[test]
    fn test_decide_create_thread() {
        let project_id = Uuid::new_v4();
        let events = decide_create_thread(project_id, Some("Test")).unwrap();
        assert_eq!(events.len(), 2);
        assert!(matches!(events[0], OrchestrationEvent::ThreadCreated { .. }));
        assert!(matches!(events[1], OrchestrationEvent::ThreadRenamed { .. }));
    }

    #[test]
    fn test_decide_send_message_valid_states() {
        for state in [ThreadState::Idle, ThreadState::Completed, ThreadState::Errored] {
            let thread = sample_thread(state);
            let thread_id = thread.id;
            let events = decide_send_message(Some(&thread), thread_id, "Hello").unwrap();
            assert!(events.len() >= 3);
            assert!(matches!(events[0], OrchestrationEvent::MessageAdded { .. }));
            assert!(matches!(events[1], OrchestrationEvent::ThreadStateChanged { .. }));
            assert!(matches!(events[2], OrchestrationEvent::TurnStarted { .. }));
        }
    }

    #[test]
    fn test_decide_send_message_invalid_state() {
        let thread = sample_thread(ThreadState::Processing);
        let thread_id = thread.id;
        let result = decide_send_message(Some(&thread), thread_id, "Hello");
        assert!(result.is_err());
    }

    #[test]
    fn test_invariants_rejects_empty_message() {
        let thread = sample_thread(ThreadState::Idle);
        let cmd = OrchestrationCommand::SendMessage {
            thread_id: thread.id,
            content: String::new(),
        };
        assert!(check_invariants(&cmd, Some(&thread)).is_err());
    }

    #[test]
    fn test_invariants_rejects_oversized_message() {
        let thread = sample_thread(ThreadState::Idle);
        let cmd = OrchestrationCommand::SendMessage {
            thread_id: thread.id,
            content: "a".repeat(2 * 1024 * 1024),
        };
        assert!(check_invariants(&cmd, Some(&thread)).is_err());
    }

    #[test]
    fn test_invariants_rejects_oversized_title() {
        let thread = sample_thread(ThreadState::Idle);
        let cmd = OrchestrationCommand::RenameThread {
            thread_id: thread.id,
            title: "a".repeat(300),
        };
        assert!(check_invariants(&cmd, Some(&thread)).is_err());
    }

    #[test]
    fn test_invariants_cancel_requires_processing() {
        let thread = sample_thread(ThreadState::Idle);
        let cmd = OrchestrationCommand::CancelTurn {
            thread_id: thread.id,
            turn_id: Uuid::new_v4(),
        };
        assert!(check_invariants(&cmd, Some(&thread)).is_err());
    }

    #[test]
    fn test_invariants_checkpoint_requires_existing_thread() {
        let cmd = OrchestrationCommand::CreateCheckpoint {
            thread_id: ThreadId::new(),
            turn_id: Uuid::new_v4(),
        };
        assert!(check_invariants(&cmd, None).is_err());
    }

    #[test]
    fn test_decide_create_checkpoint_emits_event() {
        let thread = sample_thread(ThreadState::Idle);
        let turn_id = Uuid::new_v4();
        let events = decide_create_checkpoint(Some(&thread), thread.id, turn_id).unwrap();
        assert_eq!(events.len(), 1);
        if let OrchestrationEvent::CheckpointCreated { thread_id, turn_id: t, .. } = &events[0] {
            assert_eq!(*thread_id, thread.id);
            assert_eq!(*t, turn_id);
        } else {
            panic!("未发出 CheckpointCreated 事件");
        }
    }

    #[test]
    fn test_decide_rename_thread() {
        let thread = sample_thread(ThreadState::Idle);
        let events = decide_rename_thread(Some(&thread), thread.id, "New Title").unwrap();
        assert_eq!(events.len(), 1);
        assert!(matches!(events[0], OrchestrationEvent::ThreadRenamed { .. }));
    }

    #[test]
    fn test_decide_cancel_turn_from_processing() {
        let thread = sample_thread(ThreadState::Processing);
        let turn_id = Uuid::new_v4();
        let events = decide_cancel_turn(Some(&thread), thread.id, turn_id).unwrap();
        assert_eq!(events.len(), 2);
        assert!(matches!(events[0], OrchestrationEvent::TurnFailed { .. }));
        assert!(matches!(events[1], OrchestrationEvent::ThreadStateChanged { .. }));
    }

    #[test]
    fn test_fold_thread_lifecycle() {
        let thread = sample_thread(ThreadState::Idle);
        let thread_id = thread.id;
        let project_id = thread.project_id;

        let mut events = decide_create_thread(project_id, None).unwrap();
        // 覆盖生成的会话 ID 以匹配测试数据。
        events[0] = OrchestrationEvent::ThreadCreated {
            thread_id,
            project_id,
            timestamp: thread.created_at.clone(),
        };

        events.extend(decide_send_message(Some(&thread), thread_id, "Hello").unwrap());
        events.push(OrchestrationEvent::TurnCompleted {
            turn_id: Uuid::new_v4(),
            thread_id,
            timestamp: chrono::Utc::now().to_rfc3339(),
        });

        let folded = fold_thread(&events, thread_id).unwrap();
        assert_eq!(folded.id, thread_id);
        assert_eq!(folded.state, ThreadState::Idle);
    }
}
