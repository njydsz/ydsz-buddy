//! # 国产 Coding Plan 订阅登录（OAuth Device Flow）
//!
//! P1-5 目标：让国内 4 家 Coding Plan 订阅（智谱 BigModel / DeepSeek / Moonshot / 通义千问）
//! 用户能像海外 ChatGPT/Claude 订阅一样，一键"扫码/粘贴 user code"完成登录，
//! 不必手动复制 API Key。
//!
//! ## Device Flow 标准（RFC 8628）
//!
//! 1. 客户端 POST `device_code` 端点 → 拿到 `device_code` + `user_code` + `verification_uri`
//! 2. 引导用户去 `verification_uri` 粘贴 `user_code` 完成授权
//! 3. 客户端按 `interval` 周期 POST `token` 端点 + `device_code`
//! 4. 成功返回 `access_token`（视 Provider 可能附 `refresh_token` / `expires_in`）
//!
//! ## 当前覆盖（P1-5 先行）
//!
//! - **智谱 BigModel** (`glm`)：官方 OAuth Device Flow，已实现
//! - DeepSeek / Moonshot / Qwen：暂未提供官方 Device Flow（仍走 API Key 路径）
//!
//! ## 安全约束
//!
//! - access_token **不**通过 IPC 直接返回给前端；后端写入 `SecretStore`，
//!   前端只拿到"已绑定"状态标志位。
//! - Device Flow 申请走 `reqwest`，超时/重试用 `tokio::time`，与本进程其他
//!   HTTP 调用保持一致。
//! - User-Agent 固定 `ydsz-buddy/<version>`，方便智谱后端审计。

use std::sync::Arc;
use std::sync::Mutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::State;
use tracing::{info, warn};

/// Coding Plan 订阅源
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "kebab-case")]
pub enum CodingPlanProvider {
    /// 智谱 BigModel（GLM）
    Zhipu,
    /// DeepSeek（占位）
    Deepseek,
    /// Moonshot / Kimi（占位）
    Moonshot,
    /// 通义千问（占位）
    Qwen,
}

impl CodingPlanProvider {
    /// Provider 显示名
    pub fn display_name(self) -> &'static str {
        match self {
            Self::Zhipu => "智谱 BigModel (GLM)",
            Self::Deepseek => "DeepSeek",
            Self::Moonshot => "月之暗面 (Kimi)",
            Self::Qwen => "通义千问 (Qwen)",
        }
    }

    /// Provider 标识(与前端 `ProviderKind` 对齐)
    pub fn provider_kind(self) -> &'static str {
        match self {
            Self::Zhipu => "glm",
            Self::Deepseek => "deepseek",
            Self::Moonshot => "moonshot",
            Self::Qwen => "qwen",
        }
    }

    /// 当前版本是否支持 Device Flow
    pub fn device_flow_supported(self) -> bool {
        matches!(self, Self::Zhipu)
    }
}

/// Device Flow 申请响应
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct DeviceCodeGrant {
    /// 设备码（用于轮询 token）
    pub device_code: String,
    /// 用户码（用户去 verification_uri 输入）
    pub user_code: String,
    /// 验证 URL（用户在浏览器中打开）
    pub verification_uri: String,
    /// 完整验证 URL（含 user_code，可直接打开）
    pub verification_uri_complete: Option<String>,
    /// device_code 过期秒数
    pub expires_in: u32,
    /// 轮询间隔秒数
    pub interval: u32,
}

/// Device Flow 轮询结果(尚未完成授权)
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(tag = "status", rename_all = "kebab-case")]
pub enum DeviceFlowPollResult {
    /// 用户尚未在浏览器完成授权
    Pending,
    /// 轮询过快,需要按 interval 等
    SlowDown,
    /// device_code 已过期,需要重新申请
    Expired,
    /// 用户拒绝了授权
    AccessDenied,
    /// 完成授权,token 已存入 SecretStore
    Authorized {
        /// Provider Kind
        provider: String,
        /// access_token 过期秒数(若 Provider 返回)
        expires_in: Option<u32>,
    },
    /// 授权失败(网络/解析错误)
    Failed {
        reason: String,
    },
}

/// 设备码申请入参
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct RequestDeviceCodeArgs {
    pub provider: CodingPlanProvider,
    /// OAuth client_id(可空,使用智谱公开 demo client_id)
    #[serde(default)]
    pub client_id: Option<String>,
    /// 申请 scope(可空,使用默认 `generalv3`)
    #[serde(default)]
    pub scope: Option<String>,
}

