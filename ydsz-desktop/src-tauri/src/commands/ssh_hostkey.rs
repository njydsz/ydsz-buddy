//! # SSH Known Hosts 严格校验增强（P1 安全增强）
//!
//! 提供 SSH 主机密钥指纹管理 + 严格校验能力，防止中间人攻击。
//!
//! ## 命令
//!
//! | 命令 | 说明 |
//! |------|------|
//! | `ssh_known_hosts_get` | 获取已知主机密钥记录 |
//! | `ssh_known_hosts_add` | 添加/更新主机密钥记录 |
//! | `ssh_known_hosts_remove` | 移除主机密钥记录 |
//! | `ssh_known_hosts_verify` | 验证主机密钥是否匹配 |
//! | `ssh_known_hosts_fingerprint` | 计算远程主机密钥指纹（SSH-Keygen） |
//! | `ssh_known_hosts_enforce_strict` | 默认强制所有新连接使用 Strict 模式 |

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::State;
use tracing::{info, warn};

// ===== DTOs =====

/// 已知主机密钥记录
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnownHostRecord {
    pub host: String,
    pub port: u16,
    pub fingerprint: String,  // SHA256 指纹（格式: base64）
    pub key_type: String,     // "ssh-rsa", "ssh-ed25519" 等
    pub added_at: String,
    pub last_verified_at: Option<String>,
    pub trust_level: String,  // "trusted", "accepted", "revoked"
}

/// 主机密钥验证结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostKeyVerifyResult {
    pub host: String,
    pub port: u16,
    pub status: String,  // "matched", "mismatch", "unknown", "revoked"
    pub expected_fingerprint: Option<String>,
    pub actual_fingerprint: Option<String>,
    pub is_safe: bool,
    pub message: String,
}

/// 严格模式执行策略
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StrictModeConfig {
    pub enabled: bool,
    pub enforce_on_new_connections: bool,
    pub allow_user_override: bool,
    pub default_policy: String, // "strict", "accept_new", "accept_known"
}

// ===== 状态 =====

#[derive(Debug, Clone)]
pub struct SshHostKeyState {
    inner: Arc<Mutex<SshHostKeyInner>>,
}

#[derive(Debug, Clone)]
struct SshHostKeyInner {
    /// 已知主机: "host:port" -> KnownHostRecord
    known_hosts: HashMap<String, KnownHostRecord>,
    /// 严格模式配置
    strict_config: StrictModeConfig,
    /// 数据文件路径
    data_path: Option<PathBuf>,
}

