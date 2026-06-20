//! 线程会话投影仓库
//!
//! 本模块实现了线程会话（Thread Session）的持久化存储。
//! 线程会话跟踪 AI 助手与 LLM 提供商之间的实时连接状态，
//! 包括会话的运行状态、提供商信息以及当前活跃的对话轮次。
//!
//! # 核心功能
//!
//! - `upsert`: 插入或更新线程会话
//! - `get_by_thread_id`: 根据线程 ID 查询会话
//! - `delete_by_thread_id`: 根据线程 ID 删除会话
//!
//! # 会话状态说明
//!
//! - `Idle`: 会话空闲，未与 LLM 提供商建立连接
//! - `Active`: 会话活跃，正在与 LLM 提供商通信
//! - `Error`: 会话出错，可能需要重连或人工干预

use async_trait::async_trait;
use remi_core::models::{ThreadId, TurnId};
use serde::{Deserialize, Serialize};

use crate::error::PersistenceResult;
use crate::sqlite_client::SqliteClient;

/// 线程会话状态
///
/// 表示线程与 LLM 提供商之间的连接状态。
///
/// # 变体说明
///
/// - `Idle`: 会话空闲，未与 LLM 提供商建立连接
/// - `Active`: 会话活跃，正在与 LLM 提供商通信
/// - `Error`: 会话出错，可能需要重连或人工干预
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SessionStatus {
    /// 会话空闲，未与 LLM 提供商建立连接
    Idle,
    /// 会话活跃，正在与 LLM 提供商通信
    Active,
    /// 会话出错，可能需要重连或人工干预
    Error,
}

