//! 检查点 Diff 查询

use std::sync::Arc;

use remi_core::models::ThreadId;
use remi_git::GitCore;
use tracing::debug;

use crate::error::{CheckpointError, CheckpointResult};
use crate::store::CheckpointStore;

/// Turn Diff 结果
#[derive(Debug, Clone)]
pub struct TurnDiff {
    /// Turn ID
    pub turn_id: String,
    /// Diff 内容
    pub diff: String,
    /// 统计信息
    pub stats: DiffStats,
}

/// Full Thread Diff 结果
#[derive(Debug, Clone)]
pub struct FullThreadDiff {
    /// 线程 ID
    pub thread_id: ThreadId,
    /// 所有 Turn 的 Diff
    pub turns: Vec<TurnDiff>,
    /// 总统计信息
    pub total_stats: DiffStats,
}

/// Diff 统计信息
#[derive(Debug, Clone, Default)]
pub struct DiffStats {
    /// 新增行数
    pub additions: usize,
    /// 删除行数
    pub deletions: usize,
    /// 修改的文件数
    pub files_changed: usize,
}

/// 检查点 Diff 查询服务
pub struct CheckpointDiffQuery {
    checkpoint_store: Arc<CheckpointStore>,
    git_core: Arc<GitCore>,
}

impl CheckpointDiffQuery {
    /// 创建新的 Diff 查询服务
    pub fn new(checkpoint_store: Arc<CheckpointStore>, git_core: Arc<GitCore>) -> Self {
        Self {
            checkpoint_store,
            git_core,
        }
    }

    /// 获取 Turn 的 Diff
    pub async fn get_turn_diff(
        &self,
        thread_id: ThreadId,
        turn_id: String,
    ) -> CheckpointResult<Option<TurnDiff>> {
        debug!("获取 Turn Diff: thread_id={}, turn_id={}", thread_id, turn_id);

        // TODO: 实现 Turn Diff 查询逻辑
        // 1. 查找 Turn 对应的检查点
        // 2. 计算与前一个检查点的 Diff
        // 3. 解析 Diff 统计信息

        Ok(None)
    }

    /// 获取完整线程的 Diff
    pub async fn get_full_thread_diff(
        &self,
        thread_id: ThreadId,
    ) -> CheckpointResult<FullThreadDiff> {
        debug!("获取完整线程 Diff: thread_id={}", thread_id);

        // TODO: 实现完整线程 Diff 查询逻辑
        // 1. 获取线程的所有检查点
        // 2. 计算每个 Turn 的 Diff
        // 3. 汇总统计信息

        Ok(FullThreadDiff {
            thread_id,
            turns: vec![],
            total_stats: DiffStats::default(),
        })
    }

    /// 获取两个检查点之间的 Diff
    pub async fn get_diff_between_checkpoints(
        &self,
        from_checkpoint: String,
        to_checkpoint: String,
    ) -> CheckpointResult<String> {
        debug!(
            "获取检查点间 Diff: from={}, to={}",
            from_checkpoint, to_checkpoint
        );

        // 获取两个检查点
        let from = self
            .checkpoint_store
            .get_checkpoint(from_checkpoint)
            .await?
            .ok_or_else(|| CheckpointError::NotFound("from_checkpoint".to_string()))?;

        let to = self
            .checkpoint_store
            .get_checkpoint(to_checkpoint)
            .await?
            .ok_or_else(|| CheckpointError::NotFound("to_checkpoint".to_string()))?;

        // 使用 Git 计算 Diff
        let diff = self
            .git_core
            .diff_between_commits(&from.git_ref, &to.git_ref)
            .await
            .map_err(|e| CheckpointError::GitOperationFailed(e.to_string()))?;

        Ok(diff)
    }
}
