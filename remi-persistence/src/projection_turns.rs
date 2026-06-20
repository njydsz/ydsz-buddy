//! 对话轮次投影仓库
//!
//! 本模块实现了对话轮次（Turn）的持久化存储。
//! 对话轮次是线程中一次完整的 AI 交互周期，从用户发送消息开始，
//! 到 AI 完成响应（或被中断）结束。每个轮次包含状态跟踪、
//! 检查点信息以及与提议计划的关联。
//!
//! # 核心功能
//!
//! - `upsert`: 插入或更新对话轮次
//! - `list_by_thread_id`: 按线程 ID 列出所有轮次
//! - `get_by_turn_id`: 根据线程 ID 和轮次 ID 查询特定轮次
//! - `delete_by_thread_id`: 按线程 ID 删除所有轮次
//!
//! # 轮次状态流转
//!
//! ```text
//! Pending → Running → Completed
//!                  ↘ Interrupted
//!                  ↘ Error
//! ```

use async_trait::async_trait;
use remi_core::models::{ThreadId, TurnId};
use serde::{Deserialize, Serialize};

use crate::error::PersistenceResult;
use crate::sqlite_client::SqliteClient;

/// 对话轮次状态
///
/// 表示对话轮次的当前处理状态。
///
/// # 变体说明
///
/// - `Pending`: 轮次已排队，等待开始处理
/// - `Running`: 轮次正在处理中，AI 正在生成响应
/// - `Interrupted`: 轮次被用户中断
/// - `Completed`: 轮次已完成，AI 已生成完整响应
/// - `Error`: 轮次处理出错
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TurnState {
    /// 轮次已排队，等待开始处理
    Pending,
    /// 轮次正在处理中，AI 正在生成响应
    Running,
    /// 轮次被用户中断
    Interrupted,
    /// 轮次已完成，AI 已生成完整响应
    Completed,
    /// 轮次处理出错
    Error,
}

/// 对话轮次
///
/// 表示线程中一次完整的 AI 交互周期。包含轮次的状态跟踪、
/// 时间信息以及检查点相关数据。
///
/// # 字段说明
///
/// - `thread_id`: 所属线程 ID
/// - `turn_id`: 轮次唯一标识符
/// - `pending_message_id`: 待处理的消息 ID（可选）
/// - `source_proposed_plan_thread_id`: 来源提议计划的线程 ID（可选）
/// - `source_proposed_plan_id`: 来源提议计划 ID（可选）
/// - `assistant_message_id`: AI 助手的消息 ID（可选）
/// - `state`: 轮次当前状态
/// - `requested_at`: 轮次请求时间
/// - `started_at`: 轮次开始处理时间（可选）
/// - `completed_at`: 轮次完成时间（可选）
/// - `checkpoint_turn_count`: 检查点对应的轮次计数（可选）
/// - `checkpoint_ref`: 检查点的 Git 引用（可选）
/// - `checkpoint_status`: 检查点状态（可选）
/// - `checkpoint_files_json`: 检查点涉及的文件列表（JSON 格式）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectionTurn {
    /// 所属线程 ID
    pub thread_id: ThreadId,
    /// 轮次唯一标识符
    pub turn_id: TurnId,
    /// 待处理的消息 ID（可选）
    pub pending_message_id: Option<String>,
    /// 来源提议计划的线程 ID（可选）
    pub source_proposed_plan_thread_id: Option<ThreadId>,
    /// 来源提议计划 ID（可选）
    pub source_proposed_plan_id: Option<String>,
    /// AI 助手的消息 ID（可选）
    pub assistant_message_id: Option<String>,
    /// 轮次当前状态
    pub state: TurnState,
    /// 轮次请求时间
    pub requested_at: chrono::DateTime<chrono::Utc>,
    /// 轮次开始处理时间（可选）
    pub started_at: Option<chrono::DateTime<chrono::Utc>>,
    /// 轮次完成时间（可选）
    pub completed_at: Option<chrono::DateTime<chrono::Utc>>,
    /// 检查点对应的轮次计数（可选）
    pub checkpoint_turn_count: Option<i64>,
    /// 检查点的 Git 引用（可选）
    pub checkpoint_ref: Option<String>,
    /// 检查点状态（可选）
    pub checkpoint_status: Option<String>,
    /// 检查点涉及的文件列表（JSON 格式）
    pub checkpoint_files_json: String,
}

/// 对话轮次仓库 trait
///
/// 定义了对话轮次存储的核心接口，所有对话轮次仓库实现都必须实现此 trait。
/// 使用 `async_trait` 支持异步操作，并通过 `Send + Sync` 约束保证线程安全。
///
/// # 主要功能
///
/// - `upsert`: 插入或更新对话轮次
/// - `list_by_thread_id`: 按线程 ID 列出所有轮次
/// - `get_by_turn_id`: 根据线程 ID 和轮次 ID 查询特定轮次
/// - `delete_by_thread_id`: 按线程 ID 删除所有轮次
#[async_trait]
pub trait ProjectionTurnRepository: Send + Sync {
    /// 插入或更新对话轮次
    ///
    /// 将对话轮次持久化到数据库。如果轮次已存在（基于 `thread_id` + `turn_id` 唯一约束），
    /// 则更新；否则插入新记录。使用 `INSERT OR REPLACE` 语义实现 upsert 操作。
    ///
    /// # 参数
    ///
    /// * `turn` - 要保存的对话轮次引用
    ///
    /// # 返回值
    ///
    /// 成功时返回 `Ok(())`，失败时返回 `PersistenceError`
    fn upsert(&self, turn: &ProjectionTurn) -> PersistenceResult<()>;

