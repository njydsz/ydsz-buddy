//! # 自定义斜杠命令系统（P1-7）
//!
//! 允许用户注册和执行自定义的斜杠命令，扩展 Agent 的交互能力。
//!
//! ## 核心概念
//!
//! - **SlashCommand**：用户定义的命令（名称、描述、模板、执行器）
//! - **SlashCommandRegistry**：命令注册表（支持内置 + 用户自定义）
//! - **SlashCommandExecutor**：命令执行 trait（支持 Prompt 模板 / Shell 脚本 / Rust 闭包）
//!
//! ## 使用方式
//!
//! 用户在 Composer 中输入 `/command args`，系统自动匹配并执行对应命令。
//! 命令可以展开为 Prompt 模板、执行 Shell 脚本、或调用注册的 Rust 闭包。

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fmt;

// ============================================================================
// 命令定义
// ============================================================================

/// 命令执行器类型
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SlashCommandExecutor {
    /// Prompt 模板：将命令展开为预定义的 Prompt 文本
    /// `{}` 占位符会被替换为用户输入的参数
    PromptTemplate {
        /// Prompt 模板文本
        template: String,
    },
    /// Shell 脚本：执行 Shell 命令，输出注入对话
    ShellScript {
        /// Shell 命令模板（`{}` 为参数占位符）
        command: String,
        /// 工作目录（可选）
        #[serde(skip_serializing_if = "Option::is_none")]
        working_dir: Option<String>,
    },
    /// 内置函数：调用注册的 Rust 闭包（通过名称查找）
    Builtin {
        /// 内置函数名称
        function_name: String,
    },
}

/// # 斜杠命令定义
///
/// 用户可注册的自定义命令，支持 Prompt 模板、Shell 脚本、内置函数三种执行方式。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlashCommand {
    /// 命令名称（不含 / 前缀，如 "review-pr"）
    pub name: String,
    /// 命令描述（用于自动补全提示）
    pub description: String,
    /// 使用示例（展示给用户）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<String>,
    /// 命令执行器
    pub executor: SlashCommandExecutor,
    /// 命令来源（builtin / user）
    #[serde(default = "default_command_source")]
    pub source: CommandSource,
    /// 是否启用
    #[serde(default = "default_enabled")]
    pub enabled: bool,
    /// 创建时间
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
}

fn default_command_source() -> CommandSource {
    CommandSource::User
}

fn default_enabled() -> bool {
    true
}

/// 命令来源
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CommandSource {
    /// 内置命令
    Builtin,
    /// 用户自定义
    User,
}

impl fmt::Display for CommandSource {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            CommandSource::Builtin => write!(f, "builtin"),
            CommandSource::User => write!(f, "user"),
        }
    }
}

impl SlashCommand {
    /// 创建新的 Prompt 模板命令
    pub fn prompt_template(
        name: impl Into<String>,
        description: impl Into<String>,
        template: impl Into<String>,
    ) -> Self {
        Self {
            name: name.into(),
            description: description.into(),
            usage: None,
            executor: SlashCommandExecutor::PromptTemplate {
                template: template.into(),
            },
            source: CommandSource::User,
            enabled: true,
            created_at: Some(chrono::Utc::now()),
        }
    }

    /// 创建新的 Shell 脚本命令
    pub fn shell_script(
        name: impl Into<String>,
        description: impl Into<String>,
        command: impl Into<String>,
    ) -> Self {
        Self {
            name: name.into(),
            description: description.into(),
            usage: None,
            executor: SlashCommandExecutor::ShellScript {
                command: command.into(),
                working_dir: None,
            },
            source: CommandSource::User,
            enabled: true,
            created_at: Some(chrono::Utc::now()),
        }
    }

    /// 创建新的内置函数命令
    pub fn builtin(
        name: impl Into<String>,
        description: impl Into<String>,
        function_name: impl Into<String>,
    ) -> Self {
        Self {
            name: name.into(),
            description: description.into(),
            usage: None,
            executor: SlashCommandExecutor::Builtin {
                function_name: function_name.into(),
            },
            source: CommandSource::Builtin,
            enabled: true,
            created_at: Some(chrono::Utc::now()),
        }
    }

    /// 设置使用示例
    pub fn with_usage(mut self, usage: impl Into<String>) -> Self {
        self.usage = Some(usage.into());
        self
    }

    /// 设置来源
    pub fn with_source(mut self, source: CommandSource) -> Self {
        self.source = source;
        self
    }

    /// 展开 Prompt 模板（将 `{}` 替换为参数）
    pub fn expand_template(&self, args: &str) -> Option<String> {
        match &self.executor {
            SlashCommandExecutor::PromptTemplate { template } => {
                Some(template.replace("{}", args))
            }
            _ => None,
        }
    }
}

// ============================================================================
// 命令执行结果
// ============================================================================

