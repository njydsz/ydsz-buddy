//! Grok ACP 适配器支持
//!
//! 本模块提供与 Grok ACP 客户端集成的能力。

use crate::acp::model::{AcpSessionConfig, AcpSessionMode, AcpSpawnInput};
use crate::acp::runtime::{AcpRuntimeOptions, AcpSessionRuntime};
use crate::error::ProviderResult;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tracing::{debug, info};

/// Grok ACP 运行时设置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GrokAcpRuntimeSettings {
    /// Grok 可执行文件路径
    pub executable_path: Option<String>,
    /// 模型 ID
    pub model_id: String,
    /// API Key 环境变量名
    pub api_key_env: String,
}

/// Grok ACP 运行时输入
#[derive(Debug, Clone)]
pub struct GrokAcpRuntimeInput {
    /// 线程 ID
    pub thread_id: String,
    /// 工作目录
    pub cwd: String,
    /// 运行时设置
    pub settings: GrokAcpRuntimeSettings,
    /// 系统提示
    pub system_prompt: Option<String>,
}

/// 默认 Grok agent 二进制名称
pub const DEFAULT_GROK_AGENT_BINARY: &str = "grok";

/// 获取 Grok API Key 环境变量名
pub fn get_grok_api_key_env(settings: &GrokAcpRuntimeSettings) -> &str {
    &settings.api_key_env
}

/// 检查是否配置了 Grok API Key
pub fn has_grok_api_key_env(settings: &GrokAcpRuntimeSettings) -> bool {
    std::env::var(&settings.api_key_env).is_ok()
}

/// 解析 Grok ACP 认证方式
pub fn resolve_grok_acp_auth_method_id(settings: &GrokAcpRuntimeSettings) -> String {
    if has_grok_api_key_env(settings) {
        "api_key".to_string()
    } else {
        "oauth".to_string()
    }
}

/// 构建 Grok ACP 生成输入
pub fn build_grok_acp_spawn_input(
    input: &GrokAcpRuntimeInput,
) -> ProviderResult<AcpSpawnInput> {
    let executable = input
        .settings
        .executable_path
        .clone()
        .unwrap_or_else(|| DEFAULT_GROK_AGENT_BINARY.to_string());

    // 构建命令行参数
    let mut args = vec![];

    // 设置模型
    args.push("--model".to_string());
    args.push(input.settings.model_id.clone());

    // 设置工作目录
    args.push("--cwd".to_string());
    args.push(input.cwd.clone());

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
pub fn apply_grok_acp_model_selection(
    settings: &mut GrokAcpRuntimeSettings,
    model_id: &str,
) {
    settings.model_id = model_id.to_string();
    info!(model_id = %model_id, "应用 Grok ACP 模型选择");
}
