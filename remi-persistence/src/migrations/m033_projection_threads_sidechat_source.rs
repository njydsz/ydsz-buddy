//! Migration 033: Threads sidechat source
//!
//! Persists the originating thread for a sidechat (a thread started as a
//! sidebar question from another thread).

pub const VERSION: u32 = 33;
pub const NAME: &str = "033_projection_threads_sidechat_source";
pub const SQL: &str = r#"
ALTER TABLE projection_threads
    ADD COLUMN IF NOT EXISTS sidechat_source_thread_id TEXT;
CREATE INDEX IF NOT EXISTS idx_projection_threads_sidechat_source
    ON projection_threads(sidechat_source_thread_id);
"#;
