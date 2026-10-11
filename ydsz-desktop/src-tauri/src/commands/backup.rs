//! # 备份与恢复命令
//!
//! 提供一键导出 / 恢复 ydsz-buddy 所有数据（SQLite 数据库、配置文件、工作区、日志）。
//! 对标 Octop 的 backup/ 模块。
//!
//! Tauri 命令交互流程：
//! 前端 invoke → 打包/解压 zip → 返回结果

use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use chrono::Utc;
use serde::Serialize;
use tauri::Manager;
use tracing::{info, warn};
use walkdir::WalkDir;
use zip::write::FileOptions;
use zip::CompressionMethod;

// ===========================================================================
// 数据结构
// ===========================================================================

/// 备份文件信息 DTO
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    /// 文件名
    pub filename: String,
    /// 创建时间戳（毫秒）
    pub created_at_ms: i64,
    /// 文件大小（字节）
    pub size_bytes: u64,
}

/// 备份内容清单（嵌入 zip 内的 manifest）
#[derive(Debug, Clone, Serialize)]
struct BackupManifest {
    /// 应用版本
    app_version: String,
    /// 创建时间 ISO8601
    created_at: String,
    /// 备份文件列表
    files: Vec<String>,
}

// ===========================================================================
// 内部工具
// ===========================================================================

/// 获取备份存放目录：`app_data_dir/backups/`
fn backups_dir(tauri_app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let data_dir = tauri_app
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取 app_data_dir 失败: {e}"))?;
    let backups = data_dir.join("backups");
    fs::create_dir_all(&backups)
        .map_err(|e| format!("创建备份目录失败: {e}"))?;
    Ok(backups)
}

/// 生成带时间戳的备份文件名
fn generate_backup_filename() -> String {
    let ts = Utc::now().format("%Y%m%d_%H%M%S");
    format!("ydsz_backup_{ts}.zip")
}

/// 将单个文件写入 zip
fn add_file_to_zip<W: std::io::Write + std::io::Seek>(
    zip: &mut zip::ZipWriter<W>,
    options: FileOptions,
    source_path: &Path,
    zip_entry_name: &str,
) -> Result<(), String> {
    let mut f = File::open(source_path)
        .map_err(|e| format!("无法读取文件 {}: {e}", source_path.display()))?;
    zip.start_file(zip_entry_name, options)
        .map_err(|e| format!("创建 zip 条目失败: {e}"))?;
    let mut buffer = Vec::new();
    f.read_to_end(&mut buffer)
        .map_err(|e| format!("读取文件失败: {e}"))?;
    zip.write_all(&buffer)
        .map_err(|e| format!("写入 zip 失败: {e}"))?;
    Ok(())
}

/// 递归将目录写入 zip，排除 backups 子目录避免无限嵌套
fn add_dir_to_zip<W: std::io::Write + std::io::Seek>(
    zip: &mut zip::ZipWriter<W>,
    options: FileOptions,
    source_dir: &Path,
    zip_prefix: &str,
) -> Result<Vec<String>, String> {
    let mut files = Vec::new();
    for entry in WalkDir::new(source_dir).follow_links(false) {
        let entry = entry.map_err(|e| format!("遍历目录出错: {e}"))?;
        let path = entry.path();
        // 跳过 backups 目录，避免递归包含已有备份
        if path.components().any(|c| c.as_os_str() == "backups") {
            continue;
        }
        if !entry.file_type().is_file() {
            continue;
        }
        let relative = path.strip_prefix(source_dir).unwrap_or(path);
        let entry_name = format!("{}/{}", zip_prefix, relative.display());
        add_file_to_zip(zip, options, path, &entry_name)?;
        files.push(entry_name);
    }
    Ok(files)
}

// ===========================================================================
// Tauri 命令
// ===========================================================================

