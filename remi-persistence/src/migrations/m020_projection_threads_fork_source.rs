//! Migration 020: Threads fork source
//!
//! Records the parent thread when a thread is forked (via `fork_thread`).

pub const VERSION: u32 = 20;
pub const NAME: &str = "020_projection_threads_fork_source";
pub const SQL: &str = r#"
ALTER TABLE projection_threads
    ADD COLUMN IF NOT EXISTS fork_source_thread_id TEXT;
"#;
