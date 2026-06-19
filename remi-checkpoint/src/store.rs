//! Git 检查点存储

use std::sync::Arc;

use chrono::{DateTime, Utc};
use remi_core::models::{Checkpoint, CheckpointId, ThreadId};
use remi_git::GitCore;
use serde::{Deserialize, Serialize};
use tracing::{debug, info};

use crate::error::{CheckpointError, CheckpointResult};

/// 检查点存储
pub struct CheckpointStore {
    git_core: Arc<GitCore>,
}

impl CheckpointStore {
    /// 创建新的检查点存储
    pub fn new(git_core: Arc<GitCore>) -> Self {
        Self { git_core }
    }

    /// 创建检查点
    pub async fn create_checkpoint(
        &self,
        thread_id: ThreadId,
        commit_sha: String,
        message: String,
    ) -> CheckpointResult<Checkpoint> {
        info!("创建检查点: thread_id={}, commit={}", thread_id, commit_sha);

        let checkpoint = Checkpoint {
            id: CheckpointId::new(),
            thread_id,
            commit_sha,
            message,
            created_at: Utc::now(),
        };

        // TODO: 持久化到数据库
        debug!("检查点已创建: {:?}", checkpoint);

        Ok(checkpoint)
    }

    /// 获取检查点
    pub async fn get_checkpoint(&self, checkpoint_id: CheckpointId) -> CheckpointResult<Option<Checkpoint>> {
        debug!("获取检查点: {}", checkpoint_id);

        // TODO: 从数据库查询
        Ok(None)
    }

    /// 列出线程的所有检查点
    pub async fn list_checkpoints(&self, thread_id: ThreadId) -> CheckpointResult<Vec<Checkpoint>> {
        debug!("列出检查点: thread_id={}", thread_id);

        // TODO: 从数据库查询
        Ok(vec![])
    }

    /// 删除检查点
    pub async fn delete_checkpoint(&self, checkpoint_id: CheckpointId) -> CheckpointResult<()> {
        info!("删除检查点: {}", checkpoint_id);

        // TODO: 从数据库删除
        Ok(())
    }

    /// 回滚到检查点
    pub async fn revert_to_checkpoint(
        &self,
        thread_id: ThreadId,
        checkpoint_id: CheckpointId,
    ) -> CheckpointResult<String> {
        info!("回滚到检查点: thread_id={}, checkpoint_id={}", thread_id, checkpoint_id);

        // 获取检查点
        let checkpoint = self
            .get_checkpoint(checkpoint_id)
            .await?
            .ok_or_else(|| CheckpointError::NotFound(checkpoint_id.to_string()))?;

        // 使用 Git 回滚
        self.git_core
            .revert_to_commit(&checkpoint.commit_sha)
            .await
            .map_err(|e| CheckpointError::GitOperationFailed(e.to_string()))?;

        Ok(checkpoint.commit_sha)
    }
}
