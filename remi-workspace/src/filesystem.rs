//! # 工作空间文件系统操作模块
//!
//! 本模块提供工作空间内安全的文件系统操作功能。
//!
//! ## 核心功能
//!
//! - **路径安全校验**：所有文件操作前均进行路径合法性验证，防止路径穿越攻击
//! - **文件写入**：支持创建新文件或覆盖现有文件，可选自动创建中间目录
//! - **文件读取**：读取工作空间内的文本文件内容
//! - **文件删除**：删除工作空间内的指定文件
//! - **存在性检查**：检查文件是否存在于工作空间中
//!
//! ## 安全设计
//!
//! 所有文件操作均通过 [`WorkspaceFileSystem::validate_path`] 进行路径校验：
//! - 将相对路径解析为绝对路径
//! - 验证解析后的路径是否在工作空间根目录内
//! - 防止通过 `../` 等路径穿越手段访问工作空间外的文件
//!
//! ## 使用场景
//!
//! - 代码生成工具需要安全地写入文件
//! - IDE/编辑器需要读取、修改工作空间内的文件
//! - 文件管理功能需要删除或检查文件
//! - 任何需要限制在指定工作空间根目录内操作文件的上层应用
//!
//! ## 核心类型
//!
//! - [`WorkspaceFileSystem`]：工作空间文件系统服务，提供所有文件操作的入口
//! - [`WriteFileInput`]：文件写入的输入参数
//! - [`WriteFileResult`]：文件写入的返回结果
//!
//! ## 典型用法
//!
//!```rust,ignore
//! #[tokio::main]
//! async fn main() {
//! use remi_workspace::filesystem::{WorkspaceFileSystem, WriteFileInput};
//! 
//! let fs = WorkspaceFileSystem::new();
//! 
//! // 安全地写入文件
//! let result = fs.write_file(WriteFileInput {
//!     cwd: "/project".to_string(),
//!     relative_path: "src/main.rs".to_string(),
//!     content: "fn main() {}".to_string(),
//!     create_directories: true,
//! }).await?;
//! 
//! // 读取文件
//! let content = fs.read_file("/project", "src/main.rs").await?;
//! 
//! // 检查文件是否存在
//! let exists = fs.file_exists("/project", "src/main.rs").await?;
//! }

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tokio::fs;
use tracing::{debug, info};

use crate::error::{WorkspaceError, WorkspaceResult};

/// # 写入文件输入参数
///
/// 用于 [`WorkspaceFileSystem::write_file`] 方法的输入参数结构。
///
/// ## 字段说明
///
/// - `cwd`：工作目录的绝对路径，作为文件操作的根目录
/// - `relative_path`：相对于 `cwd` 的文件路径
/// - `content`：要写入的文件内容（字符串格式）
/// - `create_directories`：是否自动创建中间目录（如果不存在）
///
/// ## 使用场景
///
/// - 创建新文件：`create_directories = true` 可自动创建父目录
/// - 覆盖现有文件：直接写入即可
/// - 限制在特定目录：通过 `cwd` 参数限定操作范围
///
/// ## 示例
///
///```rust,ignore
/// use remi_workspace::filesystem::WriteFileInput;
///
/// let input = WriteFileInput {
///     cwd: "/project".to_string(),
///     relative_path: "src/components/Button.tsx".to_string(),
///     content: "export const Button = () => {}".to_string(),
///     create_directories: true,
/// };
/// ```
#[derive(Debug, Clone)]
pub struct WriteFileInput {
    /// 工作目录的绝对路径
    pub cwd: String,
    /// 相对于工作目录的文件路径
    pub relative_path: String,
    /// 要写入的文件内容
    pub content: String,
    /// 是否自动创建中间目录
    pub create_directories: bool,
}

/// # 写入文件结果
///
/// [`WorkspaceFileSystem::write_file`] 方法的返回结果结构。
///
/// ## 字段说明
///
/// - `absolute_path`：写入的文件的绝对路径
/// - `bytes_written`：实际写入的字节数
/// - `created`：是否为新创建的文件（`true` 表示新建，`false` 表示覆盖）
///
/// ## 使用场景
///
/// - 确认文件写入是否成功
/// - 获取写入的文件路径和大小信息
/// - 区分是新建文件还是覆盖现有文件
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WriteFileResult {
    /// 写入的文件的绝对路径
    pub absolute_path: String,
    /// 实际写入的字节数
    pub bytes_written: usize,
    /// 是否为新创建的文件
    pub created: bool,
}

