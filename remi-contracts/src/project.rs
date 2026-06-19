//! 项目模式定义。

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::ProjectId;

/// 项目信息。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct Project {
    /// 项目 ID。
    pub id: ProjectId,
    /// 项目名称。
    pub name: String,
    /// 项目路径。
    pub path: String,
    /// 项目类型。
    pub kind: ProjectKind,
    /// 创建时间戳（ISO 8601 格式）。
    pub created_at: String,
    /// 更新时间戳（ISO 8601 格式）。
    pub updated_at: String,
}

/// 项目类型。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum ProjectKind {
    /// 本地项目。
    Local,
    /// 远程项目。
    Remote,
}

/// 创建项目的输入参数。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct CreateProjectInput {
    /// 项目名称。
    pub name: String,
    /// 项目路径。
    pub path: String,
    /// 项目类型。
    pub kind: ProjectKind,
}

/// 创建项目的输出。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct CreateProjectOutput {
    /// 项目 ID。
    pub id: ProjectId,
}

/// 项目图标信息。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ProjectFavicon {
    /// 项目 ID。
    pub project_id: ProjectId,
    /// 图标 URL。
    pub url: String,
    /// 图标数据（Base64 编码）。
    pub data: Option<String>,
}

/// 写入文件的输入参数。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ProjectWriteFileInput {
    /// 当前工作目录。
    pub cwd: String,
    /// 文件相对路径。
    pub relative_path: String,
    /// 文件内容。
    pub contents: String,
}

/// 写入文件的结果。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ProjectWriteFileResult {
    /// 已写入文件的相对路径。
    pub relative_path: String,
}
