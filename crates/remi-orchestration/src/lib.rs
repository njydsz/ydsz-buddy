//! Orchestration engine for Remi Code.
//!
//! This crate implements the event sourcing engine, decider, and projection pipeline.

use remi_contracts::{
    MessageRole, OrchestrationCommand, OrchestrationEvent, Thread, ThreadId, ThreadState,
};
use remi_core::{Error, Result};
use remi_persistence::{
    repositories::ThreadRepository,
    Database,
};
use remi_providers::ProviderRegistry;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::info;
use uuid::Uuid;

/// Read model for event projection.
#[derive(Debug, Clone, Default)]
pub struct ReadModel {
    pub threads: HashMap<ThreadId, Thread>,
    pub thread_messages: HashMap<ThreadId, Vec<remi_contracts::ThreadMessage>>,
    pub thread_turns: HashMap<ThreadId, Vec<remi_contracts::ThreadTurn>>,
}

/// Orchestration engine.
#[allow(dead_code)]
pub struct OrchestrationEngine {
    pub db: Arc<Database>,
    thread_repo: Arc<ThreadRepository>,
    provider_registry: Arc<ProviderRegistry>,
    read_model: Arc<RwLock<ReadModel>>,
}

impl OrchestrationEngine {
    /// Create a new orchestration engine.
    pub fn new(
        db: Arc<Database>,
        provider_registry: Arc<ProviderRegistry>,
    ) -> Self {
        let thread_repo = Arc::new(ThreadRepository::new(db.pool().clone()));

        Self {
            db,
            thread_repo,
            provider_registry,
            read_model: Arc::new(RwLock::new(ReadModel::default())),
        }
    }

    /// Handle an orchestration command.
    pub async fn handle_command(&self, command: OrchestrationCommand) -> Result<()> {
        match command {
            OrchestrationCommand::CreateThread { project_id, title } => {
                self.handle_create_thread(project_id, title.as_deref()).await
            }
            OrchestrationCommand::SendMessage { thread_id, content } => {
                self.handle_send_message(thread_id, &content).await
            }
            OrchestrationCommand::DeleteThread { thread_id } => {
                self.handle_delete_thread(thread_id).await
            }
        }
    }

    /// Handle create thread command.
    async fn handle_create_thread(&self, project_id: Uuid, title: Option<&str>) -> Result<()> {
        use remi_persistence::repositories::thread_repo::ThreadRepositoryTrait;

        let thread = self.thread_repo.create(project_id, title).await?;

        // Store event
        let event = OrchestrationEvent::ThreadCreated {
            thread_id: thread.id,
            project_id,
            timestamp: chrono::Utc::now().to_rfc3339(),
        };

        self.store_event(&event).await?;

        // Project event to read model
        self.project_event(&event).await?;

        info!("Created thread: {}", thread.id);
        Ok(())
    }

