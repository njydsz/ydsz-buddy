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
        let canonicalized_roots: Vec<PathBuf> = roots
            .iter()
            .filter_map(|r| {
                let p = PathBuf::from(r);
                // Try to canonicalize; if it fails, use the path as-is
                p.canonicalize().ok().or_else(|| Some(p))
            })
            .collect();
        Self {
            roots: canonicalized_roots,
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
        // Permissive mode: empty roots + AllowAll policy means no restriction
        if self.roots.is_empty() && self.symlink_policy == SymlinkPolicy::AllowAll {
            return true;
        }

        // If roots are empty but policy is not AllowAll, deny everything
        if self.roots.is_empty() {
            return false;
        }

        // Try to canonicalize the input path
        let canonical_path = match path.canonicalize() {
            Ok(p) => p,
            Err(_) => {
                // Path doesn't exist; try canonicalizing the parent and rejoin
                match path.parent() {
                    Some(parent) => {
                        match parent.canonicalize() {
                            Ok(cp) => {
                                let file_name = path.file_name();
                                match file_name {
                                    Some(name) => cp.join(name),
                                    None => cp,
                                }
                            }
                            Err(_) => return false,
                        }
                    }
                    None => return false,
                }
            }
        };

        // Check if the canonicalized path starts with any allowed root
        for root in &self.roots {
            if canonical_path.starts_with(root) {
                return true;
            }
        }

        false
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

pub fn list_directory_guarded(guard: &PathGuard, path: &Path) -> anyhow::Result<Vec<DirEntry>> {
    if !guard.is_allowed(path) {
        return Err(anyhow::anyhow!("path not authorized: {}", path.display()));
    }

    let mut entries = Vec::new();
    let dir_entries = std::fs::read_dir(path)?;

    for entry in dir_entries {
        let entry = entry?;
        let metadata = entry.metadata()?;
        let name = entry.file_name().to_string_lossy().to_string();
        let path_str = entry.path().to_string_lossy().to_string();
        let is_dir = metadata.is_dir();
        let size = metadata.len();

        let modified = metadata.modified().ok().and_then(|t| {
            t.duration_since(std::time::UNIX_EPOCH)
                .ok()
                .map(|d| d.as_secs().to_string())
        });

        entries.push(DirEntry {
            name,
            path: path_str,
            is_dir,
            size,
            modified,
        });
    }

    Ok(entries)
}

pub fn read_file_guarded(guard: &PathGuard, path: &Path) -> anyhow::Result<String> {
    if !guard.is_allowed(path) {
        return Err(anyhow::anyhow!("path not authorized: {}", path.display()));
    }
    std::fs::read_to_string(path).map_err(Into::into)
}

pub fn write_file_guarded(guard: &PathGuard, path: &Path, content: &str) -> anyhow::Result<()> {
    if !guard.is_allowed(path) {
        return Err(anyhow::anyhow!("path not authorized: {}", path.display()));
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, content)?;
    Ok(())
}

pub fn search_files_guarded(guard: &PathGuard, path: &Path, pattern: &str) -> anyhow::Result<SearchFilesResult> {
    if !guard.is_allowed(path) {
        return Err(anyhow::anyhow!("path not authorized: {}", path.display()));
    }

    const MAX_FILES: usize = 1000;
    let mut matches = Vec::new();
    let mut total_found = 0;
    let ignore_dirs = [".git", "node_modules", "target"];

    fn search_recursive(
        dir: &Path,
        pattern: &str,
        matches: &mut Vec<FileInfo>,
        total_found: &mut usize,
        ignore_dirs: &[&str],
    ) -> anyhow::Result<()> {
        if matches.len() >= MAX_FILES {
            return Ok(());
        }

        for entry in std::fs::read_dir(dir)? {
            let entry = entry?;
            let metadata = entry.metadata()?;
            let name = entry.file_name();
            let name_str = name.to_string_lossy();

            if metadata.is_dir() {
                if ignore_dirs.contains(&name_str.as_ref()) {
                    continue;
                }
                search_recursive(&entry.path(), pattern, matches, total_found, ignore_dirs)?;
            } else if metadata.is_file() {
                if name_str.contains(pattern) {
                    *total_found += 1;
                    if matches.len() < MAX_FILES {
                        let modified = metadata.modified().ok().and_then(|t| {
                            t.duration_since(std::time::UNIX_EPOCH)
                                .ok()
                                .map(|d| d.as_secs().to_string())
                        });
                        let created = metadata.created().ok().and_then(|t| {
                            t.duration_since(std::time::UNIX_EPOCH)
                                .ok()
                                .map(|d| d.as_secs().to_string())
                        });

                        matches.push(FileInfo {
                            path: entry.path().to_string_lossy().to_string(),
                            name: name_str.to_string(),
                            is_dir: false,
                            size: metadata.len(),
                            modified,
                            created,
                            read_only: metadata.permissions().readonly(),
                        });
                    }
                }
            }
        }
        Ok(())
    }

    search_recursive(path, pattern, &mut matches, &mut total_found, &ignore_dirs)?;

    Ok(SearchFilesResult {
        pattern: pattern.to_string(),
        root: path.to_string_lossy().to_string(),
        matches,
        total_found,
    })
}

pub fn file_info_guarded(guard: &PathGuard, path: &Path) -> anyhow::Result<FileInfo> {
    if !guard.is_allowed(path) {
        return Err(anyhow::anyhow!("path not authorized: {}", path.display()));
    }
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
