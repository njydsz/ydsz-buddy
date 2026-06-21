//! # Git 检查点存储模块
//!
//! 本模块提供检查点（Checkpoint）的**持久化存储**和**生命周期管理**能力，
//! 是检查点系统的核心写入层。所有检查点的创建、查询、列举、删除和回滚操作
//! 均通过 [`CheckpointStore`] 统一管理。
//!
//! ## 核心功能
//!
//! - **创建检查点**：基于 Git Commit SHA 创建新的检查点记录，并分配唯一 ID。
//! - **查询检查点**：按检查点 ID 精确查询，或按对话线程 ID 列举所有关联检查点。
//! - **删除检查点**：按检查点 ID 删除指定的检查点记录。
//! - **回滚到检查点**：将当前工作区代码回滚到指定检查点对应的 Git Commit 状态。
//!
//! ## 架构设计
//!
//! [`CheckpointStore`] 作为存储服务入口，内部依赖 [`remi_git::GitCore`] 执行
//! 底层 Git 操作（如回滚），并通过 [`SqliteCheckpointStore`] 实现检查点元数据的
//! 持久化存储。
//!
//! ## 线程安全
//!
//! 内部通过 `Arc` 持有 [`GitCore`] 引用，支持在多线程/异步任务中安全共享。
//!
//! ## 使用示例
//!
//! ```rust,ignore
//! use std::sync::Arc;
//! use remi_checkpoint::store::CheckpointStore;
//! use remi_git::GitCore;
//! use remi_persistence::SqliteCheckpointStore;
//!
//! let git_core = Arc::new(GitCore::new('/path/to/repo')?);
//! let sqlite_store = Arc::new(SqliteCheckpointStore::new('/path/to/db')?);
//! let store = CheckpointStore::new(git_core, sqlite_store);
//!
//! // 创建检查点
//! let checkpoint = store.create_checkpoint(
//!     thread_id,
//!     'abc123def456'.to_string(),
//!     'AI 生成代码后的检查点'.to_string(),
//! ).await?;
//!
//! // 回滚到检查点
//! store.revert_to_checkpoint(thread_id, checkpoint.id).await?;
//! ```

use std::sync::Arc;
use chrono::Utc;
use remi_core::models::{Checkpoint, CheckpointStatus, ThreadId};
use remi_git::GitCore;
use remi_persistence::{CheckpointStore as CheckpointStoreTrait, SqliteCheckpointStore};
use tracing::{debug, info};

use crate::error::{CheckpointError, CheckpointResult};
/// # 检查点存储服务
///
/// 负责检查点（Checkpoint）的完整生命周期管理，包括创建、查询、列举、删除和回滚。
/// 检查点本质上是对 Git Commit 的元数据封装，记录了该 Commit 所属的对话线程、
/// 轮次、描述信息和创建时间。
///
/// ## 职责边界
///
/// - **本模块负责**：检查点元数据的 CRUD 操作，以及协调 Git 回滚操作。
/// - **本模块不负责**：实际的 Git Diff 计算（由 [`crate::query::CheckpointDiffQuery`] 负责）。
///
/// ## 依赖注入
///
/// - `git_core`：[`GitCore`] 的共享引用，用于执行 Git 回滚等底层操作。
/// - `checkpoint_store`：[`SqliteCheckpointStore`] 的共享引用，用于检查点持久化。
///
/// ## 实现状态
///
/// ✅ 已完成数据库持久化实现，支持检查点的完整 CRUD 操作。
pub struct CheckpointStore {
    /// Git 核心服务引用
    ///
    /// 通过 `Arc` 共享，用于执行 Git 回滚（`revert_to_commit`）等底层操作。
    git_core: Arc<GitCore>,
    /// 检查点存储服务引用
    ///
    /// 通过 `Arc` 共享，用于检查点的持久化存储和查询。
    checkpoint_store: Arc<SqliteCheckpointStore>,
}

impl CheckpointStore {
    /// # 创建新的检查点存储服务实例
    ///
    /// 通过注入 Git 核心服务和检查点持久化存储来构造存储服务。
    ///
    /// ## 参数
    ///
    /// | 参数 | 类型 | 说明 |
    /// |------|------|------|
    /// | `git_core` | `Arc<GitCore>` | Git 核心服务的共享引用，用于后续的回滚操作 |
    /// | `checkpoint_store` | `Arc<SqliteCheckpointStore>` | 检查点持久化存储的共享引用，用于检查点的 CRUD 操作 |
    ///
    /// ## 返回值
    ///
    /// 返回新构造的 [`CheckpointStore`] 实例。
    ///
    /// ## 使用示例
    ///
    /// ```rust,ignore
    /// let git_core = Arc::new(GitCore::new('/path/to/repo')?);
    /// let sqlite_store = Arc::new(SqliteCheckpointStore::new('/path/to/db')?);
    /// let store = CheckpointStore::new(git_core, sqlite_store);
    /// ```
    pub fn new(git_core: Arc<GitCore>, checkpoint_store: Arc<SqliteCheckpointStore>) -> Self {
        Self { git_core, checkpoint_store }
    }

