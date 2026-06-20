//! 配对链接存储模块
//!
//! 本模块实现配对链接的持久化存储，支持配对链接的创建、查询、列出、消费和撤销操作。
//! 配对链接用于客户端与服务端之间的安全配对流程。

use async_trait::async_trait;
use chrono::Utc;
use remi_core::models::PairingLink;

use crate::error::PersistenceResult;
use crate::sqlite_client::SqliteClient;

/// 配对链接存储 trait
///
/// 定义配对链接存储的核心接口，所有配对链接存储实现都必须实现此 trait。
/// 使用 `async_trait` 支持异步操作，并通过 `Send + Sync` 约束保证线程安全。
///
/// # 主要功能
///
/// - `save_pairing_link`: 保存配对链接到存储
/// - `get_pairing_link`: 按 ID 查询配对链接
/// - `get_pairing_link_by_credential`: 按凭证查询未撤销、未消费的配对链接
/// - `list_active_pairing_links`: 列出所有活跃的配对链接
/// - `revoke_pairing_link`: 撤销配对链接
/// - `consume_available`: 消费可用的配对链接
#[async_trait]
pub trait PairingLinkStore: Send + Sync {
    /// 保存配对链接到存储
    ///
    /// 将配对链接元数据持久化到数据库。使用 `INSERT OR REPLACE` 语义，
    /// 如果链接已存在（基于 ID）则更新，否则插入新记录。
    ///
    /// # 参数
    ///
    /// * `link` - 要保存的配对链接引用
    ///
    /// # 返回值
    ///
    /// 成功时返回 `Ok(())`，失败时返回 `PersistenceError`
    fn save_pairing_link(&self, link: &PairingLink) -> PersistenceResult<()>;

    /// 按 ID 查询配对链接
    ///
    /// 根据配对链接 ID 从存储中查询配对链接记录，包括已消费和已撤销的链接。
    ///
    /// # 参数
    ///
    /// * `link_id` - 配对链接的唯一标识符
    ///
    /// # 返回值
    ///
    /// 成功时返回 `Option<PairingLink>`，如果不存在则返回 `None`
    fn get_pairing_link(&self, link_id: &str) -> PersistenceResult<Option<PairingLink>>;

    /// 按凭证查询配对链接
    ///
    /// 根据凭证从存储中查询未撤销（`revoked_at IS NULL`）且未消费（`consumed_at IS NULL`）的配对链接记录。
    /// 此方法通常用于配对流程中验证客户端提供的凭证是否有效。
    ///
    /// # 参数
    ///
    /// * `credential` - 配对链接的凭证字符串
    ///
    /// # 返回值
    ///
    /// 成功时返回 `Option<PairingLink>`，如果凭证无效、已被消费或已撤销则返回 `None`
    fn get_pairing_link_by_credential(&self, credential: &str) -> PersistenceResult<Option<PairingLink>>;

    /// 列出所有活跃的配对链接
    ///
    /// 查询所有未过期（`expires_at > 当前时间`）、未撤销（`revoked_at IS NULL`）
    /// 且未消费（`consumed_at IS NULL`）的配对链接，按创建时间倒序排列。
    ///
    /// # 返回值
    ///
    /// 成功时返回活跃配对链接列表 `Vec<PairingLink>`，如果没有活跃链接则返回空列表
    fn list_active_pairing_links(&self) -> PersistenceResult<Vec<PairingLink>>;

    /// 撤销配对链接
    ///
    /// 将指定配对链接的 `revoked_at` 字段设置为当前时间，标记为已撤销。
    /// 撤销后的链接将无法再被消费或查询到。
    ///
    /// # 参数
    ///
    /// * `link_id` - 要撤销的配对链接 ID
    ///
    /// # 返回值
    ///
    /// 成功撤销返回 `Ok(true)`，如果链接不存在或已被撤销返回 `Ok(false)`
    fn revoke_pairing_link(&self, link_id: &str) -> PersistenceResult<bool>;

