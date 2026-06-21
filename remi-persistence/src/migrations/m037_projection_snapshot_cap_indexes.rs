//! Migration 037: Projection snapshot cap indexes
//!
//! Final performance migration — adds the descending indexes required for
//! the snapshot read path used by `getSnapshot`/`getCounts` to scan
//! thread lists and activities in O(log n) time.

pub const VERSION: u32 = 37;
pub const NAME: &str = "037_projection_snapshot_cap_indexes";
pub const SQL: &str = r#"
CREATE INDEX IF NOT EXISTS idx_projection_threads_project_updated_desc
    ON projection_threads(project_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_projection_threads_project_created_desc
    ON projection_threads(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_projection_projects_workspace_root
    ON projection_projects(workspace_root);
CREATE INDEX IF NOT EXISTS idx_projection_thread_messages_thread_created_desc
    ON projection_thread_messages(thread_id, created_at DESC, message_id DESC);
CREATE INDEX IF NOT EXISTS idx_projection_thread_activities_thread_rank_desc
    ON projection_thread_activities(
        thread_id,
        (CASE WHEN sequence IS NULL THEN 0 ELSE 1 END) DESC,
        sequence DESC,
        created_at DESC,
        activity_id DESC
    );
CREATE INDEX IF NOT EXISTS idx_projection_threads_archived_at
    ON projection_threads(archived_at);
CREATE INDEX IF NOT EXISTS idx_projection_threads_subagent
    ON projection_threads(subagent);
CREATE INDEX IF NOT EXISTS idx_projection_thread_messages_turn_id
    ON projection_thread_messages(turn_id);
CREATE INDEX IF NOT EXISTS idx_orch_command_receipts_status
    ON orchestration_command_receipts(status, result_sequence);
CREATE INDEX IF NOT EXISTS idx_projection_thread_sessions_provider_thread
    ON projection_thread_sessions(provider_thread_id);
CREATE INDEX IF NOT EXISTS idx_projection_thread_sessions_status
    ON projection_thread_sessions(status);
"#;
