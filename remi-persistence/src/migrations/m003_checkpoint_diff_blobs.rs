//! Migration 003: Checkpoint Diff Blobs
//!
//! Stores the textual diff between consecutive checkpoints so the UI can
//! replay/restart a Turn at a known turn count without rerunning the agent.

pub const VERSION: u32 = 3;
pub const NAME: &str = "003_checkpoint_diff_blobs";
pub const SQL: &str = r#"
CREATE TABLE IF NOT EXISTS checkpoint_diff_blobs (
    thread_id TEXT NOT NULL,
    from_turn_count INTEGER NOT NULL,
    to_turn_count INTEGER NOT NULL,
    diff TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (thread_id, from_turn_count, to_turn_count)
);

CREATE INDEX IF NOT EXISTS idx_checkpoint_diff_blobs_thread_to_turn
    ON checkpoint_diff_blobs(thread_id, to_turn_count);
"#;
