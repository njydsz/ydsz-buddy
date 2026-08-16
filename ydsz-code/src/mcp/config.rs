//! MCP 配置文件持久化
//!
//! 工作区根目录下的 `.ydsz/mcp.json` 存储所有 MCP 服务器配置。
//! 格式：
//! ```json
//! {
//!   "version": 1,
//!   "servers": [
//!     {
//!       "id": "filesystem",
//!       "name": "Filesystem",
//!       "command": "npx",
//!       "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
//!       "env": {},
//!       "enabled": true,
//!       "preset": "filesystem"
//!     }
//!   ]
//! }
//! ```

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
// `#[derive(specta::Type)]` 用的 derive 宏路径；需要显式 use 进当前模块作用域
#[allow(unused_imports)]
use specta::Type;

use super::error::{McpError, McpResult};

/// MCP 传输类型
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum McpTransportType {
    /// stdio 传输（启动子进程）
    Stdio,
    /// SSE 传输（HTTP + Server-Sent Events）
    Sse,
}

impl Default for McpTransportType {
    fn default() -> Self {
        Self::Stdio
    }
}

/// MCP 服务器状态（前端展示用，运行时由 McpClient 维护）
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum McpServerStatus {
    /// 未连接
    Disconnected,
    /// 连接中
    Connecting,
    /// 已连接
    Connected,
    /// 连接错误
    Error,
}

/// MCP 服务器配置（与前端 McpServerConfig 对齐）
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct McpServerConfig {
    /// 唯一 ID（前端生成或后端生成）
    pub id: String,
    /// 显示名称
    pub name: String,
    /// 启动命令
    pub command: String,
    /// 命令参数
    #[serde(default)]
    pub args: Vec<String>,
    /// 附加环境变量
    #[serde(default)]
    pub env: HashMap<String, String>,
    /// 传输类型（stdio / sse，默认 stdio）
    /// - stdio: command 为可执行文件名，args 为参数
    /// - sse: command 为 SSE 端点 URL（如 http://localhost:3001/sse），args/env 忽略
    #[serde(default)]
    pub transport_type: McpTransportType,
    /// 是否启用
    #[serde(default = "default_true")]
    pub enabled: bool,
    /// 使用的预设 ID（可选）
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub preset: Option<String>,
    /// 当前状态（运行时）
    #[serde(default = "default_status")]
    pub status: McpServerStatus,
    /// 错误信息
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    /// 最后连接时间戳（毫秒）
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_connected_at: Option<i64>,
}

fn default_true() -> bool {
    true
}

fn default_status() -> McpServerStatus {
    McpServerStatus::Disconnected
}

/// MCP 配置文件结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpStore {
    /// 格式版本
    pub version: u32,
    /// 所有服务器配置
    pub servers: Vec<McpServerConfig>,
}

impl Default for McpStore {
    fn default() -> Self {
        Self {
            version: 1,
            servers: Vec::new(),
        }
    }
}

impl McpStore {
    /// 配置文件路径
    pub fn store_path(workspace_root: &Path) -> PathBuf {
        workspace_root.join(".ydsz").join("mcp.json")
    }

    /// 从工作区根加载，文件不存在则返回空 store
    pub fn load_or_init(workspace_root: &Path) -> McpResult<Self> {
        let path = Self::store_path(workspace_root);
        if !path.exists() {
            return Ok(Self::default());
        }
        let raw = std::fs::read_to_string(&path)?;
        if raw.trim().is_empty() {
            return Ok(Self::default());
        }
        let store: McpStore = serde_json::from_str(&raw)?;
        Ok(store)
    }

    /// 保存到工作区根目录
    pub fn save(&self, workspace_root: &Path) -> McpResult<()> {
        let path = Self::store_path(workspace_root);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let raw = serde_json::to_string_pretty(self)?;
        std::fs::write(&path, raw)?;
        Ok(())
    }

    /// 查找指定 ID 的服务器
    pub fn find(&self, id: &str) -> Option<&McpServerConfig> {
        self.servers.iter().find(|s| s.id == id)
    }

    /// 查找可变引用
    pub fn find_mut(&mut self, id: &str) -> Option<&mut McpServerConfig> {
        self.servers.iter_mut().find(|s| s.id == id)
    }

    /// 添加或替换服务器配置
    pub fn upsert(&mut self, config: McpServerConfig) {
        if let Some(existing) = self.find_mut(&config.id) {
            *existing = config;
        } else {
            self.servers.push(config);
        }
    }

    /// 移除服务器
    pub fn remove(&mut self, id: &str) -> McpResult<McpServerConfig> {
        let pos = self
            .servers
            .iter()
            .position(|s| s.id == id)
            .ok_or_else(|| McpError::ServerNotFound(id.to_string()))?;
        Ok(self.servers.remove(pos))
    }

    /// 列出所有启用的服务器
    pub fn enabled_servers(&self) -> impl Iterator<Item = &McpServerConfig> {
        self.servers.iter().filter(|s| s.enabled)
    }

