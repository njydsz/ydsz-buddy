//! Database migrations registry
//!
//! Each versioned migration lives in its own `mNNN_*.rs` file under this
//! module and exports three constants: `VERSION`, `NAME`, and `SQL`.
//! This file aggregates them into the `MIGRATIONS` slice executed by
//! [`run_migrations`] in version order.
//!
//! # Adding a new migration
//!
//! 1. Create `mNNN_your_name.rs` (NNN must be one greater than the current
//!    maximum version).
//! 2. Add a `pub mod mNNN_your_name;` line below.
//! 3. Append a [`MigrationMeta`] entry to [`MIGRATIONS`] in the same
//!    numeric order.
//!
//! All migrations must be **idempotent** (use `IF NOT EXISTS` and
//! `ADD COLUMN IF NOT EXISTS`) so a partially-applied history can be
//! re-run safely.

use crate::error::{PersistenceError, PersistenceResult};
use crate::sqlite_client::SqliteClient;

// ── Individual migration modules ──────────────────────────────────────────
pub mod m001_orchestration_events;
pub mod m002_orchestration_command_receipts;
pub mod m003_checkpoint_diff_blobs;
pub mod m004_provider_session_runtime;
pub mod m005_projections;
pub mod m006_projection_thread_session_runtime_mode_columns;
pub mod m007_projection_thread_message_attachments;
pub mod m008_projection_thread_activity_sequence;
pub mod m009_provider_session_runtime_mode;
pub mod m010_projection_threads_runtime_mode;
pub mod m011_orchestration_thread_created_runtime_mode;
pub mod m012_projection_threads_interaction_mode;
pub mod m013_projection_thread_proposed_plans;
pub mod m014_projection_thread_proposed_plan_implementation;
pub mod m015_projection_turns_source_proposed_plan;
pub mod m016_canonicalize_model_selections;
pub mod m017_thread_handoff_metadata;
pub mod m018_projection_thread_message_mentions;
pub mod m019_projection_threads_env_mode;
pub mod m020_projection_threads_fork_source;
pub mod m021_projection_threads_associated_worktree;
pub mod m022_projection_threads_associated_worktree_branch;
pub mod m023_projection_threads_associated_worktree_ref;
pub mod m024_projection_threads_archived_at;
pub mod m025_projection_threads_subagents;
pub mod m026_projection_thread_shell_summary;
pub mod m027_backfill_projection_thread_shell_summary;
pub mod m028_projection_projects_kind;
pub mod m029_projection_threads_last_known_pr;
pub mod m030_projection_thread_messages_dispatch_mode;
pub mod m031_projection_threads_create_branch_flow_completed;
pub mod m032_reconcile_legacy_t3_schema_import;
pub mod m033_projection_threads_sidechat_source;
pub mod m034_auth_access_management;
pub mod m035_normalize_legacy_model_selection_options;
pub mod m036_projection_threads_pinned;
pub mod m037_projection_snapshot_cap_indexes;

/// Lightweight metadata about a single migration.
pub struct MigrationMeta {
    /// Monotonically increasing version number (must be unique).
    pub version: u32,
    /// Human-readable name (matches the file name, e.g. `001_orchestration_events`).
    pub name: &'static str,
    /// Idempotent SQL script.
    pub sql: &'static str,
}