/// 一键导出所有数据为 zip 备份文件
///
/// 打包内容:
/// - `database/` — SQLite 数据库文件
/// - `config/` — 配置文件（settings 等）
/// - `workspace/` — .ydsz/ 工作区配置
/// - `logs/` — 日志文件（如果存在）
/// - `manifest.json` — 备份清单（版本、时间戳、文件列表）
#[tauri::command]
#[specta::specta]
pub fn backup_export(
    app_handle: tauri::AppHandle,
    output_path: String,
) -> Result<String, String> {
    info!("开始导出备份到: {output_path}");
    let start = std::time::Instant::now();

    let options: FileOptions = FileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .unix_permissions(0o644);

    let output = PathBuf::from(&output_path);
    // 确保父目录存在
    if let Some(parent) = output.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("创建导出目录失败: {e}"))?;
    }

    let file = File::create(&output)
        .map_err(|e| format!("创建 zip 文件失败: {e}"))?;
    let mut zip = zip::ZipWriter::new(&file);
    let mut all_files: Vec<String> = Vec::new();

    // 打包 SQLite 数据库
    let data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取 app_data_dir 失败: {e}"))?;
    let db_candidates = ["ydsz.db", "ydsz-buddy.db", "data.db"];
    for name in &db_candidates {
        let db_path = data_dir.join(name);
        if db_path.exists() {
            info!("打包数据库: {name}");
            add_file_to_zip(&mut zip, options, &db_path, &format!("database/{name}"))?;
            all_files.push(format!("database/{name}"));
        }
    }

    // 打包配置文件
    let settings_candidates = ["settings.json", "settings.yaml", "config.json"];
    for name in &settings_candidates {
        let cfg_path = data_dir.join(name);
        if cfg_path.exists() {
            info!("打包配置: {name}");
            add_file_to_zip(&mut zip, options, &cfg_path, &format!("config/{name}"))?;
            all_files.push(format!("config/{name}"));
        }
    }

    // 打包 .ydsz/ 工作区配置
    let ydsz_dir = data_dir.join(".ydsz");
    if ydsz_dir.exists() && ydsz_dir.is_dir() {
        info!("打包 .ydsz 工作区");
        let ws_files = add_dir_to_zip(&mut zip, options, &ydsz_dir, "workspace")?;
        all_files.extend(ws_files);
    }

    // 打包日志文件（可选）
    let logs_dir = data_dir.join("logs");
    if logs_dir.exists() && logs_dir.is_dir() {
        info!("打包日志");
        let log_files = add_dir_to_zip(&mut zip, options, &logs_dir, "logs")?;
        all_files.extend(log_files);
    }

    // 写入 manifest
    let manifest = BackupManifest {
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        created_at: Utc::now().to_rfc3339(),
        files: all_files.clone(),
    };
    let manifest_json = serde_json::to_string_pretty(&manifest)
        .map_err(|e| format!("序列化 manifest 失败: {e}"))?;
    zip.start_file("manifest.json", options)
        .map_err(|e| format!("创建 manifest 条目失败: {e}"))?;
    zip.write_all(manifest_json.as_bytes())
        .map_err(|e| format!("写入 manifest 失败: {e}"))?;

    zip.finish()
        .map_err(|e| format!("完成 zip 打包失败: {e}"))?;

    let elapsed = start.elapsed();
    info!(
        "备份导出完成: {} 个文件, 耗时 {:.2}s",
        all_files.len(),
        elapsed.as_secs_f64()
    );

    Ok(output_path)
}

