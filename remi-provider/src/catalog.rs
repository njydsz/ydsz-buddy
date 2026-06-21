//! # Provider 静态能力目录
//!
//! 为各 Provider 适配器提供默认的模型/Agent 目录。
//! 该目录为内置静态数据，不依赖运行时查询，适用于：
//! - 前端模型/Agent 选择器初始化
//! - 未启动会话时的能力预览
//! - 适配器未实现动态发现时的降级展示
//!
//! 各适配器可通过覆盖 `ProviderAdapter::list_models` / `list_agents`
//! 提供动态发现能力；未覆盖时默认使用本目录。

use remi_core::provider::{
    ProviderAgentDescriptor, ProviderKind, ProviderListAgentsResult, ProviderListModelsResult,
    ProviderModelDescriptor,
};

/// 返回指定 Provider 的默认模型目录
pub fn default_models_for(provider: ProviderKind) -> ProviderListModelsResult {
    let models = match provider {
        ProviderKind::ClaudeAgent => vec![
            ProviderModelDescriptor {
                slug: "claude-sonnet-4-5".to_string(),
                name: "Claude Sonnet 4.5".to_string(),
                upstream_provider_id: Some("claudeAgent".to_string()),
                upstream_provider_name: None,
                default_context_window: Some("200000".to_string()),
            },
            ProviderModelDescriptor {
                slug: "claude-opus-4-1".to_string(),
                name: "Claude Opus 4.1".to_string(),
                upstream_provider_id: Some("claudeAgent".to_string()),
                upstream_provider_name: None,
                default_context_window: Some("200000".to_string()),
            },
            ProviderModelDescriptor {
                slug: "claude-haiku-4".to_string(),
                name: "Claude Haiku 4".to_string(),
                upstream_provider_id: Some("claudeAgent".to_string()),
                upstream_provider_name: None,
                default_context_window: Some("200000".to_string()),
            },
        ],
        ProviderKind::Codex => vec![
            ProviderModelDescriptor {
                slug: "gpt-5".to_string(),
                name: "GPT-5".to_string(),
                upstream_provider_id: Some("codex".to_string()),
                upstream_provider_name: None,
                default_context_window: Some("200000".to_string()),
            },
            ProviderModelDescriptor {
                slug: "gpt-5-mini".to_string(),
                name: "GPT-5 Mini".to_string(),
                upstream_provider_id: Some("codex".to_string()),
                upstream_provider_name: None,
                default_context_window: Some("128000".to_string()),
            },
            ProviderModelDescriptor {
                slug: "o3".to_string(),
                name: "o3".to_string(),
                upstream_provider_id: Some("codex".to_string()),
                upstream_provider_name: None,
                default_context_window: Some("200000".to_string()),
            },
        ],
        ProviderKind::Cursor => vec![
            ProviderModelDescriptor {
                slug: "cursor-default".to_string(),
                name: "Cursor Default".to_string(),
                upstream_provider_id: Some("cursor".to_string()),
                upstream_provider_name: None,
                default_context_window: Some("128000".to_string()),
            },
            ProviderModelDescriptor {
                slug: "cursor-small".to_string(),
                name: "Cursor Small".to_string(),
                upstream_provider_id: Some("cursor".to_string()),
                upstream_provider_name: None,
                default_context_window: Some("128000".to_string()),
            },
        ],
        ProviderKind::Gemini => vec![
            ProviderModelDescriptor {
                slug: "gemini-2-5-pro".to_string(),
                name: "Gemini 2.5 Pro".to_string(),
                upstream_provider_id: Some("gemini".to_string()),
                upstream_provider_name: None,
                default_context_window: Some("2000000".to_string()),
            },
            ProviderModelDescriptor {
                slug: "gemini-2-5-flash".to_string(),
                name: "Gemini 2.5 Flash".to_string(),
                upstream_provider_id: Some("gemini".to_string()),
                upstream_provider_name: None,
                default_context_window: Some("1000000".to_string()),
            },
        ],
        ProviderKind::Grok => vec![
            ProviderModelDescriptor {
                slug: "grok-4".to_string(),
                name: "Grok 4".to_string(),
                upstream_provider_id: Some("grok".to_string()),
                upstream_provider_name: None,
                default_context_window: Some("256000".to_string()),
            },
            ProviderModelDescriptor {
                slug: "grok-4-fast".to_string(),
                name: "Grok 4 Fast".to_string(),
                upstream_provider_id: Some("grok".to_string()),
                upstream_provider_name: None,
                default_context_window: Some("128000".to_string()),
            },
        ],
        ProviderKind::Kilo => vec![ProviderModelDescriptor {
            slug: "kilo-code".to_string(),
            name: "Kilo Code".to_string(),
            upstream_provider_id: Some("kilo".to_string()),
            upstream_provider_name: None,
            default_context_window: Some("128000".to_string()),
        }],
        ProviderKind::OpenCode => vec![ProviderModelDescriptor {
            slug: "opencode-default".to_string(),
            name: "OpenCode Default".to_string(),
            upstream_provider_id: Some("opencode".to_string()),
            upstream_provider_name: None,
            default_context_window: Some("128000".to_string()),
        }],
        ProviderKind::Pi => vec![ProviderModelDescriptor {
            slug: "pi-default".to_string(),
            name: "Pi Default".to_string(),
            upstream_provider_id: Some("pi".to_string()),
            upstream_provider_name: None,
            default_context_window: Some("32000".to_string()),
        }],
    };

    ProviderListModelsResult {
        models,
        source: Some("static-catalog".to_string()),
        cached: Some(false),
    }
}

/// 返回指定 Provider 的默认 Agent 目录
pub fn default_agents_for(provider: ProviderKind) -> ProviderListAgentsResult {
    let agents = match provider {
        ProviderKind::ClaudeAgent => vec![
            ProviderAgentDescriptor {
                name: "claude-software-engineer".to_string(),
                display_name: "Software Engineer".to_string(),
                description: Some("通用软件工程 Agent，擅长代码编写、调试、重构".to_string()),
                model: None,
            },
            ProviderAgentDescriptor {
                name: "claude-code-reviewer".to_string(),
                display_name: "Code Reviewer".to_string(),
                description: Some("代码审查 Agent，专注代码质量与最佳实践".to_string()),
                model: None,
            },
        ],
        ProviderKind::Codex => vec![ProviderAgentDescriptor {
            name: "codex-assistant".to_string(),
            display_name: "Codex Assistant".to_string(),
            description: Some("OpenAI Codex 通用助手".to_string()),
            model: None,
        }],
        ProviderKind::Cursor => vec![ProviderAgentDescriptor {
            name: "cursor-assistant".to_string(),
            display_name: "Cursor Assistant".to_string(),
            description: Some("Cursor 内置助手".to_string()),
            model: None,
        }],
        ProviderKind::Gemini => vec![ProviderAgentDescriptor {
            name: "gemini-assistant".to_string(),
            display_name: "Gemini Assistant".to_string(),
            description: Some("Gemini 通用助手".to_string()),
            model: None,
        }],
        ProviderKind::Grok => vec![ProviderAgentDescriptor {
            name: "grok-assistant".to_string(),
            display_name: "Grok Assistant".to_string(),
            description: Some("Grok 通用助手".to_string()),
            model: None,
        }],
        ProviderKind::Kilo => vec![],
        ProviderKind::OpenCode => vec![],
        ProviderKind::Pi => vec![],
    };

    ProviderListAgentsResult {
        agents,
        source: Some("static-catalog".to_string()),
        cached: Some(false),
    }
}
