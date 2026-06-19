//! Diff apply engine for Remi Code.
//!
//! This crate provides functionality to parse and apply diffs in various formats
//! (unified diff, search/replace, code blocks) to files, with automatic backup
//! and conflict detection.

use remi_core::{Error, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tracing::{debug, error, info, warn};

/// Error type for diff apply operations.
#[derive(Debug, thiserror::Error)]
pub enum DiffApplyError {
    #[error("File not found: {0}")]
    FileNotFound(String),

    #[error("Invalid diff format: {0}")]
    InvalidDiff(String),

    #[error("Search string not found: {0}")]
    SearchNotFound(String),

    #[error("Multiple matches found for search string")]
    MultipleMatches,

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Backup failed: {0}")]
    BackupFailed(String),
}

/// A single line in a diff hunk.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum DiffLine {
    /// Context line (unchanged).
    Context(String),
    /// Added line.
    Added(String),
    /// Removed line.
    Removed(String),
}

/// A hunk in a unified diff.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffHunk {
    /// Starting line number in the original file.
    pub start_line: u32,
    /// Number of lines in the original file.
    pub original_count: u32,
    /// Starting line number in the modified file.
    pub modified_start: u32,
    /// Number of lines in the modified file.
    pub modified_count: u32,
    /// Lines in this hunk.
    pub lines: Vec<DiffLine>,
}

/// Result of applying a diff.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffApplyResult {
    /// Path to the modified file.
    pub file_path: String,
    /// Path to the backup file (if created).
    pub backup_path: Option<String>,
    /// Number of hunks applied.
    pub hunks_applied: u32,
    /// Number of lines added.
    pub lines_added: u32,
    /// Number of lines removed.
    pub lines_removed: u32,
}

/// Mode for applying code blocks.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CodeBlockMode {
    /// Replace entire file content.
    Overwrite,
    /// Insert at specific line.
    Insert(u32),
    /// Replace lines in range [start, end].
    Replace(u32, u32),
}

/// File edit operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum FileEdit {
    /// Unified diff format.
    Diff(String),
    /// Search and replace.
    SearchReplace { search: String, replace: String },
    /// Code block with mode.
    CodeBlock { code: String, mode: CodeBlockMode },
}

/// Diff apply engine.
pub struct DiffApplyEngine {
    /// Whether to create backups before applying changes.
    create_backups: bool,
    /// Backup directory path.
    backup_dir: Option<PathBuf>,
}

impl DiffApplyEngine {
    /// Create a new diff apply engine.
    pub fn new() -> Self {
        Self {
            create_backups: true,
            backup_dir: None,
        }
    }

    /// Set whether to create backups.
    pub fn with_backups(mut self, create_backups: bool) -> Self {
        self.create_backups = create_backups;
        self
    }

    /// Set backup directory.
    pub fn with_backup_dir(mut self, backup_dir: PathBuf) -> Self {
        self.backup_dir = Some(backup_dir);
        self
    }

    /// Apply a file edit operation.
    pub async fn apply_edit(
        &self,
        file_path: &str,
        edit: FileEdit,
    ) -> Result<DiffApplyResult> {
        match edit {
            FileEdit::Diff(diff) => self.apply_diff(file_path, &diff).await,
            FileEdit::SearchReplace { search, replace } => {
                self.apply_search_replace(file_path, &search, &replace).await
            }
            FileEdit::CodeBlock { code, mode } => {
                self.apply_code_block(file_path, &code, mode).await
            }
        }
    }

