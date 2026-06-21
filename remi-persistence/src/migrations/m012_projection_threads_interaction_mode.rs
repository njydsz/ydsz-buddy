//! Migration 012: Threads interaction mode
//!
//! Persists the thread-level interaction mode (default, plan, diff, sidechat).

pub const VERSION: u32 = 12;
pub const NAME: &str = "012_projection_threads_interaction_mode";
pub const SQL: &str = r#"
ALTER TABLE projection_threads
    ADD COLUMN IF NOT EXISTS interaction_mode TEXT NOT NULL DEFAULT 'default';
"#;
