//! # 检查点 Diff 查询模块
//!
//! 本模块提供检查点（Checkpoint）之间的代码变更差异（Diff）查询能力，
//! 是检查点系统中面向**变更追溯**和**变更审计**的核心查询层。
//!
//! ## 核心功能
//!
//! - **单轮 Diff 查询**：获取某个对话轮次（Turn）相对于前一轮的代码变更。
//! - **全线程 Diff 查询**：获取整个对话线程（Thread）从创建到当前的所有代码变更汇总。
//! - **跨检查点 Diff 查询**：计算任意两个检查点之间的代码差异。
//! - **Diff 统计**：提供新增行数、删除行数、变更文件数等聚合统计信息。
//!
//! ## 架构设计
//!
//! [`CheckpointDiffQuery`] 作为查询服务的入口，内部依赖：
//! - [`CheckpointStore`]：用于查询检查点元数据（如 Git Commit 引用）。
//! - [`GitCore`]：用于调用底层 Git 命令计算实际的代码差异。
//!
//! 查询结果通过 [`TurnDiff`]、[`FullThreadDiff`]、[`DiffStats`] 等数据结构返回，
//! 所有结构均实现了 `Debug` 和 `Clone`，便于在异步上下文中传递和调试。
//!
//! ## 使用示例
//!
//! ```rust,ignore
//! use std::sync::Arc;
//! use remi_checkpoint::query::CheckpointDiffQuery;
//! use remi_checkpoint::store::CheckpointStore;
//! use remi_git::GitCore;
//!
//! let git_core = Arc::new(GitCore::new('/path/to/repo')?);
//! let store = Arc::new(CheckpointStore::new(git_core.clone()));
//! let query = CheckpointDiffQuery::new(store, git_core);
//!
//! // 查询两个检查点之间的 Diff
//! let diff = query.get_diff_between_checkpoints(
//!     'checkpoint-id-1'.to_string(),
//!     'checkpoint-id-2'.to_string(),
//! ).await?;
//! ```

use std::sync::Arc;

use remi_core::models::ThreadId;
use remi_git::GitCore;
use tracing::debug;

use crate::error::{CheckpointError, CheckpointResult};
use crate::store::CheckpointStore;

/// # Turn Diff 查询结果
///
/// 表示对话线程中某一轮（Turn）的代码变更差异信息。
/// 每个 Turn 对应一次 AI 代码生成或用户手动修改，本结构记录了该轮变更的
/// 完整 Diff 内容及统计摘要。
///
/// ## 字段说明
///
/// | 字段 | 类型 | 说明 |
/// |------|------|------|
/// | `turn_id` | `String` | 轮次的唯一标识符，用于关联对话上下文 |
/// | `diff` | `String` | 该轮变更的完整 Unified Diff 格式文本 |
/// | `stats` | [`DiffStats`] | 该轮变更的统计摘要（增删行数、变更文件数） |
#[derive(Debug, Clone)]
pub struct TurnDiff {
    /// 轮次唯一标识符
    ///
    /// 与对话线程中的某一轮 Turn 一一对应，用于追溯该轮变更的上下文。
    pub turn_id: String,
    /// Diff 内容（Unified Diff 格式）
    ///
    /// 包含该轮次所有文件变更的完整差异文本，格式遵循标准的 Unified Diff 规范。
    pub diff: String,
    /// 统计信息
    ///
    /// 该轮次变更的聚合统计，包括新增行数、删除行数和变更文件数。
    pub stats: DiffStats,
}

/// # 全线程 Diff 查询结果
///
/// 表示整个对话线程（Thread）从创建到当前时刻的所有代码变更汇总。
/// 包含每个轮次的独立 Diff 信息以及全局聚合统计。
///
/// ## 使用场景
///
/// - 展示整个对话过程中代码的完整演变历史。
/// - 评估一次 AI 辅助编码会话的总体代码变更规模。
///
/// ## 字段说明
///
/// | 字段 | 类型 | 说明 |
/// |------|------|------|
/// | `thread_id` | [`ThreadId`] | 对话线程的唯一标识符 |
/// | `turns` | `Vec<TurnDiff>` | 线程中每个轮次的 Diff 详情列表，按时间顺序排列 |
/// | `total_stats` | [`DiffStats`] | 所有轮次合并后的全局统计信息 |
#[derive(Debug, Clone)]
pub struct FullThreadDiff {
    /// 对话线程唯一标识符
    ///
    /// 关联到 [`remi_core::models::ThreadId`]，用于标识本次查询所属的对话线程。
    pub thread_id: ThreadId,
    /// 所有轮次的 Diff 列表
    ///
    /// 按时间顺序排列，每个元素对应线程中一轮对话的代码变更详情。
    pub turns: Vec<TurnDiff>,
    /// 全局统计信息
    ///
    /// 所有轮次变更的聚合统计，等同于将所有 Turn 的 Diff 合并后计算的统计结果。
    pub total_stats: DiffStats,
}

