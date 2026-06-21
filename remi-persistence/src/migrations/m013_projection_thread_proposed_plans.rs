//! Migration 013: Thread proposed plans
//!
//! Adds a `projection_thread_proposed_plans` table that holds model
//! proposed plans awaiting user implementation.

pub const VERSION: u32 = 13;
pub const NAME: &str = "013_projection_thread_proposed_plans";
pub const SQL: &str = r#"
CREATE TABLE IF NOT EXISTS projection_thread_proposed_plans (
    plan_id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL,
    turn_id TEXT,
    plan_markdown TEXT NOT NULL,
    implemented_at TEXT,
    implementation_thread_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_projection_thread_proposed_plans_thread_created
    ON projection_thread_proposed_plans(thread_id, created_at);
"#;
