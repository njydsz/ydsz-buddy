//! Migration 014: Proposed plan implementation
//!
//! Records when (and into which thread) a proposed plan was implemented.

pub const VERSION: u32 = 14;
pub const NAME: &str = "014_projection_thread_proposed_plan_implementation";
pub const SQL: &str = r#"
ALTER TABLE projection_thread_proposed_plans
    ADD COLUMN IF NOT EXISTS implementation_thread_id TEXT;
ALTER TABLE projection_thread_proposed_plans
    ADD COLUMN IF NOT EXISTS implemented_at TEXT;
"#;