/// # Diff 统计信息
///
/// 记录代码变更的聚合统计数据，用于量化变更规模。
/// 可用于单个 Turn 或整个 Thread 的变更统计。
///
/// ## 字段说明
///
/// | 字段 | 类型 | 说明 |
/// |------|------|------|
/// | `additions` | `usize` | 新增的代码行数 |
/// | `deletions` | `usize` | 删除的代码行数 |
/// | `files_changed` | `usize` | 发生变更的文件总数 |
///
/// ## 默认值
///
/// 通过 `#[derive(Default)]` 实现，所有字段默认为 `0`，
/// 适用于无变更或初始化场景。
#[derive(Debug, Clone, Default)]
pub struct DiffStats {
    /// 新增行数
    ///
    /// 在 Diff 中以 `+` 开头的行数（不含 `+++` 文件头行）。
    pub additions: usize,
    /// 删除行数
    ///
    /// 在 Diff 中以 `-` 开头的行数（不含 `---` 文件头行）。
    pub deletions: usize,
    /// 修改的文件数
    ///
    /// 在 Diff 中以 `diff --git` 开头的文件级变更块数量。
    pub files_changed: usize,
}

/// # 检查点 Diff 查询服务
///
/// 提供检查点之间代码变更差异的查询能力，是检查点系统的**只读查询层**。
/// 内部组合了检查点存储服务（用于获取检查点元数据）和 Git 核心服务（用于计算实际 Diff）。
///
/// ## 线程安全
///
/// 内部依赖均通过 `Arc` 持有，支持在多线程/异步任务中安全共享。
///
/// ## 依赖注入
///
/// - `checkpoint_store`：[`CheckpointStore`] 的共享引用，用于查询检查点记录。
/// - `git_core`：[`GitCore`] 的共享引用，用于调用 Git 底层命令计算 Diff。
pub struct CheckpointDiffQuery {
    /// 检查点存储服务引用
    ///
    /// 通过 `Arc` 共享，用于查询检查点的元数据（如 Git Commit SHA）。
    checkpoint_store: Arc<CheckpointStore>,
    /// Git 核心服务引用
    ///
    /// 通过 `Arc` 共享，用于执行 Git Diff 等底层操作。
    git_core: Arc<GitCore>,
}

impl CheckpointDiffQuery {
    /// # 创建新的 Diff 查询服务实例
    ///
    /// 通过注入检查点存储服务和 Git 核心服务来构造查询服务。
    ///
    /// ## 参数
    ///
    /// | 参数 | 类型 | 说明 |
    /// |------|------|------|
    /// | `checkpoint_store` | `Arc<CheckpointStore>` | 检查点存储服务的共享引用 |
    /// | `git_core` | `Arc<GitCore>` | Git 核心服务的共享引用 |
    ///
    /// ## 返回值
    ///
    /// 返回新构造的 [`CheckpointDiffQuery`] 实例。
    ///
    /// ## 使用示例
    ///
    /// ```rust,ignore
    /// let query = CheckpointDiffQuery::new(store, git_core);
    /// ```
    pub fn new(checkpoint_store: Arc<CheckpointStore>, git_core: Arc<GitCore>) -> Self {
        Self {
            checkpoint_store,
            git_core,
        }
    }

