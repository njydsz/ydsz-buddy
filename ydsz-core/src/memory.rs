//! # Memory 记忆系统
//!
//! 跨会话持久化记忆，为 Agent 提供项目级的上下文延续能力。
//!
//! ## 核心概念
//!
//! - **MemoryEntry**：单条记忆条目（摘要/决策/偏好/教训）
//! - **MemoryStore**：记忆存储 trait（可替换为 SQLite / 向量数据库实现）
//! - **MemoryRecall**：记忆召回——根据当前对话上下文检索相关记忆
//! - **MemoryCompaction**：记忆压缩——将冗长对话浓缩为结构化记忆
//!
//! ## 召回策略
//!
//! 1. 基于项目 ID 检索（同项目记忆优先）
//! 2. 基于关键词/标签匹配
//! 3. 基于时间衰减（越新的记忆权重越高）
//! 4. 基于相关性评分排序（最多返回 N 条）

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

// ============================================================================
// 记忆条目
// ============================================================================

/// 记忆唯一标识
pub type MemoryId = String;

/// 记忆类别
///
/// 标识记忆的类型，用于分类存储和按类型召回。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MemoryCategory {
    /// 项目决策（技术选型、架构决策等）
    Decision,
    /// 用户偏好（编码风格、工具选择等）
    Preference,
    /// 踩坑教训（常见错误、注意事项等）
    Lesson,
    /// 项目上下文（业务逻辑、领域知识等）
    Context,
    /// 操作记录（已完成的重要操作）
    Operation,
    /// 自定义/其他
    Custom,
}

impl MemoryCategory {
    /// 获取所有类别
    pub fn all() -> &'static [MemoryCategory] {
        &[
            MemoryCategory::Decision,
            MemoryCategory::Preference,
            MemoryCategory::Lesson,
            MemoryCategory::Context,
            MemoryCategory::Operation,
            MemoryCategory::Custom,
        ]
    }

    /// 获取类别的显示名称
    pub fn display_name(&self) -> &'static str {
        match self {
            MemoryCategory::Decision => "决策",
            MemoryCategory::Preference => "偏好",
            MemoryCategory::Lesson => "教训",
            MemoryCategory::Context => "上下文",
            MemoryCategory::Operation => "操作",
            MemoryCategory::Custom => "其他",
        }
    }
}

impl std::fmt::Display for MemoryCategory {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            MemoryCategory::Decision => write!(f, "decision"),
            MemoryCategory::Preference => write!(f, "preference"),
            MemoryCategory::Lesson => write!(f, "lesson"),
            MemoryCategory::Context => write!(f, "context"),
            MemoryCategory::Operation => write!(f, "operation"),
            MemoryCategory::Custom => write!(f, "custom"),
        }
    }
}

/// # 记忆条目
///
/// 表示一条结构化的持久记忆，可以是决策、偏好、教训或上下文。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryEntry {
    /// 唯一标识
    pub id: MemoryId,
    /// 所属项目 ID（可选，全局记忆时为 None）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,
    /// 记忆类别
    pub category: MemoryCategory,
    /// 记忆标题（简短摘要）
    pub title: String,
    /// 记忆详细内容
    pub content: String,
    /// 关键词标签（用于召回匹配）
    #[serde(default)]
    pub tags: Vec<String>,
    /// 重要性评分（0.0 - 1.0，越高越重要）
    #[serde(default = "default_importance")]
    pub importance: f64,
    /// 来源（manual / auto_extract / compaction / conversation）
    #[serde(default = "default_source")]
    pub source: String,
    /// 关联的线程 ID（可选）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thread_id: Option<String>,
    /// 召回次数（用于评估记忆价值）
    #[serde(default)]
    pub recall_count: u64,
    /// 创建时间
    pub created_at: DateTime<Utc>,
    /// 最后更新时间
    pub updated_at: DateTime<Utc>,
    /// 最后召回时间
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_recalled_at: Option<DateTime<Utc>>,
    /// 过期时间（可选，到期后降权或隐藏）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<DateTime<Utc>>,
}

fn default_importance() -> f64 {
    0.5
}

fn default_source() -> String {
    "manual".to_string()
}

