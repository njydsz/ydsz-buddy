//! Migration 008: Thread activity sequence
//!
//! Adds the `sequence` column to thread activities so they can be replayed
//! in deterministic order across reconnects.

pub const VERSION: u32 = 8;
pub const NAME: &str = "008_projection_thread_activity_sequence";
pub const SQL: &str = r#"
ALTER TABLE projection_thread_activities
    ADD COLUMN IF NOT EXISTS sequence INTEGER;

CREATE INDEX IF NOT EXISTS idx_projection_thread_activities_thread_sequence
    ON projection_thread_activities(thread_id, sequence);
"#;