    /// Handle send message command.
    async fn handle_send_message(&self, thread_id: ThreadId, content: &str) -> Result<()> {
        use remi_persistence::repositories::thread_repo::ThreadRepositoryTrait;

        // Validate thread exists and is in valid state
        let thread = self.thread_repo.get_by_id(thread_id).await?
            .ok_or_else(|| Error::Orchestration(format!("Thread not found: {}", thread_id)))?;

        if thread.state != ThreadState::Idle && thread.state != ThreadState::Completed {
            return Err(Error::Orchestration(format!(
                "Thread {} is in invalid state for sending messages: {:?}",
                thread_id, thread.state
            )));
        }

        // Add user message
        let message = self
            .thread_repo
            .add_message(thread_id, MessageRole::User, content)
            .await?;

        // Store event
        let event = OrchestrationEvent::MessageAdded {
            message_id: message.id,
            thread_id,
            role: MessageRole::User,
            timestamp: chrono::Utc::now().to_rfc3339(),
        };

        self.store_event(&event).await?;
        self.project_event(&event).await?;

        // Update thread state
        self.thread_repo
            .update_state(thread_id, ThreadState::Processing)
            .await?;

        // Start a turn
        let turn = self.thread_repo.start_turn(thread_id).await?;

        let turn_event = OrchestrationEvent::TurnStarted {
            turn_id: turn.id,
            thread_id,
            timestamp: chrono::Utc::now().to_rfc3339(),
        };

        self.store_event(&turn_event).await?;
        self.project_event(&turn_event).await?;

        info!("Processing message for thread: {}", thread_id);

        // TODO: Route to provider and get response
        // For now, just add a placeholder assistant message
        let assistant_message = self
            .thread_repo
            .add_message(
                thread_id,
                MessageRole::Assistant,
                "Response from provider (placeholder)",
            )
            .await?;

        let assistant_event = OrchestrationEvent::MessageAdded {
            message_id: assistant_message.id,
            thread_id,
            role: MessageRole::Assistant,
            timestamp: chrono::Utc::now().to_rfc3339(),
        };

        self.store_event(&assistant_event).await?;
        self.project_event(&assistant_event).await?;

        // Complete turn
        let turn_complete_event = OrchestrationEvent::TurnCompleted {
            turn_id: turn.id,
            thread_id,
            timestamp: chrono::Utc::now().to_rfc3339(),
        };

        self.store_event(&turn_complete_event).await?;
        self.project_event(&turn_complete_event).await?;

        // Update thread state back to idle
        self.thread_repo
            .update_state(thread_id, ThreadState::Idle)
            .await?;

        Ok(())
    }

    /// Handle delete thread command.
    async fn handle_delete_thread(&self, thread_id: ThreadId) -> Result<()> {
        use remi_persistence::repositories::thread_repo::ThreadRepositoryTrait;

        // Validate thread exists
        let _thread = self.thread_repo.get_by_id(thread_id).await?
            .ok_or_else(|| Error::Orchestration(format!("Thread not found: {}", thread_id)))?;

        self.thread_repo.delete(thread_id).await?;

        let event = OrchestrationEvent::ThreadDeleted {
            thread_id,
            timestamp: chrono::Utc::now().to_rfc3339(),
        };

        self.store_event(&event).await?;
        self.project_event(&event).await?;

        info!("Deleted thread: {}", thread_id);
        Ok(())
    }

