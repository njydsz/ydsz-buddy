//! Thread repository.

use async_trait::async_trait;
use chrono::Utc;
use remi_contracts::{MessageRole, Thread, ThreadId, ThreadMessage, ThreadState, ThreadTurn};
use remi_core::{Error, Result};
use sqlx::SqlitePool;
use uuid::Uuid;

/// Thread repository trait.
#[async_trait]
pub trait ThreadRepositoryTrait: Send + Sync {
    /// Create a new thread.
    async fn create(&self, project_id: Uuid, title: Option<&str>) -> Result<Thread>;

    /// Get a thread by ID.
    async fn get_by_id(&self, id: ThreadId) -> Result<Option<Thread>>;

    /// List threads for a project.
    async fn list_by_project(&self, project_id: Uuid) -> Result<Vec<Thread>>;

    /// Update thread state.
    async fn update_state(&self, id: ThreadId, state: ThreadState) -> Result<()>;

    /// Delete a thread.
    async fn delete(&self, id: ThreadId) -> Result<()>;

    /// Add a message to a thread.
    async fn add_message(
        &self,
        thread_id: ThreadId,
        role: MessageRole,
        content: &str,
    ) -> Result<ThreadMessage>;

    /// List messages for a thread.
    async fn list_messages(&self, thread_id: ThreadId) -> Result<Vec<ThreadMessage>>;

    /// Start a new turn.
    async fn start_turn(&self, thread_id: ThreadId) -> Result<ThreadTurn>;

    /// List turns for a thread.
    async fn list_turns(&self, thread_id: ThreadId) -> Result<Vec<ThreadTurn>>;
}

/// Thread repository implementation.
#[derive(Clone)]
pub struct ThreadRepository {
    pool: SqlitePool,
}

impl ThreadRepository {
    /// Create a new thread repository.
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

        sqlx::query(
            "INSERT INTO threads (id, project_id, title, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(id.to_string())
        .bind(project_id.to_string())
        .bind(title)
        .bind(serde_json::to_string(&state).unwrap_or_default())
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
        let row: Option<(String, String, Option<String>, String, String, String)> = sqlx::query_as(
            "SELECT id, project_id, title, state, created_at, updated_at FROM threads WHERE id = ?",
        )
        .bind(id.to_string())
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        match row {
            Some((id_str, project_id_str, title, state_str, created_at, updated_at)) => {
                let id = Uuid::parse_str(&id_str).map_err(|e| {
                    Error::Database(format!("Invalid thread ID in database: {}", e))
                })?;
                let project_id = Uuid::parse_str(&project_id_str).map_err(|e| {
                    Error::Database(format!("Invalid project ID in database: {}", e))
                })?;
                let state: ThreadState = serde_json::from_str(&state_str).map_err(|e| {
                    Error::Database(format!("Invalid thread state in database: {}", e))
                })?;
                Ok(Some(Thread {
                    id: ThreadId(id),
                    project_id,
                    title,
                    state,
                    created_at,
                    updated_at,
                }))
            }
            None => Ok(None),
        }
    }

    async fn list_by_project(&self, project_id: Uuid) -> Result<Vec<Thread>> {
        let rows: Vec<(String, String, Option<String>, String, String, String)> = sqlx::query_as(
            "SELECT id, project_id, title, state, created_at, updated_at FROM threads WHERE project_id = ? ORDER BY updated_at DESC",
        )
        .bind(project_id.to_string())
        .fetch_all(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        let mut threads = Vec::new();
        for (id_str, project_id_str, title, state_str, created_at, updated_at) in rows {
            let id = Uuid::parse_str(&id_str)
                .map_err(|e| Error::Database(format!("Invalid thread ID in database: {}", e)))?;
            let project_id = Uuid::parse_str(&project_id_str)
                .map_err(|e| Error::Database(format!("Invalid project ID in database: {}", e)))?;
            let state: ThreadState = serde_json::from_str(&state_str)
                .map_err(|e| Error::Database(format!("Invalid thread state in database: {}", e)))?;
            threads.push(Thread {
                id: ThreadId(id),
                project_id,
                title,
                state,
                created_at,
                updated_at,
            });
        }
        Ok(threads)
    }

    async fn update_state(&self, id: ThreadId, state: ThreadState) -> Result<()> {
        let now = Utc::now().to_rfc3339();
        let state_str = serde_json::to_string(&state).unwrap_or_default();

        sqlx::query("UPDATE threads SET state = ?, updated_at = ? WHERE id = ?")
            .bind(&state_str)
            .bind(&now)
            .bind(id.to_string())
            .execute(&self.pool)
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

        Ok(())
    }

    async fn delete(&self, id: ThreadId) -> Result<()> {
        sqlx::query("DELETE FROM threads WHERE id = ?")
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
            "INSERT INTO thread_messages (id, thread_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(id.to_string())
        .bind(thread_id.to_string())
        .bind(role_str)
        .bind(content)
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
            "SELECT id, thread_id, role, content, created_at FROM thread_messages WHERE thread_id = ? ORDER BY created_at ASC",
        )
        .bind(thread_id.to_string())
        .fetch_all(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        let mut messages = Vec::new();
        for (id_str, thread_id_str, role_str, content, created_at) in rows {
            let id = Uuid::parse_str(&id_str)
                .map_err(|e| Error::Database(format!("Invalid message ID in database: {}", e)))?;
            let thread_id = Uuid::parse_str(&thread_id_str)
                .map_err(|e| Error::Database(format!("Invalid thread ID in database: {}", e)))?;
            let role = match role_str.as_str() {
                "user" => MessageRole::User,
                "assistant" => MessageRole::Assistant,
                "system" => MessageRole::System,
                _ => {
                    return Err(Error::Database(format!(
                        "Invalid message role in database: {}",
                        role_str
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

        // Get the next turn number
        let max_turn: Option<(Option<i64>,)> =
            sqlx::query_as("SELECT MAX(turn_number) FROM thread_turns WHERE thread_id = ?")
                .bind(thread_id.to_string())
                .fetch_optional(&self.pool)
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

        let turn_number = max_turn
            .and_then(|(max,)| max)
            .map(|n| n as u32 + 1)
            .unwrap_or(1);

        sqlx::query(
            "INSERT INTO thread_turns (id, thread_id, turn_number, created_at) VALUES (?, ?, ?, ?)",
        )
        .bind(id.to_string())
        .bind(thread_id.to_string())
        .bind(turn_number as i64)
        .bind(&now)
        .execute(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        Ok(ThreadTurn {
            id,
            thread_id,
            turn_number,
            created_at: now,
        })
    }

    async fn list_turns(&self, thread_id: ThreadId) -> Result<Vec<ThreadTurn>> {
        let rows: Vec<(String, String, i64, String)> = sqlx::query_as(
            "SELECT id, thread_id, turn_number, created_at FROM thread_turns WHERE thread_id = ? ORDER BY turn_number ASC",
        )
        .bind(thread_id.to_string())
        .fetch_all(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        let mut turns = Vec::new();
        for (id_str, thread_id_str, turn_number, created_at) in rows {
            let id = Uuid::parse_str(&id_str)
                .map_err(|e| Error::Database(format!("Invalid turn ID in database: {}", e)))?;
            let thread_id = Uuid::parse_str(&thread_id_str)
                .map_err(|e| Error::Database(format!("Invalid thread ID in database: {}", e)))?;
            let turn_number = u32::try_from(turn_number)
                .map_err(|e| Error::Database(format!("Invalid turn number in database: {}", e)))?;
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