/// 线程会话
///
/// 跟踪线程与 LLM 提供商之间的实时连接状态。
/// 包含提供商信息、会话标识以及当前活跃的对话轮次。
///
/// # 字段说明
///
/// - `thread_id`: 所属线程 ID（同时也是主键）
/// - `status`: 会话当前状态（Idle/Active/Error）
/// - `provider_name`: LLM 提供商名称（如 "openai"、"anthropic"）
/// - `provider_session_id`: 提供商侧的会话 ID
/// - `provider_thread_id`: 提供商侧的线程 ID
/// - `runtime_mode`: 运行时模式（如 "full-access"、"sandbox"）
/// - `active_turn_id`: 当前活跃的对话轮次 ID（可选）
/// - `last_error`: 最近一次错误信息（可选，仅在 Error 状态时有值）
/// - `updated_at`: 会话最后更新时间
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThreadSession {
    /// 所属线程 ID（同时也是主键）
    pub thread_id: ThreadId,
    /// 会话当前状态（Idle/Active/Error）
    pub status: SessionStatus,
    /// LLM 提供商名称（如 "openai"、"anthropic"）
    pub provider_name: Option<String>,
    /// 提供商侧的会话 ID
    pub provider_session_id: Option<String>,
    /// 提供商侧的线程 ID
    pub provider_thread_id: Option<String>,
    /// 运行时模式（如 "full-access"、"sandbox"）
    pub runtime_mode: String,
    /// 当前活跃的对话轮次 ID（可选）
    pub active_turn_id: Option<TurnId>,
    /// 最近一次错误信息（可选，仅在 Error 状态时有值）
    pub last_error: Option<String>,
    /// 会话最后更新时间
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

/// 线程会话仓库 trait
///
/// 定义了线程会话存储的核心接口，所有线程会话仓库实现都必须实现此 trait。
/// 使用 `async_trait` 支持异步操作，并通过 `Send + Sync` 约束保证线程安全。
///
/// # 主要功能
///
/// - `upsert`: 插入或更新线程会话
/// - `get_by_thread_id`: 根据线程 ID 查询会话
/// - `delete_by_thread_id`: 根据线程 ID 删除会话
#[async_trait]
pub trait ThreadSessionRepository: Send + Sync {
    /// 插入或更新线程会话
    ///
    /// 将线程会话持久化到数据库。如果会话已存在（基于 `thread_id`），则更新；否则插入新记录。
    /// 使用 `INSERT OR REPLACE` 语义实现 upsert 操作。
    ///
    /// # 参数
    ///
    /// * `session` - 要保存的线程会话引用
    ///
    /// # 返回值
    ///
    /// 成功时返回 `Ok(())`，失败时返回 `PersistenceError`
    fn upsert(&self, session: &ThreadSession) -> PersistenceResult<()>;

    /// 根据线程 ID 查询会话
    ///
    /// 根据线程 ID 从存储中查询线程会话记录。
    /// 每个线程最多只有一个活跃会话。
    ///
    /// # 参数
    ///
    /// * `thread_id` - 线程的唯一标识符
    ///
    /// # 返回值
    ///
    /// 成功时返回 `Option<ThreadSession>`，如果不存在则返回 `None`
    fn get_by_thread_id(&self, thread_id: ThreadId) -> PersistenceResult<Option<ThreadSession>>;

    /// 根据线程 ID 删除会话
    ///
    /// 从存储中删除指定线程的会话记录。通常在线程会话结束时调用。
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

/// SQLite 线程会话仓库实现
///
/// 基于 SQLite 数据库的线程会话仓库实现，提供线程会话的持久化和查询功能。
/// 内部使用 `SqliteClient` 进行数据库操作。
pub struct SqliteThreadSessionRepository {
    /// SQLite 数据库客户端
    client: SqliteClient,
}

impl SqliteThreadSessionRepository {
    /// 创建新的 SQLite 线程会话仓库实例
    ///
    /// # 参数
    ///
    /// * `client` - 已初始化的 SQLite 客户端实例
    ///
    /// # 返回值
    ///
    /// 返回新创建的 `SqliteThreadSessionRepository` 实例
    pub fn new(client: SqliteClient) -> Self {
        Self { client }
    }
}

impl ThreadSessionRepository for SqliteThreadSessionRepository {
    /// 插入或更新线程会话到数据库
    ///
    /// 实现步骤：
    /// 1. 将枚举类型（SessionStatus）转换为数据库存储的字符串
    /// 2. 将 UUID 和时间戳字段转换为字符串格式
    /// 3. 处理可选字段（provider_name、provider_session_id 等）
    /// 4. 执行 INSERT OR REPLACE 语句
    fn upsert(&self, session: &ThreadSession) -> PersistenceResult<()> {
        let status_str = match session.status {
            SessionStatus::Idle => "idle",
            SessionStatus::Active => "active",
            SessionStatus::Error => "error",
        };

        self.client.execute(
            "INSERT OR REPLACE INTO projection_thread_sessions
             (thread_id, status, provider_name, provider_session_id, provider_thread_id,
              runtime_mode, active_turn_id, last_error, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            &[
                &session.thread_id.to_string(),
                &status_str,
                &session.provider_name,
                &session.provider_session_id,
                &session.provider_thread_id,
                &session.runtime_mode,
                &session.active_turn_id.as_ref().map(|id| id.to_string()),
                &session.last_error,
                &session.updated_at.to_rfc3339(),
            ],
        )?;
        Ok(())
    }

    /// 根据线程 ID 查询会话
    ///
    /// 实现步骤：
    /// 1. 执行 SELECT 查询
    /// 2. 将数据库行映射为元组
    /// 3. 解析 UUID、时间戳字段和枚举类型
    /// 4. 构造 ThreadSession 对象
    fn get_by_thread_id(&self, thread_id: ThreadId) -> PersistenceResult<Option<ThreadSession>> {
        let rows = self.client.query_map(
            "SELECT thread_id, status, provider_name, provider_session_id, provider_thread_id,
                    runtime_mode, active_turn_id, last_error, updated_at
             FROM projection_thread_sessions WHERE thread_id = ?1",
            &[&thread_id.to_string()],
            |row| {
                let thread_id_str: String = row.get(0)?;
                let status_str: String = row.get(1)?;
                let provider_name: Option<String> = row.get(2)?;
                let provider_session_id: Option<String> = row.get(3)?;
                let provider_thread_id: Option<String> = row.get(4)?;
                let runtime_mode: String = row.get(5)?;
                let active_turn_id_str: Option<String> = row.get(6)?;
                let last_error: Option<String> = row.get(7)?;
                let updated_at_str: String = row.get(8)?;

                Ok((thread_id_str, status_str, provider_name, provider_session_id, provider_thread_id,
                    runtime_mode, active_turn_id_str, last_error, updated_at_str))
            },
        )?;

        if rows.is_empty() {
            return Ok(None);
        }

        let (thread_id_str, status_str, provider_name, provider_session_id, provider_thread_id,
             runtime_mode, active_turn_id_str, last_error, updated_at_str) = rows.into_iter().next().unwrap();

        let thread_id = thread_id_str.parse::<uuid::Uuid>().map_err(|e| crate::error::PersistenceError::DatabaseError(e.to_string()))?;
        let status = match status_str.as_str() {
            "idle" => SessionStatus::Idle,
            "active" => SessionStatus::Active,
            "error" => SessionStatus::Error,
            _ => return Err(crate::error::PersistenceError::DatabaseError(format!("Invalid status: {}", status_str))),
        };
        let active_turn_id = active_turn_id_str;
        let updated_at = updated_at_str.parse::<chrono::DateTime<chrono::Utc>>().map_err(|e: chrono::ParseError| crate::error::PersistenceError::DatabaseError(e.to_string()))?;

        Ok(Some(ThreadSession {
            thread_id,
            status,
            provider_name,
            provider_session_id,
            provider_thread_id,
            runtime_mode,
            active_turn_id,
            last_error,
            updated_at,
        }))
    }

    /// 根据线程 ID 删除会话
    ///
    /// 实现步骤：
    /// 1. 执行 DELETE 语句
    fn delete_by_thread_id(&self, thread_id: ThreadId) -> PersistenceResult<()> {
        self.client.execute(
            "DELETE FROM projection_thread_sessions WHERE thread_id = ?1",
            &[&thread_id.to_string()],
        )?;
        Ok(())
    }
}
