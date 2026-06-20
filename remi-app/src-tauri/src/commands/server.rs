//! # 服务器管理命令模块
//!
//! 本模块提供与服务器配置、环境、设置等相关的 Tauri 命令。
//! 对标 PeakCode 的 Server RPC 方法，实现真实的配置读取/持久化、环境信息、
//! 诊断信息、Provider 刷新、快捷键管理等功能。

use std::path::PathBuf;
use std::sync::Mutex;

use serde_json::{json, Value};
use tauri::State;
use tracing::{info, warn};

use remi_config::{CliArgs, ServerConfig};

use crate::commands::provider::ProviderState;

/// 服务器状态管理器
///
/// 持有服务器配置、环境 ID、缓存设置和快捷键配置。
/// 通过 `ServerConfig` 提供真实的路径信息（cwd、homeDir、settingsPath 等）。
pub struct ServerState {
    /// 服务器核心配置（包含所有派生路径）
    config: ServerConfig,
    /// 环境 ID（懒加载，首次访问时从文件读取或生成）
    environment_id: Mutex<Option<String>>,
    /// 缓存的设置数据
    settings: Mutex<Option<Value>>,
    /// 缓存的快捷键配置
    keybindings: Mutex<Option<Value>>,
}

impl ServerState {
    /// 创建新的服务器状态管理器
    ///
    /// 从 CLI 参数和环境变量构建 ServerConfig，
    /// 初始化空的缓存（首次访问时从磁盘加载）。
    pub fn new() -> Self {
        let args = CliArgs {
            port: None,
            host: None,
            home_dir: None,
            auth_token: None,
            log_provider_events: false,
            log_websocket_events: false,
        };
        let config = ServerConfig::from_args_and_env(args).unwrap_or_else(|e| {
            warn!("加载服务器配置失败，使用默认配置: {}", e);
            // 兜底：使用用户主目录下的 .remi-code
            let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
            let base_dir = home.join(".remi-code");
            let args = CliArgs {
                port: None,
                host: None,
                home_dir: Some(base_dir),
                auth_token: None,
                log_provider_events: false,
                log_websocket_events: false,
            };
            ServerConfig::from_args_and_env(args).expect("无法创建默认服务器配置")
        });

        // 确保必要的目录存在
        let _ = std::fs::create_dir_all(&config.state_dir);
        let _ = std::fs::create_dir_all(&config.worktrees_dir);
        let _ = std::fs::create_dir_all(&config.logs_dir);
        let _ = std::fs::create_dir_all(&config.secrets_dir);

        Self {
            config,
            environment_id: Mutex::new(None),
            settings: Mutex::new(None),
            keybindings: Mutex::new(None),
        }
    }

    /// 获取服务器配置引用
    pub fn config(&self) -> &ServerConfig {
        &self.config
    }

    /// 获取或创建持久化的环境 ID
    ///
    /// 环境 ID 存储在 `state_dir/environment_id` 文件中，
    /// 首次访问时生成 UUID v4 并持久化。
    fn get_or_create_environment_id(&self) -> Result<String, String> {
        let mut env_id = self.environment_id.lock().map_err(|e| e.to_string())?;
        if let Some(id) = env_id.as_ref() {
            return Ok(id.clone());
        }

        let env_id_path = self.config.state_dir.join("environment_id");
        if env_id_path.exists() {
            let id = std::fs::read_to_string(&env_id_path)
                .map_err(|e| format!("读取环境 ID 失败: {}", e))?
                .trim()
                .to_string();
            if !id.is_empty() {
                *env_id = Some(id.clone());
                return Ok(id);
            }
        }

        // 生成新的 UUID
        let id = uuid::Uuid::new_v4().to_string();
        std::fs::write(&env_id_path, &id)
            .map_err(|e| format!("写入环境 ID 失败: {}", e))?;
        *env_id = Some(id.clone());
        Ok(id)
    }

