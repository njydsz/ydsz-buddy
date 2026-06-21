//! 线程活动投影仓库
//!
//! 本模块实现了线程活动（Thread Activity）的持久化存储。
//! 线程活动记录了 AI 助手在对话过程中执行的各类操作和事件，
//! 例如文件读取、命令执行、代码生成等，用于向用户展示 AI 的行为轨迹。
//!
//! # 核心功能
//!
//! - `upsert`: 插入或更新线程活动
//! - `list_by_thread_id`: 按线程 ID 列出所有活动（按序列号和时间倒序排列）
//! - `delete_by_thread_id`: 按线程 ID 删除所有活动
//!
//! # 排序说明
//!
//! 活动列表的排序优先级为：
//! 1. 有序列号的活动排在无序列号的活动之前
//! 2. 序列号大的排在前面（降序）
//! 3. 时间戳新的排在前面（降序）
//! 4. activity_id 大的排在前面（降序，作为最终稳定排序依据）

use async_trait::async_trait;
use remi_core::models::{ThreadId, TurnId};
use serde::{Deserialize, Serialize};

use crate::error::PersistenceResult;
use crate::sqlite_client::SqliteClient;

/// 线程活动
///
/// 记录 AI 助手在对话过程中执行的操作或发生的事件。
/// 每个活动包含类型、摘要、详细负载等信息，用于向用户展示 AI 的行为轨迹。
///
/// # 字段说明
///
/// - `activity_id`: 活动唯一标识符
/// - `thread_id`: 所属线程 ID
/// - `turn_id`: 关联的对话轮次 ID（可选）
/// - `tone`: 活动语气/风格（如 'positive'、'negative'、'neutral'）
/// - `kind`: 活动类型（如 'file-read'、'command-exec'、'code-gen'）
/// - `summary`: 活动摘要，用于在 UI 中快速展示
/// - `payload_json`: 活动详细负载（JSON 格式），包含类型特定的详细信息
/// - `sequence`: 活动序列号（可选），用于排序和定位
/// - `created_at`: 活动创建时间
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThreadActivity {
    /// 活动唯一标识符
    pub activity_id: String,
    /// 所属线程 ID
    pub thread_id: ThreadId,
    /// 关联的对话轮次 ID（可选）
    pub turn_id: Option<TurnId>,
    /// 活动语气/风格（如 'positive'、'negative'、'neutral'）
    pub tone: String,
    /// 活动类型（如 'file-read'、'command-exec'、'code-gen'）
    pub kind: String,
    /// 活动摘要，用于在 UI 中快速展示
    pub summary: String,
    /// 活动详细负载（JSON 格式），包含类型特定的详细信息
    pub payload_json: String,
    /// 活动序列号（可选），用于排序和定位
    pub sequence: Option<i64>,
    /// 活动创建时间
    pub created_at: chrono::DateTime<chrono::Utc>,
}

/// 线程活动仓库 trait
///
/// 定义了线程活动存储的核心接口，所有线程活动仓库实现都必须实现此 trait。
/// 使用 `async_trait` 支持异步操作，并通过 `Send + Sync` 约束保证线程安全。
///
/// # 主要功能
///
/// - `upsert`: 插入或更新线程活动
/// - `list_by_thread_id`: 按线程 ID 列出所有活动
/// - `delete_by_thread_id`: 按线程 ID 删除所有活动
#[async_trait]
pub trait ThreadActivityRepository: Send + Sync {
    /// 插入或更新线程活动
    ///
    /// 将线程活动持久化到数据库。如果活动已存在（基于 `activity_id`），则更新；否则插入新记录。
    /// 使用 `INSERT OR REPLACE` 语义实现 upsert 操作。
    ///
    /// # 参数
    ///
    /// * `activity` - 要保存的线程活动引用
    ///
    /// # 返回值
    ///
    /// 成功时返回 `Ok(())`，失败时返回 `PersistenceError`
    fn upsert(&self, activity: &ThreadActivity) -> PersistenceResult<()>;

    /// 按线程 ID 列出所有活动
    ///
    /// 查询指定线程的所有活动，按序列号和时间倒序排列。
    /// 排序优先级：有序列号 > 无序列号，序列号降序，时间降序，ID 降序。
    ///
    /// # 参数
    ///
    /// * `thread_id` - 线程的唯一标识符
    ///
    /// # 返回值
    ///
    /// 成功时返回活动列表 `Vec<ThreadActivity>`，如果没有活动则返回空列表
    fn list_by_thread_id(&self, thread_id: ThreadId) -> PersistenceResult<Vec<ThreadActivity>>;

