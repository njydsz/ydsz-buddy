//! MCP 官方 server 预设模板
//!
//! 这些预设基于官方 Model Context Protocol 服务器实现：
//! <https://github.com/modelcontextprotocol/servers>
//!
//! 用户只需选择预设并填写必填参数（如 GITHUB_TOKEN）即可快速接入。
//!
//! ## 预设清单
//!
//! - **filesystem** — 受限的文件读写
//! - **fetch** — 网页抓取与 Markdown 转换
//! - **memory** — 跨会话知识图谱
//! - **github** — 仓库 / PR / Issue 操作
//! - **git** — 本地 git 命令（status / diff / log / show / blame）
//! - **sqlite** — 本地 SQLite 数据库查询
//! - **postgres** — PostgreSQL 数据库查询
//! - **playwright** — 浏览器自动化（与 BrowserPanel 互补）

use serde::{Deserialize, Serialize};
// `#[derive(specta::Type)]` 用的 derive 宏路径
#[allow(unused_imports)]
use specta::Type;

/// MCP server 预设描述
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct McpServerPreset {
    /// 预设 ID（如 "filesystem"、"fetch"）
    pub id: String,
    /// 显示名称
    pub name: String,
    /// 描述
    pub description: String,
    /// 启动命令
    pub command: String,
    /// 命令参数（占位符用 {path} / {token} 等表示）
    pub args: Vec<String>,
    /// 是否需要工作区路径
    #[serde(default)]
    pub needs_workspace_path: bool,
    /// 需要的环境变量
    #[serde(default)]
    pub env_keys: Vec<String>,
    /// 提示文本（展示给用户）
    #[serde(default)]
    pub hint: Option<String>,
    /// 标签（用于搜索 / 过滤）
    #[serde(default)]
    pub tags: Vec<String>,
    /// 分类（`filesystem` / `database` / `browser` / `version-control` / `knowledge` / `web` / `productivity`）
    #[serde(default)]
    pub category: String,
}