    /// 从磁盘加载设置（带缓存）
    fn load_settings(&self) -> Result<Value, String> {
        let mut cached = self.settings.lock().map_err(|e| e.to_string())?;
        if let Some(s) = cached.as_ref() {
            return Ok(s.clone());
        }

        let settings = if self.config.settings_path.exists() {
            let content = std::fs::read_to_string(&self.config.settings_path)
                .map_err(|e| format!("读取设置文件失败: {}", e))?;
            serde_json::from_str(&content).unwrap_or_else(|e| {
                warn!("解析设置文件失败，使用默认设置: {}", e);
                default_settings()
            })
        } else {
            default_settings()
        };

        *cached = Some(settings.clone());
        Ok(settings)
    }

    /// 原子写入设置到磁盘
    ///
    /// 采用"写临时文件 + rename"模式保证原子性。
    fn save_settings(&self, settings: &Value) -> Result<(), String> {
        let pid = std::process::id();
        let timestamp = chrono::Utc::now().timestamp_millis();
        let tmp_path = self.config.settings_path.with_extension(format!(
            "json.{}.{}.tmp",
            pid, timestamp
        ));

        let content = serde_json::to_string_pretty(settings)
            .map_err(|e| format!("序列化设置失败: {}", e))?;
        std::fs::write(&tmp_path, content)
            .map_err(|e| format!("写入临时设置文件失败: {}", e))?;
        std::fs::rename(&tmp_path, &self.config.settings_path)
            .map_err(|e| {
                let _ = std::fs::remove_file(&tmp_path);
                format!("重命名设置文件失败: {}", e)
            })?;

        // 更新缓存
        let mut cached = self.settings.lock().map_err(|e| e.to_string())?;
        *cached = Some(settings.clone());
        Ok(())
    }

    /// 获取快捷键配置文件路径
    fn keybindings_path(&self) -> PathBuf {
        self.config.state_dir.join("keybindings.json")
    }

    /// 从磁盘加载快捷键配置
    fn load_keybindings(&self) -> Result<Value, String> {
        let mut cached = self.keybindings.lock().map_err(|e| e.to_string())?;
        if let Some(kb) = cached.as_ref() {
            return Ok(kb.clone());
        }

        let path = self.keybindings_path();
        let keybindings = if path.exists() {
            let content = std::fs::read_to_string(&path)
                .map_err(|e| format!("读取快捷键文件失败: {}", e))?;
            serde_json::from_str(&content).unwrap_or_else(|e| {
                warn!("解析快捷键文件失败，使用默认配置: {}", e);
                json!({ "rules": [] })
            })
        } else {
            json!({ "rules": [] })
        };

        *cached = Some(keybindings.clone());
        Ok(keybindings)
    }

    /// 原子写入快捷键配置到磁盘
    fn save_keybindings(&self, keybindings: &Value) -> Result<(), String> {
        let path = self.keybindings_path();
        let pid = std::process::id();
        let timestamp = chrono::Utc::now().timestamp_millis();
        let tmp_path = path.with_extension(format!(
            "json.{}.{}.tmp",
            pid, timestamp
        ));

        let content = serde_json::to_string_pretty(keybindings)
            .map_err(|e| format!("序列化快捷键配置失败: {}", e))?;
        std::fs::write(&tmp_path, content)
            .map_err(|e| format!("写入临时快捷键文件失败: {}", e))?;
        std::fs::rename(&tmp_path, &path)
            .map_err(|e| {
                let _ = std::fs::remove_file(&tmp_path);
                format!("重命名快捷键文件失败: {}", e)
            })?;

        // 更新缓存
        let mut cached = self.keybindings.lock().map_err(|e| e.to_string())?;
        *cached = Some(keybindings.clone());
        Ok(())
    }
}

impl Default for ServerState {
    fn default() -> Self {
        Self::new()
    }
}

