//! Remi Code 的 Diff 应用引擎。
//!
//! 本 crate 提供解析和应用各种格式的 diff（统一 diff、搜索/替换、代码块）
//! 到文件的功能，支持自动备份和冲突检测。

use remi_core::{Error, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tracing::{debug, error, info, warn};

/// Diff 应用操作的错误类型。
#[derive(Debug, thiserror::Error)]
pub enum DiffApplyError {
    #[error("文件未找到: {0}")]
    FileNotFound(String),

    #[error("无效的 diff 格式: {0}")]
    InvalidDiff(String),

    #[error("搜索字符串未找到: {0}")]
    SearchNotFound(String),

    #[error("搜索字符串找到多个匹配项")]
    MultipleMatches,

    #[error("IO 错误: {0}")]
    Io(#[from] std::io::Error),

    #[error("备份失败: {0}")]
    BackupFailed(String),
}

/// diff hunk 中的单行。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum DiffLine {
    /// 上下文行（未更改）。
    Context(String),
    /// 添加的行。
    Added(String),
    /// 删除的行。
    Removed(String),
}

/// 统一 diff 中的 hunk。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffHunk {
    /// 原始文件中的起始行号。
    pub start_line: u32,
    /// 原始文件中的行数。
    pub original_count: u32,
    /// 修改后文件中的起始行号。
    pub modified_start: u32,
    /// 修改后文件中的行数。
    pub modified_count: u32,
    /// 此 hunk 中的行。
    pub lines: Vec<DiffLine>,
}

/// 应用 diff 的结果。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffApplyResult {
    /// 修改后文件的路径。
    pub file_path: String,
    /// 备份文件的路径（如果创建了）。
    pub backup_path: Option<String>,
    /// 应用的 hunk 数量。
    pub hunks_applied: u32,
    /// 添加的行数。
    pub lines_added: u32,
    /// 删除的行数。
    pub lines_removed: u32,
}

/// 应用代码块的模式。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CodeBlockMode {
    /// 替换整个文件内容。
    Overwrite,
    /// 在指定行插入。
    Insert(u32),
    /// 替换范围 [start, end] 内的行。
    Replace(u32, u32),
}

/// 文件编辑操作。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum FileEdit {
    /// 统一 diff 格式。
    Diff(String),
    /// 搜索和替换。
    SearchReplace { search: String, replace: String },
    /// 带模式的代码块。
    CodeBlock { code: String, mode: CodeBlockMode },
}

/// Diff 应用引擎。
pub struct DiffApplyEngine {
    /// 是否在应用更改前创建备份。
    create_backups: bool,
    /// 备份目录路径。
    backup_dir: Option<PathBuf>,
}

impl DiffApplyEngine {
    /// 创建新的 diff 应用引擎。
    pub fn new() -> Self {
        Self {
            create_backups: true,
            backup_dir: None,
        }
    }

    /// 设置是否创建备份。
    pub fn with_backups(mut self, create_backups: bool) -> Self {
        self.create_backups = create_backups;
        self
    }

    /// 设置备份目录。
    pub fn with_backup_dir(mut self, backup_dir: PathBuf) -> Self {
        self.backup_dir = Some(backup_dir);
        self
    }

    /// 应用文件编辑操作。
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

    /// 将统一 diff 应用到文件。
    pub async fn apply_diff(
        &self,
        file_path: &str,
        diff: &str,
    ) -> Result<DiffApplyResult> {
        let path = Path::new(file_path);
        if !path.exists() {
            return Err(Error::Internal(format!(
                "文件未找到: {}",
                file_path
            )));
        }

        // 读取原始内容
        let original_content = tokio::fs::read_to_string(path)
            .await
            .map_err(|e| Error::Internal(format!("读取文件失败: {}", e)))?;

        // 解析 diff
        let hunks = parse_diff(diff).map_err(|e| Error::Internal(format!("解析 diff 失败: {}", e)))?;

        // 应用 hunks
        let modified_content = apply_hunks(&original_content, &hunks)
            .map_err(|e| Error::Internal(format!("应用 hunks 失败: {}", e)))?;

        // 如果启用则创建备份
        let backup_path = if self.create_backups {
            Some(self.create_backup(file_path, &original_content).await?)
        } else {
            None
        };

        // 写入修改后的内容
        tokio::fs::write(path, &modified_content)
            .await
            .map_err(|e| Error::Internal(format!("写入文件失败: {}", e)))?;

        // 计算统计信息
        let (lines_added, lines_removed) = count_changes(&hunks);

        info!(
            file_path = %file_path,
            hunks_applied = hunks.len(),
            lines_added = lines_added,
            lines_removed = lines_removed,
            "应用了 diff"
        );

        Ok(DiffApplyResult {
            file_path: file_path.to_string(),
            backup_path,
            hunks_applied: hunks.len() as u32,
            lines_added,
            lines_removed,
        })
    }

