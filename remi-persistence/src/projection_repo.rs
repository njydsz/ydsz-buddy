//! 投影存储模块
//!
//! 本模块实现了基于 CQRS 模式的投影（Projection）存储系统。
//! 投影是事件溯源架构中的读模型，负责将领域事件转换为查询优化的数据结构。
//!
//! # 核心功能
//!
//! - 项目和线程的 CRUD 操作
//! - 投影器状态跟踪（记录已处理的事件序列号）
//! - 支持软删除（通过 `deleted_at` 字段标记）
//!
//! # 设计说明
//!
//! 投影仓库采用同步接口设计（非 async），因为 SQLite 操作通常是本地 I/O。
//! 使用 `INSERT OR REPLACE` 语义实现 upsert 操作，简化并发处理。

use async_trait::async_trait;
use remi_core::models::{Project, ProjectId, Sequence, Thread, ThreadId};

use crate::error::PersistenceResult;
use crate::sqlite_client::SqliteClient;

/// 投影仓库 trait
///
/// 定义了投影存储的核心接口，所有投影仓库实现都必须实现此 trait。
/// 提供项目和线程的增删改查操作，以及投影器状态管理。
///
/// # 主要功能
///
/// - 项目（Project）管理：创建、读取、更新、删除
/// - 线程（Thread）管理：创建、读取、更新、删除
/// - 投影器状态：跟踪每个投影器已处理的最新事件序列号
///
/// # 线程安全
///
/// 通过 `Send + Sync` 约束保证实现可以在多线程环境中安全使用。
#[async_trait]
pub trait ProjectionRepository: Send + Sync {
    /// 保存项目
    ///
    /// 将项目数据持久化到数据库。如果项目已存在（基于 ID），则更新；否则插入新记录。
    /// 使用 `INSERT OR REPLACE` 语义实现 upsert 操作。
    ///
    /// # 参数
    ///
    /// * `project` - 要保存的项目引用
    ///
    /// # 返回值
    ///
    /// 成功时返回 `Ok(())`，失败时返回 `PersistenceError`
    fn save_project(&self, project: &Project) -> PersistenceResult<()>;

    /// 保存线程
    ///
    /// 将线程数据持久化到数据库。如果线程已存在（基于 ID），则更新；否则插入新记录。
    /// 线程包含大量嵌套数据（消息、计划、活动等），需要序列化为 JSON 存储。
    ///
    /// # 参数
    ///
    /// * `thread` - 要保存的线程引用
    ///
    /// # 返回值
    ///
    /// 成功时返回 `Ok(())`，失败时返回 `PersistenceError`
    fn save_thread(&self, thread: &Thread) -> PersistenceResult<()>;

    /// 获取项目
    ///
    /// 根据项目 ID 查询项目详情。如果项目不存在或已被软删除，返回 `None`。
    ///
    /// # 参数
    ///
    /// * `id` - 项目的唯一标识符
    ///
    /// # 返回值
    ///
    /// 成功时返回 `Option<Project>`，不存在时返回 `None`，失败时返回 `PersistenceError`
    fn get_project(&self, id: ProjectId) -> PersistenceResult<Option<Project>>;

    /// 获取线程
    ///
    /// 根据线程 ID 查询线程详情。如果线程不存在或已被软删除，返回 `None`。
    ///
    /// # 参数
    ///
    /// * `id` - 线程的唯一标识符
    ///
    /// # 返回值
    ///
    /// 成功时返回 `Option<Thread>`，不存在时返回 `None`，失败时返回 `PersistenceError`
    fn get_thread(&self, id: ThreadId) -> PersistenceResult<Option<Thread>>;

    /// 列出所有项目
    ///
    /// 查询所有未被软删除的项目，按创建时间倒序排列。
    ///
    /// # 返回值
    ///
    /// 成功时返回项目列表 `Vec<Project>`，如果没有项目返回空列表
    fn list_projects(&self) -> PersistenceResult<Vec<Project>>;

    /// 列出所有线程
    ///
    /// 查询所有未被软删除的线程，按创建时间倒序排列。
    ///
    /// # 返回值
    ///
    /// 成功时返回线程列表 `Vec<Thread>`，如果没有线程返回空列表
    fn list_threads(&self) -> PersistenceResult<Vec<Thread>>;