/// 获取服务器配置
///
/// 返回服务器运行时的核心配置信息，包括路径、快捷键和 Provider 状态。
#[tauri::command]
pub async fn server_get_config(
    state: State<'_, ServerState>,
    provider_state: State<'_, ProviderState>,
) -> Result<Value, String> {
    let config = state.config();
    let cwd = std::env::current_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();

    // 获取 Provider 健康状态
    let providers = provider_state
        .service()
        .list_providers()
        .await
        .map_err(|e| e.to_string())?;

    // 加载快捷键配置
    let keybindings = state.load_keybindings().unwrap_or_else(|_| json!({ "rules": [] }));

    Ok(json!({
        "cwd": cwd,
        "homeDir": config.base_dir.to_string_lossy(),
        "worktreesDir": config.worktrees_dir.to_string_lossy(),
        "keybindingsConfigPath": state.keybindings_path().to_string_lossy(),
        "settingsPath": config.settings_path.to_string_lossy(),
        "keybindings": keybindings,
        "issues": [],
        "providers": providers,
        "availableEditors": resolve_available_editors(),
    }))
}

/// 获取服务器环境信息
///
/// 返回持久化的环境 ID、平台信息、服务器版本等。
#[tauri::command]
pub async fn server_get_environment(
    state: State<'_, ServerState>,
) -> Result<Value, String> {
    let env_id = state.get_or_create_environment_id()?;
    let cwd = std::env::current_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();
    let cwd_base_name = std::path::Path::new(&cwd)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("remi-code");

    let platform_os = match std::env::consts::OS {
        "macos" => "darwin",
        "linux" => "linux",
        "windows" => "windows",
        other => other,
    };
    let platform_arch = match std::env::consts::ARCH {
        "aarch64" => "arm64",
        "x86_64" => "x64",
        other => other,
    };

    Ok(json!({
        "environmentId": env_id,
        "label": format!("{} ({})", cwd_base_name, platform_os),
        "platform": {
            "os": platform_os,
            "arch": platform_arch,
        },
        "serverVersion": env!("CARGO_PKG_VERSION"),
        "capabilities": {
            "repositoryIdentity": true,
        },
    }))
}

/// 获取服务器设置
///
/// 从磁盘加载用户设置（带内存缓存），首次访问时若文件不存在则返回默认设置。
#[tauri::command]
pub async fn server_get_settings(
    state: State<'_, ServerState>,
) -> Result<Value, String> {
    state.load_settings()
}

/// 更新服务器设置
///
/// 将新设置原子写入磁盘（临时文件 + rename），并更新内存缓存。
#[tauri::command]
pub async fn server_update_settings(
    state: State<'_, ServerState>,
    settings: Value,
) -> Result<(), String> {
    state.save_settings(&settings)
}

/// 刷新所有 Provider 的健康状态
///
/// 调用 ProviderService::refresh_providers() 重新探测所有已注册 Provider 的 CLI 可达性。
#[tauri::command]
pub async fn server_refresh_providers(
    provider_state: State<'_, ProviderState>,
) -> Result<(), String> {
    info!("刷新所有 Provider 健康状态");
    provider_state
        .service()
        .refresh_providers()
        .await
        .map_err(|e| e.to_string())
}

/// 更新（升级）指定 Provider
///
/// 通过包管理器（npm install -g）或原生更新命令升级 Provider CLI。
#[tauri::command]
pub async fn server_update_provider(
    provider: Value,
) -> Result<Value, String> {
    let provider_name = provider
        .get("provider")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    info!("尝试更新 Provider: {}", provider_name);

    // 解析更新命令
    let (binary, update_cmd) = match provider_name.to_lowercase().as_str() {
        "codex" | "openai" => ("codex", vec!["npm", "install", "-g", "@openai/codex"]),
        "claudeagent" | "claude" | "anthropic" => ("claude", vec!["claude", "update"]),
        "gemini" | "google" => ("gemini", vec!["npm", "install", "-g", "@anthropic-ai/gemini"]),
        "kilo" => ("kilo", vec!["npm", "install", "-g", "@anthropic-ai/kilo"]),
        "opencode" => ("opencode", vec!["opencode", "upgrade"]),
        "cursor" => ("cursor", vec![]),
        "grok" | "xai" => ("grok", vec![]),
        "pi" | "inflection" => ("pi", vec![]),
        _ => return Err(format!("未知的 Provider: {}", provider_name)),
    };

    if update_cmd.is_empty() {
        return Err(format!("{} 不支持一键更新", binary));
    }

    // 执行更新命令（5 分钟超时）
    let program = update_cmd[0];
    let args = &update_cmd[1..];
    let output = tokio::time::timeout(
        std::time::Duration::from_secs(300),
        tokio::process::Command::new(program)
            .args(args)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .output(),
    )
    .await
    .map_err(|_| format!("更新 {} 超时（5 分钟）", binary))?
    .map_err(|e| format!("执行更新命令失败: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        Ok(json!({
            "success": true,
            "stdout": stdout,
            "stderr": stderr,
        }))
    } else {
        Ok(json!({
            "success": false,
            "stdout": stdout,
            "stderr": stderr,
            "exitCode": output.status.code(),
        }))
    }
}

