//! Orchestration engine for Remi Code.
//!
//! This crate implements the event sourcing engine, decider, projector, and
//! provider handoff layers.
//!
//! # Module layout
//!
//! - [`decider`] — pure command validation and event decision logic.
//! - [`projector`] — read-model projection from events.
//! - [`handoff`] — provider session routing.
//! - [`event_store`] — event persistence abstraction.
//! - [`reactors`] — autonomous event-driven side effects (8 built-in).
//! - [`services`] — high level business services (5 built-in).

pub mod decider;
pub mod event_store;
pub mod handoff;
pub mod projector;
pub mod reactors;
pub mod services;

pub use decider::{decide, fold_thread};
pub use event_store::{EventStore, SqliteEventStore};
pub use handoff::ProviderHandoff;
pub use projector::ReadModel;
pub use reactors::{
    ApprovalReactor, CheckpointReactor, GitReactor, MetricsReactor, NotificationReactor,
    PendingApproval, RateLimitReactor, Reactor, ReactorRegistry, RetentionReactor,
    TelemetryReactor, default_registry, spawn_event_loop,
};
pub use services::{
    Checkpoint, CheckpointService, ConversationContext, ConversationService, DiffService,
    DiffSummary, MessageService, Plugin, PluginKind, PluginResult, PluginService,
    ServiceBundle, VoiceService, VoiceState,
};

use remi_contracts::{
    OrchestrationCommand, OrchestrationEvent, Thread, ThreadId, ThreadMessage,
};
use remi_core::{Error, Result};
use remi_persistence::{Database, repositories::ThreadRepository};
use remi_providers::ProviderRegistry;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::info;
use uuid::Uuid;

/// Orchestration engine.
#[derive(Clone)]
#[allow(dead_code)]
pub struct OrchestrationEngine {
    /// Database handle.
    pub db: Arc<Database>,
    thread_repo: Arc<ThreadRepository>,
    provider_registry: Arc<ProviderRegistry>,
    read_model: Arc<RwLock<ReadModel>>,
    event_store: Arc<dyn EventStore>,
    handoff: Arc<ProviderHandoff>,
}

impl OrchestrationEngine {
    /// Create a new orchestration engine.
    pub fn new(db: Arc<Database>, provider_registry: Arc<ProviderRegistry>) -> Self {
        let thread_repo = Arc::new(ThreadRepository::new(db.pool().clone()));
        let event_store: Arc<dyn EventStore> = Arc::new(SqliteEventStore::new(db.clone()));
        let handoff = Arc::new(ProviderHandoff::new(provider_registry.clone()));

        Self {
            db,
            thread_repo,
            provider_registry,
            read_model: Arc::new(RwLock::new(ReadModel::default())),
            event_store,
            handoff,
        }
    }

