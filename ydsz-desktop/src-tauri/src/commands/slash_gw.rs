//! 斜杠命令跨渠道化网关（P1-7）
//!
//! 参考 Octop infra/gateway/slash/ 的设计：
//! - 每条命令有来源过滤（im / ui / cli / all）
//! - 统一解析：/name args → SlashCommand + 参数
//! - 元命令跨所有渠道生效（/model, /status, /cron 等）

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;

/// 命令来源
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CommandOrigin {
    Ui,     // 桌面端 UI（前端 Composer）
    Im,     // IM 通道（飞书/钉钉/企微用户消息）
    Cli,    // 命令行
    Api,    // HTTP API
}

impl CommandOrigin {
    /// 来源是否允许执行该命令
    pub fn can_execute(&self, allowed: &[CommandOrigin]) -> bool {
        allowed.iter().any(|a| std::mem::discriminant(a) == std::mem::discriminant(self))
    }
}

/// 命令来源字符串表示（用于 JSON）
impl std::str::FromStr for CommandOrigin {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "ui" => Ok(CommandOrigin::Ui),
            "im" => Ok(CommandOrigin::Im),
            "cli" => Ok(CommandOrigin::Cli),
            "api" => Ok(CommandOrigin::Api),
            _ => Err(format!("Unknown origin: {}", s)),
        }
    }
}

impl std::fmt::Display for CommandOrigin {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CommandOrigin::Ui => write!(f, "ui"),
            CommandOrigin::Im => write!(f, "im"),
            CommandOrigin::Cli => write!(f, "cli"),
            CommandOrigin::Api => write!(f, "api"),
        }
    }
}

/// 从字符串转换为 CommandOrigin
pub fn parse_origin(s: &str) -> CommandOrigin {
    match s {
        "im" => CommandOrigin::Im,
        "cli" => CommandOrigin::Cli,
        "api" => CommandOrigin::Api,
        _ => CommandOrigin::Ui,
    }
}

/// 斜杠命令元数据
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct SlashCommandInfo {
    pub name: String,
    pub description: String,
    pub usage: Option<String>,
    pub origins: Vec<String>,       // 允许的来源列表
    pub category: SlashCommandCategory,
}

/// 命令分类
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub enum SlashCommandCategory {
    Meta,       // 元命令：/model /status /mode（跨所有渠道）
    Session,    // 会话管理：/new /switch /delete
    Platform,   // 平台管理：/help /cron /agent /connectors
    Ai,         // AI 任务：/compact /retry /fork
}

/// 斜杠命令解析结果
#[derive(Debug, Clone)]
pub struct SlashCommand {
    pub name: String,
    pub args: String,
}

/// 斜杠命令网关
pub struct SlashGateway {
    commands: Mutex<Vec<SlashCommandInfo>>,
}

impl SlashGateway {
    pub fn new() -> Self {
        let commands = Self::builtin_commands();
        Self { commands: Mutex::new(commands) }
    }

    /// 注册自定义命令
    pub fn register(&self, cmd: SlashCommandInfo) {
        if let Ok(mut cmds) = self.commands.lock() {
            // 替换同名命令或追加
            if let Some(idx) = cmds.iter().position(|c| c.name == cmd.name) {
                cmds[idx] = cmd;
            } else {
                cmds.push(cmd);
            }
        }
    }

    /// 取消注册命令
    pub fn unregister(&self, name: &str) {
        if let Ok(mut cmds) = self.commands.lock() {
            cmds.retain(|c| c.name != name);
        }
    }

    /// 列出所有可用的斜杠命令（按来源过滤）
    pub fn list_commands(&self, origin: &CommandOrigin) -> Vec<SlashCommandInfo> {
        self.commands.lock()
            .map(|cmds| {
                cmds.iter()
                    .filter(|cmd| origin.can_execute(&cmd.origins.iter().map(|s| parse_origin(s)).collect::<Vec<_>>()))
                    .cloned()
                    .collect()
            })
            .unwrap_or_default()
    }

