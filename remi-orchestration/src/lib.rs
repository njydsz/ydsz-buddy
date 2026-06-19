//! Remi Code 编排引擎。
//!
//! 本 crate 实现了事件溯源引擎、决策器、投影器和
//! Provider 会话切换层。
//!
//! # 模块布局
//!
//! - [`decider`] — 纯命令校验与事件决策逻辑（含 Command Invariants）。
//! - [`projector`] — 基于事件的读模型投影。
//! - [`handoff`] — Provider 会话路由。
//! - [`event_store`] — 事件持久化抽象层。
//! - [`reactors`] — 自治事件驱动副作用（8 个内置反应器）。
//! - [`receipts`] — 运行时回执总线（RuntimeReceiptBus）。
//! - [`services`] — 高层业务服务（5 个内置服务）。

pub mod decider;
pub mod event_store;
pub mod handoff;
pub mod integrations;
pub mod projector;
pub mod reactors;
pub mod services;

pub use decider::{check_invariants, decide, event_belongs_to_thread, event_thread_id, fold_thread};
pub use event_store::{EventStore, SqliteEventStore};
pub use handoff::ProviderHandoff;
pub use integrations::{
    GitHubCli, GitHubIssue, GitHubPullRequest, GitHubRepo, ImportSource, ImportStats,
    ImportedMessage, ImportedThread, ReadinessCheck, ReadinessReport, ReadinessStatus,
    ServerReadiness, TelemetryClient, TelemetryEvent, TelemetryLevel, ThreadImporter,
    VoiceProvider, VoiceService, VoiceState, VoiceTranscription,
};
pub use projector::{ApprovalRecord, CheckpointRecord, ReadModel};
pub use reactors::{
    ApprovalReactor, CheckpointReactor, GitReactor, MetricsReactor, Metrics, NotificationReactor,
    PendingApproval, RateLimitReactor, Reactor, ReactorRegistry, RetentionReactor,
    TelemetryReactor, default_registry, spawn_event_loop,
};
pub use receipts::{ReceiptEmitter, ReceiptKind, RuntimeReceipt, RuntimeReceiptBus, SharedReceiptBus};
pub use services::{
    Checkpoint, CheckpointService, ConversationContext, ConversationService, DiffService,
    DiffSummary, MessageService, Plugin, PluginKind, PluginResult, PluginService,
    ServiceBundle, VoiceService as LegacyVoiceService, VoiceState as LegacyVoiceState,
};

use remi_contracts::{
    OrchestrationCommand, OrchestrationEvent, Thread, ThreadId, ThreadMessage,
};
use remi_core::{Error, Result};
use remi_persistence::{Database, repositories::ThreadRepository};
use remi_providers::ProviderRegistry;
use std::sync::Arc;
use tokio::sync::{broadcast, RwLock};
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
    /// Optional reactor registry that fans out every event to listeners.
    reactors: Arc<ReactorRegistry>,
    /// Runtime receipt bus for side-effect observation.
    receipt_bus: SharedReceiptBus,
    /// Broadcast channel used to notify external consumers (HTTP, Tauri)
    /// about new orchestration events.
    event_tx: broadcast::Sender<OrchestrationEvent>,
}

impl OrchestrationEngine {
    /// 创建新的编排引擎实例。
    pub fn new(db: Arc<Database>, provider_registry: Arc<ProviderRegistry>) -> Self {
        let thread_repo = Arc::new(ThreadRepository::new(db.pool().clone()));
        let event_store: Arc<dyn EventStore> = Arc::new(SqliteEventStore::new(db.clone()));
        let handoff = Arc::new(ProviderHandoff::new(provider_registry.clone()));

        // 设置较大的广播通道容量：编排事件在流式传输期间
        // 可能会出现峰值，我们不希望背压拖慢引擎。
        // 延迟订阅者可通过 `replay_events` 重新同步。
        let (event_tx, _) = broadcast::channel(1024);
        let receipt_bus = Arc::new(RuntimeReceiptBus::new(256));

        Self {
            db,
            thread_repo,
            provider_registry,
            read_model: Arc::new(RwLock::new(ReadModel::default())),
            event_store,
            handoff,
            reactors: Arc::new(ReactorRegistry::new()),
            receipt_bus,
            event_tx,
        }
    }

