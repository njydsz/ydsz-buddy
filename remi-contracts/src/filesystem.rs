//! 文件系统模式定义。

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// 浏览文件系统的输入参数。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct FilesystemBrowseInput {
    /// 要浏览的目录路径。
    pub path: String,
    /// 是否包含隐藏文件。
    #[serde(default)]
    pub include_hidden: bool,
    /// 最大遍历深度。
    pub max_depth: Option<u32>,
}

/// 文件系统浏览操作的结果。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct FilesystemBrowseResult {
    /// 父目录路径。
    pub parent: String,
    /// 目录中的条目列表。
    pub entries: Vec<FilesystemEntry>,
}

/// [`FilesystemBrowseResult`] 的分页块。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct FilesystemBrowseChunk {
    /// 父目录路径。
    pub parent: String,
    /// 可用条目总数。
    pub total: usize,
    /// 此块的起始偏移量。
    pub offset: usize,
    /// 此块返回的最大条目数。
    pub limit: usize,
    /// 块中的条目列表。
    pub entries: Vec<FilesystemEntry>,
    /// 是否还有更多条目。
    pub has_more: bool,
}

/// 文件系统条目（文件或目录）。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct FilesystemEntry {
    /// 条目名称。
    pub name: String,
    /// 完整路径。
    pub path: String,
    /// 条目类型。
    pub entry_type: FilesystemEntryType,
    /// 文件大小（字节，仅文件有效）。
    pub size: Option<u64>,
    /// 最近修改时间戳（ISO 8601 格式）。
    pub modified_at: Option<String>,
    /// 条目是否为隐藏文件。
    pub is_hidden: bool,
}

/// 文件系统条目类型。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum FilesystemEntryType {
    /// 普通文件。
    File,
    /// 目录。
    Directory,
    /// 符号链接。
    Symlink,
    /// 其他类型（设备、套接字等）。
    Other,
}

/// 从工作区读取单个文件的输入参数。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ReadFileInput {
    /// 相对于工作区的路径。
    pub path: String,
}

/// 读取单个文件的结果。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ReadFileResult {
    /// 相对于工作区的路径。
    pub path: String,
    /// 文件内容（UTF-8 编码）。
    pub contents: String,
    /// 文件大小（字节）。
    pub size: u64,
    /// 最近修改时间戳（ISO 8601 格式）。
    pub modified_at: Option<String>,
}

/// 向工作区写入单个文件的输入参数。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct WriteFileInput {
    /// 相对于工作区的路径。
    pub path: String,
    /// 新文件内容（UTF-8 编码）。
    pub contents: String,
}

/// 写入单个文件的结果。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct WriteFileResult {
    /// 已写入的路径。
    pub path: String,
    /// 写入的字节数。
    pub bytes_written: usize,
}

/// 创建目录的输入参数。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct CreateDirectoryInput {
    /// 新目录相对于工作区的路径。
    pub path: String,
}

/// 删除路径的输入参数。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct DeletePathInput {
    /// 要删除的相对于工作区的路径。
    pub path: String,
    /// 是否递归删除（非空目录必须为 true）。
    pub recursive: bool,
}
