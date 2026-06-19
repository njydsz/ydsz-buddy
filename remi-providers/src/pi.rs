//! Pi Provider 适配器。
//!
//! Pi 是本地 CLI agent。本适配器发现 `pi` 可执行文件
//! 并通过 stdio JSON-RPC 通信。

use crate::errors::ProviderAdapterError;
use crate::traits::ProviderAdapter;
use dashmap::DashMap;
use futures::{Stream, StreamExt};
use remi_contracts::{
    ModelId, ProviderHealth, ProviderHealthStatus, ProviderInfo, ProviderName,
};
use remi_core::Result;
use serde_json::Value;
use std::pin::Pin;
use std::sync::Arc;
use tokio::process::{Child, Command};
use tokio::sync::Mutex;
use tracing::{debug, info};
use uuid::Uuid;

/// Pi 会话状态。
#[allow(dead_code)]
struct PiSession {
    id: String,
    model: String,
    child: Arc<Mutex<Child>>,
    request_id: Arc<Mutex<u64>>,
}

/// Pi Provider 适配器。
pub struct PiAdapter {
    executable: Option<String>,
    sessions: Arc<DashMap<String, PiSession>>,
}

impl PiAdapter {
    /// 创建新的 Pi 适配器，探测 `pi` 可执行文件。
    pub fn new() -> Self {
        let executable = find_pi_executable();
        Self {
            executable,
            sessions: Arc::new(DashMap::new()),
        }
    }

    /// 若 Pi 可执行文件可用则返回 true。
    fn is_configured(&self) -> bool {
        self.executable.is_some()
    }
}

impl Default for PiAdapter {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait::async_trait]
impl ProviderAdapter for PiAdapter {
    fn info(&self) -> ProviderInfo {
        ProviderInfo {
            name: ProviderName::Pi,
            display_name: "Pi".to_string(),
            models: vec![ModelId::new("pi-default")],
            available: self.is_configured(),
        }
    }

    async fn health(&self) -> Result<ProviderHealth> {
        if !self.is_configured() {
            return Ok(ProviderHealth {
                provider: ProviderName::Pi,
                status: ProviderHealthStatus::Unhealthy,
                last_checked: chrono::Utc::now().to_rfc3339(),
                error: Some("pi 可执行文件未在 PATH 中找到".to_string()),
            });
        }

        Ok(ProviderHealth {
            provider: ProviderName::Pi,
            status: ProviderHealthStatus::Healthy,
            last_checked: chrono::Utc::now().to_rfc3339(),
            error: None,
        })
    }

    async fn start_session(&self, model: &ModelId) -> Result<String> {
        if !self.is_configured() {
            return Err(ProviderAdapterError::NotConfigured(ProviderName::Pi).into());
        }

        let session_id = Uuid::new_v4().to_string();
        
        // 启动 pi CLI 进程
        let executable = self.executable.as_ref().unwrap();
        let child = Command::new(executable)
            .args(&["--stdio"])
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| ProviderAdapterError::Transport(format!("启动 pi 失败：{e}")))?;

        let session = PiSession {
            id: session_id.clone(),
            model: model.0.clone(),
            child: Arc::new(Mutex::new(child)),
            request_id: Arc::new(Mutex::new(0)),
        };

        self.sessions.insert(session_id.clone(), session);
        info!(session_id = %session_id, model = %model, "已启动 Pi 会话");

