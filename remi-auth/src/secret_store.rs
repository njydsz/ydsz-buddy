//! 密钥存储模块，用于安全地管理凭证。

use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Key, Nonce,
};
use chrono::{DateTime, Utc};
use remi_core::{Error, Result};
use sqlx::SqlitePool;
use uuid::Uuid;

/// 用于管理加密凭证的密钥存储。
pub struct SecretStore {
    pool: SqlitePool,
    encryption_key: Key<Aes256Gcm>,
}

/// 已存储密钥的元数据。
#[derive(Debug, Clone)]
pub struct SecretMetadata {
    pub id: String,
    pub key: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub expires_at: Option<DateTime<Utc>>,
}

impl SecretStore {
    /// 创建新的密钥存储实例。
    pub fn new(pool: SqlitePool, encryption_key: [u8; 32]) -> Self {
        let key = Key::<Aes256Gcm>::from_slice(&encryption_key);
        Self {
            pool,
            encryption_key: *key,
        }
    }

    /// 存储密钥。
    pub async fn set(&self, key: &str, value: &str, expires_at: Option<DateTime<Utc>>) -> Result<()> {
        let cipher = Aes256Gcm::new(&self.encryption_key);
        
        // 生成随机 nonce
        let mut nonce_bytes = [0u8; 12];
        use aes_gcm::aead::rand_core::RngCore;
        OsRng.fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);

        // 加密值
        let ciphertext = cipher
            .encrypt(nonce, value.as_bytes())
            .map_err(|e| Error::Internal(format!("加密失败: {}", e)))?;

        let id = Uuid::new_v4().to_string();
        let now = Utc::now();

        sqlx::query(
            r#"
            INSERT INTO secrets (id, key, encrypted_value, nonce, created_at, updated_at, expires_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET
                encrypted_value = excluded.encrypted_value,
                nonce = excluded.nonce,
                updated_at = excluded.updated_at,
                expires_at = excluded.expires_at
            "#,
        )
        .bind(&id)
        .bind(key)
        .bind(&ciphertext)
        .bind(&nonce_bytes[..])
        .bind(now.to_rfc3339())
        .bind(now.to_rfc3339())
        .bind(expires_at.map(|t| t.to_rfc3339()))
        .execute(&self.pool)
        .await
        .map_err(|e| Error::Database(format!("存储密钥失败: {}", e)))?;

        Ok(())
    }

    /// 检索密钥。
    pub async fn get(&self, key: &str) -> Result<Option<String>> {
        #[allow(clippy::type_complexity)]
        let row: Option<(String, Vec<u8>, Vec<u8>, Option<String>)> = sqlx::query_as(
            "SELECT key, encrypted_value, nonce, expires_at FROM secrets WHERE key = ?",
        )
        .bind(key)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| Error::Database(format!("检索密钥失败: {}", e)))?;

        let (key, ciphertext, nonce_bytes, expires_at) = match row {
            Some(r) => r,
            None => return Ok(None),
        };

        // 检查是否过期
        if let Some(exp_str) = expires_at {
            if let Ok(exp_time) = DateTime::parse_from_rfc3339(&exp_str) {
                if Utc::now() > exp_time.with_timezone(&Utc) {
                    // 密钥已过期，删除它
                    self.delete(&key).await?;
                    return Ok(None);
                }
            }
        }

        // 解密值
        let cipher = Aes256Gcm::new(&self.encryption_key);
        let nonce = Nonce::from_slice(&nonce_bytes);
        
        let plaintext = cipher
            .decrypt(nonce, ciphertext.as_ref())
            .map_err(|e| Error::Internal(format!("解密失败: {}", e)))?;

        let value = String::from_utf8(plaintext)
            .map_err(|e| Error::Internal(format!("密钥中包含无效的UTF-8: {}", e)))?;

        Ok(Some(value))
    }

    /// 删除密钥。
    pub async fn delete(&self, key: &str) -> Result<()> {
        sqlx::query("DELETE FROM secrets WHERE key = ?")
            .bind(key)
            .execute(&self.pool)
            .await
            .map_err(|e| Error::Database(format!("删除密钥失败: {}", e)))?;

        Ok(())
    }

    /// 列出所有密钥的元数据。
    pub async fn list(&self) -> Result<Vec<SecretMetadata>> {
        let rows: Vec<(String, String, String, String, Option<String>)> = sqlx::query_as(
            "SELECT id, key, created_at, updated_at, expires_at FROM secrets ORDER BY key",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| Error::Database(format!("列出密钥失败: {}", e)))?;

        let mut secrets = Vec::new();
        for (id, key, created_at, updated_at, expires_at) in rows {
            let created = DateTime::parse_from_rfc3339(&created_at)
                .map_err(|e| Error::Internal(format!("时间戳格式无效: {}", e)))?
                .with_timezone(&Utc);
            let updated = DateTime::parse_from_rfc3339(&updated_at)
                .map_err(|e| Error::Internal(format!("时间戳格式无效: {}", e)))?
                .with_timezone(&Utc);
            let expires = expires_at
                .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
                .map(|dt| dt.with_timezone(&Utc));

            secrets.push(SecretMetadata {
                id,
                key,
                created_at: created,
                updated_at: updated,
                expires_at: expires,
            });
        }

        Ok(secrets)
    }

    /// 清理过期的密钥。
    pub async fn cleanup_expired(&self) -> Result<usize> {
        let now = Utc::now().to_rfc3339();
        let result = sqlx::query("DELETE FROM secrets WHERE expires_at IS NOT NULL AND expires_at < ?")
            .bind(&now)
            .execute(&self.pool)
            .await
            .map_err(|e| Error::Database(format!("清理过期密钥失败: {}", e)))?;

        Ok(result.rows_affected() as usize)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use remi_persistence::Database;
    use remi_core::ServerConfig;

    #[tokio::test]
    async fn test_secret_store() {
        let temp_dir = std::env::temp_dir().join(format!("remi-auth-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&temp_dir).expect("创建临时目录失败");
        let mut config = ServerConfig::default();
        config.db_path = temp_dir.join("test.db");
        let db = Database::connect(&config).await.expect("数据库连接失败");
        db.run_migrations().await.expect("数据库迁移失败");

        let key = [0u8; 32];
        let store = SecretStore::new(db.pool().clone(), key);

        // 存储密钥
        store.set("test_key", "test_value", None).await.expect("存储失败");

        // 获取密钥
        let value = store.get("test_key").await.expect("获取失败").expect("密钥未找到");
        assert_eq!(value, "test_value");

        // 删除密钥
        store.delete("test_key").await.expect("删除失败");
        let value = store.get("test_key").await.expect("获取失败");
        assert!(value.is_none());
    }
}
