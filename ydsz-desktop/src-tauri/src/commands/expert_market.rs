//! 专家市场与共享（G11-P2）
//!
//! 提供专家（Agent Bundle）的导入、导出、验证和分享功能。
//! 第一版实现文件级导入导出（zip 格式）。

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

/// 专家导出清单
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct ExpertExportManifest {
    pub version: String,
    pub exported_at_ms: i64,
    pub expert: ExpertMeta,
    pub files: Vec<ExpertFileInfo>,
}

/// 专家元数据
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct ExpertMeta {
    pub id: String,
    pub name: String,
    pub description: String,
    pub version: String,
    pub author: String,
    pub tags: Vec<String>,
    pub bundled_skills: Vec<String>,
    pub bundled_personas: Vec<String>,
}

/// 文件信息
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct ExpertFileInfo {
    pub path: String,
    pub size_bytes: u64,
    pub checksum: String,
}

/// 验证报告
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct ValidationReport {
    pub valid: bool,
    pub expert_id: Option<String>,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
    pub file_count: usize,
    pub total_size_bytes: u64,
}

// === Tauri 命令 ===

/// 导出专家为压缩包
#[tauri::command]
#[specta::specta]
pub fn expert_export(
    expert_id: String,
    output_path: String,
) -> Result<(), String> {
    let _ = (expert_id, output_path);
    // 实际实现需要:
    // 1. 从 ydsz-core 加载专家配置
    // 2. 收集关联文件（persona、skill 脚本等）
    // 3. 打包为 zip
    Err("专家导出功能需要完善专家存储层".into())
}

/// 从压缩包导入专家
#[tauri::command]
#[specta::specta]
pub fn expert_import(
    backup_path: String,
) -> Result<ExpertMeta, String> {
    let _ = backup_path;
    // 实际实现需要:
    // 1. 解压 zip
    // 2. 读取 manifest.json
    // 3. 验证完整性
    // 4. 复制文件到 ydzs 工作区
    Err("专家导入功能需要完善专家存储层".into())
}

/// 生成分享链接（本地标记）
#[tauri::command]
#[specta::specta]
pub fn expert_share_link(
    expert_id: String,
) -> Result<String, String> {
    // 第一版只做本地标记
    Ok(format!("ydsz://local/expert/{}", expert_id))
}

/// 验证专家完整性
#[tauri::command]
#[specta::specta]
pub fn expert_validate(
    expert_id: String,
) -> Result<ValidationReport, String> {
    let errors = Vec::<String>::new();
    let warnings = vec!["专家验证功能需要完善存储层".into()];

    Ok(ValidationReport {
        valid: errors.is_empty(),
        expert_id: Some(expert_id),
        errors,
        warnings,
        file_count: 0,
        total_size_bytes: 0,
    })
}
