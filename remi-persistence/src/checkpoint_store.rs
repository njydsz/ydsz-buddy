//! Checkpoint 存储模块
//!
//! 本模块实现了基于 SQLite 的检查点存储系统，用于持久化检查点元数据。
//! 检查点存储是检查点系统的核心持久化组件，负责：
//! - 保存检查点记录（包括线程ID、轮次ID、Git引用等）
//! - 按ID查询检查点
//! - 按线程ID列出所有检查点
//! - 删除检查点记录

use async_trait::async_trait;
use remi_core::models::{Checkpoint, ThreadId};

use crate::error::PersistenceResult;
use crate::sqlite_client::SqliteClient;

/// Checkpoint 存储 trait
///
/// 定义了检查点存储的核心接口，所有检查点存储实现都必须实现此 trait。
/// 使用 `async_trait` 支持异步操作，并通过 `Send + Sync` 约束保证线程安全。
///
/// # 主要功能
///
/// - `save_checkpoint`: 保存检查点到存储
/// - `get_checkpoint`: 按ID查询检查点
/// - `list_checkpoints`: 按线程ID列出所有检查点
/// - `delete_checkpoint`: 删除检查点
#[async_trait]
pub trait CheckpointStore: Send + Sync {
    /// 保存检查点到存储
    ///
    /// 将检查点元数据持久化到数据库。
    ///
    /// # 参数
    ///
    /// * `checkpoint` - 要保存的检查点引用
    ///
    /// # 返回值
    ///
    /// 成功时返回 `Ok(())`，失败时返回 `PersistenceError`
    fn save_checkpoint(&self, checkpoint: &Checkpoint) -> PersistenceResult<()>;

    /// 按ID查询检查点
    ///
    /// 根据检查点ID从存储中查询检查点记录。
    ///
    /// # 参数
    ///
    /// * `checkpoint_id` - 检查点的唯一标识符
    ///
    /// # 返回值
    ///
    /// 成功时返回 `Option<Checkpoint>`，如果不存在则返回 `None`
    fn get_checkpoint(&self, checkpoint_id: &str) -> PersistenceResult<Option<Checkpoint>>;

    /// 按线程ID列出所有检查点
    ///
    /// 查询指定线程的所有检查点，按创建时间升序排列。
    ///
    /// # 参数
    ///
    /// * `thread_id` - 线程的唯一标识符
    ///
    /// # 返回值
    ///
    /// 成功时返回检查点列表 `Vec<Checkpoint>`
    fn list_checkpoints(&self, thread_id: ThreadId) -> PersistenceResult<Vec<Checkpoint>>;

    /// 删除检查点
    ///
    /// 从存储中删除指定的检查点记录。
    ///
    /// # 参数
    ///
    /// * `checkpoint_id` - 要删除的检查点的唯一标识符
    ///
    /// # 返回值
    ///
    /// 成功时返回 `Ok(())`，失败时返回 `PersistenceError`
    fn delete_checkpoint(&self, checkpoint_id: &str) -> PersistenceResult<()>;
}

/// SQLite Checkpoint 存储实现
///
/// 基于 SQLite 数据库的检查点存储实现，提供检查点的持久化和查询功能。
/// 内部使用 `SqliteClient` 进行数据库操作。
pub struct SqliteCheckpointStore {
    /// SQLite 数据库客户端
    client: SqliteClient,
}

impl SqliteCheckpointStore {
    /// 创建新的 SQLite 检查点存储实例
    ///
    /// # 参数
    ///
    /// * `client` - 已初始化的 SQLite 客户端实例
    ///
    /// # 返回值
    ///
    /// 返回新创建的 `SqliteCheckpointStore` 实例
    pub fn new(client: SqliteClient) -> Self {
        Self { client }
    }
}