        Ok(session_id)
    }

    async fn send_message(&self, session_id: &str, message: &str) -> Result<Value> {
        if !self.is_configured() {
            return Err(ProviderAdapterError::NotConfigured(ProviderName::Pi).into());
        }

        let session = self
            .sessions
            .get(session_id)
            .ok_or_else(|| ProviderAdapterError::SessionNotFound(session_id.to_string()))?;

        let mut child = session.child.lock().await;
        let mut request_id = session.request_id.lock().await;
        *request_id += 1;
        let id = *request_id;

        // 通过 stdin 发送 JSON-RPC 请求
        let request = serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": "agent/send",
            "params": {
                "message": message
            }
        });

        if let Some(mut stdin) = child.stdin.take() {
            use tokio::io::AsyncWriteExt;
            let request_str = serde_json::to_string(&request)?;
            stdin
                .write_all(request_str.as_bytes())
                .await
                .map_err(|e| ProviderAdapterError::Transport(format!("写入 stdin 失败：{e}")))?;
            stdin
                .write_all(b"\n")
                .await
                .map_err(|e| ProviderAdapterError::Transport(format!("写入换行符失败：{e}")))?;
            child.stdin.replace(stdin);
        }

        // 从 stdout 读取响应
        if let Some(stdout) = child.stdout.take() {
            use tokio::io::AsyncBufReadExt;
            let mut reader = tokio::io::BufReader::new(stdout);
            let mut line = String::new();
            reader
                .read_line(&mut line)
                .await
                .map_err(|e| ProviderAdapterError::Transport(format!("读取响应失败：{e}")))?;
            child.stdout.replace(reader.into_inner());

            if line.trim().is_empty() {
                return Err(ProviderAdapterError::Internal("Pi 返回空响应".to_string()).into());
            }

            let response: Value = serde_json::from_str(line.trim())?;
            debug!(session_id = %session_id, "已接收 Pi 响应");
            return Ok(response);
        }

        Err(ProviderAdapterError::Internal("无可用的 stdout 流".to_string()).into())
    }

    async fn stream_response(
        &self,
        session_id: &str,
        message: &str,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<String>> + Send>>> {
        if !self.is_configured() {
            return Err(ProviderAdapterError::NotConfigured(ProviderName::Pi).into());
        }

        let session = self
            .sessions
            .get(session_id)
            .ok_or_else(|| ProviderAdapterError::SessionNotFound(session_id.to_string()))?;

        let mut child = session.child.lock().await;
        let mut request_id = session.request_id.lock().await;
        *request_id += 1;
        let id = *request_id;

        // 发送流式请求
        let request = serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": "agent/stream",
            "params": {
                "message": message
            }
        });

        if let Some(mut stdin) = child.stdin.take() {
            use tokio::io::AsyncWriteExt;
            let request_str = serde_json::to_string(&request)?;
            stdin
                .write_all(request_str.as_bytes())
                .await
                .map_err(|e| ProviderAdapterError::Transport(format!("写入 stdin 失败：{e}")))?;
            stdin
                .write_all(b"\n")
                .await
                .map_err(|e| ProviderAdapterError::Transport(format!("写入换行符失败：{e}")))?;
            child.stdin.replace(stdin);
        }

        // 从 stdout 创建流
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| ProviderAdapterError::Internal("无可用的 stdout 流".to_string()))?;

        let stream = tokio_util::io::ReaderStream::new(stdout)
            .map(|result| {
                result
                    .map(|bytes| String::from_utf8_lossy(&bytes).to_string())
                    .map_err(|e| ProviderAdapterError::Transport(format!("流错误：{e}")).into())
            });

        Ok(Box::pin(stream))
    }

    async fn close_session(&self, session_id: &str) -> Result<()> {
        self.sessions.remove(session_id);
        info!(session_id = %session_id, "已关闭 Pi 会话");
        Ok(())
    }
}

/// 在 PATH 中搜索 `pi` 可执行文件。
fn find_pi_executable() -> Option<String> {
    let candidates = ["pi", "pi.exe"];
    let path_var = std::env::var_os("PATH")?;

    for candidate in &candidates {
        for dir in std::env::split_paths(&path_var) {
            let full_path = dir.join(candidate);
            if full_path.is_file() {
                return Some(full_path.to_string_lossy().to_string());
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_pi_session_lifecycle() {
        let adapter = PiAdapter::new();
        let model = ModelId::new("pi-default");

        let result = adapter.start_session(&model).await;
        if adapter.is_configured() {
            let session_id = result.unwrap();
            adapter.close_session(&session_id).await.unwrap();
        } else {
            assert!(result.is_err());
        }
    }
}
