//! Migration 019: Threads environment mode
//!
//! Adds the `env_mode` column to track whether a thread runs in `local` or
//! `worktree` (isolated git worktree) environment.

pub const VERSION: u32 = 19;
pub const NAME: &str = "019_projection_threads_env_mode";
pub const SQL: &str = r#"
ALTER TABLE projection_threads
    ADD COLUMN IF NOT EXISTS env_mode TEXT NOT NULL DEFAULT 'local';
"#;
