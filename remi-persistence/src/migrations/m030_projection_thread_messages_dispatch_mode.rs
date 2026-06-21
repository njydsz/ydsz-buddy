//! Migration 030: Thread messages dispatch mode
//!
//! Captures the per-message dispatch mode (e.g. `plan` → review then
//! implement) used by the orchestrator.

pub const VERSION: u32 = 30;
pub const NAME: &str = "030_projection_thread_messages_dispatch_mode";
pub const SQL: &str = r#"
ALTER TABLE projection_thread_messages
    ADD COLUMN IF NOT EXISTS dispatch_mode TEXT;
CREATE INDEX IF NOT EXISTS idx_projection_thread_messages_dispatch_mode
    ON projection_thread_messages(thread_id, dispatch_mode);
"#;