    /// 删除项目（软删除）
    ///
    /// 将项目的 `deleted_at` 字段设置为当前时间，标记为已删除。
    /// 软删除保留数据，便于审计和恢复。
    ///
    /// # 参数
    ///
    /// * `id` - 要删除的项目 ID
    ///
    /// # 返回值
    ///
    /// 成功时返回 `Ok(())`，失败时返回 `PersistenceError`
    fn delete_project(&self, id: ProjectId) -> PersistenceResult<()>;

    /// 删除线程（软删除）
    ///
    /// 将线程的 `deleted_at` 字段设置为当前时间，标记为已删除。
    /// 软删除保留数据，便于审计和恢复。
    ///
    /// # 参数
    ///
    /// * `id` - 要删除的线程 ID
    ///
    /// # 返回值
    ///
    /// 成功时返回 `Ok(())`，失败时返回 `PersistenceError`
    fn delete_thread(&self, id: ThreadId) -> PersistenceResult<()>;

    /// 获取投影器状态
    ///
    /// 查询指定投影器已处理的最新事件序列号。
    /// 如果投影器尚未处理任何事件，返回 0。
    ///
    /// # 参数
    ///
    /// * `projector_name` - 投影器名称，用于标识不同的投影器
    ///
    /// # 返回值
    ///
    /// 投影器已处理的最新序列号（`Sequence`）
    fn get_projection_state(&self, projector_name: &str) -> PersistenceResult<Sequence>;

    /// 更新投影器状态
    ///
    /// 更新投影器已处理的最新事件序列号。
    /// 使用 `INSERT OR REPLACE` 语义，如果投影器不存在则创建，存在则更新。
    ///
    /// # 参数
    ///
    /// * `projector_name` - 投影器名称
    /// * `sequence` - 新的序列号
    ///
    /// # 返回值
    ///
    /// 成功时返回 `Ok(())`，失败时返回 `PersistenceError`
    fn update_projection_state(&self, projector_name: &str, sequence: Sequence) -> PersistenceResult<()>;
}

/// SQLite 投影仓库实现
///
/// 基于 SQLite 数据库的投影仓库实现，提供项目和线程的持久化存储。
/// 内部使用 `SqliteClient` 进行数据库操作。
pub struct SqliteProjectionRepository {
    /// SQLite 数据库客户端
    client: SqliteClient,
}

impl SqliteProjectionRepository {
    /// 创建新的 SQLite 投影仓库实例
    ///
    /// # 参数
    ///
    /// * `client` - 已初始化的 SQLite 客户端实例
    ///
    /// # 返回值
    ///
    /// 返回新创建的 `SqliteProjectionRepository` 实例
    pub fn new(client: SqliteClient) -> Self {
        Self { client }
    }
}