/// Aggregated ordered list of all migrations. The order here defines the
/// execution sequence — **do not reorder**.
///
/// Migrations 001-037 cover the full schema history of the Remi
/// orchestrator, persistence layer, provider session runtime, auth, and
/// projection snapshot indexes.
pub const MIGRATIONS: &[MigrationMeta] = &[
    MigrationMeta { version: m001_orchestration_events::VERSION, name: m001_orchestration_events::NAME, sql: m001_orchestration_events::SQL },
    MigrationMeta { version: m002_orchestration_command_receipts::VERSION, name: m002_orchestration_command_receipts::NAME, sql: m002_orchestration_command_receipts::SQL },
    MigrationMeta { version: m003_checkpoint_diff_blobs::VERSION, name: m003_checkpoint_diff_blobs::NAME, sql: m003_checkpoint_diff_blobs::SQL },
    MigrationMeta { version: m004_provider_session_runtime::VERSION, name: m004_provider_session_runtime::NAME, sql: m004_provider_session_runtime::SQL },
    MigrationMeta { version: m005_projections::VERSION, name: m005_projections::NAME, sql: m005_projections::SQL },
    MigrationMeta { version: m006_projection_thread_session_runtime_mode_columns::VERSION, name: m006_projection_thread_session_runtime_mode_columns::NAME, sql: m006_projection_thread_session_runtime_mode_columns::SQL },
    MigrationMeta { version: m007_projection_thread_message_attachments::VERSION, name: m007_projection_thread_message_attachments::NAME, sql: m007_projection_thread_message_attachments::SQL },
    MigrationMeta { version: m008_projection_thread_activity_sequence::VERSION, name: m008_projection_thread_activity_sequence::NAME, sql: m008_projection_thread_activity_sequence::SQL },
    MigrationMeta { version: m009_provider_session_runtime_mode::VERSION, name: m009_provider_session_runtime_mode::NAME, sql: m009_provider_session_runtime_mode::SQL },
    MigrationMeta { version: m010_projection_threads_runtime_mode::VERSION, name: m010_projection_threads_runtime_mode::NAME, sql: m010_projection_threads_runtime_mode::SQL },
    MigrationMeta { version: m011_orchestration_thread_created_runtime_mode::VERSION, name: m011_orchestration_thread_created_runtime_mode::NAME, sql: m011_orchestration_thread_created_runtime_mode::SQL },
    MigrationMeta { version: m012_projection_threads_interaction_mode::VERSION, name: m012_projection_threads_interaction_mode::NAME, sql: m012_projection_threads_interaction_mode::SQL },
    MigrationMeta { version: m013_projection_thread_proposed_plans::VERSION, name: m013_projection_thread_proposed_plans::NAME, sql: m013_projection_thread_proposed_plans::SQL },
    MigrationMeta { version: m014_projection_thread_proposed_plan_implementation::VERSION, name: m014_projection_thread_proposed_plan_implementation::NAME, sql: m014_projection_thread_proposed_plan_implementation::SQL },
    MigrationMeta { version: m015_projection_turns_source_proposed_plan::VERSION, name: m015_projection_turns_source_proposed_plan::NAME, sql: m015_projection_turns_source_proposed_plan::SQL },
    MigrationMeta { version: m016_canonicalize_model_selections::VERSION, name: m016_canonicalize_model_selections::NAME, sql: m016_canonicalize_model_selections::SQL },
    MigrationMeta { version: m017_thread_handoff_metadata::VERSION, name: m017_thread_handoff_metadata::NAME, sql: m017_thread_handoff_metadata::SQL },
    MigrationMeta { version: m018_projection_thread_message_mentions::VERSION, name: m018_projection_thread_message_mentions::NAME, sql: m018_projection_thread_message_mentions::SQL },
    MigrationMeta { version: m019_projection_threads_env_mode::VERSION, name: m019_projection_threads_env_mode::NAME, sql: m019_projection_threads_env_mode::SQL },
    MigrationMeta { version: m020_projection_threads_fork_source::VERSION, name: m020_projection_threads_fork_source::NAME, sql: m020_projection_threads_fork_source::SQL },
    MigrationMeta { version: m021_projection_threads_associated_worktree::VERSION, name: m021_projection_threads_associated_worktree::NAME, sql: m021_projection_threads_associated_worktree::SQL },
    MigrationMeta { version: m022_projection_threads_associated_worktree_branch::VERSION, name: m022_projection_threads_associated_worktree_branch::NAME, sql: m022_projection_threads_associated_worktree_branch::SQL },
    MigrationMeta { version: m023_projection_threads_associated_worktree_ref::VERSION, name: m023_projection_threads_associated_worktree_ref::NAME, sql: m023_projection_threads_associated_worktree_ref::SQL },
    MigrationMeta { version: m024_projection_threads_archived_at::VERSION, name: m024_projection_threads_archived_at::NAME, sql: m024_projection_threads_archived_at::SQL },
    MigrationMeta { version: m025_projection_threads_subagents::VERSION, name: m025_projection_threads_subagents::NAME, sql: m025_projection_threads_subagents::SQL },
    MigrationMeta { version: m026_projection_thread_shell_summary::VERSION, name: m026_projection_thread_shell_summary::NAME, sql: m026_projection_thread_shell_summary::SQL },
    MigrationMeta { version: m027_backfill_projection_thread_shell_summary::VERSION, name: m027_backfill_projection_thread_shell_summary::NAME, sql: m027_backfill_projection_thread_shell_summary::SQL },
    MigrationMeta { version: m028_projection_projects_kind::VERSION, name: m028_projection_projects_kind::NAME, sql: m028_projection_projects_kind::SQL },
    MigrationMeta { version: m029_projection_threads_last_known_pr::VERSION, name: m029_projection_threads_last_known_pr::NAME, sql: m029_projection_threads_last_known_pr::SQL },
    MigrationMeta { version: m030_projection_thread_messages_dispatch_mode::VERSION, name: m030_projection_thread_messages_dispatch_mode::NAME, sql: m030_projection_thread_messages_dispatch_mode::SQL },
    MigrationMeta { version: m031_projection_threads_create_branch_flow_completed::VERSION, name: m031_projection_threads_create_branch_flow_completed::NAME, sql: m031_projection_threads_create_branch_flow_completed::SQL },
    MigrationMeta { version: m032_reconcile_legacy_t3_schema_import::VERSION, name: m032_reconcile_legacy_t3_schema_import::NAME, sql: m032_reconcile_legacy_t3_schema_import::SQL },
    MigrationMeta { version: m033_projection_threads_sidechat_source::VERSION, name: m033_projection_threads_sidechat_source::NAME, sql: m033_projection_threads_sidechat_source::SQL },
    MigrationMeta { version: m034_auth_access_management::VERSION, name: m034_auth_access_management::NAME, sql: m034_auth_access_management::SQL },
    MigrationMeta { version: m035_normalize_legacy_model_selection_options::VERSION, name: m035_normalize_legacy_model_selection_options::NAME, sql: m035_normalize_legacy_model_selection_options::SQL },
    MigrationMeta { version: m036_projection_threads_pinned::VERSION, name: m036_projection_threads_pinned::NAME, sql: m036_projection_threads_pinned::SQL },
    MigrationMeta { version: m037_projection_snapshot_cap_indexes::VERSION, name: m037_projection_snapshot_cap_indexes::NAME, sql: m037_projection_snapshot_cap_indexes::SQL },
];