impl SshHostKeyState {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(SshHostKeyInner {
                known_hosts: HashMap::new(),
                strict_config: StrictModeConfig {
                    enabled: true,
                    enforce_on_new_connections: true,
                    allow_user_override: false,
                    default_policy: "strict".to_string(),
                },
                data_path: None,
            })),
        }
    }

    fn host_key(host: &str, port: u16) -> String {
        format!("{host}:{port}")
    }

    /// 添加已知主机
    pub fn add_known_host(&self, record: KnownHostRecord) -> Result<(), String> {
        let mut inner = self.inner.lock().map_err(|e| e.to_string())?;
        let key = Self::host_key(&record.host, record.port);
        info!(host = %record.host, port = record.port, "添加已知主机密钥");
        inner.known_hosts.insert(key, record);
        Ok(())
    }

    /// 移除已知主机
    pub fn remove_known_host(&self, host: &str, port: u16) -> bool {
        let mut inner = match self.inner.lock() {
            Ok(g) => g,
            Err(_) => return false,
        };
        let key = Self::host_key(host, port);
        let existed = inner.known_hosts.remove(&key).is_some();
        if existed {
            info!(host = %host, port = port, "移除已知主机密钥");
        }
        existed
    }

    /// 获取已知主机记录
    pub fn get_known_host(&self, host: &str, port: u16) -> Option<KnownHostRecord> {
        let inner = self.inner.lock().ok()?;
        let key = Self::host_key(host, port);
        inner.known_hosts.get(&key).cloned()
    }

    /// 列出所有已知主机
    pub fn list_known_hosts(&self) -> Vec<KnownHostRecord> {
        self.inner
            .lock()
            .map(|i| i.known_hosts.values().cloned().collect())
            .unwrap_or_default()
    }

    /// 验证主机密钥
    pub fn verify_host_key(
        &self,
        host: &str,
        port: u16,
        actual_fingerprint: &str,
        actual_key_type: &str,
    ) -> HostKeyVerifyResult {
        let mut inner = match self.inner.lock() {
            Ok(g) => g,
            Err(_) => {
                return HostKeyVerifyResult {
                    host: host.to_string(),
                    port,
                    status: "unknown".to_string(),
                    expected_fingerprint: None,
                    actual_fingerprint: Some(actual_fingerprint.to_string()),
                    is_safe: false,
                    message: "状态锁获取失败".to_string(),
                };
            }
        };

        let key = Self::host_key(host, port);

        match inner.known_hosts.get_mut(&key) {
            Some(record) => {
                if record.trust_level == "revoked" {
                    // 已撤销的主机
                    warn!(host = %host, port = port, "连接已撤销的主机");
                    HostKeyVerifyResult {
                        host: host.to_string(),
                        port,
                        status: "revoked".to_string(),
                        expected_fingerprint: Some(record.fingerprint.clone()),
                        actual_fingerprint: Some(actual_fingerprint.to_string()),
                        is_safe: false,
                        message: "主机密钥已被撤销，连接被拒绝".to_string(),
                    }
                } else if record.fingerprint == actual_fingerprint {
                    // 匹配成功
                    record.last_verified_at = Some(chrono::Utc::now().to_rfc3339());
                    HostKeyVerifyResult {
                        host: host.to_string(),
                        port,
                        status: "matched".to_string(),
                        expected_fingerprint: Some(record.fingerprint.clone()),
                        actual_fingerprint: Some(actual_fingerprint.to_string()),
                        is_safe: true,
                        message: "主机密钥验证通过".to_string(),
                    }
                } else {
                    // 密钥不匹配！可能是中间人攻击
                    warn!(
                        host = %host,
                        port = port,
                        expected = %record.fingerprint,
                        actual = %actual_fingerprint,
                        "主机密钥不匹配！疑似 MITM 攻击"
                    );
                    HostKeyVerifyResult {
                        host: host.to_string(),
                        port,
                        status: "mismatch".to_string(),
                        expected_fingerprint: Some(record.fingerprint.clone()),
                        actual_fingerprint: Some(actual_fingerprint.to_string()),
                        is_safe: false,
                        message: "主机密钥与记录不符！可能存在中间人攻击。请确认网络环境后重试。".to_string(),
                    }
                }
            }
            None => {
                // 未知主机
                if inner.strict_config.enforce_on_new_connections && !inner.strict_config.allow_user_override {
                    // 严格模式 + 不允许覆盖 → 拒绝未知主机
                    warn!(host = %host, port = port, "未知主机（严格模式拒绝）");
                    HostKeyVerifyResult {
                        host: host.to_string(),
                        port,
                        status: "unknown".to_string(),
                        expected_fingerprint: None,
                        actual_fingerprint: Some(actual_fingerprint.to_string()),
                        is_safe: false,
                        message: format!(
                            "主机 {}:{} 未知。严格模式下已阻止连接。请先通过安全渠道获取主机密钥指纹并添加到信任列表。",
                            host, port
                        ),
                    }
                } else {
                    // 允许用户接受新主机
                    HostKeyVerifyResult {
                        host: host.to_string(),
                        port,
                        status: "unknown".to_string(),
                        expected_fingerprint: None,
                        actual_fingerprint: Some(actual_fingerprint.to_string()),
                        is_safe: !inner.strict_config.enforce_on_new_connections,
                        message: "未知主机，请在确认网络环境安全后选择是否信任".to_string(),
                    }
                }
            }
        }
    }

    /// 计算公钥指纹（SHA256 → Base64）
    pub fn compute_fingerprint(public_key_pem: &str) -> String {
        // 移除 PEM 头尾和换行
        let cleaned = public_key_pem
            .lines()
            .filter(|l| !l.starts_with("-----"))
            .collect::<String>();
        let decoded = match base64::Engine::decode(&base64::engine::general_purpose::STANDARD, &cleaned) {
            Ok(bytes) => bytes,
            Err(_) => cleaned.as_bytes().to_vec(),
        };
        let hash = Sha256::digest(&decoded);
        base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &hash)
    }

    /// 从 known_hosts 文件加载
    pub fn load_from_file(&self, path: &PathBuf) -> Result<usize, String> {
        if !path.exists() {
            return Ok(0);
        }
        let content = std::fs::read_to_string(path)
            .map_err(|e| format!("读取 known_hosts 失败: {e}"))?;

        let mut loaded = 0;
        for line in content.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            // known_hosts 格式: host key_type base64_key [comment]
            // 或者: host,key_type base64_key (哈希格式)
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 3 {
                let host = parts[0].to_string();
                let key_type = parts[1].to_string();
                let key_data = parts[2];

                let fingerprint = Self::compute_fingerprint(key_data);
                let record = KnownHostRecord {
                    host: host.clone(),
                    port: 22, // 默认端口
                    fingerprint,
                    key_type,
                    added_at: chrono::Utc::now().to_rfc3339(),
                    last_verified_at: None,
                    trust_level: "accepted".to_string(),
                };

                if self.add_known_host(record).is_ok() {
                    loaded += 1;
                }
            }
        }

        info!(loaded = loaded, path = %path.display(), "从 known_hosts 加载完成");
        Ok(loaded)
    }

    /// 保存到 known_hosts 文件
    fn _save_to_file(&self, _path: &PathBuf) -> Result<(), String> {
        // TODO: 实现持久化保存
        Ok(())
    }

    fn _total_records(&self) -> usize {
        self.inner.lock().map(|i| i.known_hosts.len()).unwrap_or(0)
    }
}

