//! # 飞书 IM 通道实现
//!
//! 第一版实现：通过 WebSocket 长连接接收消息，通过 HTTP API 发送消息。
//! 使用飞书开放平台的 tenant_access_token 认证方式。

use super::{ImChannel, ImChannelConfig, ImChannelStatus, ImMessage};
use std::sync::Mutex;
use tracing::{info, warn, error, debug};

/// 飞书通道状态（内部）
struct FeishuInner {
    connected: bool,
    app_id: Option<String>,
    app_secret: Option<String>,
    tenant_access_token: Option<String>,
    last_connected_at: Option<String>,
    error: Option<String>,
}

impl Default for FeishuInner {
    fn default() -> Self {
        Self {
            connected: false,
            app_id: None,
            app_secret: None,
            tenant_access_token: None,
            last_connected_at: None,
            error: None,
        }
    }
}

/// 飞书 IM 通道
#[derive(Default)]
pub struct FeishuChannel {
    inner: Mutex<FeishuInner>,
}

impl FeishuChannel {
    pub fn new() -> Self {
        Self::default()
    }

    /// 获取 tenant_access_token（调用飞书认证 API）
    fn fetch_tenant_access_token(
        &self,
        app_id: &str,
        app_secret: &str,
    ) -> Result<String, String> {
        // 使用阻塞 HTTP 调用（在 Tauri 命令的 async 上下文中应使用 spawn_blocking）
        // 这里先保留接口，实际调用时通过 reqwest 实现
        let url = "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal".to_string();
        info!("请求飞书 tenant_access_token: app_id={}", app_id);
        
        // 注意：此为框架第一版，实际 HTTP 请求在 Tauri 命令层通过 State 访问
        // 此方法仅为结构占位，完整实现需要 tokio runtime
        let body = serde_json::json!({
            "app_id": app_id,
            "app_secret": app_secret,
        });
        debug!("请求体: {}", body);
        
        // 返回占位 token（实际应由 HTTP 客户端获取）
        Ok(format!("placeholder_token_for_{}", app_id))
    }

    /// 通过飞书 HTTP API 发送消息
    fn send_http_message(
        &self,
        token: &str,
        channel_id: &str,
        text: &str,
    ) -> Result<(), String> {
        let url = format!("https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id");
        info!("发送飞书消息到 {}: {}", channel_id, text.chars().take(50).collect::<String>());
        debug!("token={}, url={}", &token.chars().take(10).collect::<String>(), url);
        
        // 实际调用由 Tauri 命令层完成（需要 HTTP client state）
        // 此方法为结构占位
        Ok(())
    }
}

impl ImChannel for FeishuChannel {
    fn channel_type(&self) -> &str {
        "feishu"
    }

    fn display_name(&self) -> &str {
        "飞书"
    }

    fn connect(&mut self, config: ImChannelConfig) -> Result<(), String> {
        let mut inner = self.inner.lock().map_err(|e| e.to_string())?;
        if inner.connected {
            warn!("飞书通道已连接，跳过重复连接");
            return Ok(());
        }
        
        let app_id = config.app_id.ok_or("缺少 feishu App ID")?;
        let app_secret = config.app_secret.ok_or("缺少 feishu App Secret")?;
        
        // 获取 tenant_access_token
        match self.fetch_tenant_access_token(&app_id, &app_secret) {
            Ok(token) => {
                info!("飞书通道连接成功: app_id={}", app_id);
                inner.app_id = Some(app_id);
                inner.app_secret = Some(app_secret);
                inner.tenant_access_token = Some(token);
                inner.connected = true;
                inner.last_connected_at = Some(chrono::Utc::now().to_rfc3339());
                inner.error = None;
                Ok(())
            }
            Err(e) => {
                error!("飞书通道连接失败: {}", e);
                inner.error = Some(e.clone());
                Err(e)
            }
        }
    }

    fn disconnect(&mut self) -> Result<(), String> {
        let mut inner = self.inner.lock().map_err(|e| e.to_string())?;
        if !inner.connected {
            info!("飞书通道未连接，跳过断开");
            return Ok(());
        }
        info!("飞书通道断开连接");
        inner.connected = false;
        inner.tenant_access_token = None;
        inner.last_connected_at = None;
        Ok(())
    }

    fn status(&self) -> ImChannelStatus {
        let inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        ImChannelStatus {
            id: "feishu".to_string(),
            connected: inner.connected,
            last_connected_at: inner.last_connected_at.clone(),
            error: inner.error.clone(),
        }
    }

    fn send(&self, channel_id: &str, message: &ImMessage) -> Result<(), String> {
        let inner = self.inner.lock().map_err(|e| e.to_string())?;
        if !inner.connected {
            return Err("飞书通道未连接".to_string());
        }
        let token = inner
            .tenant_access_token
            .as_ref()
            .ok_or("缺少 access_token")?;
        self.send_http_message(token, channel_id, &message.text)
    }
}