/// 命令执行结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlashCommandResult {
    /// 是否成功
    pub success: bool,
    /// 执行输出（注入对话的内容）
    pub output: String,
    /// 错误信息（失败时）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    /// 执行耗时（毫秒）
    #[serde(default)]
    pub elapsed_ms: u64,
}

impl SlashCommandResult {
    /// 创建成功结果
    pub fn success(output: impl Into<String>) -> Self {
        Self {
            success: true,
            output: output.into(),
            error: None,
            elapsed_ms: 0,
        }
    }

    /// 创建失败结果
    pub fn failure(error: impl Into<String>) -> Self {
        Self {
            success: false,
            output: String::new(),
            error: Some(error.into()),
            elapsed_ms: 0,
        }
    }

    /// 设置耗时
    pub fn with_elapsed(mut self, ms: u64) -> Self {
        self.elapsed_ms = ms;
        self
    }
}

// ============================================================================
// 命令注册表
// ============================================================================

/// # 斜杠命令注册表
///
/// 管理所有内置和用户自定义的斜杠命令。
#[derive(Debug, Clone)]
pub struct SlashCommandRegistry {
    commands: HashMap<String, SlashCommand>,
}

impl Default for SlashCommandRegistry {
    fn default() -> Self {
        Self::new()
    }
}

impl SlashCommandRegistry {
    /// 创建空注册表
    pub fn new() -> Self {
        Self {
            commands: HashMap::new(),
        }
    }

    /// 创建带内置命令的注册表
    pub fn with_builtin_commands() -> Self {
        let mut registry = Self::new();

        // 注册内置命令
        registry.register(SlashCommand::prompt_template(
            "commit",
            "生成符合 Conventional Commits 规范的提交信息",
            "基于当前 staged diff，生成一条符合 Conventional Commits 规范的提交信息。\n\n额外要求：{}",
        ).with_source(CommandSource::Builtin).with_usage("/commit 包含文档更新"));

        registry.register(SlashCommand::prompt_template(
            "review-pr",
            "审查 Pull Request 的代码质量和潜在问题",
            "审查以下 Pull Request 的代码变更，关注：\n1. 代码质量和最佳实践\n2. 潜在 Bug 和安全问题\n3. 性能影响\n4. 测试覆盖\n\nPR 描述：{}",
        ).with_source(CommandSource::Builtin).with_usage("/review-pr 修复登录页面的 XSS 漏洞"));

        registry.register(SlashCommand::prompt_template(
            "explain",
            "解释代码的工作原理",
            "用简洁的语言解释以下代码的工作原理，包括：\n1. 整体功能\n2. 关键逻辑\n3. 潜在问题\n\n代码：{}",
        ).with_source(CommandSource::Builtin).with_usage("/explain 这个 hook 的作用是什么"));

        registry.register(SlashCommand::prompt_template(
            "refactor",
            "重构代码以提高可读性和性能",
            "重构以下代码，目标：\n1. 提高可读性和可维护性\n2. 优化性能\n3. 遵循最佳实践\n\n代码：{}",
        ).with_source(CommandSource::Builtin).with_usage("/refactor 这个函数太复杂了"));

        registry.register(SlashCommand::prompt_template(
            "test",
            "为代码生成单元测试",
            "为以下代码生成全面的单元测试：\n1. 正常路径测试\n2. 边界条件测试\n3. 错误处理测试\n\n代码：{}",
        ).with_source(CommandSource::Builtin).with_usage("/test 这个工具函数"));

        registry.register(SlashCommand::prompt_template(
            "docs",
            "为代码生成文档注释",
            "为以下代码生成专业的文档注释（JSDoc / RustDoc / Javadoc）：\n1. 功能描述\n2. 参数说明\n3. 返回值说明\n4. 使用示例\n\n代码：{}",
        ).with_source(CommandSource::Builtin).with_usage("/docs 这个 API 端点"));

        registry
    }

    /// 注册命令
    pub fn register(&mut self, command: SlashCommand) {
        self.commands.insert(command.name.clone(), command);
    }

    /// 获取命令
    pub fn get(&self, name: &str) -> Option<&SlashCommand> {
        self.commands.get(name)
    }

    /// 删除命令
    pub fn remove(&mut self, name: &str) -> Option<SlashCommand> {
        self.commands.remove(name)
    }

    /// 列出所有命令
    pub fn list(&self) -> Vec<&SlashCommand> {
        self.commands.values().collect()
    }

    /// 列出已启用的命令
    pub fn list_enabled(&self) -> Vec<&SlashCommand> {
        self.commands
            .values()
            .filter(|c| c.enabled)
            .collect()
    }

    /// 按来源筛选
    pub fn list_by_source(&self, source: CommandSource) -> Vec<&SlashCommand> {
        self.commands
            .values()
            .filter(|c| c.source == source)
            .collect()
    }

    /// 搜索命令（名称或描述匹配）
    pub fn search(&self, query: &str) -> Vec<&SlashCommand> {
        let query_lower = query.to_lowercase();
        self.commands
            .values()
            .filter(|c| {
                c.name.to_lowercase().contains(&query_lower)
                    || c.description.to_lowercase().contains(&query_lower)
            })
            .collect()
    }

