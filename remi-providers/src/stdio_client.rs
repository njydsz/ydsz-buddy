//! Provider CLI 的 Stdio JSON-RPC 客户端。
//!
//! 本模块为与本地 Provider CLI（OpenCode、Pi、Kilo、Cursor 的 `agent --stdio` 模式等）
//! 通信提供统一的、基于行的 JSON-RPC 客户端。所有这些工具都使用相同的模式：
//! 每行一个 JSON 请求输入，每行一个 JSON 响应（或通知）输出，通过 `id` 匹配请求。
//!
//! 本 crate 中的大多数 Provider 都有各自历史遗留的定制客户端实现；
//! [`StdioJsonRpcClient`] 的目标是为新适配器提供一个单一、经过充分测试的入口点。

use crate::errors::ProviderAdapterError;
use serde_json::Value;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, ChildStdout};
use tokio::sync::Mutex;
use tracing::{debug, warn};

/// Stdio JSON-RPC 客户端的共享状态。
struct Inner {
    stdin: Mutex<ChildStdin>,
    reader: Mutex<BufReader<ChildStdout>>,
    next_id: Mutex<u64>,
    child: Mutex<Child>,
}

/// 包装带管道 stdio 的子进程的 Stdio JSON-RPC 客户端。
#[derive(Clone)]
pub struct StdioJsonRpcClient {
    inner: Arc<Inner>,
}

impl StdioJsonRpcClient {
    /// 将已生成的子进程包装为 Stdio JSON-RPC 客户端。
    pub fn new(mut child: Child) -> Self {
        let stdin = child
            .stdin
            .take()
            .expect("子进程 stdin 必须为管道以用于 stdio JSON-RPC 客户端");
        let stdout = child
            .stdout
            .take()
            .expect("子进程 stdout 必须为管道以用于 stdio JSON-RPC 客户端");
        Self {
            inner: Arc::new(Inner {
                stdin: Mutex::new(stdin),
                reader: Mutex::new(BufReader::new(stdout)),
                next_id: Mutex::new(0),
                child: Mutex::new(child),
            }),
        }
    }

    /// 发送请求并读取匹配的响应。
    pub async fn request(&self, method: &str, params: Value) -> Result<Value, ProviderAdapterError> {
        let id = {
            let mut guard = self.inner.next_id.lock().await;
            *guard += 1;
            *guard
        };
        let payload = serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params,
        });
        let line = serde_json::to_string(&payload)
            .map_err(|e| ProviderAdapterError::Internal(format!("序列化：{e}")))?;

        {
            let mut stdin = self.inner.stdin.lock().await;
            stdin
                .write_all(line.as_bytes())
                .await
                .map_err(|e| ProviderAdapterError::Transport(format!("stdin 写入：{e}")))?;
            stdin
                .write_all(b"\n")
                .await
                .map_err(|e| ProviderAdapterError::Transport(format!("stdin 换行：{e}")))?;
            stdin
                .flush()
                .await
                .map_err(|e| ProviderAdapterError::Transport(format!("stdin 刷新：{e}")))?;
        }

        let mut reader = self.inner.reader.lock().await;
        loop {
            let mut buf = String::new();
            let n = reader
                .read_line(&mut buf)
                .await
                .map_err(|e| ProviderAdapterError::Transport(format!("读取行：{e}")))?;
            if n == 0 {
                return Err(ProviderAdapterError::Internal(
                    "stdio JSON-RPC 子进程在响应前关闭".to_string(),
                ));
            }
            let trimmed = buf.trim();
            if trimmed.is_empty() {
                continue;
            }
            let parsed: Value = match serde_json::from_str(trimmed) {
                Ok(v) => v,
                Err(e) => {
                    warn!(error = %e, "接收到非 JSON 行；忽略");
                    continue;
                }
            };
            if parsed.get("id").is_none() {
                debug!(payload = %trimmed, "通知");
                continue;
            }
            if let Some(resp_id) = parsed.get("id").and_then(|v| v.as_u64()) {
                if resp_id == id {
                    if let Some(err) = parsed.get("error") {
                        return Err(ProviderAdapterError::Internal(format!(
                            "JSON-RPC 错误：{}",
                            err
                        )));
                    }
                    return Ok(parsed.get("result").cloned().unwrap_or(Value::Null));
                }
                warn!(id = resp_id, "接收到乱序响应");
                continue;
            }
        }
    }

    /// 发送请求并返回原始响应，但如果子进程未实现该方法，
    /// 则通过返回 `Ok(None)` 来容忍。
    pub async fn try_request(
        &self,
        method: &str,
        params: Value,
    ) -> Result<Option<Value>, ProviderAdapterError> {
        match self.request(method, params).await {
            Ok(v) => Ok(Some(v)),
            Err(ProviderAdapterError::Internal(msg)) if msg.contains("JSON-RPC error") => {
                Ok(None)
            }
            Err(e) => Err(e),
        }
    }

    /// 终止子进程。尽力而为：忽略错误。
    pub async fn shutdown(&self) {
        if let Ok(mut child) = self.inner.child.lock().await {
            let _ = child.start_kill();
        }
    }

    /// 借用内部子进程句柄的克隆。当前未使用，
    /// 但为未来需要直接 `Child` 访问的适配器暴露。
    #[allow(dead_code)]
    pub fn inner(&self) -> Arc<Inner> {
        self.inner.clone()
    }
}
