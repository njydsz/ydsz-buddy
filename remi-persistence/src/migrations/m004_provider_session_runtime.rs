//! Migration 004: Provider Session Runtime
//!
//! Tracks the live runtime state of a Provider's session for a given thread
//! (resume cursors, last-seen timestamps, runtime payload snapshots).

pub const VERSION: u32 = 4;
pub const NAME: &str = "004_provider_session_runtime";
pub const SQL: &str = r#"
CREATE TABLE IF NOT EXISTS provider_session_runtime (
    thread_id TEXT PRIMARY KEY,
    provider_name TEXT NOT NULL,
    adapter_key TEXT NOT NULL,
    runtime_mode TEXT NOT NULL DEFAULT 'full-access',
    status TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    resume_cursor_json TEXT,
    runtime_payload_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_provider_session_runtime_status
    ON provider_session_runtime(status);
CREATE INDEX IF NOT EXISTS idx_provider_session_runtime_provider
    ON provider_session_runtime(provider_name);
"#;
