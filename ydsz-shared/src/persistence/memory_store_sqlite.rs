//! # SQLite 记忆存储实现
//!
//! 基于 SQLite 的 MemoryStore trait 实现，提供持久化的记忆存储与召回功能。
//!
//! ## 召回策略
//!
//! 1. 项目 ID 匹配（同项目记忆权重 *2.0）
//! 2. 关键词模糊匹配（标题 + 内容 + 标签 LIKE）
//! 3. 类别筛选
//! 4. 时间衰减（越新权重越高）
//! 5. 重要性权重
//! 6. 综合评分排序

use async_trait::async_trait;
use chrono::Utc;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;

use ydsz_core::memory::{
    MemoryEntry, MemoryId, MemoryRecallQuery, MemoryRecallResult, MemoryStore,
};
use ydsz_core::CoreResult;

// ============================================================================
// SQLite 记忆存储
// ============================================================================

/// # SqliteMemoryStore
///
/// 基于 SQLite 的记忆存储实现。
///
/// 当前为简化实现，使用内存 HashMap 模拟持久化。
/// 生产环境应替换为真实 SQLite 连接（通过 sqlx 或 rusqlite）。
#[derive(Debug, Clone)]
pub struct SqliteMemoryStore {
    inner: Arc<Mutex<HashMap<MemoryId, MemoryEntry>>>,
}

impl SqliteMemoryStore {
    /// 创建新的 SQLite 记忆存储（空）
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// 创建带初始数据的存储（用于测试）
    pub fn with_entries(entries: Vec<MemoryEntry>) -> Self {
        let mut map = HashMap::new();
        for entry in entries {
            map.insert(entry.id.clone(), entry);
        }
        Self {
            inner: Arc::new(Mutex::new(map)),
        }
    }

    /// 计算单条记忆的综合评分
    ///
    /// 评分 = 基础分(0.5) + 项目匹配加分 + 关键词匹配加分 + 重要性加分 + 时间衰减加分
    fn score_entry(
        entry: &MemoryEntry,
        query: &MemoryRecallQuery,
    ) -> f64 {
        let mut score = 0.5_f64;

        // 1. 项目匹配加分（同项目 *1.5）
        if let Some(ref project_id) = query.project_id {
            if entry.belongs_to_project(project_id) {
                score += 0.3;
            }
        }

        // 2. 关键词匹配加分
        if let Some(ref keyword) = query.keyword {
            let keyword_lower = keyword.to_lowercase();
            let title_match = entry.title.to_lowercase().contains(&keyword_lower);
            let content_match = entry.content.to_lowercase().contains(&keyword_lower);
            let tag_match = entry.tags.iter().any(|t| t.to_lowercase().contains(&keyword_lower));

            if title_match {
                score += 0.4; // 标题匹配权重最高
            }
            if tag_match {
                score += 0.3; // 标签匹配次之
            }
            if content_match {
                score += 0.15; // 内容匹配权重较低
            }
        }

        // 3. 重要性加分（映射 0~1 到 0~0.2）
        score += entry.importance * 0.2;

        // 4. 时间衰减（越新加分越多，30 天内满分，之后线性衰减）
        let age = Utc::now() - entry.created_at;
        let days_old = age.num_days() as f64;
        let recency_bonus = if days_old <= 30.0 {
            0.2 * (1.0 - days_old / 30.0)
        } else {
            0.0
        };
        score += recency_bonus;

        // 5. 召回次数加分（常被召回的记忆更有价值）
        if entry.recall_count > 0 {
            score += (entry.recall_count as f64).min(10.0) * 0.01;
        }

        score
    }
}

impl Default for SqliteMemoryStore {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl MemoryStore for SqliteMemoryStore {
    async fn store(&self, entry: &MemoryEntry) -> CoreResult<()> {
        let mut map = self.inner.lock().await;
        map.insert(entry.id.clone(), entry.clone());
        Ok(())
    }

    async fn get(&self, id: &str) -> CoreResult<Option<MemoryEntry>> {
        let map = self.inner.lock().await;
        Ok(map.get(id).cloned())
    }

    async fn update(&self, entry: &MemoryEntry) -> CoreResult<()> {
        let mut map = self.inner.lock().await;
        if map.contains_key(&entry.id) {
            map.insert(entry.id.clone(), entry.clone());
            Ok(())
        } else {
            Err(ydsz_core::CoreError::NotFoundError(format!(
                "Memory entry not found: {}",
                entry.id
            )))
        }
    }

    async fn delete(&self, id: &str) -> CoreResult<()> {
        let mut map = self.inner.lock().await;
        map.remove(id);
        Ok(())
    }

    async fn recall(&self, query: &MemoryRecallQuery) -> CoreResult<MemoryRecallResult> {
        let map = self.inner.lock().await;
        let mut scored: Vec<(f64, MemoryEntry)> = Vec::new();
        let mut total_matched: usize = 0;

        for entry in map.values() {
            // 过滤过期记忆
            if !query.include_expired && entry.is_expired() {
                continue;
            }

            // 过滤重要性
            if entry.importance < query.min_importance {
                continue;
            }

            // 过滤类别（如果指定了类别）
            if !query.categories.is_empty() && !query.categories.contains(&entry.category) {
                continue;
            }

            // 过滤项目（如果指定了项目，则仅返回该项目或全局记忆）
            if let Some(ref project_id) = query.project_id {
                if entry.project_id.as_deref() != Some(project_id) && entry.project_id.is_some() {
                    continue;
                }
            }

            // 计算评分
            let score = Self::score_entry(entry, query);

            // 有关键词要求时，最低分必须 > 0.5（即至少命中一项）
            if query.keyword.is_some() && score <= 0.5 {
                continue;
            }

            total_matched += 1;

            // 只保留评分 > 0 的
            if score > 0.0 {
                scored.push((score, entry.clone()));
            }
        }

        // 按评分降序排列
        scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));