    /// 构建一个已连接默认反应器注册表的新引擎。
    pub fn with_default_reactors(
        db: Arc<Database>,
        provider_registry: Arc<ProviderRegistry>,
    ) -> Self {
        let engine = Self::new(db, provider_registry);
        // 重新创建广播通道和反应器注册表，使得
        // 反应器发出的通知（以及公共订阅者）
        // 共享同一个通道。
        let (event_tx, _) = broadcast::channel(1024);
        let receipt_bus = Arc::new(RuntimeReceiptBus::new(256));
        let registry = default_registry(event_tx.clone(), Some(receipt_bus.clone()));
        Self {
            reactors: Arc::new(registry),
            receipt_bus,
            event_tx,
            ..engine
        }
    }

    /// 替换反应器注册表。
    pub fn with_reactors(mut self, registry: ReactorRegistry) -> Self {
        self.reactors = Arc::new(registry);
        self
    }

    /// 替换回执总线。
    pub fn with_receipt_bus(mut self, bus: SharedReceiptBus) -> Self {
        self.receipt_bus = bus;
        self
    }

    /// 获取共享的运行时回执总线。
    pub fn receipt_bus(&self) -> SharedReceiptBus {
        self.receipt_bus.clone()
    }

    /// 订阅编排事件。
    pub fn subscribe(&self) -> broadcast::Receiver<OrchestrationEvent> {
        self.event_tx.subscribe()
    }

    /// 订阅运行时回执。
    pub fn subscribe_receipts(&self) -> broadcast::Receiver<RuntimeReceipt> {
        self.receipt_bus.subscribe()
    }

    /// 启动后台事件循环，将事件泵入反应器注册表。
    /// 返回的 [`tokio::task::JoinHandle`] 可通过 abort 来停止处理。
    pub fn spawn_reactor_loop(&self) -> tokio::task::JoinHandle<()> {
        spawn_event_loop(self.event_tx.subscribe(), self.reactors.clone())
    }

    /// 处理编排命令。
    pub async fn handle_command(&self, command: OrchestrationCommand) -> Result<()> {
        match command {
            OrchestrationCommand::CreateThread { project_id, title } => {
                self.handle_create_thread(project_id, title.as_deref()).await
            }
            OrchestrationCommand::SendMessage { thread_id, content } => {
                let _ = self.handle_send_message(thread_id, &content).await?;
                Ok(())
            }
            OrchestrationCommand::RenameThread { thread_id, title } => {
                self.handle_rename_thread(thread_id, &title).await
            }
            OrchestrationCommand::CancelTurn { thread_id, turn_id } => {
                self.handle_cancel_turn(thread_id, turn_id).await
            }
            OrchestrationCommand::CreateCheckpoint { thread_id, turn_id } => {
                self.handle_create_checkpoint(thread_id, turn_id).await
            }
            OrchestrationCommand::RestoreCheckpoint { thread_id, checkpoint_id } => {
                self.handle_restore_checkpoint(thread_id, &checkpoint_id).await
            }
            OrchestrationCommand::SelectProvider { thread_id, provider, model } => {
                self.handle_select_provider(thread_id, provider, model).await
            }
            OrchestrationCommand::DecideApproval { request_id, thread_id, approved } => {
                self.handle_decide_approval(thread_id, request_id, approved).await
            }
            OrchestrationCommand::DeleteThread { thread_id } => {
                self.handle_delete_thread(thread_id).await
            }
        }
    }

    /// 处理创建会话命令。
    async fn handle_create_thread(&self, project_id: Uuid, title: Option<&str>) -> Result<()> {
        use remi_persistence::repositories::thread_repo::ThreadRepositoryTrait;

        let thread = self.thread_repo.create(project_id, title).await?;

        let events = decider::decide(
            &OrchestrationCommand::CreateThread {
                project_id,
                title: title.map(String::from),
            },
            None,
        )?;
        for event in &events {
            // 替换决策器生成的随机 thread_id 为仓库已创建的真实 ID。
            let mut ev = event.clone();
            if let OrchestrationEvent::ThreadCreated { thread_id, .. }
            | OrchestrationEvent::ThreadRenamed { thread_id, .. } = &mut ev
            {
                *thread_id = thread.id;
            }
            self.persist_and_project(&ev).await?;
        }

        info!("已创建会话: {}", thread.id);
        Ok(())
    }

