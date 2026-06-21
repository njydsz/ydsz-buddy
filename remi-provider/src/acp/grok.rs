//! Grok ACP 适配器支持
//!
//! 本模块提供与 Grok ACP 客户端集成的能力，包括运行时设置、
//! 认证方式解析、进程启动参数构建等功能。
//!
//! # 核心功能
//!
//! - **运行时设置**：[`GrokAcpRuntimeSettings`] 定义 Grok 客户端的配置
//! - **认证管理**：支持 API Key 和 OAuth 两种认证方式
//! - **进程启动**：[`build_grok_acp_spawn_input`] 构建启动参数
//! - **运行时创建**：[`make_grok_acp_runtime`] 创建并启动 ACP 会话
//! - **模型切换**：[`apply_grok_acp_model_selection`] 动态切换模型
//!
//! # 认证方式
//!
//! Grok 支持两种认证方式，根据环境变量自动选择：
//! - **API Key**：当 `api_key_env` 指定的环境变量存在时使用
//! - **OAuth**：当 API Key 环境变量不存在时回退使用
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

/// Grok ACP 运行时设置
///
/// 定义 Grok ACP 客户端的配置参数，包括可执行文件路径、
/// 模型选择和 API Key 环境变量名。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GrokAcpRuntimeSettings {
    /// Grok 可执行文件路径
    ///
    /// 可选的自定义可执行文件路径。为 None 时使用默认值 `grok`
    pub executable_path: Option<String>,
    /// 模型 ID
    ///
    /// Grok 客户端使用的 AI 模型标识，如 "grok-4"、"grok-4-fast" 等
    pub model_id: String,
    /// API Key 环境变量名
    ///
    /// 存储 Grok API Key 的环境变量名称，如 "XAI_API_KEY"。
    /// 当该环境变量存在时使用 API Key 认证，否则回退到 OAuth 认证。
    pub api_key_env: String,
}

/// Grok ACP 运行时输入
///
/// 创建 Grok ACP 会话运行时所需的全部输入参数。
#[derive(Debug, Clone)]
pub struct GrokAcpRuntimeInput {
    /// 线程 ID
    ///
    /// 关联的 Remi 线程标识，用于与上层业务关联
    pub thread_id: String,
    /// 工作目录
    ///
    /// Grok 客户端的工作目录，通常为项目根目录
    pub cwd: String,
    /// 运行时设置
    ///
    /// Grok 客户端的配置参数
    pub settings: GrokAcpRuntimeSettings,
    /// 系统提示
    ///
    /// 可选的系统级提示词，用于设定 Agent 的行为和角色
    pub system_prompt: Option<String>,
}

/// 默认 Grok agent 二进制名称
pub const DEFAULT_GROK_AGENT_BINARY: &str = "grok";

/// 获取 Grok API Key 环境变量名
///
/// 返回设置中配置的 API Key 环境变量名称。
///
/// # 参数
///
/// - `settings`: Grok ACP 运行时设置
///
/// # 返回值
///
/// 返回环境变量名字符串的引用
pub fn get_grok_api_key_env(settings: &GrokAcpRuntimeSettings) -> &str {
    &settings.api_key_env
}

/// 检查是否配置了 Grok API Key
///
/// 检查 `api_key_env` 指定的环境变量是否已设置。
///
/// # 参数
///
/// - `settings`: Grok ACP 运行时设置
///
/// # 返回值
///
/// - `true`: API Key 环境变量已设置
/// - `false`: API Key 环境变量未设置
pub fn has_grok_api_key_env(settings: &GrokAcpRuntimeSettings) -> bool {
    std::env::var(&settings.api_key_env).is_ok()
}

