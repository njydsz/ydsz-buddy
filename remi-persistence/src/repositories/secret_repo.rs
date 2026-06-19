//! Secret store repository.

use async_trait::async_trait;
use chrono::Utc;
use remi_core::{Error, Result};
use sqlx::SqlitePool;
use uuid::Uuid;

/// Secret store trait.
#[async_trait]
pub trait SecretStoreTrait: Send + Sync {
    /// Store an encrypted secret.
    async fn store(&self, key: &str, encrypted_value: &[u8], nonce: &[u8], expires_at: Option<&str>) -> Result<()>;

    /// Retrieve an encrypted secret.
    async fn get(&self, key: &str) -> Result<Option<(Vec<u8>, Vec<u8>)>>;

    /// Delete a secret.
    async fn delete(&self, key: &str) -> Result<()>;

    /// List all secret keys.
    async fn list_keys(&self) -> Result<Vec<String>>;
}

/// Secret store repository implementation.
#[derive(Clone)]
pub struct SecretStore {
    pool: SqlitePool,
}

impl SecretStore {
    /// Create a new secret store.
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
