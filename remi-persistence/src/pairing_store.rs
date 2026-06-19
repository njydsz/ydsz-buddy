//! 配对链接存储模块
//!
//! 本模块实现配对链接的持久化存储，支持配对链接的创建、查询、列出、消费和撤销操作。
//! 配对链接用于客户端与服务端之间的安全配对流程。

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use remi_core::models::PairingLink;

use crate::error::PersistenceResult;
use crate::sqlite_client::SqliteClient;

/// 配对链接存储 trait
///
/// 定义配对链接存储的核心接口，所有配对链接存储实现都必须实现此 trait。
#[async_trait]
pub trait PairingLinkStore: Send + Sync {
    /// 保存配对链接到存储
    ///
    /// 将配对链接元数据持久化到数据库。
    fn save_pairing_link(&self, link: &PairingLink) -> PersistenceResult<()>;

    /// 按 ID 查询配对链接
    ///
    /// 根据配对链接 ID 从存储中查询配对链接记录。
    fn get_pairing_link(&self, link_id: &str) -> PersistenceResult<Option<PairingLink>>;

    /// 按凭证查询配对链接
    ///
    /// 根据凭证从存储中查询未撤销、未消费的配对链接记录。
    fn get_pairing_link_by_credential(&self, credential: &str) -> PersistenceResult<Option<PairingLink>>;

    /// 列出所有活跃的配对链接
    ///
    /// 查询所有未过期且未撤销的配对链接。
    fn list_active_pairing_links(&self) -> PersistenceResult<Vec<PairingLink>>;

    /// 撤销配对链接
    ///
    /// 将指定配对链接标记为已撤销。
    fn revoke_pairing_link(&self, link_id: &str) -> PersistenceResult<bool>;

    /// 消费可用的配对链接
    ///
    /// 根据凭证消费配对链接，设置 consumed_at 时间戳。
    /// 这是一个原子操作，确保并发安全。
    /// 返回消费后的配对链接，如果凭证无效或已被消费则返回 None。
    fn consume_available(&self, credential: &str) -> PersistenceResult<Option<PairingLink>>;
}

/// SQLite 配对链接存储实现
///
/// 基于 SQLite 数据库的配对链接存储实现，提供配对链接的持久化和查询功能。
pub struct SqlitePairingLinkStore {
    client: SqliteClient,
}

impl SqlitePairingLinkStore {
    /// 创建新的 SQLite 配对链接存储实例
    pub fn new(client: SqliteClient) -> Self {
        Self { client }
    }

    /// 从数据库行构建 PairingLink
    fn build_pairing_link_from_row(
        id: String,
        credential: String,
        method: String,
        role: String,
        subject: String,
        label: Option<String>,
        created_at_str: String,
        expires_at_str: String,
        consumed_at_str: Option<String>,
        revoked_at_str: Option<String>,
    ) -> PersistenceResult<PairingLink> {
        Ok(PairingLink {
            id,
            credential,
            method,
            role,
            subject,
            label,
            created_at: created_at_str.parse().map_err(|e| {
                crate::error::PersistenceError::SerializationError(format!(
                    "日期解析错误: {}",
                    e
                ))
            })?,
            expires_at: expires_at_str.parse().map_err(|e| {
                crate::error::PersistenceError::SerializationError(format!(
                    "日期解析错误: {}",
                    e
                ))
            })?,
            consumed_at: consumed_at_str.and_then(|s| s.parse().ok()),
            revoked_at: revoked_at_str.and_then(|s| s.parse().ok()),
        })
    }
}

