//! # SSH 远程连接模块
//!
//! 提供密码/密钥认证、远程命令执行等能力。
//!
//! ## 状态
//!
//! 当前 SSH 模块处于**临时禁用**状态（russh 版本兼容性问题）。
//! 详见 `.bak` 文件保留的原始代码。

pub mod connection;

use serde::{Deserialize, Serialize};

// =============================================================================
// 类型定义（桩）
// =============================================================================

/// SSH 认证方式
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SshAuth {
    Password(String),
    Key { key_path: String, passphrase: Option<String> },
}

impl Default for SshAuth {
    fn default() -> Self {
        SshAuth::Password(String::new())
    }
}

/// 主机密钥策略
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HostKeyPolicy {
    AcceptAll,
    AcceptKnown,
    Strict,
}

impl Default for HostKeyPolicy {
    fn default() -> Self {
        HostKeyPolicy::AcceptKnown
    }
}

/// SSH 配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshConfig {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth: SshAuth,
    pub host_key_policy: HostKeyPolicy,
}

/// SSH 连接
#[derive(Debug, Clone)]
pub struct SshConnection;

/// SSH 通道
#[derive(Debug)]
pub struct SshChannel;

/// 连接状态
#[derive(Debug, Clone)]
pub struct ConnectionState;

/// SSH 连接池
#[derive(Debug, Clone)]
pub struct SshConnectionPool;

/// SSH 命令输出（桩）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshOutput {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
}

/// 远程环境变量（桩）
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct RemoteEnvironment {
    pub env_vars: std::collections::HashMap<String, String>,
}

// =============================================================================
// 方法桩
// =============================================================================

impl SshConnection {
    pub async fn open_channel(&self) -> Result<SshChannel, String> {
        Err("SSH module temporarily disabled".to_string())
    }

    pub async fn is_connected(&self) -> bool {
        false
    }

    pub async fn execute_command(&self, _cmd: &str) -> Result<SshOutput, String> {
        Err("SSH module temporarily disabled".to_string())
    }
}

impl SshChannel {
    pub async fn exec(&mut self, _cmd: &str) -> Result<(), String> {
        Err("SSH module temporarily disabled".to_string())
    }

    pub async fn send(&self, _data: &[u8]) -> Result<(), String> {
        Err("SSH module temporarily disabled".to_string())
    }

    pub async fn recv(&self) -> Result<Vec<u8>, String> {
        Err("SSH module temporarily disabled".to_string())
    }
}

impl ConnectionState {
    pub fn is_connected(&self) -> bool {
        false
    }
}

impl Default for ConnectionState {
    fn default() -> Self {
        Self
    }
}

impl SshConnectionPool {
    pub fn new() -> Self {
        panic!("SSH module temporarily disabled")
    }
}

impl Default for SshConnectionPool {
    fn default() -> Self {
        Self::new()
    }
}
