//! 编排事件的读模型投影器。
//!
//! 投影器将事件流应用到内存中的读模型。它故意不包含任何副作用，
//! 既可用于实时投影，也可用于从事件存储重建读模型。
//!
//! 投影器应作为纯函数运行——任何带副作用的副作用（推送 WebSocket、
//! 持久化到 SQLite）应由 `ProjectionPipeline` 负责。

use remi_contracts::{
    OrchestrationEvent, Thread, ThreadId, ThreadMessage, ThreadState, ThreadTurn,
};
use std::collections::HashMap;

/// 用于编排查询的内存读模型。
#[derive(Debug, Clone, Default)]
pub struct ReadModel {
    /// 按会话 ID 索引的会话。
    pub threads: HashMap<ThreadId, Thread>,
    /// 按会话 ID 索引的消息。
    pub thread_messages: HashMap<ThreadId, Vec<ThreadMessage>>,
    /// 按会话 ID 索引的轮次。
    pub thread_turns: HashMap<ThreadId, Vec<ThreadTurn>>,
    /// 按会话 ID 索引的检查点（最近 N 个）。
    pub checkpoints: HashMap<ThreadId, Vec<CheckpointRecord>>,
    /// 当前选中的 Provider/Model（按会话）。
    pub thread_provider: HashMap<ThreadId, (String, String)>,
    /// 等待审批的请求。
    pub pending_approvals: HashMap<uuid::Uuid, ApprovalRecord>,
}

/// 检查点投影记录。
#[derive(Debug, Clone)]
pub struct CheckpointRecord {
    pub checkpoint_id: String,
    pub turn_id: uuid::Uuid,
    pub created_at: String,
}

/// 审批请求记录。
#[derive(Debug, Clone)]
pub struct ApprovalRecord {
    pub thread_id: ThreadId,
    pub reason: String,
    pub requested_at: String,
}

impl ReadModel {
    /// 创建一个新的空读模型。
    pub fn new() -> Self {
        Self::default()
    }

    /// 将单个事件应用到读模型。
    pub fn apply(&mut self, event: &OrchestrationEvent) {
        match event {
            OrchestrationEvent::ThreadCreated {
                thread_id,
                project_id,
                timestamp,
            } => {
                let thread = Thread {
                    id: *thread_id,
                    project_id: *project_id,
                    title: None,
                    state: ThreadState::Idle,
                    created_at: timestamp.clone(),
                    updated_at: timestamp.clone(),
                };
                self.threads.insert(*thread_id, thread);
                self.thread_messages.entry(*thread_id).or_default();
                self.thread_turns.entry(*thread_id).or_default();
                self.checkpoints.entry(*thread_id).or_default();
            }
            OrchestrationEvent::ThreadUpdated { thread_id, timestamp } => {
                if let Some(thread) = self.threads.get_mut(thread_id) {
                    thread.updated_at = timestamp.clone();
                }
            }
            OrchestrationEvent::ThreadRenamed { thread_id, title, timestamp } => {
                if let Some(thread) = self.threads.get_mut(thread_id) {
                    thread.title = Some(title.clone());
                    thread.updated_at = timestamp.clone();
                }
            }
            OrchestrationEvent::ThreadStateChanged { thread_id, to, timestamp } => {
                if let Some(thread) = self.threads.get_mut(thread_id) {
                    thread.state = *to;
                    thread.updated_at = timestamp.clone();
                }
            }
            OrchestrationEvent::ThreadDeleted { thread_id, .. } => {
                self.threads.remove(thread_id);
                self.thread_messages.remove(thread_id);
                self.thread_turns.remove(thread_id);
                self.checkpoints.remove(thread_id);
                self.thread_provider.remove(thread_id);
            }
            OrchestrationEvent::MessageAdded {
                message_id,
                thread_id,
                role,
                timestamp,
            } => {
                if let Some(messages) = self.thread_messages.get_mut(thread_id) {
                    messages.push(ThreadMessage {
                        id: *message_id,
                        thread_id: *thread_id,
                        role: *role,
                        content: String::new(), // 消息内容单独存储在仓库中
                        created_at: timestamp.clone(),
                    });
                }
                if let Some(thread) = self.threads.get_mut(thread_id) {
                    thread.updated_at = timestamp.clone();
                    if thread.state == ThreadState::Idle
                        || thread.state == ThreadState::Completed
                        || thread.state == ThreadState::Errored
                    {
                        thread.state = ThreadState::Processing;
                    }
                }
            }
            OrchestrationEvent::MessageUpdated {
                message_id,
                thread_id,
                content,
                ..
            } => {
                if let Some(messages) = self.thread_messages.get_mut(thread_id) {
                    if let Some(m) = messages.iter_mut().find(|m| m.id == *message_id) {
                        m.content.push_str(content);
                    }
                }
            }
            OrchestrationEvent::TurnStarted {
                turn_id,
                thread_id,
                timestamp,
            } => {
                if let Some(turns) = self.thread_turns.get_mut(thread_id) {
                    let turn_number = turns.len() as u32 + 1;
                    turns.push(ThreadTurn {
                        id: *turn_id,
                        thread_id: *thread_id,
                        turn_number,
                        created_at: timestamp.clone(),
                    });
                }
            }
            OrchestrationEvent::TurnCompleted { thread_id, timestamp, .. } => {
                if let Some(thread) = self.threads.get_mut(thread_id) {
                    thread.state = ThreadState::Idle;
                    thread.updated_at = timestamp.clone();
                }
            }
            OrchestrationEvent::TurnFailed { thread_id, timestamp, .. } => {
                if let Some(thread) = self.threads.get_mut(thread_id) {
                    thread.state = ThreadState::Errored;
                    thread.updated_at = timestamp.clone();
                }
            }
            OrchestrationEvent::CheckpointCreated {
                checkpoint_id,
                thread_id,
                turn_id,
                timestamp,
            } => {
                if let Some(list) = self.checkpoints.get_mut(thread_id) {
                    list.push(CheckpointRecord {
                        checkpoint_id: checkpoint_id.clone(),
                        turn_id: *turn_id,
                        created_at: timestamp.clone(),
                    });
                    // 每个会话最多保留 50 个检查点。
                    while list.len() > 50 {
                        list.remove(0);
                    }
                }
            }
            OrchestrationEvent::CheckpointRestored { thread_id, timestamp, .. } => {
                if let Some(thread) = self.threads.get_mut(thread_id) {
                    thread.state = ThreadState::Idle;
                    thread.updated_at = timestamp.clone();
                }
            }
            OrchestrationEvent::ProviderSelected {
                thread_id,
                provider,
                model,
                ..
            } => {
                self.thread_provider
                    .insert(*thread_id, (format!("{:?}", provider), model.0.clone()));
            }
            OrchestrationEvent::ApprovalRequested {
                request_id,
                thread_id,
                reason,
                timestamp,
            } => {
                self.pending_approvals.insert(
                    *request_id,
                    ApprovalRecord {
                        thread_id: *thread_id,
                        reason: reason.clone(),
                        requested_at: timestamp.clone(),
                    },
                );
                if let Some(thread) = self.threads.get_mut(thread_id) {
                    thread.state = ThreadState::WaitingForInput;
                }
            }
            OrchestrationEvent::ApprovalDecided { request_id, .. } => {
                self.pending_approvals.remove(request_id);
            }
            OrchestrationEvent::ThreadImported { .. } => {
                // 由 ThreadCreated 之前已处理；此处不重复插入。
            }
        }
    }