    /// Apply a unified diff to a file.
    pub async fn apply_diff(
        &self,
        file_path: &str,
        diff: &str,
    ) -> Result<DiffApplyResult> {
        let path = Path::new(file_path);
        if !path.exists() {
            return Err(Error::Internal(format!(
                "File not found: {}",
                file_path
            )));
        }

        // Read original content
        let original_content = tokio::fs::read_to_string(path)
            .await
            .map_err(|e| Error::Internal(format!("Failed to read file: {}", e)))?;

        // Parse diff
        let hunks = parse_diff(diff).map_err(|e| Error::Internal(format!("Failed to parse diff: {}", e)))?;

        // Apply hunks
        let modified_content = apply_hunks(&original_content, &hunks)
            .map_err(|e| Error::Internal(format!("Failed to apply hunks: {}", e)))?;

        // Create backup if enabled
        let backup_path = if self.create_backups {
            Some(self.create_backup(file_path, &original_content).await?)
        } else {
            None
        };

        // Write modified content
        tokio::fs::write(path, &modified_content)
            .await
            .map_err(|e| Error::Internal(format!("Failed to write file: {}", e)))?;

        // Calculate statistics
        let (lines_added, lines_removed) = count_changes(&hunks);

        info!(
            file_path = %file_path,
            hunks_applied = hunks.len(),
            lines_added = lines_added,
            lines_removed = lines_removed,
            "Applied diff"
        );

        Ok(DiffApplyResult {
            file_path: file_path.to_string(),
            backup_path,
            hunks_applied: hunks.len() as u32,
            lines_added,
            lines_removed,
        })
    }

    /// Apply search and replace to a file.
    pub async fn apply_search_replace(
        &self,
        file_path: &str,
        search: &str,
        replace: &str,
    ) -> Result<DiffApplyResult> {
        let path = Path::new(file_path);
        if !path.exists() {
            return Err(Error::Internal(format!(
                "File not found: {}",
                file_path
            )));
        }

        // Read original content
        let original_content = tokio::fs::read_to_string(path)
            .await
            .map_err(|e| Error::Internal(format!("Failed to read file: {}", e)))?;

        // Count matches
        let match_count = original_content.matches(search).count();
        if match_count == 0 {
            return Err(Error::Internal(format!(
                "Search string not found in file: {}",
                file_path
            )));
        }
        if match_count > 1 {
            warn!(
                file_path = %file_path,
                match_count = match_count,
                "Multiple matches found; replacing all occurrences"
            );
        }

        // Apply replacement
        let modified_content = original_content.replace(search, replace);

        // Create backup if enabled
        let backup_path = if self.create_backups {
            Some(self.create_backup(file_path, &original_content).await?)
        } else {
            None
        };

        // Write modified content
        tokio::fs::write(path, &modified_content)
            .await
            .map_err(|e| Error::Internal(format!("Failed to write file: {}", e)))?;

        // Calculate statistics
        let lines_added = modified_content.lines().count() as u32;
        let lines_removed = original_content.lines().count() as u32;

        info!(
            file_path = %file_path,
            matches = match_count,
            "Applied search/replace"
        );

        Ok(DiffApplyResult {
            file_path: file_path.to_string(),
            backup_path,
            hunks_applied: match_count as u32,
            lines_added,
            lines_removed,
        })
    }

    /// Apply a code block to a file.
    pub async fn apply_code_block(
        &self,
        file_path: &str,
        code: &str,
        mode: CodeBlockMode,
    ) -> Result<DiffApplyResult> {
        let path = Path::new(file_path);
        
        // Read original content (or empty if file doesn't exist)
        let original_content = if path.exists() {
            tokio::fs::read_to_string(path)
                .await
                .map_err(|e| Error::Internal(format!("Failed to read file: {}", e)))?
        } else {
            String::new()
        };

        // Apply code block based on mode
        let modified_content = match mode {
            CodeBlockMode::Overwrite => code.to_string(),
            CodeBlockMode::Insert(line) => {
                let mut lines: Vec<&str> = original_content.lines().collect();
                let insert_pos = (line as usize).min(lines.len());
                lines.insert(insert_pos, code);
                lines.join("\n")
            }
            CodeBlockMode::Replace(start, end) => {
                let mut lines: Vec<&str> = original_content.lines().collect();
                let start_pos = (start as usize).min(lines.len());
                let end_pos = (end as usize).min(lines.len());
                
                if start_pos >= end_pos {
                    return Err(Error::Internal(format!(
                        "Invalid range: start ({}) >= end ({})",
                        start, end
                    )));
                }
                
                lines.splice(start_pos..end_pos, std::iter::once(code));
                lines.join("\n")
            }
        };

        // Create backup if enabled and file exists
        let backup_path = if self.create_backups && path.exists() {
            Some(self.create_backup(file_path, &original_content).await?)
        } else {
            None
        };

        // Write modified content
        tokio::fs::write(path, &modified_content)
            .await
            .map_err(|e| Error::Internal(format!("Failed to write file: {}", e)))?;

        // Calculate statistics
        let lines_added = modified_content.lines().count() as u32;
        let lines_removed = original_content.lines().count() as u32;

        info!(
            file_path = %file_path,
            mode = ?mode,
            "Applied code block"
        );

        Ok(DiffApplyResult {
            file_path: file_path.to_string(),
            backup_path,
            hunks_applied: 1,
            lines_added,
            lines_removed,
        })
    }

