//! Filesystem schemas.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// Input for browsing filesystem.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct FilesystemBrowseInput {
    /// Directory path to browse.
    pub path: String,
    /// Whether to include hidden files.
    #[serde(default)]
    pub include_hidden: bool,
    /// Maximum depth to traverse.
    pub max_depth: Option<u32>,
}

/// Result of filesystem browse operation.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct FilesystemBrowseResult {
    /// Parent directory path.
    pub parent: String,
    /// Entries in the directory.
    pub entries: Vec<FilesystemEntry>,
}

/// A filesystem entry (file or directory).
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct FilesystemEntry {
    /// Entry name.
    pub name: String,
    /// Full path.
    pub path: String,
    /// Entry type.
    pub entry_type: FilesystemEntryType,
    /// File size in bytes (for files only).
    pub size: Option<u64>,
    /// Last modified timestamp (ISO 8601).
    pub modified_at: Option<String>,
    /// Whether the entry is hidden.
    pub is_hidden: bool,
}

/// Type of filesystem entry.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum FilesystemEntryType {
    /// Regular file.
    File,
    /// Directory.
    Directory,
    /// Symbolic link.
    Symlink,
    /// Other (device, socket, etc.).
    Other,
}