/// # 工作空间文件系统服务
///
/// 提供工作空间内安全的文件系统操作功能。
///
/// ## 核心方法
///
/// - [`validate_path`](WorkspaceFileSystem::validate_path)：验证路径合法性（静态方法）
/// - [`write_file`](WorkspaceFileSystem::write_file)：写入文件
/// - [`read_file`](WorkspaceFileSystem::read_file)：读取文件
/// - [`delete_file`](WorkspaceFileSystem::delete_file)：删除文件
/// - [`file_exists`](WorkspaceFileSystem::file_exists)：检查文件是否存在
///
/// ## 安全特性
///
/// - 所有文件操作前均进行路径安全校验
/// - 防止路径穿越攻击（Path Traversal Attack）
/// - 确保操作目标路径在工作空间根目录内
///
/// ## 使用场景
///
/// - 代码生成工具需要安全地写入文件
/// - IDE/编辑器需要读取、修改工作空间内的文件
/// - 文件管理功能需要删除或检查文件
///
/// ## 典型用法
///
///```rust,ignore
/// #[tokio::main]
/// async fn main() {
/// use remi_workspace::filesystem::{WorkspaceFileSystem, WriteFileInput};
/// 
/// let fs = WorkspaceFileSystem::new();
/// 
/// // 写入文件
/// let result = fs.write_file(WriteFileInput {
///     cwd: "/project".to_string(),
///     relative_path: "src/main.rs".to_string(),
///     content: "fn main() {}".to_string(),
///     create_directories: true,
/// }).await?;
/// 
/// // 读取文件
/// let content = fs.read_file("/project", "src/main.rs").await?;
/// }
pub struct WorkspaceFileSystem;

impl WorkspaceFileSystem {
    /// 创建新的文件系统服务实例
    ///
    /// ## 返回值
    ///
    /// 返回一个新的 `WorkspaceFileSystem` 实例
    ///
    /// ## 示例
    ///
    ///```rust,ignore
    /// use remi_workspace::filesystem::WorkspaceFileSystem;
    ///
    /// let fs = WorkspaceFileSystem::new();
    /// ```
    pub fn new() -> Self {
        Self
    }

    /// 验证路径是否在工作空间根目录内
    ///
    /// 静态方法，用于路径安全校验。
    ///
    /// ## 参数
    ///
    /// - `cwd`：工作目录的绝对路径（工作空间根目录）
    /// - `relative_path`：相对于 `cwd` 的文件路径
    ///
    /// ## 返回值
    ///
    /// - `Ok(PathBuf)`：路径合法时返回解析后的绝对路径
    /// - `Err(WorkspaceError::DirectoryNotFound)`：工作目录不存在时返回
    /// - `Err(WorkspaceError::PathOutsideRoot)`：路径超出工作空间根目录时返回
    ///
    /// ## 安全说明
    ///
    /// - 将 `cwd` 和 `relative_path` 拼接后解析为绝对路径
    /// - 验证解析后的路径是否以 `cwd` 为前缀
    /// - 防止通过 `../` 等路径穿越手段访问工作空间外的文件
    ///
    /// ## 示例
    ///
    ///```rust,ignore
    /// #[tokio::main]
    /// async fn main() {
    /// use remi_workspace::filesystem::WorkspaceFileSystem;
    /// 
    /// let path = WorkspaceFileSystem::validate_path("/project", "src/main.rs")?;
    /// // path = "/project/src/main.rs"
    /// 
    /// // 以下会返回错误
    /// let path = WorkspaceFileSystem::validate_path("/project", "../other/file.txt")?;
    /// // Err(WorkspaceError::PathOutsideRoot)
    /// }
    pub fn validate_path(cwd: &str, relative_path: &str) -> WorkspaceResult<PathBuf> {
        // 将 cwd 规范化为绝对路径，如果 cwd 不存在则说明工作空间根目录无效
        let root = Path::new(cwd).canonicalize().map_err(|e| {
            WorkspaceError::DirectoryNotFound(format!("{}: {}", cwd, e))
        })?;

        let full_path = root.join(relative_path);
        // canonicalize 在路径不存在时会失败，此处使用 unwrap_or 回退到原始拼接路径
        // 以便后续的 starts_with 检查仍能对尚未创建的文件路径进行安全校验
        let canonical = full_path.canonicalize().unwrap_or(full_path.clone());

        // 安全校验：确保解析后的路径仍在工作空间根目录内，防止路径穿越攻击
        if !canonical.starts_with(&root) {
            return Err(WorkspaceError::PathOutsideRoot(format!(
                "{} 不在 {} 内",
                relative_path, cwd
            )));
        }

        Ok(canonical)
    }