    /// 将搜索和替换应用到文件。
    pub async fn apply_search_replace(
        &self,
        file_path: &str,
        search: &str,
        replace: &str,
    ) -> Result<DiffApplyResult> {
        let path = Path::new(file_path);
        if !path.exists() {
            return Err(Error::Internal(format!(
                "文件未找到: {}",
                file_path
            )));
        }

        // 读取原始内容
        let original_content = tokio::fs::read_to_string(path)
            .await
            .map_err(|e| Error::Internal(format!("读取文件失败: {}", e)))?;

        // 计算匹配数
        let match_count = original_content.matches(search).count();
        if match_count == 0 {
            return Err(Error::Internal(format!(
                "在文件中未找到搜索字符串: {}",
                file_path
            )));
        }
        if match_count > 1 {
            warn!(
                file_path = %file_path,
                match_count = match_count,
                "找到多个匹配项; 替换所有出现"
            );
        }

        // 应用替换
        let modified_content = original_content.replace(search, replace);

        // 如果启用则创建备份
        let backup_path = if self.create_backups {
            Some(self.create_backup(file_path, &original_content).await?)
        } else {
            None
        };

        // 写入修改后的内容
        tokio::fs::write(path, &modified_content)
            .await
            .map_err(|e| Error::Internal(format!("写入文件失败: {}", e)))?;

        // 计算统计信息
        let lines_added = modified_content.lines().count() as u32;
        let lines_removed = original_content.lines().count() as u32;

        info!(
            file_path = %file_path,
            matches = match_count,
            "应用了搜索/替换"
        );

        Ok(DiffApplyResult {
            file_path: file_path.to_string(),
            backup_path,
            hunks_applied: match_count as u32,
            lines_added,
            lines_removed,
        })
    }

    /// 将代码块应用到文件。
    pub async fn apply_code_block(
        &self,
        file_path: &str,
        code: &str,
        mode: CodeBlockMode,
    ) -> Result<DiffApplyResult> {
        let path = Path::new(file_path);
        
        // 读取原始内容（如果文件不存在则为空）
        let original_content = if path.exists() {
            tokio::fs::read_to_string(path)
                .await
                .map_err(|e| Error::Internal(format!("读取文件失败: {}", e)))?
        } else {
            String::new()
        };

        // 根据模式应用代码块
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
                        "无效范围: start ({}) >= end ({})",
                        start, end
                    )));
                }
                
                lines.splice(start_pos..end_pos, std::iter::once(code));
                lines.join("\n")
            }
        };

        // 如果启用且文件存在则创建备份
        let backup_path = if self.create_backups && path.exists() {
            Some(self.create_backup(file_path, &original_content).await?)
        } else {
            None
        };

        // 写入修改后的内容
        tokio::fs::write(path, &modified_content)
            .await
            .map_err(|e| Error::Internal(format!("写入文件失败: {}", e)))?;

        // 计算统计信息
        let lines_added = modified_content.lines().count() as u32;
        let lines_removed = original_content.lines().count() as u32;

        info!(
            file_path = %file_path,
            mode = ?mode,
            "应用了代码块"
        );

        Ok(DiffApplyResult {
            file_path: file_path.to_string(),
            backup_path,
            hunks_applied: 1,
            lines_added,
            lines_removed,
        })
    }

    /// 生成两个字符串之间的统一 diff。
    pub fn generate_diff(
        original: &str,
        modified: &str,
        file_path: &str,
    ) -> String {
        let mut diff = String::new();
        
        // 添加头部
        diff.push_str(&format!("--- a/{}\n", file_path));
        diff.push_str(&format!("+++ b/{}\n", file_path));
        
        // 简单的逐行 diff（用于演示）
        let original_lines: Vec<&str> = original.lines().collect();
        let modified_lines: Vec<&str> = modified.lines().collect();
        
        // 添加 hunk 头部
        diff.push_str(&format!(
            "@@ -1,{} +1,{} @@\n",
            original_lines.len(),
            modified_lines.len()
        ));
        
        // 添加行
        for line in &original_lines {
            diff.push_str(&format!("-{}\n", line));
        }
        for line in &modified_lines {
            diff.push_str(&format!("+{}\n", line));
        }
        
        diff
    }

    /// 创建文件的备份。
    async fn create_backup(
        &self,
        file_path: &str,
        content: &str,
    ) -> Result<String> {
        let backup_dir = self.backup_dir.as_ref().map(|p| p.as_path()).unwrap_or_else(|| {
            Path::new(file_path).parent().unwrap_or(Path::new("."))
        });

        // 如果备份目录不存在则创建
        tokio::fs::create_dir_all(backup_dir)
            .await
            .map_err(|e| Error::Internal(format!("创建备份目录失败: {}", e)))?;

        // 生成备份文件名
        let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S");
        let original_name = Path::new(file_path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("file");
        let backup_name = format!("{}.backup.{}", original_name, timestamp);
        let backup_path = backup_dir.join(backup_name);

        // 写入备份
        tokio::fs::write(&backup_path, content)
            .await
            .map_err(|e| Error::Internal(format!("写入备份失败: {}", e)))?;

        debug!(
            file_path = %file_path,
            backup_path = %backup_path.display(),
            "创建了备份"
        );

        Ok(backup_path.to_string_lossy().to_string())
    }
}

