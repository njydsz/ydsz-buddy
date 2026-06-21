//! Migration 023: Threads associated worktree ref
//!
//! Captures the commit ref (sha or branch name) the worktree is pinned to.

pub const VERSION: u32 = 23;
pub const NAME: &str = "023_projection_threads_associated_worktree_ref";
pub const SQL: &str = r#"
ALTER TABLE projection_threads
    ADD COLUMN IF NOT EXISTS associated_worktree_ref TEXT;
"#;
