//! Migration 021: Threads associated worktree
//!
//! Persists the worktree path associated with a thread so the editor can
//! reopen the correct directory on resume.

pub const VERSION: u32 = 21;
pub const NAME: &str = "021_projection_threads_associated_worktree";
pub const SQL: &str = r#"
ALTER TABLE projection_threads
    ADD COLUMN IF NOT EXISTS associated_worktree TEXT;
ALTER TABLE projection_threads
    ADD COLUMN IF NOT EXISTS worktree_path TEXT;
"#;