    /// # 获取单个轮次（Turn）的代码变更差异
    ///
    /// 查询指定对话线程中某一轮对话相对于前一轮的代码变更。
    /// 内部会查找该 Turn 对应的检查点，并计算与前一个检查点之间的 Git Diff。
    ///
    /// ## 参数
    ///
    /// | 参数 | 类型 | 说明 |
    /// |------|------|------|
    /// | `thread_id` | [`ThreadId`] | 对话线程的唯一标识符 |
    /// | `turn_id` | `String` | 目标轮次的唯一标识符 |
    ///
    /// ## 返回值
    ///
    /// - `Ok(Some(TurnDiff))`：成功获取到该轮次的 Diff 信息。
    /// - `Ok(None)`：该轮次尚无关联的检查点或无代码变更。
    ///
    /// # Errors
    ///
    /// - [`CheckpointError::NotFound`]：目标 `turn_id` 在线程中不存在对应的检查点。
    /// - [`CheckpointError::DatabaseError`]：查询检查点列表时数据库操作失败。
    /// - [`CheckpointError::GitOperationFailed`]：Git Diff 命令执行失败。
    pub async fn get_turn_diff(
        &self,
        thread_id: ThreadId,
        turn_id: String,
    ) -> CheckpointResult<Option<TurnDiff>> {
        debug!("获取 Turn Diff: thread_id={}, turn_id={}", thread_id, turn_id);

        // 1. 获取该线程的所有检查点，按时间排序
        let checkpoints = self.checkpoint_store.list_checkpoints(thread_id).await?;
        
        // 2. 查找目标 turn_id 对应的检查点
        let target_checkpoint = checkpoints
            .iter()
            .find(|cp| cp.turn_id == turn_id)
            .ok_or_else(|| CheckpointError::NotFound(format!("Turn {} not found", turn_id)))?;

        // 3. 查找前一个检查点（按时间顺序）
        let prev_checkpoint = checkpoints
            .iter()
            .find(|cp| cp.created_at < target_checkpoint.created_at)
            .cloned();

        // 4. 计算 Diff
        let diff = if let Some(prev) = prev_checkpoint {
            // 有前一个检查点，计算两者之间的 Diff
            self.git_core
                .diff_between_commits(&prev.git_ref, &target_checkpoint.git_ref)
                .await
                .map_err(|e| CheckpointError::GitOperationFailed(e.to_string()))?
        } else {
            // 没有前一个检查点，计算从空到当前检查点的 Diff
            self.git_core
                .diff_from_empty(&target_checkpoint.git_ref)
                .await
                .map_err(|e| CheckpointError::GitOperationFailed(e.to_string()))?
        };

        // 5. 解析统计信息
        let stats = parse_diff_stats(&diff);

        Ok(Some(TurnDiff {
            turn_id,
            diff,
            stats,
        }))
    }

    /// # 获取完整对话线程的代码变更差异
    ///
    /// 查询指定对话线程从创建到当前时刻的所有代码变更汇总，
    /// 包含每个轮次的独立 Diff 详情和全局聚合统计。
    ///
    /// ## 参数
    ///
    /// | 参数 | 类型 | 说明 |
    /// |------|------|------|
    /// | `thread_id` | [`ThreadId`] | 目标对话线程的唯一标识符 |
    ///
    /// ## 返回值
    ///
    /// - `Ok(FullThreadDiff)`：成功获取全线程 Diff 信息（可能包含零个或多个轮次）。
    ///
    /// # Errors
    ///
    /// - [`CheckpointError::DatabaseError`]：查询检查点列表时数据库操作失败。
    /// - [`CheckpointError::GitOperationFailed`]：Git Diff 命令执行失败。
    pub async fn get_full_thread_diff(
        &self,
        thread_id: ThreadId,
    ) -> CheckpointResult<FullThreadDiff> {
        debug!("获取完整线程 Diff: thread_id={}", thread_id);

        // 1. 获取该线程的所有检查点，按时间排序
        let checkpoints = self.checkpoint_store.list_checkpoints(thread_id).await?;
        
        let mut turns = Vec::new();
        let mut total_stats = DiffStats::default();

        // 2. 遍历所有检查点，计算每个 Turn 的 Diff
        for (index, checkpoint) in checkpoints.iter().enumerate() {
            let diff = if index == 0 {
                // 第一个检查点，计算从空到当前的 Diff
                self.git_core
                    .diff_from_empty(&checkpoint.git_ref)
                    .await
                    .map_err(|e| CheckpointError::GitOperationFailed(e.to_string()))?
            } else {
                // 后续检查点，计算与前一个的 Diff
                let prev_checkpoint = &checkpoints[index - 1];
                self.git_core
                    .diff_between_commits(&prev_checkpoint.git_ref, &checkpoint.git_ref)
                    .await
                    .map_err(|e| CheckpointError::GitOperationFailed(e.to_string()))?
            };

            // 3. 解析统计信息
            let stats = parse_diff_stats(&diff);

            // 4. 累加到总统计
            total_stats.additions += stats.additions;
            total_stats.deletions += stats.deletions;
            total_stats.files_changed += stats.files_changed;

            turns.push(TurnDiff {
                turn_id: checkpoint.turn_id.clone(),
                diff,
                stats,
            });
        }

        Ok(FullThreadDiff {
            thread_id,
            turns,
            total_stats,
        })
    }

