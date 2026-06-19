//! # 工作空间目录浏览与搜索模块
//!
//! 本模块提供工作空间内目录结构的遍历、文件搜索和目录列举功能。
//!
//! ## 核心功能
//!
//! - **目录浏览**：支持递归/非递归浏览指定目录，返回结构化的目录条目列表
//! - **文件搜索**：基于名称关键字匹配和 glob 模式的文件搜索，支持大小写不敏感查询
//! - **目录列举**：递归列出工作空间内的所有目录结构，用于构建目录树
//!
//! ## 使用场景
//!
//! - IDE/编辑器中的文件树展示
//! - 工作空间内的快速文件搜索与定位
//! - 目录结构分析与可视化
//!
//! ## 核心类型
//!
//! - [`WorkspaceEntries`]：工作空间条目服务，提供所有目录操作的入口
//! - [`DirectoryEntry`]：目录条目数据结构，表示一个文件或目录
//! - [`BrowseInput`] / [`BrowseResult`]：目录浏览的输入输出参数
//! - [`SearchEntriesInput`] / [`SearchEntriesResult`]：文件搜索的输入输出参数
//! - [`ListDirectoriesInput`] / [`ListDirectoriesResult`]：目录列举的输入输出参数
//!
//! ## 典型用法
//!
//! ```rust,no_run
//! use remi_workspace::entries::{WorkspaceEntries, BrowseInput};
//!
//! let entries = WorkspaceEntries::new();
//! let result = entries.browse(BrowseInput {
//!     cwd: "/path/to/workspace".to_string(),
//!     relative_path: Some("src".to_string()),
//!     include_hidden: false,
//!     max_depth: Some(2),
//! }).await.unwrap();
//!
//! for entry in result.entries {
//!     println!("{}: {}", entry.name, entry.path);
//! }
//! ```

use std::path::Path;

use globset::{Glob, GlobSetBuilder};
use serde::{Deserialize, Serialize};
use tracing::{debug, info};
use walkdir::WalkDir;

use crate::error::{WorkspaceError, WorkspaceResult};

/// # 目录条目
///
/// 表示工作空间中的一个文件或目录条目，包含基本信息如名称、路径、类型和大小。
///
/// ## 字段说明
///
/// - `name`：条目名称（不含路径，如 `main.rs`、`src`）
/// - `path`：相对于工作空间根目录的路径（如 `src/main.rs`）
/// - `is_directory`：标识该条目是否为目录
/// - `size`：文件大小（字节），仅对文件有效；目录为 `None`
///
/// ## 使用场景
///
/// - 作为目录浏览、文件搜索、目录列举等操作的返回结果
/// - 用于构建文件树、展示文件列表等 UI 场景
/// - 可序列化为 JSON，便于前后端数据传输
///
/// ## 示例
///
/// ```rust
/// use remi_workspace::entries::DirectoryEntry;
///
/// let entry = DirectoryEntry {
///     name: "main.rs".to_string(),
///     path: "src/main.rs".to_string(),
///     is_directory: false,
///     size: Some(1024),
/// };
/// ```
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirectoryEntry {
    /// 条目名称（不含路径）
    pub name: String,
    /// 相对于工作空间根目录的路径
    pub path: String,
    /// 是否为目录
    pub is_directory: bool,
    /// 文件大小（字节），仅对文件有效
    pub size: Option<u64>,
}

/// # 浏览目录输入参数
///
/// 用于 [`WorkspaceEntries::browse`] 方法的输入参数结构。
///
/// ## 字段说明
///
/// - `cwd`：工作目录的绝对路径，作为浏览的根目录
/// - `relative_path`：相对于 `cwd` 的子目录路径（可选），默认为根目录
/// - `include_hidden`：是否包含隐藏文件/目录（以 `.` 开头的文件）
/// - `max_depth`：最大递归深度（可选），默认为 1（仅当前目录）
///
/// ## 使用场景
///
/// - 浏览工作空间根目录：`relative_path = None`
/// - 浏览特定子目录：`relative_path = Some("src/components")`
/// - 递归浏览整个目录树：`max_depth = None` 或较大的值
///
/// ## 示例
///
/// ```rust
/// use remi_workspace::entries::BrowseInput;
///
/// let input = BrowseInput {
///     cwd: "/project".to_string(),
///     relative_path: Some("src".to_string()),
///     include_hidden: false,
///     max_depth: Some(3),
/// };
/// ```
#[derive(Debug, Clone)]
pub struct BrowseInput {
    /// 工作目录的绝对路径
    pub cwd: String,
    /// 相对于工作目录的子目录路径（可选）
    pub relative_path: Option<String>,
    /// 是否包含隐藏文件/目录
    pub include_hidden: bool,
    /// 最大递归深度
    pub max_depth: Option<usize>,
}