    /// 解析输入文本，提取命令名称和参数
    pub fn parse_input(&self, input: &str) -> Option<(String, String)> {
        let trimmed = input.trim();
        if !trimmed.starts_with('/') || trimmed.len() <= 1 {
            return None;
        }

        let without_slash = &trimmed[1..];
        let parts: Vec<&str> = without_slash.splitn(2, char::is_whitespace).collect();

        let command_name = parts[0].to_lowercase();
        let args = parts.get(1).unwrap_or(&"").trim().to_string();

        Some((command_name, args))
    }

    /// 执行命令（展开 Prompt 模板）
    pub fn execute(&self, input: &str) -> SlashCommandResult {
        let start = std::time::Instant::now();

        let (command_name, args) = match self.parse_input(input) {
            Some(parsed) => parsed,
            None => {
                return SlashCommandResult::failure("无效的命令格式。命令必须以 / 开头");
            }
        };

        let command = match self.commands.get(&command_name) {
            Some(cmd) => cmd,
            None => {
                return SlashCommandResult::failure(format!(
                    "未知命令: /{}。输入 /help 查看可用命令。",
                    command_name
                ));
            }
        };

        if !command.enabled {
            return SlashCommandResult::failure(format!("命令 /{} 已被禁用", command_name));
        }

        match &command.executor {
            SlashCommandExecutor::PromptTemplate { template } => {
                let expanded = template.replace("{}", &args);
                SlashCommandResult::success(expanded).with_elapsed(start.elapsed().as_millis() as u64)
            }
            SlashCommandExecutor::ShellScript { .. } => {
                // Shell 脚本执行需要运行时支持，这里返回待执行标记
                SlashCommandResult::success(format!(
                    "[Shell 执行] /{} {}\n(需要 Shell 运行时支持)",
                    command_name, args
                ))
                .with_elapsed(start.elapsed().as_millis() as u64)
            }
            SlashCommandExecutor::Builtin { function_name } => {
                SlashCommandResult::success(format!(
                    "[内置函数] {} -> /{} {}",
                    function_name, command_name, args
                ))
                .with_elapsed(start.elapsed().as_millis() as u64)
            }
        }
    }

    /// 获取命令总数
    pub fn count(&self) -> usize {
        self.commands.len()
    }

    /// 检查命令是否存在
    pub fn contains(&self, name: &str) -> bool {
        self.commands.contains_key(name)
    }
}

// ============================================================================
// 测试
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_input() {
        let registry = SlashCommandRegistry::new();

        assert_eq!(
            registry.parse_input("/commit fix bug"),
            Some(("commit".to_string(), "fix bug".to_string()))
        );

        assert_eq!(
            registry.parse_input("/review-pr"),
            Some(("review-pr".to_string(), String::new()))
        );

        assert_eq!(registry.parse_input("hello world"), None);
        assert_eq!(registry.parse_input(""), None);
    }

    #[test]
    fn test_prompt_template_expansion() {
        let cmd = SlashCommand::prompt_template(
            "test",
            "Test command",
            "Do something with {}",
        );

        assert_eq!(cmd.expand_template("my args"), Some("Do something with my args".to_string()));
    }

    #[test]
    fn test_builtin_commands() {
        let registry = SlashCommandRegistry::with_builtin_commands();

        assert!(registry.contains("commit"));
        assert!(registry.contains("review-pr"));
        assert!(registry.contains("explain"));
        assert!(registry.contains("refactor"));
        assert!(registry.contains("test"));
        assert!(registry.contains("docs"));
    }

    #[test]
    fn test_execute_prompt_template() {
        let registry = SlashCommandRegistry::with_builtin_commands();
        let result = registry.execute("/commit 包含类型定义更新");

        assert!(result.success);
        assert!(result.output.contains("Conventional Commits"));
        assert!(result.output.contains("包含类型定义更新"));
    }

    #[test]
    fn test_execute_unknown_command() {
        let registry = SlashCommandRegistry::with_builtin_commands();
        let result = registry.execute("/nonexistent arg");

        assert!(!result.success);
        assert!(result.error.unwrap().contains("未知命令"));
    }

    #[test]
    fn test_search_commands() {
        let registry = SlashCommandRegistry::with_builtin_commands();
        let results = registry.search("review");

        assert!(results.iter().any(|c| c.name == "review-pr"));
    }

    #[test]
    fn test_custom_command() {
        let mut registry = SlashCommandRegistry::new();
        registry.register(
            SlashCommand::prompt_template(
                "deploy",
                "部署到指定环境",
                "执行部署流程到 {} 环境",
            )
        );

        assert!(registry.contains("deploy"));
        let result = registry.execute("/deploy production");
        assert!(result.success);
        assert!(result.output.contains("production"));
    }
}
