//! 数据库版本化迁移系统（P2-9）
//!
//! 参考 Octop infra/db/migrate.py 的设计：
//! - 幂等迁移（可重复执行）
//! - 版本号追踪
//! - 每次迁移包含 up（应用）和 down（回滚）SQL
//!
//! 使用方式：
//! ```ignore
//! let migrator = DbMigrator::new(&conn)?;
//! migrator.run_migrations()?;
//! ```

use anyhow::Result;
use rusqlite::Connection;
use rusqlite::OptionalExtension;
use std::collections::HashMap;

/// 单个数据库迁移
pub trait Migration: Send + Sync {
    /// 迁移版本号（递增唯一）
    fn version(&self) -> u32;
    /// 迁移描述
    fn description(&self) -> &str;
    /// 应用迁移
    fn up(&self, conn: &Connection) -> Result<()>;
    /// 回滚迁移
    fn down(&self, conn: &Connection) -> Result<()>;
}

/// 简单的 SQL 迁移（最常见的迁移类型）
pub struct SqlMigration {
    version: u32,
    description: String,
    up_sql: String,
    down_sql: Option<String>,
}

impl SqlMigration {
    pub fn new(version: u32, description: impl Into<String>, up_sql: impl Into<String>) -> Self {
        Self { version, description: description.into(), up_sql: up_sql.into(), down_sql: None }
    }

    pub fn with_down(mut self, down_sql: impl Into<String>) -> Self {
        self.down_sql = Some(down_sql.into());
        self
    }
}

impl Migration for SqlMigration {
    fn version(&self) -> u32 { self.version }
    fn description(&self) -> &str { &self.description }
    fn up(&self, conn: &Connection) -> Result<()> {
        conn.execute_batch(&self.up_sql)?;
        Ok(())
    }
    fn down(&self, conn: &Connection) -> Result<()> {
        if let Some(sql) = &self.down_sql {
            conn.execute_batch(sql)?;
        }
        Ok(())
    }
}

/// 数据库迁移器
pub struct DbMigrator<'a> {
    conn: &'a Connection,
    migrations: Vec<Box<dyn Migration>>,
}

impl<'a> DbMigrator<'a> {
    pub fn new(conn: &'a Connection) -> Self {
        Self { conn, migrations: Vec::new() }
    }

    pub fn add_migration(mut self, migration: Box<dyn Migration>) -> Self {
        self.migrations.push(migration);
        self
    }

    /// 初始化迁移表并运行所有未应用的迁移
    pub fn run_migrations(&self) -> Result<Vec<MigrationRecord>> {
        self.init_migration_table()?;

        let applied = self.get_applied_versions()?;
        let mut executed = Vec::new();

        for migration in &self.migrations {
            if !applied.contains(&migration.version()) {
                log::info!("Applying migration v{}: {}", migration.version(), migration.description());
                migration.up(self.conn)?;
                self.record_migration(migration.version(), migration.description(), true)?;
                executed.push(MigrationRecord {
                    version: migration.version(),
                    description: migration.description().to_string(),
                    applied_at: chrono::Utc::now().to_rfc3339(),
                });
            }
        }

        Ok(executed)
    }

    /// 回滚到指定版本
    pub fn rollback_to(&self, target_version: u32) -> Result<Vec<MigrationRecord>> {
        let applied = self.get_applied_versions()?;
        let mut rolled_back = Vec::new();

        // 倒序回滚超过目标版本的迁移
        for version in applied.iter().rev() {
            if *version > target_version {
                if let Some(migration) = self.migrations.iter().find(|m| m.version() == *version) {
                    log::info!("Rolling back migration v{}: {}", migration.version(), migration.description());
                    migration.down(self.conn)?;
                    self.remove_migration_record(*version)?;
                    rolled_back.push(MigrationRecord {
                        version: migration.version(),
                        description: migration.description().to_string(),
                        applied_at: chrono::Utc::now().to_rfc3339(),
                    });
                }
            }
        }

        Ok(rolled_back)
    }

    /// 获取当前版本号
    pub fn current_version(&self) -> Result<u32> {
        let version: Option<u32> = self.conn.query_row(
            "SELECT MAX(version) FROM _schema_version",
            [],
            |row| row.get::<_, Option<u64>>(0),
        ).optional()?.flatten().map(|v| v as u32);
        Ok(version.unwrap_or(0))
    }

    /// 获取所有已应用的迁移
    pub fn get_applied_versions(&self) -> Result<Vec<u32>> {
        let mut stmt = self.conn.prepare(
            "SELECT version FROM _schema_version WHERE success = 1 ORDER BY version ASC"
        )?;
        let versions: Result<Vec<u32>, _> = stmt.query_map([], |row| {
            Ok(row.get::<_, i64>(0)? as u32)
        })?.collect();
        Ok(versions?)
    }