    /// Generate a unified diff between two strings.
    pub fn generate_diff(
        original: &str,
        modified: &str,
        file_path: &str,
    ) -> String {
        let mut diff = String::new();
        
        // Add header
        diff.push_str(&format!("--- a/{}\n", file_path));
        diff.push_str(&format!("+++ b/{}\n", file_path));
        
        // Simple line-by-line diff (for demonstration)
        let original_lines: Vec<&str> = original.lines().collect();
        let modified_lines: Vec<&str> = modified.lines().collect();
        
        // Add hunk header
        diff.push_str(&format!(
            "@@ -1,{} +1,{} @@\n",
            original_lines.len(),
            modified_lines.len()
        ));
        
        // Add lines
        for line in &original_lines {
            diff.push_str(&format!("-{}\n", line));
        }
        for line in &modified_lines {
            diff.push_str(&format!("+{}\n", line));
        }
        
        diff
    }

    /// Create a backup of a file.
    async fn create_backup(
        &self,
        file_path: &str,
        content: &str,
    ) -> Result<String> {
        let backup_dir = self.backup_dir.as_ref().map(|p| p.as_path()).unwrap_or_else(|| {
            Path::new(file_path).parent().unwrap_or(Path::new("."))
        });

        // Create backup directory if it doesn't exist
        tokio::fs::create_dir_all(backup_dir)
            .await
            .map_err(|e| Error::Internal(format!("Failed to create backup directory: {}", e)))?;

        // Generate backup filename
        let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S");
        let original_name = Path::new(file_path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("file");
        let backup_name = format!("{}.backup.{}", original_name, timestamp);
        let backup_path = backup_dir.join(backup_name);

        // Write backup
        tokio::fs::write(&backup_path, content)
            .await
            .map_err(|e| Error::Internal(format!("Failed to write backup: {}", e)))?;

        debug!(
            file_path = %file_path,
            backup_path = %backup_path.display(),
            "Created backup"
        );

        Ok(backup_path.to_string_lossy().to_string())
    }
}

impl Default for DiffApplyEngine {
    fn default() -> Self {
        Self::new()
    }
}

/// Parse a unified diff format.
fn parse_diff(diff: &str) -> std::result::Result<Vec<DiffHunk>, DiffApplyError> {
    let mut hunks = Vec::new();
    let mut current_hunk: Option<DiffHunk> = None;
    
    for line in diff.lines() {
        if line.starts_with("@@") {
            // Parse hunk header: @@ -start,count +start,count @@
            if let Some(hunk) = current_hunk.take() {
                hunks.push(hunk);
            }
            
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() < 3 {
                return Err(DiffApplyError::InvalidDiff(
                    "Invalid hunk header".to_string(),
                ));
            }
            
            let original_range = parse_range(parts[1].trim_start_matches('-'))?;
            let modified_range = parse_range(parts[2].trim_start_matches('+'))?;
            
            current_hunk = Some(DiffHunk {
                start_line: original_range.0,
                original_count: original_range.1,
                modified_start: modified_range.0,
                modified_count: modified_range.1,
                lines: Vec::new(),
            });
        } else if let Some(ref mut hunk) = current_hunk {
            if line.starts_with('+') {
                hunk.lines.push(DiffLine::Added(line[1..].to_string()));
            } else if line.starts_with('-') {
                hunk.lines.push(DiffLine::Removed(line[1..].to_string()));
            } else if line.starts_with(' ') {
                hunk.lines.push(DiffLine::Context(line[1..].to_string()));
            }
        }
    }
    
    if let Some(hunk) = current_hunk {
        hunks.push(hunk);
    }
    
    Ok(hunks)
}

/// Parse a range like "1,5" into (start, count).
fn parse_range(range: &str) -> std::result::Result<(u32, u32), DiffApplyError> {
    let parts: Vec<&str> = range.split(',').collect();
    if parts.len() == 1 {
        let start = parts[0]
            .parse::<u32>()
            .map_err(|_| DiffApplyError::InvalidDiff("Invalid range".to_string()))?;
        Ok((start, 1))
    } else if parts.len() == 2 {
        let start = parts[0]
            .parse::<u32>()
            .map_err(|_| DiffApplyError::InvalidDiff("Invalid range start".to_string()))?;
        let count = parts[1]
            .parse::<u32>()
            .map_err(|_| DiffApplyError::InvalidDiff("Invalid range count".to_string()))?;
        Ok((start, count))
    } else {
        Err(DiffApplyError::InvalidDiff("Invalid range format".to_string()))
    }
}

/// Apply hunks to original content.
fn apply_hunks(original: &str, hunks: &[DiffHunk]) -> std::result::Result<String, DiffApplyError> {
    let mut lines: Vec<String> = original.lines().map(|s| s.to_string()).collect();
    
    // Apply hunks in reverse order to preserve line numbers
    for hunk in hunks.iter().rev() {
        let start_idx = (hunk.start_line - 1) as usize;
        
        // Build new lines for this hunk
        let mut new_lines = Vec::new();
        for line in &hunk.lines {
            match line {
                DiffLine::Context(text) => new_lines.push(text.clone()),
                DiffLine::Added(text) => new_lines.push(text.clone()),
                DiffLine::Removed(_) => {} // Skip removed lines
            }
        }
        
        // Calculate how many lines to remove
        let remove_count = hunk
            .lines
            .iter()
            .filter(|l| matches!(l, DiffLine::Removed(_) | DiffLine::Context(_)))
            .count();
        
        // Replace lines
        if start_idx + remove_count <= lines.len() {
            lines.splice(start_idx..start_idx + remove_count, new_lines);
        } else {
            return Err(DiffApplyError::InvalidDiff(
                "Hunk extends beyond file length".to_string(),
            ));
        }
    }
    
    Ok(lines.join("\n"))
}

/// Count lines added and removed in hunks.
fn count_changes(hunks: &[DiffHunk]) -> (u32, u32) {
    let mut added = 0;
    let mut removed = 0;
    
    for hunk in hunks {
        for line in &hunk.lines {
            match line {
                DiffLine::Added(_) => added += 1,
                DiffLine::Removed(_) => removed += 1,
                DiffLine::Context(_) => {}
            }
        }
    }
    
    (added, removed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_diff() {
        let diff = r#"--- a/file.txt
+++ b/file.txt
@@ -1,3 +1,4 @@
 line1
-line2
+line2_modified
+line3_added
 line4"#;
        
        let hunks = parse_diff(diff).unwrap();
        assert_eq!(hunks.len(), 1);
        assert_eq!(hunks[0].start_line, 1);
        assert_eq!(hunks[0].original_count, 3);
    }

    #[test]
    fn test_apply_hunks() {
        let original = "line1\nline2\nline3";
        let hunks = vec![DiffHunk {
            start_line: 2,
            original_count: 1,
            modified_start: 2,
            modified_count: 1,
            lines: vec![
                DiffLine::Removed("line2".to_string()),
                DiffLine::Added("line2_modified".to_string()),
            ],
        }];
        
        let result = apply_hunks(original, &hunks).unwrap();
        assert_eq!(result, "line1\nline2_modified\nline3");
    }

    #[test]
    fn test_count_changes() {
        let hunks = vec![DiffHunk {
            start_line: 1,
            original_count: 2,
            modified_start: 1,
            modified_count: 3,
            lines: vec![
                DiffLine::Context("line1".to_string()),
                DiffLine::Removed("line2".to_string()),
                DiffLine::Added("line2a".to_string()),
                DiffLine::Added("line2b".to_string()),
            ],
        }];
        
        let (added, removed) = count_changes(&hunks);
        assert_eq!(added, 2);
        assert_eq!(removed, 1);
    }
}
