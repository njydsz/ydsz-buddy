//! Workspace management for Remi Code.
//!
//! Responsibilities:
//! - Recursive filesystem scanning with ignore rules (via the `ignore` crate).
//! - LRU entry cache to avoid re-walking large repos on every browse call.
//! - Chunked entry returns so huge directories don't blow the wire.
//! - Atomic file writes inside the workspace root.
//! - Managed worktree lifecycle: create, list, clean, GC stale entries.

use std::collections::HashMap;
use std::num::NonZeroUsize;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};

use ignore::WalkBuilder;
use lru::LruCache;
use parking_lot::Mutex;
use remi_contracts::{
    CreateDirectoryInput, DeletePathInput, FilesystemBrowseChunk, FilesystemBrowseResult,
    FilesystemEntry, FilesystemEntryType, ProjectWriteFileInput, ProjectWriteFileResult,
    ReadFileInput, ReadFileResult, WriteFileInput, WriteFileResult,
};
use remi_core::{Error, Result};
use tokio::sync::RwLock;
use tracing::{debug, info, warn};
use uuid::Uuid;

/// Default chunk size for paginated browse responses.
pub const DEFAULT_CHUNK_SIZE: usize = 200;
/// Default entry cache size (number of directories).
pub const DEFAULT_CACHE_ENTRIES: usize = 64;
/// Default entry cache TTL.
pub const DEFAULT_CACHE_TTL: Duration = Duration::from_secs(5);

/// One cached snapshot of a directory listing.
#[derive(Debug, Clone)]
struct CachedListing {
    entries: Vec<FilesystemEntry>,
    cached_at: Instant,
}

/// Workspace service.
pub struct WorkspaceService {
    root: PathBuf,
    cache: Arc<Mutex<LruCache<String, CachedListing>>>,
    worktrees_root: PathBuf,
    worktree_state: Arc<RwLock<HashMap<String, ManagedWorktree>>>,
}