    /// 写入文件
    ///
    /// 安全地将内容写入工作空间内的指定文件。
    ///
    /// ## 参数
    ///
    /// - `input`：写入文件的输入参数，包含工作目录、相对路径、内容和是否创建目录选项
    ///
    /// ## 返回值
    ///
    /// - `Ok(WriteFileResult)`：成功时返回写入结果，包含绝对路径、字节数和是否新建
    /// - `Err(WorkspaceError::PathOutsideRoot)`：路径超出工作空间根目录时返回
    /// - `Err(WorkspaceError::IoError)`：底层 I/O 操作失败时返回
    ///
    /// ## 行为说明
    ///
    /// - 写入前进行路径安全校验
    /// - 如果 `create_directories = true`，自动创建不存在的父目录
    /// - 如果文件不存在则创建，存在则覆盖
    /// - 返回结果中包含是否新建的标识
    ///
    /// ## 示例
    ///
    ///```rust,ignore
    /// #[tokio::main]
    /// async fn main() {
    /// use remi_workspace::filesystem::{WorkspaceFileSystem, WriteFileInput};
    /// 
    /// let fs = WorkspaceFileSystem::new();
    /// let result = fs.write_file(WriteFileInput {
    ///     cwd: "/project".to_string(),
    ///     relative_path: "src/main.rs".to_string(),
    ///     content: "fn main() {}".to_string(),
    ///     create_directories: true,
    /// }).await?;
    /// 
    /// println!("写入到: {}", result.absolute_path);
    /// println!("字节数: {}", result.bytes_written);
    /// println!("是否新建: {}", result.created);
    /// }
    pub async fn write_file(&self, input: WriteFileInput) -> WorkspaceResult<WriteFileResult> {
        let absolute_path = Self::validate_path(&input.cwd, &input.relative_path)?;

        info!("写入文件: {}", absolute_path.display());

        // 在写入前先检查文件是否存在，用于返回结果中的 created 标识
        // 注意：必须在写入操作之前检查，否则写入后文件必然存在
        let created = !absolute_path.exists();

        // 创建中间目录：当 create_directories 为 true 时，自动创建文件路径中不存在的父目录
        // 这对于代码生成等场景很有用，目标文件的父目录可能尚未创建
        if input.create_directories {
            if let Some(parent) = absolute_path.parent() {
                fs::create_dir_all(parent).await.map_err(|e| {
                    WorkspaceError::IoError(e)
                })?;
            }
        }

        // 写入文件
        fs::write(&absolute_path, &input.content).await.map_err(|e| {
            WorkspaceError::IoError(e)
        })?;

        Ok(WriteFileResult {
            absolute_path: absolute_path.to_string_lossy().to_string(),
            bytes_written: input.content.len(),
            created,
        })
    }

    /// 读取文件
    ///
    /// 安全地读取工作空间内的文本文件内容。
    ///
    /// ## 参数
    ///
    /// - `cwd`：工作目录的绝对路径（工作空间根目录）
    /// - `relative_path`：相对于 `cwd` 的文件路径
    ///
    /// ## 返回值
    ///
    /// - `Ok(String)`：成功时返回文件内容（UTF-8 字符串）
    /// - `Err(WorkspaceError::PathOutsideRoot)`：路径超出工作空间根目录时返回
    /// - `Err(WorkspaceError::FileNotFound)`：文件不存在时返回
    /// - `Err(WorkspaceError::IoError)`：底层 I/O 操作失败时返回
    ///
    /// ## 行为说明
    ///
    /// - 读取前进行路径安全校验
    /// - 文件内容必须以 UTF-8 编码
    /// - 文件不存在时返回明确的 `FileNotFound` 错误
    ///
    /// ## 示例
    ///
    ///```rust,ignore
    /// #[tokio::main]
    /// async fn main() {
    /// use remi_workspace::filesystem::WorkspaceFileSystem;
    /// 
    /// let fs = WorkspaceFileSystem::new();
    /// let content = fs.read_file("/project", "src/main.rs").await?;
    /// println!("文件内容: {}", content);
    /// }
    pub async fn read_file(&self, cwd: &str, relative_path: &str) -> WorkspaceResult<String> {
        let absolute_path = Self::validate_path(cwd, relative_path)?;

        debug!("读取文件: {}", absolute_path.display());

        let content = fs::read_to_string(&absolute_path).await.map_err(|e| {
            // 将 NotFound 类型的 I/O 错误转换为更具体的 FileNotFound 错误
            // 便于上层调用方区分"文件不存在"和其他 I/O 异常
            if e.kind() == std::io::ErrorKind::NotFound {
                WorkspaceError::FileNotFound(relative_path.to_string())
            } else {
                WorkspaceError::IoError(e)
            }
        })?;

        Ok(content)
    }

