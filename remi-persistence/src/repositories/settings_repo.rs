//! 设置仓库。

use async_trait::async_trait;
use chrono::Utc;
use remi_core::{Error, Result};
use sqlx::SqlitePool;

/// 设置仓库 trait。
#[async_trait]
pub trait SettingsRepositoryTrait: Send + Sync {
    /// 获取设置值。
    async fn get(&self, key: &str) -> Result<Option<String>>;

    /// 设置值。
    async fn set(&self, key: &str, value: &str) -> Result<()>;

    /// 删除设置。
    async fn delete(&self, key: &str) -> Result<()>;

    /// 列出所有设置。
    async fn list(&self) -> Result<Vec<(String, String)>>;
}

/// 设置仓库实现。
#[derive(Clone)]
pub struct SettingsRepository {
    pool: SqlitePool,
}

impl SettingsRepository {
    /// 创建设置仓库。
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl SettingsRepositoryTrait for SettingsRepository {
    async fn get(&self, key: &str) -> Result<Option<String>> {
        let row: Option<(String,)> = sqlx::query_as(
            "SELECT value FROM settings WHERE key = ?",
        )
        .bind(key)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        Ok(row.map(|(value,)| value))
    }

    async fn set(&self, key: &str, value: &str) -> Result<()> {
        let now = Utc::now().to_rfc3339();

        sqlx::query(
            "INSERT OR REPLACE INTO settings (key, value, created_at, updated_at) VALUES (?, ?, ?, ?)",
        )
        .bind(key)
        .bind(value)
        .bind(&now)
        .bind(&now)
        .execute(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        Ok(())
    }

    async fn delete(&self, key: &str) -> Result<()> {
        sqlx::query("DELETE FROM settings WHERE key = ?")
            .bind(key)
            .execute(&self.pool)
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

        Ok(())
    }

    async fn list(&self) -> Result<Vec<(String, String)>> {
        let rows: Vec<(String, String)> = sqlx::query_as(
            "SELECT key, value FROM settings ORDER BY key",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        Ok(rows)
    }
}
