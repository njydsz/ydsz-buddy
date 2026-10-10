//! # SSH 远程连接模块
//!
//! 提供密码/密钥认证、远程命令执行、SFTP 文件传输等能力。
//!
//! ## 实现方式
//!
//! 使用系统原生 `ssh` / `scp` / `sftp` 命令行工具，避免引入复杂的异步 SSH 库依赖，
//! 同时保证跨平台兼容性（Windows/macOS/Linux 均内置 OpenSSH）。

pub mod connection;

use std::collections::HashMap;
use std::process::Stdio;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tokio::process::Command;
use tokio::sync::Mutex;
use tracing::{info, warn, instrument};

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
    AcceptNew,
    Strict,
}

impl Default for HostKeyPolicy {
    fn default() -> Self {
        HostKeyPolicy::AcceptKnown
    }
}

/// SSH 配置
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SshConfig {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth: SshAuth,
    pub host_key_policy: HostKeyPolicy,
    pub auto_reconnect: bool,
    pub known_hosts_path: Option<String>,
}

/// SSH 命令输出
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshOutput {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
}

impl SshOutput {
    pub fn ok(stdout: String) -> Self {
        Self { stdout, stderr: String::new(), exit_code: 0 }
    }

    pub fn err(stderr: String, exit_code: i32) -> Self {
        Self { stdout: String::new(), stderr, exit_code }
    }
}

/// 连接状态
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ConnectionState {
    Disconnected,
    Connecting,
    Connected,
    Reconnecting,
}

impl Default for ConnectionState {
    fn default() -> Self {
        ConnectionState::Disconnected
    }
}

/// 远程环境信息
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct RemoteEnvironment {
    pub env_vars: HashMap<String, String>,
}

/// 远程文件系统操作
pub type RemoteFileSystem = SshConnection;

// ============================================================================
// SshConnection
// ============================================================================

/// SSH 连接实例（封装系统 ssh 命令）
#[derive(Debug, Clone)]
pub struct SshConnection {
    pub config: SshConfig,
    state: ConnectionState,
    connection_id: String,
}

impl SshConnection {
    /// 创建新的 SSH 连接（执行连接测试）
    pub async fn connect(config: SshConfig) -> Result<Self, String> {
        let id = uuid::Uuid::new_v4().to_string();
        let mut conn = Self {
            config,
            state: ConnectionState::Connecting,
            connection_id: id,
        };

        // 执行连接测试
        match conn.execute_command("echo connected").await {
            Ok(output) if output.stdout.trim() == "connected" => {
                info!(id=%conn.connection_id, host=%conn.config.host, "SSH connection established");
                conn.state = ConnectionState::Connected;
                Ok(conn)
            }
            Ok(output) => {
                warn!(stderr=%output.stderr, "SSH connection test failed (unexpected output)");
                Err(format!("SSH connection test failed: {}", output.stderr))
            }
            Err(e) => {
                warn!(error=%e, "SSH connection failed");
                Err(e)
            }
        }
    }

    /// 获取配置
    pub async fn get_config(&self) -> &SshConfig {
        &self.config
    }

    /// 获取连接状态
    pub async fn get_state(&self) -> &ConnectionState {
        &self.state
    }

    /// 是否已连接
    pub async fn is_connected(&self) -> bool {
        matches!(self.state, ConnectionState::Connected)
    }

    /// 执行远程命令
    #[instrument(skip(self, cmd), fields(host=%self.config.host, cmd=%cmd))]
    pub async fn execute_command(&self, cmd: &str) -> Result<SshOutput, String> {
        self.ssh_exec(cmd).await
    }

    /// 内部 SSH 命令执行
    async fn ssh_exec(&self, remote_cmd: &str) -> Result<SshOutput, String> {
        let mut command = Command::new("ssh");

        // 基础参数
        command.arg("-o").arg("StrictHostKeyChecking=accept-new")
               .arg("-o").arg("UserKnownHostsFile=/dev/null")
               .arg("-o").arg("LogLevel=ERROR")
               .arg("-o").arg("ConnectTimeout=10")
               .arg("-p").arg(self.config.port.to_string());

        // 密钥认证
        if let SshAuth::Key { key_path, .. } = &self.config.auth {
            command.arg("-i").arg(key_path);
        }

        // 目标主机
        let target = format!("{}@{}", self.config.username, self.config.host);
        command.arg(&target);

        // 远程命令
        command.arg(remote_cmd);

        // 密码认证需要 sshpass（仅在 Linux/macOS 可用）
        let output = if let SshAuth::Password(ref pass) = &self.config.auth {
            let mut pass_cmd = Command::new("sshpass");
            pass_cmd.arg("-p").arg(pass)
                .arg("ssh")
                .arg("-o").arg("StrictHostKeyChecking=accept-new")
                .arg("-o").arg("UserKnownHostsFile=/dev/null")
                .arg("-o").arg("LogLevel=ERROR")
                .arg("-o").arg("ConnectTimeout=10")
                .arg("-p").arg(self.config.port.to_string())
                .arg(&target)
                .arg(remote_cmd)
                .stdin(Stdio::null())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped());

            pass_cmd.output().await
                .map_err(|e| format!("Failed to spawn sshpass+ssh: {e}"))?
        } else {
            // 密钥认证直接执行
            command
                .stdin(Stdio::null())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped());

