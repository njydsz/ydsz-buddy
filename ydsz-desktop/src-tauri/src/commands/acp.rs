//! ACP（Agent Client Protocol）双向集成框架（G10-P1）
//!
//! - 入站：启动 stdio 服务，IDE Agent 可通过 line-delineated JSON 与 ydsz-buddy 交互
//! - 出站：将任务委派给外部 Agent（Code CLI、Claude Code 等）

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use once_cell::sync::Lazy;

/// ACP 协议类型
pub mod types {
    use serde::{Deserialize, Serialize};

    #[derive(Debug, Clone, Serialize, Deserialize)]
    pub struct SessionRequest {
        pub session_id: String,
        pub messages: Vec<AgentMessage>,
    }

    #[derive(Debug, Clone, Serialize, Deserialize)]
    pub struct AgentMessage {
        pub role: String,
        pub content: String,
    }

    #[derive(Debug, Clone, Serialize, Deserialize)]
    pub struct ToolCall {
        pub tool_name: String,
        pub arguments: serde_json::Value,
    }

    #[derive(Debug, Clone, Serialize, Deserialize)]
    pub struct AgentResponse {
        pub session_id: String,
        pub content: String,
        pub tool_calls: Vec<ToolCall>,
        pub finish_reason: Option<String>,
    }

    #[derive(Debug, Clone, Serialize, Deserialize)]
    pub struct AcpError {
        pub code: i32,
        pub message: String,
    }
}

/// ACP 入站服务状态
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct AcpServerStatus {
    pub running: bool,
    pub port: Option<u16>,
    pub active_sessions: u32,
    pub total_requests: u64,
}

/// ACP 出站 Runner 配置
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct AcpRunnerConfig {
    pub id: String,
    pub name: String,           // "claude-code", "codegen", etc.
    pub command: String,        // 可执行文件路径
    pub args: Vec<String>,      // 默认参数
    pub env: HashMap<String, String>,
}

/// ACP 管理器状态
pub struct AcpManager {
    pub server_status: Mutex<AcpServerStatus>,
    pub runners: Mutex<HashMap<String, AcpRunnerConfig>>,
}

impl AcpManager {
    pub fn new() -> Self {
        Self {
            server_status: Mutex::new(AcpServerStatus {
                running: false,
                port: None,
                active_sessions: 0,
                total_requests: 0,
            }),
            runners: Mutex::new(HashMap::new()),
        }
    }

    pub fn get_status(&self) -> AcpServerStatus {
        self.server_status.lock().map(|s| s.clone()).unwrap_or(AcpServerStatus {
            running: false,
            port: None,
            active_sessions: 0,
            total_requests: 0,
        })
    }

    pub fn set_running(&self, running: bool, port: Option<u16>) {
        if let Ok(mut status) = self.server_status.lock() {
            status.running = running;
            status.port = port;
        }
    }

    pub fn register_runner(&self, config: AcpRunnerConfig) -> Result<(), String> {
        if config.command.is_empty() {
            return Err("Runner command 不能为空".into());
        }
        if let Ok(mut runners) = self.runners.lock() {
            runners.insert(config.id.clone(), config);
        }
        Ok(())
    }

    pub fn get_runner(&self, id: &str) -> Option<AcpRunnerConfig> {
        self.runners.lock().ok()?.get(id).cloned()
    }

    pub fn list_runners(&self) -> Vec<AcpRunnerConfig> {
        self.runners.lock().map(|m| m.values().cloned().collect()).unwrap_or_default()
    }

    pub fn remove_runner(&self, id: &str) -> Option<AcpRunnerConfig> {
        self.runners.lock().ok()?.remove(id)
    }
}

/// stdio server 核心逻辑
pub mod stdio_server {
    use super::types::*;
    use std::io::{BufRead, Write};