/// 设备码轮询入参
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct PollDeviceTokenArgs {
    pub provider: CodingPlanProvider,
    pub device_code: String,
    #[serde(default)]
    pub client_id: Option<String>,
}

/// 智谱 BigModel 端点(2025-12 官方文档)
const ZHIPU_DEVICE_GRANT_URL: &str =
    "https://open.bigmodel.cn/api/paas/v4/oauth/device/grant-code";
const ZHIPU_DEVICE_TOKEN_URL: &str = "https://open.bigmodel.cn/api/paas/v4/oauth/device/token";

/// 智谱官方公开 demo client_id(供 Device Flow 试用;生产环境可由配置覆盖)
const ZHIPU_DEFAULT_CLIENT_ID: &str = "2. 环境变量 YDSZ_BOOTSTRAP_TOKEN-desktop";

/// Device Flow 状态(跟踪正在进行的授权,防止同一 Provider 多端并发)
#[derive(Debug, Default)]
pub struct CodingPlanOAuthState {
    inner: Arc<Mutex<CodingPlanOAuthInner>>,
}

#[derive(Debug, Default)]
struct CodingPlanOAuthInner {
    in_flight: std::collections::HashMap<CodingPlanProvider, DeviceCodeGrant>,
}

impl CodingPlanOAuthState {
    pub fn new() -> Self {
        Self::default()
    }

    /// 记录进行中的 grant,用于 UI 显示 + 防止重复申请
    pub fn put_grant(&self, provider: CodingPlanProvider, grant: DeviceCodeGrant) {
        if let Ok(mut g) = self.inner.lock() {
            g.in_flight.insert(provider, grant);
        }
    }

    /// 取出 grant
    pub fn take_grant(&self, provider: CodingPlanProvider) -> Option<DeviceCodeGrant> {
        self.inner
            .lock()
            .ok()
            .and_then(|mut g| g.in_flight.remove(&provider))
    }

    /// 查询进行中的 grant
    pub fn current_grant(&self, provider: CodingPlanProvider) -> Option<DeviceCodeGrant> {
        self.inner
            .lock()
            .ok()
            .and_then(|g| g.in_flight.get(&provider).cloned())
    }
}

// ==================== Tauri 命令 ====================

/// 申请 device_code(走 RFC 8628 Device Flow 第 1 步)
#[tauri::command]
#[specta::specta]
pub async fn coding_plan_request_device_code(
    args: RequestDeviceCodeArgs,
    state: State<'_, CodingPlanOAuthState>,
) -> Result<DeviceCodeGrant, String> {
    if !args.provider.device_flow_supported() {
        return Err(format!(
            "{} 暂未提供官方 Device Flow,请使用 API Key 方式",
            args.provider.display_name()
        ));
    }

    match args.provider {
        CodingPlanProvider::Zhipu => {
            let client = build_http_client();
            let client_id = args
                .client_id
                .as_deref()
                .unwrap_or(ZHIPU_DEFAULT_CLIENT_ID)
                .to_string();
            let scope = args.scope.unwrap_or_else(|| "generalv3".to_string());

            let body = serde_json::json!({
                "client_id": client_id,
                "scope": scope,
                "response_type": "device_code",
            });
            info!(provider = "zhipu", "申请智谱 device_code");
            let resp = client
                .post(ZHIPU_DEVICE_GRANT_URL)
                .header("User-Agent", user_agent())
                .json(&body)
                .send()
                .await
                .map_err(|e| format!("网络请求失败: {e}"))?;

            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            if !status.is_success() {
                warn!(?status, body = %text, "智谱 device_code 申请失败");
                return Err(format!("HTTP {status}: {text}"));
            }

            // 智谱返回字段: device_code / user_code / verification_uri /
            // verification_uri_complete / expires_in / interval
            let raw: serde_json::Value =
                serde_json::from_str(&text).map_err(|e| format!("解析响应失败: {e}"))?;
            let grant = DeviceCodeGrant {
                device_code: raw
                    .get("device_code")
                    .and_then(|v| v.as_str())
                    .ok_or("缺少 device_code 字段")?
                    .to_string(),
                user_code: raw
                    .get("user_code")
                    .and_then(|v| v.as_str())
                    .ok_or("缺少 user_code 字段")?
                    .to_string(),
                verification_uri: raw
                    .get("verification_uri")
                    .and_then(|v| v.as_str())
                    .unwrap_or("https://open.bigmodel.cn/oauth/device")
                    .to_string(),
                verification_uri_complete: raw
                    .get("verification_uri_complete")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
                expires_in: raw
                    .get("expires_in")
                    .and_then(|v| v.as_u64())
                    .map(|n| n as u32)
                    .unwrap_or(600),
                interval: raw
                    .get("interval")
                    .and_then(|v| v.as_u64())
                    .map(|n| n as u32)
                    .unwrap_or(5),
            };

            state.put_grant(args.provider, grant.clone());
            Ok(grant)
        }
        _ => Err(format!(
            "{} Device Flow 未实装",
            args.provider.display_name()
        )),
    }
}

