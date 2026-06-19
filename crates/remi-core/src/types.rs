//! Core types used across Remi Code.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Unique identifier for threads.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct ThreadId(pub Uuid);

impl ThreadId {
    /// Create a new random thread ID.
    pub fn new() -> Self {
        Self(Uuid::new_v4())
    }

    /// Construct a thread ID from a UUID.
    pub fn from_uuid(uuid: Uuid) -> Self {
        Self(uuid)
    }

    /// Construct a nil thread ID (used for placeholder values).
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

/// Unique identifier for projects.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct ProjectId(pub Uuid);

impl ProjectId {
    /// Create a new random project ID.
    pub fn new() -> Self {
        Self(Uuid::new_v4())
    }

    /// Construct a nil project ID.
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

/// Unique identifier for turns within a thread.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct TurnId(pub Uuid);

impl TurnId {
    /// Create a new random turn ID.
    pub fn new() -> Self {
        Self(Uuid::new_v4())
    }

    /// Construct a nil turn ID.
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

/// Unique identifier for messages within a thread.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct MessageId(pub Uuid);

impl MessageId {
    /// Create a new random message ID.
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

/// Unique identifier for terminal sessions.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct TerminalId(pub Uuid);

impl TerminalId {
    /// Create a new random terminal session ID.
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

/// Unique identifier for worktrees.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct WorktreeId(pub Uuid);

impl WorktreeId {
    /// Create a new random worktree ID.
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

/// Unique identifier for provider sessions.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct ProviderSessionId(pub Uuid);

impl ProviderSessionId {
    /// Create a new random provider session ID.
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

/// Timestamp type alias.
pub type Timestamp = DateTime<Utc>;

/// Get the current UTC timestamp.
pub fn now() -> Timestamp {
    Utc::now()
}

/// Get the current UTC timestamp as an RFC 3339 string.
pub fn now_string() -> String {
    Utc::now().to_rfc3339()
}

/// Pagination request, used in many list RPCs.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PageRequest {
    /// Offset into the result set.
    pub offset: usize,
    /// Maximum number of items to return.
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

/// Paginated result envelope.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Page<T> {
    /// Items in this page.
    pub items: Vec<T>,
    /// Total number of items available.
    pub total: usize,
    /// Offset of this page.
    pub offset: usize,
    /// Limit used to compute this page.
    pub limit: usize,
    /// Whether more items exist beyond this page.
    pub has_more: bool,
}

impl<T> Page<T> {
    /// Build a page from a slice of items.
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
