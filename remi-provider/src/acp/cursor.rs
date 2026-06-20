//! Cursor ACP 适配器支持
//!
//! 本模块提供与 Cursor ACP 客户端集成的能力。

use crate::acp::model::{AcpSessionConfig, AcpSessionMode, AcpSpawnInput};
use crate::acp::runtime::{AcpRuntimeOptions, AcpSessionRuntime};
use crate::error::ProviderResult;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tracing::{debug, info};

/// Cursor ACP 运行时设置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CursorAcpRuntimeSettings {
    /// Cursor 可执行文件路径
    pub executable_path: Option<String>,
    /// 模型 ID
    pub model_id: String,
    /// 是否使用 Grok agent
    pub use_grok_agent: bool,
}

/// Cursor ACP 运行时输入
#[derive(Debug, Clone)]
pub struct CursorAcpRuntimeInput {
    /// 线程 ID
    pub thread_id: String,
    /// 工作目录
    pub cwd: String,
    /// 运行时设置
    pub settings: CursorAcpRuntimeSettings,
    /// 系统提示
    pub system_prompt: Option<String>,
}

/// 默认 Cursor agent 二进制名称
pub const DEFAULT_CURSOR_AGENT_BINARY: &str = "cursor-agent";

/// 旧版 Cursor agent 二进制名称
pub const LEGACY_CURSOR_AGENT_BINARY: &str = "agent";

/// 解析 Cursor agent 二进制路径
///
/// 根据配置和环境变量确定 Cursor agent 可执行文件的路径。
pub fn resolve_cursor_agent_binary_path(settings: &CursorAcpRuntimeSettings) -> String {
    // 优先使用配置中的路径
    if let Some(path) = &settings.executable_path {
        return path.clone();
    }

    // 检查环境变量
    if let Ok(path) = std::env::var("CURSOR_AGENT_PATH") {
        return path;
    }

    // 使用默认路径
    DEFAULT_CURSOR_AGENT_BINARY.to_string()
}

/// 构建 Cursor ACP 生成输入
///
/// 根据运行时输入构建 ACP 会话的启动参数。
pub fn build_cursor_acp_spawn_input(
    input: &CursorAcpRuntimeInput,
) -> ProviderResult<AcpSpawnInput> {
    let executable = resolve_cursor_agent_binary_path(&input.settings);

    // 构建命令行参数
    let mut args = vec![];

    // 如果需要使用 Grok agent
    if input.settings.use_grok_agent {
        args.push("--agent".to_string());
        args.push("grok".to_string());
    }

    // 设置模型
    args.push("--model".to_string());
    args.push(input.settings.model_id.clone());

    // 设置工作目录
    args.push("--cwd".to_string());
    args.push(input.cwd.clone());

    // 构建环境变量
    let mut env = HashMap::new();

    // 传递必要的环境变量
    if let Ok(value) = std::env::var("CURSOR_API_KEY") {
        env.insert("CURSOR_API_KEY".to_string(), value);
    }

    // 构建会话配置
    let config = AcpSessionConfig {
        model_id: input.settings.model_id.clone(),
        system_prompt: input.system_prompt.clone(),
        mode: AcpSessionMode::Default,
        extra: HashMap::new(),
    };

    info!(
        executable = %executable,
        model = %input.settings.model_id,
        cwd = %input.cwd,
        "构建 Cursor ACP 生成输入"
    );

    Ok(AcpSpawnInput {
        executable,
        args,
        env,
        cwd: Some(input.cwd.clone()),
        config,
    })
}

/// 创建 Cursor ACP 会话运行时
///
/// 启动 Cursor ACP 客户端进程并创建会话运行时。
pub async fn make_cursor_acp_runtime(
    input: CursorAcpRuntimeInput,
    options: AcpRuntimeOptions,
) -> ProviderResult<AcpSessionRuntime> {
    debug!(
        thread_id = %input.thread_id,
        model = %input.settings.model_id,
        "创建 Cursor ACP 运行时"
    );

    let spawn_input = build_cursor_acp_spawn_input(&input)?;
    AcpSessionRuntime::spawn(spawn_input, input.thread_id, options).await
}

/// Cursor ACP 模型选择
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CursorAcpModelChoice {
    /// 模型 ID
    pub id: String,
    /// 模型名称
    pub name: String,
    /// 模型描述
    pub description: Option<String>,
    /// 是否支持工具调用
    pub supports_tools: bool,
}

/// 解析 Cursor CLI 模型列表
///
/// 从 Cursor CLI 输出中解析可用模型列表。
pub fn parse_cursor_cli_model_list(output: &str) -> Vec<CursorAcpModelChoice> {
    let mut models = vec![];

    for line in output.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        // 解析格式: model_id: model_name [description]
        if let Some((id, rest)) = line.split_once(':') {
            let id = id.trim().to_string();
            let rest = rest.trim();

            let (name, description) = if let Some((n, d)) = rest.split_once('[') {
                (n.trim().to_string(), Some(d.trim_end_matches(']').to_string()))
            } else {
                (rest.to_string(), None)
            };

            models.push(CursorAcpModelChoice {
                id,
                name,
                description,
                supports_tools: true, // 默认支持
            });
        }
    }

    models
}

/// 扁平化 Cursor ACP 模型选择
///
/// 将模型选择列表转换为简单的 ID 列表。
pub fn flatten_cursor_acp_model_choices(choices: &[CursorAcpModelChoice]) -> Vec<String> {
    choices.iter().map(|c| c.id.clone()).collect()
}