/// 解析 Grok ACP 认证方式
///
/// 根据 API Key 环境变量是否存在，确定使用的认证方式：
/// - API Key 环境变量存在 → `"api_key"`
/// - API Key 环境变量不存在 → `"oauth"`
///
/// # 参数
///
/// - `settings`: Grok ACP 运行时设置
///
/// # 返回值
///
/// 返回认证方式标识字符串：
/// - `"api_key"`: 使用 API Key 认证
/// - `"oauth"`: 使用 OAuth 认证
pub fn resolve_grok_acp_auth_method_id(settings: &GrokAcpRuntimeSettings) -> String {
    if has_grok_api_key_env(settings) {
        "api_key".to_string()
    } else {
        "oauth".to_string()
    }
}

/// 构建 Grok ACP 生成输入
///
/// 根据运行时输入构建 ACP 会话的启动参数，包括可执行文件路径、
/// 命令行参数、环境变量和会话配置。
///
/// # 参数
///
/// - `input`: Grok ACP 运行时输入
///
/// # 返回值
///
/// - `Ok(AcpSpawnInput)`: 构建成功的启动参数
/// - `Err(ProviderError)`: 构建失败（当前实现不会返回错误）
///
/// # 命令行参数
///
/// - `--model <model_id>`：指定使用的模型
/// - `--cwd <cwd>`：指定工作目录
///
/// # 环境变量
///
/// 自动传递 `api_key_env` 指定的环境变量（如果存在），
/// 通常为 `XAI_API_KEY` 等 API Key。
pub fn build_grok_acp_spawn_input(
    input: &GrokAcpRuntimeInput,
) -> ProviderResult<AcpSpawnInput> {
    let executable = input
        .settings
        .executable_path
        .clone()
        .unwrap_or_else(|| DEFAULT_GROK_AGENT_BINARY.to_string());

    // 构建命令行参数
    let args = vec![
        "--model".to_string(),
        input.settings.model_id.clone(),
        "--cwd".to_string(),
        input.cwd.clone(),
    ];

    // 构建环境变量
    let mut env = HashMap::new();

    // 传递 API Key
    let api_key_env = &input.settings.api_key_env;
    if let Ok(value) = std::env::var(api_key_env) {
        env.insert(api_key_env.clone(), value);
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
        "构建 Grok ACP 生成输入"
    );

    Ok(AcpSpawnInput {
        executable,
        args,
        env,
        cwd: Some(input.cwd.clone()),
        config,
    })
}

/// 创建 Grok ACP 会话运行时
///
/// 构建 Grok ACP 启动参数并创建 ACP 会话运行时，
/// 启动 Grok 客户端子进程并建立通信管道。
///
/// # 参数
///
/// - `input`: Grok ACP 运行时输入，包含线程 ID、工作目录、设置等
/// - `options`: ACP 运行时选项，控制日志记录和超时等行为
///
/// # 返回值
///
/// - `Ok(AcpSessionRuntime)`: 运行时创建成功
/// - `Err(ProviderError)`: 进程启动失败
pub async fn make_grok_acp_runtime(
    input: GrokAcpRuntimeInput,
    options: AcpRuntimeOptions,
) -> ProviderResult<AcpSessionRuntime> {
    debug!(
        thread_id = %input.thread_id,
        model = %input.settings.model_id,
        "创建 Grok ACP 运行时"
    );

    let spawn_input = build_grok_acp_spawn_input(&input)?;
    AcpSessionRuntime::spawn(spawn_input, input.thread_id, options).await
}

/// 应用 Grok ACP 模型选择
///
/// 动态更新 Grok 运行时设置中的模型 ID，用于运行时模型切换。
///
/// # 参数
///
/// - `settings`: Grok ACP 运行时设置的可变引用
/// - `model_id`: 要切换到的模型 ID
///
/// # 副作用
///
/// 会修改 `settings.model_id` 的值，并记录模型切换日志
pub fn apply_grok_acp_model_selection(
    settings: &mut GrokAcpRuntimeSettings,
    model_id: &str,
) {
    settings.model_id = model_id.to_string();
    info!(model_id = %model_id, "应用 Grok ACP 模型选择");
}
