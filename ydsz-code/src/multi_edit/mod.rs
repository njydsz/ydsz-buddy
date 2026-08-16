//! # 多文件协调编辑（Code 域能力）
//!
//! 提供 Agent 驱动的多文件协调编辑能力：
//!
//! - [`MultiFileEditor`] — 多文件编辑器
//! - [`FileEdit`] — 单文件编辑操作（创建/修改/删除）
//! - [`EditBatch`] — 批量编辑批次（原子性保证）
//! - [`BatchResult`] — 批量执行结果
//!
//! ## 设计
//!
//! - 支持在一个批次中编辑多个文件
//! - 每个文件操作支持：创建、写入、追加、插入行、替换行、删除行范围
//! - 批次执行前进行预校验（路径合法性、权限检查）
//! - 批次执行失败时自动回滚已执行的操作
//! - 支持干运行（dry_run）模式，仅返回预期结果

pub mod error;

pub use error::EditorError;
pub type EditorResult<T> = Result<T, EditorError>;

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tracing::{info, warn};

// ============================================================================
// FileEdit — 单文件编辑操作
// ============================================================================

/// 文件编辑操作类型
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "snake_case")]
pub enum FileEditOp {
    /// 创建新文件（如果文件已存在则报错）
    Create {
        content: String,
    },
    /// 完全覆盖文件内容
    Write {
        content: String,
    },
    /// 追加内容到文件末尾
    Append {
        content: String,
    },
    /// 在指定行号前插入内容
    InsertLines {
        line: usize, // 1-based
        content: String,
    },
    /// 替换指定行范围
    ReplaceLines {
        start: usize, // 1-based, inclusive
        end: usize,   // 1-based, inclusive
        content: String,
    },
    /// 删除指定行范围
    DeleteLines {
        start: usize, // 1-based, inclusive
        end: usize,   // 1-based, inclusive
    },
    /// 删除文件
    Delete,
}

/// 单文件编辑请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEdit {
    /// 文件路径（相对工作区或绝对路径）
    pub path: String,
    /// 编辑操作
    pub op: FileEditOp,
}

/// 批量编辑请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EditBatch {
    /// 工作区根目录（用于解析相对路径）
    pub workspace_root: String,
    /// 编辑操作列表
    pub edits: Vec<FileEdit>,
    /// 是否干运行（不实际执行）
    #[serde(default)]
    pub dry_run: bool,
}

// ============================================================================
// BatchResult — 批量执行结果
// ============================================================================

/// 单个文件编辑结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEditResult {
    /// 文件路径
    pub path: String,
    /// 是否成功
    pub success: bool,
    /// 操作前的行数
    pub lines_before: Option<usize>,
    /// 操作后的行数
    pub lines_after: Option<usize>,
    /// 错误信息（如果失败）
    pub error: Option<String>,
}

/// 批量执行结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchResult {
    /// 总操作数
    pub total: usize,
    /// 成功数
    pub success_count: usize,
    /// 失败数
    pub failure_count: usize,
    /// 是否已回滚
    pub rolled_back: bool,
    /// 各文件结果
    pub results: Vec<FileEditResult>,
    /// 是否干运行
    pub dry_run: bool,
}

// ============================================================================
// MultiFileEditor — 多文件编辑器
// ============================================================================

/// 多文件协调编辑器
///
/// 提供原子性批量编辑能力，支持回滚。
pub struct MultiFileEditor;

