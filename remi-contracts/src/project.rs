//! 项目（工作区）相关的模式定义
//!
//! 定义项目元信息、类型、创建/查询/图标解析等动作的 DTO。
//!
//! # 路径约定
//! - `path` 为绝对路径（本地项目）或 URL（远程项目）。
//! - `relative_path` 始终相对于"当前工作目录 `cwd`"，避免歧义。

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::ProjectId;

/// 项目元信息
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    /// 项目 ID
    pub id: ProjectId,
    /// 项目名称
    pub name: String,
    /// 项目路径（本地项目为绝对路径，远程项目为 URL）
    pub path: String,
    /// 项目类型
    pub kind: ProjectKind,
    /// 创建时间戳（ISO 8601 字符串）
    pub created_at: String,
    /// 更新时间戳（ISO 8601 字符串）
    pub updated_at: String,
}

/// 项目类型
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum ProjectKind {
    /// 本地项目
    Local,
    /// 远程项目
    Remote,
}

/// 创建项目的入参
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateProjectInput {
    /// 项目名称
    pub name: String,
    /// 项目路径
    pub path: String,
    /// 项目类型
    pub kind: ProjectKind,
}

/// 创建项目的出参
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateProjectOutput {
    /// 新项目 ID
    pub id: ProjectId,
}

/// 项目图标信息
///
/// 前端使用 [`Self::url`] 渲染，若离线场景则可回退到 [`Self::data`]。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ProjectFavicon {
    /// 项目 ID
    pub project_id: ProjectId,
    /// 图标 URL（优先使用）
    pub url: String,
    /// 图标数据（Base64 编码，可选，离线时回退）
    pub data: Option<String>,
}

/// 写入文件的入参
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ProjectWriteFileInput {
    /// 当前工作目录
    pub cwd: String,
    /// 相对于 `cwd` 的文件路径
    pub relative_path: String,
    /// 文件内容
    pub contents: String,
}

/// 写入文件的结果
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ProjectWriteFileResult {
    /// 已写入文件的相对路径
    pub relative_path: String,
}