/// # 浏览目录结果
///
/// [`WorkspaceEntries::browse`] 方法的返回结果结构。
///
/// ## 字段说明
///
/// - `entries`：匹配条件的目录条目列表，已排序（目录在前，然后按名称排序）
/// - `path`：实际浏览的绝对路径
///
/// ## 使用场景
///
/// - 展示目录内容列表
/// - 构建文件树结构
/// - 分析目录组成
#[derive(Debug, Clone)]
pub struct BrowseResult {
    /// 目录条目列表（已排序）
    pub entries: Vec<DirectoryEntry>,
    /// 实际浏览的绝对路径
    pub path: String,
}

/// # 搜索条目输入参数
///
/// 用于 [`WorkspaceEntries::search`] 方法的输入参数结构。
///
/// ## 字段说明
///
/// - `cwd`：工作目录的绝对路径，作为搜索的根目录
/// - `query`：搜索查询字符串，支持大小写不敏感的名称匹配
/// - `max_results`：最大返回结果数（可选），默认为 100
/// - `file_pattern`：文件类型过滤的 glob 模式（可选），如 `*.rs`、`*.txt`
///
/// ## 使用场景
///
/// - 按文件名关键字搜索：`query = "main"`
/// - 限定文件类型搜索：`file_pattern = Some("*.rs")`
/// - 限制结果数量：`max_results = Some(50)`
///
/// ## 示例
///
/// ```rust
/// use remi_workspace::entries::SearchEntriesInput;
///
/// let input = SearchEntriesInput {
///     cwd: "/project".to_string(),
///     query: "config".to_string(),
///     max_results: Some(50),
///     file_pattern: Some("*.json".to_string()),
/// };
/// ```
#[derive(Debug, Clone)]
pub struct SearchEntriesInput {
    /// 工作目录的绝对路径
    pub cwd: String,
    /// 搜索查询字符串
    pub query: String,
    /// 最大返回结果数
    pub max_results: Option<usize>,
    /// 文件类型过滤的 glob 模式
    pub file_pattern: Option<String>,
}

/// # 搜索条目结果
///
/// [`WorkspaceEntries::search`] 方法的返回结果结构。
///
/// ## 字段说明
///
/// - `entries`：匹配的目录条目列表
/// - `total_count`：总匹配数（与 `entries.len()` 相同，便于扩展）
///
/// ## 使用场景
///
/// - 展示搜索结果列表
/// - 显示匹配数量统计
#[derive(Debug, Clone)]
pub struct SearchEntriesResult {
    /// 匹配的目录条目列表
    pub entries: Vec<DirectoryEntry>,
    /// 总匹配数
    pub total_count: usize,
}

/// # 列出目录输入参数
///
/// 用于 [`WorkspaceEntries::list_directories`] 方法的输入参数结构。
///
/// ## 字段说明
///
/// - `cwd`：工作目录的绝对路径，作为列举的根目录
/// - `max_depth`：最大递归深度（可选），默认为 3
///
/// ## 使用场景
///
/// - 构建目录树选择器
/// - 分析项目目录结构
/// - 生成目录索引
///
/// ## 示例
///
/// ```rust
/// use remi_workspace::entries::ListDirectoriesInput;
///
/// let input = ListDirectoriesInput {
///     cwd: "/project".to_string(),
///     max_depth: Some(5),
/// };
/// ```
#[derive(Debug, Clone)]
pub struct ListDirectoriesInput {
    /// 工作目录的绝对路径
    pub cwd: String,
    /// 最大递归深度
    pub max_depth: Option<usize>,
}

/// # 列出目录结果
///
/// [`WorkspaceEntries::list_directories`] 方法的返回结果结构。
///
/// ## 字段说明
///
/// - `directories`：目录条目列表，按路径排序
///
/// ## 使用场景
///
/// - 构建目录树结构
/// - 展示项目目录列表
#[derive(Debug, Clone)]
pub struct ListDirectoriesResult {
    /// 目录条目列表（按路径排序）
    pub directories: Vec<DirectoryEntry>,
}

/// # 工作空间条目服务
///
/// 提供工作空间内目录浏览、文件搜索和目录列举的核心服务。
///
/// ## 核心方法
///
/// - [`browse`](WorkspaceEntries::browse)：浏览指定目录的内容
/// - [`search`](WorkspaceEntries::search)：按名称和类型搜索文件
/// - [`list_directories`](WorkspaceEntries::list_directories)：列举所有目录
/// - [`invalidate`](WorkspaceEntries::invalidate)：使缓存失效（预留接口）
///
/// ## 使用场景
///
/// - IDE/编辑器的文件树功能
/// - 工作空间内的快速搜索
/// - 目录结构分析
///
/// ## 典型用法
///
/// ```rust,no_run
/// use remi_workspace::entries::{WorkspaceEntries, BrowseInput};
///
/// let service = WorkspaceEntries::new();
/// let result = service.browse(BrowseInput {
///     cwd: "/project".to_string(),
///     relative_path: None,
///     include_hidden: false,
///     max_depth: Some(2),
/// }).await?;
/// ```
pub struct WorkspaceEntries;

