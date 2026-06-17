//! Settings management for application configuration.

use chrono::{DateTime, Utc};
use remi_core::{Error, Result};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

/// Settings manager for application configuration.
pub struct SettingsManager {
    pool: SqlitePool,
}

/// Setting metadata.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Setting {
    pub key: String,
    pub value: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl SettingsManager {
    /// Create a new settings manager.
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    /// Get a setting value.
    pub async fn get(&self, key: &str) -> Result<Option<String>> {
        let row: Option<(String,)> = sqlx::query_as(
            "SELECT value FROM settings WHERE key = ?",
        )
        .bind(key)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| Error::Database(format!("Failed to get setting: {}", e)))?;

        Ok(row.map(|(v,)| v))
    }

    /// Set a setting value.
    pub async fn set(&self, key: &str, value: &str) -> Result<()> {
        let now = Utc::now().to_rfc3339();

        sqlx::query(
            r#"
            INSERT INTO settings (key, value, created_at, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET
                value = excluded.value,
                updated_at = excluded.updated_at
            "#,
        )
        .bind(key)
        .bind(value)
        .bind(&now)
        .bind(&now)
        .execute(&self.pool)
        .await
        .map_err(|e| Error::Database(format!("Failed to set setting: {}", e)))?;

        Ok(())
    }

    /// Delete a setting.
    pub async fn delete(&self, key: &str) -> Result<()> {
        sqlx::query("DELETE FROM settings WHERE key = ?")
            .bind(key)
            .execute(&self.pool)
            .await
            .map_err(|e| Error::Database(format!("Failed to delete setting: {}", e)))?;

        Ok(())
    }

    /// List all settings.
    pub async fn list(&self) -> Result<Vec<Setting>> {
        let rows: Vec<(String, String, String, String)> = sqlx::query_as(
            "SELECT key, value, created_at, updated_at FROM settings ORDER BY key",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| Error::Database(format!("Failed to list settings: {}", e)))?;

        let mut settings = Vec::new();
        for (key, value, created_at, updated_at) in rows {
            let created = DateTime::parse_from_rfc3339(&created_at)
                .map_err(|e| Error::Internal(format!("Invalid timestamp: {}", e)))?
                .with_timezone(&Utc);
            let updated = DateTime::parse_from_rfc3339(&updated_at)
                .map_err(|e| Error::Internal(format!("Invalid timestamp: {}", e)))?
                .with_timezone(&Utc);

            settings.push(Setting {
                key,
                value,
                created_at: created,
                updated_at: updated,
            });
        }

        Ok(settings)
    }

    /// Get a setting as JSON.
    pub async fn get_json<T: for<'de> Deserialize<'de>>(&self, key: &str) -> Result<Option<T>> {
        match self.get(key).await? {
            Some(value) => {
                let parsed = serde_json::from_str(&value)
                    .map_err(|e| Error::Internal(format!("Failed to parse JSON setting: {}", e)))?;
                Ok(Some(parsed))
            }
            None => Ok(None),
        }
    }

    /// Set a setting as JSON.
    pub async fn set_json<T: Serialize>(&self, key: &str, value: &T) -> Result<()> {
        let json = serde_json::to_string(value)
            .map_err(|e| Error::Internal(format!("Failed to serialize setting: {}", e)))?;
        self.set(key, &json).await
    }

    /// Get multiple settings by keys.
    pub async fn get_many(&self, keys: &[&str]) -> Result<Vec<(String, String)>> {
        if keys.is_empty() {
            return Ok(Vec::new());
        }

        let placeholders: Vec<&str> = keys.iter().map(|_| "?").collect();
        let query = format!(
            "SELECT key, value FROM settings WHERE key IN ({})",
            placeholders.join(",")
        );

        let mut q = sqlx::query_as::<_, (String, String)>(&query);
        for key in keys {
            q = q.bind(key);
        }

        let rows = q
            .fetch_all(&self.pool)
            .await
            .map_err(|e| Error::Database(format!("Failed to get settings: {}", e)))?;

        Ok(rows)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use remi_core::ServerConfig;
    use remi_persistence::Database;

    #[tokio::test]
    async fn test_settings_manager() {
        let config = ServerConfig::default();
        let db = Database::connect(&config).await.expect("Failed to connect");
        db.run_migrations().await.expect("Failed to migrate");

        let manager = SettingsManager::new(db.pool().clone());

        // Set setting
        manager.set("test_key", "test_value").await.expect("Failed to set");

        // Get setting
        let value = manager.get("test_key").await.expect("Failed to get").expect("Setting not found");
        assert_eq!(value, "test_value");

        // Update setting
        manager.set("test_key", "updated_value").await.expect("Failed to update");
        let value = manager.get("test_key").await.expect("Failed to get").expect("Setting not found");
        assert_eq!(value, "updated_value");

        // List settings
        let settings = manager.list().await.expect("Failed to list");
        assert!(!settings.is_empty());

        // Delete setting
        manager.delete("test_key").await.expect("Failed to delete");
        let value = manager.get("test_key").await.expect("Failed to get");
        assert!(value.is_none());
    }

    #[tokio::test]
    async fn test_json_settings() {
        let config = ServerConfig::default();
        let db = Database::connect(&config).await.expect("Failed to connect");
        db.run_migrations().await.expect("Failed to migrate");

        let manager = SettingsManager::new(db.pool().clone());

        #[derive(Serialize, Deserialize, Debug, PartialEq)]
        struct TestConfig {
            enabled: bool,
            count: i32,
        }

        let config = TestConfig {
            enabled: true,
            count: 42,
        };

        // Set JSON setting
        manager.set_json("test_config", &config).await.expect("Failed to set JSON");

        // Get JSON setting
        let retrieved: TestConfig = manager.get_json("test_config").await.expect("Failed to get JSON").expect("Setting not found");
        assert_eq!(retrieved, config);
    }
}