    /// 按线程 ID 列出所有轮次
    ///
    /// 查询指定线程的所有对话轮次，按请求时间升序排列。
    ///
    /// # 参数
    ///
    /// * `thread_id` - 线程的唯一标识符
    ///
    /// # 返回值
    ///
    /// 成功时返回轮次列表 `Vec<ProjectionTurn>`，如果没有轮次则返回空列表
    fn list_by_thread_id(&self, thread_id: ThreadId) -> PersistenceResult<Vec<ProjectionTurn>>;

    /// 根据线程 ID 和轮次 ID 查询特定轮次
    ///
    /// 使用 `thread_id` 和 `turn_id` 的组合唯一标识一个轮次。
    ///
    /// # 参数
    ///
    /// * `thread_id` - 线程的唯一标识符
    /// * `turn_id` - 轮次的唯一标识符
    ///
    /// # 返回值
    ///
    /// 成功时返回 `Option<ProjectionTurn>`，如果不存在则返回 `None`
    fn get_by_turn_id(&self, thread_id: ThreadId, turn_id: TurnId) -> PersistenceResult<Option<ProjectionTurn>>;

    /// 按线程 ID 删除所有轮次
    ///
    /// 删除指定线程下的所有对话轮次记录。通常在线程被删除时调用。
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

/// SQLite 对话轮次仓库实现
///
/// 基于 SQLite 数据库的对话轮次仓库实现，提供对话轮次的持久化和查询功能。
/// 内部使用 `SqliteClient` 进行数据库操作。
pub struct SqliteProjectionTurnRepository {
    /// SQLite 数据库客户端
    client: SqliteClient,
}

impl SqliteProjectionTurnRepository {
    /// 创建新的 SQLite 对话轮次仓库实例
    ///
    /// # 参数
    ///
    /// * `client` - 已初始化的 SQLite 客户端实例
    ///
    /// # 返回值
    ///
    /// 返回新创建的 `SqliteProjectionTurnRepository` 实例
    pub fn new(client: SqliteClient) -> Self {
        Self { client }
    }
}

impl ProjectionTurnRepository for SqliteProjectionTurnRepository {
    /// 插入或更新对话轮次到数据库
    ///
    /// 实现步骤：
    /// 1. 将枚举类型（TurnState）转换为数据库存储的字符串
    /// 2. 将 UUID 和时间戳字段转换为字符串格式
    /// 3. 处理可选字段（pending_message_id、source_proposed_plan 等）
    /// 4. 执行 INSERT OR REPLACE 语句
    fn upsert(&self, turn: &ProjectionTurn) -> PersistenceResult<()> {
        let state_str = match turn.state {
            TurnState::Pending => "pending",
            TurnState::Running => "running",
            TurnState::Interrupted => "interrupted",
            TurnState::Completed => "completed",
            TurnState::Error => "error",
        };

        self.client.execute(
            "INSERT OR REPLACE INTO projection_turns
             (thread_id, turn_id, pending_message_id, source_proposed_plan_thread_id,
              source_proposed_plan_id, assistant_message_id, state, requested_at,
              started_at, completed_at, checkpoint_turn_count, checkpoint_ref,
              checkpoint_status, checkpoint_files_json)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            &[
                &turn.thread_id.to_string(),
                &turn.turn_id.to_string(),
                &turn.pending_message_id,
                &turn.source_proposed_plan_thread_id.map(|id| id.to_string()),
                &turn.source_proposed_plan_id,
                &turn.assistant_message_id,
                &state_str,
                &turn.requested_at.to_rfc3339(),
                &turn.started_at.map(|d| d.to_rfc3339()),
                &turn.completed_at.map(|d| d.to_rfc3339()),
                &turn.checkpoint_turn_count,
                &turn.checkpoint_ref,
                &turn.checkpoint_status,
                &turn.checkpoint_files_json,
            ],
        )?;
        Ok(())
    }

    /// 按线程 ID 列出所有轮次
    ///
    /// 实现步骤：
    /// 1. 执行 SELECT 查询，按请求时间升序排列
    /// 2. 通过 `row_to_turn` 辅助函数将每行映射为 ProjectionTurn 对象
    fn list_by_thread_id(&self, thread_id: ThreadId) -> PersistenceResult<Vec<ProjectionTurn>> {
        let rows = self.client.query_map(
            "SELECT thread_id, turn_id, pending_message_id, source_proposed_plan_thread_id,
                    source_proposed_plan_id, assistant_message_id, state, requested_at,
                    started_at, completed_at, checkpoint_turn_count, checkpoint_ref,
                    checkpoint_status, checkpoint_files_json
             FROM projection_turns WHERE thread_id = ?1 ORDER BY requested_at",
            &[&thread_id.to_string()],
            row_to_turn,
        )?;

        Ok(rows)
    }

