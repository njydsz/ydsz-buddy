//! Migration 011: Orchestration thread-created runtime mode
//!
//! Records the `runtime_mode` chosen at thread creation time so the
//! orchestrator can deterministically reproduce the same access policy on
//! resume.

pub const VERSION: u32 = 11;
pub const NAME: &str = "011_orchestration_thread_created_runtime_mode";
pub const SQL: &str = r#"
ALTER TABLE projection_threads
    ADD COLUMN IF NOT EXISTS thread_created_at TEXT;
"#;