/// 从 zip 备份文件恢复所有数据
///
/// 1. 先备份当前数据到临时目录（防止误操作）
/// 2. 解压 zip 包
/// 3. 恢复到 app_data_dir
#[tauri::command]
#[specta::specta]
pub fn backup_restore(
    app_handle: tauri::AppHandle,
    backup_path: String,
) -> Result<(), String> {
    info!("开始从备份恢复: {backup_path}");

    let data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取 app_data_dir 失败: {e}"))?;

    let backup_file = PathBuf::from(&backup_path);
    if !backup_file.exists() {
        return Err(format!("备份文件不存在: {backup_path}"));
    }

    // 第一步：将当前数据备份到临时 _pre_restore 目录
    let pre_restore_dir = data_dir.join("_pre_restore");
    if pre_restore_dir.exists() {
        fs::remove_dir_all(&pre_restore_dir)
            .map_err(|e| format!("清理旧的 pre_restore 目录失败: {e}"))?;
    }
    fs::create_dir_all(&pre_restore_dir)
        .map_err(|e| format!("创建 pre_restore 目录失败: {e}"))?;

    // 复制当前关键文件到 pre_restore
    let candidates = ["ydsz.db", "ydsz-buddy.db", "data.db", "settings.json"];
    for name in &candidates {
        let src = data_dir.join(name);
        if src.exists() {
            let dst = pre_restore_dir.join(name);
            if let Err(e) = fs::copy(&src, &dst) {
                warn!("复制 {name} 到 pre_restore 失败: {e}");
            }
        }
    }
    let ydsz_dir = data_dir.join(".ydsz");
    if ydsz_dir.exists() {
        let dst = pre_restore_dir.join(".ydsz");
        let _ = copy_dir_recursive(&ydsz_dir, &dst);
    }

    // 第二步：解压 zip
    let file = File::open(&backup_file)
        .map_err(|e| format!("打开备份文件失败: {e}"))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| format!("解析 zip 文件失败: {e}"))?;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i)
            .map_err(|e| format!("读取 zip 条目失败: {e}"))?;
        let entry_name = entry.name().to_string();

        // 跳过 manifest.json
        if entry_name == "manifest.json" {
            continue;
        }

        // 目标路径: data_dir + 去掉前缀（database/ → 根目录
        let relative = entry_name
            .trim_start_matches("database/")
            .trim_start_matches("config/");
        let dest_path = data_dir.join(relative);

        // 确保父目录存在
        if let Some(parent) = dest_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("创建目录 {} 失败: {e}", parent.display()))?;
        }

        if entry.is_dir() {
            fs::create_dir_all(&dest_path)
                .map_err(|e| format!("创建目录失败: {e}"))?;
        } else {
            let mut outfile = File::create(&dest_path)
                .map_err(|e| format!("创建文件 {} 失败: {e}", dest_path.display()))?;
            let mut buffer = Vec::new();
            entry.read_to_end(&mut buffer)
                .map_err(|e| format!("读取 zip 条目失败: {e}"))?;
            outfile.write_all(&buffer)
                .map_err(|e| format!("写入文件失败: {e}"))?;
        }
    }

    info!("备份恢复完成");
    Ok(())
}

/// 列出 backups/ 目录下所有备份文件
#[tauri::command]
#[specta::specta]
pub fn backup_list(
    app_handle: tauri::AppHandle,
) -> Result<Vec<BackupInfo>, String> {
    let backups = backups_dir(&app_handle)?;
    let mut infos = Vec::new();

    for entry in fs::read_dir(&backups)
        .map_err(|e| format!("读取备份目录失败: {e}"))?
    {
        let entry = entry.map_err(|e| format!("读取目录条目失败: {e}"))?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("zip") {
            continue;
        }
        let metadata = entry.metadata()
            .map_err(|e| format!("读取文件元数据失败: {e}"))?;
        let filename = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown.zip")
            .to_string();
        let created_at_ms = metadata
            .created()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);
        infos.push(BackupInfo {
            filename,
            created_at_ms,
            size_bytes: metadata.len(),
        });
    }

    // 按创建时间倒序排列
    infos.sort_by(|a, b| b.created_at_ms.cmp(&a.created_at_ms));
    Ok(infos)
}

/// 删除指定备份文件
#[tauri::command]
#[specta::specta]
pub fn backup_delete(
    app_handle: tauri::AppHandle,
    filename: String,
) -> Result<(), String> {
    let backups = backups_dir(&app_handle)?;
    let target = backups.join(&filename);

    // 安全检查：确保路径在 backups 目录下
    let canonical = target.canonicalize()
        .map_err(|e| format!("解析路径失败: {e}"))?;
    let canonical_backups = backups.canonicalize()
        .map_err(|e| format!("解析 backups 路径失败: {e}"))?;
    if !canonical.starts_with(&canonical_backups) {
        return Err("非法路径: 文件不在备份目录内".to_string());
    }

    fs::remove_file(&canonical)
        .map_err(|e| format!("删除备份文件失败: {e}"))?;

    info!("已删除备份: {filename}");
    Ok(())
}

// ===========================================================================
// 递归复制目录
// ===========================================================================

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    fs::create_dir_all(dst).map_err(|e| format!("创建目录失败: {e}"))?;
    for entry in fs::read_dir(src).map_err(|e| format!("读取目录失败: {e}"))? {
        let entry = entry.map_err(|e| format!("读取目录条目失败: {e}"))?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            fs::copy(&src_path, &dst_path).map_err(|e| format!("复制文件失败: {e}"))?;
        }
    }
    Ok(())
}