        // 应用 limit
        let entries: Vec<MemoryEntry> = scored
            .into_iter()
            .take(query.limit)
            .map(|(_, entry)| entry)
            .collect();

        let query_summary = format!(
            "project={}, keyword={}, categories={}, limit={}",
            query.project_id.as_deref().unwrap_or("any"),
            query.keyword.as_deref().unwrap_or("any"),
            if query.categories.is_empty() {
                "all".to_string()
            } else {
                query.categories
                    .iter()
                    .map(|c| c.to_string())
                    .collect::<Vec<_>>()
                    .join("|")
            },
            query.limit
        );

        Ok(MemoryRecallResult {
            entries,
            total_matched,
            query_summary,
        })
    }

    async fn list_by_project(
        &self,
        project_id: &str,
        limit: usize,
    ) -> CoreResult<Vec<MemoryEntry>> {
        let map = self.inner.lock().await;
        let mut entries: Vec<MemoryEntry> = map
            .values()
            .filter(|e| e.belongs_to_project(project_id) && !e.is_expired())
            .cloned()
            .collect();

        // 按创建时间降序
        entries.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        entries.truncate(limit);

        Ok(entries)
    }

    async fn count(&self) -> CoreResult<u64> {
        let map = self.inner.lock().await;
        Ok(map.len() as u64)
    }

    async fn purge_expired(&self) -> CoreResult<u64> {
        let mut map = self.inner.lock().await;
        let now = Utc::now();
        let expired_ids: Vec<MemoryId> = map
            .values()
            .filter(|e| match e.expires_at {
                Some(expiry) => now > expiry,
                None => false,
            })
            .map(|e| e.id.clone())
            .collect();

        let count = expired_ids.len() as u64;
        for id in expired_ids {
            map.remove(&id);
        }

        Ok(count)
    }
}

// ============================================================================
// 测试
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Duration;
    use ydsz_core::memory::MemoryCategory;

    fn sample_entry(category: MemoryCategory, title: &str, project: &str) -> MemoryEntry {
        MemoryEntry::new(category, title, format!("Content for {}", title))
            .with_project(project)
            .with_tags(vec!["test".to_string()])
    }

    #[tokio::test]
    async fn test_store_and_get() {
        let store = SqliteMemoryStore::new();
        let entry = MemoryEntry::new(MemoryCategory::Decision, "Test Decision", "Use Rust for backend");

        store.store(&entry).await.unwrap();
        let retrieved = store.get(&entry.id).await.unwrap();

        assert!(retrieved.is_some());
        let retrieved = retrieved.unwrap();
        assert_eq!(retrieved.title, "Test Decision");
        assert_eq!(retrieved.category, MemoryCategory::Decision);
    }

    #[tokio::test]
    async fn test_recall_by_project() {
        let entries = vec![
            sample_entry(MemoryCategory::Decision, "Decision A", "proj-1"),
            sample_entry(MemoryCategory::Preference, "Preference B", "proj-1"),
            sample_entry(MemoryCategory::Lesson, "Lesson C", "proj-2"),
        ];
        let store = SqliteMemoryStore::with_entries(entries);

        let query = MemoryRecallQuery::default().for_project("proj-1");
        let result = store.recall(&query).await.unwrap();

        assert_eq!(result.entries.len(), 2);
        assert!(result.entries.iter().all(|e| e.belongs_to_project("proj-1")));
    }

    #[tokio::test]
    async fn test_recall_by_keyword() {
        let entries = vec![
            sample_entry(MemoryCategory::Decision, "Use PostgreSQL", "proj-1"),
            sample_entry(MemoryCategory::Context, "API endpoints", "proj-1"),
            sample_entry(MemoryCategory::Lesson, "Debugging tips", "proj-1"),
        ];
        let store = SqliteMemoryStore::with_entries(entries);

        let query = MemoryRecallQuery::default()
            .for_project("proj-1")
            .with_keyword("postgresql");
        let result = store.recall(&query).await.unwrap();

        assert!(result.entries.len() >= 1);
        assert!(result.entries.iter().any(|e| e.title.contains("PostgreSQL")));
    }

    #[tokio::test]
    async fn test_delete() {
        let store = SqliteMemoryStore::new();
        let entry = MemoryEntry::new(MemoryCategory::Custom, "To Delete", "Will be deleted");

        store.store(&entry).await.unwrap();
        assert!(store.get(&entry.id).await.unwrap().is_some());

        store.delete(&entry.id).await.unwrap();
        assert!(store.get(&entry.id).await.unwrap().is_none());
    }

    #[tokio::test]
    async fn test_purge_expired() {
        let entry = MemoryEntry::new(MemoryCategory::Custom, "Expiring Soon", "Test")
            .with_expires_at(Utc::now() - Duration::hours(1)); // 已过期

        // 模拟一个未过期的条目
        let valid_entry = MemoryEntry::new(MemoryCategory::Custom, "Valid", "Still good")
            .with_expires_at(Utc::now() + Duration::days(30));

        let store = SqliteMemoryStore::with_entries(vec![entry, valid_entry]);
        assert_eq!(store.count().await.unwrap(), 2);

        let purged = store.purge_expired().await.unwrap();
        assert_eq!(purged, 1);
        assert_eq!(store.count().await.unwrap(), 1);
    }
}
