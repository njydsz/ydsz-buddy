//! 文件系统操作的模式定义
//!
//! 定义工作区文件浏览、读写、目录创建、删除等动作的 DTO。
//!
//! # 路径约定
//! - 所有路径均以"工作区根"为基准的相对路径，避免在不同主机上出现绝对路径漂移。
//! - 内容默认按 UTF-8 处理；二进制文件请使用专门的二进制读写 API（不在本模块）。
//!
//! # 分页
//! - 大目录浏览使用 [`FilesystemBrowseChunk`] 分块返回，避免单次响应过大。
//! - 小目录可直接使用 [`FilesystemBrowseResult`]。

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// 浏览文件系统的入参
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct FilesystemBrowseInput {
    /// 要浏览的目录路径（相对工作区根）
    pub path: String,
    /// 是否包含隐藏文件（以 `.` 开头的文件/目录）
    #[serde(default)]
    pub include_hidden: bool,
    /// 最大遍历深度（`None` 表示仅当前层）
    pub max_depth: Option<u32>,
}

/// 文件系统浏览操作的完整结果（不分页）
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct FilesystemBrowseResult {
    /// 父目录路径
    pub parent: String,
    /// 目录中的条目列表
    pub entries: Vec<FilesystemEntry>,
}

/// [`FilesystemBrowseResult`] 的分页块
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct FilesystemBrowseChunk {
    /// 父目录路径
    pub parent: String,
    /// 可用条目总数
    pub total: usize,
    /// 此块的起始偏移量
    pub offset: usize,
    /// 此块返回的最大条目数
    pub limit: usize,
    /// 块中的条目列表
    pub entries: Vec<FilesystemEntry>,
    /// 是否还有更多条目
    pub has_more: bool,
}

/// 文件系统条目（文件或目录）
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct FilesystemEntry {
    /// 条目名称（不含父目录）
    pub name: String,
    /// 完整路径（相对工作区根）
    pub path: String,
    /// 条目类型（文件/目录/链接等）
    pub entry_type: FilesystemEntryType,
    /// 文件大小（字节，仅文件有效）
    pub size: Option<u64>,
    /// 最近修改时间戳（ISO 8601 字符串）
    pub modified_at: Option<String>,
    /// 条目是否为隐藏文件
    pub is_hidden: bool,
}

/// 文件系统条目类型
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum FilesystemEntryType {
    /// 普通文件
    File,
    /// 目录
    Directory,
    /// 符号链接
    Symlink,
    /// 其他类型（设备、套接字、命名管道等）
    Other,
}

/// 从工作区读取单个文件的入参
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ReadFileInput {
    /// 相对于工作区的路径
    pub path: String,
}

/// 读取单个文件的结果
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ReadFileResult {
    /// 相对于工作区的路径
    pub path: String,
    /// 文件内容（UTF-8 编码）
    pub contents: String,
    /// 文件大小（字节）
    pub size: u64,
    /// 最近修改时间戳（ISO 8601 字符串）
    pub modified_at: Option<String>,
}

/// 向工作区写入单个文件的入参
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WriteFileInput {
    /// 相对于工作区的路径
    pub path: String,
    /// 新文件内容（UTF-8 编码）
    pub contents: String,
}

/// 写入单个文件的结果
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WriteFileResult {
    /// 已写入的路径
    pub path: String,
    /// 写入的字节数
    pub bytes_written: usize,
}

/// 创建目录的入参
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateDirectoryInput {
    /// 新目录相对于工作区的路径
    pub path: String,
}

/// 删除路径的入参
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct DeletePathInput {
    /// 要删除的相对于工作区的路径
    pub path: String,
    /// 是否递归删除（非空目录必须为 `true`）
    pub recursive: bool,
}