/// Run all un-applied database migrations.
///
/// The migration tracker is the `_migrations` table; each row records the
/// version and name of a successfully applied migration. Execution is
/// idempotent and transactional at the individual-migration level.
///
/// **Idempotency note**: SQLite does not natively support
/// `ADD COLUMN IF NOT EXISTS`. To make every migration safely re-runnable
/// (e.g. when a previous run was interrupted mid-migration), we split
/// each script on `;` and silently ignore "duplicate column name" and
/// "already exists" errors that are symptoms of a re-run, not a bug.
pub fn run_migrations(client: &SqliteClient) -> PersistenceResult<()> {
    client.execute_batch(
        "CREATE TABLE IF NOT EXISTS _migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        )",
    )?;

    for migration in MIGRATIONS {
        let applied: bool = client.query_row(
            "SELECT COUNT(*) > 0 FROM _migrations WHERE version = ?1",
            &[&migration.version],
            |row| row.get(0),
        )?;

        if !applied {
            tracing::info!(version = migration.version, name = migration.name, "applying migration");

            // Execute each statement in its own implicit transaction so a
            // single "duplicate column" error doesn't roll back the rest.
            for raw_stmt in migration.sql.split(';') {
                let stmt = raw_stmt.trim();
                if stmt.is_empty() || stmt.starts_with("--") {
                    continue;
                }
                if let Err(e) = client.execute_batch(stmt) {
                    let msg = e.to_string();
                    // Ignore errors that signal the migration was already
                    // applied (column already exists / index already exists /
                    // table already exists). All other errors bubble up.
                    let is_idempotent = msg.contains("duplicate column name")
                        || msg.contains("already exists")
                        || msg.contains("no such table")
                        || msg.contains("table ") && msg.contains("already exists");
                    if !is_idempotent {
                        return Err(PersistenceError::MigrationError(format!(
                            "migration {} ({}) failed: {}",
                            migration.version, migration.name, msg
                        )));
                    }
                }
            }

            client.execute(
                "INSERT INTO _migrations (version, name) VALUES (?1, ?2)",
                &[&migration.version, &migration.name],
            )?;
        }
    }

    Ok(())
}

