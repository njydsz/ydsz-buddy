//! Read-model projector for orchestration events.
//!
//! The projector applies a stream of events to an in-memory read model. It
//! is intentionally free of side effects and can be used both for live
//! projection and for rebuilding the read model from the event store.

use remi_contracts::{
    OrchestrationEvent, Thread, ThreadId, ThreadMessage, ThreadState, ThreadTurn,
};
use std::collections::HashMap;

/// In-memory read model for orchestration queries.
#[derive(Debug, Clone, Default)]
pub struct ReadModel {
    /// Threads indexed by thread ID.
    pub threads: HashMap<ThreadId, Thread>,
    /// Messages indexed by thread ID.
    pub thread_messages: HashMap<ThreadId, Vec<ThreadMessage>>,
    /// Turns indexed by thread ID.
    pub thread_turns: HashMap<ThreadId, Vec<ThreadTurn>>,
}

impl ReadModel {
    /// Create a new empty read model.
    pub fn new() -> Self {
        Self::default()
    }

    /// Apply a single event to the read model.
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
            }
            OrchestrationEvent::ThreadUpdated { thread_id, timestamp } => {
                if let Some(thread) = self.threads.get_mut(thread_id) {
                    thread.updated_at = timestamp.clone();
                }
            }
            OrchestrationEvent::ThreadDeleted { thread_id, .. } => {
                self.threads.remove(thread_id);
                self.thread_messages.remove(thread_id);
                self.thread_turns.remove(thread_id);
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
                        content: String::new(), // Content is stored separately in the repository
                        created_at: timestamp.clone(),
                    });
                }
                if let Some(thread) = self.threads.get_mut(thread_id) {
                    thread.updated_at = timestamp.clone();
                    if thread.state == ThreadState::Idle || thread.state == ThreadState::Completed {
                        thread.state = ThreadState::Processing;
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
            OrchestrationEvent::TurnCompleted { thread_id, timestamp, turn_id: _ } => {
                if let Some(thread) = self.threads.get_mut(thread_id) {
                    thread.state = ThreadState::Idle;
                    thread.updated_at = timestamp.clone();
                }
            }
        }
    }

    /// Apply a sequence of events to the read model.
    pub fn apply_all(&mut self, events: &[OrchestrationEvent]) {
        for event in events {
            self.apply(event);
        }
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
}