    /// # 获取两个检查点之间的代码差异
    ///
    /// 计算任意两个检查点之间的 Git Diff。两个检查点可以属于不同的对话线程，
    /// 只要它们在同一个 Git 仓库中即可。
    ///
    /// ## 参数
    ///
    /// | 参数 | 类型 | 说明 |
    /// |------|------|------|
    /// | `from_checkpoint` | `String` | 起始检查点的 ID（Diff 的基准点） |
    /// | `to_checkpoint` | `String` | 目标检查点的 ID（Diff 的对比点） |
    ///
    /// ## 返回值
    ///
    /// - `Ok(String)`：成功时返回 Unified Diff 格式的文本。
    ///
    /// # Errors
    ///
    /// - [`CheckpointError::NotFound`]：起始或目标检查点不存在。
    /// - [`CheckpointError::DatabaseError`]：查询检查点元数据时数据库操作失败。
    /// - [`CheckpointError::GitOperationFailed`]：Git Diff 命令执行失败。
    pub async fn get_diff_between_checkpoints(
        &self,
        from_checkpoint: String,
        to_checkpoint: String,
    ) -> CheckpointResult<String> {
        debug!(
            "获取检查点间 Diff: from={}, to={}",
            from_checkpoint, to_checkpoint
        );

        // 查询起始检查点的元数据，若不存在则返回 NotFound 错误
        let from = self
            .checkpoint_store
            .get_checkpoint(from_checkpoint)
            .await?
            .ok_or_else(|| CheckpointError::NotFound("from_checkpoint".to_string()))?;

        // 查询目标检查点的元数据，若不存在则返回 NotFound 错误
        let to = self
            .checkpoint_store
            .get_checkpoint(to_checkpoint)
            .await?
            .ok_or_else(|| CheckpointError::NotFound("to_checkpoint".to_string()))?;

        // 调用 Git 核心服务计算两个 Commit 之间的 Unified Diff
        let diff = self
            .git_core
            .diff_between_commits(&from.git_ref, &to.git_ref)
            .await
            .map_err(|e| CheckpointError::GitOperationFailed(e.to_string()))?;

        Ok(diff)
    }
}

/// 解析 Unified Diff 文本的统计信息
///
/// 从 Git Diff 输出中统计新增行数、删除行数和变更文件数。
///
/// ## 解析规则
///
/// - **新增行（`+`）**：以 `+` 开头但**不**以 `+++` 开头（排除文件头标识）
/// - **删除行（`-`）**：以 `-` 开头但**不**以 `---` 开头（排除文件头标识）
/// - **变更文件数**：`diff --git` 开头的行数
///
/// # 参数
///
/// - `diff` — Unified Diff 格式的文本，通常由 `git diff` 命令输出
///
/// # 返回值
///
/// 返回填充了统计数据的 [`DiffStats`] 结构体。
fn parse_diff_stats(diff: &str) -> DiffStats {
    // 累加器：以 0 初始化，逐行解析
    let mut additions = 0;
    let mut deletions = 0;
    let mut files_changed = 0;

    for line in diff.lines() {
        if line.starts_with("diff --git") {
            // 每个文件级 diff 块以 'diff --git' 开头
            files_changed += 1;
        } else if line.starts_with('+') && !line.starts_with("+++") {
            // 排除 '+++' 文件头标识
            additions += 1;
        } else if line.starts_with('-') && !line.starts_with("---") {
            // 排除 '---' 文件头标识
            deletions += 1;
        }
    }

    DiffStats {
        additions,
        deletions,
        files_changed,
    }
}
