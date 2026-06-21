//! Migration 001: Orchestration Events
//!
//! Creates the `orchestration_events` table — the core event-sourcing stream.
//! Every orchestration command produces one or more events that are appended
//! here and replayed by projection reactors.

/// Migration version number (monotonically increasing).
pub const VERSION: u32 = 1;
/// Human-readable migration name (must be unique).
pub const NAME: &str = "001_orchestration_events";
/// SQL script executed when this migration is applied.
pub const SQL: &str = r#"
CREATE TABLE IF NOT EXISTS orchestration_events (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT NOT NULL UNIQUE,
    aggregate_kind TEXT NOT NULL,
    stream_id TEXT NOT NULL,
    stream_version INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    command_id TEXT,
    causation_event_id TEXT,
    correlation_id TEXT,
    actor_kind TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    metadata_json TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_orch_events_stream_version
    ON orchestration_events(aggregate_kind, stream_id, stream_version);
CREATE INDEX IF NOT EXISTS idx_orch_events_stream_sequence
    ON orchestration_events(aggregate_kind, stream_id, sequence);
CREATE INDEX IF NOT EXISTS idx_orch_events_command_id
    ON orchestration_events(command_id);
CREATE INDEX IF NOT EXISTS idx_orch_events_correlation_id
    ON orchestration_events(correlation_id);
"#;
