//! Remi Code 持久化层。
//!
//! 本 crate 通过 sqlx 使用 SQLite 处理所有数据库操作。

pub mod migrations;
pub mod repositories;

use remi_core::{Error, Result, ServerConfig};
use sqlx::sqlite::{SqlitePool, SqlitePoolOptions};
use tracing::info;

/// 数据库连接池。
#[derive(Debug, Clone)]
pub struct Database {
    pool: SqlitePool,
}

impl Database {
    /// 创建新的数据库连接。
    pub async fn connect(config: &ServerConfig) -> Result<Self> {
        let database_url = format!("sqlite://{}?mode=rwc", config.db_path.display());

        info!("Connecting to database at {}", config.db_path.display());

        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect(&database_url)
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

        // 设置 PRAGMA 参数
        sqlx::query("PRAGMA journal_mode = WAL;")
            .execute(&pool)
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

        sqlx::query("PRAGMA foreign_keys = ON;")
            .execute(&pool)
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

        info!("Database connected successfully");

        Ok(Self { pool })
    }

    /// 获取连接池的引用。
    pub fn pool(&self) -> &SqlitePool {
        &self.pool
    }

    /// 执行数据库迁移。
    pub async fn run_migrations(&self) -> Result<()> {
        migrations::run_migrations(&self.pool).await
    }

    /// 关闭数据库连接。
    pub async fn close(&self) {
        self.pool.close().await;
    }
}