    /// 解析文本为斜杠命令
    pub fn parse(text: &str) -> Option<SlashCommand> {
        let trimmed = text.trim();
        if !trimmed.starts_with('/') {
            return None;
        }

        let rest = &trimmed[1..];
        let (name, args) = match rest.find(|c: char| c.is_whitespace()) {
            Some(pos) => {
                let name = &rest[..pos];
                let args = rest[pos..].trim();
                (name.to_lowercase(), args.to_string())
            }
            None => (rest.to_lowercase(), String::new()),
        };

        if name.is_empty() { return None; }
        Some(SlashCommand { name, args })
    }

    /// 执行斜杠命令（MVP：返回描述文本；生产环境需对接 agent_loop）
    pub fn execute(&self, cmd: &SlashCommand, _origin: &CommandOrigin) -> Result<String, String> {
        match cmd.name.as_str() {
            "help" => {
                let cmds = self.commands.lock()
                    .map(|c| c.iter().map(|cmd| format!("/{} - {}", cmd.name, cmd.description)).collect::<Vec<_>>().join("\n"))
                    .unwrap_or_default();
                Ok(format!("可用斜杠命令：\n{}", cmds))
            }
            "model" => {
                if cmd.args.is_empty() {
                    Ok("当前模型：default\n使用 /model <name> 切换模型".into())
                } else {
                    Ok(format!("已切换到模型：{}", cmd.args))
                }
            }
            "status" => {
                Ok(format!(
                    "ydsz-buddy 状态\n版本：0.3.0\n当前时间：{}\n已注册命令数：{}",
                    chrono::Utc::now().format("%Y-%m-%d %H:%M:%S UTC"),
                    self.commands.lock().map(|c| c.len()).unwrap_or(0),
                ))
            }
            "mode" => {
                match cmd.args.as_str() {
                    "code" | "work" | "ask" | "plan" | "review" => Ok(format!("已切换到 {} 模式", cmd.args)),
                    "" => Ok("当前模式：code\n可选：code / work / ask / plan / review".into()),
                    other => Err(format!("未知模式：{}。可选：code / work / ask / plan / review", other)),
                }
            }
            "new" => {
                // 创建新会话
                let thread_id = format!("thread_{}", chrono::Utc::now().timestamp_millis());
                Ok(format!("已创建新会话: {}", thread_id))
            }
            "switch" => {
                if cmd.args.is_empty() {
                    Err("用法：/switch <thread_id>".into())
                } else {
                    Ok(format!("已切换到会话：{}", cmd.args))
                }
            }
            "clear" => {
                Ok("对话历史已清空".into())
            }
            "compact" => {
                Ok("对话已压缩（上下文窗口优化）".into())
            }
            "cron" => {
                Ok("Cron 管理：\n  /cron list    - 列出任务\n  /cron add <expr> <prompt>  - 添加任务\n  /cron del <id>   - 删除任务".into())
            }
            "agent" => {
                Ok("Agent 管理：\n  /agent list   - 列出专家\n  /agent switch <name>  - 切换专家".into())
            }
            _ => Err(format!("未知命令：/{}。输入 /help 查看帮助。", cmd.name)),
        }
    }