    /// Handle an orchestration command.
    pub async fn handle_command(&self, command: OrchestrationCommand) -> Result<()> {
        match command {
            OrchestrationCommand::CreateThread { project_id, title } => {
                self.handle_create_thread(project_id, title.as_deref()).await
            }
            OrchestrationCommand::SendMessage { thread_id, content } => {
                let _ = self.handle_send_message(thread_id, &content).await?;
                Ok(())
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

        let event = OrchestrationEvent::ThreadCreated {
            thread_id: thread.id,
            project_id,
            timestamp: chrono::Utc::now().to_rfc3339(),
        };

        self.persist_and_project(&event).await?;

        info!("Created thread: {}", thread.id);
        Ok(())
    }

    /// Handle send message command.
    ///
    /// Returns the user message and the assistant message (on success).
    pub async fn handle_send_message(
        &self,
        thread_id: ThreadId,
        content: &str,
    ) -> Result<(ThreadMessage, ThreadMessage)> {
        use remi_persistence::repositories::thread_repo::ThreadRepositoryTrait;

        // Load current aggregate state.
        let thread = self
            .thread_repo
            .get_by_id(thread_id)
            .await?
            .ok_or_else(|| Error::Orchestration(format!("Thread not found: {}", thread_id)))?;

        // Decide which events to emit.
        let events = decider::decide(
            &OrchestrationCommand::SendMessage {
                thread_id,
                content: content.to_string(),
            },
            Some(&thread),
        )?;

        // Persist user message and update state.
        let user_message = self
            .thread_repo
            .add_message(thread_id, remi_contracts::MessageRole::User, content)
            .await?;

        self.thread_repo
            .update_state(thread_id, remi_contracts::ThreadState::Processing)
            .await?;

        // Start a turn.
        let turn = self.thread_repo.start_turn(thread_id).await?;

        // Persist and project the decider events plus the explicit turn event.
        for event in &events {
            self.persist_and_project(event).await?;
        }

        info!("Processing message for thread: {}", thread_id);

        // Route to provider and get response.
        let assistant_content = self.handoff.route(thread_id, content).await?;

        let assistant_message = self
            .thread_repo
            .add_message(thread_id, remi_contracts::MessageRole::Assistant, &assistant_content)
            .await?;

        let assistant_event = OrchestrationEvent::MessageAdded {
            message_id: assistant_message.id,
            thread_id,
            role: remi_contracts::MessageRole::Assistant,
            timestamp: chrono::Utc::now().to_rfc3339(),
        };

        self.persist_and_project(&assistant_event).await?;

        let turn_complete_event = OrchestrationEvent::TurnCompleted {
            turn_id: turn.id,
            thread_id,
            timestamp: chrono::Utc::now().to_rfc3339(),
        };

        self.persist_and_project(&turn_complete_event).await?;

        self.thread_repo
            .update_state(thread_id, remi_contracts::ThreadState::Idle)
            .await?;

        Ok((user_message, assistant_message))
    }

    /// Handle delete thread command.
    async fn handle_delete_thread(&self, thread_id: ThreadId) -> Result<()> {
        use remi_persistence::repositories::thread_repo::ThreadRepositoryTrait;

        let _thread = self
            .thread_repo
            .get_by_id(thread_id)
            .await?
            .ok_or_else(|| Error::Orchestration(format!("Thread not found: {}", thread_id)))?;

        self.thread_repo.delete(thread_id).await?;
        self.handoff.forget_thread(thread_id).await;

        let event = OrchestrationEvent::ThreadDeleted {
            thread_id,
            timestamp: chrono::Utc::now().to_rfc3339(),
        };

        self.persist_and_project(&event).await?;

        info!("Deleted thread: {}", thread_id);
        Ok(())
    }

    /// Persist an event to the event store and project it to the read model.
    async fn persist_and_project(&self, event: &OrchestrationEvent) -> Result<()> {
        self.event_store.append(event).await?;
        let mut model = self.read_model.write().await;
        model.apply(event);
        Ok(())
    }

    /// Replay events from the database to rebuild the read model.
    pub async fn replay_events(&self) -> Result<()> {
        info!("Replaying events to rebuild read model");

        let events = self.event_store.read_all().await?;
        let event_count = events.len();

        let mut model = self.read_model.write().await;
        *model = ReadModel::default();
        model.apply_all(&events);

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
    use async_trait::async_trait;
    use remi_contracts::{ModelId, ProviderHealth, ProviderHealthStatus, ProviderInfo, ProviderName};
    use remi_providers::ProviderAdapter;
    use serde_json::json;

    /// Test provider that always returns a fixed echo response.
    struct EchoProvider;

    #[async_trait]
    impl ProviderAdapter for EchoProvider {
        fn info(&self) -> ProviderInfo {
            ProviderInfo {
                name: ProviderName::Kilo,
                display_name: "Echo".to_string(),
                models: vec![ModelId::new("echo")],
                available: true,
            }
        }

        async fn health(&self) -> Result<ProviderHealth> {
            Ok(ProviderHealth {
                provider: ProviderName::Kilo,
                status: ProviderHealthStatus::Healthy,
                last_checked: chrono::Utc::now().to_rfc3339(),
                error: None,
            })
        }

        async fn start_session(&self, _model: &ModelId) -> Result<String> {
            Ok("test-session".to_string())
        }

        async fn send_message(&self, _session_id: &str, message: &str) -> Result<serde_json::Value> {
            Ok(json!({ "response": format!("Echo: {message}") }))
        }

        async fn stream_response(
            &self,
            _session_id: &str,
            _message: &str,
        ) -> Result<std::pin::Pin<Box<dyn futures::Stream<Item = Result<String>> + Send>>> {
            Ok(Box::pin(futures::stream::empty()))
        }

        async fn close_session(&self, _session_id: &str) -> Result<()> {
            Ok(())
        }
    }

    fn temp_db_config() -> remi_core::ServerConfig {
        let mut config = remi_core::ServerConfig::default();
        let db_dir = std::env::temp_dir().join(format!("remi-orchestration-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&db_dir).expect("Failed to create temp dir");
        config.db_path = db_dir.join("remi-code.db");
        config
    }

    #[tokio::test]
    async fn test_orchestration_engine_creation() {
        let config = temp_db_config();
        let db = Arc::new(Database::connect(&config).await.unwrap());
        db.run_migrations().await.unwrap();
        let registry = Arc::new(ProviderRegistry::new());
        let engine = OrchestrationEngine::new(db, registry);

        let project_id = Uuid::new_v4();
        let threads = engine.list_threads(project_id).await.unwrap();
        assert!(threads.is_empty());
    }

    #[tokio::test]
    async fn test_handle_send_message() {
        let config = temp_db_config();
        let db = Arc::new(Database::connect(&config).await.unwrap());
        db.run_migrations().await.unwrap();
        let registry = Arc::new(ProviderRegistry::new());
        registry.register(Arc::new(EchoProvider));
        let engine = OrchestrationEngine::new(db.clone(), registry);

        let project_path = std::env::temp_dir()
            .join(format!("remi-orchestration-project-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&project_path).expect("Failed to create temp project dir");

        let project_id = {
            use remi_persistence::repositories::project_repo::{ProjectRepository, ProjectRepositoryTrait};
            let project_repo = ProjectRepository::new(db.pool().clone());
            let project = project_repo
                .create("Test Project", project_path.to_str().unwrap(), remi_contracts::ProjectKind::Local)
                .await
                .unwrap();
            project.id.0
        };

        engine
            .handle_command(OrchestrationCommand::CreateThread {
                project_id,
                title: Some("Test thread".to_string()),
            })
            .await
            .unwrap();

        let threads = engine.list_threads(project_id).await.unwrap();
        assert_eq!(threads.len(), 1);
        let thread_id = threads[0].id;

        let (user_message, assistant_message) = engine
            .handle_send_message(thread_id, "Hello, Remi!")
            .await
            .unwrap();

        assert_eq!(user_message.role, remi_contracts::MessageRole::User);
        assert_eq!(user_message.content, "Hello, Remi!");
        assert_eq!(assistant_message.role, remi_contracts::MessageRole::Assistant);

        let thread = engine.get_thread(thread_id).await.unwrap().unwrap();
        assert_eq!(thread.state, remi_contracts::ThreadState::Idle);

        use remi_persistence::repositories::thread_repo::ThreadRepositoryTrait;
        let repo = ThreadRepository::new(db.pool().clone());
        let messages = repo.list_messages(thread_id).await.unwrap();
        assert_eq!(messages.len(), 2);
        assert_eq!(messages[0].content, "Hello, Remi!");
        assert_eq!(messages[1].id, assistant_message.id);
    }
}
