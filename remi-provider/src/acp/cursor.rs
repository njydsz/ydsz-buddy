//! Cursor ACP 适配器支持
//!
//! 本模块提供与 Cursor ACP 客户端集成的能力，包括运行时设置、
//! 进程启动参数构建、模型列表解析等功能。
//!
//! # 核心功能
//!
//! - **运行时设置**：[`CursorAcpRuntimeSettings`] 定义 Cursor 客户端的配置
//! - **进程启动**：[`build_cursor_acp_spawn_input`] 构建启动参数
//! - **运行时创建**：[`make_cursor_acp_runtime`] 创建并启动 ACP 会话
//! - **模型解析**：[`parse_cursor_cli_model_list`] 解析 CLI 输出的模型列表
//!
//! # 配置优先级
//!
//! Cursor agent 二进制路径的解析优先级：
//! 1. `executable_path` 配置项（最高优先级）
//! 2. `CURSOR_AGENT_PATH` 环境变量
//! 3. 默认值 `cursor-agent`
//!
//! # 模块依赖
//!
//! - 依赖 [`crate::acp::model`] 中的 ACP 数据类型
//! - 依赖 [`crate::acp::runtime`] 中的 ACP 会话运行时

use crate::acp::model::{AcpSessionConfig, AcpSessionMode, AcpSpawnInput};
use crate::acp::runtime::{AcpRuntimeOptions, AcpSessionRuntime};
use crate::error::ProviderResult;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tracing::{debug, info};

/// Cursor ACP 运行时设置
///
/// 定义 Cursor ACP 客户端的配置参数，包括可执行文件路径、
/// 模型选择和是否使用 Grok agent。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CursorAcpRuntimeSettings {
    /// Cursor 可执行文件路径
    ///
    /// 可选的自定义可执行文件路径。为 None 时按优先级解析：
    /// 1. `CURSOR_AGENT_PATH` 环境变量
    /// 2. 默认值 `cursor-agent`
    pub executable_path: Option<String>,
    /// 模型 ID
    ///
    /// Cursor 客户端使用的 AI 模型标识
    pub model_id: String,
    /// 是否使用 Grok agent
    ///
    /// 启用后，Cursor 将使用 Grok 作为底层 Agent，
    /// 传递 `--agent grok` 参数给 Cursor CLI
    pub use_grok_agent: bool,
}

/// Cursor ACP 运行时输入
///
/// 创建 Cursor ACP 会话运行时所需的全部输入参数。
#[derive(Debug, Clone)]
pub struct CursorAcpRuntimeInput {
    /// 线程 ID
    ///
    /// 关联的 Remi 线程标识，用于与上层业务关联
    pub thread_id: String,
    /// 工作目录
    ///
    /// Cursor 客户端的工作目录，通常为项目根目录
    pub cwd: String,
    /// 运行时设置
    ///
    /// Cursor 客户端的配置参数
    pub settings: CursorAcpRuntimeSettings,
    /// 系统提示
    ///
    /// 可选的系统级提示词，用于设定 Agent 的行为和角色
    pub system_prompt: Option<String>,
}

/// 默认 Cursor agent 二进制名称
pub const DEFAULT_CURSOR_AGENT_BINARY: &str = "cursor-agent";

/// 旧版 Cursor agent 二进制名称
pub const LEGACY_CURSOR_AGENT_BINARY: &str = "agent";

/// 解析 Cursor agent 二进制路径
///
/// 根据配置和环境变量确定 Cursor agent 可执行文件的路径。
/// 解析优先级：
/// 1. `settings.executable_path`（配置项）
/// 2. `CURSOR_AGENT_PATH` 环境变量
/// 3. 默认值 `cursor-agent`
///
/// # 参数
///
/// - `settings`: Cursor ACP 运行时设置
///
/// # 返回值
///
/// 返回解析后的可执行文件路径字符串
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
/// 根据运行时输入构建 ACP 会话的启动参数，包括可执行文件路径、
/// 命令行参数、环境变量和会话配置。
///
/// # 参数
///
/// - `input`: Cursor ACP 运行时输入
///
/// # 返回值
///
/// - `Ok(AcpSpawnInput)`: 构建成功的启动参数
/// - `Err(ProviderError)`: 构建失败（当前实现不会返回错误）
///
/// # 命令行参数
///
/// - `--agent grok`：当 `use_grok_agent` 为 true 时添加
/// - `--model <model_id>`：指定使用的模型
/// - `--cwd <cwd>`：指定工作目录
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
/// 构建 Cursor ACP 启动参数并创建 ACP 会话运行时，
/// 启动 Cursor 客户端子进程并建立通信管道。
///
/// # 参数
///
/// - `input`: Cursor ACP 运行时输入，包含线程 ID、工作目录、设置等
/// - `options`: ACP 运行时选项，控制日志记录和超时等行为
///
/// # 返回值
///
/// - `Ok(AcpSessionRuntime)`: 运行时创建成功
/// - `Err(ProviderError)`: 进程启动失败
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
///
/// 表示 Cursor 客户端支持的一个模型选项，包含模型标识、
/// 名称、描述和工具调用支持情况。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CursorAcpModelChoice {
    /// 模型 ID
    ///
    /// 模型的唯一标识，用于在 API 请求中指定模型
    pub id: String,
    /// 模型名称
    ///
    /// 用户界面中显示的模型名称
    pub name: String,
    /// 模型描述
    ///
    /// 可选的模型功能描述，帮助用户选择合适的模型
    pub description: Option<String>,
    /// 是否支持工具调用
    ///
    /// 标记该模型是否支持 function calling / tool use 能力
    pub supports_tools: bool,
}

/// 解析 Cursor CLI 模型列表
///
/// 从 Cursor CLI 的 `--list-models` 输出中解析可用模型列表。
/// 支持的格式为每行一个模型：`model_id: model_name [description]`
///
/// # 参数
///
/// - `output`: Cursor CLI 的标准输出文本
///
/// # 返回值
///
/// 返回解析后的模型选择列表。空行和以 `#` 开头的注释行会被跳过。
///
/// # 解析格式
///
/// ```text
/// model_id: model_name [description]
/// ```
///
/// - `model_id`: 冒号前的部分，去除首尾空格
/// - `model_name`: 冒号后、方括号前的部分，去除首尾空格
/// - `description`: 方括号内的部分（可选）
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
/// 将模型选择列表转换为简单的 ID 列表，用于模型选择器等场景。
///
/// # 参数
///
/// - `choices`: 模型选择列表引用
///
/// # 返回值
///
/// 返回仅包含模型 ID 的字符串列表
pub fn flatten_cursor_acp_model_choices(choices: &[CursorAcpModelChoice]) -> Vec<String> {
    choices.iter().map(|c| c.id.clone()).collect()
}

