//! Decider logic for the orchestration engine.
//!
//! The decider is responsible for validating commands against the current
//! aggregate state and deciding which events should be emitted. It contains
//! no side effects and can be unit tested in isolation.

use remi_contracts::{
    MessageRole, OrchestrationCommand, OrchestrationEvent, Thread, ThreadId, ThreadMessage,
    ThreadState, ThreadTurn,
};
use remi_core::{Error, Result};
use uuid::Uuid;

/// Validate and decide which events should be emitted for a command.
pub fn decide(
    command: &OrchestrationCommand,
    thread: Option<&Thread>,
) -> Result<Vec<OrchestrationEvent>> {
    match command {
        OrchestrationCommand::CreateThread { project_id, title } => {
            decide_create_thread(*project_id, title.as_deref())
        }
        OrchestrationCommand::SendMessage { thread_id, content } => {
            decide_send_message(thread, *thread_id, content)
        }
        OrchestrationCommand::DeleteThread { thread_id } => decide_delete_thread(thread, *thread_id),
    }
}

/// Decide events for creating a thread.
fn decide_create_thread(project_id: Uuid, _title: Option<&str>) -> Result<Vec<OrchestrationEvent>> {
    let thread_id = ThreadId::new();
    let timestamp = chrono::Utc::now().to_rfc3339();

    Ok(vec![OrchestrationEvent::ThreadCreated {
        thread_id,
        project_id,
        timestamp,
    }])
}

/// Decide events for sending a message.
fn decide_send_message(
    thread: Option<&Thread>,
    thread_id: ThreadId,
    _content: &str,
) -> Result<Vec<OrchestrationEvent>> {
    let thread = thread.ok_or_else(|| Error::Orchestration(format!("Thread not found: {thread_id}")))?;

    if thread.state != ThreadState::Idle && thread.state != ThreadState::Completed {
        return Err(Error::Orchestration(format!(
            "Thread {thread_id} is in invalid state for sending messages: {:?}",
            thread.state
        )));
    }

    let message_id = Uuid::new_v4();
    let turn_id = Uuid::new_v4();
    let timestamp = chrono::Utc::now().to_rfc3339();

    Ok(vec![
        OrchestrationEvent::MessageAdded {
            message_id,
            thread_id,
            role: MessageRole::User,
            timestamp: timestamp.clone(),
        },
        OrchestrationEvent::TurnStarted {
            turn_id,
            thread_id,
            timestamp,
        },
    ])
}

/// Decide events for deleting a thread.
fn decide_delete_thread(thread: Option<&Thread>, thread_id: ThreadId) -> Result<Vec<OrchestrationEvent>> {
    let _thread = thread.ok_or_else(|| Error::Orchestration(format!("Thread not found: {thread_id}")))?;

    Ok(vec![OrchestrationEvent::ThreadDeleted {
        thread_id,
        timestamp: chrono::Utc::now().to_rfc3339(),
    }])
}

/// Apply a single event to a thread aggregate.
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
        OrchestrationEvent::ThreadDeleted { thread_id, timestamp: _ } => {
            thread.filter(|t| t.id != *thread_id)
        }
        OrchestrationEvent::MessageAdded { thread_id, timestamp, .. } => thread.map(|mut t| {
            if t.id == *thread_id {
                t.updated_at = timestamp.clone();
                if t.state == ThreadState::Idle || t.state == ThreadState::Completed {
                    t.state = ThreadState::Processing;
                }
            }
            t
        }),
        OrchestrationEvent::TurnStarted { .. } => thread,
        OrchestrationEvent::TurnCompleted { thread_id, timestamp, turn_id: _ } => thread.map(|mut t| {
            if t.id == *thread_id {
                t.state = ThreadState::Idle;
                t.updated_at = timestamp.clone();
            }
            t
        }),
    }
}

/// Rebuild a thread aggregate from a sequence of events.
pub fn fold_thread(events: &[OrchestrationEvent], thread_id: ThreadId) -> Option<Thread> {
    events
        .iter()
        .filter(|e| event_thread_id(e) == thread_id)
        .fold(None, apply_event)
}

/// Extract the thread ID from an event.
pub fn event_thread_id(event: &OrchestrationEvent) -> ThreadId {
    match event {
        OrchestrationEvent::ThreadCreated { thread_id, .. }
        | OrchestrationEvent::ThreadUpdated { thread_id, .. }
        | OrchestrationEvent::ThreadDeleted { thread_id, .. }
        | OrchestrationEvent::MessageAdded { thread_id, .. }
        | OrchestrationEvent::TurnStarted { thread_id, .. }
        | OrchestrationEvent::TurnCompleted { thread_id, .. } => *thread_id,
    }
}

/// Compute the next message metadata from user command content.
pub fn user_message_stub(content: &str) -> ThreadMessage {
    ThreadMessage {
        id: Uuid::new_v4(),
        thread_id: ThreadId(Uuid::nil()),
        role: MessageRole::User,
        content: content.to_string(),
        created_at: chrono::Utc::now().to_rfc3339(),
    }
}

/// Compute the next turn metadata.
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
        assert_eq!(events.len(), 1);
        assert!(matches!(events[0], OrchestrationEvent::ThreadCreated { .. }));
    }

    #[test]
    fn test_decide_send_message_valid_states() {
        for state in [ThreadState::Idle, ThreadState::Completed] {
            let thread = sample_thread(state);
            let thread_id = thread.id;
            let events = decide_send_message(Some(&thread), thread_id, "Hello").unwrap();
            assert_eq!(events.len(), 2);
            assert!(matches!(events[0], OrchestrationEvent::MessageAdded { .. }));
            assert!(matches!(events[1], OrchestrationEvent::TurnStarted { .. }));
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
    fn test_fold_thread_lifecycle() {
        let thread = sample_thread(ThreadState::Idle);
        let thread_id = thread.id;
        let project_id = thread.project_id;

        let mut events = decide_create_thread(project_id, None).unwrap();
        // Override the generated thread id so it matches.
        events[0] = OrchestrationEvent::ThreadCreated {
            thread_id,
            project_id,
            timestamp: thread.created_at.clone(),
        };

        events.extend(decide_send_message(Some(&thread), thread_id, "Hello").unwrap());

        let folded = fold_thread(&events, thread_id).unwrap();
        assert_eq!(folded.id, thread_id);
        assert_eq!(folded.state, ThreadState::Processing);
    }
}
