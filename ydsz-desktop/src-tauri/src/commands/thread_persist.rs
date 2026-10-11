//! # Thread/会话持久化命令
//!
//! 将会话、消息、Turn 保存到 SQLite（通过 ThreadStore）。
//! 对标 Octop 的多用户消息历史 + 会话侧栏 + 跨会话恢复。
//!
//! Tauri 命令交互流程：
//! 前端 invoke → 构建命令 → 通过 ThreadStore CRUD → 返回结果

use tauri::State;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tracing::info;

use ydsz_shared::persistence::ThreadStore;
use crate::ServerState;

// ===== DTO =====

/// 线程记录 DTO
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadRecordDto {
    pub id: String,
    pub title: String,
    pub mode: String,        // "code" | "work" | "design" | "ask" | "review"
    pub status: String,      // "active" | "archived"
    pub turn_count: u32,
    pub message_count: u32,
    pub user_id: Option<String>,  // P0-3: 多用户隔离
    pub created_at: String,
    pub updated_at: String,
}

/// 消息记录 DTO
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageRecordDto {
    pub id: String,
    pub thread_id: String,
    pub turn_id: String,
    pub role: String,        // "user" | "assistant" | "system" | "tool"
    pub content: String,
    pub token_count: Option<u32>,
    pub created_at: String,
}

/// 线程持久化状态
#[derive(Debug, Clone)]
pub struct ThreadPersistState {
    store: Arc<ThreadStore>,
}

impl ThreadPersistState {
    pub fn new(store: ThreadStore) -> Self {
        Self {
            store: Arc::new(store),
        }
    }
}

// ===== 线程命令 =====

/// 保存/更新线程
#[tauri::command]
#[specta::specta]
pub async fn thread_save(
    state: State<'_, ThreadPersistState>,
    thread: ThreadRecordDto,
) -> Result<(), String> {
    info!(thread_id = %thread.id, title = %thread.title, "Thread 持久化: 保存");

    use ydsz_shared::persistence::ThreadRecord;
    let record = ThreadRecord {
        id: thread.id,
        title: thread.title,
        mode: thread.mode,
        status: thread.status,
        turn_count: thread.turn_count,
        message_count: thread.message_count,
        user_id: thread.user_id,
        created_at: thread.created_at,
        updated_at: thread.updated_at,
        metadata: serde_json::Value::Null,
    };
    state
        .store
        .save_thread(&record)
        .map_err(|e| format!("保存线程失败: {}", e))?;

    Ok(())
}

/// 获取线程
#[tauri::command]
#[specta::specta]
pub async fn thread_get(
    state: State<'_, ThreadPersistState>,
    id: String,
) -> Result<Option<ThreadRecordDto>, String> {
    info!(id = %id, "Thread 持久化: 获取");

    let opt = state
        .store
        .get_thread(&id)
        .map_err(|e| format!("获取线程失败: {}", e))?;

    Ok(opt.map(|t| ThreadRecordDto {
        id: t.id.to_string(),
        title: t.title,
        mode: t.mode,
        status: t.status,
        turn_count: t.turn_count,
        message_count: t.message_count,
        user_id: t.user_id,
        created_at: t.created_at,
        updated_at: t.updated_at,
    }))
}

/// 列出最近活跃的线程（按 updated_at 倒序）
#[tauri::command]
#[specta::specta]
pub async fn thread_list(
    state: State<'_, ThreadPersistState>,
    limit: Option<usize>,
) -> Result<Vec<ThreadRecordDto>, String> {
    info!(limit = ?limit, "Thread 持久化: 列出");

    let threads = state
        .store
        .list_threads(limit)
        .map_err(|e| format!("列出线程失败: {}", e))?;

    let result: Vec<ThreadRecordDto> = threads
        .into_iter()
        .map(|t| ThreadRecordDto {
            id: t.id.to_string(),
            title: t.title,
            mode: t.mode,
            status: t.status,
            turn_count: t.turn_count,
            message_count: t.message_count,
            user_id: t.user_id,
            created_at: t.created_at,
            updated_at: t.updated_at,
        })
        .collect();

    Ok(result)
}

/// 列出当前用户的线程（P0-3: 多用户隔离）
#[tauri::command]
#[specta::specta]
pub async fn thread_list_for_user(
    state: State<'_, ThreadPersistState>,
    user_id: String,
    limit: Option<usize>,
) -> Result<Vec<ThreadRecordDto>, String> {
    info!(user_id = %user_id, limit = ?limit, "Thread 持久化: 按用户列出");

    let threads = state
        .store
        .list_threads_for_user(&user_id, limit)
        .map_err(|e| format!("列出用户线程失败: {}", e))?;

    let result: Vec<ThreadRecordDto> = threads
        .into_iter()
        .map(|t| ThreadRecordDto {
            id: t.id.to_string(),
            title: t.title,
            mode: t.mode,
            status: t.status,
            turn_count: t.turn_count,
            message_count: t.message_count,
            user_id: t.user_id,
            created_at: t.created_at,
            updated_at: t.updated_at,
        })
        .collect();

    Ok(result)
}

/// 删除线程
#[tauri::command]
#[specta::specta]
pub async fn thread_delete(
    state: State<'_, ThreadPersistState>,
    id: String,
) -> Result<bool, String> {
    info!(id = %id, "Thread 持久化: 删除");

    state
        .store
        .delete_thread(&id)
        .map_err(|e| format!("删除线程失败: {}", e))?;

    Ok(true)
}

/// 保存消息
#[tauri::command]
#[specta::specta]
pub async fn thread_save_message(
    state: State<'_, ThreadPersistState>,
    msg: MessageRecordDto,
) -> Result<(), String> {
    info!(thread_id = %msg.thread_id, msg_id = %msg.id, role = %msg.role, "Thread 持久化: 保存消息");

    use ydsz_shared::persistence::MessageRecord;
    let record = MessageRecord {
        id: msg.id,
        thread_id: msg.thread_id,
        turn_id: msg.turn_id,
        role: msg.role,
        content: msg.content,
        token_count: msg.token_count,
        tool_calls: vec![],
        created_at: msg.created_at,
    };
    state
        .store
        .save_message(&record)
        .map_err(|e| format!("保存消息失败: {}", e))?;

    Ok(())
}

/// 获取线程的消息列表
#[tauri::command]
#[specta::specta]
pub async fn thread_get_messages(
    state: State<'_, ThreadPersistState>,
    thread_id: String,
) -> Result<Vec<MessageRecordDto>, String> {
    info!(thread_id = %thread_id, "Thread 持久化: 获取消息");

    let msgs = state
        .store
        .get_thread_messages(&thread_id)
        .map_err(|e| format!("获取消息失败: {}", e))?;

    let result: Vec<MessageRecordDto> = msgs
        .into_iter()
        .map(|m| MessageRecordDto {
            id: m.id,
            thread_id: m.thread_id.to_string(),
            turn_id: m.turn_id,
            role: m.role,
            content: m.content,
            token_count: m.token_count,
            created_at: m.created_at,
        })
        .collect();

    Ok(result)
}