impl ProjectionRepository for SqliteProjectionRepository {
    /// 保存项目到数据库
    ///
    /// 实现步骤：
    /// 1. 将项目的嵌套数据（scripts、default_model_selection）序列化为 JSON
    /// 2. 将时间戳转换为 RFC3339 格式
    /// 3. 执行 INSERT OR REPLACE 语句
    fn save_project(&self, project: &Project) -> PersistenceResult<()> {
        // 序列化 scripts 字段为 JSON 字符串
        let scripts_json = serde_json::to_string(&project.scripts)?;
        // 序列化 default_model_selection 字段（可选）
        let model_json = project.default_model_selection.as_ref()
            .map(serde_json::to_string)
            .transpose()?;

        // 执行插入或更新操作
        self.client.execute(
            "INSERT OR REPLACE INTO projection_projects 
             (id, kind, title, workspace_root, default_model_selection, scripts, created_at, updated_at, deleted_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            &[
                &project.id.to_string(),
                &serde_json::to_string(&project.kind)?,
                &project.title,
                &project.workspace_root,
                &model_json,
                &scripts_json,
                &project.created_at.to_rfc3339(),
                &project.updated_at.to_rfc3339(),
                &project.deleted_at.map(|d| d.to_rfc3339()),
            ],
        )?;

        Ok(())
    }

    /// 保存线程到数据库
    ///
    /// 实现步骤：
    /// 1. 将线程的所有嵌套数据序列化为 JSON（messages、plans、activities 等）
    /// 2. 处理可选字段（session、worktree、subagent 等）
    /// 3. 将布尔值转换为 INTEGER（0/1）
    /// 4. 执行 INSERT OR REPLACE 语句
    fn save_thread(&self, thread: &Thread) -> PersistenceResult<()> {
        // 序列化线程的各个嵌套字段
        let model_json = serde_json::to_string(&thread.model_selection)?;
        let messages_json = serde_json::to_string(&thread.messages)?;
        let plans_json = serde_json::to_string(&thread.proposed_plans)?;
        let activities_json = serde_json::to_string(&thread.activities)?;
        let checkpoints_json = serde_json::to_string(&thread.checkpoints)?;
        let session_json = thread.session.as_ref()
            .map(serde_json::to_string)
            .transpose()?;
        let worktree_json = thread.associated_worktree.as_ref()
            .map(serde_json::to_string)
            .transpose()?;
        let subagent_json = thread.subagent.as_ref()
            .map(serde_json::to_string)
            .transpose()?;
        let pr_json = thread.last_known_pr.as_ref()
            .map(serde_json::to_string)
            .transpose()?;
        let turn_json = thread.latest_turn.as_ref()
            .map(serde_json::to_string)
            .transpose()?;
        let handoff_json = thread.handoff.as_ref()
            .map(serde_json::to_string)
            .transpose()?;

        // 执行插入或更新操作
        self.client.execute(
            "INSERT OR REPLACE INTO projection_threads
             (id, project_id, title, model_selection, runtime_mode, interaction_mode, env_mode,
              branch, worktree_path, associated_worktree, is_pinned, parent_thread_id, subagent,
              fork_source_thread_id, sidechat_source_thread_id, last_known_pr, latest_turn,
              latest_user_message_at, has_pending_approvals, has_pending_user_input,
              has_actionable_proposed_plan, messages, proposed_plans, activities, checkpoints,
              session, created_at, updated_at, archived_at, deleted_at, handoff)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30, ?31)",
            &[
                &thread.id.to_string(),
                &thread.project_id.to_string(),
                &thread.title,
                &model_json,
                &serde_json::to_string(&thread.runtime_mode)?,
                &serde_json::to_string(&thread.interaction_mode)?,
                &serde_json::to_string(&thread.env_mode)?,
                &thread.branch,
                &thread.worktree_path,
                &worktree_json,
                &(thread.is_pinned as i32),
                &thread.parent_thread_id.map(|id| id.to_string()),
                &subagent_json,
                &thread.fork_source_thread_id.map(|id| id.to_string()),
                &thread.sidechat_source_thread_id.map(|id| id.to_string()),
                &pr_json,
                &turn_json,
                &thread.latest_user_message_at.map(|d| d.to_rfc3339()),
                &(thread.has_pending_approvals as i32),
                &(thread.has_pending_user_input as i32),
                &(thread.has_actionable_proposed_plan as i32),
                &messages_json,
                &plans_json,
                &activities_json,
                &checkpoints_json,
                &session_json,
                &thread.created_at.to_rfc3339(),
                &thread.updated_at.to_rfc3339(),
                &thread.archived_at.map(|d| d.to_rfc3339()),
                &thread.deleted_at.map(|d| d.to_rfc3339()),
                &handoff_json,
            ],
        )?;

        Ok(())
    }

