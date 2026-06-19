//! 工作空间目录浏览与搜索

use std::path::Path;

use globset::{Glob, GlobSetBuilder};
use serde::{Deserialize, Serialize};
use tracing::{debug, info};
use walkdir::WalkDir;

use crate::error::{WorkspaceError, WorkspaceResult};

/// 目录条目
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirectoryEntry {
    /// 名称
    pub name: String,
    /// 相对路径
    pub path: String,
    /// 是否为目录
    pub is_directory: bool,
    /// 文件大小（字节）
    pub size: Option<u64>,
}

/// 浏览目录输入
#[derive(Debug, Clone)]
pub struct BrowseInput {
    /// 工作目录
    pub cwd: String,
    /// 相对路径（可选，默认根目录）
    pub relative_path: Option<String>,
    /// 是否包含隐藏文件
    pub include_hidden: bool,
    /// 最大深度
    pub max_depth: Option<usize>,
}

/// 浏览目录结果
#[derive(Debug, Clone)]
pub struct BrowseResult {
    /// 条目列表
    pub entries: Vec<DirectoryEntry>,
    /// 当前路径
    pub path: String,
}

/// 搜索条目输入
#[derive(Debug, Clone)]
pub struct SearchEntriesInput {
    /// 工作目录
    pub cwd: String,
    /// 搜索查询
    pub query: String,
    /// 最大结果数
    pub max_results: Option<usize>,
    /// 文件类型过滤（glob 模式）
    pub file_pattern: Option<String>,
}

/// 搜索条目结果
#[derive(Debug, Clone)]
pub struct SearchEntriesResult {
    /// 匹配的条目
    pub entries: Vec<DirectoryEntry>,
    /// 总匹配数
    pub total_count: usize,
}

/// 列出目录输入
#[derive(Debug, Clone)]
pub struct ListDirectoriesInput {
    /// 工作目录
    pub cwd: String,
    /// 最大深度
    pub max_depth: Option<usize>,
}

/// 列出目录结果
#[derive(Debug, Clone)]
pub struct ListDirectoriesResult {
    /// 目录列表
    pub directories: Vec<DirectoryEntry>,
}

/// 工作空间条目服务
pub struct WorkspaceEntries;

impl WorkspaceEntries {
    /// 创建新的条目服务
    pub fn new() -> Self {
        Self
    }

    /// 浏览目录
    pub async fn browse(&self, input: BrowseInput) -> WorkspaceResult<BrowseResult> {
        let base_path = if let Some(ref rel) = input.relative_path {
            Path::new(&input.cwd).join(rel)
        } else {
            Path::new(&input.cwd).to_path_buf()
        };

        if !base_path.exists() {
            return Err(WorkspaceError::DirectoryNotFound(
                base_path.to_string_lossy().to_string(),
            ));
        }

        info!("浏览目录: {}", base_path.display());

        let max_depth = input.max_depth.unwrap_or(1);
        let mut entries = Vec::new();

        let walker = WalkDir::new(&base_path)
            .max_depth(max_depth)
            .min_depth(1)
            .into_iter()
            .filter_entry(|e| {
                if input.include_hidden {
                    return true;
                }
                e.file_name()
                    .to_str()
                    .map(|s| !s.starts_with('.'))
                    .unwrap_or(true)
            });

        for entry in walker {
            let entry = match entry {
                Ok(e) => e,
                Err(_) => continue,
            };

            let file_type = entry.file_type();
            let name = entry.file_name().to_string_lossy().to_string();
            let relative = entry
                .path()
                .strip_prefix(&input.cwd)
                .unwrap_or(entry.path())
                .to_string_lossy()
                .to_string();

            let size = if file_type.is_file() {
                entry.metadata().ok().map(|m| m.len())
            } else {
                None
            };

            entries.push(DirectoryEntry {
                name,
                path: relative,
                is_directory: file_type.is_dir(),
                size,
            });
        }

        // 排序：目录在前，然后按名称排序
        entries.sort_by(|a, b| {
            match b.is_directory.cmp(&a.is_directory) {
                std::cmp::Ordering::Equal => a.name.cmp(&b.name),
                other => other,
            }
        });

        Ok(BrowseResult {
            entries,
            path: base_path.to_string_lossy().to_string(),
        })
    }

