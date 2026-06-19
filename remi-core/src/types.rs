//! Remi Code 核心类型定义

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// 线程唯一标识符
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct ThreadId(pub Uuid);

impl ThreadId {
    /// 创建新的随机线程 ID
    pub fn new() -> Self {
        Self(Uuid::new_v4())
    }

    /// 从 UUID 构造线程 ID
    pub fn from_uuid(uuid: Uuid) -> Self {
        Self(uuid)
    }

    /// 构造空线程 ID（用于占位符）
    pub fn nil() -> Self {
        Self(Uuid::nil())
    }
}

impl Default for ThreadId {
    fn default() -> Self {
        Self::new()
    }
}

impl std::fmt::Display for ThreadId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        self.0.fmt(f)
    }
}

impl From<Uuid> for ThreadId {
    fn from(uuid: Uuid) -> Self {
        Self(uuid)
    }
}

/// 项目唯一标识符
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct ProjectId(pub Uuid);

impl ProjectId {
    /// 创建新的随机项目 ID
    pub fn new() -> Self {
        Self(Uuid::new_v4())
    }

    /// 构造空项目 ID
    pub fn nil() -> Self {
        Self(Uuid::nil())
    }
}

impl Default for ProjectId {
    fn default() -> Self {
        Self::new()
    }
}

impl std::fmt::Display for ProjectId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        self.0.fmt(f)
    }
}

impl From<Uuid> for ProjectId {
    fn from(uuid: Uuid) -> Self {
        Self(uuid)
    }
}

/// 线程内轮次的唯一标识符
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct TurnId(pub Uuid);

impl TurnId {
    /// 创建新的随机轮次 ID
    pub fn new() -> Self {
        Self(Uuid::new_v4())
    }

    /// 构造空轮次 ID
    pub fn nil() -> Self {
        Self(Uuid::nil())
    }
}

impl Default for TurnId {
    fn default() -> Self {
        Self::new()
    }
}

impl std::fmt::Display for TurnId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        self.0.fmt(f)
    }
}

/// 线程内消息的唯一标识符
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct MessageId(pub Uuid);

impl MessageId {
    /// 创建新的随机消息 ID
    pub fn new() -> Self {
        Self(Uuid::new_v4())
    }
}

impl Default for MessageId {
    fn default() -> Self {
        Self::new()
    }
}

impl std::fmt::Display for MessageId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        self.0.fmt(f)
    }
}

/// 终端会话唯一标识符
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct TerminalId(pub Uuid);

impl TerminalId {
    /// 创建新的随机终端会话 ID
    pub fn new() -> Self {
        Self(Uuid::new_v4())
    }
}

impl Default for TerminalId {
    fn default() -> Self {
        Self::new()
    }
}

impl std::fmt::Display for TerminalId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        self.0.fmt(f)
    }
}

/// 工作树唯一标识符
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct WorktreeId(pub Uuid);

impl WorktreeId {
    /// 创建新的随机工作树 ID
    pub fn new() -> Self {
        Self(Uuid::new_v4())
    }
}

impl Default for WorktreeId {
    fn default() -> Self {
        Self::new()
    }
}

impl std::fmt::Display for WorktreeId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        self.0.fmt(f)
    }
}

/// 提供商会话唯一标识符
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct ProviderSessionId(pub Uuid);

impl ProviderSessionId {
    /// 创建新的随机提供商会话 ID
    pub fn new() -> Self {
        Self(Uuid::new_v4())
    }
}

impl Default for ProviderSessionId {
    fn default() -> Self {
        Self::new()
    }
}

impl std::fmt::Display for ProviderSessionId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        self.0.fmt(f)
    }
}

/// 时间戳类型别名
pub type Timestamp = DateTime<Utc>;

/// 获取当前 UTC 时间戳
pub fn now() -> Timestamp {
    Utc::now()
}

/// 获取当前 UTC 时间戳的 RFC 3339 字符串格式
pub fn now_string() -> String {
    Utc::now().to_rfc3339()
}

/// 分页请求，用于多个列表 RPC 接口
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PageRequest {
    /// 结果集的偏移量
    pub offset: usize,
    /// 返回的最大条目数
    pub limit: usize,
}

impl Default for PageRequest {
    fn default() -> Self {
        Self {
            offset: 0,
            limit: 50,
        }
    }
}

/// 分页结果封装
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Page<T> {
    /// 当前页的条目
    pub items: Vec<T>,
    /// 可用条目总数
    pub total: usize,
    /// 当前页的偏移量
    pub offset: usize,
    /// 用于计算当前页的限制值
    pub limit: usize,
    /// 是否还有更多条目
    pub has_more: bool,
}

impl<T> Page<T> {
    /// 从条目切片构建分页结果
    pub fn from_slice(items: &[T], offset: usize, limit: usize, total: usize) -> Self
    where
        T: Clone,
    {
        let end = (offset + limit).min(total);
        let has_more = end < total;
        let slice = if offset >= total {
            Vec::new()
        } else {
            items[offset..end].to_vec()
        };
        Self {
            items: slice,
            total,
            offset,
            limit,
            has_more,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_thread_id() {
        let id1 = ThreadId::new();
        let id2 = ThreadId::new();
        assert_ne!(id1, id2);
    }

    #[test]
    fn test_project_id() {
        let id = ProjectId::new();
        assert!(!id.to_string().is_empty());
    }

    #[test]
    fn test_page_from_slice() {
        let items: Vec<i32> = (0..100).collect();
        let page = Page::from_slice(&items, 10, 20, 100);
        assert_eq!(page.items.len(), 20);
        assert_eq!(page.items[0], 10);
        assert_eq!(page.items[19], 29);
        assert!(page.has_more);
        assert_eq!(page.total, 100);
    }

    #[test]
    fn test_page_from_slice_last_page() {
        let items: Vec<i32> = (0..100).collect();
        let page = Page::from_slice(&items, 90, 20, 100);
        assert_eq!(page.items.len(), 10);
        assert!(!page.has_more);
    }
}
