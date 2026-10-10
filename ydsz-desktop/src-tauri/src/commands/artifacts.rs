//! 产物导出命令模块
//!
//! 提供 AI 执行产物的导出功能：
//!
//! | 命令 | 说明 |
//! |------|------|
//! | `artifacts_export_all` | 导出指定线程的所有产物到用户选择的目录 |

use serde::{Deserialize, Serialize};
use specta::Type;
use std::fs;
use std::path::PathBuf;
use tauri_plugin_dialog::DialogExt;
use uuid::Uuid;

/// Diff 条目
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ArtifactDiffItem {
    pub path: String,
    pub before: String,
    pub after: String,
}

/// 预览条目类型
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum ArtifactPreviewKind {
    Html,
    Ppt,
}

/// 预览条目
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ArtifactPreviewItem {
    #[serde(rename = "type")]
    pub preview_type: ArtifactPreviewKind,
    pub content: String,
}

/// 文件条目
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ArtifactFileItem {
    pub path: String,
    pub status: String,
}

/// 产物导出请求输入
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ArtifactsExportAllInput {
    pub thread_id: String,
    pub artifacts: ArtifactsExportData,
}

/// 产物导出数据结构
#[derive(Debug, Clone, Default, Serialize, Deserialize, Type)]
pub struct ArtifactsExportData {
    pub spec: Option<String>,
    pub diffs: Option<Vec<ArtifactDiffItem>>,
    pub preview: Option<ArtifactPreviewItem>,
    pub terminal: Option<Vec<String>>,
    pub files: Option<Vec<ArtifactFileItem>>,
}

/// 产物导出结果
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ArtifactsExportAllResult {
    pub request_id: String,
    pub output_dir: String,
    pub exported_count: usize,
    pub exported_files: Vec<String>,
}

/// 导出所有产物到用户选择的目录
///
/// 将线程的产物（spec/diffs/preview/terminal/files）统一导出到指定目录中。
#[tauri::command]
#[specta::specta]
pub async fn artifacts_export_all(
    app: tauri::AppHandle,
    input: ArtifactsExportAllInput,
) -> Result<ArtifactsExportAllResult, String> {
    let request_id = Uuid::new_v4().to_string();

    tracing::info!(
        thread_id = %input.thread_id,
        request_id = %request_id,
        "收到产物全量导出请求"
    );

    // 让用户选择导出目录
    let output_dir = {
        let dlg = app.dialog();
        let folder = dlg.file().blocking_pick_folder();
        match folder {
            Some(p) => p.to_string().to_string(),
            None => {
                return Ok(ArtifactsExportAllResult {
                    request_id,
                    output_dir: String::new(),
                    exported_count: 0,
                    exported_files: vec![],
                });
            }
        }
    };

    let mut exported_files: Vec<String> = Vec::new();
    let thread_short = &input.thread_id[..8.min(input.thread_id.len())];
    let thread_dir = PathBuf::from(&output_dir).join(format!("artifacts-{}", thread_short));

    fs::create_dir_all(&thread_dir).map_err(|e| format!("创建导出目录失败: {}", e))?;

    // 1. 导出 spec（规范文档）
    if let Some(spec) = &input.artifacts.spec {
        if !spec.trim().is_empty() {
            let spec_path = thread_dir.join("spec.md");
            fs::write(&spec_path, spec).map_err(|e| format!("写入 spec.md 失败: {}", e))?;
            exported_files.push(spec_path.to_string_lossy().to_string());
        }
    }

    // 2. 导出 diffs
    if let Some(diffs) = &input.artifacts.diffs {
        for (i, diff) in diffs.iter().enumerate() {
            let diff_content = format!(
                "--- a/{}\n+++ b/{}\n\n@@ Before @@\n{}\n\n@@ After @@\n{}",
                diff.path, diff.path, diff.before, diff.after
            );
            let safe_name = diff.path.replace('/', "_").replace('\\', "_");
            let diff_path = thread_dir.join(format!("{}_{}.diff", i, safe_name));
            fs::write(&diff_path, &diff_content)
                .map_err(|e| format!("写入 diff 文件失败: {}", e))?;
            exported_files.push(diff_path.to_string_lossy().to_string());
        }
    }

    // 3. 导出 preview
    if let Some(preview) = &input.artifacts.preview {
        let ext = match preview.preview_type {
            ArtifactPreviewKind::Html => "html",
            ArtifactPreviewKind::Ppt => "ppt.html",
        };
        let preview_path = thread_dir.join(format!("preview.{}", ext));
        fs::write(&preview_path, &preview.content)
            .map_err(|e| format!("写入 preview 文件失败: {}", e))?;
        exported_files.push(preview_path.to_string_lossy().to_string());
    }

    // 4. 导出 terminal logs
    if let Some(logs) = &input.artifacts.terminal {
        if !logs.is_empty() {
            let terminal_path = thread_dir.join("terminal.log");
            fs::write(&terminal_path, logs.join("\n"))
                .map_err(|e| format!("写入 terminal.log 失败: {}", e))?;
            exported_files.push(terminal_path.to_string_lossy().to_string());
        }
    }

    // 5. 导出 files 清单
    if let Some(files) = &input.artifacts.files {
        if !files.is_empty() {
            let manifest: Vec<String> = files
                .iter()
                .map(|f| format!("[{}] {}", f.status.to_uppercase(), f.path))
                .collect();
            let manifest_path = thread_dir.join("files_manifest.txt");
            fs::write(&manifest_path, manifest.join("\n"))
                .map_err(|e| format!("写入 manifest 失败: {}", e))?;
            exported_files.push(manifest_path.to_string_lossy().to_string());
        }
    }

    let exported_count = exported_files.len();
    tracing::info!(
        thread_id = %input.thread_id,
        request_id = %request_id,
        exported_count = exported_count,
        "产物导出完成"
    );

    Ok(ArtifactsExportAllResult {
        request_id,
        output_dir,
        exported_count,
        exported_files,
    })
}