    /// 按线程 ID 删除所有活动
    ///
    /// 删除指定线程下的所有活动记录。通常在线程被删除时调用。
    ///
    /// # 参数
    ///
    /// * `thread_id` - 线程的唯一标识符
    ///
    /// # 返回值
    ///
    /// 成功时返回 `Ok(())`，失败时返回 `PersistenceError`
    fn delete_by_thread_id(&self, thread_id: ThreadId) -> PersistenceResult<()>;
}

/// SQLite 线程活动仓库实现
///
/// 基于 SQLite 数据库的线程活动仓库实现，提供线程活动的持久化和查询功能。
/// 内部使用 `SqliteClient` 进行数据库操作。
pub struct SqliteThreadActivityRepository {
    /// SQLite 数据库客户端
    client: SqliteClient,
}

impl SqliteThreadActivityRepository {
    /// 创建新的 SQLite 线程活动仓库实例
    ///
    /// # 参数
    ///
    /// * `client` - 已初始化的 SQLite 客户端实例
    ///
    /// # 返回值
    ///
    /// 返回新创建的 `SqliteThreadActivityRepository` 实例
    pub fn new(client: SqliteClient) -> Self {
        Self { client }
    }
}

impl ThreadActivityRepository for SqliteThreadActivityRepository {
    /// 插入或更新线程活动到数据库
    ///
    /// 实现步骤：
    /// 1. 将 UUID 和时间戳字段转换为字符串格式
    /// 2. 处理可选字段（turn_id、sequence）
    /// 3. 执行 INSERT OR REPLACE 语句
    fn upsert(&self, activity: &ThreadActivity) -> PersistenceResult<()> {
        self.client.execute(
            "INSERT OR REPLACE INTO projection_thread_activities
             (activity_id, thread_id, turn_id, tone, kind, summary, payload_json, sequence, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            &[
                &activity.activity_id,
                &activity.thread_id.to_string(),
                &activity.turn_id.as_ref().map(|id| id.to_string()),
                &activity.tone,
                &activity.kind,
                &activity.summary,
                &activity.payload_json,
                &activity.sequence,
                &activity.created_at.to_rfc3339(),
            ],
        )?;
        Ok(())
    }

    /// 按线程 ID 列出所有活动
    ///
    /// 实现步骤：
    /// 1. 执行 SELECT 查询，使用复合排序规则（序列号优先，然后时间降序）
    /// 2. 将数据库行映射为元组
    /// 3. 解析 UUID 和时间戳字段
    /// 4. 构造 ThreadActivity 对象
    fn list_by_thread_id(&self, thread_id: ThreadId) -> PersistenceResult<Vec<ThreadActivity>> {
        let rows = self.client.query_map(
            "SELECT activity_id, thread_id, turn_id, tone, kind, summary, payload_json, sequence, created_at
             FROM projection_thread_activities
             WHERE thread_id = ?1
             ORDER BY
               CASE WHEN sequence IS NULL THEN 0 ELSE 1 END DESC,
               sequence DESC,
               created_at DESC,
               activity_id DESC",
            &[&thread_id.to_string()],
            |row| {
                let activity_id: String = row.get(0)?;
                let thread_id_str: String = row.get(1)?;
                let turn_id_str: Option<String> = row.get(2)?;
                let tone: String = row.get(3)?;
                let kind: String = row.get(4)?;
                let summary: String = row.get(5)?;
                let payload_json: String = row.get(6)?;
                let sequence: Option<i64> = row.get(7)?;
                let created_at_str: String = row.get(8)?;

                Ok((activity_id, thread_id_str, turn_id_str, tone, kind, summary, payload_json, sequence, created_at_str))
            },
        )?;

        rows.into_iter()
            .map(|(activity_id, thread_id_str, turn_id_str, tone, kind, summary, payload_json, sequence, created_at_str)| -> PersistenceResult<ThreadActivity> {
                let thread_id = thread_id_str.parse::<uuid::Uuid>().map_err(|e| crate::error::PersistenceError::DatabaseError(e.to_string()))?;
                let turn_id = turn_id_str;
                let created_at = created_at_str.parse::<chrono::DateTime<chrono::Utc>>().map_err(|e: chrono::ParseError| crate::error::PersistenceError::DatabaseError(e.to_string()))?;

                Ok(ThreadActivity {
                    activity_id,
                    thread_id,
                    turn_id,
                    tone,
                    kind,
                    summary,
                    payload_json,
                    sequence,
                    created_at,
                })
            })
            .collect()
    }

    /// 按线程 ID 删除所有活动
    ///
    /// 实现步骤：
    /// 1. 执行 DELETE 语句，删除指定线程下的所有活动
    fn delete_by_thread_id(&self, thread_id: ThreadId) -> PersistenceResult<()> {
        self.client.execute(
            "DELETE FROM projection_thread_activities WHERE thread_id = ?1",
            &[&thread_id.to_string()],
        )?;
        Ok(())
    }
}

