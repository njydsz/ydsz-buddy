//! Migration 002: Orchestration Command Receipts
//!
//! Persists the result of every accepted orchestration command, providing a
//! correlation handle for clients to poll completion status.

pub const VERSION: u32 = 2;
pub const NAME: &str = "002_orchestration_command_receipts";
pub const SQL: &str = r#"
CREATE TABLE IF NOT EXISTS orchestration_command_receipts (
    command_id TEXT PRIMARY KEY,
    aggregate_kind TEXT NOT NULL,
    aggregate_id TEXT NOT NULL,
    accepted_at TEXT NOT NULL,
    result_sequence INTEGER NOT NULL,
    status TEXT NOT NULL,
    error TEXT
);

CREATE INDEX IF NOT EXISTS idx_orch_command_receipts_aggregate
    ON orchestration_command_receipts(aggregate_kind, aggregate_id);
CREATE INDEX IF NOT EXISTS idx_orch_command_receipts_sequence
    ON orchestration_command_receipts(result_sequence);
"#;