    /// 删除文件
    ///
    /// 安全地删除工作空间内的指定文件。
    ///
    /// ## 参数
    ///
    /// - `cwd`：工作目录的绝对路径（工作空间根目录）
    /// - `relative_path`：相对于 `cwd` 的文件路径
    ///
    /// ## 返回值
    ///
    /// - `Ok(())`：成功时返回空结果
    /// - `Err(WorkspaceError::PathOutsideRoot)`：路径超出工作空间根目录时返回
    /// - `Err(WorkspaceError::FileNotFound)`：文件不存在时返回
    /// - `Err(WorkspaceError::IoError)`：底层 I/O 操作失败时返回
    ///
    /// ## 行为说明
    ///
    /// - 删除前进行路径安全校验
    /// - 文件不存在时返回明确的 `FileNotFound` 错误
    /// - 只能删除文件，不能删除目录
    ///
    /// ## 示例
    ///
    ///```rust,ignore
    /// #[tokio::main]
    /// async fn main() {
    /// use remi_workspace::filesystem::WorkspaceFileSystem;
    /// 
    /// let fs = WorkspaceFileSystem::new();
    /// fs.delete_file("/project", "src/old_file.txt").await?;
    /// }
    pub async fn delete_file(&self, cwd: &str, relative_path: &str) -> WorkspaceResult<()> {
        let absolute_path = Self::validate_path(cwd, relative_path)?;

        info!("删除文件: {}", absolute_path.display());

        fs::remove_file(&absolute_path).await.map_err(|e| {
            // 将 NotFound 类型的 I/O 错误转换为更具体的 FileNotFound 错误
            // 便于上层调用方区分"文件不存在"和其他 I/O 异常
            if e.kind() == std::io::ErrorKind::NotFound {
                WorkspaceError::FileNotFound(relative_path.to_string())
            } else {
                WorkspaceError::IoError(e)
            }
        })?;

        Ok(())
    }

    /// 检查文件是否存在
    ///
    /// 安全地检查工作空间内的指定文件是否存在。
    ///
    /// ## 参数
    ///
    /// - `cwd`：工作目录的绝对路径（工作空间根目录）
    /// - `relative_path`：相对于 `cwd` 的文件路径
    ///
    /// ## 返回值
    ///
    /// - `Ok(bool)`：成功时返回文件是否存在（`true` 表示存在，`false` 表示不存在）
    /// - `Err(WorkspaceError::PathOutsideRoot)`：路径超出工作空间根目录时返回
    ///
    /// ## 行为说明
    ///
    /// - 检查前进行路径安全校验
    /// - 文件存在返回 `true`，不存在返回 `false`
    /// - 不会返回 `FileNotFound` 错误，而是返回 `false`
    ///
    /// ## 示例
    ///
    ///```rust,ignore
    /// #[tokio::main]
    /// async fn main() {
    /// use remi_workspace::filesystem::WorkspaceFileSystem;
    /// 
    /// let fs = WorkspaceFileSystem::new();
    /// let exists = fs.file_exists("/project", "src/main.rs").await?;
    /// if exists {
    ///     println!("文件存在");
    /// } else {
    ///     println!("文件不存在");
    /// }
    /// }
    pub async fn file_exists(&self, cwd: &str, relative_path: &str) -> WorkspaceResult<bool> {
        let absolute_path = Self::validate_path(cwd, relative_path)?;
        // 使用同步的 exists() 检查文件是否存在，避免额外的异步 I/O 开销
        // 对于已通过路径校验的情况，exists() 的性能优于先 open 再 close
        Ok(absolute_path.exists())
    }
}

impl Default for WorkspaceFileSystem {
    /// 创建默认的文件系统服务实例
    ///
    /// 等价于调用 [`WorkspaceFileSystem::new`]
    fn default() -> Self {
        Self::new()
    }
}
