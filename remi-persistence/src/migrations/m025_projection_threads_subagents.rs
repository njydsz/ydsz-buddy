//! Migration 025: Threads subagents
//!
//! Adds a JSON column listing the sub-agents spawned by a thread for
//! hierarchical display in the sidebar.

pub const VERSION: u32 = 25;
pub const NAME: &str = "025_projection_threads_subagents";
pub const SQL: &str = r#"
ALTER TABLE projection_threads
    ADD COLUMN IF NOT EXISTS subagent TEXT;
"#;