impl MemoryEntry {
    /// 创建新的记忆条目
    pub fn new(
        category: MemoryCategory,
        title: impl Into<String>,
        content: impl Into<String>,
    ) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4().to_string(),
            project_id: None,
            category,
            title: title.into(),
            content: content.into(),
            tags: Vec::new(),
            importance: default_importance(),
            source: default_source(),
            thread_id: None,
            recall_count: 0,
            created_at: now,
            updated_at: now,
            last_recalled_at: None,
            expires_at: None,
        }
    }

    /// 设置项目 ID
    pub fn with_project(mut self, project_id: impl Into<String>) -> Self {
        self.project_id = Some(project_id.into());
        self
    }

    /// 设置标签
    pub fn with_tags(mut self, tags: Vec<String>) -> Self {
        self.tags = tags;
        self
    }

    /// 设置重要性
    pub fn with_importance(mut self, importance: f64) -> Self {
        self.importance = importance.clamp(0.0, 1.0);
        self
    }

    /// 设置来源
    pub fn with_source(mut self, source: impl Into<String>) -> Self {
        self.source = source.into();
        self
    }

    /// 设置关联线程
    pub fn with_thread(mut self, thread_id: impl Into<String>) -> Self {
        self.thread_id = Some(thread_id.into());
        self
    }

    /// 设置过期时间
    pub fn with_expires_at(mut self, expires_at: DateTime<Utc>) -> Self {
        self.expires_at = Some(expires_at);
        self
    }

    /// 标记为已召回
    pub fn mark_recalled(&mut self) {
        self.recall_count += 1;
        self.last_recalled_at = Some(Utc::now());
    }

    /// 是否已过期
    pub fn is_expired(&self) -> bool {
        match self.expires_at {
            Some(expiry) => Utc::now() > expiry,
            None => false,
        }
    }

    /// 是否与指定项目相关
    pub fn belongs_to_project(&self, project_id: &str) -> bool {
        self.project_id.as_deref() == Some(project_id)
    }
}

// ============================================================================
// 记忆存储 trait
// ============================================================================

/// # 记忆召回查询参数
#[derive(Debug, Clone, Default)]
pub struct MemoryRecallQuery {
    /// 项目 ID（优先召回同项目记忆）
    pub project_id: Option<String>,
    /// 关键词模糊匹配
    pub keyword: Option<String>,
    /// 按类别筛选
    pub categories: Vec<MemoryCategory>,
    /// 最少重要性阈值
    pub min_importance: f64,
    /// 最大返回数量
    pub limit: usize,
    /// 是否包含已过期的记忆
    pub include_expired: bool,
}

impl MemoryRecallQuery {
    /// 创建默认查询（限制 10 条，重要性 >= 0.3）
    pub fn default() -> Self {
        Self {
            project_id: None,
            keyword: None,
            categories: Vec::new(),
            min_importance: 0.3,
            limit: 10,
            include_expired: false,
        }
    }

    /// 设置项目 ID
    pub fn for_project(mut self, project_id: impl Into<String>) -> Self {
        self.project_id = Some(project_id.into());
        self
    }

    /// 设置关键词
    pub fn with_keyword(mut self, keyword: impl Into<String>) -> Self {
        self.keyword = Some(keyword.into());
        self
    }

    /// 设置类别
    pub fn with_categories(mut self, categories: Vec<MemoryCategory>) -> Self {
        self.categories = categories;
        self
    }

    /// 设置数量限制
    pub fn with_limit(mut self, limit: usize) -> Self {
        self.limit = limit;
        self
    }
}

/// # 记忆召回结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryRecallResult {
    /// 匹配的记忆条目
    pub entries: Vec<MemoryEntry>,
    /// 总匹配数（不考虑 limit）
    pub total_matched: usize,
    /// 查询参数回显
    pub query_summary: String,
}