    fn init_migration_table(&self) -> Result<()> {
        self.conn.execute_batch(r#"
            CREATE TABLE IF NOT EXISTS _schema_version (
                version         INTEGER PRIMARY KEY,
                description     TEXT NOT NULL,
                applied_at      TEXT NOT NULL,
                success         INTEGER NOT NULL DEFAULT 1
            );
        "#)?;
        Ok(())
    }

    fn record_migration(&self, version: u32, description: &str, success: bool) -> Result<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO _schema_version (version, description, applied_at, success)
             VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![
                version as i64,
                description,
                chrono::Utc::now().to_rfc3339(),
                if success { 1 } else { 0 },
            ],
        )?;
        Ok(())
    }

    fn remove_migration_record(&self, version: u32) -> Result<()> {
        self.conn.execute(
            "DELETE FROM _schema_version WHERE version = ?1",
            rusqlite::params![version as i64],
        )?;
        Ok(())
    }
}

/// 迁移记录
#[derive(Debug, Clone)]
pub struct MigrationRecord {
    pub version: u32,
    pub description: String,
    pub applied_at: String,
}

// ──────────── 内置迁移注册表（集中管理各模块的迁移）────────────

/// 注册全局数据库迁移
///
/// 各模块在此集中注册自己的迁移，Tauri 启动时统一执行。
pub fn register_all_migrations() -> Vec<Box<dyn Migration>> {
    let migrations: Vec<Box<dyn Migration>> = vec![
        // Auth 模块迁移
        Box::new(SqlMigration::new(1, "Create users table", r#"
            CREATE TABLE IF NOT EXISTS users (
                id              TEXT PRIMARY KEY,
                username        TEXT NOT NULL UNIQUE,
                password_hash   TEXT,
                salt            TEXT,
                role            TEXT NOT NULL DEFAULT 'viewer',
                auth_type       TEXT NOT NULL DEFAULT 'local',
                sso_provider    TEXT,
                sso_subject     TEXT,
                created_at_ms   INTEGER NOT NULL,
                last_login_ms   INTEGER,
                token_quota     INTEGER NOT NULL DEFAULT 0,
                token_used      INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_users_sso ON users(sso_provider, sso_subject);
        "#)),
        // Usage 模块迁移
        Box::new(SqlMigration::new(2, "Create usage_log table", r#"
            CREATE TABLE IF NOT EXISTS usage_log (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                ts_ms           INTEGER NOT NULL,
                user_id         TEXT,
                agent_id        TEXT,
                thread_id       TEXT,
                model           TEXT NOT NULL DEFAULT 'unknown',
                provider        TEXT,
                input_tokens    INTEGER NOT NULL DEFAULT 0,
                output_tokens   INTEGER NOT NULL DEFAULT 0,
                cached_tokens   INTEGER NOT NULL DEFAULT 0,
                cost_milli_usd  INTEGER NOT NULL DEFAULT 0,
                source          TEXT NOT NULL DEFAULT 'ui'
            );
            CREATE INDEX IF NOT EXISTS idx_usage_ts ON usage_log(ts_ms);
            CREATE INDEX IF NOT EXISTS idx_usage_user ON usage_log(user_id);
        "#)),
        // Thread user_id 迁移（P0-3 用户隔离）
        Box::new(SqlMigration::new(3, "Add user_id to threads table", r#"
            ALTER TABLE threads ADD COLUMN user_id TEXT;
            CREATE INDEX IF NOT EXISTS idx_threads_user ON threads(user_id);
        "#)
        .with_down(r#"
            -- SQLite 不支持 DROP COLUMN（3.35.0+ 支持但有约束）
        "#)),
        // Auth sessions 迁移
        Box::new(SqlMigration::new(4, "Create sessions and oidc_states tables", r#"
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash      TEXT PRIMARY KEY,
                user_id         TEXT NOT NULL,
                username        TEXT NOT NULL,
                created_at_ms   INTEGER NOT NULL,
                expires_at_ms   INTEGER NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
            CREATE TABLE IF NOT EXISTS oidc_states (
                state           TEXT PRIMARY KEY,
                provider        TEXT NOT NULL,
                code_verifier   TEXT,
                created_at_ms   INTEGER NOT NULL,
                expires_at_ms   INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS login_attempts (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                username        TEXT NOT NULL,
                client_ip       TEXT NOT NULL DEFAULT '',
                attempt_at_ms   INTEGER NOT NULL,
                success         INTEGER NOT NULL DEFAULT 0
            );
        "#)),
    ];

    migrations
}
