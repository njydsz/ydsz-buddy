use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::State;

pub struct OrchestrationState {
    threads: Arc<Mutex<HashMap<String, ThreadData>>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThreadData {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub messages: Vec<MessageData>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageData {
    pub id: String,
    pub role: String,
    pub content: String,
    pub timestamp: i64,
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

impl OrchestrationState {
    pub fn new() -> Self {
        Self {
            threads: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

#[tauri::command]
pub async fn create_thread(
    state: State<'_, OrchestrationState>,
    params: CreateThreadParams,
) -> Result<ThreadData, String> {
    let now = chrono::Utc::now().timestamp();
    let thread = ThreadData {
        id: uuid::Uuid::new_v4().to_string(),
        project_id: params.project_id,
        title: params.title.unwrap_or_else(|| "New Thread".to_string()),
        messages: Vec::new(),
        created_at: now,
        updated_at: now,
    };
    
    let mut threads = state.threads.lock().map_err(|e| e.to_string())?;
    threads.insert(thread.id.clone(), thread.clone());
    
    Ok(thread)
}

#[tauri::command]
pub async fn send_message(
    state: State<'_, OrchestrationState>,
    params: SendMessageParams,
) -> Result<(), String> {
    let mut threads = state.threads.lock().map_err(|e| e.to_string())?;
    
    if let Some(thread) = threads.get_mut(&params.thread_id) {
        let message = MessageData {
            id: uuid::Uuid::new_v4().to_string(),
            role: params.role,
            content: params.content,
            timestamp: chrono::Utc::now().timestamp(),
        };
        thread.messages.push(message);
        thread.updated_at = chrono::Utc::now().timestamp();
        Ok(())
    } else {
        Err("Thread not found".to_string())
    }
}

#[tauri::command]
pub async fn list_threads(
    state: State<'_, OrchestrationState>,
    project_id: String,
) -> Result<Vec<ThreadData>, String> {
    let threads = state.threads.lock().map_err(|e| e.to_string())?;
    let filtered: Vec<ThreadData> = threads
        .values()
        .filter(|t| t.project_id == project_id)
        .cloned()
        .collect();
    Ok(filtered)
}

#[tauri::command]
pub async fn delete_thread(
    state: State<'_, OrchestrationState>,
    thread_id: String,
) -> Result<(), String> {
    let mut threads = state.threads.lock().map_err(|e| e.to_string())?;
    threads.remove(&thread_id);
    Ok(())
}

#[tauri::command]
pub async fn rename_thread(
    state: State<'_, OrchestrationState>,
    thread_id: String,
    title: String,
) -> Result<(), String> {
    let mut threads = state.threads.lock().map_err(|e| e.to_string())?;
    if let Some(thread) = threads.get_mut(&thread_id) {
        thread.title = title;
        Ok(())
    } else {
        Err("Thread not found".to_string())
    }
}