/// 获取所有内置预设
pub fn builtin_presets() -> Vec<McpServerPreset> {
    vec![
        McpServerPreset {
            id: "filesystem".into(),
            name: "Filesystem".into(),
            description: "提供受限的文件读写能力，避免把整个工作区权限暴露给 AI".into(),
            command: "npx".into(),
            args: vec!["-y".into(), "@modelcontextprotocol/server-filesystem".into(), "{path}".into()],
            needs_workspace_path: true,
            env_keys: vec![],
            hint: Some("需要 Node.js 18+ 与网络访问（首次会下载 npx 包）".into()),
            tags: vec!["file".into(), "io".into(), "read".into(), "write".into()],
            category: "filesystem".into(),
        },
        McpServerPreset {
            id: "fetch".into(),
            name: "Fetch".into(),
            description: "网页抓取与 Markdown 转换，给 AI 提供受控的上网能力".into(),
            command: "uvx".into(),
            args: vec!["mcp-server-fetch".into()],
            needs_workspace_path: false,
            env_keys: vec![],
            hint: Some("需要 Python 3.10+ 与 uv；首次运行 uvx 会自动安装".into()),
            tags: vec!["web".into(), "http".into(), "scraping".into(), "markdown".into()],
            category: "web".into(),
        },
        McpServerPreset {
            id: "memory".into(),
            name: "Memory".into(),
            description: "跨会话知识图谱（实体-关系），用作长期记忆后端".into(),
            command: "npx".into(),
            args: vec!["-y".into(), "@modelcontextprotocol/server-memory".into()],
            needs_workspace_path: false,
            env_keys: vec![],
            hint: Some("数据存放在 ~/.mcp-memory/，跨项目共享".into()),
            tags: vec!["knowledge".into(), "graph".into(), "memory".into()],
            category: "knowledge".into(),
        },
        McpServerPreset {
            id: "github".into(),
            name: "GitHub".into(),
            description: "仓库管理 / PR / Issue 操作，需要 GitHub Personal Access Token".into(),
            command: "npx".into(),
            args: vec![
                "-y".into(),
                "@modelcontextprotocol/server-github".into(),
            ],
            needs_workspace_path: false,
            env_keys: vec!["GITHUB_PERSONAL_ACCESS_TOKEN".into()],
            hint: Some("Token 在 https://github.com/settings/tokens 创建；需 repo / read:org / workflow 权限".into()),
            tags: vec!["git".into(), "github".into(), "pr".into(), "issue".into(), "version-control".into()],
            category: "version-control".into(),
        },
        McpServerPreset {
            id: "git".into(),
            name: "Git (Local)".into(),
            description: "本地 git 命令：status / diff / log / show / blame / branch（无需 token）".into(),
            command: "uvx".into(),
            args: vec!["mcp-server-git".into()],
            needs_workspace_path: true,
            env_keys: vec![],
            hint: Some("需要 Python 3.10+ 与 uv；自动定位工作区根目录的 git 仓库".into()),
            tags: vec!["git".into(), "local".into(), "version-control".into()],
            category: "version-control".into(),
        },
        McpServerPreset {
            id: "sqlite".into(),
            name: "SQLite".into(),
            description: "本地 SQLite 数据库查询（schema / read / write），适合项目级数据".into(),
            command: "uvx".into(),
            args: vec!["mcp-server-sqlite".into(), "--db-path".into(), "{path}".into()],
            needs_workspace_path: true,
            env_keys: vec![],
            hint: Some("需要 Python 3.10+ 与 uv；{path} 会被替换为当前工作区根".into()),
            tags: vec!["database".into(), "sql".into(), "sqlite".into()],
            category: "database".into(),
        },
        McpServerPreset {
            id: "postgres".into(),
            name: "PostgreSQL".into(),
            description: "PostgreSQL 数据库查询（只读 + schema）".into(),
            command: "npx".into(),
            args: vec!["-y".into(), "@modelcontextprotocol/server-postgres".into(), "{connection_string}".into()],
            needs_workspace_path: false,
            env_keys: vec![],
            hint: Some("需要 Node.js 18+；用 postgresql://user:pass@host:port/db 形式的连接串".into()),
            tags: vec!["database".into(), "sql".into(), "postgres".into()],
            category: "database".into(),
        },
        McpServerPreset {
            id: "playwright".into(),
            name: "Playwright".into(),
            description: "浏览器自动化（与内嵌 BrowserPanel 互补，用于 headless 场景）".into(),
            command: "npx".into(),
            args: vec!["-y".into(), "@modelcontextprotocol/server-playwright".into()],
            needs_workspace_path: false,
            env_keys: vec![],
            hint: Some("需要 Node.js 18+；首次会下载 Chromium (~150MB)".into()),
            tags: vec!["browser".into(), "e2e".into(), "test".into(), "automation".into()],
            category: "browser".into(),
        },
    ]
}

/// 根据 ID 查找预设
pub fn find_preset(id: &str) -> Option<McpServerPreset> {
    builtin_presets().into_iter().find(|p| p.id == id)
}

/// 按 category 过滤
pub fn presets_by_category(category: &str) -> Vec<McpServerPreset> {
    builtin_presets()
        .into_iter()
        .filter(|p| p.category == category)
        .collect()
}

/// 按 tag 搜索（任一 tag 命中即可）
pub fn search_presets(query: &str) -> Vec<McpServerPreset> {
    let q = query.trim().to_lowercase();
    if q.is_empty() {
        return builtin_presets();
    }
    builtin_presets()
        .into_iter()
        .filter(|p| {
            p.id.to_lowercase().contains(&q)
                || p.name.to_lowercase().contains(&q)
                || p.description.to_lowercase().contains(&q)
                || p.tags.iter().any(|t| t.to_lowercase().contains(&q))
        })
        .collect()
}