    /// # 创建新的检查点
    ///
    /// 基于指定的 Git Commit SHA 创建一个新的检查点记录。系统会自动生成唯一的
    /// 检查点 ID（UUID v4），并记录创建时间。
    ///
    /// ## 参数
    ///
    /// | 参数 | 类型 | 说明 |
    /// |------|------|------|
    /// | `thread_id` | [`ThreadId`] | 检查点所属的对话线程 ID |
    /// | `turn_id` | `String` | 当前轮次 ID，用于关联检查点与具体的交互轮次 |
    /// | `commit_sha` | `String` | 检查点对应的 Git Commit SHA（即 `git_ref`） |
    /// | `message` | `String` | 检查点的描述信息，用于人类可读的标识 |
    ///
    /// ## 返回值
    ///
    /// - `Ok(Checkpoint)`：成功创建并返回完整的检查点对象。
    ///
    /// # Errors
    ///
    /// - [`CheckpointError::DatabaseError`]：检查点持久化到数据库时失败。
    ///
    /// ## 检查点字段说明
    ///
    /// 创建的 [`Checkpoint`] 对象包含以下字段：
    ///
    /// | 字段 | 来源 | 说明 |
    /// |------|------|------|
    /// | `id` | 自动生成 | UUID v4 格式的唯一标识符 |
    /// | `turn_id` | `turn_id` 参数 | 所属轮次 ID |
    /// | `git_ref` | `commit_sha` 参数 | Git Commit SHA 引用 |
    /// | `description` | `message` 参数 | 检查点描述信息 |
    /// | `created_at` | 当前时间 | 检查点创建时间戳（UTC） |
    ///
    /// ## 实现状态
    ///
    /// ✅ 已完成数据库持久化实现，检查点会通过 [`SqliteCheckpointStore`] 写入 SQLite。
    pub async fn create_checkpoint(
        &self,
        thread_id: ThreadId,
        turn_id: String,
        commit_sha: String,
        message: String,
    ) -> CheckpointResult<Checkpoint> {
        info!("创建检查点: thread_id={}, turn_id={}, commit={}", thread_id, turn_id, commit_sha);

        // 构造检查点对象
        let checkpoint = Checkpoint {
            id: uuid::Uuid::new_v4().to_string(),
            thread_id,
            turn_id,
            git_ref: commit_sha,
            description: message,
            status: CheckpointStatus::Ready,
            checkpoint_turn_count: 0,
            files: vec![],
            assistant_message_id: None,
            created_at: Utc::now(),
            completed_at: None,
        };

        // 持久化到数据库
        self.checkpoint_store
            .save_checkpoint(&checkpoint)
            .map_err(|e| CheckpointError::DatabaseError(e.to_string()))?;
        debug!("检查点已持久化: id={}", checkpoint.id);

        Ok(checkpoint)
    }

    /// # 按 ID 查询检查点
    ///
    /// 根据检查点的唯一 ID 精确查询对应的检查点记录。
    ///
    /// ## 参数
    ///
    /// | 参数 | 类型 | 说明 |
    /// |------|------|------|
    /// | `checkpoint_id` | `String` | 目标检查点的唯一 ID |
    ///
    /// ## 返回值
    ///
    /// - `Ok(Some(Checkpoint))`：找到匹配的检查点。
    /// - `Ok(None)`：未找到匹配的检查点。
    ///
    /// # Errors
    ///
    /// - [`CheckpointError::DatabaseError`]：从数据库查询检查点时失败。
    ///
    /// ## 实现状态
    ///
    /// ✅ 已接入 [`SqliteCheckpointStore`] 进行数据库查询。
    pub async fn get_checkpoint(&self, checkpoint_id: String) -> CheckpointResult<Option<Checkpoint>> {
        debug!("获取检查点: {}", checkpoint_id);

        self.checkpoint_store
            .get_checkpoint(&checkpoint_id)
            .map_err(|e| CheckpointError::DatabaseError(e.to_string()))
    }

