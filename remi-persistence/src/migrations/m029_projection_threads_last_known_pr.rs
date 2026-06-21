//! Migration 029: Threads last-known PR
//!
//! Caches the URL of the most recently opened / merged PR for a thread so
//! the sidebar can render a PR link without re-running git resolution.

pub const VERSION: u32 = 29;
pub const NAME: &str = "029_projection_threads_last_known_pr";
pub const SQL: &str = r#"
ALTER TABLE projection_threads
    ADD COLUMN IF NOT EXISTS last_known_pr TEXT;
CREATE INDEX IF NOT EXISTS idx_projection_threads_last_known_pr
    ON projection_threads(last_known_pr);
"#;
