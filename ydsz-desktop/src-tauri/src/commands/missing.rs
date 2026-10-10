//! # 补齐竞品差距 — 缺失 Tauri 命令
//!
//! 这些命令在前端被调用但后端缺失实现，补充以提升完整度
//! 对标 Octop 知识库、连接器、多用户等能力差距。
//!
//! - env_get: 获取环境变量
//! - fs_exists: 检查文件/目录是否存在
//! - fs_which: 在 PATH 中查找可执行文件
//! - preset.list: 列出内置 Agent 预设
//! - image_gen.list_providers: 列出可用图片生成 Provider

use std::path::Path;
use serde::{Deserialize, Serialize};

/// 环境变量查询 — workspaceClassifier 探测 Provider API Key
#[tauri::command]
#[specta::specta]
pub async fn env_get(name: String) -> Result<Option<String>, String> {
    Ok(std::env::var(&name).ok())
}

/// 文件/目录存在性检查 — workspaceClassifier 检查项目类型标记文件
#[tauri::command]
#[specta::specta]
pub async fn fs_exists(path: String) -> Result<bool, String> {
    Ok(Path::new(&path).exists())
}

/// 在系统 PATH 中查找二进制 — workspaceClassifier 检查 Codex/Claude 等 CLI 工具
#[tauri::command]
#[specta::specta]
pub async fn fs_which(name: String) -> Result<Option<String>, String> {
    // 用 which crate 跨平台查找
    match which::which(&name) {
        Ok(path) => Ok(Some(path.to_string_lossy().to_string())),
        Err(_) => Ok(None),
    }
}

// ===== Preset.list =====

/// Agent 预设（精简版，非完整专家系统）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentPreset {
    pub id: String,
    pub name: String,
    pub description: String,
    pub builtin: bool,
    pub system_prompt_template: String,
    pub tool_allowlist: Vec<String>,
    pub tool_blocklist: Vec<String>,
    pub permission_level: String,
    pub compression: String,
}

/// 列出内置 Agent 预设
#[tauri::command]
#[specta::specta]
pub async fn preset_list() -> Result<Vec<AgentPreset>, String> {
    let presets = vec![
        AgentPreset {
            id: "general".into(),
            name: "通用助手".into(),
            description: "适用于日常问答和通用任务".into(),
            builtin: true,
            system_prompt_template: "你是一个有帮助的 AI 助手。".into(),
            tool_allowlist: vec![],
            tool_blocklist: vec![],
            permission_level: "standard".into(),
            compression: "none".into(),
        },
        AgentPreset {
            id: "code".into(),
            name: "代码专家".into(),
            description: "专注代码开发、调试和重构任务".into(),
            builtin: true,
            system_prompt_template: "你是一个专业的软件开发专家，精通多种编程语言。".into(),
            tool_allowlist: vec!["fs".into(), "shell".into(), "lsp".into()],
            tool_blocklist: vec![],
            permission_level: "elevated".into(),
            compression: "none".into(),
        },
        AgentPreset {
            id: "work".into(),
            name: "办公助手".into(),
            description: "处理 Office 文档、Excel 分析、PPT 制作等".into(),
            builtin: true,
            system_prompt_template: "你是一个专业的办公助手，擅长处理文档、表格和演示文稿。".into(),
            tool_allowlist: vec!["office".into(), "fs".into(), "browser".into()],
            tool_blocklist: vec![],
            permission_level: "standard".into(),
            compression: "none".into(),
        },
        AgentPreset {
            id: "reviewer".into(),
            name: "代码审查".into(),
            description: "专注代码审查、质量分析和改进建议".into(),
            builtin: true,
            system_prompt_template: "你是一个严谨的代码审查专家，善于发现潜在问题和改进点。".into(),
            tool_allowlist: vec!["fs".into(), "lsp".into(), "git".into()],
            tool_blocklist: vec!["shell".into()],
            permission_level: "readonly".into(),
            compression: "none".into(),
        },
    ];
    Ok(presets)
}

// ===== Image Generators =====

/// Provider 配置要求
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageGenConfigRequirements {
    pub requires_api_key: bool,
    pub api_key_env: Option<String>,
    pub requires_endpoint: bool,
    pub default_endpoint: Option<String>,
}

/// Provider 信息 DTO
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageGenProviderInfo {
    pub provider: String,
    pub display_name: String,
    pub models: Vec<String>,
    pub config_requirements: ImageGenConfigRequirements,
}

/// 列出可用图片生成 Provider
#[tauri::command]
#[specta::specta]
pub async fn image_gen_list_providers() -> Result<Vec<ImageGenProviderInfo>, String> {
    Ok(vec![
        ImageGenProviderInfo {
            provider: "dall-e-3".into(),
            display_name: "DALL-E 3 (OpenAI)".into(),
            models: vec!["dall-e-3".into()],
            config_requirements: ImageGenConfigRequirements {
                requires_api_key: true,
                api_key_env: Some("OPENAI_API_KEY".into()),
                requires_endpoint: false,
                default_endpoint: None,
            },
        },
        ImageGenProviderInfo {
            provider: "flux".into(),
            display_name: "FLUX (Replicate)".into(),
            models: vec!["flux-schnell".into(), "flux-dev".into(), "flux-pro".into()],
            config_requirements: ImageGenConfigRequirements {
                requires_api_key: true,
                api_key_env: Some("REPLICATE_API_TOKEN".into()),
                requires_endpoint: false,
                default_endpoint: None,
            },
        },
        ImageGenProviderInfo {
            provider: "stable-diffusion".into(),
            display_name: "Stable Diffusion (本地/WebUI)".into(),
            models: vec!["sdxl".into(), "sd-1.5".into()],
            config_requirements: ImageGenConfigRequirements {
                requires_api_key: false,
                api_key_env: None,
                requires_endpoint: true,
                default_endpoint: Some("http://127.0.0.1:7860".into()),
            },
        },
        ImageGenProviderInfo {
            provider: "tongyiwanxiang".into(),
            display_name: "通义万相 (阿里云)".into(),
            models: vec!["wanx-v1".into(), "wanx-style-repaint-v1".into()],
            config_requirements: ImageGenConfigRequirements {
                requires_api_key: true,
                api_key_env: Some("DASHSCOPE_API_KEY".into()),
                requires_endpoint: false,
                default_endpoint: None,
            },
        },
        ImageGenProviderInfo {
            provider: "hunyuan".into(),
            display_name: "腾讯混元".into(),
            models: vec!["hunyuan-dall-e".into()],
            config_requirements: ImageGenConfigRequirements {
                requires_api_key: true,
                api_key_env: Some("HUNYUAN_API_KEY".into()),
                requires_endpoint: false,
                default_endpoint: None,
            },
        },
    ])
}