    /// Store an orchestration event.
    async fn store_event(&self, event: &OrchestrationEvent) -> Result<()> {
        let id = Uuid::new_v4().to_string();
        let event_type = match event {
            OrchestrationEvent::ThreadCreated { .. } => "ThreadCreated",
            OrchestrationEvent::ThreadUpdated { .. } => "ThreadUpdated",
            OrchestrationEvent::ThreadDeleted { .. } => "ThreadDeleted",
            OrchestrationEvent::MessageAdded { .. } => "MessageAdded",
            OrchestrationEvent::TurnStarted { .. } => "TurnStarted",
            OrchestrationEvent::TurnCompleted { .. } => "TurnCompleted",
        };

        let payload = serde_json::to_string(event)?;
        let now = chrono::Utc::now().to_rfc3339();

        // Extract thread_id from event
        let thread_id = match event {
            OrchestrationEvent::ThreadCreated { thread_id, .. } => thread_id.to_string(),
            OrchestrationEvent::ThreadUpdated { thread_id, .. } => thread_id.to_string(),
            OrchestrationEvent::ThreadDeleted { thread_id, .. } => thread_id.to_string(),
            OrchestrationEvent::MessageAdded { thread_id, .. } => thread_id.to_string(),
            OrchestrationEvent::TurnStarted { thread_id, .. } => thread_id.to_string(),
            OrchestrationEvent::TurnCompleted { thread_id, .. } => thread_id.to_string(),
        };

        sqlx::query(
            "INSERT INTO orchestration_events (id, thread_id, event_type, payload, created_at) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(&id)
        .bind(&thread_id)
        .bind(event_type)
        .bind(&payload)
        .bind(&now)
        .execute(self.db.pool())
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        Ok(())
    }

    /// Project an event to the read model.
    async fn project_event(&self, event: &OrchestrationEvent) -> Result<()> {
        let mut model = self.read_model.write().await;

        match event {
            OrchestrationEvent::ThreadCreated { thread_id, project_id, timestamp } => {
                let thread = Thread {
                    id: *thread_id,
                    project_id: *project_id,
                    title: None,
                    state: ThreadState::Idle,
                    created_at: timestamp.clone(),
                    updated_at: timestamp.clone(),
                };
                model.threads.insert(*thread_id, thread);
                model.thread_messages.insert(*thread_id, Vec::new());
                model.thread_turns.insert(*thread_id, Vec::new());
            }
            OrchestrationEvent::ThreadUpdated { thread_id, timestamp } => {
                if let Some(thread) = model.threads.get_mut(thread_id) {
                    thread.updated_at = timestamp.clone();
                }
            }
            OrchestrationEvent::ThreadDeleted { thread_id, .. } => {
                model.threads.remove(thread_id);
                model.thread_messages.remove(thread_id);
                model.thread_turns.remove(thread_id);
            }
            OrchestrationEvent::MessageAdded { message_id, thread_id, role, timestamp } => {
                if let Some(messages) = model.thread_messages.get_mut(thread_id) {
                    messages.push(remi_contracts::ThreadMessage {
                        id: *message_id,
                        thread_id: *thread_id,
                        role: *role,
                        content: String::new(), // Content is stored separately
                        created_at: timestamp.clone(),
                    });
                }
            }
            OrchestrationEvent::TurnStarted { turn_id, thread_id, timestamp } => {
                if let Some(turns) = model.thread_turns.get_mut(thread_id) {
                    let turn_number = turns.len() as u32 + 1;
                    turns.push(remi_contracts::ThreadTurn {
                        id: *turn_id,
                        thread_id: *thread_id,
                        turn_number,
                        created_at: timestamp.clone(),
                    });
                }
            }
            OrchestrationEvent::TurnCompleted { .. } => {
                // Turn completion doesn't change the read model structure
            }
        }

        Ok(())
    }

    /// Replay events from the database to rebuild the read model.
    pub async fn replay_events(&self) -> Result<()> {
        info!("Replaying events to rebuild read model");

        let events: Vec<(String, String, String, String)> = sqlx::query_as(
            "SELECT id, thread_id, event_type, payload FROM orchestration_events ORDER BY created_at ASC"
        )
        .fetch_all(self.db.pool())
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        let event_count = events.len();

        let mut model = self.read_model.write().await;
        model.threads.clear();
        model.thread_messages.clear();
        model.thread_turns.clear();

        for (_id, _thread_id_str, _event_type, payload) in &events {
            let event: OrchestrationEvent = serde_json::from_str(payload)
                .map_err(|e| Error::Serialization(format!("Failed to deserialize event: {}", e)))?;

            // Project event (without holding the lock)
            drop(model);
            self.project_event(&event).await?;
            model = self.read_model.write().await;
        }

        info!("Replayed {} events", event_count);
        Ok(())
    }

    /// Get a thread by ID.
    pub async fn get_thread(&self, thread_id: ThreadId) -> Result<Option<Thread>> {
        use remi_persistence::repositories::thread_repo::ThreadRepositoryTrait;
        self.thread_repo.get_by_id(thread_id).await
    }

    /// List threads for a project.
    pub async fn list_threads(&self, project_id: Uuid) -> Result<Vec<Thread>> {
        use remi_persistence::repositories::thread_repo::ThreadRepositoryTrait;
        self.thread_repo.list_by_project(project_id).await
    }

    /// Get the current read model snapshot.
    pub async fn get_read_model(&self) -> ReadModel {
        self.read_model.read().await.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_orchestration_engine_creation() {
        // Basic smoke test
        let config = remi_core::ServerConfig::default();
        let db = Arc::new(Database::connect(&config).await.unwrap());
        db.run_migrations().await.unwrap();
        let registry = Arc::new(ProviderRegistry::new());
        let engine = OrchestrationEngine::new(db, registry);

        // Should be able to list threads (empty)
        let project_id = Uuid::new_v4();
        let threads = engine.list_threads(project_id).await.unwrap();
        assert!(threads.is_empty());
    }
}