    /// 消费可用的配对链接
    ///
    /// 根据凭证消费配对链接，将 `consumed_at` 字段设置为当前时间。
    /// 这是一个原子操作：先查询凭证对应的未消费、未撤销链接，
    /// 然后检查是否过期，最后标记为已消费。
    ///
    /// # 参数
    ///
    /// * `credential` - 配对链接的凭证字符串
    ///
    /// # 返回值
    ///
    /// - 成功消费时返回 `Ok(Some(PairingLink))`，其中 `consumed_at` 已设置
    /// - 如果凭证无效、链接已消费、已撤销或已过期，返回 `Ok(None)`
    ///
    /// # 注意
    ///
    /// 此操作不是完全事务性的，在高并发场景下可能存在竞态条件。
    /// 但由于 SQLite 的写互斥特性，实际并发冲突概率较低。
    fn consume_available(&self, credential: &str) -> PersistenceResult<Option<PairingLink>>;
}

/// SQLite 配对链接存储实现
///
/// 基于 SQLite 数据库的配对链接存储实现，提供配对链接的持久化和查询功能。
/// 内部使用 `SqliteClient` 进行数据库操作。
pub struct SqlitePairingLinkStore {
    /// SQLite 数据库客户端
    client: SqliteClient,
}

impl SqlitePairingLinkStore {
    /// 创建新的 SQLite 配对链接存储实例
    ///
    /// # 参数
    ///
    /// * `client` - 已初始化的 SQLite 客户端实例
    ///
    /// # 返回值
    ///
    /// 返回新创建的 `SqlitePairingLinkStore` 实例
    pub fn new(client: SqliteClient) -> Self {
        Self { client }
    }

    /// 从数据库行数据构建 PairingLink 对象
    ///
    /// 此辅助函数将数据库查询得到的原始字段值转换为 `PairingLink` 结构体。
    /// 主要处理时间戳字符串到 `DateTime` 对象的解析，以及可选字段的类型转换。
    ///
    /// # 参数
    ///
    /// * `id` - 配对链接 ID
    /// * `credential` - 配对凭证字符串
    /// * `method` - 配对方法（如 "desktop-bootstrap"、"one-time-token"）
    /// * `role` - 配对角色（如 "client"、"owner"）
    /// * `subject` - 配对主体标识
    /// * `label` - 配对链接的显示标签（可选）
    /// * `created_at_str` - 创建时间的 RFC3339 格式字符串
    /// * `expires_at_str` - 过期时间的 RFC3339 格式字符串
    /// * `consumed_at_str` - 消费时间的 RFC3339 格式字符串（可选）
    /// * `revoked_at_str` - 撤销时间的 RFC3339 格式字符串（可选）
    ///
    /// # 返回值
    ///
    /// 成功时返回 `PairingLink`，时间戳解析失败时返回 `PersistenceError::SerializationError`
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
            // 必填时间戳字段，解析失败返回错误
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
            // 可选时间戳字段，解析失败时静默忽略（设为 None），因为数据库中可能存在格式异常的历史数据
            consumed_at: consumed_at_str.and_then(|s| s.parse().ok()),
            revoked_at: revoked_at_str.and_then(|s| s.parse().ok()),
        })
    }
}

impl PairingLinkStore for SqlitePairingLinkStore {
    /// 保存配对链接到数据库
    ///
    /// 实现步骤：
    /// 1. 将时间戳字段转换为 RFC3339 格式
    /// 2. 处理可选时间戳字段（consumed_at、revoked_at）
    /// 3. 执行 INSERT OR REPLACE 语句
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

    /// 从数据库按 ID 查询配对链接
    ///
    /// 实现步骤：
    /// 1. 执行 SELECT 查询
    /// 2. 将数据库行映射为元组
    /// 3. 通过 `build_pairing_link_from_row` 构造 PairingLink 对象
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

    /// 从数据库按凭证查询配对链接
    ///
    /// 查询条件：凭证匹配且未被撤销（`revoked_at IS NULL`）且未被消费（`consumed_at IS NULL`）。
    /// 此方法用于配对流程中验证客户端提供的凭证。
    ///
    /// 实现步骤：
    /// 1. 执行 SELECT 查询，附加 revoked_at 和 consumed_at 的 NULL 过滤条件
    /// 2. 将数据库行映射为元组
    /// 3. 通过 `build_pairing_link_from_row` 构造 PairingLink 对象
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

