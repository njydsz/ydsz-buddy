//! Plan 导出命令
//!
//! 提供将 AI 生成的计划文档自动落盘到 `.ydsz/plans/` 目录的功能。
//! 支持导出为 spec.md（规范文档）和 plan.md（执行计划）两种格式。

use std::path::PathBuf;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use tracing::info;

/// Plan 导出格式
#[derive(Debug, Clone, Copy, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum PlanExportFormat {
    /// 规范文档（spec.md）
    Spec,
    /// 执行计划（plan.md）
    Plan,
    /// 原始 Markdown
    Markdown,
}

/// Plan 导出参数
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct PlanExportParams {
    /// 工作区根目录
    pub workspace_root: String,
    /// 线程 ID
    pub thread_id: String,
    /// 计划标题（用于生成文件名）
    pub title: String,
    /// 计划内容（Markdown 格式）
    pub content: String,
    /// 导出格式
    pub format: PlanExportFormat,
}

/// Plan 导出结果
#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct PlanExportResult {
    /// 是否成功
    pub success: bool,
    /// 输出文件路径
    pub output_path: String,
    /// 导出时间
    pub exported_at: String,
}

/// 构建 spec.md 格式内容
fn build_spec_markdown(title: &str, content: &str) -> String {
    format!(
        r#"# {} - Specification

> Generated from proposed plan at {}

## Overview

{}

## Acceptance Criteria

- [ ] All tasks completed
- [ ] Tests passing
- [ ] Code reviewed

## Risks & Mitigations

- Identify potential risks and mitigation strategies
"#,
        title,
        Utc::now().to_rfc3339(),
        content
    )
}

/// 构建 plan.md 格式内容
fn build_plan_markdown(title: &str, content: &str) -> String {
    format!(
        r#"# {} - Execution Plan

> Generated at {}

## Tasks

{}

## Timeline

- Estimated duration: TBD
- Dependencies: None

## Resources

- Required skills: Development
- Tools: Standard development environment
"#,
        title,
        Utc::now().to_rfc3339(),
        content
    )
}

/// 导出 Plan 到磁盘
///
/// 自动将计划文档保存到 `.ydsz/plans/` 目录，文件名包含日期和标题。
///
/// # 参数
///
/// - `params`: 导出参数（工作区根目录、线程 ID、标题、内容、格式）
///
/// # 返回值
///
/// - `Ok(PlanExportResult)`: 导出成功，返回输出文件路径
/// - `Err(String)`: 导出失败
#[tauri::command]
#[specta::specta]
pub async fn plan_export_to_disk(
    params: PlanExportParams,
) -> Result<PlanExportResult, String> {
    info!(
        workspace_root = %params.workspace_root,
        thread_id = %params.thread_id,
        title = %params.title,
        format = ?params.format,
        "导出 Plan 到磁盘"
    );

    // 构建输出目录：.ydsz/plans/
    let plans_dir = PathBuf::from(&params.workspace_root)
        .join(".ydsz")
        .join("plans");

    // 创建目录（如果不存在）
    std::fs::create_dir_all(&plans_dir)
        .map_err(|e| format!("创建 plans 目录失败: {}", e))?;

    // 生成文件名：YYYY-MM-DD-<title>-<format>.md
    let date_prefix = Utc::now().format("%Y-%m-%d").to_string();
    let sanitized_title = params
        .title
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '-' })
        .collect::<String>()
        .trim_matches('-')
        .to_string();

    let format_suffix = match params.format {
        PlanExportFormat::Spec => "spec",
        PlanExportFormat::Plan => "plan",
        PlanExportFormat::Markdown => "md",
    };

    let filename = format!("{}-{}-{}.md", date_prefix, sanitized_title, format_suffix);
    let output_path = plans_dir.join(&filename);

    // 根据格式生成内容
    let content = match params.format {
        PlanExportFormat::Spec => build_spec_markdown(&params.title, &params.content),
        PlanExportFormat::Plan => build_plan_markdown(&params.title, &params.content),
        PlanExportFormat::Markdown => params.content.clone(),
    };

    // 写入文件
    std::fs::write(&output_path, content)
        .map_err(|e| format!("写入 Plan 文件失败: {}", e))?;

    info!(
        output_path = %output_path.display(),
        "Plan 导出成功"
    );

    Ok(PlanExportResult {
        success: true,
        output_path: output_path.to_string_lossy().to_string(),
        exported_at: Utc::now().to_rfc3339(),
    })
}

/// 列出所有已导出的 Plan 文件
///
/// # 参数
///
/// - `workspace_root`: 工作区根目录
///
/// # 返回值
///
/// - `Ok(Vec<String>)`: Plan 文件路径列表
/// - `Err(String)`: 读取失败
#[tauri::command]
#[specta::specta]
pub async fn plan_list_exported(
    workspace_root: String,
) -> Result<Vec<String>, String> {
    let plans_dir = PathBuf::from(&workspace_root)
        .join(".ydsz")
        .join("plans");

    if !plans_dir.exists() {
        return Ok(Vec::new());
    }

    let entries = std::fs::read_dir(&plans_dir)
        .map_err(|e| format!("读取 plans 目录失败: {}", e))?;

    let mut files = Vec::new();
    for entry in entries {
        if let Ok(entry) = entry {
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) == Some("md") {
                files.push(path.to_string_lossy().to_string());
            }
        }
    }

    // 按文件名排序（最新的在前）
    files.sort_by(|a, b| b.cmp(a));

    Ok(files)
}
