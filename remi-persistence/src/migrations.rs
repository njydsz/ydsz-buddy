//! 数据库迁移管理模块
//!
//! 本模块负责 SQLite 数据库的 Schema 管理和版本控制。
//! 迁移系统采用增量式更新策略，确保数据库结构随应用版本演进。
//!
//! # 核心功能
//!
//! - 定义数据库迁移脚本（包含建表、索引创建等 SQL 语句）
//! - 跟踪已应用的迁移版本，避免重复执行
//! - 提供幂等的迁移执行接口
//!
//! # 设计说明
//!
//! 迁移系统使用 `_migrations` 表记录已应用的迁移版本。
//! 每个迁移包含版本号、名称和 SQL 脚本，按版本号顺序执行。
//! 迁移执行是幂等的，多次调用 `run_migrations` 不会产生副作用。

use crate::error::{PersistenceError, PersistenceResult};
use crate::sqlite_client::SqliteClient;

/// 数据库迁移定义
///
/// 表示单个数据库迁移的元数据和 SQL 脚本。
/// 迁移按版本号（`version`）升序执行，每个版本号必须唯一。
///
/// # 字段说明
///
/// - `version`: 迁移版本号，用于排序和去重，必须是递增的正整数
/// - `name`: 迁移名称，用于日志记录和调试，通常采用 "序号_描述" 格式
/// - `sql`: 迁移执行的 SQL 脚本，支持多条语句（以分号分隔）
pub struct Migration {
    /// 迁移版本号，必须唯一且递增
    pub version: u32,
    /// 迁移名称，用于日志和调试
    pub name: &'static str,
    /// 迁移 SQL 脚本
    pub sql: &'static str,
}

/// 所有数据库迁移定义
///
/// 按版本号顺序排列的迁移列表，包含系统所需的所有数据库 Schema 变更。
/// 修改此列表时务必保持版本号递增，不要修改已发布迁移的 SQL 内容。
///
/// # 迁移列表
///
/// 1. `001_initial_schema`: 创建事件存储表（orchestration_events）
/// 2. `002_projection_projects`: 创建项目投影表
/// 3. `003_projection_threads`: 创建线程投影表
/// 4. `004_projection_state`: 创建投影器状态跟踪表
/// 5. `005_auth_sessions`: 创建认证会话和配对链接表
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

/// 运行所有未应用的数据库迁移
///
/// 执行所有尚未应用的迁移脚本，确保数据库 Schema 与当前代码版本一致。
/// 此函数是幂等的，多次调用不会产生副作用。
///
/// # 执行流程
///
/// 1. 创建迁移跟踪表 `_migrations`（如果不存在）
/// 2. 遍历 `MIGRATIONS` 列表中的每个迁移
/// 3. 检查迁移是否已应用（查询 `_migrations` 表）
/// 4. 如果未应用，执行迁移 SQL 并记录到 `_migrations` 表
///
/// # 参数
///
/// * `client` - SQLite 数据库客户端引用
///
/// # 返回值
///
/// 成功时返回 `Ok(())`，失败时返回 `PersistenceError`
///
/// # 错误
///
/// - 当迁移 SQL 执行失败时返回 `MigrationError`
/// - 当数据库操作失败时返回 `DatabaseError`
///
/// # 注意
///
/// 迁移执行是事务性的，单个迁移失败会导致整个迁移过程中断。
/// 已应用的迁移不会重复执行，即使迁移脚本被修改。
pub fn run_migrations(client: &SqliteClient) -> PersistenceResult<()> {
    // 创建迁移跟踪表，记录已应用的迁移版本
    client.execute_batch(
        "CREATE TABLE IF NOT EXISTS _migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        )",
    )?;

    for migration in MIGRATIONS {
        // 检查此迁移是否已经应用过
        let applied: bool = client.query_row(
            "SELECT COUNT(*) > 0 FROM _migrations WHERE version = ?1",
            &[&migration.version],
            |row| row.get(0),
        )?;

        if !applied {
            // 记录迁移开始日志
            tracing::info!(version = migration.version, name = migration.name, "应用迁移");
            
            // 执行迁移 SQL 脚本，失败时包装错误信息
            client.execute_batch(migration.sql).map_err(|e| {
                PersistenceError::MigrationError(format!(
                    "迁移 {} ({}) 失败: {}",
                    migration.version, migration.name, e
                ))
            })?;

            // 迁移成功后，记录到跟踪表
            client.execute(
                "INSERT INTO _migrations (version, name) VALUES (?1, ?2)",
                &[&migration.version, &migration.name],
            )?;
        }
    }

    Ok(())
}

/// 获取当前数据库的迁移版本
///
/// 查询已应用的最高迁移版本号。如果尚未执行任何迁移，返回 0。
///
/// # 参数
///
/// * `client` - SQLite 数据库客户端引用
///
/// # 返回值
///
/// 当前已应用的最高迁移版本号（`u32`）
///
/// # 示例
///
/// ```rust
/// let version = get_current_version(&client)?;
/// println!("当前数据库版本: {}", version);
/// ```
pub fn get_current_version(client: &SqliteClient) -> PersistenceResult<u32> {
    // 查询最大版本号，使用 MAX() 聚合函数
    // 如果表为空，MAX() 返回 NULL，通过 Option 处理转换为 0
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
