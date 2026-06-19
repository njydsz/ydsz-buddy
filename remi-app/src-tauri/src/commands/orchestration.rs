use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;
use tokio::sync::RwLock;
use uuid::Uuid;

use remi_core::commands::*;
use remi_core::models::*;
use remi_core::provider::ModelSelection;
use remi_orchestration::{OrchestrationEngine, OrchestrationReadModel, OrchestrationShellSnapshot};
use remi_persistence::{SqliteClient, SqliteEventStore, SqliteProjectionRepository, run_migrations};

/// Tauri 应用状态，持有编排引擎实例
pub struct OrchestrationState {
    engine: Arc<OrchestrationEngine>,
    db_path: std::path::PathBuf,
}

impl OrchestrationState {
    pub fn new() -> Self {
        // 使用默认数据库路径
        let db_path = dirs::data_dir()
            .unwrap_or_else(|| std::path::PathBuf::from("."))
            .join("remi-code")
            .join("remi.sqlite");

        // 初始化数据库
        let client = SqliteClient::new(&db_path).expect("Failed to create SQLite client");
        run_migrations(&client).expect("Failed to run migrations");

        // 创建事件存储和投影仓库
        let event_store = Arc::new(SqliteEventStore::new(client.clone()));
        let projection_repo = Arc::new(SqliteProjectionRepository::new(client));

        // 创建编排引擎
        let engine = Arc::new(OrchestrationEngine::new(event_store, projection_repo));

        Self { engine, db_path }
    }

    pub fn engine(&self) -> &Arc<OrchestrationEngine> {
        &self.engine
    }
}

#[derive(Debug, Deserialize)]
pub struct CreateThreadParams {
    pub project_id: String,
    pub title: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SendMessageParams {
    pub thread_id: String,
    pub role: String,
    pub content: String,
}

#[derive(Debug, Serialize)]
pub struct ThreadData {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Serialize)]
pub struct MessageData {
    pub id: String,
    pub role: String,
    pub content: String,
    pub timestamp: i64,
}

#[tauri::command]
pub async fn create_thread(
    state: State<'_, OrchestrationState>,
    params: CreateThreadParams,
) -> Result<ThreadData, String> {
    let thread_id = Uuid::new_v4();
    let project_id: ProjectId = params.project_id.parse().map_err(|e| format!("Invalid project_id: {}", e))?;

    let command = OrchestrationCommand::ThreadCreate(ThreadCreateCommand {
        command_id: Some(Uuid::new_v4().to_string()),
        thread_id,
        project_id,
        title: params.title.unwrap_or_else(|| "New Thread".to_string()),
        model_selection: ModelSelection {
            provider: remi_core::provider::ProviderKind::Codex,
            model: "default".to_string(),
            options: None,
        },
    });

    state.engine().dispatch(command).await.map_err(|e| e.to_string())?;

    let now = chrono::Utc::now().timestamp();
    Ok(ThreadData {
        id: thread_id.to_string(),
        project_id: project_id.to_string(),
        title: params.title.unwrap_or_else(|| "New Thread".to_string()),
        created_at: now,
        updated_at: now,
    })
}

#[tauri::command]
pub async fn send_message(
    state: State<'_, OrchestrationState>,
    params: SendMessageParams,
) -> Result<(), String> {
    let thread_id: ThreadId = params.thread_id.parse().map_err(|e| format!("Invalid thread_id: {}", e))?;
    let message_id = Uuid::new_v4();

    let role = match params.role.to_lowercase().as_str() {
        "user" => remi_core::models::MessageRole::User,
        "assistant" => remi_core::models::MessageRole::Assistant,
        "system" => remi_core::models::MessageRole::System,
        _ => remi_core::models::MessageRole::User,
    };

    let message = remi_core::models::Message {
        id: message_id,
        role,
        text: params.content,
        attachments: vec![],
        skills: vec![],
        mentions: vec![],
        dispatch_mode: None,
        turn_id: None,
        streaming: false,
        source: None,
        created_at: chrono::Utc::now(),
        updated_at: chrono::Utc::now(),
    };

    let command = OrchestrationCommand::ThreadMessagesImport(ThreadMessagesImportCommand {
        command_id: Some(Uuid::new_v4().to_string()),
        thread_id,
        messages: vec![message],
    });

    state.engine().dispatch(command).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn list_threads(
    state: State<'_, OrchestrationState>,
    project_id: String,
) -> Result<Vec<ThreadData>, String> {
    let snapshot = state.engine().get_shell_snapshot().await.map_err(|e| e.to_string())?;
    let project_uuid: ProjectId = project_id.parse().map_err(|e| format!("Invalid project_id: {}", e))?;

    let threads: Vec<ThreadData> = snapshot
        .threads
        .into_iter()
        .filter(|t| t.project_id == project_uuid)
        .map(|t| ThreadData {
            id: t.id.to_string(),
            project_id: t.project_id.to_string(),
            title: t.title,
            created_at: 0, // Shell snapshot doesn't include timestamps
            updated_at: 0,
        })
        .collect();

    Ok(threads)
}

#[tauri::command]
pub async fn delete_thread(
    state: State<'_, OrchestrationState>,
    thread_id: String,
) -> Result<(), String> {
    let thread_uuid: ThreadId = thread_id.parse().map_err(|e| format!("Invalid thread_id: {}", e))?;

    let command = OrchestrationCommand::ThreadDelete(ThreadDeleteCommand {
        command_id: Some(Uuid::new_v4().to_string()),
        thread_id: thread_uuid,
    });

    state.engine().dispatch(command).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn rename_thread(
    state: State<'_, OrchestrationState>,
    thread_id: String,
    title: String,
) -> Result<(), String> {
    let thread_uuid: ThreadId = thread_id.parse().map_err(|e| format!("Invalid thread_id: {}", e))?;

    let command = OrchestrationCommand::ThreadMetaUpdate(ThreadMetaUpdateCommand {
        command_id: Some(Uuid::new_v4().to_string()),
        thread_id: thread_uuid,
        title: Some(title),
    });

    state.engine().dispatch(command).await.map_err(|e| e.to_string())?;
    Ok(())
}
