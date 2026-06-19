//! 配对链接存储模块
//!
//! 本模块实现配对链接的持久化存储，支持配对链接的创建、查询、列出和撤销操作。
//! 配对链接用于客户端与服务端之间的安全配对流程。

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use remi_core::models::PairingLink;
use uuid::Uuid;

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

    /// 按配对码查询配对链接
    ///
    /// 根据配对码从存储中查询未撤销的配对链接记录。
    fn get_pairing_link_by_code(&self, pairing_code: &str) -> PersistenceResult<Option<PairingLink>>;

    /// 列出所有配对链接
    ///
    /// 查询所有配对链接，包括已撤销和未撤销的链接。
    fn list_pairing_links(&self) -> PersistenceResult<Vec<PairingLink>>;

    /// 撤销配对链接
    ///
    /// 将指定配对链接标记为已撤销。
    fn revoke_pairing_link(&self, link_id: &str) -> PersistenceResult<bool>;

    /// 标记配对链接为已使用
    ///
    /// 将指定配对链接标记为已使用状态。
    fn mark_pairing_link_used(&self, link_id: &str) -> PersistenceResult<()>;
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
}

impl PairingLinkStore for SqlitePairingLinkStore {
    fn save_pairing_link(&self, link: &PairingLink) -> PersistenceResult<()> {
        self.client.execute(
            "INSERT OR REPLACE INTO auth_pairing_links 
             (id, pairing_code, role, created_at, expires_at, is_used, revoked_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            &[
                &link.id,
                &link.pairing_code,
                &link.role,
                &link.created_at.to_rfc3339(),
                &link.expires_at.to_rfc3339(),
                &link.is_used.to_string(),
                &link.revoked_at.map(|t| t.to_rfc3339()),
            ],
        )?;

        Ok(())
    }

    fn get_pairing_link(&self, link_id: &str) -> PersistenceResult<Option<PairingLink>> {
        let rows = self.client.query_map(
            "SELECT id, pairing_code, role, created_at, expires_at, is_used, revoked_at
             FROM auth_pairing_links WHERE id = ?1",
            &[&link_id],
            |row| {
                let id: String = row.get(0)?;
                let pairing_code: String = row.get(1)?;
                let role: String = row.get(2)?;
                let created_at_str: String = row.get(3)?;
                let expires_at_str: String = row.get(4)?;
                let is_used_str: String = row.get(5)?;
                let revoked_at_str: Option<String> = row.get(6)?;

                Ok((id, pairing_code, role, created_at_str, expires_at_str, is_used_str, revoked_at_str))
            },
        )?;

        if rows.is_empty() {
            return Ok(None);
        }

        let (id, pairing_code, role, created_at_str, expires_at_str, is_used_str, revoked_at_str) = &rows[0];

        let link = PairingLink {
            id: id.clone(),
            pairing_code: pairing_code.clone(),
            role: role.clone(),
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
            is_used: is_used_str == "true",
            revoked_at: revoked_at_str.as_ref().and_then(|s| s.parse().ok()),
        };

        Ok(Some(link))
    }

    fn get_pairing_link_by_code(&self, pairing_code: &str) -> PersistenceResult<Option<PairingLink>> {
        let rows = self.client.query_map(
            "SELECT id, pairing_code, role, created_at, expires_at, is_used, revoked_at
             FROM auth_pairing_links 
             WHERE pairing_code = ?1 AND revoked_at IS NULL AND is_used = 'false'",
            &[&pairing_code],
            |row| {
                let id: String = row.get(0)?;
                let pairing_code: String = row.get(1)?;
                let role: String = row.get(2)?;
                let created_at_str: String = row.get(3)?;
                let expires_at_str: String = row.get(4)?;
                let is_used_str: String = row.get(5)?;
                let revoked_at_str: Option<String> = row.get(6)?;

                Ok((id, pairing_code, role, created_at_str, expires_at_str, is_used_str, revoked_at_str))
            },
        )?;

        if rows.is_empty() {
            return Ok(None);
        }

        let (id, pairing_code, role, created_at_str, expires_at_str, is_used_str, revoked_at_str) = &rows[0];

        let link = PairingLink {
            id: id.clone(),
            pairing_code: pairing_code.clone(),
            role: role.clone(),
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
            is_used: is_used_str == "true",
            revoked_at: revoked_at_str.as_ref().and_then(|s| s.parse().ok()),
        };

        Ok(Some(link))
    }

    fn list_pairing_links(&self) -> PersistenceResult<Vec<PairingLink>> {
        let rows = self.client.query_map(
            "SELECT id, pairing_code, role, created_at, expires_at, is_used, revoked_at
             FROM auth_pairing_links 
             ORDER BY created_at DESC",
            &[],
            |row| {
                let id: String = row.get(0)?;
                let pairing_code: String = row.get(1)?;
                let role: String = row.get(2)?;
                let created_at_str: String = row.get(3)?;
                let expires_at_str: String = row.get(4)?;
                let is_used_str: String = row.get(5)?;
                let revoked_at_str: Option<String> = row.get(6)?;

                Ok(PairingLink {
                    id,
                    pairing_code,
                    role,
                    created_at: created_at_str.parse().map_err(|_| {
                        rusqlite::Error::InvalidColumnIndex(0)
                    })?,
                    expires_at: expires_at_str.parse().map_err(|_| {
                        rusqlite::Error::InvalidColumnIndex(0)
                    })?,
                    is_used: is_used_str == "true",
                    revoked_at: revoked_at_str.and_then(|s| s.parse().ok()),
                })
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

    fn mark_pairing_link_used(&self, link_id: &str) -> PersistenceResult<()> {
        self.client.execute(
            "UPDATE auth_pairing_links 
             SET is_used = 'true' 
             WHERE id = ?1",
            &[&link_id],
        )?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::migrations::run_migrations;
    use chrono::Duration;

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
            pairing_code: "abc12345".to_string(),
            role: "Client".to_string(),
            created_at: Utc::now(),
            expires_at: Utc::now() + Duration::minutes(10),
            is_used: false,
            revoked_at: None,
        };

        // 保存配对链接
        store.save_pairing_link(&link).unwrap();

        // 按 ID 查询
        let retrieved = store.get_pairing_link(&link.id).unwrap();
        assert!(retrieved.is_some());
        let retrieved = retrieved.unwrap();
        assert_eq!(retrieved.id, link.id);
        assert_eq!(retrieved.pairing_code, link.pairing_code);

        // 按配对码查询
        let retrieved_by_code = store.get_pairing_link_by_code("abc12345").unwrap();
        assert!(retrieved_by_code.is_some());

        // 列出所有配对链接
        let links = store.list_pairing_links().unwrap();
        assert_eq!(links.len(), 1);

        // 撤销配对链接
        let revoked = store.revoke_pairing_link(&link.id).unwrap();
        assert!(revoked);

        // 验证已撤销（按配对码查询应该找不到）
        let retrieved_after_revoke = store.get_pairing_link_by_code("abc12345").unwrap();
        assert!(retrieved_after_revoke.is_none());

        // 清理
        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