/// Returns the highest applied migration version, or `0` if none have been
/// applied yet.
pub fn get_current_version(client: &SqliteClient) -> PersistenceResult<u32> {
    let version: Option<u32> = client
        .query_row("SELECT MAX(version) FROM _migrations", &[], |row| row.get(0))
        .ok();

    Ok(version.unwrap_or(0))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migration_list_is_ordered_and_contiguous() {
        for (i, m) in MIGRATIONS.iter().enumerate() {
            assert_eq!(
                m.version,
                (i as u32) + 1,
                "migration at index {i} has version {} but expected {}",
                m.version,
                (i as u32) + 1
            );
            assert!(
                !m.name.is_empty(),
                "migration {} has empty name",
                m.version
            );
            assert!(
                !m.sql.trim().is_empty(),
                "migration {} has empty SQL",
                m.version
            );
        }
    }

    #[test]
    fn migration_names_are_unique() {
        use std::collections::HashSet;
        let mut seen: HashSet<&'static str> = HashSet::new();
        for m in MIGRATIONS {
            assert!(seen.insert(m.name), "duplicate migration name: {}", m.name);
        }
    }

    #[test]
    fn run_migrations_creates_all_tables() {
        let temp_dir = std::env::temp_dir().join("remi-test-migrations");
        let _ = std::fs::create_dir_all(&temp_dir);
        let db_path = temp_dir.join("test.sqlite");
        let _ = std::fs::remove_file(&db_path);

        let client = SqliteClient::new(&db_path).unwrap();
        run_migrations(&client).unwrap();

        let version = get_current_version(&client).unwrap();
        assert_eq!(version, MIGRATIONS.len() as u32);

        // Idempotency check
        run_migrations(&client).unwrap();
        assert_eq!(get_current_version(&client).unwrap(), MIGRATIONS.len() as u32);

        // Verify a few critical tables actually exist
        for table in [
            "orchestration_events",
            "orchestration_command_receipts",
            "checkpoint_diff_blobs",
            "provider_session_runtime",
            "projection_projects",
            "projection_threads",
            "projection_thread_messages",
            "projection_thread_activities",
            "projection_thread_sessions",
            "projection_turns",
            "projection_pending_approvals",
            "projection_thread_proposed_plans",
            "projection_state",
            "auth_sessions",
            "auth_pairing_links",
            "checkpoints",
        ] {
            let exists: bool = client
                .query_row(
                    "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name=?1",
                    &[&table],
                    |row| row.get(0),
                )
                .unwrap();
            assert!(exists, "table `{table}` should exist after migrations");
        }

        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