    /// 从数据库获取项目
    ///
    /// 实现步骤：
    /// 1. 执行 SELECT 查询
    /// 2. 将数据库行映射为元组
    /// 3. 反序列化 JSON 字段并构造 Project 对象
    /// 4. 解析时间戳字符串为 DateTime 对象
    fn get_project(&self, id: ProjectId) -> PersistenceResult<Option<Project>> {
        let rows = self.client.query_map(
            "SELECT id, kind, title, workspace_root, default_model_selection, scripts, created_at, updated_at, deleted_at
             FROM projection_projects WHERE id = ?1",
            &[&id.to_string()],
            |row| {
                // 从数据库行提取各字段
                let id_str: String = row.get(0)?;
                let kind_str: String = row.get(1)?;
                let title: String = row.get(2)?;
                let workspace_root: String = row.get(3)?;
                let model_json: Option<String> = row.get(4)?;
                let scripts_json: String = row.get(5)?;
                let created_at_str: String = row.get(6)?;
                let updated_at_str: String = row.get(7)?;
                let deleted_at_str: Option<String> = row.get(8)?;

                Ok((id_str, kind_str, title, workspace_root, model_json, scripts_json, created_at_str, updated_at_str, deleted_at_str))
            },
        )?;

        // 如果没有查询到结果，返回 None
        if rows.is_empty() {
            return Ok(None);
        }

        // 取第一行数据
        let (id_str, kind_str, title, workspace_root, model_json, scripts_json, created_at_str, updated_at_str, deleted_at_str) = &rows[0];

        // 构造 Project 对象
        let project = Project {
            id: id_str.parse().map_err(|e| crate::error::PersistenceError::SerializationError(format!("UUID 解析错误: {}", e)))?,
            kind: serde_json::from_str(kind_str)?,
            title: title.clone(),
            workspace_root: workspace_root.clone(),
            default_model_selection: model_json.as_ref().map(|s| serde_json::from_str(s)).transpose()?,
            scripts: serde_json::from_str(scripts_json)?,
            created_at: created_at_str.parse().map_err(|e| crate::error::PersistenceError::SerializationError(format!("日期解析错误: {}", e)))?,
            updated_at: updated_at_str.parse().map_err(|e| crate::error::PersistenceError::SerializationError(format!("日期解析错误: {}", e)))?,
            deleted_at: deleted_at_str.as_ref().map(|s| s.parse()).transpose().map_err(|e| crate::error::PersistenceError::SerializationError(format!("日期解析错误: {}", e)))?,
        };

        Ok(Some(project))
    }

    /// 从数据库获取线程
    ///
    /// 查询线程的完整字段（与 `save_thread` 写入的字段一一对应），
    /// 确保读取后的 Thread 对象不丢失任何已持久化的状态。
    ///
    /// 实现步骤：
    /// 1. 执行 SELECT 查询，覆盖全部 31 个字段
    /// 2. 将数据库行映射为 Thread 对象
    /// 3. 反序列化 JSON 字段（model_selection、messages、plans 等）
    /// 4. 解析时间戳字符串为 DateTime 对象
    fn get_thread(&self, id: ThreadId) -> PersistenceResult<Option<Thread>> {
        let rows = self.client.query_map(
            "SELECT id, project_id, title, model_selection, runtime_mode, interaction_mode, env_mode,
                    branch, worktree_path, associated_worktree, is_pinned, parent_thread_id, subagent,
                    fork_source_thread_id, sidechat_source_thread_id, last_known_pr, latest_turn,
                    latest_user_message_at, has_pending_approvals, has_pending_user_input,
                    has_actionable_proposed_plan, messages, proposed_plans, activities, checkpoints,
                    session, created_at, updated_at, archived_at, deleted_at, handoff
             FROM projection_threads WHERE id = ?1",
            &[&id.to_string()],
            row_to_thread,
        )?;

        if rows.is_empty() {
            return Ok(None);
        }

        // query_map 已收集所有行，取第一行即可
        Ok(Some(rows.into_iter().next().unwrap()))
    }

    /// 列出所有未被软删除的项目
    ///
    /// 实现步骤：
    /// 1. 执行 SELECT 查询，过滤条件为 `deleted_at IS NULL`
    /// 2. 按创建时间倒序排列
    /// 3. 将每行数据映射为 Project 对象
    fn list_projects(&self) -> PersistenceResult<Vec<Project>> {
        let rows = self.client.query_map(
            "SELECT id, kind, title, workspace_root, default_model_selection, scripts, created_at, updated_at, deleted_at
             FROM projection_projects WHERE deleted_at IS NULL ORDER BY created_at DESC",
            &[],
            |row| {
                // 从数据库行提取并构造 Project 对象
                let id_str: String = row.get(0)?;
                let kind_str: String = row.get(1)?;
                let title: String = row.get(2)?;
                let workspace_root: String = row.get(3)?;
                let model_json: Option<String> = row.get(4)?;
                let scripts_json: String = row.get(5)?;
                let created_at_str: String = row.get(6)?;
                let updated_at_str: String = row.get(7)?;
                let deleted_at_str: Option<String> = row.get(8)?;

                Ok(Project {
                    id: id_str.parse().map_err(|_| rusqlite::Error::InvalidColumnIndex(0))?,
                    kind: serde_json::from_str(&kind_str).map_err(|_| rusqlite::Error::InvalidColumnIndex(0))?,
                    title,
                    workspace_root,
                    default_model_selection: model_json.as_ref().map(|s| serde_json::from_str(s)).transpose().map_err(|_| rusqlite::Error::InvalidColumnIndex(0))?,
                    scripts: serde_json::from_str(&scripts_json).map_err(|_| rusqlite::Error::InvalidColumnIndex(0))?,
                    created_at: created_at_str.parse().map_err(|_| rusqlite::Error::InvalidColumnIndex(0))?,
                    updated_at: updated_at_str.parse().map_err(|_| rusqlite::Error::InvalidColumnIndex(0))?,
                    deleted_at: deleted_at_str.as_ref().map(|s| s.parse()).transpose().map_err(|_| rusqlite::Error::InvalidColumnIndex(0))?,
                })
            },
        )?;

        Ok(rows)
    }

