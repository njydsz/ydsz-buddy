//! Migration 036: Threads pinned
//!
//! Persists the pin flag so the user can mark important threads and the
//! Sidebar can render them at the top of the list.

pub const VERSION: u32 = 36;
pub const NAME: &str = "036_projection_threads_pinned";
pub const SQL: &str = r#"
ALTER TABLE projection_threads
    ADD COLUMN IF NOT EXISTS is_pinned INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_projection_threads_pinned
    ON projection_threads(is_pinned);
"#;