    /// 内置命令列表（对齐 Octop 的 26 条命令子集）
    fn builtin_commands() -> Vec<SlashCommandInfo> {
        vec![
            // 元命令（所有渠道）
            SlashCommandInfo {
                name: "help".into(),
                description: "显示所有可用命令".into(),
                usage: None,
                origins: vec!["ui".into(), "im".into(), "cli".into(), "api".into()],
                category: SlashCommandCategory::Meta,
            },
            SlashCommandInfo {
                name: "model".into(),
                description: "查看或切换当前 LLM 模型".into(),
                usage: Some("/model [name]".into()),
                origins: vec!["ui".into(), "im".into(), "cli".into()],
                category: SlashCommandCategory::Meta,
            },
            SlashCommandInfo {
                name: "status".into(),
                description: "查看系统状态".into(),
                usage: None,
                origins: vec!["ui".into(), "im".into(), "cli".into(), "api".into()],
                category: SlashCommandCategory::Meta,
            },
            SlashCommandInfo {
                name: "mode".into(),
                description: "查看或切换运行模式 (code/work/ask/plan/review)".into(),
                usage: Some("/mode <code|work|ask|plan|review>".into()),
                origins: vec!["ui".into(), "im".into(), "cli".into()],
                category: SlashCommandCategory::Meta,
            },
            SlashCommandInfo {
                name: "clear".into(),
                description: "清空当前对话上下文".into(),
                usage: None,
                origins: vec!["ui".into(), "cli".into()],
                category: SlashCommandCategory::Session,
            },
            SlashCommandInfo {
                name: "compact".into(),
                description: "压缩对话上下文（省 token）".into(),
                usage: None,
                origins: vec!["ui".into(), "cli".into()],
                category: SlashCommandCategory::Ai,
            },
            SlashCommandInfo {
                name: "new".into(),
                description: "创建新会话".into(),
                usage: None,
                origins: vec!["ui".into(), "im".into(), "cli".into()],
                category: SlashCommandCategory::Session,
            },
            SlashCommandInfo {
                name: "switch".into(),
                description: "切换到指定会话".into(),
                usage: Some("/switch <thread_id>".into()),
                origins: vec!["im".into(), "cli".into()],
                category: SlashCommandCategory::Session,
            },
            SlashCommandInfo {
                name: "cron".into(),
                description: "管理定时任务".into(),
                usage: Some("/cron <list|add|del>".into()),
                origins: vec!["ui".into(), "cli".into()],  // IM 不可用（安全）
                category: SlashCommandCategory::Platform,
            },
            SlashCommandInfo {
                name: "agent".into(),
                description: "管理专家 Agent".into(),
                usage: Some("/agent <list|switch>".into()),
                origins: vec!["ui".into(), "cli".into()],
                category: SlashCommandCategory::Platform,
            },
        ]
    }
}

impl Clone for SlashGateway {
    fn clone(&self) -> Self {
        Self { commands: Mutex::new(self.commands.lock().map(|c| c.clone()).unwrap_or_default()) }
    }
}

// ──────────── Tauri 命令 ────────────

/// 解析斜杠命令
#[tauri::command]
#[specta::specta]
pub fn slash_parse(
    text: String,
    state: tauri::State<'_, SlashGateway>,
) -> Option<SlashCommandInfoDto> {
    SlashGateway::parse(&text).map(|cmd| SlashCommandInfoDto {
        name: cmd.name,
        args: cmd.args,
    })
}

/// 列出可用命令（按来源过滤）
#[tauri::command]
#[specta::specta]
pub fn slash_list(
    origin: String,
    state: tauri::State<'_, SlashGateway>,
) -> Vec<SlashCommandInfo> {
    let orig = parse_origin(&origin);
    state.list_commands(&orig)
}

/// 执行斜杠命令
#[tauri::command]
#[specta::specta]
pub fn slash_execute(
    name: String,
    args: String,
    origin: String,
    state: tauri::State<'_, SlashGateway>,
) -> Result<String, String> {
    let orig = parse_origin(&origin);
    let cmd = SlashCommand { name, args };
    state.execute(&cmd, &orig)
}

/// 注册自定义斜杠命令
#[tauri::command]
#[specta::specta]
pub fn slash_register(
    cmd: SlashCommandInfo,
    admin_token: String,
    state: tauri::State<'_, SlashGateway>,
) -> Result<(), String> {
    // MVP：简单校验 admin_token（防止无权限用户注册）
    if admin_token.is_empty() {
        return Err("未授权".into());
    }
    state.register(cmd);
    Ok(())
}

/// DTO for slash_parse return
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct SlashCommandInfoDto {
    pub name: String,
    pub args: String,
}