    /// 将一系列事件应用到读模型。
    pub fn apply_all(&mut self, events: &[OrchestrationEvent]) {
        for event in events {
            self.apply(event);
        }
    }

    /// 获取线程的检查点列表（按时间倒序）。
    pub fn list_checkpoints(&self, thread_id: ThreadId) -> Vec<CheckpointRecord> {
        self.checkpoints
            .get(&thread_id)
            .map(|list| list.iter().rev().cloned().collect())
            .unwrap_or_default()
    }

    /// 列出待审批的请求。
    pub fn list_pending_approvals(&self) -> Vec<(uuid::Uuid, ApprovalRecord)> {
        self.pending_approvals.iter().map(|(k, v)| (*k, v.clone())).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use remi_contracts::{MessageRole, ThreadId};
    use uuid::Uuid;

    #[test]
    fn test_project_thread_lifecycle() {
        let thread_id = ThreadId::new();
        let project_id = Uuid::new_v4();
        let timestamp = chrono::Utc::now().to_rfc3339();

        let mut model = ReadModel::new();
        model.apply(&OrchestrationEvent::ThreadCreated {
            thread_id,
            project_id,
            timestamp: timestamp.clone(),
        });

        assert!(model.threads.contains_key(&thread_id));

        model.apply(&OrchestrationEvent::MessageAdded {
            message_id: Uuid::new_v4(),
            thread_id,
            role: MessageRole::User,
            timestamp: chrono::Utc::now().to_rfc3339(),
        });

        assert_eq!(model.thread_messages.get(&thread_id).unwrap().len(), 1);
        assert_eq!(model.threads.get(&thread_id).unwrap().state, ThreadState::Processing);

        model.apply(&OrchestrationEvent::TurnCompleted {
            turn_id: Uuid::new_v4(),
            thread_id,
            timestamp: chrono::Utc::now().to_rfc3339(),
        });

        assert_eq!(model.threads.get(&thread_id).unwrap().state, ThreadState::Idle);
    }

    #[test]
    fn test_project_checkpoint_lifecycle() {
        let thread_id = ThreadId::new();
        let mut model = ReadModel::new();
        model.apply(&OrchestrationEvent::ThreadCreated {
            thread_id,
            project_id: Uuid::new_v4(),
            timestamp: chrono::Utc::now().to_rfc3339(),
        });

        let cp1 = "cp-1".to_string();
        model.apply(&OrchestrationEvent::CheckpointCreated {
            checkpoint_id: cp1.clone(),
            thread_id,
            turn_id: Uuid::new_v4(),
            timestamp: chrono::Utc::now().to_rfc3339(),
        });

        let list = model.list_checkpoints(thread_id);
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].checkpoint_id, cp1);
    }

    #[test]
    fn test_project_approval_lifecycle() {
        let thread_id = ThreadId::new();
        let request_id = Uuid::new_v4();
        let mut model = ReadModel::new();
        model.apply(&OrchestrationEvent::ThreadCreated {
            thread_id,
            project_id: Uuid::new_v4(),
            timestamp: chrono::Utc::now().to_rfc3339(),
        });

        model.apply(&OrchestrationEvent::ApprovalRequested {
            request_id,
            thread_id,
            reason: "敏感操作".to_string(),
            timestamp: chrono::Utc::now().to_rfc3339(),
        });

        assert_eq!(model.threads.get(&thread_id).unwrap().state, ThreadState::WaitingForInput);
        assert_eq!(model.list_pending_approvals().len(), 1);

        model.apply(&OrchestrationEvent::ApprovalDecided {
            request_id,
            thread_id,
            approved: true,
            timestamp: chrono::Utc::now().to_rfc3339(),
        });

        assert_eq!(model.list_pending_approvals().len(), 0);
        assert_eq!(model.threads.get(&thread_id).unwrap().state, ThreadState::Idle);
    }
}