    /// # 列举线程的所有检查点
    ///
    /// 查询指定对话线程下创建的所有检查点，按创建时间排序。
    ///
    /// ## 参数
    ///
    /// | 参数 | 类型 | 说明 |
    /// |------|------|------|
    /// | `thread_id` | [`ThreadId`] | 目标对话线程的唯一 ID |
    ///
    /// ## 返回值
    ///
    /// - `Ok(Vec<Checkpoint>)`：该线程下所有检查点的列表（按创建时间升序排列）。
    ///   若无检查点则返回空列表。
    ///
    /// # Errors
    ///
    /// - [`CheckpointError::DatabaseError`]：从数据库查询检查点列表时失败。
    ///
    /// ## 使用场景
    ///
    /// - 展示对话线程的完整检查点历史。
    /// - 为 Diff 查询提供检查点序列（参见 [`crate::query::CheckpointDiffQuery`]）。
    ///
    /// ## 实现状态
    ///
    /// ✅ 已接入 [`SqliteCheckpointStore`] 进行数据库查询。
    pub async fn list_checkpoints(&self, thread_id: ThreadId) -> CheckpointResult<Vec<Checkpoint>> {
        debug!("列出检查点: thread_id={}", thread_id);

        self.checkpoint_store
            .list_checkpoints(thread_id)
            .map_err(|e| CheckpointError::DatabaseError(e.to_string()))
    }

    /// # 删除检查点
    ///
    /// 根据检查点 ID 删除指定的检查点记录。删除后该检查点将不再可查询或回滚。
    ///
    /// ## 参数
    ///
    /// | 参数 | 类型 | 说明 |
    /// |------|------|------|
    /// | `checkpoint_id` | `String` | 目标检查点的唯一 ID |
    ///
    /// ## 返回值
    ///
    /// - `Ok(())`：删除成功（即使检查点原本不存在也视为成功）。
    ///
    /// # Errors
    ///
    /// - [`CheckpointError::DatabaseError`]：从数据库删除检查点记录时失败。
    ///
    /// ## 注意事项
    ///
    /// - 删除检查点**不会**删除对应的 Git Commit，仅移除检查点元数据记录。
    /// - 若该检查点正被其他检查点引用（如作为 Diff 的基准点），删除后可能影响 Diff 查询。
    ///
    /// ## 实现状态
    ///
    /// ✅ 已接入 [`SqliteCheckpointStore`] 进行数据库删除。
    pub async fn delete_checkpoint(&self, checkpoint_id: String) -> CheckpointResult<()> {
        info!("删除检查点: {}", checkpoint_id);

        self.checkpoint_store
            .delete_checkpoint(&checkpoint_id)
            .map_err(|e| CheckpointError::DatabaseError(e.to_string()))
    }

    /// # 回滚到指定检查点
    ///
    /// 将当前工作区的代码状态回滚到指定检查点对应的 Git Commit。
    /// 回滚操作通过 [`GitCore::revert_to_commit`] 实现，会修改工作区和暂存区。
    ///
    /// ## 参数
    ///
    /// | 参数 | 类型 | 说明 |
    /// |------|------|------|
    /// | `cwd` | `&str` | 工作目录路径，用于定位 Git 仓库位置 |
    /// | `thread_id` | [`ThreadId`] | 对话线程 ID（用于日志记录和上下文关联） |
    /// | `checkpoint_id` | `String` | 目标检查点的唯一 ID |
    ///
    /// ## 返回值
    ///
    /// - `Ok(String)`：回滚成功，返回目标检查点的 Git Commit SHA（`git_ref`）。
    /// - `Err(CheckpointError::NotFound)`：指定 ID 的检查点不存在。
    /// - `Err(CheckpointError::GitOperationFailed)`：Git 回滚命令执行失败。
    ///
    /// ## 执行流程
    ///
    /// 1. 通过 [`get_checkpoint`](CheckpointStore::get_checkpoint) 查询目标检查点。
    /// 2. 若检查点不存在，返回 [`CheckpointError::NotFound`]。
    /// 3. 调用 [`GitCore::revert_to_commit`] 将代码回滚到检查点的 `git_ref`。
    /// 4. 若 Git 操作失败，将错误映射为 [`CheckpointError::GitOperationFailed`]。
    ///
    /// ## 副作用
    ///
    /// > ⚠️ **警告**：此操作会修改 Git 工作区和暂存区，属于**破坏性操作**。
    /// > 调用前应确保用户已确认回滚意图，必要时先创建新的检查点以保存当前状态。
    pub async fn revert_to_checkpoint(
        &self,
        cwd: &str,
        thread_id: ThreadId,
        checkpoint_id: String,
    ) -> CheckpointResult<String> {
        info!("回滚到检查点: thread_id={}, checkpoint_id={}", thread_id, checkpoint_id);

        // 查询目标检查点，若不存在则返回 NotFound 错误
        let checkpoint = self
            .get_checkpoint(checkpoint_id.clone())
            .await?
            .ok_or(CheckpointError::NotFound(checkpoint_id))?;

        // 调用 Git 核心服务执行回滚操作
        self.git_core
            .revert_to_commit(cwd, &checkpoint.git_ref)
            .await
            .map_err(|e| CheckpointError::GitOperationFailed(e.to_string()))?;

        // 返回回滚目标的 Git Commit SHA
        Ok(checkpoint.git_ref)
    }
}