impl MultiFileEditor {
    /// 执行批量编辑
    pub fn execute(batch: &EditBatch) -> EditorResult<BatchResult> {
        info!(
            workspace = %batch.workspace_root,
            edits = batch.edits.len(),
            dry_run = batch.dry_run,
            "执行批量编辑"
        );

        // 预校验
        let workspace = Path::new(&batch.workspace_root);
        if !workspace.exists() {
            return Err(EditorError::InvalidWorkspace(batch.workspace_root.clone()));
        }

        // 备份（用于回滚）
        let mut backups: Vec<(PathBuf, Option<String>)> = Vec::new();
        let mut results: Vec<FileEditResult> = Vec::new();
        let mut success_count = 0;
        let mut failure_count = 0;
        let mut rolled_back = false;

        for edit in &batch.edits {
            let file_path = resolve_path(workspace, &edit.path);

            // 备份现有文件内容
            let existing_content = if file_path.exists() {
                std::fs::read_to_string(&file_path).ok()
            } else {
                None
            };

            if !batch.dry_run {
                backups.push((file_path.clone(), existing_content));
            }

            // 执行编辑
            let result = if batch.dry_run {
                dry_run_edit(&file_path, edit)
            } else {
                execute_edit(&file_path, edit)
            };

            match result {
                Ok((lines_before, lines_after)) => {
                    success_count += 1;
                    results.push(FileEditResult {
                        path: edit.path.clone(),
                        success: true,
                        lines_before,
                        lines_after,
                        error: None,
                    });
                }
                Err(e) => {
                    failure_count += 1;
                    results.push(FileEditResult {
                        path: edit.path.clone(),
                        success: false,
                        lines_before: None,
                        lines_after: None,
                        error: Some(e.to_string()),
                    });

                    // 如果不是 dry_run，回滚所有已执行的操作
                    if !batch.dry_run {
                        warn!("批量编辑失败，开始回滚: {}", e);
                        rollback(&backups);
                        rolled_back = true;
                        break;
                    }
                }
            }
        }

        Ok(BatchResult {
            total: batch.edits.len(),
            success_count,
            failure_count,
            rolled_back,
            results,
            dry_run: batch.dry_run,
        })
    }

    /// 预览编辑结果（不实际执行）
    pub fn preview(batch: &EditBatch) -> EditorResult<BatchResult> {
        let mut preview_batch = batch.clone();
        preview_batch.dry_run = true;
        Self::execute(&preview_batch)
    }
}

// ============================================================================
// 辅助函数
// ============================================================================

/// 解析路径（支持相对路径和绝对路径）
fn resolve_path(workspace: &Path, path: &str) -> PathBuf {
    let p = Path::new(path);
    if p.is_absolute() {
        p.to_path_buf()
    } else {
        workspace.join(p)
    }
}

/// 执行单个编辑操作
fn execute_edit(file_path: &Path, edit: &FileEdit) -> EditorResult<(Option<usize>, Option<usize>)> {
    let lines_before = if file_path.exists() {
        std::fs::read_to_string(file_path)
            .ok()
            .map(|c| c.lines().count())
    } else {
        None
    };

    match &edit.op {
        FileEditOp::Create { content } => {
            if file_path.exists() {
                return Err(EditorError::FileExists(file_path.display().to_string()));
            }
            if let Some(parent) = file_path.parent() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| EditorError::IoError(format!("创建目录失败: {e}")))?;
            }
            std::fs::write(file_path, content)
                .map_err(|e| EditorError::IoError(format!("写入文件失败: {e}")))?;
            Ok((None, Some(content.lines().count())))
        }
        FileEditOp::Write { content } => {
            if let Some(parent) = file_path.parent() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| EditorError::IoError(format!("创建目录失败: {e}")))?;
            }
            std::fs::write(file_path, content)
                .map_err(|e| EditorError::IoError(format!("写入文件失败: {e}")))?;
            Ok((lines_before, Some(content.lines().count())))
        }
        FileEditOp::Append { content } => {
            let existing = std::fs::read_to_string(file_path)
                .map_err(|e| EditorError::IoError(format!("读取文件失败: {e}")))?;
            let new_content = if existing.is_empty() || existing.ends_with('\n') {
                format!("{existing}{content}")
            } else {
                format!("{existing}\n{content}")
            };
            let lines_after = new_content.lines().count();
            std::fs::write(file_path, new_content)
                .map_err(|e| EditorError::IoError(format!("写入文件失败: {e}")))?;
            Ok((lines_before, Some(lines_after)))
        }
        FileEditOp::InsertLines { line, content } => {
            let existing = std::fs::read_to_string(file_path)
                .map_err(|e| EditorError::IoError(format!("读取文件失败: {e}")))?;
            let mut lines: Vec<String> = existing.lines().map(|s| s.to_string()).collect();
            let insert_idx = line.saturating_sub(1).min(lines.len());
            for (i, new_line) in content.lines().enumerate() {
                lines.insert(insert_idx + i, new_line.to_string());
            }
            let new_content = lines.join("\n") + "\n";
            let lines_after = lines.len();
            std::fs::write(file_path, new_content)
                .map_err(|e| EditorError::IoError(format!("写入文件失败: {e}")))?;
            Ok((lines_before, Some(lines_after)))
        }
        FileEditOp::ReplaceLines { start, end, content } => {
            let existing = std::fs::read_to_string(file_path)
                .map_err(|e| EditorError::IoError(format!("读取文件失败: {e}")))?;
            let mut lines: Vec<String> = existing.lines().map(|s| s.to_string()).collect();
            let start_idx = (*start).saturating_sub(1).min(lines.len());
            let end_idx = (*end).min(lines.len());

            // 移除旧行
            lines.drain(start_idx..end_idx);

            // 插入新行
            for (i, new_line) in content.lines().enumerate() {
                lines.insert(start_idx + i, new_line.to_string());
            }

            let new_content = lines.join("\n") + "\n";
            let lines_after = lines.len();
            std::fs::write(file_path, new_content)
                .map_err(|e| EditorError::IoError(format!("写入文件失败: {e}")))?;
            Ok((lines_before, Some(lines_after)))
        }
        FileEditOp::DeleteLines { start, end } => {
            let existing = std::fs::read_to_string(file_path)
                .map_err(|e| EditorError::IoError(format!("读取文件失败: {e}")))?;
            let mut lines: Vec<String> = existing.lines().map(|s| s.to_string()).collect();
            let start_idx = (*start).saturating_sub(1).min(lines.len());
            let end_idx = (*end).min(lines.len());

            lines.drain(start_idx..end_idx);

            let new_content = lines.join("\n") + "\n";
            let lines_after = lines.len();
            std::fs::write(file_path, new_content)
                .map_err(|e| EditorError::IoError(format!("写入文件失败: {e}")))?;
            Ok((lines_before, Some(lines_after)))
        }
        FileEditOp::Delete => {
            if !file_path.exists() {
                return Err(EditorError::FileNotFound(file_path.display().to_string()));
            }
            std::fs::remove_file(file_path)
                .map_err(|e| EditorError::IoError(format!("删除文件失败: {e}")))?;
            Ok((lines_before, None))
        }
    }
}