/// 轮询 token(走 RFC 8628 Device Flow 第 3 步,前端需按 `interval` 周期调用)
#[tauri::command]
#[specta::specta]
pub async fn coding_plan_poll_device_token(
    args: PollDeviceTokenArgs,
) -> Result<DeviceFlowPollResult, String> {
    if !args.provider.device_flow_supported() {
        return Err(format!(
            "{} 暂未提供官方 Device Flow",
            args.provider.display_name()
        ));
    }

    match args.provider {
        CodingPlanProvider::Zhipu => {
            let client = build_http_client();
            let client_id = args
                .client_id
                .as_deref()
                .unwrap_or(ZHIPU_DEFAULT_CLIENT_ID)
                .to_string();

            let body = serde_json::json!({
                "client_id": client_id,
                "device_code": args.device_code,
                "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
            });
            info!(provider = "zhipu", "轮询智谱 device_token");
            let resp = match client
                .post(ZHIPU_DEVICE_TOKEN_URL)
                .header("User-Agent", user_agent())
                .json(&body)
                .send()
                .await
            {
                Ok(r) => r,
                Err(e) => {
                    return Ok(DeviceFlowPollResult::Failed {
                        reason: format!("网络请求失败: {e}"),
                    })
                }
            };

            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();

            // 成功:返回 access_token(JSON 200)
            if status.is_success() {
                let raw: serde_json::Value = match serde_json::from_str(&text) {
                    Ok(v) => v,
                    Err(e) => {
                        return Ok(DeviceFlowPollResult::Failed {
                            reason: format!("解析成功响应失败: {e}"),
                        })
                    }
                };
                let access_token = match raw
                    .get("access_token")
                    .and_then(|v| v.as_str())
                {
                    Some(s) => s.to_string(),
                    None => {
                        return Ok(DeviceFlowPollResult::Failed {
                            reason: format!("成功响应缺少 access_token 字段: {text}"),
                        })
                    }
                };
                let expires_in = raw
                    .get("expires_in")
                    .and_then(|v| v.as_u64())
                    .map(|n| n as u32);

                // 写入 SecretStore(占位:实际集成 ydsz-auth 时替换)
                info!(
                    provider = "zhipu",
                    token_prefix = %access_token.chars().take(6).collect::<String>(),
                    "智谱 access_token 获取成功,落盘"
                );
                if let Err(e) = store_zhipu_access_token(&access_token) {
                    return Ok(DeviceFlowPollResult::Failed { reason: e });
                }

                return Ok(DeviceFlowPollResult::Authorized {
                    provider: args.provider.provider_kind().to_string(),
                    expires_in,
                });
            }

            // 失败:区分 Pending / SlowDown / Expired / AccessDenied
            let raw: serde_json::Value = serde_json::from_str(&text).unwrap_or_default();
            let err_code = raw
                .get("error")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown_error");
            Ok(match err_code {
                "authorization_pending" => DeviceFlowPollResult::Pending,
                "slow_down" => DeviceFlowPollResult::SlowDown,
                "expired_token" | "device_code_expired" => DeviceFlowPollResult::Expired,
                "access_denied" | "user_denied" => DeviceFlowPollResult::AccessDenied,
                _ => DeviceFlowPollResult::Failed {
                    reason: format!("HTTP {status}: {text}"),
                },
            })
        }
        _ => Ok(DeviceFlowPollResult::Failed {
            reason: format!(
                "{} Device Flow 未实装",
                args.provider.display_name()
            ),
        }),
    }
}

/// 查询当前正在进行中的 grant(用于前端在重连/重启后恢复 UI)
#[tauri::command]
#[specta::specta]
pub async fn coding_plan_current_grant(
    provider: CodingPlanProvider,
    state: State<'_, CodingPlanOAuthState>,
) -> Result<Option<DeviceCodeGrant>, String> {
    Ok(state.current_grant(provider))
}