impl Default for SshHostKeyState {
    fn default() -> Self {
        Self::new()
    }
}

// ===== Tauri Commands =====

/// 获取已知主机密钥记录
#[tauri::command]
#[specta::specta]
pub async fn ssh_known_hosts_get(
    state: State<'_, SshHostKeyState>,
    host: Option<String>,
    port: Option<u16>,
) -> Result<Vec<KnownHostRecord>, String> {
    match (host, port) {
        (Some(h), Some(p)) => {
            Ok(state.get_known_host(&h, p).into_iter().collect())
        }
        _ => Ok(state.list_known_hosts()),
    }
}

/// 添加/更新主机密钥记录
#[tauri::command]
#[specta::specta]
pub async fn ssh_known_hosts_add(
    state: State<'_, SshHostKeyState>,
    host: String,
    port: u16,
    fingerprint: String,
    key_type: String,
    trust_level: Option<String>,
) -> Result<KnownHostRecord, String> {
    let record = KnownHostRecord {
        host,
        port,
        fingerprint,
        key_type,
        added_at: chrono::Utc::now().to_rfc3339(),
        last_verified_at: None,
        trust_level: trust_level.unwrap_or_else(|| "accepted".to_string()),
    };

    state.add_known_host(record.clone())?;
    Ok(record)
}

/// 移除主机密钥记录
#[tauri::command]
#[specta::specta]
pub async fn ssh_known_hosts_remove(
    state: State<'_, SshHostKeyState>,
    host: String,
    port: u16,
) -> Result<bool, String> {
    Ok(state.remove_known_host(&host, port))
}

/// 验证主机密钥
#[tauri::command]
#[specta::specta]
pub async fn ssh_known_hosts_verify(
    state: State<'_, SshHostKeyState>,
    host: String,
    port: u16,
    actual_fingerprint: String,
    actual_key_type: String,
) -> Result<HostKeyVerifyResult, String> {
    let result = state.verify_host_key(&host, port, &actual_fingerprint, &actual_key_type);
    info!(
        host = %host,
        status = %result.status,
        is_safe = result.is_safe,
        "主机密钥验证完成"
    );
    Ok(result)
}

