//! Checkpoint diff blob 存储与查询。
//!
//! 每个检查点存一条 (thread_id, from_turn, to_turn) → diff 的记录，
//! 允许在前端做"两个轮次之间的差异"展示。

use remi_contracts::ThreadId;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Diff blob 实体（也用作 API 响应）。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CheckpointDiffBlob {
    /// 所属会话 ID。
    pub thread_id: ThreadId,
    /// 起始轮次。
    pub from_turn_count: u32,
    /// 结束轮次。
    pub to_turn_count: u32,
    /// unified diff 内容。
    pub diff: String,
    /// 创建时间。
    pub created_at: String,
}

/// Checkpoint diff 查询器。
///
/// 通常包装一个 `dyn CheckpointStore`，对外提供友好的查询 API。
pub struct CheckpointDiffQuery {
    store: std::sync::Arc<dyn crate::CheckpointStore>,
}

impl CheckpointDiffQuery {
    /// 创建新的查询器。
    pub fn new(store: std::sync::Arc<dyn crate::CheckpointStore>) -> Self {
        Self { store }
    }

    /// 查询两个轮次之间的精确 diff。
    pub async fn diff_between(
        &self,
        thread_id: ThreadId,
        from_turn: u32,
        to_turn: u32,
    ) -> crate::Result<Option<String>> {
        self.store.get_diff(thread_id, from_turn, to_turn).await
    }

    /// 累计式 diff：从会话开始到指定 turn 的全部 diff 串联。
    pub async fn cumulative_diff(
        &self,
        thread_id: ThreadId,
        to_turn: u32,
    ) -> crate::Result<String> {
        let blobs = self.store.list_diffs(thread_id).await?;
        let mut out = String::new();
        for blob in blobs {
            if blob.to_turn_count <= to_turn {
                out.push_str(&format!(
                    "# Turn {} -> {}\n",
                    blob.from_turn_count, blob.to_turn_count
                ));
                out.push_str(&blob.diff);
                out.push('\n');
            }
        }
        Ok(out)
    }

    /// 两个任意 turn 之间的合并 diff（如有直接匹配则返回；否则返回两段 diff）。
    pub async fn merged_diff(
        &self,
        thread_id: ThreadId,
        from_turn: u32,
        to_turn: u32,
    ) -> crate::Result<MergedDiff> {
        // 先尝试直接匹配
        if let Some(direct) = self.store.get_diff(thread_id, from_turn, to_turn).await? {
            return Ok(MergedDiff::Direct(direct));
        }
        // 否则拼接：找到 from_turn->mid 和 mid->to_turn
        let blobs = self.store.list_diffs(thread_id).await?;
        let mut path1: Option<String> = None;
        let mut path2: Option<String> = None;
        for blob in &blobs {
            if blob.from_turn_count == from_turn {
                path1 = Some(blob.diff.clone());
            }
            if blob.to_turn_count == to_turn {
                path2 = Some(blob.diff.clone());
            }
        }
        match (path1, path2) {
            (Some(a), Some(b)) => Ok(MergedDiff::Chained { forward: a, backward: b }),
            _ => Ok(MergedDiff::None),
        }
    }
}

/// 合并 diff 结果。
#[derive(Debug, Clone)]
pub enum MergedDiff {
    /// 直接匹配到 from->to 的 diff。
    Direct(String),
    /// 由 from->mid 和 mid->to 两条 diff 串联。
    Chained {
        /// 第一段。
        forward: String,
        /// 第二段。
        backward: String,
    },
    /// 找不到 diff 数据。
    None,
}

#[allow(dead_code)]
fn _silence_unused() {
    let _: Option<Uuid> = None;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_merged_diff_direct() {
        // 仅做类型检查
        let _ = MergedDiff::Direct("+a\n-b\n".to_string());
        let _ = MergedDiff::Chained {
            forward: "+a".to_string(),
            backward: "+b".to_string(),
        };
        let _ = MergedDiff::None;
    }
}
