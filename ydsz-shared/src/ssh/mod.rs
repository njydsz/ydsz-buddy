pub mod connection;

use serde::{Deserialize, Serialize};

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
    Strict,
    AcceptNew,
}

impl Default for HostKeyPolicy {
    fn default() -> Self {
        HostKeyPolicy::AcceptNew
    }
}

/// SSH 连接配置
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SshConfig {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth: SshAuth,
    pub auto_reconnect: bool,
    pub host_key_policy: HostKeyPolicy,
    pub known_hosts_path: Option<std::path::PathBuf>,
}

/// SSH 执行输出
#[derive(Debug, Clone)]
pub struct SshOutput {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
}

/// SSH 连接状态
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ConnectionState {
    Disconnected,
    Connecting,
    Connected,
    Reconnecting,
}

/// Remote environment info
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteEnvironment {
    pub os: String,
    pub arch: String,
    pub shell: String,
}

/// 远程文件系统操作
#[derive(Debug, Clone)]
pub struct RemoteFileSystem {
    connection_id: String,
}

impl RemoteFileSystem {
    pub fn new(connection_id: impl AsRef<str>) -> Self {
        Self { connection_id: connection_id.as_ref().to_string() }
    }
    pub async fn read_file(&self, _path: &str) -> anyhow::Result<String> {
        Ok(String::new())
    }
    pub async fn write_file(&self, _path: &str, content: &str, _create_directories: bool) -> anyhow::Result<()> {
        let _ = content;
        Ok(())
    }
    pub async fn list_directory(&self, _path: &str) -> anyhow::Result<Vec<String>> {
        Ok(vec![])
    }
    pub async fn delete_file(&self, _path: &str) -> anyhow::Result<()> {
        Ok(())
    }
    pub async fn create_directory(&self, _path: &str, _recursive: bool) -> anyhow::Result<()> {
        Ok(())
    }
    pub async fn delete_directory(&self, _path: &str, _recursive: bool) -> anyhow::Result<()> {
        Ok(())
    }
}

/// SSH channel (bidirectional communication)
#[derive(Debug, Clone)]
pub struct SshChannel {
    pub alive: bool,
}

impl SshChannel {
    pub fn new() -> Self {
        Self { alive: true }
    }

    pub async fn exec(&mut self, _command: &str) -> anyhow::Result<SshOutput> {
        Ok(SshOutput {
            stdout: String::new(),
            stderr: String::new(),
            exit_code: 0,
        })
    }

    pub async fn send(&mut self, data: &[u8]) -> anyhow::Result<()> {
        let _ = data;
        Ok(())
    }

    pub async fn recv(&mut self) -> anyhow::Result<Option<Vec<u8>>> {
        Ok(None)
    }

    pub async fn close(&mut self) -> anyhow::Result<()> {
        self.alive = false;
        Ok(())
    }
}

impl Default for SshChannel {
    fn default() -> Self {
        Self::new()
    }
}

/// SSH connection with id
#[derive(Debug, Clone)]
pub struct SshConnection {
    pub id: String,
    pub config: SshConfig,
    state: ConnectionState,
}

impl SshConnection {
    pub fn new(config: SshConfig) -> Self {
        Self { id: String::new(), config, state: ConnectionState::Connected }
    }

    pub async fn connect(config: &SshConfig) -> anyhow::Result<Self> {
        Ok(Self { id: String::new(), config: config.clone(), state: ConnectionState::Connected })
    }

    pub async fn open_channel(&self) -> anyhow::Result<SshChannel> {
        Ok(SshChannel::new())
    }

    pub async fn exec(&self, _command: &str) -> anyhow::Result<SshOutput> {
        Ok(SshOutput {
            stdout: String::new(),
            stderr: String::new(),
            exit_code: 0,
        })
    }

    pub async fn is_connected(&self) -> bool {
        true
    }

    pub async fn execute_command(&self, command: &str) -> anyhow::Result<SshOutput> {
        self.exec(command).await
    }
    
    pub async fn get_config(&self) -> &SshConfig {
        &self.config
    }
    
    pub async fn get_state(&self) -> ConnectionState {
        self.state
    }
    
    /// Detect remote environment (stub)
    pub async fn detect_environment(&self) -> anyhow::Result<RemoteEnvironment> {
        Ok(RemoteEnvironment {
            os: "unknown".to_string(),
            arch: "unknown".to_string(),
            shell: "sh".to_string(),
        })
    }
}

impl AsRef<str> for SshConnection {
    fn as_ref(&self) -> &str {
        &self.id
    }
}

/// Detect tool versions from SSH connection id (stub)
pub async fn detect_tool_versions(_conn_id: &str) -> anyhow::Result<Vec<(String, String)>> {
    Ok(vec![])
}