    /// 处理发送消息命令。
    ///
    /// 成功时返回用户消息和助手消息。
    pub async fn handle_send_message(
        &self,
        thread_id: ThreadId,
        content: &str,
    ) -> Result<(ThreadMessage, ThreadMessage)> {
        use remi_persistence::repositories::thread_repo::ThreadRepositoryTrait;

        // 加载当前聚合状态。
        let thread = self
            .thread_repo
            .get_by_id(thread_id)
            .await?
            .ok_or_else(|| Error::Orchestration(format!("会话不存在: {}", thread_id)))?;

        // 决策需要发出的事件。
        let events = decider::decide(
            &OrchestrationCommand::SendMessage {
                thread_id,
                content: content.to_string(),
            },
            Some(&thread),
        )?;

        // 持久化用户消息并更新状态。
        let user_message = self
            .thread_repo
            .add_message(thread_id, remi_contracts::MessageRole::User, content)
            .await?;

        // 启动一个轮次。
        let turn = self.thread_repo.start_turn(thread_id).await?;

        // 持久化并投影决策器事件以及显式的轮次事件。
        for event in &events {
            self.persist_and_project(event).await?;
        }

        info!("正在处理会话消息: {}", thread_id);

        // 路由到 Provider 并获取响应。
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

        Ok((user_message, assistant_message))
    }

    /// 处理重命名会话。
    async fn handle_rename_thread(&self, thread_id: ThreadId, title: &str) -> Result<()> {
        use remi_persistence::repositories::thread_repo::ThreadRepositoryTrait;

        let thread = self
            .thread_repo
            .get_by_id(thread_id)
            .await?
            .ok_or_else(|| Error::Orchestration(format!("会话不存在: {}", thread_id)))?;

        let events = decider::decide(
            &OrchestrationCommand::RenameThread {
                thread_id,
                title: title.to_string(),
            },
            Some(&thread),
        )?;
        for event in &events {
            self.persist_and_project(event).await?;
        }
        Ok(())
    }

    /// 处理取消轮次命令。
    async fn handle_cancel_turn(&self, thread_id: ThreadId, turn_id: Uuid) -> Result<()> {
        use remi_persistence::repositories::thread_repo::ThreadRepositoryTrait;

        let thread = self
            .thread_repo
            .get_by_id(thread_id)
            .await?
            .ok_or_else(|| Error::Orchestration(format!("会话不存在: {}", thread_id)))?;

        let events = decider::decide(
            &OrchestrationCommand::CancelTurn { thread_id, turn_id },
            Some(&thread),
        )?;
        for event in &events {
            self.persist_and_project(event).await?;
        }
        Ok(())
    }

    /// 处理创建检查点命令。
    async fn handle_create_checkpoint(&self, thread_id: ThreadId, turn_id: Uuid) -> Result<()> {
        use remi_persistence::repositories::thread_repo::ThreadRepositoryTrait;

        let thread = self
            .thread_repo
            .get_by_id(thread_id)
            .await?
            .ok_or_else(|| Error::Orchestration(format!("会话不存在: {}", thread_id)))?;

        let events = decider::decide(
            &OrchestrationCommand::CreateCheckpoint { thread_id, turn_id },
            Some(&thread),
        )?;
        for event in &events {
            self.persist_and_project(event).await?;
        }
        Ok(())
    }

    /// 处理恢复检查点命令。
    async fn handle_restore_checkpoint(
        &self,
        thread_id: ThreadId,
        checkpoint_id: &str,
    ) -> Result<()> {
        use remi_persistence::repositories::thread_repo::ThreadRepositoryTrait;

        let thread = self
            .thread_repo
            .get_by_id(thread_id)
            .await?
            .ok_or_else(|| Error::Orchestration(format!("会话不存在: {}", thread_id)))?;

        let events = decider::decide(
            &OrchestrationCommand::RestoreCheckpoint {
                thread_id,
                checkpoint_id: checkpoint_id.to_string(),
            },
            Some(&thread),
        )?;
        for event in &events {
            self.persist_and_project(event).await?;
        }
        Ok(())
    }

    /// 处理切换 Provider 命令。
    async fn handle_select_provider(
        &self,
        thread_id: ThreadId,
        provider: remi_contracts::ProviderName,
        model: remi_contracts::ModelId,
    ) -> Result<()> {
        use remi_persistence::repositories::thread_repo::ThreadRepositoryTrait;

        let thread = self
            .thread_repo
            .get_by_id(thread_id)
            .await?
            .ok_or_else(|| Error::Orchestration(format!("会话不存在: {}", thread_id)))?;

        let events = decider::decide(
            &OrchestrationCommand::SelectProvider {
                thread_id,
                provider,
                model,
            },
            Some(&thread),
        )?;
        for event in &events {
            self.persist_and_project(event).await?;
        }
        Ok(())
    }

    /// 处理审批决定命令。
    async fn handle_decide_approval(
        &self,
        thread_id: ThreadId,
        request_id: Uuid,
        approved: bool,
    ) -> Result<()> {
        let events = decider::decide(
            &OrchestrationCommand::DecideApproval {
                request_id,
                thread_id,
                approved,
            },
            None,
        )?;
        for event in &events {
            self.persist_and_project(event).await?;
        }
        Ok(())
    }