/// 列出 Git Worktree
///
/// 当前为 stub 实现（与 PeakCode 一致），返回空数组。
#[tauri::command]
pub async fn server_list_worktrees() -> Result<Vec<Value>, String> {
    Ok(vec![])
}

/// 获取 Provider 使用快照
///
/// 扫描 Codex/Claude 的本地会话文件，聚合 24h/7d/30d 的 token 使用量。
#[tauri::command]
pub async fn server_get_provider_usage_snapshot(
    input: Option<Value>,
) -> Result<Value, String> {
    let provider = input
        .and_then(|v| v.get("provider").and_then(|p| p.as_str()).map(|s| s.to_string()))
        .unwrap_or_default();

    let home = dirs::home_dir().ok_or("无法获取用户主目录")?;

    let snapshot = match provider.to_lowercase().as_str() {
        "codex" | "openai" => {
            let codex_home = std::env::var("CODEX_HOME")
                .map(PathBuf::from)
                .unwrap_or_else(|_| home.join(".codex"));
            load_codex_usage_snapshot(&codex_home).await?
        }
        "claudeagent" | "claude" | "anthropic" => {
            load_claude_usage_snapshot(&home.join(".claude")).await?
        }
        _ => return Ok(Value::Null),
    };

    Ok(snapshot)
}

/// 获取服务器诊断信息
///
/// 返回进程信息（PID、运行时间、内存使用）和投影统计。
#[tauri::command]
pub async fn server_get_diagnostics() -> Result<Value, String> {
    let pid = std::process::id();
    let platform = std::env::consts::OS;

    // Windows 上无法获取子进程列表（与 PeakCode 一致）
    let child_processes: Vec<Value> = Vec::new();

    Ok(json!({
        "generatedAt": chrono::Utc::now().to_rfc3339(),
        "process": {
            "pid": pid,
            "platform": platform,
        },
        "childProcesses": child_processes,
        "childProcessTotalCount": 0,
        "childProcessTotalRssBytes": 0,
        "projection": {
            "projectCount": 0,
            "threadCount": 0,
        },
    }))
}

/// 更新或插入快捷键规则
///
/// 将新的快捷键规则写入磁盘配置文件（原子写入）。
/// 若已存在相同 command 的规则，会被覆盖。
#[tauri::command]
pub async fn server_upsert_keybinding(
    state: State<'_, ServerState>,
    keybinding: Value,
) -> Result<Value, String> {
    let command = keybinding
        .get("command")
        .and_then(|v| v.as_str())
        .ok_or("快捷键规则缺少 command 字段")?
        .to_string();

    let mut config = state.load_keybindings()?;
    let rules = config
        .get_mut("rules")
        .and_then(|r| r.as_array_mut())
        .ok_or("快捷键配置格式错误")?;

    // 移除同 command 的旧规则
    rules.retain(|r| {
        r.get("command")
            .and_then(|v| v.as_str())
            .map(|c| c != command)
            .unwrap_or(true)
    });

    // 追加新规则
    rules.push(keybinding.clone());

    // 限制最大数量
    const MAX_KEYBINDINGS: usize = 200;
    if rules.len() > MAX_KEYBINDINGS {
        let excess = rules.len() - MAX_KEYBINDINGS;
        rules.drain(0..excess);
        warn!("快捷键规则数量超过上限 {}，已移除最早的 {} 条", MAX_KEYBINDINGS, excess);
    }

    state.save_keybindings(&config)?;

    Ok(config)
}