    /// 运行一个 ACP 入站回话（行分割 JSON）
    #[allow(dead_code)]
    pub fn run_session<R: BufRead, W: Write>(
        reader: R,
        writer: &mut W,
    ) -> Result<(), String> {
        for line in reader.lines() {
            let line = line.map_err(|e| format!("读取失败: {}", e))?;
            if line.trim().is_empty() {
                continue;
            }

            let request: SessionRequest = serde_json::from_str(&line)
                .map_err(|e| format!("解析失败: {}", e))?;

            // 简化处理：返回确认消息
            let response = AgentResponse {
                session_id: request.session_id,
                content: "已收到消息，正在处理...".into(),
                tool_calls: vec![],
                finish_reason: Some("stop".into()),
            };

            let response_json = serde_json::to_string(&response)
                .map_err(|e| format!("序列化失败: {}", e))?;

            writeln!(writer, "{}", response_json)
                .map_err(|e| format!("写入失败: {}", e))?;
            writer.flush().map_err(|e| format!("刷新失败: {}", e))?;
        }

        Ok(())
    }
}

// === Tauri 命令 ===

/// 启动 ACP 入站 stdio 服务
#[tauri::command]
#[specta::specta]
pub fn acp_start_server(
    runner_id: Option<String>,
    state: tauri::State<'_, AcpManager>,
) -> Result<String, String> {
    let status = state.get_status();
    if status.running {
        return Err("ACP 服务已在运行中".into());
    }

    let runner_info = if let Some(id) = &runner_id {
        state.get_runner(id).map(|r| format!("{}({})", r.name, r.command))
    } else {
        None
    };

    state.set_running(true, None);

    let msg = match runner_info {
        Some(info) => format!("ACP 服务已启动 ({})", info),
        None => "ACP 服务已启动（无 Runner）".into(),
    };

    log::info!("[ACP] Server started. Runner: {:?}", runner_id);
    Ok(msg)
}

/// 停止 ACP 入站服务
#[tauri::command]
#[specta::specta]
pub fn acp_stop_server(
    state: tauri::State<'_, AcpManager>,
) -> Result<(), String> {
    let status = state.get_status();
    if !status.running {
        return Err("ACP 服务未在运行".into());
    }

    state.set_running(false, None);
    log::info!("[ACP] Server stopped.");
    Ok(())
}

/// 获取 ACP 服务状态
#[tauri::command]
#[specta::specta]
pub fn acp_server_status(
    state: tauri::State<'_, AcpManager>,
) -> AcpServerStatus {
    state.get_status()
}

/// 出站委派任务到外部 Agent
#[tauri::command]
#[specta::specta]
pub fn acp_delegate_task(
    runner_id: String,
    task: String,
    state: tauri::State<'_, AcpManager>,
) -> Result<String, String> {
    let runner = state.get_runner(&runner_id)
        .ok_or_else(|| format!("Runner 不存在: {}", runner_id))?;

    if task.trim().is_empty() {
        return Err("任务描述不能为空".into());
    }

    log::info!(
        "[ACP] Delegating task to {} ({}): {}",
        runner.name,
        runner.command,
        &task[..std::cmp::min(task.len(), 120)]
    );

    // 返回委派 ID（实际执行需要 std::process::Command + tokio async）
    let delegation_id = format!("acp_task_{}", chrono::Utc::now().timestamp_millis());

    Ok(format!(
        "任务已委派给 {} [{}]。任务预览: {}...",
        runner.name,
        delegation_id,
        &task[..std::cmp::min(task.len(), 80)]
    ))
}

/// 列出已注册的 Runner
#[tauri::command]
#[specta::specta]
pub fn acp_list_runners(
    state: tauri::State<'_, AcpManager>,
) -> Vec<AcpRunnerConfig> {
    state.list_runners()
}

/// 注册一个外部 Runner
#[tauri::command]
#[specta::specta]
pub fn acp_register_runner(
    config: AcpRunnerConfig,
    state: tauri::State<'_, AcpManager>,
) -> Result<(), String> {
    state.register_runner(config)
}

/// 移除 Runner
#[tauri::command]
#[specta::specta]
pub fn acp_remove_runner(
    runner_id: String,
    state: tauri::State<'_, AcpManager>,
) -> Result<(), String> {
    state.remove_runner(&runner_id)
        .ok_or_else(|| format!("Runner 不存在: {}", runner_id))
        .map(|_| ())
}