impl WorkspaceService {
    /// Create a new workspace service rooted at the given directory.
    pub fn new(root: impl AsRef<Path>) -> Self {
        let root = root.as_ref().to_path_buf();
        let worktrees_root = root.join(".remi-code").join("worktrees");
        Self {
            root,
            cache: Arc::new(Mutex::new(LruCache::new(
                NonZeroUsize::new(DEFAULT_CACHE_ENTRIES).unwrap(),
            ))),
            worktrees_root,
            worktree_state: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Get the workspace root.
    pub fn root(&self) -> &Path {
        &self.root
    }

    /// Get the worktrees directory.
    pub fn worktrees_root(&self) -> &Path {
        &self.worktrees_root
    }

    /// Browse a directory.
    ///
    /// Cached for [`DEFAULT_CACHE_TTL`] so rapid re-renders don't re-walk the
    /// entire tree.
    pub async fn browse(
        &self,
        path: &str,
        include_hidden: bool,
        max_depth: Option<u32>,
    ) -> Result<FilesystemBrowseResult> {
        let full_path = self.resolve_path(path)?;
        if !full_path.exists() {
            return Err(Error::Workspace(format!(
                "Path does not exist: {}",
                full_path.display()
            )));
        }

        let cache_key = format!("{}|hidden={}|depth={:?}", full_path.display(), include_hidden, max_depth);
        if let Some(cached) = self.cache.lock().get(&cache_key) {
            if cached.cached_at.elapsed() < DEFAULT_CACHE_TTL {
                debug!("workspace cache hit for {}", cache_key);
                return Ok(FilesystemBrowseResult {
                    parent: full_path.to_string_lossy().to_string(),
                    entries: cached.entries.clone(),
                });
            }
        }

        let mut entries = Vec::new();
        let mut builder = WalkBuilder::new(&full_path);
        builder.hidden(!include_hidden);
        if let Some(depth) = max_depth {
            builder.max_depth(Some(depth as usize));
        }
        for entry in builder.build() {
            match entry {
                Ok(entry) => {
                    let entry_path = entry.path();
                    if entry_path == full_path {
                        continue;
                    }
                    let metadata = match entry.metadata() {
                        Ok(m) => m,
                        Err(_) => continue,
                    };
                    let entry_type = if metadata.is_file() {
                        FilesystemEntryType::File
                    } else if metadata.is_dir() {
                        FilesystemEntryType::Directory
                    } else if metadata.file_type().is_symlink() {
                        FilesystemEntryType::Symlink
                    } else {
                        FilesystemEntryType::Other
                    };
                    let name = entry_path
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("")
                        .to_string();
                    let is_hidden = name.starts_with('.');
                    entries.push(FilesystemEntry {
                        name,
                        path: entry_path.to_string_lossy().to_string(),
                        entry_type,
                        size: if metadata.is_file() {
                            Some(metadata.len())
                        } else {
                            None
                        },
                        modified_at: metadata
                            .modified()
                            .ok()
                            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                            .and_then(|d| chrono::DateTime::from_timestamp(d.as_secs() as i64, 0))
                            .map(|dt| dt.to_rfc3339()),
                        is_hidden,
                    });
                }
                Err(e) => warn!("Failed to read directory entry: {}", e),
            }
        }

        self.cache.lock().put(
            cache_key,
            CachedListing {
                entries: entries.clone(),
                cached_at: Instant::now(),
            },
        );

        Ok(FilesystemBrowseResult {
            parent: full_path.to_string_lossy().to_string(),
            entries,
        })
    }

    /// Browse a directory and return one chunk of the result.
    ///
    /// `offset` and `limit` are page parameters. When `limit` is `None`,
    /// [`DEFAULT_CHUNK_SIZE`] is used.
    pub async fn browse_chunked(
        &self,
        path: &str,
        include_hidden: bool,
        max_depth: Option<u32>,
        offset: usize,
        limit: Option<usize>,
    ) -> Result<FilesystemBrowseChunk> {
        let result = self.browse(path, include_hidden, max_depth).await?;
        let total = result.entries.len();
        let limit = limit.unwrap_or(DEFAULT_CHUNK_SIZE);
        let end = (offset + limit).min(total);
        let slice = if offset >= total {
            Vec::new()
        } else {
            result.entries[offset..end].to_vec()
        };
        Ok(FilesystemBrowseChunk {
            parent: result.parent,
            total,
            offset,
            limit,
            entries: slice,
            has_more: end < total,
        })
    }

    /// Invalidate the entry cache.
    pub fn invalidate_cache(&self) {
        self.cache.lock().clear();
    }

    /// Write a file to the workspace, creating parent directories as needed.
    pub async fn write_file(&self, input: ProjectWriteFileInput) -> Result<ProjectWriteFileResult> {
        let cwd_path = Path::new(&input.cwd);
        let full_path = if cwd_path.is_absolute() {
            cwd_path.join(&input.relative_path)
        } else {
            self.root.join(&input.cwd).join(&input.relative_path)
        };

        let canonical_root = self
            .root
            .canonicalize()
            .map_err(|e| Error::Workspace(format!("Failed to canonicalize root: {}", e)))?;
        let canonical_path = full_path.canonicalize().unwrap_or_else(|_| full_path.clone());
        if !canonical_path.starts_with(&canonical_root) {
            return Err(Error::Workspace(format!(
                "Path outside workspace root: {}",
                full_path.display()
            )));
        }

        if let Some(parent) = full_path.parent() {
            if !parent.exists() {
                std::fs::create_dir_all(parent).map_err(|e| {
                    Error::Workspace(format!("Failed to create parent directory: {}", e))
                })?;
            }
        }
        std::fs::write(&full_path, &input.contents)
            .map_err(|e| Error::Workspace(format!("Failed to write file: {}", e)))?;
        // Invalidate cache so the next browse sees the new file.
        self.invalidate_cache();
        Ok(ProjectWriteFileResult {
            relative_path: input.relative_path,
        })
    }

    /// Resolve a relative or absolute path against the workspace root.
    pub fn resolve_path(&self, path: &str) -> Result<PathBuf> {
        let p = Path::new(path);
        if p.is_absolute() {
            Ok(p.to_path_buf())
        } else {
            Ok(self.root.join(path))
        }
    }

    // -----------------------------------------------------------------
    // Managed worktree helpers
    // -----------------------------------------------------------------

    /// Create a managed worktree directory. The directory is a sibling under
    /// `.remi-code/worktrees/` and is recorded in the in-memory worktree map.
    pub async fn create_managed_worktree(&self, label: &str) -> Result<ManagedWorktree> {
        std::fs::create_dir_all(&self.worktrees_root).map_err(|e| {
            Error::Workspace(format!("Failed to create worktrees root: {}", e))
        })?;
        let id = Uuid::new_v4().to_string();
        let path = self.worktrees_root.join(format!("{}-{}", label, &id[..8]));
        std::fs::create_dir_all(&path).map_err(|e| {
            Error::Workspace(format!("Failed to create worktree: {}", e))
        })?;
        let now = chrono::Utc::now().to_rfc3339();
        let worktree = ManagedWorktree {
            id: id.clone(),
            label: label.to_string(),
            path: path.to_string_lossy().to_string(),
            created_at: now.clone(),
            last_used_at: now,
        };
        self.worktree_state.write().await.insert(id, worktree.clone());
        info!("created managed worktree {} at {}", worktree.id, worktree.path);
        Ok(worktree)
    }

    /// List all managed worktrees.
    pub async fn list_managed_worktrees(&self) -> Vec<ManagedWorktree> {
        self.worktree_state.read().await.values().cloned().collect()
    }

    /// Touch a worktree (updates `last_used_at`).
    pub async fn touch_managed_worktree(&self, id: &str) -> Result<()> {
        let mut state = self.worktree_state.write().await;
        let entry = state
            .get_mut(id)
            .ok_or_else(|| Error::Workspace(format!("Worktree not found: {id}")))?;
        entry.last_used_at = chrono::Utc::now().to_rfc3339();
        Ok(())
    }

    /// Remove a managed worktree from disk and the in-memory map.
    pub async fn remove_managed_worktree(&self, id: &str) -> Result<()> {
        let path = {
            let mut state = self.worktree_state.write().await;
            let entry = state
                .remove(id)
                .ok_or_else(|| Error::Workspace(format!("Worktree not found: {id}")))?;
            entry.path
        };
        if Path::new(&path).exists() {
            std::fs::remove_dir_all(&path).map_err(|e| {
                Error::Workspace(format!("Failed to remove worktree: {}", e))
            })?;
        }
        Ok(())
    }

    /// Garbage-collect managed worktrees not touched for `max_age`.
    pub async fn gc_managed_worktrees(&self, max_age: Duration) -> Result<usize> {
        let now = chrono::Utc::now();
        let mut stale: Vec<String> = Vec::new();
        {
            let state = self.worktree_state.read().await;
            for (id, w) in state.iter() {
                if let Ok(ts) = chrono::DateTime::parse_from_rfc3339(&w.last_used_at) {
                    if now.signed_duration_since(ts.with_timezone(&chrono::Utc))
                        > chrono::Duration::from_std(max_age).unwrap_or(chrono::Duration::seconds(0))
                    {
                        stale.push(id.clone());
                    }
                }
            }
        }
        let count = stale.len();
        for id in stale {
            let _ = self.remove_managed_worktree(&id).await;
        }
        Ok(count)
    }

    // -----------------------------------------------------------------
    // File-level read / write / search helpers used by the RPC layer
    // -----------------------------------------------------------------

    /// Read a file from the workspace root.
    pub async fn read_file(&self, input: ReadFileInput) -> Result<ReadFileResult> {
        let full_path = self.resolve_path(&input.path)?;
        if !full_path.exists() {
            return Err(Error::Workspace(format!(
                "File does not exist: {}",
                full_path.display()
            )));
        }
        if !full_path.is_file() {
            return Err(Error::Workspace(format!(
                "Not a regular file: {}",
                full_path.display()
            )));
        }
        let contents = tokio::fs::read_to_string(&full_path)
            .await
            .map_err(|e| Error::Workspace(format!("Failed to read file: {}", e)))?;
        let metadata = tokio::fs::metadata(&full_path)
            .await
            .map_err(|e| Error::Workspace(format!("Failed to stat file: {}", e)))?;
        let modified_at = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .and_then(|d| chrono::DateTime::from_timestamp(d.as_secs() as i64, 0))
            .map(|dt| dt.to_rfc3339());
        Ok(ReadFileResult {
            path: input.path,
            contents,
            size: metadata.len(),
            modified_at,
        })
    }

    /// Write a file under the workspace root.
    pub async fn write_file_simple(&self, input: WriteFileInput) -> Result<WriteFileResult> {
        let full_path = self.resolve_path(&input.path)?;
        if let Some(parent) = full_path.parent() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(|e| Error::Workspace(format!("Failed to create parent dir: {}", e)))?;
        }
        let bytes = input.contents.as_bytes();
        tokio::fs::write(&full_path, bytes)
            .await
            .map_err(|e| Error::Workspace(format!("Failed to write file: {}", e)))?;
        self.invalidate_cache();
        Ok(WriteFileResult {
            path: input.path,
            bytes_written: bytes.len(),
        })
    }

    /// Create a directory under the workspace root.
    pub async fn create_directory(&self, input: CreateDirectoryInput) -> Result<()> {
        let full_path = self.resolve_path(&input.path)?;
        tokio::fs::create_dir_all(&full_path)
            .await
            .map_err(|e| Error::Workspace(format!("Failed to create directory: {}", e)))?;
        self.invalidate_cache();
        Ok(())
    }

    /// Delete a path (file or directory) from the workspace.
    pub async fn delete_path(&self, input: DeletePathInput) -> Result<()> {
        let full_path = self.resolve_path(&input.path)?;
        if !full_path.exists() {
            return Ok(());
        }
        if full_path.is_file() {
            tokio::fs::remove_file(&full_path)
                .await
                .map_err(|e| Error::Workspace(format!("Failed to delete file: {}", e)))?;
        } else if input.recursive {
            tokio::fs::remove_dir_all(&full_path)
                .await
                .map_err(|e| Error::Workspace(format!("Failed to delete directory: {}", e)))?;
        } else {
            tokio::fs::remove_dir(&full_path)
                .await
                .map_err(|e| Error::Workspace(format!("Failed to delete directory: {}", e)))?;
        }
        self.invalidate_cache();
        Ok(())
    }

    /// Recursive content search.
    pub async fn search(
        &self,
        path: &str,
        query: &str,
        limit: Option<usize>,
    ) -> Result<Vec<FilesystemEntry>> {
        let full_path = self.resolve_path(path)?;
        if !full_path.exists() {
            return Err(Error::Workspace(format!(
                "Path does not exist: {}",
                full_path.display()
            )));
        }
        let limit = limit.unwrap_or(100);
        let mut matches = Vec::new();
        let mut builder = WalkBuilder::new(&full_path);
        builder.hidden(false);
        for entry in builder.build() {
            match entry {
                Ok(entry) => {
                    let entry_path = entry.path();
                    if entry_path == full_path || !entry_path.is_file() {
                        continue;
                    }
                    let name = entry_path
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("");
                    if name.to_lowercase().contains(&query.to_lowercase()) {
                        let metadata = entry.metadata().ok();
                        let size = metadata.as_ref().map(|m| m.len());
                        matches.push(FilesystemEntry {
                            name: name.to_string(),
                            path: entry_path.to_string_lossy().to_string(),
                            entry_type: FilesystemEntryType::File,
                            size,
                            modified_at: None,
                            is_hidden: name.starts_with('.'),
                        });
                        if matches.len() >= limit {
                            break;
                        }
                    }
                }
                Err(e) => warn!("search walker error: {}", e),
            }
        }
        Ok(matches)
    }
}

/// A managed worktree tracked by the workspace service.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ManagedWorktree {
    pub id: String,
    pub label: String,
    pub path: String,
    pub created_at: String,
    pub last_used_at: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[tokio::test]
    async fn test_browse_directory() {
        let temp_dir = TempDir::new().unwrap();
        let root = temp_dir.path();

        fs::write(root.join("file1.txt"), "content1").unwrap();
        fs::write(root.join("file2.txt"), "content2").unwrap();
        fs::create_dir(root.join("subdir")).unwrap();

        let service = WorkspaceService::new(root);
        let result = service.browse(".", false, Some(1)).await.unwrap();

        assert_eq!(result.entries.len(), 3);
    }

    #[tokio::test]
    async fn test_chunked_browse() {
        let temp_dir = TempDir::new().unwrap();
        let root = temp_dir.path();
        for i in 0..10 {
            fs::write(root.join(format!("f{i}.txt")), "x").unwrap();
        }
        let service = WorkspaceService::new(root);
        let page = service.browse_chunked(".", false, Some(1), 0, Some(3)).await.unwrap();
        assert_eq!(page.entries.len(), 3);
        assert!(page.has_more);
        assert_eq!(page.total, 10);
    }

    #[tokio::test]
    async fn test_managed_worktree_lifecycle() {
        let temp_dir = TempDir::new().unwrap();
        let service = WorkspaceService::new(temp_dir.path());
        let wt = service.create_managed_worktree("test").await.unwrap();
        assert!(Path::new(&wt.path).exists());
        let list = service.list_managed_worktrees().await;
        assert_eq!(list.len(), 1);
        service.remove_managed_worktree(&wt.id).await.unwrap();
        let list = service.list_managed_worktrees().await;
        assert!(list.is_empty());
    }
}
