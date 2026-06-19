//! 线程仓库。
//!
//! 读写基于投影的 schema（projection_threads /
//! projection_thread_messages / projection_turns）。状态在投影模型中
//! 编码为 JSON 字符串。

use async_trait::async_trait;
use chrono::Utc;
use remi_contracts::{MessageRole, Thread, ThreadId, ThreadMessage, ThreadState, ThreadTurn};
use remi_core::{Error, Result};
use sqlx::SqlitePool;
use uuid::Uuid;

/// 线程仓库 trait。
#[async_trait]
pub trait ThreadRepositoryTrait: Send + Sync {
    /// 创建新线程。
    async fn create(&self, project_id: Uuid, title: Option<&str>) -> Result<Thread>;

    /// 根据 ID 获取线程。
    async fn get_by_id(&self, id: ThreadId) -> Result<Option<Thread>>;

    /// 列出项目的线程。
    async fn list_by_project(&self, project_id: Uuid) -> Result<Vec<Thread>>;

    /// 更新线程状态。
    async fn update_state(&self, id: ThreadId, state: ThreadState) -> Result<()>;

    /// 删除线程（软删除）。
    async fn delete(&self, id: ThreadId) -> Result<()>;

    /// 向线程添加消息。
    async fn add_message(
        &self,
        thread_id: ThreadId,
        role: MessageRole,
        content: &str,
    ) -> Result<ThreadMessage>;

    /// 列出线程的消息。
    async fn list_messages(&self, thread_id: ThreadId) -> Result<Vec<ThreadMessage>>;

    /// 开始新轮次。
    async fn start_turn(&self, thread_id: ThreadId) -> Result<ThreadTurn>;

    /// 列出线程的轮次。
    async fn list_turns(&self, thread_id: ThreadId) -> Result<Vec<ThreadTurn>>;
}

/// 线程仓库实现。
#[derive(Clone)]
pub struct ThreadRepository {
    pool: SqlitePool,
}

