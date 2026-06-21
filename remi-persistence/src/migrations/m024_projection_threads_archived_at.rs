//! Migration 024: Threads archived-at
//!
//! Records the timestamp a thread was archived (soft-hidden from the
//! sidebar but still queryable).

pub const VERSION: u32 = 24;
pub const NAME: &str = "024_projection_threads_archived_at";
pub const SQL: &str = r#"
ALTER TABLE projection_threads
    ADD COLUMN IF NOT EXISTS archived_at TEXT;
"#;