impl WorkspaceEntries {
    /// 创建新的条目服务实例
    ///
    /// ## 返回值
    ///
    /// 返回一个新的 `WorkspaceEntries` 实例
    ///
    /// ## 示例
    ///
    /// ```rust
    /// use remi_workspace::entries::WorkspaceEntries;
    ///
    /// let service = WorkspaceEntries::new();
    /// ```
    pub fn new() -> Self {
        Self
    }

    /// 浏览目录
    ///
    /// 根据输入参数浏览指定目录，返回该目录下的文件和子目录列表。
    ///
    /// ## 参数
    ///
    /// - `input`：浏览目录的输入参数，包含工作目录、相对路径、隐藏文件选项和最大深度
    ///
    /// ## 返回值
    ///
    /// - `Ok(BrowseResult)`：成功时返回浏览结果，包含条目列表和实际路径
    /// - `Err(WorkspaceError::DirectoryNotFound)`：目标目录不存在时返回
    ///
    /// ## 行为说明
    ///
    /// - 默认只浏览当前目录（`max_depth = 1`）
    /// - 默认过滤隐藏文件（以 `.` 开头的文件）
    /// - 结果已排序：目录在前，然后按名称字母序排序
    /// - 自动跳过无法访问的条目（如权限不足）
    ///
    /// ## 示例
    ///
    /// ```rust,no_run
    /// use remi_workspace::entries::{WorkspaceEntries, BrowseInput};
    ///
    /// let service = WorkspaceEntries::new();
    /// let result = service.browse(BrowseInput {
    ///     cwd: "/project".to_string(),
    ///     relative_path: Some("src".to_string()),
    ///     include_hidden: false,
    ///     max_depth: Some(2),
    /// }).await?;
    /// ```
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
    ///
    /// 在工作空间内按名称关键字和文件类型模式搜索文件或目录。
    ///
    /// ## 参数
    ///
    /// - `input`：搜索输入参数，包含工作目录、查询字符串、最大结果数和文件类型过滤模式
    ///
    /// ## 返回值
    ///
    /// - `Ok(SearchEntriesResult)`：成功时返回搜索结果，包含匹配的条目列表和总匹配数
    ///
    /// ## 行为说明
    ///
    /// - 名称匹配：大小写不敏感的子字符串匹配
    /// - 文件类型过滤：支持 glob 模式（如 `*.rs`、`*.txt`）
    /// - 默认过滤隐藏文件（以 `.` 开头的文件）
    /// - 默认最多返回 100 条结果
    /// - 自动跳过无法访问的条目
    ///
    /// ## 示例
    ///
    /// ```rust,no_run
    /// use remi_workspace::entries::{WorkspaceEntries, SearchEntriesInput};
    ///
    /// let service = WorkspaceEntries::new();
    /// let result = service.search(SearchEntriesInput {
    ///     cwd: "/project".to_string(),
    ///     query: "main".to_string(),
    ///     max_results: Some(50),
    ///     file_pattern: Some("*.rs".to_string()),
    /// }).await?;
    /// ```
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
    ///
    /// 递归列举工作空间内的所有目录结构。
    ///
    /// ## 参数
    ///
    /// - `input`：列举目录的输入参数，包含工作目录和最大递归深度
    ///
    /// ## 返回值
    ///
    /// - `Ok(ListDirectoriesResult)`：成功时返回目录列表，按路径排序
    ///
    /// ## 行为说明
    ///
    /// - 只返回目录，不包含文件
    /// - 默认最大深度为 3
    /// - 默认过滤隐藏目录（以 `.` 开头的目录）
    /// - 结果按路径字母序排序
    /// - 自动跳过无法访问的目录
    ///
    /// ## 示例
    ///
    /// ```rust,no_run
    /// use remi_workspace::entries::{WorkspaceEntries, ListDirectoriesInput};
    ///
    /// let service = WorkspaceEntries::new();
    /// let result = service.list_directories(ListDirectoriesInput {
    ///     cwd: "/project".to_string(),
    ///     max_depth: Some(5),
    /// }).await?;
    /// ```
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
    ///
    /// 清除指定工作目录的缓存数据（预留接口，当前未实现）。
    ///
    /// ## 参数
    ///
    /// - `_cwd`：工作目录的绝对路径
    ///
    /// ## 当前状态
    ///
    /// - 该方法为预留接口，当前实现为空
    /// - 未来可用于实现目录浏览/搜索结果的缓存机制
    ///
    /// ## 示例
    ///
    /// ```rust,no_run
    /// use remi_workspace::entries::WorkspaceEntries;
    ///
    /// let service = WorkspaceEntries::new();
    /// service.invalidate("/project").await;
    /// ```
    pub async fn invalidate(&self, _cwd: &str) {
        // TODO: 实现缓存失效逻辑
        debug!("缓存失效: {}", _cwd);
    }
}

impl Default for WorkspaceEntries {
    /// 创建默认的条目服务实例
    ///
    /// 等价于调用 [`WorkspaceEntries::new`]
    fn default() -> Self {
        Self::new()
    }
}