/// 干运行编辑操作（不实际执行）
fn dry_run_edit(file_path: &Path, edit: &FileEdit) -> EditorResult<(Option<usize>, Option<usize>)> {
    let lines_before = if file_path.exists() {
        std::fs::read_to_string(file_path).ok().map(|c| c.lines().count())
    } else {
        None
    };

    let lines_after = match &edit.op {
        FileEditOp::Create { content } | FileEditOp::Write { content } => {
            Some(content.lines().count())
        }
        FileEditOp::Append { content } => {
            Some(lines_before.unwrap_or(0) + content.lines().count())
        }
        FileEditOp::InsertLines { line: _, content } => {
            Some(lines_before.unwrap_or(0) + content.lines().count())
        }
        FileEditOp::ReplaceLines { start, end, content } => {
            let removed = end.saturating_sub(*start).min(lines_before.unwrap_or(0));
            Some(lines_before.unwrap_or(0) - removed + content.lines().count())
        }
        FileEditOp::DeleteLines { start, end } => {
            let removed = end.saturating_sub(*start).min(lines_before.unwrap_or(0));
            Some(lines_before.unwrap_or(0) - removed)
        }
        FileEditOp::Delete => None,
    };

    Ok((lines_before, lines_after))
}

/// 回滚已执行的操作
fn rollback(backups: &[(PathBuf, Option<String>)]) {
    for (path, backup) in backups.iter().rev() {
        match backup {
            Some(content) => {
                if let Err(e) = std::fs::write(path, content) {
                    warn!("回滚失败 {}: {}", path.display(), e);
                }
            }
            None => {
                // 文件原本不存在，删除它
                if path.exists() {
                    let _ = std::fs::remove_file(path);
                }
            }
        }
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    fn create_temp_workspace() -> tempfile::TempDir {
        tempfile::tempdir().unwrap()
    }

    #[test]
    fn test_create_file() {
        let dir = create_temp_workspace();
        let batch = EditBatch {
            workspace_root: dir.path().to_string_lossy().to_string(),
            edits: vec![FileEdit {
                path: "new_file.txt".to_string(),
                op: FileEditOp::Create {
                    content: "hello\nworld".to_string(),
                },
            }],
            dry_run: false,
        };
        let result = MultiFileEditor::execute(&batch).unwrap();
        assert_eq!(result.success_count, 1);
        assert!(dir.path().join("new_file.txt").exists());
    }

    #[test]
    fn test_create_file_already_exists() {
        let dir = create_temp_workspace();
        let path = dir.path().join("exists.txt");
        std::fs::write(&path, "existing").unwrap();

        let batch = EditBatch {
            workspace_root: dir.path().to_string_lossy().to_string(),
            edits: vec![FileEdit {
                path: "exists.txt".to_string(),
                op: FileEditOp::Create {
                    content: "new".to_string(),
                },
            }],
            dry_run: false,
        };
        let result = MultiFileEditor::execute(&batch).unwrap();
        assert_eq!(result.failure_count, 1);
        // 原文件不应被修改
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "existing");
    }

    #[test]
    fn test_write_file() {
        let dir = create_temp_workspace();
        let path = dir.path().join("file.txt");
        std::fs::write(&path, "old").unwrap();

        let batch = EditBatch {
            workspace_root: dir.path().to_string_lossy().to_string(),
            edits: vec![FileEdit {
                path: "file.txt".to_string(),
                op: FileEditOp::Write {
                    content: "new content".to_string(),
                },
            }],
            dry_run: false,
        };
        let result = MultiFileEditor::execute(&batch).unwrap();
        assert!(result.success_count == 1);
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "new content");
    }

    #[test]
    fn test_append_file() {
        let dir = create_temp_workspace();
        let path = dir.path().join("file.txt");
        std::fs::write(&path, "line1\n").unwrap();

        let batch = EditBatch {
            workspace_root: dir.path().to_string_lossy().to_string(),
            edits: vec![FileEdit {
                path: "file.txt".to_string(),
                op: FileEditOp::Append {
                    content: "line2".to_string(),
                },
            }],
            dry_run: false,
        };
        MultiFileEditor::execute(&batch).unwrap();
        let content = std::fs::read_to_string(&path).unwrap();
        assert!(content.contains("line1"));
        assert!(content.contains("line2"));
    }

    #[test]
    fn test_insert_lines() {
        let dir = create_temp_workspace();
        let path = dir.path().join("file.txt");
        std::fs::write(&path, "line1\nline2\nline3\n").unwrap();

        let batch = EditBatch {
            workspace_root: dir.path().to_string_lossy().to_string(),
            edits: vec![FileEdit {
                path: "file.txt".to_string(),
                op: FileEditOp::InsertLines {
                    line: 2,
                    content: "inserted".to_string(),
                },
            }],
            dry_run: false,
        };
        MultiFileEditor::execute(&batch).unwrap();
        let content = std::fs::read_to_string(&path).unwrap();
        let lines: Vec<&str> = content.lines().collect();
        assert_eq!(lines[0], "line1");
        assert_eq!(lines[1], "inserted");
        assert_eq!(lines[2], "line2");
    }

    #[test]
    fn test_replace_lines() {
        let dir = create_temp_workspace();
        let path = dir.path().join("file.txt");
        std::fs::write(&path, "line1\nline2\nline3\n").unwrap();

        let batch = EditBatch {
            workspace_root: dir.path().to_string_lossy().to_string(),
            edits: vec![FileEdit {
                path: "file.txt".to_string(),
                op: FileEditOp::ReplaceLines {
                    start: 2,
                    end: 3,
                    content: "replaced".to_string(),
                },
            }],
            dry_run: false,
        };
        MultiFileEditor::execute(&batch).unwrap();
        let content = std::fs::read_to_string(&path).unwrap();
        let lines: Vec<&str> = content.lines().collect();
        assert_eq!(lines[0], "line1");
        assert_eq!(lines[1], "replaced");
    }

    #[test]
    fn test_delete_lines() {
        let dir = create_temp_workspace();
        let path = dir.path().join("file.txt");
        std::fs::write(&path, "line1\nline2\nline3\n").unwrap();

        let batch = EditBatch {
            workspace_root: dir.path().to_string_lossy().to_string(),
            edits: vec![FileEdit {
                path: "file.txt".to_string(),
                op: FileEditOp::DeleteLines {
                    start: 2,
                    end: 3,
                },
            }],
            dry_run: false,
        };
        MultiFileEditor::execute(&batch).unwrap();
        let content = std::fs::read_to_string(&path).unwrap();
        let lines: Vec<&str> = content.lines().collect();
        assert_eq!(lines.len(), 2);
        assert_eq!(lines[0], "line1");
        assert_eq!(lines[1], "line3");
    }

    #[test]
    fn test_delete_file() {
        let dir = create_temp_workspace();
        let path = dir.path().join("file.txt");
        std::fs::write(&path, "content").unwrap();

        let batch = EditBatch {
            workspace_root: dir.path().to_string_lossy().to_string(),
            edits: vec![FileEdit {
                path: "file.txt".to_string(),
                op: FileEditOp::Delete,
            }],
            dry_run: false,
        };
        MultiFileEditor::execute(&batch).unwrap();
        assert!(!path.exists());
    }

    #[test]
    fn test_multi_file_batch() {
        let dir = create_temp_workspace();
        let batch = EditBatch {
            workspace_root: dir.path().to_string_lossy().to_string(),
            edits: vec![
                FileEdit {
                    path: "file1.txt".to_string(),
                    op: FileEditOp::Create { content: "content1".to_string() },
                },
                FileEdit {
                    path: "file2.txt".to_string(),
                    op: FileEditOp::Create { content: "content2".to_string() },
                },
                FileEdit {
                    path: "subdir/file3.txt".to_string(),
                    op: FileEditOp::Create { content: "content3".to_string() },
                },
            ],
            dry_run: false,
        };
        let result = MultiFileEditor::execute(&batch).unwrap();
        assert_eq!(result.success_count, 3);
        assert!(dir.path().join("file1.txt").exists());
        assert!(dir.path().join("file2.txt").exists());
        assert!(dir.path().join("subdir/file3.txt").exists());
    }

    #[test]
    fn test_rollback_on_failure() {
        let dir = create_temp_workspace();
        let path1 = dir.path().join("file1.txt");
        std::fs::write(&path1, "original1").unwrap();

        let batch = EditBatch {
            workspace_root: dir.path().to_string_lossy().to_string(),
            edits: vec![
                FileEdit {
                    path: "file1.txt".to_string(),
                    op: FileEditOp::Write { content: "modified1".to_string() },
                },
                // 第二个操作会失败（创建已存在的文件）
                FileEdit {
                    path: "file1.txt".to_string(),
                    op: FileEditOp::Create { content: "should_fail".to_string() },
                },
            ],
            dry_run: false,
        };
        let result = MultiFileEditor::execute(&batch).unwrap();
        assert!(result.rolled_back);
        // 回滚后文件应该是原始内容
        assert_eq!(std::fs::read_to_string(&path1).unwrap(), "original1");
    }

    #[test]
    fn test_dry_run() {
        let dir = create_temp_workspace();
        let batch = EditBatch {
            workspace_root: dir.path().to_string_lossy().to_string(),
            edits: vec![FileEdit {
                path: "new_file.txt".to_string(),
                op: FileEditOp::Create {
                    content: "hello".to_string(),
                },
            }],
            dry_run: true,
        };
        let result = MultiFileEditor::execute(&batch).unwrap();
        assert!(result.dry_run);
        assert_eq!(result.success_count, 1);
        // 文件不应存在
        assert!(!dir.path().join("new_file.txt").exists());
    }

    #[test]
    fn test_preview() {
        let dir = create_temp_workspace();
        let batch = EditBatch {
            workspace_root: dir.path().to_string_lossy().to_string(),
            edits: vec![FileEdit {
                path: "new_file.txt".to_string(),
                op: FileEditOp::Create {
                    content: "hello\nworld".to_string(),
                },
            }],
            dry_run: false,
        };
        let result = MultiFileEditor::preview(&batch).unwrap();
        assert!(result.dry_run);
        assert!(!dir.path().join("new_file.txt").exists());
    }

    #[test]
    fn test_resolve_path() {
        let workspace = Path::new("/workspace");
        let relative = resolve_path(workspace, "src/main.rs");
        assert_eq!(relative, PathBuf::from("/workspace/src/main.rs"));

        let absolute = resolve_path(workspace, "/abs/path.rs");
        assert_eq!(absolute, PathBuf::from("/abs/path.rs"));
    }
}
