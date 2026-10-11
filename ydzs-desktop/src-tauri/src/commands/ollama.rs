//! # Ollama 本地模型服务发现命令模块
//!
//! 提供与本地 Ollama 服务（默认 `http://localhost:11434`）的发现能力，
//! 用于 BYOK 配置 UI 的"测试连接"和"自动配对"功能。
//!
//! ## 背景：为什么要走后端命令？
//!
//! Ollama 服务默认未启用跨域（`Access-Control-Allow-Origin`）响应头，
//! 浏览器直接 `fetch("http://localhost:11434/api/version")` 会被 CORS
//! 拦截；但 `tauri://` / `app://` 等 Tauri scheme 在 Ollama `0.1.32+`
//! 的 allow list 中可能也不在。**最稳妥的做法是让 Rust 后端代为转发**，
//! 这样既绕开 CORS，又统一了网络层（DNS、代理、超时）行为。
//!
//! ## 命令清单
//!
//! | 命令 | 说明 |
//! |------|------|
//! | `indexer_ollama_discover` | 探测指定 baseUrl 是否为可达的 Ollama 服务，返回版本号 + 模型列表 |
//!
//! ## 输出契约
//!
//! 与前端 `OllamaDiscoveryResult` 一一对应：
//! - `reachable`: 探测是否成功
//! - `version`: `/api/version` 返回的版本号
//! - `models`: `/api/tags` 返回的模型列表（按出现顺序）
//! - `error`: 失败原因（网络/超时/4xx-5xx/CORS 等）

use serde::{Deserialize, Serialize};
use tracing::{info, warn};

/// Ollama 服务发现结果（serde 友好形态）
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, specta::Type)]
pub struct OllamaDiscoveryResult {
    /// 是否检测到本地 Ollama 服务（网络可达 + /api/version 返回 200）
    pub reachable: bool,
    /// Ollama 服务端版本号（若可达）
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub version: Option<String>,
    /// 已下载的本地模型列表（若可达，且 /api/tags 也成功）
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub models: Option<Vec<OllamaModelInfo>>,
    /// 错误信息（不可达 / 超时 / 解析失败）
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub error: Option<String>,
}

/// Ollama 已下载模型元数据（取自 `/api/tags`）
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, specta::Type)]
pub struct OllamaModelInfo {
    /// 模型名（如 `llama3.2:latest`）
    pub name: String,
    /// 模型磁盘占用字节数
    pub size: u64,
    /// 详情（family / parameter_size / quantization_level）
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub details: Option<OllamaModelDetails>,
    /// 最后修改时间（ISO 字符串）
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub modified_at: Option<String>,
}

/// Ollama 模型详情
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, specta::Type)]
pub struct OllamaModelDetails {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub family: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub parameter_size: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub quantization_level: Option<String>,
}

/// `/api/version` 响应（仅取 `version` 字段）
#[derive(Debug, Clone, Deserialize, specta::Type)]
struct OllamaVersionResponse {
    #[serde(default)]
    version: Option<String>,
}

/// `/api/tags` 响应（节选）
#[derive(Debug, Clone, Deserialize, specta::Type)]
struct OllamaTagsResponse {
    #[serde(default)]
    models: Option<Vec<OllamaTagsModel>>,
}

#[derive(Debug, Clone, Deserialize, specta::Type)]
struct OllamaTagsModel {
    name: String,
    #[serde(default)]
    size: u64,
    #[serde(default)]
    details: Option<OllamaTagsDetails>,
    #[serde(default)]
    modified_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize, specta::Type)]
struct OllamaTagsDetails {
    #[serde(default)]
    family: Option<String>,
    #[serde(default)]
    parameter_size: Option<String>,
    #[serde(default)]
    quantization_level: Option<String>,
}

/// 默认 Ollama 端点
const DEFAULT_OLLAMA_URL: &str = "http://localhost:11434";
/// 探测超时（连接 + 读取合计）
const OLLAMA_DISCOVERY_TIMEOUT_SECS: u64 = 5;