impl PairingLinkStore for SqlitePairingLinkStore {
    fn save_pairing_link(&self, link: &PairingLink) -> PersistenceResult<()> {
        self.client.execute(
            "INSERT OR REPLACE INTO auth_pairing_links 
             (id, credential, method, role, subject, label, created_at, expires_at, consumed_at, revoked_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            &[
                &link.id,
                &link.credential,
                &link.method,
                &link.role,
                &link.subject,
                &link.label,
                &link.created_at.to_rfc3339(),
                &link.expires_at.to_rfc3339(),
                &link.consumed_at.as_ref().map(|t| t.to_rfc3339()),
                &link.revoked_at.as_ref().map(|t| t.to_rfc3339()),
            ],
        )?;

        Ok(())
    }

    fn get_pairing_link(&self, link_id: &str) -> PersistenceResult<Option<PairingLink>> {
        let rows = self.client.query_map(
            "SELECT id, credential, method, role, subject, label, created_at, expires_at, consumed_at, revoked_at
             FROM auth_pairing_links WHERE id = ?1",
            &[&link_id],
            |row| {
                let id: String = row.get(0)?;
                let credential: String = row.get(1)?;
                let method: String = row.get(2)?;
                let role: String = row.get(3)?;
                let subject: String = row.get(4)?;
                let label: Option<String> = row.get(5)?;
                let created_at_str: String = row.get(6)?;
                let expires_at_str: String = row.get(7)?;
                let consumed_at_str: Option<String> = row.get(8)?;
                let revoked_at_str: Option<String> = row.get(9)?;

                Ok((id, credential, method, role, subject, label, created_at_str, expires_at_str, consumed_at_str, revoked_at_str))
            },
        )?;

        if rows.is_empty() {
            return Ok(None);
        }

        let (id, credential, method, role, subject, label, created_at_str, expires_at_str, consumed_at_str, revoked_at_str) = &rows[0];

        Self::build_pairing_link_from_row(
            id.clone(),
            credential.clone(),
            method.clone(),
            role.clone(),
            subject.clone(),
            label.clone(),
            created_at_str.clone(),
            expires_at_str.clone(),
            consumed_at_str.clone(),
            revoked_at_str.clone(),
        ).map(Some)
    }

    fn get_pairing_link_by_credential(&self, credential: &str) -> PersistenceResult<Option<PairingLink>> {
        let rows = self.client.query_map(
            "SELECT id, credential, method, role, subject, label, created_at, expires_at, consumed_at, revoked_at
             FROM auth_pairing_links 
             WHERE credential = ?1 AND revoked_at IS NULL AND consumed_at IS NULL",
            &[&credential],
            |row| {
                let id: String = row.get(0)?;
                let credential: String = row.get(1)?;
                let method: String = row.get(2)?;
                let role: String = row.get(3)?;
                let subject: String = row.get(4)?;
                let label: Option<String> = row.get(5)?;
                let created_at_str: String = row.get(6)?;
                let expires_at_str: String = row.get(7)?;
                let consumed_at_str: Option<String> = row.get(8)?;
                let revoked_at_str: Option<String> = row.get(9)?;

                Ok((id, credential, method, role, subject, label, created_at_str, expires_at_str, consumed_at_str, revoked_at_str))
            },
        )?;

        if rows.is_empty() {
            return Ok(None);
        }

        let (id, credential, method, role, subject, label, created_at_str, expires_at_str, consumed_at_str, revoked_at_str) = &rows[0];

        Self::build_pairing_link_from_row(
            id.clone(),
            credential.clone(),
            method.clone(),
            role.clone(),
            subject.clone(),
            label.clone(),
            created_at_str.clone(),
            expires_at_str.clone(),
            consumed_at_str.clone(),
            revoked_at_str.clone(),
        ).map(Some)
    }

    fn list_active_pairing_links(&self) -> PersistenceResult<Vec<PairingLink>> {
        let now = Utc::now().to_rfc3339();
        let rows = self.client.query_map(
            "SELECT id, credential, method, role, subject, label, created_at, expires_at, consumed_at, revoked_at
             FROM auth_pairing_links 
             WHERE revoked_at IS NULL AND consumed_at IS NULL AND expires_at > ?1
             ORDER BY created_at DESC",
            &[&now],
            |row| {
                let id: String = row.get(0)?;
                let credential: String = row.get(1)?;
                let method: String = row.get(2)?;
                let role: String = row.get(3)?;
                let subject: String = row.get(4)?;
                let label: Option<String> = row.get(5)?;
                let created_at_str: String = row.get(6)?;
                let expires_at_str: String = row.get(7)?;
                let consumed_at_str: Option<String> = row.get(8)?;
                let revoked_at_str: Option<String> = row.get(9)?;

                Self::build_pairing_link_from_row(
                    id, credential, method, role, subject, label,
                    created_at_str, expires_at_str, consumed_at_str, revoked_at_str,
                )
            },
        )?;

        Ok(rows)
    }

    fn revoke_pairing_link(&self, link_id: &str) -> PersistenceResult<bool> {
        let affected = self.client.execute(
            "UPDATE auth_pairing_links 
             SET revoked_at = ?1 
             WHERE id = ?2 AND revoked_at IS NULL",
            &[&Utc::now().to_rfc3339(), &link_id],
        )?;

        Ok(affected > 0)
    }

    fn consume_available(&self, credential: &str) -> PersistenceResult<Option<PairingLink>> {
        let now = Utc::now().to_rfc3339();
        
        // 先查询配对链接
        let link = self.get_pairing_link_by_credential(credential)?;
        
        if let Some(link) = link {
            // 检查是否已过期
            if link.expires_at < Utc::now() {
                return Ok(None);
            }
            
            // 设置 consumed_at
            self.client.execute(
                "UPDATE auth_pairing_links 
                 SET consumed_at = ?1 
                 WHERE id = ?2 AND consumed_at IS NULL",
                &[&now, &link.id],
            )?;
            
            // 返回更新后的配对链接
            let mut consumed_link = link;
            consumed_link.consumed_at = Some(Utc::now());
            Ok(Some(consumed_link))
        } else {
            Ok(None)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::migrations::run_migrations;
    use chrono::Duration;
    use uuid::Uuid;

    #[test]
    fn test_pairing_link_store() {
        let temp_dir = std::env::temp_dir().join("remi-test-pairing-store");
        let db_path = temp_dir.join("test.sqlite");
        
        let client = SqliteClient::new(&db_path).unwrap();
        run_migrations(&client).unwrap();
        
        let store = SqlitePairingLinkStore::new(client);

        // 创建测试配对链接
        let link = PairingLink {
            id: Uuid::new_v4().to_string(),
            credential: "ABC12345".to_string(),
            method: "desktop-bootstrap".to_string(),
            role: "client".to_string(),
            subject: "test-client".to_string(),
            label: Some("Test Link".to_string()),
            created_at: Utc::now(),
            expires_at: Utc::now() + Duration::minutes(10),
            consumed_at: None,
            revoked_at: None,
        };

        // 保存配对链接
        store.save_pairing_link(&link).unwrap();

        // 按 ID 查询
        let retrieved = store.get_pairing_link(&link.id).unwrap();
        assert!(retrieved.is_some());
        let retrieved = retrieved.unwrap();
        assert_eq!(retrieved.id, link.id);
        assert_eq!(retrieved.credential, link.credential);
        assert_eq!(retrieved.method, link.method);
        assert_eq!(retrieved.role, link.role);

        // 按凭证查询
        let retrieved_by_credential = store.get_pairing_link_by_credential("ABC12345").unwrap();
        assert!(retrieved_by_credential.is_some());

        // 列出活跃的配对链接
        let links = store.list_active_pairing_links().unwrap();
        assert_eq!(links.len(), 1);

        // 消费配对链接
        let consumed = store.consume_available("ABC12345").unwrap();
        assert!(consumed.is_some());
        let consumed = consumed.unwrap();
        assert!(consumed.consumed_at.is_some());

        // 验证已消费（按凭证查询应该找不到）
        let retrieved_after_consume = store.get_pairing_link_by_credential("ABC12345").unwrap();
        assert!(retrieved_after_consume.is_none());

        // 清理
        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_revoke_pairing_link() {
        let temp_dir = std::env::temp_dir().join("remi-test-pairing-revoke");
        let db_path = temp_dir.join("test.sqlite");
        
        let client = SqliteClient::new(&db_path).unwrap();
        run_migrations(&client).unwrap();
        
        let store = SqlitePairingLinkStore::new(client);

        let link = PairingLink {
            id: Uuid::new_v4().to_string(),
            credential: "REVOK123".to_string(),
            method: "one-time-token".to_string(),
            role: "owner".to_string(),
            subject: "test-owner".to_string(),
            label: None,
            created_at: Utc::now(),
            expires_at: Utc::now() + Duration::minutes(10),
            consumed_at: None,
            revoked_at: None,
        };

        store.save_pairing_link(&link).unwrap();

        // 撤销配对链接
        let revoked = store.revoke_pairing_link(&link.id).unwrap();
        assert!(revoked);

        // 验证已撤销（按凭证查询应该找不到）
        let retrieved_after_revoke = store.get_pairing_link_by_credential("REVOK123").unwrap();
        assert!(retrieved_after_revoke.is_none());

        // 列出活跃的配对链接应该为空
        let links = store.list_active_pairing_links().unwrap();
        assert_eq!(links.len(), 0);

        // 清理
        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