/// 从 system known_hosts 文件加载
#[tauri::command]
#[specta::specta]
pub async fn ssh_known_hosts_load_system(
    state: State<'_, SshHostKeyState>,
    path: Option<String>,
) -> Result<usize, String> {
    let default_path = dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".ssh")
        .join("known_hosts");

    let load_path = match path {
        Some(p) => PathBuf::from(p),
        None => default_path,
    };

    state.load_from_file(&load_path)
}

/// 计算公钥指纹
#[tauri::command]
#[specta::specta]
pub async fn ssh_compute_fingerprint(
    public_key_pem: String,
) -> Result<String, String> {
    Ok(SshHostKeyState::compute_fingerprint(&public_key_pem))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_verify_matched() {
        let state = SshHostKeyState::new();
        let record = KnownHostRecord {
            host: "example.com".to_string(),
            port: 22,
            fingerprint: "abc123".to_string(),
            key_type: "ssh-ed25519".to_string(),
            added_at: chrono::Utc::now().to_rfc3339(),
            last_verified_at: None,
            trust_level: "trusted".to_string(),
        };
        state.add_known_host(record).unwrap();

        let result = state.verify_host_key("example.com", 22, "abc123", "ssh-ed25519");
        assert!(result.is_safe);
        assert_eq!(result.status, "matched");
    }

    #[test]
    fn test_verify_mismatch() {
        let state = SshHostKeyState::new();
        let record = KnownHostRecord {
            host: "example.com".to_string(),
            port: 22,
            fingerprint: "abc123".to_string(),
            key_type: "ssh-ed25519".to_string(),
            added_at: chrono::Utc::now().to_rfc3339(),
            last_verified_at: None,
            trust_level: "trusted".to_string(),
        };
        state.add_known_host(record).unwrap();

        let result = state.verify_host_key("example.com", 22, "xyz789", "ssh-ed25519");
        assert!(!result.is_safe);
        assert_eq!(result.status, "mismatch");
    }

    #[test]
    fn test_verify_unknown_strict_mode() {
        let state = SshHostKeyState::new();
        // Default is strict mode
        let result = state.verify_host_key("unknown-host.com", 22, "abc123", "ssh-ed25519");
        assert!(!result.is_safe);
        assert_eq!(result.status, "unknown");
    }

    #[test]
    fn test_verify_revoked_host() {
        let state = SshHostKeyState::new();
        let record = KnownHostRecord {
            host: "revoked.com".to_string(),
            port: 22,
            fingerprint: "abc123".to_string(),
            key_type: "ssh-ed25519".to_string(),
            added_at: chrono::Utc::now().to_rfc3339(),
            last_verified_at: None,
            trust_level: "revoked".to_string(),
        };
        state.add_known_host(record).unwrap();

        let result = state.verify_host_key("revoked.com", 22, "abc123", "ssh-ed25519");
        assert!(!result.is_safe);
        assert_eq!(result.status, "revoked");
    }

    #[test]
    fn test_compute_fingerprint() {
        let fp = SshHostKeyState::compute_fingerprint("dGVzdGtleWRhdGE=");
        assert!(!fp.is_empty());
        // SHA256 base64 fingerprint length
        assert!(fp.len() > 0);
    }

    #[test]
    fn test_list_and_remove() {
        let state = SshHostKeyState::new();
        let record = KnownHostRecord {
            host: "test.com".to_string(),
            port: 22,
            fingerprint: "fp123".to_string(),
            key_type: "ssh-rsa".to_string(),
            added_at: chrono::Utc::now().to_rfc3339(),
            last_verified_at: None,
            trust_level: "accepted".to_string(),
        };
        state.add_known_host(record).unwrap();
        assert_eq!(state.list_known_hosts().len(), 1);

        assert!(state.remove_known_host("test.com", 22));
        assert_eq!(state.list_known_hosts().len(), 0);
        assert!(!state.remove_known_host("test.com", 22)); // 再次移除返回 false
    }
}
