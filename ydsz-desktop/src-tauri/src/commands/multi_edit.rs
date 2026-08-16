//! # 多文件协调编辑命令模块
//!
//! 提供多文件原子性批量编辑相关的 Tauri 命令。
//!
//! ## 命令清单
//!
//! | 命令 | 说明 |
//! |------|------|
//! | `multi_edit_execute` | 执行批量编辑 |
//! | `multi_edit_preview` | 预览编辑结果（不实际执行） |

use serde::{Deserialize, Serialize};
use tracing::info;

use ydsz_code::multi_edit::{MultiFileEditor, EditBatch, BatchResult, FileEdit, FileEditOp};

/// 文件编辑操作 DTO
#[derive(Debug, Clone, Deserialize, specta::Type)]
#[serde(tag = "op", rename_all = "snake_case")]
pub enum FileEditOpDto {
    Create { content: String },
    Write { content: String },
    Append { content: String },
    InsertLines { line: usize, content: String },
    ReplaceLines { start: usize, end: usize, content: String },
    DeleteLines { start: usize, end: usize },
    Delete,
}

impl From<FileEditOpDto> for FileEditOp {
    fn from(dto: FileEditOpDto) -> Self {
        match dto {
            FileEditOpDto::Create { content } => Self::Create { content },
            FileEditOpDto::Write { content } => Self::Write { content },
            FileEditOpDto::Append { content } => Self::Append { content },
            FileEditOpDto::InsertLines { line, content } => Self::InsertLines { line, content },
            FileEditOpDto::ReplaceLines { start, end, content } => Self::ReplaceLines { start, end, content },
            FileEditOpDto::DeleteLines { start, end } => Self::DeleteLines { start, end },
            FileEditOpDto::Delete => Self::Delete,
        }
    }
}

#[derive(Debug, Clone, Deserialize, specta::Type)]
pub struct FileEditDto {
    pub path: String,
    pub op: FileEditOpDto,
}

impl From<FileEditDto> for FileEdit {
    fn from(dto: FileEditDto) -> Self {
        Self {
            path: dto.path,
            op: dto.op.into(),
        }
    }
}

#[derive(Debug, Clone, Deserialize, specta::Type)]
pub struct EditBatchDto {
    pub workspace_root: String,
    pub edits: Vec<FileEditDto>,
    #[serde(default)]
    pub dry_run: bool,
}

impl From<EditBatchDto> for EditBatch {
    fn from(dto: EditBatchDto) -> Self {
        Self {
            workspace_root: dto.workspace_root,
            edits: dto.edits.into_iter().map(Into::into).collect(),
            dry_run: dto.dry_run,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct FileEditResultDto {
    pub path: String,
    pub success: bool,
    pub lines_before: Option<usize>,
    pub lines_after: Option<usize>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct BatchResultDto {
    pub total: usize,
    pub success_count: usize,
    pub failure_count: usize,
    pub rolled_back: bool,
    pub results: Vec<FileEditResultDto>,
    pub dry_run: bool,
}

impl From<BatchResult> for BatchResultDto {
    fn from(r: BatchResult) -> Self {
        Self {
            total: r.total,
            success_count: r.success_count,
            failure_count: r.failure_count,
            rolled_back: r.rolled_back,
            results: r.results.into_iter().map(|fr| FileEditResultDto {
                path: fr.path,
                success: fr.success,
                lines_before: fr.lines_before,
                lines_after: fr.lines_after,
                error: fr.error,
            }).collect(),
            dry_run: r.dry_run,
        }
    }
}

/// 执行批量编辑
#[tauri::command]
#[specta::specta]
pub async fn multi_edit_execute(batch: EditBatchDto) -> Result<BatchResultDto, String> {
    info!(workspace = %batch.workspace_root, edits = batch.edits.len(), "执行批量编辑");
    let batch: EditBatch = batch.into();
    let result = MultiFileEditor::execute(&batch).map_err(|e| e.to_string())?;
    Ok(BatchResultDto::from(result))
}

/// 预览编辑结果
#[tauri::command]
#[specta::specta]
pub async fn multi_edit_preview(batch: EditBatchDto) -> Result<BatchResultDto, String> {
    info!(workspace = %batch.workspace_root, edits = batch.edits.len(), "预览批量编辑");
    let batch: EditBatch = batch.into();
    let result = MultiFileEditor::preview(&batch).map_err(|e| e.to_string())?;
    Ok(BatchResultDto::from(result))
}