    /// 搜索条目
    pub async fn search(&self, input: SearchEntriesInput) -> WorkspaceResult<SearchEntriesResult> {
        info!("搜索条目: cwd={}, query={}", input.cwd, input.query);

        let max_results = input.max_results.unwrap_or(100);
        let mut entries = Vec::new();
        let query_lower = input.query.to_lowercase();

        // 构建文件类型过滤器
        let mut glob_builder = GlobSetBuilder::new();
        if let Some(ref pattern) = input.file_pattern {
            if let Ok(glob) = Glob::new(pattern) {
                glob_builder.add(glob);
            }
        }
        let file_filter = glob_builder.build().ok();

        let walker = WalkDir::new(&input.cwd)
            .into_iter()
            .filter_entry(|e| {
                e.file_name()
                    .to_str()
                    .map(|s| !s.starts_with('.'))
                    .unwrap_or(true)
            });

        for entry in walker {
            let entry = match entry {
                Ok(e) => e,
                Err(_) => continue,
            };

            let name = entry.file_name().to_string_lossy().to_string();

            // 名称匹配查询
            if !name.to_lowercase().contains(&query_lower) {
                continue;
            }

            // 文件类型过滤
            if let Some(ref filter) = file_filter {
                if entry.file_type().is_file() && !filter.is_empty() && !filter.is_match(&name) {
                    continue;
                }
            }

            let relative = entry
                .path()
                .strip_prefix(&input.cwd)
                .unwrap_or(entry.path())
                .to_string_lossy()
                .to_string();

            let size = if entry.file_type().is_file() {
                entry.metadata().ok().map(|m| m.len())
            } else {
                None
            };

            entries.push(DirectoryEntry {
                name,
                path: relative,
                is_directory: entry.file_type().is_dir(),
                size,
            });

            if entries.len() >= max_results {
                break;
            }
        }

        let total_count = entries.len();

        Ok(SearchEntriesResult {
            entries,
            total_count,
        })
    }

    /// 列出目录
    pub async fn list_directories(
        &self,
        input: ListDirectoriesInput,
    ) -> WorkspaceResult<ListDirectoriesResult> {
        info!("列出目录: cwd={}", input.cwd);

        let max_depth = input.max_depth.unwrap_or(3);
        let mut directories = Vec::new();

        let walker = WalkDir::new(&input.cwd)
            .max_depth(max_depth)
            .min_depth(1)
            .into_iter()
            .filter_entry(|e| {
                e.file_name()
                    .to_str()
                    .map(|s| !s.starts_with('.'))
                    .unwrap_or(true)
            });

        for entry in walker {
            let entry = match entry {
                Ok(e) => e,
                Err(_) => continue,
            };

            if !entry.file_type().is_dir() {
                continue;
            }

            let name = entry.file_name().to_string_lossy().to_string();
            let relative = entry
                .path()
                .strip_prefix(&input.cwd)
                .unwrap_or(entry.path())
                .to_string_lossy()
                .to_string();

            directories.push(DirectoryEntry {
                name,
                path: relative,
                is_directory: true,
                size: None,
            });
        }

        directories.sort_by(|a, b| a.path.cmp(&b.path));

        Ok(ListDirectoriesResult { directories })
    }

    /// 使缓存失效
    pub async fn invalidate(&self, _cwd: &str) {
        // TODO: 实现缓存失效逻辑
        debug!("缓存失效: {}", _cwd);
    }
}

impl Default for WorkspaceEntries {
    fn default() -> Self {
        Self::new()
    }
}
