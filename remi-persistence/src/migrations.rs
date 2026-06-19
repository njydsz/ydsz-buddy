//! 数据库迁移管理

use crate::error::{PersistenceError, PersistenceResult};
use crate::sqlite_client::SqliteClient;

/// 迁移定义
pub struct Migration {
    pub version: u32,
    pub name: &'static str,
    pub sql: &'static str,
}

/// 所有迁移
pub const MIGRATIONS: &[Migration] = &[
    Migration {
        version: 1,
        name: "001_initial_schema",
        sql: r#"
            CREATE TABLE IF NOT EXISTS orchestration_events (
                sequence INTEGER PRIMARY KEY AUTOINCREMENT,
                event_id TEXT NOT NULL UNIQUE,
                event_type TEXT NOT NULL,
                aggregate_kind TEXT NOT NULL,
                aggregate_id TEXT NOT NULL,
                payload TEXT NOT NULL,
                occurred_at TEXT NOT NULL,
                command_id TEXT,
                metadata TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_events_aggregate ON orchestration_events(aggregate_kind, aggregate_id);
            CREATE INDEX IF NOT EXISTS idx_events_occurred_at ON orchestration_events(occurred_at);
        "#,
    },
    Migration {
        version: 2,
        name: "002_projection_projects",
        sql: r#"
            CREATE TABLE IF NOT EXISTS projection_projects (
                id TEXT PRIMARY KEY,
                kind TEXT NOT NULL,
                title TEXT NOT NULL,
                workspace_root TEXT NOT NULL,
                default_model_selection TEXT,
                scripts TEXT NOT NULL DEFAULT '[]',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                deleted_at TEXT
            );
        "#,
    },
    Migration {
        version: 3,
        name: "003_projection_threads",
        sql: r#"
            CREATE TABLE IF NOT EXISTS projection_threads (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                title TEXT NOT NULL,
                model_selection TEXT NOT NULL,
                runtime_mode TEXT NOT NULL,
                interaction_mode TEXT NOT NULL,
                env_mode TEXT NOT NULL,
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
                handoff TEXT,
                FOREIGN KEY (project_id) REFERENCES projection_projects(id)
            );

            CREATE INDEX IF NOT EXISTS idx_threads_project_id ON projection_threads(project_id);
        "#,
    },
    Migration {
        version: 4,
        name: "004_projection_state",
        sql: r#"
            CREATE TABLE IF NOT EXISTS projection_state (
                projector_name TEXT PRIMARY KEY,
                last_applied_sequence INTEGER NOT NULL DEFAULT 0
            );
        "#,
    },
    Migration {
        version: 5,
        name: "005_auth_sessions",
        sql: r#"
            CREATE TABLE IF NOT EXISTS auth_sessions (
                session_id TEXT PRIMARY KEY,
                role TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS auth_pairing_links (
                id TEXT PRIMARY KEY,
                credential_hash TEXT NOT NULL,
                created_at TEXT NOT NULL,
                revoked_at TEXT
            );
        "#,
    },
];

/// 运行所有未应用的迁移
pub fn run_migrations(client: &SqliteClient) -> PersistenceResult<()> {
    // 创建迁移跟踪表
    client.execute_batch(
        "CREATE TABLE IF NOT EXISTS _migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        )",
    )?;

    for migration in MIGRATIONS {
        // 检查是否已应用
        let applied: bool = client.query_row(
            "SELECT COUNT(*) > 0 FROM _migrations WHERE version = ?1",
            &[&migration.version],
            |row| row.get(0),
        )?;

        if !applied {
            tracing::info!(version = migration.version, name = migration.name, "应用迁移");
            
            client.execute_batch(migration.sql).map_err(|e| {
                PersistenceError::MigrationError(format!(
                    "迁移 {} ({}) 失败: {}",
                    migration.version, migration.name, e
                ))
            })?;

            client.execute(
                "INSERT INTO _migrations (version, name) VALUES (?1, ?2)",
                &[&migration.version, &migration.name],
            )?;
        }
    }

    Ok(())
}

/// 获取当前迁移版本
pub fn get_current_version(client: &SqliteClient) -> PersistenceResult<u32> {
    let version: Option<u32> = client.query_row(
        "SELECT MAX(version) FROM _migrations",
        &[],
        |row| row.get(0),
    ).ok();

    Ok(version.unwrap_or(0))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_run_migrations() {
        let temp_dir = std::env::temp_dir().join("remi-test-migrations");
        let db_path = temp_dir.join("test.sqlite");
        
        let client = SqliteClient::new(&db_path).unwrap();
        let result = run_migrations(&client);
        assert!(result.is_ok());

        // 验证迁移版本
        let version = get_current_version(&client).unwrap();
        assert_eq!(version, 5);

        // 再次运行应该成功（幂等）
        let result = run_migrations(&client);
        assert!(result.is_ok());

        // 清理
        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
