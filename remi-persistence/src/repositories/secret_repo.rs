//! 密钥存储仓库。

use async_trait::async_trait;
use chrono::Utc;
use remi_core::{Error, Result};
use sqlx::SqlitePool;
use uuid::Uuid;

/// 密钥存储 trait。
#[async_trait]
pub trait SecretStoreTrait: Send + Sync {
    /// 存储加密的密钥。
    async fn store(&self, key: &str, encrypted_value: &[u8], nonce: &[u8], expires_at: Option<&str>) -> Result<()>;

    /// 检索加密的密钥。
    async fn get(&self, key: &str) -> Result<Option<(Vec<u8>, Vec<u8>)>>;

    /// 删除密钥。
    async fn delete(&self, key: &str) -> Result<()>;

    /// 列出所有密钥键。
    async fn list_keys(&self) -> Result<Vec<String>>;
}

/// 密钥存储仓库实现。
#[derive(Clone)]
pub struct SecretStore {
    pool: SqlitePool,
}

impl SecretStore {
    /// 创建新密钥存储。
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl SecretStoreTrait for SecretStore {
    async fn store(&self, key: &str, encrypted_value: &[u8], nonce: &[u8], expires_at: Option<&str>) -> Result<()> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();

        sqlx::query(
            "INSERT OR REPLACE INTO secrets (id, key, encrypted_value, nonce, created_at, updated_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&id)
        .bind(key)
        .bind(encrypted_value)
        .bind(nonce)
        .bind(&now)
        .bind(&now)
        .bind(expires_at)
        .execute(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        Ok(())
    }

    async fn get(&self, key: &str) -> Result<Option<(Vec<u8>, Vec<u8>)>> {
        let row: Option<(Vec<u8>, Vec<u8>)> = sqlx::query_as(
            "SELECT encrypted_value, nonce FROM secrets WHERE key = ? AND (expires_at IS NULL OR expires_at > ?)",
        )
        .bind(key)
        .bind(Utc::now().to_rfc3339())
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        Ok(row)
    }

    async fn delete(&self, key: &str) -> Result<()> {
        sqlx::query("DELETE FROM secrets WHERE key = ?")
            .bind(key)
            .execute(&self.pool)
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

        Ok(())
    }

    async fn list_keys(&self) -> Result<Vec<String>> {
        let rows: Vec<(String,)> = sqlx::query_as(
            "SELECT key FROM secrets WHERE expires_at IS NULL OR expires_at > ? ORDER BY key",
        )
        .bind(Utc::now().to_rfc3339())
        .fetch_all(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        Ok(rows.into_iter().map(|(key,)| key).collect())
    }
}
