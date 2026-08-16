//! # 文件系统管理命令模块
//!
//! 提供文件系统操作相关的 Tauri 命令。
//!
//! ## 命令清单
//!
//! | 命令 | 说明 |
//! |------|------|
//! | `fs_list_directory` | 列出目录内容 |
//! | `fs_read_file` | 读取文件内容 |
//! | `fs_write_file` | 写入文件 |
//! | `fs_search_files` | 搜索文件名 |
//! | `fs_file_info` | 获取文件信息 |
//!
//! ## 安全设计
//!
//! 所有命令均使用 [`PathGuard`] 进行路径校验：
//! - 阻止 `../` 路径遍历攻击
//! - 阻止符号链接逃逸工作区
//! - 阻断访问系统敏感目录（/etc, /sys, /proc, C:\Windows 等）
//!
//! 工作区根目录由 Tauri State 中的 `workspace_roots` 提供。

use serde::{Deserialize, Serialize};
use std::sync::OnceLock;
use tracing::{info, warn};

use ydsz_work::filesystem::{
    list_directory_guarded, read_file_guarded, write_file_guarded,
    search_files_guarded, file_info_guarded,
    PathGuard, SymlinkPolicy,
    DirEntry, FileInfo, SearchFilesResult,
};

/// 全局 PathGuard 实例（懒初始化，首次调用时构建）
static PATH_GUARD: OnceLock<PathGuard> = OnceLock::new();

/// 当前进程的工作区根目录（由 main.rs 初始化）
static WORKSPACE_ROOTS: OnceLock<Vec<String>> = OnceLock::new();

/// 初始化工作区根目录（在 Tauri setup 阶段调用）
pub fn init_workspace_roots(roots: Vec<String>) {
    if !roots.is_empty() {
        let _ = WORKSPACE_ROOTS.set(roots.clone());
        let guard = PathGuard::new(roots)
            .with_symlink_policy(SymlinkPolicy::AllowWithinRoots);
        let _ = PATH_GUARD.set(guard);
    }
}

/// 获取 PathGuard 实例（未初始化时返回 Permissive 模式）
fn get_path_guard() -> &'static PathGuard {
    PATH_GUARD.get_or_init(|| {
        let roots = WORKSPACE_ROOTS.get().cloned().unwrap_or_default();
        if roots.is_empty() {
            PathGuard::permissive()
        } else {
            PathGuard::new(roots)
                .with_symlink_policy(SymlinkPolicy::AllowWithinRoots)
        }
    })
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct DirEntryDto {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: Option<u64>,
    pub modified: Option<u64>,
}

impl From<DirEntry> for DirEntryDto {
    fn from(e: DirEntry) -> Self {
        Self { name: e.name, path: e.path, is_dir: e.is_dir, size: e.size, modified: e.modified }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct FileInfoDto {
    pub path: String,
    pub size: u64,
    pub is_dir: bool,
    pub modified: Option<u64>,
    pub created: Option<u64>,
    pub read_only: bool,
}

impl From<FileInfo> for FileInfoDto {
    fn from(f: FileInfo) -> Self {
        Self { path: f.path, size: f.size, is_dir: f.is_dir, modified: f.modified, created: f.created, read_only: f.read_only }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct SearchFilesResultDto {
    pub pattern: String,
    pub matches: Vec<String>,
    pub root: String,
}

impl From<SearchFilesResult> for SearchFilesResultDto {
    fn from(s: SearchFilesResult) -> Self {
        Self { pattern: s.pattern, matches: s.matches, root: s.root }
    }
}

/// 列出目录内容
#[tauri::command]
#[specta::specta]
pub async fn fs_list_directory(path: String) -> Result<Vec<DirEntryDto>, String> {
    info!(path = %path, "列出目录");
    let guard = get_path_guard();
    let entries = list_directory_guarded(guard, &path).map_err(|e| {
        warn!(path = %path, error = %e, "目录列表被安全策略阻止");
        e.to_string()
    })?;
    Ok(entries.into_iter().map(Into::into).collect())
}

/// 读取文件内容
#[tauri::command]
#[specta::specta]
pub async fn fs_read_file(path: String) -> Result<String, String> {
    info!(path = %path, "读取文件");
    let guard = get_path_guard();
    read_file_guarded(guard, &path).map_err(|e| {
        warn!(path = %path, error = %e, "文件读取被安全策略阻止");
        e.to_string()
    })
}

/// 写入文件
#[tauri::command]
#[specta::specta]
pub async fn fs_write_file(path: String, content: String) -> Result<(), String> {
    info!(path = %path, len = content.len(), "写入文件");
    let guard = get_path_guard();
    write_file_guarded(guard, &path, &content).map_err(|e| {
        warn!(path = %path, error = %e, "文件写入被安全策略阻止");
        e.to_string()
    })
}

/// 搜索文件名
#[tauri::command]
#[specta::specta]
pub async fn fs_search_files(
    root: String,
    pattern: String,
    max_results: Option<usize>,
) -> Result<SearchFilesResultDto, String> {
    info!(root = %root, pattern = %pattern, "搜索文件");
    let guard = get_path_guard();
    let result = search_files_guarded(guard, &root, &pattern, max_results.unwrap_or(100))
        .map_err(|e| {
            warn!(root = %root, error = %e, "文件搜索被安全策略阻止");
            e.to_string()
        })?;
    Ok(result.into())
}

/// 获取文件信息
#[tauri::command]
#[specta::specta]
pub async fn fs_file_info(path: String) -> Result<FileInfoDto, String> {
    info!(path = %path, "获取文件信息");
    let guard = get_path_guard();
    let info = file_info_guarded(guard, &path).map_err(|e| {
        warn!(path = %path, error = %e, "文件信息获取被安全策略阻止");
        e.to_string()
    })?;
    Ok(info.into())
}
