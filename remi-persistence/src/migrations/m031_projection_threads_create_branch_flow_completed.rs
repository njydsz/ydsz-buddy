//! Migration 031: Threads create-branch-flow-completed
//!
//! Marks whether the user has gone through the "create branch" wizard for
//! a thread, so the Sidebar can show a different action icon.

pub const VERSION: u32 = 31;
pub const NAME: &str = "031_projection_threads_create_branch_flow_completed";
pub const SQL: &str = r#"
ALTER TABLE projection_threads
    ADD COLUMN IF NOT EXISTS create_branch_flow_completed INTEGER NOT NULL DEFAULT 0;
"#;