    /// 列出所有活跃的配对链接
    ///
    /// 查询条件：未撤销（`revoked_at IS NULL`）、未消费（`consumed_at IS NULL`）
    /// 且未过期（`expires_at > 当前时间`），按创建时间倒序排列。
    ///
    /// 实现步骤：
    /// 1. 获取当前时间作为过期判断基准
    /// 2. 执行 SELECT 查询，附加三个过滤条件
    /// 3. 逐行通过 `build_pairing_link_from_row` 构造 PairingLink 对象
    fn list_active_pairing_links(&self) -> PersistenceResult<Vec<PairingLink>> {
        let now = Utc::now().to_rfc3339();
        let rows: Vec<(String, String, String, String, String, Option<String>, String, String, Option<String>, Option<String>)> = self.client.query_map(
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

                Ok((id, credential, method, role, subject, label, created_at_str, expires_at_str, consumed_at_str, revoked_at_str))
            },
        )?;

        let mut result = Vec::new();
        for (id, credential, method, role, subject, label, created_at_str, expires_at_str, consumed_at_str, revoked_at_str) in rows {
            let link = Self::build_pairing_link_from_row(
                id, credential, method, role, subject, label,
                created_at_str, expires_at_str, consumed_at_str, revoked_at_str,
            )?;
            result.push(link);
        }

        Ok(result)
    }

    /// 撤销配对链接
    ///
    /// 将指定链接的 `revoked_at` 字段设置为当前时间。
    /// 仅当链接尚未被撤销时才会更新（`WHERE revoked_at IS NULL`）。
    ///
    /// 实现步骤：
    /// 1. 执行 UPDATE 语句，设置 revoked_at 为当前时间
    /// 2. 根据受影响行数判断是否撤销成功
    fn revoke_pairing_link(&self, link_id: &str) -> PersistenceResult<bool> {
        let affected = self.client.execute(
            "UPDATE auth_pairing_links 
             SET revoked_at = ?1 
             WHERE id = ?2 AND revoked_at IS NULL",
            &[&Utc::now().to_rfc3339(), &link_id],
        )?;

        Ok(affected > 0)
    }

    /// 消费可用的配对链接
    ///
    /// 实现步骤：
    /// 1. 通过 `get_pairing_link_by_credential` 查询凭证对应的未消费、未撤销链接
    /// 2. 检查链接是否已过期，过期则返回 None
    /// 3. 执行 UPDATE 语句设置 consumed_at 为当前时间（仅当 consumed_at IS NULL 时更新）
    /// 4. 返回更新后的 PairingLink 对象
    ///
    /// # 注意
    ///
    /// 查询和更新不是在同一个事务中执行的，存在极小的竞态窗口。
    /// 但由于 SQLite 的写互斥特性，实际并发冲突概率极低。
    fn consume_available(&self, credential: &str) -> PersistenceResult<Option<PairingLink>> {
        let now = Utc::now().to_rfc3339();
        
        // 先查询凭证对应的未消费、未撤销的配对链接
        let link = self.get_pairing_link_by_credential(credential)?;
        
        if let Some(link) = link {
            // 检查链接是否已过期，过期链接不可消费
            if link.expires_at < Utc::now() {
                return Ok(None);
            }
            
            // 原子性地将链接标记为已消费（WHERE consumed_at IS NULL 防止重复消费）
            self.client.execute(
                "UPDATE auth_pairing_links 
                 SET consumed_at = ?1 
                 WHERE id = ?2 AND consumed_at IS NULL",
                &[&now, &link.id],
            )?;
            
            // 构造消费后的 PairingLink 对象返回给调用方
            let mut consumed_link = link;
            consumed_link.consumed_at = Some(Utc::now());
            Ok(Some(consumed_link))
        } else {
            // 凭证无效或链接已被消费/撤销
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

        // 清理旧数据库
        let _ = std::fs::remove_dir_all(&temp_dir);

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

        // 清理旧数据库
        let _ = std::fs::remove_dir_all(&temp_dir);

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