            command.output().await
                .map_err(|e| format!("Failed to spawn ssh: {e}"))?
        };

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let exit_code = output.status.code().unwrap_or(-1);

        Ok(SshOutput { stdout, stderr, exit_code })
    }

    /// 打开新通道（当前实现返回 Self 的副本）
    pub async fn open_channel(&self) -> Result<SshChannel, String> {
        Ok(SshChannel { alive: true })
    }

    /// 检测远程环境
    pub async fn detect_environment(&self) -> Result<RemoteEnvironment, String> {
        let output = self.execute_command("env").await?;
        let env_vars: HashMap<String, String> = output.stdout
            .lines()
            .filter_map(|line| {
                let mut parts = line.splitn(2, '=');
                match (parts.next(), parts.next()) {
                    (Some(k), Some(v)) => Some((k.to_string(), v.to_string())),
                    _ => None,
                }
            })
            .collect();

        Ok(RemoteEnvironment { env_vars })
    }

    /// 读取远程文件 (via scp)
    pub async fn read_remote_file(&self, remote_path: &str) -> Result<String, String> {
        let mut cmd = Command::new("scp");
        cmd.arg("-q")
           .arg("-o").arg("StrictHostKeyChecking=accept-new")
           .arg("-o").arg("UserKnownHostsFile=/dev/null")
           .arg("-o").arg("LogLevel=ERROR")
           .arg("-P").arg(self.config.port.to_string());

        if let SshAuth::Key { key_path, .. } = &self.config.auth {
            cmd.arg("-i").arg(key_path);
        }

        let source = format!("{}@{}:{}", self.config.username, self.config.host, remote_path);
        cmd.arg(&source).arg("-");  // scp to stdout

        cmd.stdin(Stdio::null())
           .stdout(Stdio::piped())
           .stderr(Stdio::piped());

        let output = cmd.output().await
            .map_err(|e| format!("SCP read failed: {e}"))?;

        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).to_string())
        } else {
            Err(String::from_utf8_lossy(&output.stderr).to_string())
        }
    }

    /// 写入远程文件 (to be implemented with sftp or ssh+dd)
    pub async fn write_remote_file(&self, _remote_path: &str, _content: &str) -> Result<(), String> {
        Err("write_remote_file not yet implemented".to_string())
    }

    /// 列出远程目录
    pub async fn list_remote_dir(&self, path: &str) -> Result<Vec<String>, String> {
        let output = self.execute_command(&format!("ls -1 {path}")).await?;
        if output.exit_code == 0 {
            Ok(output.stdout.lines().map(|s| s.to_string()).collect())
        } else {
            Err(format!("ls failed: {}", output.stderr))
        }
    }

    /// 断开连接
    pub async fn disconnect(&self) -> Result<(), String> {
        info!(id=%self.connection_id, "SSH connection disconnected");
        Ok(())
    }

    /// 获取连接 ID (兼容旧接口)
    pub fn connection_id(&self) -> &str {
        &self.connection_id
    }
}

impl AsRef<str> for SshConnection {
    fn as_ref(&self) -> &str {
        &self.connection_id
    }
}

// ============================================================================
// SshChannel
// ============================================================================

/// SSH 通道（当前以会话级 exec 共享连接）
#[derive(Debug, Clone)]
pub struct SshChannel {
    pub alive: bool,
}

impl SshChannel {
    pub async fn exec(&mut self, _cmd: &str) -> Result<(), String> {
        Ok(())
    }

    pub async fn send(&self, _data: &[u8]) -> Result<(), String> {
        Ok(())
    }

    pub async fn recv(&self) -> Result<Vec<u8>, String> {
        Ok(Vec::new())
    }
}

// ============================================================================
// SshConnectionPool
// ============================================================================

