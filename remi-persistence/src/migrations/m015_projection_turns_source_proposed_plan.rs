//! Migration 015: Turns source proposed plan
//!
//! Adds the `source_proposed_plan_thread_id` and `source_proposed_plan_id`
//! columns to `projection_turns` so a turn can be linked back to the plan
//! that spawned it.

pub const VERSION: u32 = 15;
pub const NAME: &str = "015_projection_turns_source_proposed_plan";
pub const SQL: &str = r#"
ALTER TABLE projection_turns
    ADD COLUMN IF NOT EXISTS source_proposed_plan_thread_id TEXT;
ALTER TABLE projection_turns
    ADD COLUMN IF NOT EXISTS source_proposed_plan_id TEXT;
"#;
