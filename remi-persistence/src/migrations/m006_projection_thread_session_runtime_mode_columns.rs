//! Migration 006: Thread session runtime-mode columns
//!
//! Adds the `runtime_mode` and `interaction_mode` columns to the thread
//! session projection (denormalized for sidebar filtering).

pub const VERSION: u32 = 6;
pub const NAME: &str = "006_projection_thread_session_runtime_mode_columns";
pub const SQL: &str = r#"
ALTER TABLE projection_thread_sessions
    ADD COLUMN IF NOT EXISTS runtime_mode TEXT NOT NULL DEFAULT 'full-access';
ALTER TABLE projection_thread_sessions
    ADD COLUMN IF NOT EXISTS interaction_mode TEXT NOT NULL DEFAULT 'default';
"#;
