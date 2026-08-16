//! # DAP 调试适配器注册表
//!
//! 为每种语言配置对应的 DAP Server 命令和参数。
//!
//! 借鉴 VS Code 的 `debuggers` 配置和 Zed 的 debug adapter 注册机制。

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

/// DAP 调试适配器配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DebugAdapterConfig {
    /// 语言标识
    pub language: String,
    /// 显示名
    pub display_name: String,
    /// DAP Server 命令
    pub command: String,
    /// 命令行参数
    pub args: Vec<String>,
    /// 支持的功能
    pub capabilities: DebugAdapterCapabilities,
}

/// 调试适配器能力
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DebugAdapterCapabilities {
    /// 是否支持条件断点
    pub supports_conditional_breakpoints: bool,
    /// 是否支持 logpoint
    pub supports_log_points: bool,
    /// 是否支持函数断点
    pub supports_function_breakpoints: bool,
    /// 是否支持异常断点
    pub supports_exception_breakpoints: bool,
    /// 是否支持 step-back
    pub supports_step_back: bool,
    /// 是否支持 evaluate（REPL）
    pub supports_evaluate: bool,
    /// 是否支持 hover
    pub supports_hover: bool,
    /// 是否支持 watch
    pub supports_watch: bool,
}

/// 调试适配器注册表
pub struct DebugAdapterRegistry {
    configs: HashMap<String, DebugAdapterConfig>,
}

impl DebugAdapterRegistry {
    /// 创建注册表并注册内置适配器
    pub fn new() -> Self {
        let mut registry = Self {
            configs: HashMap::new(),
        };
        registry.register_builtins();
        registry
    }

    /// 注册内置适配器
    fn register_builtins(&mut self) {
        // Node.js — 使用 vscode-js-debug 的 DAP 模式
        self.register(DebugAdapterConfig {
            language: "javascript".to_string(),
            display_name: "Node.js Debugger".to_string(),
            command: "node".to_string(),
            args: vec![
                "--inspect-brk=0".to_string(),
                "${program}".to_string(),
            ],
            capabilities: DebugAdapterCapabilities {
                supports_conditional_breakpoints: true,
                supports_log_points: true,
                supports_evaluate: true,
                supports_hover: true,
                supports_watch: true,
                ..Default::default()
            },
        });

        // TypeScript — 复用 Node.js 调试器（通过 ts-node 或编译后运行）
        self.register(DebugAdapterConfig {
            language: "typescript".to_string(),
            display_name: "TypeScript Debugger".to_string(),
            command: "node".to_string(),
            args: vec![
                "--inspect-brk=0".to_string(),
                "${program}".to_string(),
            ],
            capabilities: DebugAdapterCapabilities {
                supports_conditional_breakpoints: true,
                supports_log_points: true,
                supports_evaluate: true,
                supports_hover: true,
                supports_watch: true,
                ..Default::default()
            },
        });

        // Python — 使用 debugpy
        self.register(DebugAdapterConfig {
            language: "python".to_string(),
            display_name: "Python Debugger (debugpy)".to_string(),
            command: "python".to_string(),
            args: vec![
                "-m".to_string(),
                "debugpy".to_string(),
                "--listen".to_string(),
                "0".to_string(),
                "--wait-for-client".to_string(),
                "${program}".to_string(),
            ],
            capabilities: DebugAdapterCapabilities {
                supports_conditional_breakpoints: true,
                supports_log_points: true,
                supports_function_breakpoints: true,
                supports_exception_breakpoints: true,
                supports_evaluate: true,
                supports_hover: true,
                supports_watch: true,
                ..Default::default()
            },
        });

        // Rust — 使用 lldb-dap
        self.register(DebugAdapterConfig {
            language: "rust".to_string(),
            display_name: "LLDB Debugger".to_string(),
            command: "lldb-dap".to_string(),
            args: vec![],
            capabilities: DebugAdapterCapabilities {
                supports_conditional_breakpoints: true,
                supports_log_points: true,
                supports_function_breakpoints: true,
                supports_exception_breakpoints: true,
                supports_evaluate: true,
                supports_hover: true,
                supports_watch: true,
                ..Default::default()
            },
        });

        // Go — 使用 dlv dap
        self.register(DebugAdapterConfig {
            language: "go".to_string(),
            display_name: "Delve Debugger".to_string(),
            command: "dlv".to_string(),
            args: vec!["dap".to_string()],
            capabilities: DebugAdapterCapabilities {
                supports_conditional_breakpoints: true,
                supports_log_points: true,
                supports_function_breakpoints: true,
                supports_exception_breakpoints: true,
                supports_evaluate: true,
                supports_hover: true,
                supports_watch: true,
                ..Default::default()
            },
        });
    }

    /// 注册一个适配器
    pub fn register(&mut self, config: DebugAdapterConfig) {
        self.configs.insert(config.language.clone(), config);
    }

    /// 获取适配器配置
    pub fn get(&self, language: &str) -> Option<&DebugAdapterConfig> {
        self.configs.get(language)
    }

    /// 列出所有已注册的适配器
    pub fn list(&self) -> Vec<&DebugAdapterConfig> {
        self.configs.values().collect()
    }

    /// 检查是否支持指定语言
    pub fn supports(&self, language: &str) -> bool {
        self.configs.contains_key(language)
    }
}

impl Default for DebugAdapterRegistry {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_has_builtin_adapters() {
        let registry = DebugAdapterRegistry::new();
        assert!(registry.supports("javascript"));
        assert!(registry.supports("typescript"));
        assert!(registry.supports("python"));
        assert!(registry.supports("rust"));
        assert!(registry.supports("go"));
        assert!(!registry.supports("brainfuck"));
    }

    #[test]
    fn registry_lists_all() {
        let registry = DebugAdapterRegistry::new();
        let list = registry.list();
        assert!(list.len() >= 5);
    }

    #[test]
    fn python_adapter_supports_exceptions() {
        let registry = DebugAdapterRegistry::new();
        let py = registry.get("python").unwrap();
        assert!(py.capabilities.supports_exception_breakpoints);
    }

    #[test]
    fn rust_uses_lldb_dap() {
        let registry = DebugAdapterRegistry::new();
        let rust = registry.get("rust").unwrap();
        assert_eq!(rust.command, "lldb-dap");
    }
}