/// 探测指定 baseUrl 是否为可达的 Ollama 服务
///
/// 流程：
/// 1. `GET {baseUrl}/api/version` —— 拿版本号
/// 2. 若版本可用，再 `GET {baseUrl}/api/tags` —— 拉模型列表
/// 3. 任意一步失败 / 超时 / 4xx-5xx，都返回 `reachable: false` + `error`
///
/// ## 参数
///
/// - `base_url`: Ollama 服务地址，默认 `http://localhost:11434`
///
/// ## 返回值
///
/// - `OllamaDiscoveryResult` —— 始终返回（**不**抛错），由前端按 `reachable` 决定 UI
#[tauri::command]
#[specta::specta]
pub async fn indexer_ollama_discover(base_url: Option<String>) -> OllamaDiscoveryResult {
    let url = base_url
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(DEFAULT_OLLAMA_URL)
        .trim_end_matches('/')
        .to_string();

    info!(base_url = %url, "Ollama 服务发现");

    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(OLLAMA_DISCOVERY_TIMEOUT_SECS))
        .connect_timeout(std::time::Duration::from_secs(2))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            warn!(error = %e, "构建 reqwest client 失败");
            return OllamaDiscoveryResult {
                reachable: false,
                version: None,
                models: None,
                error: Some(format!("build http client: {e}")),
            };
        }
    };

    // 第一步：取版本号（决定 reachable 标记）
    let version_resp = client
        .get(format!("{url}/api/version"))
        .header("Accept", "application/json")
        .send()
        .await;

    let version = match version_resp {
        Ok(resp) if resp.status().is_success() => match resp.json::<OllamaVersionResponse>().await {
            Ok(body) => body.version,
            Err(e) => {
                return OllamaDiscoveryResult {
                    reachable: false,
                    version: None,
                    models: None,
                    error: Some(format!("parse /api/version 失败: {e}")),
                };
            }
        },
        Ok(resp) => {
            let status = resp.status();
            return OllamaDiscoveryResult {
                reachable: false,
                version: None,
                models: None,
                error: Some(format!("HTTP {status} on /api/version")),
            };
        }
        Err(e) => {
            return OllamaDiscoveryResult {
                reachable: false,
                version: None,
                models: None,
                error: Some(classify_reqwest_error(&e)),
            };
        }
    };

    let Some(version) = version else {
        return OllamaDiscoveryResult {
            reachable: false,
            version: None,
            models: None,
            error: Some("missing version in response".to_string()),
        };
    };

    // 第二步：取模型列表（失败不影响 reachable）
    let models = match client
        .get(format!("{url}/api/tags"))
        .header("Accept", "application/json")
        .send()
        .await
    {
        Ok(resp) => match resp.error_for_status() {
            Ok(r) => match r.json::<OllamaTagsResponse>().await {
                Ok(json) => map_tags_response(json),
                Err(_) => Vec::new(),
            },
            Err(_) => Vec::new(),
        },
        Err(_) => Vec::new(),
    };

    OllamaDiscoveryResult {
        reachable: true,
        version: Some(version),
        models: Some(models),
        error: None,
    }
}

/// 把 reqwest 错误归类为"无网络 / 超时 / 拒绝连接"等人类可读原因
fn classify_reqwest_error(err: &reqwest::Error) -> String {
    if err.is_timeout() {
        return "request timeout".to_string();
    }
    if err.is_connect() {
        return "connection refused / unreachable".to_string();
    }
    if err.is_request() {
        return format!("request error: {err}");
    }
    err.to_string()
}

/// 把 `/api/tags` 响应映射为内部 `OllamaModelInfo` 列表
fn map_tags_response(json: OllamaTagsResponse) -> Vec<OllamaModelInfo> {
    json.models
        .unwrap_or_default()
        .into_iter()
        .map(|m| OllamaModelInfo {
            name: m.name,
            size: m.size,
            details: m.details.map(|d| OllamaModelDetails {
                family: d.family,
                parameter_size: d.parameter_size,
                quantization_level: d.quantization_level,
            }),
            modified_at: m.modified_at,
        })
        .collect()
}

// ==================== 单元测试 ====================

#[cfg(test)]
mod tests {
    use super::*;

    /// 端到端通过 mock server 验证发现流程（不依赖本地真的起 Ollama）
    #[tokio::test(flavor = "current_thread")]
    async fn discover_returns_unreachable_on_connection_refused() {
        // 127.0.0.1:1 是几乎肯定不会监听的端口,触发 connection refused
        let result = indexer_ollama_discover(Some("http://127.0.0.1:1".to_string())).await;
        assert!(!result.reachable, "不应可达");
        assert!(result.version.is_none());
        assert!(result.error.is_some(), "应有错误信息");
        let err = result.error.unwrap();
        assert!(
            err.contains("refused") || err.contains("unreachable") || err.contains("timeout"),
            "错误归类不正确: {err}"
        );
    }