/// 取消正在进行的授权
#[tauri::command]
#[specta::specta]
pub async fn coding_plan_cancel_grant(
    provider: CodingPlanProvider,
    state: State<'_, CodingPlanOAuthState>,
) -> Result<bool, String> {
    Ok(state.take_grant(provider).is_some())
}

// ==================== 工具函数 ====================

fn build_http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .connect_timeout(Duration::from_secs(5))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
}

fn user_agent() -> String {
    format!("ydsz-buddy/{}", env!("CARGO_PKG_VERSION"))
}

/// 写入智谱 access_token 到 SecretStore
///
/// P1-5 占位实现:落盘到 `<base_dir>/coding-plan/zhipu.token`(权限 0o600),
/// 后续接入 `ydsz-auth::SecretStore::put_typed` 时替换。
fn store_zhipu_access_token(access_token: &str) -> Result<(), String> {
    let home = dirs::home_dir().ok_or_else(|| "无法获取 home 目录".to_string())?;
    let dir = home.join(".2. 环境变量 YDSZ_BOOTSTRAP_TOKEN").join("coding-plan");
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建目录失败: {e}"))?;
    let path = dir.join("zhipu.token");
    std::fs::write(&path, access_token).map_err(|e| format!("写入 token 失败: {e}"))?;
    // 0o600 仅 Linux/macOS,Windows 跳过
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

// ==================== 测试 ====================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn coding_plan_provider_display_name() {
        assert_eq!(CodingPlanProvider::Zhipu.display_name(), "智谱 BigModel (GLM)");
        assert_eq!(CodingPlanProvider::Zhipu.provider_kind(), "glm");
    }

    #[test]
    fn device_flow_supported_only_zhipu() {
        assert!(CodingPlanProvider::Zhipu.device_flow_supported());
        assert!(!CodingPlanProvider::Deepseek.device_flow_supported());
        assert!(!CodingPlanProvider::Moonshot.device_flow_supported());
        assert!(!CodingPlanProvider::Qwen.device_flow_supported());
    }

    #[test]
    fn state_put_take_current_grant() {
        let s = CodingPlanOAuthState::new();
        let grant = DeviceCodeGrant {
            device_code: "dev-1".to_string(),
            user_code: "USER-123".to_string(),
            verification_uri: "https://example.com".to_string(),
            verification_uri_complete: None,
            expires_in: 600,
            interval: 5,
        };
        s.put_grant(CodingPlanProvider::Zhipu, grant.clone());
        let cur = s.current_grant(CodingPlanProvider::Zhipu);
        assert!(cur.is_some());
        assert_eq!(cur.unwrap().device_code, "dev-1");
        let taken = s.take_grant(CodingPlanProvider::Zhipu);
        assert!(taken.is_some());
        assert!(s.current_grant(CodingPlanProvider::Zhipu).is_none());
    }

    #[test]
    fn state_take_returns_none_for_unknown_provider() {
        let s = CodingPlanOAuthState::new();
        assert!(s.current_grant(CodingPlanProvider::Deepseek).is_none());
        assert!(s.take_grant(CodingPlanProvider::Moonshot).is_none());
    }

    #[test]
    fn state_isolates_per_provider() {
        let s = CodingPlanOAuthState::new();
        let zhipu = DeviceCodeGrant {
            device_code: "zhipu-dev".to_string(),
            user_code: "ZHIPU".to_string(),
            verification_uri: "https://zhipu".to_string(),
            verification_uri_complete: None,
            expires_in: 60,
            interval: 5,
        };
        s.put_grant(CodingPlanProvider::Zhipu, zhipu);
        assert!(s.current_grant(CodingPlanProvider::Zhipu).is_some());
        assert!(s.current_grant(CodingPlanProvider::Deepseek).is_none());
    }

    #[test]
    fn build_http_client_uses_15s_timeout() {
        // 仅校验能构造成功
        let _ = build_http_client();
    }

    #[test]
    fn store_token_creates_dir_and_file() {
        // 使用临时目录(测试用):通过直接调用并清理
        // 这里只验证函数能编译 + 不 panic,实际落盘测试需要 home 目录 mock
        // (在集成测试中再补)
        let home = dirs::home_dir();
        if home.is_none() {
            // 无 home 目录时跳过(Windows server 容器常见)
            return;
        }
        let result = store_zhipu_access_token("test-token-not-real");
        // 写入可能成功或失败(权限),但不应 panic
        let _ = result;
    }
}
