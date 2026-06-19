//! 工作空间文件系统操作

use std::path::{Path, PathBuf};

use tokio::fs;
use tracing::{debug, info};

use crate::error::{WorkspaceError, WorkspaceResult};

/// 写入文件输入
#[derive(Debug, Clone)]
pub struct WriteFileInput {
    /// 工作目录
    pub cwd: String,
    /// 相对路径
    pub relative_path: String,
    /// 文件内容
    pub content: String,
    /// 是否创建中间目录
    pub create_directories: bool,
}

/// 写入文件结果
#[derive(Debug, Clone)]
pub struct WriteFileResult {
    /// 写入的绝对路径
    pub absolute_path: String,
    /// 写入的字节数
    pub bytes_written: usize,
    /// 是否为新创建的文件
    pub created: bool,
}

/// 工作空间文件系统服务
pub struct WorkspaceFileSystem;

impl WorkspaceFileSystem {
    /// 创建新的文件系统服务
    pub fn new() -> Self {
        Self
    }

    /// 验证路径是否在工作空间根目录内
    pub fn validate_path(cwd: &str, relative_path: &str) -> WorkspaceResult<PathBuf> {
        let root = Path::new(cwd).canonicalize().map_err(|e| {
            WorkspaceError::DirectoryNotFound(format!("{}: {}", cwd, e))
        })?;

        let full_path = root.join(relative_path);
        let canonical = full_path.canonicalize().unwrap_or(full_path.clone());

        if !canonical.starts_with(&root) {
            return Err(WorkspaceError::PathOutsideRoot(format!(
                "{} 不在 {} 内",
                relative_path, cwd
            )));
        }

        Ok(canonical)
    }

    /// 写入文件
    pub async fn write_file(&self, input: WriteFileInput) -> WorkspaceResult<WriteFileResult> {
        let absolute_path = Self::validate_path(&input.cwd, &input.relative_path)?;

        info!("写入文件: {}", absolute_path.display());

        // 检查文件是否已存在
        let created = !absolute_path.exists();

        // 创建中间目录
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
    pub async fn read_file(&self, cwd: &str, relative_path: &str) -> WorkspaceResult<String> {
        let absolute_path = Self::validate_path(cwd, relative_path)?;

        debug!("读取文件: {}", absolute_path.display());

        let content = fs::read_to_string(&absolute_path).await.map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                WorkspaceError::FileNotFound(relative_path.to_string())
            } else {
                WorkspaceError::IoError(e)
            }
        })?;

        Ok(content)
    }

    /// 删除文件
    pub async fn delete_file(&self, cwd: &str, relative_path: &str) -> WorkspaceResult<()> {
        let absolute_path = Self::validate_path(cwd, relative_path)?;

        info!("删除文件: {}", absolute_path.display());

        fs::remove_file(&absolute_path).await.map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                WorkspaceError::FileNotFound(relative_path.to_string())
            } else {
                WorkspaceError::IoError(e)
            }
        })?;

        Ok(())
    }

    /// 检查文件是否存在
    pub async fn file_exists(&self, cwd: &str, relative_path: &str) -> WorkspaceResult<bool> {
        let absolute_path = Self::validate_path(cwd, relative_path)?;
        Ok(absolute_path.exists())
    }
}

impl Default for WorkspaceFileSystem {
    fn default() -> Self {
        Self::new()
    }
}