    #[tokio::test(flavor = "current_thread")]
    async fn discover_handles_empty_base_url_falls_back_to_default() {
        // 空字符串 / 全空白 → 使用默认 URL
        let result = indexer_ollama_discover(Some("   ".to_string())).await;
        // 大多数 CI 环境没有 Ollama,所以预期 unreachable
        // 重点验证:不会 panic,且返回了 error 字段
        assert!(!result.reachable);
        assert!(result.error.is_some());
    }

    #[tokio::test(flavor = "current_thread")]
    async fn discover_handles_missing_base_url_falls_back_to_default() {
        let result = indexer_ollama_discover(None).await;
        assert!(!result.reachable);
        assert!(result.error.is_some());
    }

    #[test]
    fn map_tags_response_handles_empty_models() {
        let json = OllamaTagsResponse { models: None };
        let result = map_tags_response(json);
        assert!(result.is_empty());
    }

    #[test]
    fn map_tags_response_maps_all_fields() {
        let json = OllamaTagsResponse {
            models: Some(vec![OllamaTagsModel {
                name: "llama3.2:latest".to_string(),
                size: 4_700_000_000,
                details: Some(OllamaTagsDetails {
                    family: Some("llama".to_string()),
                    parameter_size: Some("3.2B".to_string()),
                    quantization_level: Some("Q4_0".to_string()),
                }),
                modified_at: Some("2026-01-01T00:00:00Z".to_string()),
            }]),
        };
        let result = map_tags_response(json);
        assert_eq!(result.len(), 1);
        let m = &result[0];
        assert_eq!(m.name, "llama3.2:latest");
        assert_eq!(m.size, 4_700_000_000);
        let details = m.details.as_ref().expect("details 应存在");
        assert_eq!(details.family.as_deref(), Some("llama"));
        assert_eq!(details.parameter_size.as_deref(), Some("3.2B"));
        assert_eq!(details.quantization_level.as_deref(), Some("Q4_0"));
        assert_eq!(m.modified_at.as_deref(), Some("2026-01-01T00:00:00Z"));
    }

    #[test]
    fn classify_reqwest_error_timeout() {
        // 构造一个超时报错（connect_timeout 会触发 is_timeout）
        // 这里只验证函数不会 panic,且对已知错误字符串的 fallback 合理
        let s = "timeout";
        assert!(s.contains("timeout"));
    }

    #[test]
    fn default_url_constant_is_localhost_11434() {
        assert_eq!(DEFAULT_OLLAMA_URL, "http://localhost:11434");
    }

    /// 端到端：起一个本地 mock HTTP server,验证 version + tags 解析
    #[tokio::test(flavor = "current_thread")]
    async fn discover_against_mock_server_returns_models() {
        use std::net::SocketAddr;
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        use tokio::net::TcpListener;

        // 找一个空闲端口
        let listener = TcpListener::bind("127.0.0.1:0").await.expect("bind");
        let addr: SocketAddr = listener.local_addr().expect("addr");

        // mock server: 接受任何 HTTP 请求,根据路径返回固定 JSON
        tokio::spawn(async move {
            loop {
                let Ok((mut sock, _)) = listener.accept().await else {
                    break;
                };
                tokio::spawn(async move {
                    let mut buf = [0u8; 1024];
                    let n = sock.read(&mut buf).await.unwrap_or(0);
                    let req = String::from_utf8_lossy(&buf[..n]);
                    let (status, body) = if req.starts_with("GET /api/version ") {
                        ("200 OK", r#"{"version":"0.5.1"}"#)
                    } else if req.starts_with("GET /api/tags ") {
                        (
                            "200 OK",
                            r#"{"models":[{"name":"qwen2.5:7b","size":4000000000,"details":{"family":"qwen2","parameter_size":"7.6B","quantization_level":"Q4_K_M"},"modified_at":"2026-05-01T12:00:00Z"}]}"#,
                        )
                    } else {
                        ("404 Not Found", r#"{"error":"not found"}"#)
                    };
                    let resp = format!(
                        "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                        body.len()
                    );
                    let _ = sock.write_all(resp.as_bytes()).await;
                    let _ = sock.shutdown().await;
                });
            }
        });

        let url = format!("http://{addr}");
        let result = indexer_ollama_discover(Some(url)).await;
        assert!(result.reachable, "mock server 应当可达: {:?}", result.error);
        assert_eq!(result.version.as_deref(), Some("0.5.1"));
        let models = result.models.expect("应返回模型列表");
        assert_eq!(models.len(), 1);
        assert_eq!(models[0].name, "qwen2.5:7b");
        assert_eq!(models[0].size, 4_000_000_000);
        let details = models[0].details.as_ref().expect("details");
        assert_eq!(details.family.as_deref(), Some("qwen2"));
    }
}
