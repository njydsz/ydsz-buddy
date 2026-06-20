//! # Codex 进程环境变量管理
//!
//! 本模块负责为 Codex 子进程构造干净的环境变量集合。
//!
//! ## 设计目标
//!
//! - 过滤掉会污染 Codex 行为的变量（如 `CLAUDE_*`、`OPENAI_*` 等）
//! - 注入运行所需的最小变量集（`PATH`、`HOME`、`CODEX_HOME`）
//! - 支持工作空间级覆盖（每个工作目录可设置不同的 Codex home）

use std::collections::HashMap;
use std::path::Path;

use crate::adapters::codex_home_paths::CodexHomeLayout;

/// Codex 进程环境变量集合
#[derive(Debug, Clone)]
pub struct CodexProcessEnv {
    /// 环境变量键值对
    vars: HashMap<String, String>,
}

impl CodexProcessEnv {
    /// 基于父进程环境构建 Codex 子进程环境
    ///
    /// - 过滤所有 `CLAUDE_*` / `ANTHROPIC_*` / `OPENAI_*` 等竞争 Provider 变量
    /// - 注入 `CODEX_HOME`
    pub fn from_parent(home: &CodexHomeLayout) -> Self {
        let mut vars: HashMap<String, String> = std::env::vars()
            .filter(|(k, _)| !is_blocked_var(k))
            .collect();

        vars.insert(
            "CODEX_HOME".to_string(),
            home.home.to_string_lossy().to_string(),
        );
        // 给 Codex CLI 传递一个稳定标识，便于子进程判断运行模式
        vars.insert("REMI_PARENT_PID".to_string(), std::process::id().to_string());
        Self { vars }
    }

    /// 构造一个空环境（仅注入 Codex 必需变量）
    pub fn minimal(home: &CodexHomeLayout) -> Self {
        let mut vars = HashMap::new();
        if let Ok(path) = std::env::var("PATH") {
            vars.insert("PATH".to_string(), path);
        }
        if let Ok(home_dir) = std::env::var("HOME") {
            vars.insert("HOME".to_string(), home_dir);
        }
        vars.insert(
            "CODEX_HOME".to_string(),
            home.home.to_string_lossy().to_string(),
        );
        Self { vars }
    }

    /// 注入额外变量
    pub fn with_var(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.vars.insert(key.into(), value.into());
        self
    }

    /// 移除某个变量
    pub fn without(mut self, key: &str) -> Self {
        self.vars.remove(key);
        self
    }

    /// 获取所有键值对（按 key 排序）
    pub fn into_sorted_vec(self) -> Vec<(String, String)> {
        let mut v: Vec<(String, String)> = self.vars.into_iter().collect();
        v.sort_by(|a, b| a.0.cmp(&b.0));
        v
    }

    /// 临时切换到指定工作目录
    ///
    /// 注：这不会真的修改 cwd，而是把 `PWD` 变量覆盖为目标值。
    pub fn with_cwd(self, cwd: &Path) -> Self {
        self.with_var("PWD", cwd.to_string_lossy().to_string())
    }
}

fn is_blocked_var(key: &str) -> bool {
    matches!(
        key,
        "CLAUDE_CODE"
            | "CLAUDE_CODE_ENTRYPOINT"
            | "CLAUDE_PROJECT_DIR"
            | "ANTHROPIC_API_KEY"
            | "ANTHROPIC_AUTH_TOKEN"
            | "OPENAI_API_KEY"
            | "OPENAI_BASE_URL"
            | "OPENAI_ORG_ID"
            | "GEMINI_API_KEY"
            | "GROK_API_KEY"
            | "CURSOR_API_KEY"
            | "KILO_API_KEY"
    )
}