impl CheckpointStore for SqliteCheckpointStore {
    /// 保存检查点到数据库
    ///
    /// 实现步骤：
    /// 1. 将时间戳转换为 RFC3339 格式
    /// 2. 执行 INSERT OR REPLACE 语句
    fn save_checkpoint(&self, checkpoint: &Checkpoint) -> PersistenceResult<()> {
        self.client.execute(
            "INSERT OR REPLACE INTO checkpoints 
             (id, thread_id, turn_id, git_ref, description, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            &[
                &checkpoint.id,
                &checkpoint.thread_id.to_string(),
                &checkpoint.turn_id,
                &checkpoint.git_ref,
                &checkpoint.description,
                &checkpoint.created_at.to_rfc3339(),
            ],
        )?;

        Ok(())
    }

    /// 从数据库查询检查点
    ///
    /// 实现步骤：
    /// 1. 执行 SELECT 查询
    /// 2. 将数据库行映射为 Checkpoint 对象
    /// 3. 解析时间戳字符串为 DateTime 对象
    fn get_checkpoint(&self, checkpoint_id: &str) -> PersistenceResult<Option<Checkpoint>> {
        let rows = self.client.query_map(
            "SELECT id, thread_id, turn_id, git_ref, description, created_at
             FROM checkpoints WHERE id = ?1",
            &[&checkpoint_id],
            |row| {
                let id: String = row.get(0)?;
                let thread_id_str: String = row.get(1)?;
                let turn_id: String = row.get(2)?;
                let git_ref: String = row.get(3)?;
                let description: String = row.get(4)?;
                let created_at_str: String = row.get(5)?;

                Ok((id, thread_id_str, turn_id, git_ref, description, created_at_str))
            },
        )?;

        if rows.is_empty() {
            return Ok(None);
        }

        let (id, thread_id_str, turn_id, git_ref, description, created_at_str) = &rows[0];

        let checkpoint = Checkpoint {
            id: id.clone(),
            thread_id: thread_id_str.parse().map_err(|e| {
                crate::error::PersistenceError::SerializationError(format!(
                    "ThreadId 解析错误: {}",
                    e
                ))
            })?,
            turn_id: turn_id.clone(),
            git_ref: git_ref.clone(),
            description: description.clone(),
            created_at: created_at_str.parse().map_err(|e| {
                crate::error::PersistenceError::SerializationError(format!(
                    "日期解析错误: {}",
                    e
                ))
            })?,
        };

        Ok(Some(checkpoint))
    }

    /// 按线程ID列出所有检查点
    ///
    /// 实现步骤：
    /// 1. 执行 SELECT 查询，过滤条件为 thread_id
    /// 2. 按创建时间升序排列
    /// 3. 将每行数据映射为 Checkpoint 对象
    fn list_checkpoints(&self, thread_id: ThreadId) -> PersistenceResult<Vec<Checkpoint>> {
        let rows = self.client.query_map(
            "SELECT id, thread_id, turn_id, git_ref, description, created_at
             FROM checkpoints WHERE thread_id = ?1
             ORDER BY created_at ASC",
            &[&thread_id.to_string()],
            |row| {
                let id: String = row.get(0)?;
                let thread_id_str: String = row.get(1)?;
                let turn_id: String = row.get(2)?;
                let git_ref: String = row.get(3)?;
                let description: String = row.get(4)?;
                let created_at_str: String = row.get(5)?;

                Ok(Checkpoint {
                    id,
                    thread_id: thread_id_str.parse().map_err(|_| {
                        rusqlite::Error::InvalidColumnIndex(0)
                    })?,
                    turn_id,
                    git_ref,
                    description,
                    created_at: created_at_str.parse().map_err(|_| {
                        rusqlite::Error::InvalidColumnIndex(0)
                    })?,
                })
            },
        )?;

        Ok(rows)
    }

    /// 删除检查点
    ///
    /// 实现步骤：
    /// 1. 执行 DELETE 语句
    fn delete_checkpoint(&self, checkpoint_id: &str) -> PersistenceResult<()> {
        self.client.execute(
            "DELETE FROM checkpoints WHERE id = ?1",
            &[&checkpoint_id],
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::migrations::run_migrations;
    use chrono::Utc;
    use remi_core::models::ThreadId;

    #[test]
    fn test_checkpoint_store() {
        let temp_dir = std::env::temp_dir().join("remi-test-checkpoint-store");
        let db_path = temp_dir.join("test.sqlite");
        
        let client = SqliteClient::new(&db_path).unwrap();
        run_migrations(&client).unwrap();
        
        let store = SqliteCheckpointStore::new(client);

        let thread_id = ThreadId::new_v4();

        // 创建测试检查点
        let checkpoint = Checkpoint {
            id: Uuid::new_v4().to_string(),
            thread_id,
            turn_id: "turn-1".to_string(),
            git_ref: "abc123".to_string(),
            description: "Test checkpoint".to_string(),
            created_at: Utc::now(),
        };

        // 保存检查点
        store.save_checkpoint(&checkpoint).unwrap();

        // 查询检查点
        let retrieved = store.get_checkpoint(&checkpoint.id).unwrap();
        assert!(retrieved.is_some());
        let retrieved = retrieved.unwrap();
        assert_eq!(retrieved.id, checkpoint.id);
        assert_eq!(retrieved.thread_id, checkpoint.thread_id);
        assert_eq!(retrieved.git_ref, checkpoint.git_ref);

        // 列出检查点
        let checkpoints = store.list_checkpoints(thread_id).unwrap();
        assert_eq!(checkpoints.len(), 1);
        assert_eq!(checkpoints[0].id, checkpoint.id);

        // 删除检查点
        store.delete_checkpoint(&checkpoint.id).unwrap();

        // 验证已删除
        let retrieved = store.get_checkpoint(&checkpoint.id).unwrap();
        assert!(retrieved.is_none());

        // 清理
        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