impl Default for DiffApplyEngine {
    fn default() -> Self {
        Self::new()
    }
}

/// 解析统一 diff 格式。
fn parse_diff(diff: &str) -> std::result::Result<Vec<DiffHunk>, DiffApplyError> {
    let mut hunks = Vec::new();
    let mut current_hunk: Option<DiffHunk> = None;
    
    for line in diff.lines() {
        if line.starts_with("@@") {
            // 解析 hunk 头部: @@ -start,count +start,count @@
            if let Some(hunk) = current_hunk.take() {
                hunks.push(hunk);
            }
            
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() < 3 {
                return Err(DiffApplyError::InvalidDiff(
                    "无效的 hunk 头部".to_string(),
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

/// 解析类似 "1,5" 的范围为 (start, count)。
fn parse_range(range: &str) -> std::result::Result<(u32, u32), DiffApplyError> {
    let parts: Vec<&str> = range.split(',').collect();
    if parts.len() == 1 {
        let start = parts[0]
            .parse::<u32>()
            .map_err(|_| DiffApplyError::InvalidDiff("无效范围".to_string()))?;
        Ok((start, 1))
    } else if parts.len() == 2 {
        let start = parts[0]
            .parse::<u32>()
            .map_err(|_| DiffApplyError::InvalidDiff("无效范围起始值".to_string()))?;
        let count = parts[1]
            .parse::<u32>()
            .map_err(|_| DiffApplyError::InvalidDiff("无效范围计数".to_string()))?;
        Ok((start, count))
    } else {
        Err(DiffApplyError::InvalidDiff("无效范围格式".to_string()))
    }
}

/// 将 hunks 应用到原始内容。
fn apply_hunks(original: &str, hunks: &[DiffHunk]) -> std::result::Result<String, DiffApplyError> {
    let mut lines: Vec<String> = original.lines().map(|s| s.to_string()).collect();
    
    // 以相反顺序应用 hunks 以保持行号正确
    for hunk in hunks.iter().rev() {
        let start_idx = (hunk.start_line - 1) as usize;
        
        // 为此 hunk 构建新行
        let mut new_lines = Vec::new();
        for line in &hunk.lines {
            match line {
                DiffLine::Context(text) => new_lines.push(text.clone()),
                DiffLine::Added(text) => new_lines.push(text.clone()),
                DiffLine::Removed(_) => {} // 跳过删除的行
            }
        }
        
        // 计算要删除多少行
        let remove_count = hunk
            .lines
            .iter()
            .filter(|l| matches!(l, DiffLine::Removed(_) | DiffLine::Context(_)))
            .count();
        
        // 替换行
        if start_idx + remove_count <= lines.len() {
            lines.splice(start_idx..start_idx + remove_count, new_lines);
        } else {
            return Err(DiffApplyError::InvalidDiff(
                "Hunk 超出文件长度".to_string(),
            ));
        }
    }
    
    Ok(lines.join("\n"))
}

/// 计算 hunks 中添加和删除的行数。
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