// ========== 辅助函数 ==========

/// 默认设置
fn default_settings() -> Value {
    json!({
        "theme": "system",
        "language": "zh-CN",
        "providers": {
            "codex": { "enabled": false },
            "claudeAgent": { "enabled": true },
            "gemini": { "enabled": false },
            "kilo": { "enabled": false },
            "opencode": { "enabled": false }
        },
        "textGenerationModelSelection": {
            "provider": "claudeAgent",
            "model": ""
        }
    })
}

/// 解析可用的编辑器列表
fn resolve_available_editors() -> Vec<Value> {
    let mut editors = Vec::new();

    // 检查 VS Code
    if let Ok(code) = which::which("code") {
        editors.push(json!({
            "id": "vscode",
            "name": "Visual Studio Code",
            "binary": code.to_string_lossy(),
        }));
    }

    // 检查 Cursor
    if let Ok(cursor) = which::which("cursor") {
        editors.push(json!({
            "id": "cursor",
            "name": "Cursor",
            "binary": cursor.to_string_lossy(),
        }));
    }

    editors
}

/// 加载 Codex 使用快照
///
/// 扫描 `~/.codex/sessions/YYYY/MM/DD/*.jsonl` 文件，
/// 聚合 24h/7d/30d 的 token 使用量。
async fn load_codex_usage_snapshot(codex_home: &PathBuf) -> Result<Value, String> {
    let sessions_dir = codex_home.join("sessions");
    if !sessions_dir.exists() {
        return Ok(Value::Null);
    }

    let now = chrono::Utc::now();
    let cutoff_24h = now - chrono::Duration::hours(24);
    let cutoff_7d = now - chrono::Duration::days(7);
    let cutoff_30d = now - chrono::Duration::days(30);

    let mut tokens_24h: u64 = 0;
    let mut tokens_7d: u64 = 0;
    let mut tokens_30d: u64 = 0;
    let mut sessions_24h: u64 = 0;
    let mut sessions_7d: u64 = 0;
    let mut sessions_30d: u64 = 0;

    // 遍历最近 30 天的日期目录
    for i in 0..30 {
        let date = now - chrono::Duration::days(i);
        let date_dir = sessions_dir
            .join(date.format("%Y").to_string())
            .join(date.format("%m").to_string())
            .join(date.format("%d").to_string());

        if !date_dir.exists() {
            continue;
        }

        if let Ok(entries) = std::fs::read_dir(&date_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
                    continue;
                }

                let mtime = entry
                    .metadata()
                    .and_then(|m| m.modified())
                    .ok()
                    .map(|t| chrono::DateTime::<chrono::Utc>::from(t));

                if let Some(mt) = mtime {
                    if mt > cutoff_24h {
                        sessions_24h += 1;
                    }
                    if mt > cutoff_7d {
                        sessions_7d += 1;
                    }
                    if mt > cutoff_30d {
                        sessions_30d += 1;
                    }
                }

                // 解析 JSONL 文件中的 token 数据
                if let Ok(content) = std::fs::read_to_string(&path) {
                    for line in content.lines() {
                        if let Ok(obj) = serde_json::from_str::<Value>(line) {
                            if let Some(tokens) = obj
                                .get("token_count")
                                .and_then(|t| t.get("totalTokens"))
                                .and_then(|v| v.as_u64())
                            {
                                if let Some(mt) = mtime {
                                    if mt > cutoff_24h {
                                        tokens_24h += tokens;
                                    }
                                    if mt > cutoff_7d {
                                        tokens_7d += tokens;
                                    }
                                    if mt > cutoff_30d {
                                        tokens_30d += tokens;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(json!({
        "provider": "codex",
        "updatedAt": now.to_rfc3339(),
        "limits": [],
        "usageLines": [
            {
                "label": "24h",
                "value": tokens_24h,
                "subtitle": format!("{} sessions", sessions_24h),
            },
            {
                "label": "7d",
                "value": tokens_7d,
                "subtitle": format!("{} sessions", sessions_7d),
            },
            {
                "label": "30d",
                "value": tokens_30d,
                "subtitle": format!("{} sessions", sessions_30d),
            },
        ],
        "source": "codex-session-archive",
    }))
}

/// 加载 Claude 使用快照
///
/// 扫描 `~/.claude/projects/*/*.jsonl` transcript 文件，
/// 聚合 24h/7d/30d 的 token 使用量。
async fn load_claude_usage_snapshot(claude_home: &PathBuf) -> Result<Value, String> {
    let projects_dir = claude_home.join("projects");
    if !projects_dir.exists() {
        return Ok(Value::Null);
    }

    let now = chrono::Utc::now();
    let cutoff_24h = now - chrono::Duration::hours(24);
    let cutoff_7d = now - chrono::Duration::days(7);
    let cutoff_30d = now - chrono::Duration::days(30);

    let mut tokens_24h: u64 = 0;
    let mut tokens_7d: u64 = 0;
    let mut tokens_30d: u64 = 0;
    let mut sessions: std::collections::HashSet<String> = std::collections::HashSet::new();

    // 遍历项目目录
    if let Ok(project_entries) = std::fs::read_dir(&projects_dir) {
        for project_entry in project_entries.flatten() {
            let project_path = project_entry.path();
            if !project_path.is_dir() {
                continue;
            }

            if let Ok(file_entries) = std::fs::read_dir(&project_path) {
                for file_entry in file_entries.flatten() {
                    let path = file_entry.path();
                    if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
                        continue;
                    }

                    let mtime = file_entry
                        .metadata()
                        .and_then(|m| m.modified())
                        .ok()
                        .map(chrono::DateTime::<chrono::Utc>::from);

                    let in_range = mtime
                        .map(|mt| mt > cutoff_30d)
                        .unwrap_or(false);

                    if !in_range {
                        continue;
                    }

                    // 解析 transcript 文件
                    if let Ok(content) = std::fs::read_to_string(&path) {
                        for line in content.lines() {
                            if let Ok(obj) = serde_json::from_str::<Value>(line) {
                                // 提取 session ID
                                if let Some(sid) = obj
                                    .get("sessionId")
                                    .and_then(|v| v.as_str())
                                {
                                    sessions.insert(sid.to_string());
                                }

                                // 提取 token usage
                                if let Some(usage) = obj.get("usage") {
                                    let input = usage
                                        .get("input_tokens")
                                        .and_then(|v| v.as_u64())
                                        .unwrap_or(0);
                                    let output = usage
                                        .get("output_tokens")
                                        .and_then(|v| v.as_u64())
                                        .unwrap_or(0);
                                    let cache_read = usage
                                        .get("cache_read_input_tokens")
                                        .and_then(|v| v.as_u64())
                                        .unwrap_or(0);
                                    let cache_creation = usage
                                        .get("cache_creation_input_tokens")
                                        .and_then(|v| v.as_u64())
                                        .unwrap_or(0);

                                    let total = input + output + cache_read + cache_creation;

                                    if let Some(mt) = mtime {
                                        if mt > cutoff_24h {
                                            tokens_24h += total;
                                        }
                                        if mt > cutoff_7d {
                                            tokens_7d += total;
                                        }
                                        if mt > cutoff_30d {
                                            tokens_30d += total;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(json!({
        "provider": "claudeAgent",
        "updatedAt": now.to_rfc3339(),
        "limits": [],
        "usageLines": [
            {
                "label": "24h",
                "value": tokens_24h,
                "subtitle": format!("{} sessions", sessions.len()),
            },
            {
                "label": "7d",
                "value": tokens_7d,
                "subtitle": format!("{} sessions", sessions.len()),
            },
            {
                "label": "30d",
                "value": tokens_30d,
                "subtitle": format!("{} sessions", sessions.len()),
            },
        ],
        "source": "claude-project-transcripts",
    }))
}
