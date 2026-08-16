//! # Skill 模块错误类型

use std::path::PathBuf;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum SkillError {
    #[error("IO 错误: {0}")]
    Io(#[from] std::io::Error),

    #[error("YAML 解析失败: {0}")]
    YamlParse(String),

    #[error("JSON 解析失败: {0}")]
    JsonParse(#[from] serde_json::Error),

    #[error("Skill 清单缺失字段: {0}")]
    ManifestMissingField(String),

    #[error("Skill 名称不合法（需匹配 ^[a-z0-9][a-z0-9_-]{{1,40}}$）: {0}")]
    InvalidName(String),

    #[error("Skill 已存在: {0}")]
    AlreadyExists(String),

    #[error("Skill 未找到: {0}")]
    NotFound(String),

    #[error("Skill 源下载失败: {0}")]
    DownloadFailed(String),

    #[error("Skill 源解压失败: {0}")]
    ExtractFailed(String),

    #[error("Skill 目录无效（缺少 SKILL.md）: {0}")]
    InvalidSkillDir(PathBuf),

    #[error("Skill 依赖解析失败: {0}")]
    DependencyUnresolved(String),

    #[error("Skill 注册表损坏: {0}")]
    RegistryCorrupted(String),
}

pub type SkillResult<T> = Result<T, SkillError>;
