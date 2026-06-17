//! Workspace management for Remi Code.
//!
//! This crate handles filesystem scanning, workspace entries, and worktree management.

use ignore::WalkBuilder;
use remi_contracts::{FilesystemBrowseResult, FilesystemEntry, FilesystemEntryType};
use remi_core::{Error, Result};
use std::path::{Path, PathBuf};

/// Workspace service.
pub struct WorkspaceService {
    root: PathBuf,
}

impl WorkspaceService {
    /// Create a new workspace service.
    pub fn new(root: impl AsRef<Path>) -> Self {
        Self {
            root: root.as_ref().to_path_buf(),
        }
    }

    /// Browse a directory.
    pub async fn browse(&self, path: &str, include_hidden: bool, max_depth: Option<u32>) -> Result<FilesystemBrowseResult> {
        let full_path = if Path::new(path).is_absolute() {
            PathBuf::from(path)
        } else {
            self.root.join(path)
        };

        if !full_path.exists() {
            return Err(Error::Workspace(format!(
                "Path does not exist: {}",
                full_path.display()
            )));
        }

        let mut entries = Vec::new();

        let mut builder = WalkBuilder::new(&full_path);
        builder.hidden(!include_hidden);
        if let Some(depth) = max_depth {
            builder.max_depth(Some(depth as usize));
        }

        let walker = builder.build();

        for entry in walker {
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
                Err(e) => {
                    tracing::warn!("Failed to read directory entry: {}", e);
                }
            }
        }

        Ok(FilesystemBrowseResult {
            parent: full_path.to_string_lossy().to_string(),
            entries,
        })
    }

    /// Get the workspace root.
    pub fn root(&self) -> &Path {
        &self.root
    }
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

        // Create some files
        fs::write(root.join("file1.txt"), "content1").unwrap();
        fs::write(root.join("file2.txt"), "content2").unwrap();
        fs::create_dir(root.join("subdir")).unwrap();

        let service = WorkspaceService::new(root);
        let result = service.browse(".", false, Some(1)).await.unwrap();

        assert_eq!(result.entries.len(), 3);
    }
}