    /// 列出所有未被软删除的线程
    ///
    /// 查询线程的完整字段（与 `save_thread` 写入的字段一一对应），
    /// 确保读取后的 Thread 对象不丢失任何已持久化的状态。
    ///
    /// 实现步骤：
    /// 1. 执行 SELECT 查询，过滤条件为 `deleted_at IS NULL`，覆盖全部 31 个字段
    /// 2. 按创建时间倒序排列
    /// 3. 将每行数据映射为 Thread 对象
    fn list_threads(&self) -> PersistenceResult<Vec<Thread>> {
        let rows = self.client.query_map(
            "SELECT id, project_id, title, model_selection, runtime_mode, interaction_mode, env_mode,
                    branch, worktree_path, associated_worktree, is_pinned, parent_thread_id, subagent,
                    fork_source_thread_id, sidechat_source_thread_id, last_known_pr, latest_turn,
                    latest_user_message_at, has_pending_approvals, has_pending_user_input,
                    has_actionable_proposed_plan, messages, proposed_plans, activities, checkpoints,
                    session, created_at, updated_at, archived_at, deleted_at, handoff
             FROM projection_threads WHERE deleted_at IS NULL ORDER BY created_at DESC",
            &[],
            row_to_thread,
        )?;

        // query_map 已收集所有行并处理错误
        Ok(rows)
    }

    /// 软删除项目
    ///
    /// 将项目的 `deleted_at` 字段设置为当前时间，而不是物理删除记录。
    fn delete_project(&self, id: ProjectId) -> PersistenceResult<()> {
        self.client.execute(
            "UPDATE projection_projects SET deleted_at = datetime('now') WHERE id = ?1",
            &[&id.to_string()],
        )?;
        Ok(())
    }

    /// 软删除线程
    ///
    /// 将线程的 `deleted_at` 字段设置为当前时间，而不是物理删除记录。
    fn delete_thread(&self, id: ThreadId) -> PersistenceResult<()> {
        self.client.execute(
            "UPDATE projection_threads SET deleted_at = datetime('now') WHERE id = ?1",
            &[&id.to_string()],
        )?;
        Ok(())
    }

    /// 获取投影器已处理的最新序列号
    ///
    /// 实现步骤：
    /// 1. 查询 `projection_state` 表
    /// 2. 使用 `COALESCE` 处理不存在的情况，返回 0
    fn get_projection_state(&self, projector_name: &str) -> PersistenceResult<Sequence> {
        let sequence: Sequence = self.client.query_row(
            "SELECT COALESCE(last_applied_sequence, 0) FROM projection_state WHERE projector_name = ?1",
            &[&projector_name],
            |row| row.get(0),
        ).unwrap_or(0);

        Ok(sequence)
    }

    /// 更新投影器的序列号状态
    ///
    /// 使用 `INSERT OR REPLACE` 语义，如果投影器不存在则创建，存在则更新。
    fn update_projection_state(&self, projector_name: &str, sequence: Sequence) -> PersistenceResult<()> {
        self.client.execute(
            "INSERT OR REPLACE INTO projection_state (projector_name, last_applied_sequence) VALUES (?1, ?2)",
            &[&projector_name, &sequence],
        )?;
        Ok(())
    }
}

