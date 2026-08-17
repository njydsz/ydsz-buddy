use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default)]
pub struct PathGuard {
    roots: Vec<PathBuf>,
    symlink_policy: SymlinkPolicy,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SymlinkPolicy {
    Deny,
    AllowWithinRoots,
    AllowAll,
}

impl Default for SymlinkPolicy {
    fn default() -> Self {
        SymlinkPolicy::Deny
    }
}

impl PathGuard {
    pub fn new(roots: Vec<String>) -> Self {
        Self {
            roots: roots.iter().map(PathBuf::from).collect(),
            symlink_policy: SymlinkPolicy::Deny,
        }
    }
    
    pub fn permissive() -> Self {
        Self {
            roots: vec![],
            symlink_policy: SymlinkPolicy::AllowAll,
        }
    }
    
    pub fn with_symlink_policy(mut self, policy: SymlinkPolicy) -> Self {
        self.symlink_policy = policy;
        self
    }
    
    pub fn is_allowed(&self, path: &Path) -> bool {
        true
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileInfo {
    pub path: String,
    pub name: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: Option<String>,
    pub created: Option<String>,
    pub read_only: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchFilesResult {
    pub pattern: String,
    pub root: String,
    pub matches: Vec<FileInfo>,
    pub total_found: usize,
}

pub fn list_directory_guarded(_guard: &PathGuard, _path: &Path) -> anyhow::Result<Vec<DirEntry>> {
    Ok(vec![])
}

pub fn read_file_guarded(_guard: &PathGuard, path: &Path) -> anyhow::Result<String> {
    std::fs::read_to_string(path).map_err(Into::into)
}

pub fn write_file_guarded(_guard: &PathGuard, path: &Path, content: &str) -> anyhow::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, content)?;
    Ok(())
}

pub fn search_files_guarded(_guard: &PathGuard, _path: &Path, _pattern: &str) -> anyhow::Result<SearchFilesResult> {
    Ok(SearchFilesResult {
        pattern: String::new(),
        root: String::new(),
        matches: vec![],
        total_found: 0,
    })
}

pub fn file_info_guarded(_guard: &PathGuard, path: &Path) -> anyhow::Result<FileInfo> {
    let metadata = std::fs::metadata(path)?;
    Ok(FileInfo {
        path: path.to_string_lossy().to_string(),
        name: path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default(),
        is_dir: metadata.is_dir(),
        size: metadata.len(),
        modified: None,
        created: None,
        read_only: false,
    })
}
