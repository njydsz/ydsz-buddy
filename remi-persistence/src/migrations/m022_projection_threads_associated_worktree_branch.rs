//! Migration 022: Threads associated worktree branch
//!
//! Captures the git branch checked out inside the associated worktree.

pub const VERSION: u32 = 22;
pub const NAME: &str = "022_projection_threads_associated_worktree_branch";
pub const SQL: &str = r#"
ALTER TABLE projection_threads
    ADD COLUMN IF NOT EXISTS associated_worktree_branch TEXT;
"#;