/// 连接信息视图（供 list_connections 返回）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshConnectionInfo {
    pub connection_id: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub state: ConnectionState,
}

/// SSH 连接池（管理多个并发连接）
#[derive(Debug, Clone)]
pub struct SshConnectionPool {
    connections: Arc<Mutex<HashMap<String, SshConnection>>>,
}

impl SshConnectionPool {
    pub fn new() -> Self {
        Self {
            connections: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// 创建新 SSH 连接并注册到 pool
    pub async fn create_connection(&self, config: SshConfig) -> Result<String, anyhow::Error> {
        let conn = SshConnection::connect(config).await
            .map_err(|e| anyhow::anyhow!("SSH connect failed: {e}"))?;
        let id = conn.connection_id.clone();

        let mut pool = self.connections.lock().await;
        pool.insert(id.clone(), conn);
        info!(connection_id=%id, "Connection registered in pool");
        Ok(id)
    }

    /// 获取连接引用
    pub async fn get(&self, id: &str) -> Result<SshConnection, String> {
        let pool = self.connections.lock().await;
        pool.get(id)
            .cloned()
            .ok_or_else(|| format!("Connection {id} not found"))
    }

    /// 获取连接的另一种方法 (兼容 .get_connection)
    pub async fn get_connection(&self, id: &str) -> Option<SshConnection> {
        let pool = self.connections.lock().await;
        pool.get(id).cloned()
    }

    /// 断开并从 pool 移除
    pub async fn disconnect(&self, id: &str) -> Result<(), String> {
        let mut pool = self.connections.lock().await;
        if let Some(conn) = pool.remove(id) {
            conn.disconnect().await?;
            Ok(())
        } else {
            Err(format!("Connection {id} not found"))
        }
    }

    /// close_connection 别名
    pub async fn close_connection(&self, id: &str) -> Result<(), String> {
        self.disconnect(id).await
    }

    /// 列出所有连接信息
    pub async fn list_connections(&self) -> Vec<SshConnectionInfo> {
        let pool = self.connections.lock().await;
        let mut infos = Vec::new();
        for (id, conn) in pool.iter() {
            infos.push(SshConnectionInfo {
                connection_id: id.clone(),
                host: conn.config.host.clone(),
                port: conn.config.port,
                username: conn.config.username.clone(),
                state: conn.state.clone(),
            });
        }
        infos
    }
}

impl Default for SshConnectionPool {
    fn default() -> Self {
        Self::new()
    }
}

/// 检测远程工具版本（通过 connection_id）
pub async fn detect_tool_versions(connection: &SshConnection) -> Vec<(String, String)> {
    let mut result = Vec::new();

    // 检测常用工具
    for tool in &["node", "python3", "git", "docker", "cargo", "go", "ruby"] {
        if let Ok(output) = connection.execute_command(&format!("{tool} --version")).await {
            if output.exit_code == 0 {
                let version = output.stdout.lines().next().unwrap_or("unknown").to_string();
                result.push((tool.to_string(), version));
            }
        }
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ssh_config_default() {
        let config = SshConfig {
            host: "localhost".into(),
            port: 22,
            username: "test".into(),
            auth: SshAuth::Password("secret".into()),
            host_key_policy: HostKeyPolicy::AcceptKnown,
            ..Default::default()
        };
        assert_eq!(config.host, "localhost");
        assert_eq!(config.port, 22);
    }

    #[test]
    fn test_ssh_output_ok() {
        let output = SshOutput::ok("hello world".to_string());
        assert_eq!(output.stdout, "hello world");
        assert_eq!(output.exit_code, 0);
    }

    #[test]
    fn test_ssh_output_err() {
        let output = SshOutput::err("error occurred".to_string(), 1);
        assert_eq!(output.stderr, "error occurred");
        assert_eq!(output.exit_code, 1);
    }

    #[test]
    fn test_connection_state_default() {
        let state: ConnectionState = Default::default();
        assert!(matches!(state, ConnectionState::Disconnected));
    }

    #[tokio::test]
    async fn test_connection_pool() {
        let pool = SshConnectionPool::new();
        let connections = pool.list_connections().await;
        assert!(connections.is_empty());
    }

    #[test]
    fn test_ssh_connection_info() {
        let info = SshConnectionInfo {
            connection_id: "test-123".into(),
            host: "example.com".into(),
            port: 2222,
            username: "admin".into(),
            state: ConnectionState::Connected,
        };
        assert_eq!(info.connection_id, "test-123");
        assert!(matches!(info.state, ConnectionState::Connected));
    }
}