    /// 根据线程 ID 和轮次 ID 查询特定轮次
    ///
    /// 实现步骤：
    /// 1. 执行 SELECT 查询，使用 thread_id 和 turn_id 双条件过滤
    /// 2. 通过 `row_to_turn` 辅助函数将行映射为 ProjectionTurn 对象
    fn get_by_turn_id(&self, thread_id: ThreadId, turn_id: TurnId) -> PersistenceResult<Option<ProjectionTurn>> {
        let rows = self.client.query_map(
            "SELECT thread_id, turn_id, pending_message_id, source_proposed_plan_thread_id,
                    source_proposed_plan_id, assistant_message_id, state, requested_at,
                    started_at, completed_at, checkpoint_turn_count, checkpoint_ref,
                    checkpoint_status, checkpoint_files_json
             FROM projection_turns WHERE thread_id = ?1 AND turn_id = ?2",
            &[&thread_id.to_string(), &turn_id.to_string()],
            row_to_turn,
        )?;

        Ok(rows.into_iter().next())
    }

    /// 按线程 ID 删除所有轮次
    ///
    /// 实现步骤：
    /// 1. 执行 DELETE 语句，删除指定线程下的所有轮次
    fn delete_by_thread_id(&self, thread_id: ThreadId) -> PersistenceResult<()> {
        self.client.execute(
            "DELETE FROM projection_turns WHERE thread_id = ?1",
            &[&thread_id.to_string()],
        )?;
        Ok(())
    }
}

/// 将数据库行映射为 ProjectionTurn 对象
///
/// 此函数将数据库查询结果的 14 个字段逐一提取并转换为 `ProjectionTurn` 结构体。
/// 主要处理 UUID 解析、枚举类型转换和时间戳解析。
///
/// # 列顺序
///
/// 0. thread_id, 1. turn_id, 2. pending_message_id, 3. source_proposed_plan_thread_id,
/// 4. source_proposed_plan_id, 5. assistant_message_id, 6. state, 7. requested_at,
/// 8. started_at, 9. completed_at, 10. checkpoint_turn_count, 11. checkpoint_ref,
/// 12. checkpoint_status, 13. checkpoint_files_json
fn row_to_turn(row: &rusqlite::Row<'_>) -> rusqlite::Result<ProjectionTurn> {
    let thread_id_str: String = row.get(0)?;
    let turn_id_str: String = row.get(1)?;
    let pending_message_id: Option<String> = row.get(2)?;
    let source_plan_thread_id_str: Option<String> = row.get(3)?;
    let source_plan_id: Option<String> = row.get(4)?;
    let assistant_message_id: Option<String> = row.get(5)?;
    let state_str: String = row.get(6)?;
    let requested_at_str: String = row.get(7)?;
    let started_at_str: Option<String> = row.get(8)?;
    let completed_at_str: Option<String> = row.get(9)?;
    let checkpoint_turn_count: Option<i64> = row.get(10)?;
    let checkpoint_ref: Option<String> = row.get(11)?;
    let checkpoint_status: Option<String> = row.get(12)?;
    let checkpoint_files_json: String = row.get(13)?;

    let thread_id = thread_id_str.parse::<uuid::Uuid>().map_err(|e: uuid::Error| {
        rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(e))
    })?;
    let turn_id = turn_id_str;
    let source_proposed_plan_thread_id = source_plan_thread_id_str.map(|s| s.parse::<uuid::Uuid>()).transpose().map_err(|e: uuid::Error| {
        rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(e))
    })?;
    let source_proposed_plan_id = source_plan_id;

    let state = match state_str.as_str() {
        "pending" => TurnState::Pending,
        "running" => TurnState::Running,
        "interrupted" => TurnState::Interrupted,
        "completed" => TurnState::Completed,
        "error" => TurnState::Error,
        _ => return Err(rusqlite::Error::InvalidColumnIndex(6)),
    };

    let requested_at = requested_at_str.parse().map_err(|_| rusqlite::Error::InvalidColumnIndex(7))?;
    let started_at = started_at_str.map(|s| s.parse()).transpose().map_err(|_| rusqlite::Error::InvalidColumnIndex(8))?;
    let completed_at = completed_at_str.map(|s| s.parse()).transpose().map_err(|_| rusqlite::Error::InvalidColumnIndex(9))?;

    Ok(ProjectionTurn {
        thread_id,
        turn_id,
        pending_message_id,
        source_proposed_plan_thread_id,
        source_proposed_plan_id,
        assistant_message_id,
        state,
        requested_at,
        started_at,
        completed_at,
        checkpoint_turn_count,
        checkpoint_ref,
        checkpoint_status,
        checkpoint_files_json,
    })
}
