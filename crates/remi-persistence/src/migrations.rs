//! Database migrations.

use remi_core::{Error, Result};
use sqlx::SqlitePool;
use tracing::info;

/// Run all migrations.
pub async fn run_migrations(pool: &SqlitePool) -> Result<()> {
    info!("Running database migrations");

    // Migration 001: Orchestration Events
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS orchestration_events (
            id TEXT PRIMARY KEY,
            thread_id TEXT NOT NULL,
            event_type TEXT NOT NULL,
            payload TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| Error::Database(e.to_string()))?;

    // Migration 002: Command Receipts
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS command_receipts (
            id TEXT PRIMARY KEY,
            command_id TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL
        )
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| Error::Database(e.to_string()))?;

    // Migration 003: Checkpoint Diff Blobs
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS checkpoint_diff_blobs (
            id TEXT PRIMARY KEY,
            thread_id TEXT NOT NULL,
            diff_content TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| Error::Database(e.to_string()))?;

    // Migration 004: Provider Session Runtime
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS provider_session_runtime (
            id TEXT PRIMARY KEY,
            provider TEXT NOT NULL,
            model TEXT NOT NULL,
            session_data TEXT NOT NULL,
            created_at TEXT NOT NULL,
            last_activity TEXT NOT NULL
        )
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| Error::Database(e.to_string()))?;

    // Migration 005: Projections
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            path TEXT NOT NULL UNIQUE,
            kind TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS threads (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            title TEXT,
            state TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS thread_messages (
            id TEXT PRIMARY KEY,
            thread_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS thread_turns (
            id TEXT PRIMARY KEY,
            thread_id TEXT NOT NULL,
            turn_number INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_threads_project_id ON threads(project_id);
        CREATE INDEX IF NOT EXISTS idx_thread_messages_thread_id ON thread_messages(thread_id);
        CREATE INDEX IF NOT EXISTS idx_thread_turns_thread_id ON thread_turns(thread_id);
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| Error::Database(e.to_string()))?;

    info!("Database migrations completed successfully");
    Ok(())
}
