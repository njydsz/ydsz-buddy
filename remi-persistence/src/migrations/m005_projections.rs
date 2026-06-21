//! Migration 005: Projections (base tables)
//!
//! Introduces every read-side projection table in its canonical form:
//!
//! - `projection_projects` / `projection_threads` — the core read model
//! - `projection_thread_messages` / `projection_thread_activities` — chat data
//! - `projection_thread_sessions` / `projection_turns` — runtime state
//! - `projection_pending_approvals` — approval workflow state
//! - `projection_state` — projector last-applied sequence watermark
//! - `checkpoints` — checkpoint metadata
//!
//! Subsequent migrations extend these tables with additional columns
//! and indexes.

pub const VERSION: u32 = 5;
pub const NAME: &str = "005_projections";
pub const SQL: &str = r#"
-- ── Projects (read model) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projection_projects (
    project_id TEXT PRIMARY KEY,
    kind TEXT NOT NULL DEFAULT 'project',
    title TEXT NOT NULL,
    workspace_root TEXT NOT NULL,
    default_model_selection_json TEXT,
    scripts_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);

-- ── Threads (read model) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projection_threads (
    thread_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    title TEXT NOT NULL,
    model_selection TEXT NOT NULL,
    runtime_mode TEXT NOT NULL DEFAULT 'full-access',
    interaction_mode TEXT NOT NULL DEFAULT 'default',
    env_mode TEXT NOT NULL DEFAULT 'local',
    branch TEXT,
    worktree_path TEXT,
    associated_worktree TEXT,
    is_pinned INTEGER NOT NULL DEFAULT 0,
    parent_thread_id TEXT,
    subagent TEXT,
    fork_source_thread_id TEXT,
    sidechat_source_thread_id TEXT,
    last_known_pr TEXT,
    latest_turn TEXT,
    latest_user_message_at TEXT,
    has_pending_approvals INTEGER NOT NULL DEFAULT 0,
    has_pending_user_input INTEGER NOT NULL DEFAULT 0,
    has_actionable_proposed_plan INTEGER NOT NULL DEFAULT 0,
    messages TEXT NOT NULL DEFAULT '[]',
    proposed_plans TEXT NOT NULL DEFAULT '[]',
    activities TEXT NOT NULL DEFAULT '[]',
    checkpoints TEXT NOT NULL DEFAULT '[]',
    session TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    archived_at TEXT,
    deleted_at TEXT,
    handoff TEXT
);

-- ── Thread messages ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projection_thread_messages (
    message_id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL,
    turn_id TEXT,
    role TEXT NOT NULL,
    text TEXT NOT NULL,
    is_streaming INTEGER NOT NULL DEFAULT 0,
    attachments_json TEXT,
    source TEXT NOT NULL DEFAULT 'native',
    skills_json TEXT,
    mentions_json TEXT,
    dispatch_mode TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- ── Thread activities ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projection_thread_activities (
    activity_id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL,
    turn_id TEXT,
    tone TEXT NOT NULL,
    kind TEXT NOT NULL,
    summary TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    sequence INTEGER,
    created_at TEXT NOT NULL
);

-- ── Thread sessions (Provider runtime) ────────────────────────────────
CREATE TABLE IF NOT EXISTS projection_thread_sessions (
    thread_id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    provider_name TEXT,
    provider_session_id TEXT,
    provider_thread_id TEXT,
    runtime_mode TEXT NOT NULL DEFAULT 'full-access',
    interaction_mode TEXT NOT NULL DEFAULT 'default',
    active_turn_id TEXT,
    last_error TEXT,
    updated_at TEXT NOT NULL
);

-- ── Conversation turns ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projection_turns (
    row_id INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id TEXT NOT NULL,
    turn_id TEXT,
    pending_message_id TEXT,
    source_proposed_plan_thread_id TEXT,
    source_proposed_plan_id TEXT,
    assistant_message_id TEXT,
    state TEXT NOT NULL,
    requested_at TEXT NOT NULL,
    started_at TEXT,
    completed_at TEXT,
    checkpoint_turn_count INTEGER,
    checkpoint_ref TEXT,
    checkpoint_status TEXT,
    checkpoint_files_json TEXT NOT NULL DEFAULT '[]',
    UNIQUE (thread_id, turn_id),
    UNIQUE (thread_id, checkpoint_turn_count)
);

-- ── Pending approvals ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projection_pending_approvals (
    request_id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL,
    turn_id TEXT,
    status TEXT NOT NULL,
    decision TEXT,
    created_at TEXT NOT NULL,
    resolved_at TEXT
);

-- ── Projector state watermark ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projection_state (
    projector TEXT PRIMARY KEY,
    last_applied_sequence INTEGER NOT NULL,
    updated_at TEXT NOT NULL
);

-- ── Checkpoints metadata ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS checkpoints (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL,
    turn_id TEXT NOT NULL,
    git_ref TEXT NOT NULL,
    description TEXT NOT NULL,
    created_at TEXT NOT NULL
);

-- ── Initial indexes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_projection_projects_updated_at
    ON projection_projects(updated_at);
CREATE INDEX IF NOT EXISTS idx_projection_threads_project_id
    ON projection_threads(project_id);
CREATE INDEX IF NOT EXISTS idx_projection_threads_parent_thread_id
    ON projection_threads(parent_thread_id);
CREATE INDEX IF NOT EXISTS idx_projection_thread_messages_thread_created
    ON projection_thread_messages(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_projection_thread_activities_thread_created
    ON projection_thread_activities(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_projection_pending_approvals_thread_status
    ON projection_pending_approvals(thread_id, status);
CREATE INDEX IF NOT EXISTS idx_checkpoints_thread_id
    ON checkpoints(thread_id);
CREATE INDEX IF NOT EXISTS idx_checkpoints_turn_id
    ON checkpoints(turn_id);
"#;