impl ThreadRepository {
    /// 创建新线程仓库。
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl ThreadRepositoryTrait for ThreadRepository {
    async fn create(&self, project_id: Uuid, title: Option<&str>) -> Result<Thread> {
        let id = ThreadId::new();
        let now = Utc::now().to_rfc3339();
        let state = ThreadState::Idle;
        let model = "codex"; // 规范默认值

        sqlx::query(
            "INSERT INTO projection_threads (thread_id, project_id, title, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(id.to_string())
        .bind(project_id.to_string())
        .bind(title.unwrap_or(""))
        .bind(model)
        .bind(&now)
        .bind(&now)
        .execute(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        Ok(Thread {
            id,
            project_id,
            title: title.map(String::from),
            state,
            created_at: now.clone(),
            updated_at: now,
        })
    }

    async fn get_by_id(&self, id: ThreadId) -> Result<Option<Thread>> {
        let row: Option<(String, String, Option<String>, String, String)> = sqlx::query_as(
            "SELECT thread_id, project_id, title, created_at, updated_at FROM projection_threads WHERE thread_id = ? AND deleted_at IS NULL",
        )
        .bind(id.to_string())
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        match row {
            Some((id_str, project_id_str, title, created_at, updated_at)) => {
                let id = Uuid::parse_str(&id_str)
                    .map_err(|e| Error::Database(format!("无效的线程 ID: {e}")))?;
                let project_id = Uuid::parse_str(&project_id_str)
                    .map_err(|e| Error::Database(format!("无效的项目 ID: {e}")))?;
                Ok(Some(Thread {
                    id: ThreadId(id),
                    project_id,
                    title,
                    state: ThreadState::Idle,
                    created_at,
                    updated_at,
                }))
            }
            None => Ok(None),
        }
    }

    async fn list_by_project(&self, project_id: Uuid) -> Result<Vec<Thread>> {
        let rows: Vec<(String, String, Option<String>, String, String)> = sqlx::query_as(
            "SELECT thread_id, project_id, title, created_at, updated_at FROM projection_threads WHERE project_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC",
        )
        .bind(project_id.to_string())
        .fetch_all(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        let mut threads = Vec::new();
        for (id_str, project_id_str, title, created_at, updated_at) in rows {
            let id = Uuid::parse_str(&id_str)
                .map_err(|e| Error::Database(format!("无效的线程 ID: {e}")))?;
            let project_id = Uuid::parse_str(&project_id_str)
                .map_err(|e| Error::Database(format!("无效的项目 ID: {e}")))?;
            threads.push(Thread {
                id: ThreadId(id),
                project_id,
                title,
                state: ThreadState::Idle,
                created_at,
                updated_at,
            });
        }
        Ok(threads)
    }

    async fn update_state(&self, id: ThreadId, _state: ThreadState) -> Result<()> {
        // projection_threads 没有 state 列；我们将状态编码在
        // projection_thread_sessions 上。目前仅更新 updated_at。
        let now = Utc::now().to_rfc3339();
        sqlx::query("UPDATE projection_threads SET updated_at = ? WHERE thread_id = ?")
            .bind(&now)
            .bind(id.to_string())
            .execute(&self.pool)
            .await
            .map_err(|e| Error::Database(e.to_string()))?;
        Ok(())
    }

    async fn delete(&self, id: ThreadId) -> Result<()> {
        let now = Utc::now().to_rfc3339();
        sqlx::query("UPDATE projection_threads SET deleted_at = ? WHERE thread_id = ?")
            .bind(&now)
            .bind(id.to_string())
            .execute(&self.pool)
            .await
            .map_err(|e| Error::Database(e.to_string()))?;
        Ok(())
    }

    async fn add_message(
        &self,
        thread_id: ThreadId,
        role: MessageRole,
        content: &str,
    ) -> Result<ThreadMessage> {
        let id = Uuid::new_v4();
        let now = Utc::now().to_rfc3339();
        let role_str = match role {
            MessageRole::User => "user",
            MessageRole::Assistant => "assistant",
            MessageRole::System => "system",
        };

        sqlx::query(
            "INSERT INTO projection_thread_messages (message_id, thread_id, role, text, is_streaming, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)",
        )
        .bind(id.to_string())
        .bind(thread_id.to_string())
        .bind(role_str)
        .bind(content)
        .bind(&now)
        .bind(&now)
        .execute(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        Ok(ThreadMessage {
            id,
            thread_id,
            role,
            content: content.to_string(),
            created_at: now,
        })
    }

    async fn list_messages(&self, thread_id: ThreadId) -> Result<Vec<ThreadMessage>> {
        let rows: Vec<(String, String, String, String, String)> = sqlx::query_as(
            "SELECT message_id, thread_id, role, text, created_at FROM projection_thread_messages WHERE thread_id = ? ORDER BY created_at ASC, message_id ASC",
        )
        .bind(thread_id.to_string())
        .fetch_all(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        let mut messages = Vec::new();
        for (id_str, thread_id_str, role_str, content, created_at) in rows {
            let id = Uuid::parse_str(&id_str)
                .map_err(|e| Error::Database(format!("无效的消息 ID: {e}")))?;
            let thread_id = Uuid::parse_str(&thread_id_str)
                .map_err(|e| Error::Database(format!("无效的线程 ID: {e}")))?;
            let role = match role_str.as_str() {
                "user" => MessageRole::User,
                "assistant" => MessageRole::Assistant,
                "system" => MessageRole::System,
                other => {
                    return Err(Error::Database(format!(
                        "无效的消息角色: {other}"
                    )));
                }
            };
            messages.push(ThreadMessage {
                id,
                thread_id: ThreadId(thread_id),
                role,
                content,
                created_at,
            });
        }
        Ok(messages)
    }

    async fn start_turn(&self, thread_id: ThreadId) -> Result<ThreadTurn> {
        let id = Uuid::new_v4();
        let now = Utc::now().to_rfc3339();

        // 从已有轮次计算下一个 turn_number
        let max_turn: Option<(Option<i64>,)> = sqlx::query_as(
            "SELECT MAX(CAST(turn_id AS INTEGER)) FROM projection_turns WHERE thread_id = ?",
        )
        .bind(thread_id.to_string())
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        let turn_number = max_turn
            .and_then(|(max,)| max)
            .map(|n| n as u32 + 1)
            .unwrap_or(1);

        let turn_id = turn_number.to_string();

        sqlx::query(
            "INSERT INTO projection_turns (thread_id, turn_id, state, requested_at, checkpoint_files_json) VALUES (?, ?, 'pending', ?, '[]')",
        )
        .bind(thread_id.to_string())
        .bind(&turn_id)
        .bind(&now)
        .execute(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        // 维护 projection_threads 上的 latest_turn_id
        let _ = sqlx::query("UPDATE projection_threads SET latest_turn_id = ?, updated_at = ? WHERE thread_id = ?")
            .bind(&turn_id)
            .bind(&now)
            .bind(thread_id.to_string())
            .execute(&self.pool)
            .await;

        Ok(ThreadTurn {
            id,
            thread_id,
            turn_number,
            created_at: now,
        })
    }

    async fn list_turns(&self, thread_id: ThreadId) -> Result<Vec<ThreadTurn>> {
        let rows: Vec<(i64, String, String, String)> = sqlx::query_as(
            "SELECT row_id, thread_id, COALESCE(turn_id, ''), requested_at FROM projection_turns WHERE thread_id = ? ORDER BY requested_at ASC, row_id ASC",
        )
        .bind(thread_id.to_string())
        .fetch_all(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        let mut turns = Vec::new();
        for (_row_id, thread_id_str, turn_id_str, created_at) in rows {
            let id = Uuid::new_v4(); // 为公共 API 生成的合成 id
            let thread_id = Uuid::parse_str(&thread_id_str)
                .map_err(|e| Error::Database(format!("无效的线程 ID: {e}")))?;
            let turn_number: u32 = turn_id_str.parse().unwrap_or(0);
            turns.push(ThreadTurn {
                id,
                thread_id: ThreadId(thread_id),
                turn_number,
                created_at,
            });
        }
        Ok(turns)
    }
}