    /// 返回服务器的数量
    pub fn len(&self) -> usize {
        self.servers.len()
    }

    /// 是否为空
    pub fn is_empty(&self) -> bool {
        self.servers.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn load_or_init_returns_empty_when_missing() {
        let dir = TempDir::new().unwrap();
        let store = McpStore::load_or_init(dir.path()).unwrap();
        assert!(store.servers.is_empty());
    }

    #[test]
    fn save_then_load_round_trip() {
        let dir = TempDir::new().unwrap();
        let mut store = McpStore::default();
        store.upsert(McpServerConfig {
            id: "fs".into(),
            name: "Filesystem".into(),
            command: "npx".into(),
            args: vec!["-y".into(), "server-filesystem".into()],
            env: HashMap::new(),
            enabled: true,
            preset: Some("filesystem".into()),
            status: McpServerStatus::Disconnected,
            error: None,
            last_connected_at: None,
            transport_type: Default::default(),
        });
        store.save(dir.path()).unwrap();

        let loaded = McpStore::load_or_init(dir.path()).unwrap();
        assert_eq!(loaded.servers.len(), 1);
        assert_eq!(loaded.servers[0].id, "fs");
    }

    #[test]
    fn upsert_replaces_existing() {
        let mut store = McpStore::default();
        store.upsert(McpServerConfig {
            id: "fs".into(),
            name: "Old".into(),
            command: "x".into(),
            args: vec![],
            env: HashMap::new(),
            enabled: false,
            preset: None,
            status: McpServerStatus::Disconnected,
            error: None,
            last_connected_at: None,
            transport_type: Default::default(),
        });
        store.upsert(McpServerConfig {
            id: "fs".into(),
            name: "New".into(),
            command: "y".into(),
            args: vec![],
            env: HashMap::new(),
            enabled: true,
            preset: None,
            status: McpServerStatus::Disconnected,
            error: None,
            last_connected_at: None,
            transport_type: Default::default(),
        });
        assert_eq!(store.servers.len(), 1);
        assert_eq!(store.servers[0].name, "New");
    }

    #[test]
    fn load_empty_file_returns_default() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join(".ydsz");
        std::fs::create_dir_all(&path).unwrap();
        std::fs::write(path.join("mcp.json"), "").unwrap();
        let store = McpStore::load_or_init(dir.path()).unwrap();
        assert!(store.servers.is_empty());
        assert_eq!(store.version, 1);
    }

    #[test]
    fn load_whitespace_file_returns_default() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join(".ydsz");
        std::fs::create_dir_all(&path).unwrap();
        std::fs::write(path.join("mcp.json"), "   \n  \n").unwrap();
        let store = McpStore::load_or_init(dir.path()).unwrap();
        assert!(store.servers.is_empty());
    }

    #[test]
    fn load_corrupt_json_returns_error() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join(".ydsz");
        std::fs::create_dir_all(&path).unwrap();
        std::fs::write(path.join("mcp.json"), "{not valid json!!!").unwrap();
        let result = McpStore::load_or_init(dir.path());
        assert!(result.is_err(), "Expected corrupt JSON to fail");
    }

    #[test]
    fn enabled_servers_filters_disabled() {
        let _dir = TempDir::new().unwrap();
        let mut store = McpStore::default();
        store.upsert(McpServerConfig {
            id: "fs".into(),
            name: "FS".into(),
            command: "npx".into(),
            args: vec![],
            env: HashMap::new(),
            enabled: true,
            preset: None,
            status: McpServerStatus::Disconnected,
            error: None,
            last_connected_at: None,
            transport_type: Default::default(),
        });
        store.upsert(McpServerConfig {
            id: "gh".into(),
            name: "GH".into(),
            command: "npx".into(),
            args: vec![],
            env: HashMap::new(),
            enabled: false,
            preset: None,
            status: McpServerStatus::Disconnected,
            error: None,
            last_connected_at: None,
            transport_type: Default::default(),
        });
        let enabled: Vec<&str> = store.enabled_servers().map(|s| s.id.as_str()).collect();
        assert_eq!(enabled, vec!["fs"]);
    }

    #[test]
    fn remove_nonexistent_returns_error() {
        let mut store = McpStore::default();
        let result = store.remove("missing");
        assert!(result.is_err());
        match result {
            Err(McpError::ServerNotFound(id)) => assert_eq!(id, "missing"),
            other => panic!("Expected ServerNotFound, got {other:?}"),
        }
    }

    #[test]
    fn store_len_and_is_empty() {
        let mut store = McpStore::default();
        assert!(store.is_empty());
        assert_eq!(store.len(), 0);
        store.upsert(McpServerConfig {
            id: "s".into(),
            name: "S".into(),
            command: "c".into(),
            args: vec![],
            env: HashMap::new(),
            enabled: true,
            preset: None,
            status: McpServerStatus::Disconnected,
            error: None,
            last_connected_at: None,
            transport_type: Default::default(),
        });
        assert!(!store.is_empty());
        assert_eq!(store.len(), 1);
    }
}
