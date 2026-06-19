//! `remi-core` 基础类型定义
//!
//! 集中管理跨模块复用的 ID 类型与基础数据结构：
//! - 强类型 ID：避免在业务代码中使用裸 [`Uuid`]，强化类型安全。
//! - 分页模型：用于多个列表 RPC 接口统一返回 [`Page<T>`]。
//! - 时间戳工具：统一使用 UTC，避免时区混乱。
//!
//! 大厂实践要点：
//! - 每个 ID 都是 tuple struct，包装 [`Uuid`]，对外通过 `Display` 输出字符串。
//! - 全部 ID 实现 `new() -> Self`、`Default`、`From<Uuid>`，便于在多种上下文中使用。
//! - 业务模块应"按需引入"，不要在 `lib.rs` 之外手动 `Uuid::new_v4()`。

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// 线程（会话）唯一标识符
///
/// 代表一次完整的对话（用户与 AI），可能包含多个 [`TurnId`]。
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

    /// 构造空线程 ID（用于占位符，如数据库默认值）
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

/// 项目（工作目录）唯一标识符
///
/// 对应一个被纳入 Remi Code 管理的本地代码仓库或工作区。
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

/// 线程内单个轮次的唯一标识符
///
/// 一个轮次 = 用户发送一条消息 + AI 的完整回复（含工具调用）。
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

/// 线程内单条消息（用户/AI/工具）的唯一标识符
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
///
/// 对应 [`remi_pty`] 中托管的一个 PTY 进程，用于在 UI 中跟踪用户的多终端交互。
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

/// Git 工作树（worktree）唯一标识符
///
/// 用于在多分支并行任务中区分不同工作树。
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

/// 提供商会话（上游 AI）唯一标识符
///
/// 用于跟踪与第三方 AI 服务（Claude、Codex 等）的会话生命周期。
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

/// 时间戳类型别名，统一使用 UTC
pub type Timestamp = DateTime<Utc>;

/// 获取当前 UTC 时间戳
pub fn now() -> Timestamp {
    Utc::now()
}

/// 获取当前 UTC 时间戳的 RFC 3339 字符串格式
///
/// 适合直接存入数据库 `TEXT` 列或在 JSON 中序列化。
pub fn now_string() -> String {
    Utc::now().to_rfc3339()
}

/// 分页请求，用于多个列表 RPC 接口
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PageRequest {
    /// 结果集的偏移量（从 0 开始）
    pub offset: usize,
    /// 返回的最大条目数
    pub limit: usize,
}

impl Default for PageRequest {
    fn default() -> Self {
        Self {
            offset: 0,
            // 默认每页 50 条，平衡网络流量与 UI 渲染
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
    ///
    /// 该函数会安全处理越界情况：
    /// - 当 `offset >= total` 时返回空切片，但 `total` 等元信息仍然保留。
    /// - `has_more` 字段由 `(offset + limit) < total` 计算得出。
    ///
    /// 要求 `T: Clone`，方便在大数据场景下避免重复查询。
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

    /// 两次随机生成的 [`ThreadId`] 不应相等
    #[test]
    fn test_thread_id() {
        let id1 = ThreadId::new();
        let id2 = ThreadId::new();
        assert_ne!(id1, id2);
    }

    /// [`ProjectId`] 的字符串表示不应为空
    #[test]
    fn test_project_id() {
        let id = ProjectId::new();
        assert!(!id.to_string().is_empty());
    }

    /// 中间页应当返回正确数量的元素并标记有更多
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

    /// 最后一页应正确标记 `has_more = false`
    #[test]
    fn test_page_from_slice_last_page() {
        let items: Vec<i32> = (0..100).collect();
        let page = Page::from_slice(&items, 90, 20, 100);
        assert_eq!(page.items.len(), 10);
        assert!(!page.has_more);
    }
}
