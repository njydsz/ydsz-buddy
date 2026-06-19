//! 应用配置的设置管理模块。

use chrono::{DateTime, Utc};
use remi_core::{Error, Result};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

/// 应用配置的设置管理器。
pub struct SettingsManager {
    pool: SqlitePool,
}

/// 设置的元数据。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Setting {
    pub key: String,
    pub value: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl SettingsManager {
    /// 创建设置管理器实例。
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    /// 获取指定键的设置值。
    pub async fn get(&self, key: &str) -> Result<Option<String>> {
        let row: Option<(String,)> = sqlx::query_as(
            "SELECT value FROM settings WHERE key = ?",
        )
        .bind(key)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| Error::Database(format!("获取设置失败: {}", e)))?;

        Ok(row.map(|(v,)| v))
    }

    /// 设置指定键的值。
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
        .map_err(|e| Error::Database(format!("设置值失败: {}", e)))?;

        Ok(())
    }

    /// 删除指定键的设置。
    pub async fn delete(&self, key: &str) -> Result<()> {
        sqlx::query("DELETE FROM settings WHERE key = ?")
            .bind(key)
            .execute(&self.pool)
            .await
            .map_err(|e| Error::Database(format!("删除设置失败: {}", e)))?;

        Ok(())
    }

    /// 列出所有设置。
    pub async fn list(&self) -> Result<Vec<Setting>> {
        let rows: Vec<(String, String, String, String)> = sqlx::query_as(
            "SELECT key, value, created_at, updated_at FROM settings ORDER BY key",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| Error::Database(format!("列出设置失败: {}", e)))?;

        let mut settings = Vec::new();
        for (key, value, created_at, updated_at) in rows {
            let created = DateTime::parse_from_rfc3339(&created_at)
                .map_err(|e| Error::Internal(format!("时间戳格式无效: {}", e)))?
                .with_timezone(&Utc);
            let updated = DateTime::parse_from_rfc3339(&updated_at)
                .map_err(|e| Error::Internal(format!("时间戳格式无效: {}", e)))?
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

    /// 以 JSON 格式获取设置值。
    pub async fn get_json<T: for<'de> Deserialize<'de>>(&self, key: &str) -> Result<Option<T>> {
        match self.get(key).await? {
            Some(value) => {
                let parsed = serde_json::from_str(&value)
                    .map_err(|e| Error::Internal(format!("解析JSON设置失败: {}", e)))?;
                Ok(Some(parsed))
            }
            None => Ok(None),
        }
    }

    /// 以 JSON 格式设置值。
    pub async fn set_json<T: Serialize>(&self, key: &str, value: &T) -> Result<()> {
        let json = serde_json::to_string(value)
            .map_err(|e| Error::Internal(format!("序列化设置失败: {}", e)))?;
        self.set(key, &json).await
    }

    /// 批量获取多个设置的值。
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
            .map_err(|e| Error::Database(format!("批量获取设置失败: {}", e)))?;

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
        let temp_dir = std::env::temp_dir().join(format!("remi-auth-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&temp_dir).expect("创建临时目录失败");
        let mut config = ServerConfig::default();
        config.db_path = temp_dir.join("test.db");
        let db = Database::connect(&config).await.expect("数据库连接失败");
        db.run_migrations().await.expect("数据库迁移失败");

        let manager = SettingsManager::new(db.pool().clone());

        // 设置值
        manager.set("test_key", "test_value").await.expect("设置失败");

        // 获取值
        let value = manager.get("test_key").await.expect("获取失败").expect("设置未找到");
        assert_eq!(value, "test_value");

        // 更新值
        manager.set("test_key", "updated_value").await.expect("更新失败");
        let value = manager.get("test_key").await.expect("获取失败").expect("设置未找到");
        assert_eq!(value, "updated_value");

        // 列出所有设置
        let settings = manager.list().await.expect("列出设置失败");
        assert!(!settings.is_empty());

        // 删除设置
        manager.delete("test_key").await.expect("删除失败");
        let value = manager.get("test_key").await.expect("获取失败");
        assert!(value.is_none());
    }

    #[tokio::test]
    async fn test_json_settings() {
        let temp_dir = std::env::temp_dir().join(format!("remi-auth-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&temp_dir).expect("创建临时目录失败");
        let mut config = ServerConfig::default();
        config.db_path = temp_dir.join("test.db");
        let db = Database::connect(&config).await.expect("数据库连接失败");
        db.run_migrations().await.expect("数据库迁移失败");

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

        // 设置JSON配置
        manager.set_json("test_config", &config).await.expect("设置JSON失败");

        // 获取JSON配置
        let retrieved: TestConfig = manager.get_json("test_config").await.expect("获取JSON失败").expect("设置未找到");
        assert_eq!(retrieved, config);
    }
}
