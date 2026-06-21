//! Migration 017: Thread handoff metadata
//!
//! Persists the structured handoff payload exchanged when a thread is
//! exported to another agent (e.g. local → remote branch).

pub const VERSION: u32 = 17;
pub const NAME: &str = "017_thread_handoff_metadata";
pub const SQL: &str = r#"
ALTER TABLE projection_threads
    ADD COLUMN IF NOT EXISTS handoff TEXT;
ALTER TABLE projection_threads
    ADD COLUMN IF NOT EXISTS handoff_at TEXT;
"#;