/// 用工作区路径 + 环境变量解析预设的命令与参数（替换 {path} / {token} / {connection_string} 占位符）
///
/// 支持的占位符：
/// - `{path}` — 工作区根路径（仅当 `needs_workspace_path` 为 true 时有效）
/// - `{token}` / `{github_token}` — `GITHUB_PERSONAL_ACCESS_TOKEN` 环境变量值
/// - `{connection_string}` — `POSTGRES_CONNECTION_STRING` 环境变量值
/// - 其它 `{KEY}` 形式 — 替换为 `env[KEY]` 值
pub fn resolve_preset(
    preset: &McpServerPreset,
    workspace_path: Option<&str>,
    env: &std::collections::HashMap<String, String>,
) -> (String, Vec<String>, std::collections::HashMap<String, String>) {
    let mut args = preset.args.clone();
    if preset.needs_workspace_path {
        let p = workspace_path.unwrap_or(".");
        args = args
            .into_iter()
            .map(|a| a.replace("{path}", p))
            .collect();
    }
    // 通用占位符替换：{token} / {github_token} / {connection_string} / 任意 {KEY}
    args = args
        .into_iter()
        .map(|a| {
            let mut out = a.clone();
            // 简单情形：精确的 `{token}` / `{github_token}` / `{connection_string}`
            if let Some(v) = env.get("GITHUB_PERSONAL_ACCESS_TOKEN") {
                out = out.replace("{token}", v);
                out = out.replace("{github_token}", v);
            }
            if let Some(v) = env.get("POSTGRES_CONNECTION_STRING") {
                out = out.replace("{connection_string}", v);
            }
            // 通用情形：{KEY} -> env["KEY"]
            // （避免影响上述已替换的占位符）
            for (k, v) in env {
                out = out.replace(&format!("{{{k}}}"), v);
            }
            out
        })
        .collect();
    // 合并预设默认空 env + 用户提供的 env
    let mut merged = std::collections::HashMap::new();
    for k in &preset.env_keys {
        if let Ok(v) = std::env::var(k) {
            merged.insert(k.clone(), v);
        }
    }
    for (k, v) in env {
        // 用户 env 覆盖系统 env
        merged.insert(k.clone(), v.clone());
    }
    (preset.command.clone(), args, merged)
}

/// 校验 GitHub token 格式（`gh[pousr]_*` 长 40+ 字符）
pub fn validate_github_token(token: &str) -> Result<(), String> {
    if token.is_empty() {
        return Err("token 不能为空".to_string());
    }
    if token.len() < 40 {
        return Err("token 长度应 ≥ 40 字符".to_string());
    }
    let prefix = &token[..4];
    if !matches!(prefix, "ghp_" | "gho_" | "ghu_" | "ghs_" | "ghr_") {
        return Err(format!("token 前缀应为 ghp_/gho_/ghu_/ghs_/ghr_ 之一，实际: {prefix}"));
    }
    Ok(())
}

