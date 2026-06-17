//! Orchestration engine for Remi Code.
//!
//! This crate implements the event sourcing engine, decider, and projection pipeline.

use remi_contracts::{
    MessageRole, OrchestrationCommand, OrchestrationEvent, Thread, ThreadId, ThreadState,
};
use remi_core::{Error, Result};
use remi_persistence::{
    repositories::{ProjectRepository, ThreadRepository},
    Database,
};
use remi_providers::ProviderRegistry;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{error, info};
use uuid::Uuid;

/// Orchestration engine.
pub struct OrchestrationEngine {
    db: Arc<Database>,
    thread_repo: Arc<ThreadRepository>,
    provider_registry: Arc<ProviderRegistry>,
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

        info!("Created thread: {}", thread.id);
        Ok(())
    }

    /// Handle send message command.
    async fn handle_send_message(&self, thread_id: ThreadId, content: &str) -> Result<()> {
        use remi_persistence::repositories::thread_repo::ThreadRepositoryTrait;

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

        // Complete turn
        let turn_complete_event = OrchestrationEvent::TurnCompleted {
            turn_id: turn.id,
            thread_id,
            timestamp: chrono::Utc::now().to_rfc3339(),
        };

        self.store_event(&turn_complete_event).await?;

        // Update thread state back to idle
        self.thread_repo
            .update_state(thread_id, ThreadState::Idle)
            .await?;

        Ok(())
    }

    /// Handle delete thread command.
    async fn handle_delete_thread(&self, thread_id: ThreadId) -> Result<()> {
        use remi_persistence::repositories::thread_repo::ThreadRepositoryTrait;

        self.thread_repo.delete(thread_id).await?;

        let event = OrchestrationEvent::ThreadDeleted {
            thread_id,
            timestamp: chrono::Utc::now().to_rfc3339(),
        };

        self.store_event(&event).await?;

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
