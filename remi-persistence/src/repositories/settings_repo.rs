//! Settings repository.

use async_trait::async_trait;
use chrono::Utc;
use remi_core::{Error, Result};
use sqlx::SqlitePool;

/// Settings repository trait.
#[async_trait]
pub trait SettingsRepositoryTrait: Send + Sync {
    /// Get a setting value.
    async fn get(&self, key: &str) -> Result<Option<String>>;

    /// Set a setting value.
    async fn set(&self, key: &str, value: &str) -> Result<()>;

    /// Delete a setting.
    async fn delete(&self, key: &str) -> Result<()>;

    /// List all settings.
    async fn list(&self) -> Result<Vec<(String, String)>>;
}

/// Settings repository Implementation.
#[derive(Clone)]
pub struct SettingsRepository {
    pool: SqlitePool,
}

impl SettingsRepository {
    /// Create a new settings repository.
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