/// 将数据库行映射为 Thread 对象
///
/// 此函数查询结果的列顺序必须与 `save_thread` 中的 INSERT 语句字段顺序一致，
/// 共 31 个字段。所有 JSON 字段都会被反序列化为对应的 Rust 类型。
///
/// # 列顺序
///
/// 0. id, 1. project_id, 2. title, 3. model_selection, 4. runtime_mode,
/// 5. interaction_mode, 6. env_mode, 7. branch, 8. worktree_path,
/// 9. associated_worktree, 10. is_pinned, 11. parent_thread_id, 12. subagent,
/// 13. fork_source_thread_id, 14. sidechat_source_thread_id, 15. last_known_pr,
/// 16. latest_turn, 17. latest_user_message_at, 18. has_pending_approvals,
/// 19. has_pending_user_input, 20. has_actionable_proposed_plan, 21. messages,
/// 22. proposed_plans, 23. activities, 24. checkpoints, 25. session,
/// 26. created_at, 27. updated_at, 28. archived_at, 29. deleted_at, 30. handoff
fn row_to_thread(row: &rusqlite::Row<'_>) -> rusqlite::Result<Thread> {
    // 提取所有基础字段
    let id_str: String = row.get(0)?;
    let project_id_str: String = row.get(1)?;
    let title: String = row.get(2)?;
    let model_json: String = row.get(3)?;
    let runtime_mode_str: String = row.get(4)?;
    let interaction_mode_str: String = row.get(5)?;
    let env_mode_str: String = row.get(6)?;
    let branch: Option<String> = row.get(7)?;
    let worktree_path: Option<String> = row.get(8)?;
    let worktree_json: Option<String> = row.get(9)?;
    let is_pinned: i32 = row.get(10)?;
    let parent_thread_id_str: Option<String> = row.get(11)?;
    let subagent_json: Option<String> = row.get(12)?;
    let fork_source_thread_id_str: Option<String> = row.get(13)?;
    let sidechat_source_thread_id_str: Option<String> = row.get(14)?;
    let pr_json: Option<String> = row.get(15)?;
    let turn_json: Option<String> = row.get(16)?;
    let latest_user_message_at_str: Option<String> = row.get(17)?;
    let has_pending_approvals: i32 = row.get(18)?;
    let has_pending_user_input: i32 = row.get(19)?;
    let has_actionable_proposed_plan: i32 = row.get(20)?;
    let messages_json: String = row.get(21)?;
    let plans_json: String = row.get(22)?;
    let activities_json: String = row.get(23)?;
    let checkpoints_json: String = row.get(24)?;
    let session_json: Option<String> = row.get(25)?;
    let created_at_str: String = row.get(26)?;
    let updated_at_str: String = row.get(27)?;
    let archived_at_str: Option<String> = row.get(28)?;
    let deleted_at_str: Option<String> = row.get(29)?;
    let handoff_json: Option<String> = row.get(30)?;

    // 辅助闭包：将 serde_json::Error 转换为 rusqlite::Error
    let json_err = |e: serde_json::Error| {
        rusqlite::Error::FromSqlConversionFailure(
            0,
            rusqlite::types::Type::Text,
            Box::new(e),
        )
    };
    // 辅助闭包：将 chrono::ParseError 转换为 rusqlite::Error
    let date_err = |e: chrono::ParseError| {
        rusqlite::Error::FromSqlConversionFailure(
            0,
            rusqlite::types::Type::Text,
            Box::new(e),
        )
    };
    // 辅助闭包：将 UUID 解析错误转换为 rusqlite::Error
    let uuid_err = |e: uuid::Error| {
        rusqlite::Error::FromSqlConversionFailure(
            0,
            rusqlite::types::Type::Text,
            Box::new(e),
        )
    };

    // 解析 UUID 字段
    let id = id_str.parse::<uuid::Uuid>().map_err(uuid_err)?;
    let project_id = project_id_str.parse::<uuid::Uuid>().map_err(uuid_err)?;
    let parent_thread_id = parent_thread_id_str
        .map(|s| s.parse::<uuid::Uuid>())
        .transpose()
        .map_err(uuid_err)?;
    let fork_source_thread_id = fork_source_thread_id_str
        .map(|s| s.parse::<uuid::Uuid>())
        .transpose()
        .map_err(uuid_err)?;
    let sidechat_source_thread_id = sidechat_source_thread_id_str
        .map(|s| s.parse::<uuid::Uuid>())
        .transpose()
        .map_err(uuid_err)?;

    // 反序列化 JSON 字段
    let model_selection = serde_json::from_str(&model_json).map_err(json_err)?;
    let runtime_mode = serde_json::from_str(&runtime_mode_str).map_err(json_err)?;
    let interaction_mode = serde_json::from_str(&interaction_mode_str).map_err(json_err)?;
    let env_mode = serde_json::from_str(&env_mode_str).map_err(json_err)?;
    let associated_worktree = worktree_json
        .as_ref()
        .map(|s| serde_json::from_str(s))
        .transpose()
        .map_err(json_err)?;
    let subagent = subagent_json
        .as_ref()
        .map(|s| serde_json::from_str(s))
        .transpose()
        .map_err(json_err)?;
    let last_known_pr = pr_json
        .as_ref()
        .map(|s| serde_json::from_str(s))
        .transpose()
        .map_err(json_err)?;
    let latest_turn = turn_json
        .as_ref()
        .map(|s| serde_json::from_str(s))
        .transpose()
        .map_err(json_err)?;
    let messages = serde_json::from_str(&messages_json).map_err(json_err)?;
    let proposed_plans = serde_json::from_str(&plans_json).map_err(json_err)?;
    let activities = serde_json::from_str(&activities_json).map_err(json_err)?;
    let checkpoints = serde_json::from_str(&checkpoints_json).map_err(json_err)?;
    let session = session_json
        .as_ref()
        .map(|s| serde_json::from_str(s))
        .transpose()
        .map_err(json_err)?;
    let handoff = handoff_json
        .as_ref()
        .map(|s| serde_json::from_str(s))
        .transpose()
        .map_err(json_err)?;

    // 解析时间戳字段
    let created_at = created_at_str.parse().map_err(date_err)?;
    let updated_at = updated_at_str.parse().map_err(date_err)?;
    let latest_user_message_at = latest_user_message_at_str
        .map(|s| s.parse())
        .transpose()
        .map_err(date_err)?;
    let archived_at = archived_at_str
        .map(|s| s.parse())
        .transpose()
        .map_err(date_err)?;
    let deleted_at = deleted_at_str
        .map(|s| s.parse())
        .transpose()
        .map_err(date_err)?;

    Ok(Thread {
        id,
        project_id,
        title,
        model_selection,
        runtime_mode,
        interaction_mode,
        env_mode,
        branch,
        worktree_path,
        associated_worktree,
        is_pinned: is_pinned != 0,
        parent_thread_id,
        subagent,
        fork_source_thread_id,
        sidechat_source_thread_id,
        last_known_pr,
        latest_turn,
        latest_user_message_at,
        has_pending_approvals: has_pending_approvals != 0,
        has_pending_user_input: has_pending_user_input != 0,
        has_actionable_proposed_plan: has_actionable_proposed_plan != 0,
        messages,
        proposed_plans,
        activities,
        checkpoints,
        session,
        created_at,
        updated_at,
        archived_at,
        deleted_at,
        handoff,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::migrations::run_migrations;
    use chrono::Utc;
    use remi_core::models::*;

    #[test]
    fn test_projection_repository() {
        let temp_dir = std::env::temp_dir().join("remi-test-projection-repo");
        let db_path = temp_dir.join("test.sqlite");
        
        let client = SqliteClient::new(&db_path).unwrap();
        run_migrations(&client).unwrap();
        
        let repo = SqliteProjectionRepository::new(client);

        // 创建测试项目
        let project = Project {
            id: ProjectId::new_v4(),
            kind: ProjectKind::Local,
            title: "Test Project".to_string(),
            workspace_root: "/tmp/test".to_string(),
            default_model_selection: None,
            scripts: vec![],
            created_at: Utc::now(),
            updated_at: Utc::now(),
            deleted_at: None,
        };

        // 保存项目
        repo.save_project(&project).unwrap();

        // 获取项目
        let retrieved = repo.get_project(project.id).unwrap();
        assert!(retrieved.is_some());
        assert_eq!(retrieved.unwrap().title, "Test Project");

        // 列出项目
        let projects = repo.list_projects().unwrap();
        assert_eq!(projects.len(), 1);

        // 测试投影器状态
        repo.update_projection_state("test_projector", 42).unwrap();
        let state = repo.get_projection_state("test_projector").unwrap();
        assert_eq!(state, 42);

        // 清理
        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