    /// 处理删除会话命令。
    async fn handle_delete_thread(&self, thread_id: ThreadId) -> Result<()> {
        use remi_persistence::repositories::thread_repo::ThreadRepositoryTrait;

        let _thread = self
            .thread_repo
            .get_by_id(thread_id)
            .await?
            .ok_or_else(|| Error::Orchestration(format!("会话不存在: {}", thread_id)))?;

        self.thread_repo.delete(thread_id).await?;
        self.handoff.forget_thread(thread_id).await;

        let event = OrchestrationEvent::ThreadDeleted {
            thread_id,
            timestamp: chrono::Utc::now().to_rfc3339(),
        };

        self.persist_and_project(&event).await?;

        info!("已删除会话: {}", thread_id);
        Ok(())
    }

    /// 将事件持久化到事件存储并投影到读模型。
    async fn persist_and_project(&self, event: &OrchestrationEvent) -> Result<()> {
        self.event_store.append(event).await?;
        let mut model = self.read_model.write().await;
        model.apply(event);
        drop(model);

        // 将事件分发给反应器和广播订阅者。我们
        // 故意不在反应器出错时使命令失败——
        // 反应器是尽力而为的副作用。
        self.reactors.fan_out(event).await;

        // 广播给外部订阅者。`send` 仅在没有订阅者时返回错误，
        // 这是可以接受的。
        let _ = self.event_tx.send(event.clone());

        Ok(())
    }

    /// 从数据库重放事件以重建读模型。
    pub async fn replay_events(&self) -> Result<()> {
        info!("正在重放事件以重建读模型");

        let events = self.event_store.read_all().await?;
        let event_count = events.len();

        let mut model = self.read_model.write().await;
        *model = ReadModel::default();
        model.apply_all(&events);

        info!("已重放 {} 个事件", event_count);
        Ok(())
    }

    /// 根据 ID 获取会话。
    pub async fn get_thread(&self, thread_id: ThreadId) -> Result<Option<Thread>> {
        use remi_persistence::repositories::thread_repo::ThreadRepositoryTrait;
        self.thread_repo.get_by_id(thread_id).await
    }

    /// 列出项目的所有会话。
    pub async fn list_threads(&self, project_id: Uuid) -> Result<Vec<Thread>> {
        use remi_persistence::repositories::thread_repo::ThreadRepositoryTrait;
        self.thread_repo.list_by_project(project_id).await
    }

    /// 获取当前读模型快照。
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

    /// 测试用的 Provider，始终返回固定的回显响应。
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
        std::fs::create_dir_all(&db_dir).expect("创建临时目录失败");
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
        std::fs::create_dir_all(&project_path).expect("创建临时项目目录失败");

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

    #[tokio::test]
    async fn test_handle_rename_thread() {
        let config = temp_db_config();
        let db = Arc::new(Database::connect(&config).await.unwrap());
        db.run_migrations().await.unwrap();
        let registry = Arc::new(ProviderRegistry::new());
        let engine = OrchestrationEngine::new(db.clone(), registry);

        let project_path = std::env::temp_dir()
            .join(format!("remi-orchestration-project-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&project_path).expect("创建临时项目目录失败");

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
                title: None,
            })
            .await
            .unwrap();

        let threads = engine.list_threads(project_id).await.unwrap();
        let thread_id = threads[0].id;

        engine
            .handle_command(OrchestrationCommand::RenameThread {
                thread_id,
                title: "重命名后的会话".to_string(),
            })
            .await
            .unwrap();

        let thread = engine.get_thread(thread_id).await.unwrap().unwrap();
        assert_eq!(thread.title, Some("重命名后的会话".to_string()));
    }

    #[tokio::test]
    async fn test_orchestration_engine_with_default_reactors() {
        let config = temp_db_config();
        let db = Arc::new(Database::connect(&config).await.unwrap());
        db.run_migrations().await.unwrap();
        let registry = Arc::new(ProviderRegistry::new());
        let engine = OrchestrationEngine::with_default_reactors(db, registry);

        // 验证 receipt_bus 可用
        let bus = engine.receipt_bus();
        let mut rx = bus.subscribe();

        let receipt = receipts::RuntimeReceipt::new(receipts::ReceiptKind::Custom {
            kind: "test".to_string(),
            payload: serde_json::json!({}),
        });
        bus.emit(receipts::ReceiptKind::Custom {
            kind: "test".to_string(),
            payload: serde_json::json!({}),
        });

        let r = rx.recv().await.unwrap();
        assert!(matches!(r.kind, receipts::ReceiptKind::Custom { .. }));
    }
}
