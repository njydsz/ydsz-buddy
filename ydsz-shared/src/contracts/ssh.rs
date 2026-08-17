use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshConnectParams {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth: SshAuthParams,
    pub auto_reconnect: bool,
    pub host_key_policy: SshHostKeyPolicy,
    pub known_hosts_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SshAuthParams {
    Password { password: String },
    Key { key_path: String, passphrase: Option<String> },
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SshHostKeyPolicy {
    AcceptAll,
    Strict,
    AcceptNew,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshConnectionStatusView {
    pub connection_id: String,
    pub state: SshConnectionState,
    pub host: String,
    pub port: u16,
    pub username: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SshConnectionState {
    Disconnected,
    Connecting,
    Connected,
    Reconnecting,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshCreateDirectoryParams {
    pub connection_id: String,
    pub path: String,
    pub recursive: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshDeleteDirectoryParams {
    pub connection_id: String,
    pub path: String,
    pub recursive: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshWriteFileParams {
    pub connection_id: String,
    pub path: String,
    pub content: String,
    pub create_directories: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshDeleteFileParams {
    pub connection_id: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshReadFileParams {
    pub connection_id: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshListDirectoryParams {
    pub connection_id: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshExecParams {
    pub connection_id: String,
    pub command: String,
    pub timeout_secs: Option<u64>,
}

impl Default for SshConnectParams {
    fn default() -> Self {
        Self {
            host: String::new(),
            port: 22,
            username: String::new(),
            auth: SshAuthParams::Password { password: String::new() },
            auto_reconnect: true,
            host_key_policy: SshHostKeyPolicy::AcceptNew,
            known_hosts_path: None,
        }
    }
}