impl MemoryRecallResult {
    /// 将召回结果格式化为可注入 System Prompt 的文本
    pub fn to_prompt_context(&self) -> String {
        if self.entries.is_empty() {
            return String::new();
        }

        let mut parts = vec!["## 📝 项目记忆（自动召回）".to_string()];

        // 按类别分组
        let mut grouped: HashMap<String, Vec<&MemoryEntry>> = HashMap::new();
        for entry in &self.entries {
            let key = entry.category.to_string();
            grouped.entry(key).or_default().push(entry);
        }

        for (_category, entries) in grouped {
            let cat_name = entries
                .first()
                .map(|e| e.category.display_name())
                .unwrap_or("其他");
            parts.push(format!("\n### {}", cat_name));
            for entry in entries {
                parts.push(format!(
                    "- [{}] {}",
                    entry.title, entry.content
                ));
                if !entry.tags.is_empty() {
                    parts.push(format!("  标签: {}", entry.tags.join(", ")));
                }
            }
        }

        parts.join("\n")
    }
}

/// # 记忆存储 trait
///
/// 定义记忆的持久化接口。允许不同的后端实现（SQLite、向量数据库等）。
#[async_trait::async_trait]
pub trait MemoryStore: Send + Sync {
    /// 存储新的记忆条目
    async fn store(&self, entry: &MemoryEntry) -> crate::error::CoreResult<()>;

    /// 根据 ID 获取记忆
    async fn get(&self, id: &str) -> crate::error::CoreResult<Option<MemoryEntry>>;

    /// 更新记忆条目
    async fn update(&self, entry: &MemoryEntry) -> crate::error::CoreResult<()>;

    /// 删除记忆条目
    async fn delete(&self, id: &str) -> crate::error::CoreResult<()>;

    /// 召回相关记忆
    async fn recall(&self, query: &MemoryRecallQuery) -> crate::error::CoreResult<MemoryRecallResult>;

    /// 列出项目相关的所有记忆
    async fn list_by_project(
        &self,
        project_id: &str,
        limit: usize,
    ) -> crate::error::CoreResult<Vec<MemoryEntry>>;

    /// 获取记忆总数
    async fn count(&self) -> crate::error::CoreResult<u64>;

    /// 清除过期记忆
    async fn purge_expired(&self) -> crate::error::CoreResult<u64>;
}

// ============================================================================
// 记忆服务（高层 API）
// ============================================================================

/// # 记忆服务
///
/// 封装记忆存储，提供高级操作（自动标签提取、重要性评估、压缩等）。
pub struct MemoryService<S: MemoryStore> {
    store: S,
}

impl<S: MemoryStore> MemoryService<S> {
    /// 创建新的记忆服务
    pub fn new(store: S) -> Self {
        Self { store }
    }

    /// 获取存储引用
    pub fn store(&self) -> &S {
        &self.store
    }

    /// 添加记忆（创建 + 存储）
    pub async fn add_memory(
        &self,
        category: MemoryCategory,
        title: impl Into<String>,
        content: impl Into<String>,
        project_id: Option<impl Into<String>>,
    ) -> crate::error::CoreResult<MemoryEntry> {
        let mut entry = MemoryEntry::new(category, title, content);
        if let Some(pid) = project_id {
            entry = entry.with_project(pid.into());
        }
        self.store.store(&entry).await?;
        Ok(entry)
    }

    /// 召回项目相关记忆并格式化为 Prompt 文本
    pub async fn recall_for_prompt(
        &self,
        project_id: Option<&str>,
        keyword: Option<&str>,
        limit: usize,
    ) -> crate::error::CoreResult<String> {
        let mut query = MemoryRecallQuery::default().with_limit(limit);
        if let Some(pid) = project_id {
            query = query.for_project(pid);
        }
        if let Some(kw) = keyword {
            query = query.with_keyword(kw);
        }

        let result = self.store.recall(&query).await?;
        Ok(result.to_prompt_context())
    }

    /// 标记记忆为已召回
    pub async fn mark_recalled(&self, id: &str) -> crate::error::CoreResult<()> {
        if let Some(mut entry) = self.store.get(id).await? {
            entry.mark_recalled();
            self.store.update(&entry).await?;
        }
        Ok(())
    }

    /// 清理过期记忆
    pub async fn cleanup(&self) -> crate::error::CoreResult<u64> {
        self.store.purge_expired().await
    }
}

// ============================================================================
// 便捷导出
// ============================================================================

/// 创建记忆条目（便捷函数）
pub fn memory(
    category: MemoryCategory,
    title: impl Into<String>,
    content: impl Into<String>,
) -> MemoryEntry {
    MemoryEntry::new(category, title, content)
}