/// 校验 PostgreSQL 连接串格式
pub fn validate_postgres_connection_string(s: &str) -> Result<(), String> {
    if !s.starts_with("postgresql://") && !s.starts_with("postgres://") {
        return Err("连接串需以 postgresql:// 或 postgres:// 开头".to_string());
    }
    if s.len() < 20 {
        return Err("连接串过短".to_string());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn builtin_presets_includes_essentials() {
        let presets = builtin_presets();
        assert!(presets.iter().any(|p| p.id == "filesystem"));
        assert!(presets.iter().any(|p| p.id == "fetch"));
        assert!(presets.iter().any(|p| p.id == "github"));
        assert!(presets.iter().any(|p| p.id == "git"));
        assert!(presets.iter().any(|p| p.id == "sqlite"));
        assert!(presets.iter().any(|p| p.id == "postgres"));
        assert!(presets.iter().any(|p| p.id == "playwright"));
        assert!(presets.iter().any(|p| p.id == "memory"));
    }

    #[test]
    fn resolve_preset_substitutes_workspace_path() {
        let preset = find_preset("filesystem").unwrap();
        let env = HashMap::new();
        let (_, args, _) = resolve_preset(&preset, Some("/tmp/proj"), &env);
        assert!(args.iter().any(|a| a == "/tmp/proj"));
    }

    #[test]
    fn resolve_preset_substitutes_github_token() {
        // github preset 用 env 注入 token，不需要在 args 里替换
        // 但我们仍然测试通用占位符替换：构造一个带 {token} 的 preset
        let _preset = find_preset("github").unwrap();
        let custom = McpServerPreset {
            id: "custom".into(),
            name: "Custom".into(),
            description: "test".into(),
            command: "echo".into(),
            args: vec!["token={token}".into()],
            needs_workspace_path: false,
            env_keys: vec![],
            hint: None,
            tags: vec![],
            category: "test".into(),
        };
        let mut env = HashMap::new();
        env.insert("GITHUB_PERSONAL_ACCESS_TOKEN".into(), "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx".into());
        let (_, args, _) = resolve_preset(&custom, None, &env);
        assert_eq!(args[0], "token=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");
    }

    #[test]
    fn resolve_preset_substitutes_postgres_connection() {
        let preset = find_preset("postgres").unwrap();
        let mut env = HashMap::new();
        env.insert("POSTGRES_CONNECTION_STRING".into(), "postgresql://user:pass@host:5432/db".into());
        let (_, args, _) = resolve_preset(&preset, None, &env);
        assert!(args.iter().any(|a| a == "postgresql://user:pass@host:5432/db"));
    }

    #[test]
    fn resolve_preset_merges_user_env_over_system() {
        let preset = find_preset("github").unwrap();
        std::env::set_var("GITHUB_PERSONAL_ACCESS_TOKEN", "system-token");
        let mut user_env = HashMap::new();
        user_env.insert("GITHUB_PERSONAL_ACCESS_TOKEN".into(), "user-token".into());
        let (_, _, env) = resolve_preset(&preset, None, &user_env);
        // user env should override system
        assert_eq!(env.get("GITHUB_PERSONAL_ACCESS_TOKEN").unwrap(), "user-token");
        std::env::remove_var("GITHUB_PERSONAL_ACCESS_TOKEN");
    }

    #[test]
    fn presets_by_category_filters() {
        let db = presets_by_category("database");
        assert_eq!(db.len(), 2);
        assert!(db.iter().any(|p| p.id == "sqlite"));
        assert!(db.iter().any(|p| p.id == "postgres"));
    }

    #[test]
    fn search_presets_finds_by_tag() {
        let results = search_presets("sql");
        assert!(results.iter().any(|p| p.id == "sqlite"));
        assert!(results.iter().any(|p| p.id == "postgres"));
    }

    #[test]
    fn search_presets_empty_returns_all() {
        assert_eq!(search_presets("").len(), builtin_presets().len());
    }

    #[test]
    fn validate_github_token_ok() {
        assert!(validate_github_token("ghp_a").is_err()); // 长度不足
        let good = format!("ghp_{}", "x".repeat(40));
        assert!(validate_github_token(&good).is_ok());
    }

    #[test]
    fn validate_github_token_rejects_invalid_prefix() {
        let bad = format!("xxp_{}", "x".repeat(40));
        assert!(validate_github_token(&bad).is_err());
    }

    #[test]
    fn validate_github_token_rejects_empty() {
        assert!(validate_github_token("").is_err());
    }

    #[test]
    fn validate_postgres_connection_string_ok() {
        assert!(validate_postgres_connection_string("postgresql://user:pass@host:5432/db").is_ok());
        assert!(validate_postgres_connection_string("postgres://user:pass@host:5432/db").is_ok());
    }

    #[test]
    fn validate_postgres_connection_string_rejects() {
        assert!(validate_postgres_connection_string("mysql://x").is_err());
        assert!(validate_postgres_connection_string("postgresql://x").is_err()); // 太短
    }

    #[test]
    fn all_presets_have_category() {
        for p in builtin_presets() {
            assert!(!p.category.is_empty(), "preset {} missing category", p.id);
        }
    }
}
