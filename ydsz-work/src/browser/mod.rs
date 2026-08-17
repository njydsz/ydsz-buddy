//! 浏览器自动化工具模块
//!
//! 提供 Agent 驱动的浏览器操作能力，包括：
//! - JsBridge：Rust 与 Webview JavaScript 之间的双向通信桥
//! - BrowserAction：可序列化的浏览器操作枚举
//! - RecordingState：操作录制与回放状态管理

use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use tokio::sync::oneshot;

// ============================================================================
// 常量
// ============================================================================

/// 回放操作之间的默认延时（毫秒）
pub const DEFAULT_REPLAY_DELAY_MS: u64 = 1000;

// ============================================================================
// BrowserAction
// ============================================================================

/// 浏览器操作枚举
///
/// 所有 Agent 驱动的浏览器操作类型，可序列化后传递给 JavaScript 层执行。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum BrowserAction {
    /// 点击元素
    Click { selector: String },
    /// 填写输入框
    Fill { selector: String, value: String },
    /// 提取页面内容
    Extract {
        selector: Option<String>,
        max_length: Option<usize>,
    },
    /// 等待元素出现
    Wait {
        selector: String,
        timeout_ms: u64,
    },
    /// 滚动到指定位置或元素
    Scroll {
        selector: Option<String>,
        x: Option<i32>,
        y: Option<i32>,
    },
    /// 获取页面标题
    GetTitle,
    /// 获取当前 URL
    GetUrl,
    /// 模拟按键
    PressKey { key: String },
    /// 选择下拉选项
    SelectOption { selector: String, value: String },
    /// 获取元素属性
    GetAttribute { selector: String, attribute: String },
    /// 获取元素信息（可见性、位置、尺寸、标签名、文本）
    GetElementInfo { selector: String },
    /// 等待导航完成
    WaitForNavigation {
        timeout_ms: u64,
        expected_url: Option<String>,
    },
}

impl BrowserAction {
    /// 返回操作对应的工具名称（用于日志和遥测）
    pub fn tool_name(&self) -> &'static str {
        match self {
            BrowserAction::Click { .. } => "browser_click",
            BrowserAction::Fill { .. } => "browser_fill",
            BrowserAction::Extract { .. } => "browser_extract",
            BrowserAction::Wait { .. } => "browser_wait",
            BrowserAction::Scroll { .. } => "browser_scroll",
            BrowserAction::GetTitle => "browser_get_title",
            BrowserAction::GetUrl => "browser_get_url",
            BrowserAction::PressKey { .. } => "browser_press_key",
            BrowserAction::SelectOption { .. } => "browser_select_option",
            BrowserAction::GetAttribute { .. } => "browser_get_attribute",
            BrowserAction::GetElementInfo { .. } => "browser_get_element_info",
            BrowserAction::WaitForNavigation { .. } => "browser_wait_for_navigation",
        }
    }
}

// ============================================================================
// BrowserActionResult
// ============================================================================

/// 浏览器操作执行结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserActionResult {
    /// 是否成功
    pub success: bool,
    /// 返回数据（如提取的文本内容）
    pub data: Option<String>,
    /// 错误信息（失败时）
    pub error: Option<String>,
}

// ============================================================================
// URL 验证
// ============================================================================

/// 验证 URL 安全性
///
/// 检查 URL 是否为允许的 scheme（http/https/about），
/// 阻止 javascript:、data: 等危险协议。
pub fn validate_url(url: &str) -> Result<(), String> {
    if url.is_empty() || url == "about:blank" {
        return Ok(());
    }
    if url.starts_with("javascript:") || url.starts_with("data:") {
        return Err(format!("不安全的 URL scheme: {}", url));
    }
    // 允许 http/https 以及相对路径
    Ok(())
}

// ============================================================================
// JS 代码生成
// ============================================================================

/// 根据 BrowserAction 生成对应的 JavaScript 代码
///
/// 生成的代码会在 Webview 中执行，并通过 Tauri IPC 将结果回传给 JsBridge。
pub fn generate_js_for_action(request_id: &str, action: &BrowserAction) -> String {
    let escaped_id = request_id.replace('"', "\\\"");
    match action {
        BrowserAction::Click { selector } => {
            let sel = selector.replace('"', "\\\"");
            format!(
                r#"(function() {{
            try {{
                const el = document.querySelector("{sel}");
                if (!el) throw new Error("element not found: {sel}");
                el.click();
                __TAURI_INTERNALS__.invoke("browser_resolve_js", {{
                    input: {{ requestId: "{id}", result: {{ success: true, data: null, error: null }} }}
                }});
            }} catch(e) {{
                __TAURI_INTERNALS__.invoke("browser_resolve_js", {{
                    input: {{ requestId: "{id}", result: {{ success: false, data: null, error: e.message || String(e) }} }}
                }});
            }}
        }})();"#,
                sel = sel,
                id = escaped_id,
            )
        }
        BrowserAction::Fill { selector, value } => {
            let sel = selector.replace('"', "\\\"");
            let val = value.replace('"', "\\\"");
            format!(
                r#"(function() {{
            try {{
                const el = document.querySelector("{sel}");
                if (!el) throw new Error("element not found: {sel}");
                el.value = "{val}";
                el.dispatchEvent(new Event("input", {{ bubbles: true }}));
                el.dispatchEvent(new Event("change", {{ bubbles: true }}));
                __TAURI_INTERNALS__.invoke("browser_resolve_js", {{
                    input: {{ requestId: "{id}", result: {{ success: true, data: null, error: null }} }}
                }});
            }} catch(e) {{
                __TAURI_INTERNALS__.invoke("browser_resolve_js", {{
                    input: {{ requestId: "{id}", result: {{ success: false, data: null, error: e.message || String(e) }} }}
                }});
            }}
        }})();"#,
                sel = sel,
                val = val,
                id = escaped_id,
            )
        }
        BrowserAction::Extract { selector, max_length } => {
            let selector_js = match selector {
                Some(s) => format!("document.querySelector(\"{}\")", s.replace('"', "\\\"")),
                None => "document.body".to_string(),
            };
            let max_len_js = max_length.map(|m| m.to_string()).unwrap_or_else(|| "0".to_string());
            format!(
                r#"(function() {{
            try {{
                const el = {sel};
                if (!el) throw new Error("element not found");
                const text = el.innerText || el.textContent || "";
                const trimmed = text.trim().replace(/\s+/g, " ");
                const result = {max_len} > 0 ? trimmed.substring(0, {max_len}) : trimmed;
                __TAURI_INTERNALS__.invoke("browser_resolve_js", {{
                    input: {{ requestId: "{id}", result: {{ success: true, data: result, error: null }} }}
                }});
            }} catch(e) {{
                __TAURI_INTERNALS__.invoke("browser_resolve_js", {{
                    input: {{ requestId: "{id}", result: {{ success: false, data: null, error: e.message || String(e) }} }}
                }});
            }}
        }})();"#,
                sel = selector_js,
                max_len = max_len_js,
                id = escaped_id,
            )
        }
        BrowserAction::Wait { selector, timeout_ms } => {
            let sel = selector.replace('"', "\\\"");
            format!(
                r#"(function() {{
            const start = Date.now();
            const timeout = {timeout};
            const sel = "{sel}";
            function check() {{
                const el = document.querySelector(sel);
                if (el) {{
                    __TAURI_INTERNALS__.invoke("browser_resolve_js", {{
                        input: {{ requestId: "{id}", result: {{ success: true, data: null, error: null }} }}
                    }});
                    return;
                }}
                if (Date.now() - start > timeout) {{
                    __TAURI_INTERNALS__.invoke("browser_resolve_js", {{
                        input: {{ requestId: "{id}", result: {{ success: false, data: null, error: "timeout waiting for: " + sel }} }}
                    }});
                    return;
                }}
                requestAnimationFrame(check);
            }}
            check();
        }})();"#,
                sel = sel,
                timeout = timeout_ms,
                id = escaped_id,
            )
        }
        BrowserAction::Scroll { selector, x, y } => {
            let scroll_js = match selector {
                Some(s) => {
                    let sel = s.replace('"', "\\\"");
                    format!("document.querySelector(\"{}\")?.scrollIntoView({{ behavior: \"smooth\" }});", sel)
                }
                None => {
                    let x_val = x.unwrap_or(0);
                    let y_val = y.unwrap_or(0);
                    format!("window.scrollBy({}, {});", x_val, y_val)
                }
            };
            format!(
                r#"(function() {{
            try {{
                {scroll_js}
                __TAURI_INTERNALS__.invoke("browser_resolve_js", {{
                    input: {{ requestId: "{id}", result: {{ success: true, data: null, error: null }} }}
                }});
            }} catch(e) {{
                __TAURI_INTERNALS__.invoke("browser_resolve_js", {{
                    input: {{ requestId: "{id}", result: {{ success: false, data: null, error: e.message || String(e) }} }}
                }});
            }}
        }})();"#,
                scroll_js = scroll_js,
                id = escaped_id,
            )
        }
        BrowserAction::GetTitle => {
            format!(
                r#"(function() {{
            try {{
                const title = document.title || "";
                __TAURI_INTERNALS__.invoke("browser_resolve_js", {{
                    input: {{ requestId: "{id}", result: {{ success: true, data: title, error: null }} }}
                }});
            }} catch(e) {{
                __TAURI_INTERNALS__.invoke("browser_resolve_js", {{
                    input: {{ requestId: "{id}", result: {{ success: false, data: null, error: e.message || String(e) }} }}
                }});
            }}
        }})();"#,
                id = escaped_id,
            )
        }
        BrowserAction::GetUrl => {
            format!(
                r#"(function() {{
            try {{
                const url = window.location.href || "";
                __TAURI_INTERNALS__.invoke("browser_resolve_js", {{
                    input: {{ requestId: "{id}", result: {{ success: true, data: url, error: null }} }}
                }});
            }} catch(e) {{
                __TAURI_INTERNALS__.invoke("browser_resolve_js", {{
                    input: {{ requestId: "{id}", result: {{ success: false, data: null, error: e.message || String(e) }} }}
                }});
            }}
        }})();"#,
                id = escaped_id,
            )
        }
        BrowserAction::PressKey { key } => {
            let k = key.replace('"', "\\\"");
            format!(
                r#"(function() {{
            try {{
                const el = document.activeElement || document.body;
                el.dispatchEvent(new KeyboardEvent("keydown", {{ key: "{k}", bubbles: true }}));
                el.dispatchEvent(new KeyboardEvent("keyup", {{ key: "{k}", bubbles: true }}));
                __TAURI_INTERNALS__.invoke("browser_resolve_js", {{
                    input: {{ requestId: "{id}", result: {{ success: true, data: null, error: null }} }}
                }});
            }} catch(e) {{
                __TAURI_INTERNALS__.invoke("browser_resolve_js", {{
                    input: {{ requestId: "{id}", result: {{ success: false, data: null, error: e.message || String(e) }} }}
                }});
            }}
        }})();"#,
                k = k,
                id = escaped_id,
            )
        }
        BrowserAction::SelectOption { selector, value } => {
            let sel = selector.replace('"', "\\\"");
            let val = value.replace('"', "\\\"");
            format!(
                r#"(function() {{
            try {{
                const el = document.querySelector("{sel}");
                if (!el) throw new Error("element not found: {sel}");
                el.value = "{val}";
                el.dispatchEvent(new Event("change", {{ bubbles: true }}));
                __TAURI_INTERNALS__.invoke("browser_resolve_js", {{
                    input: {{ requestId: "{id}", result: {{ success: true, data: null, error: null }} }}
                }});
            }} catch(e) {{
                __TAURI_INTERNALS__.invoke("browser_resolve_js", {{
                    input: {{ requestId: "{id}", result: {{ success: false, data: null, error: e.message || String(e) }} }}
                }});
            }}
        }})();"#,
                sel = sel,
                val = val,
                id = escaped_id,
            )
        }
        BrowserAction::GetAttribute {
            selector,
            attribute,
        } => {
            let sel = selector.replace('"', "\\\"");
            let attr = attribute.replace('"', "\\\"");
            format!(
                r#"(function() {{
            try {{
                const el = document.querySelector("{sel}");
                if (!el) throw new Error("element not found: {sel}");
                const val = el.getAttribute("{attr}") || "";
                __TAURI_INTERNALS__.invoke("browser_resolve_js", {{
                    input: {{ requestId: "{id}", result: {{ success: true, data: val, error: null }} }}
                }});
            }} catch(e) {{
                __TAURI_INTERNALS__.invoke("browser_resolve_js", {{
                    input: {{ requestId: "{id}", result: {{ success: false, data: null, error: e.message || String(e) }} }}
                }});
            }}
        }})();"#,
                sel = sel,
                attr = attr,
                id = escaped_id,
            )
        }
        BrowserAction::GetElementInfo { selector } => {
            let sel = selector.replace('"', "\\\"");
            format!(
                r#"(function() {{
            try {{
                const el = document.querySelector("{sel}");
                if (!el) throw new Error("element not found: {sel}");
                const rect = el.getBoundingClientRect();
                const info = JSON.stringify({{
                    tag: el.tagName,
                    text: (el.innerText || "").trim().substring(0, 200),
                    visible: rect.width > 0 && rect.height > 0,
                    rect: {{ x: rect.x, y: rect.y, width: rect.width, height: rect.height }}
                }});
                __TAURI_INTERNALS__.invoke("browser_resolve_js", {{
                    input: {{ requestId: "{id}", result: {{ success: true, data: info, error: null }} }}
                }});
            }} catch(e) {{
                __TAURI_INTERNALS__.invoke("browser_resolve_js", {{
                    input: {{ requestId: "{id}", result: {{ success: false, data: null, error: e.message || String(e) }} }}
                }});
            }}
        }})();"#,
                sel = sel,
                id = escaped_id,
            )
        }
        BrowserAction::WaitForNavigation {
            timeout_ms,
            expected_url,
        } => {
            let expected_check = match expected_url {
                Some(url) => {
                    let u = url.replace('"', "\\\"");
                    format!(
                        r#"if (!window.location.href.includes("{u}")) {{
                    throw new Error("navigation mismatch: expected {u}, got " + window.location.href);
                }}"#,
                        u = u,
                    )
                }
                None => String::new(),
            };
            format!(
                r#"(function() {{
            const start = Date.now();
            const timeout = {timeout};
            const expected = window.location.href;
            function check() {{
                if (window.location.href !== expected) {{
                    {expected_check}
                    __TAURI_INTERNALS__.invoke("browser_resolve_js", {{
                        input: {{ requestId: "{id}", result: {{ success: true, data: window.location.href, error: null }} }}
                    }});
                    return;
                }}
                if (Date.now() - start > timeout) {{
                    __TAURI_INTERNALS__.invoke("browser_resolve_js", {{
                        input: {{ requestId: "{id}", result: {{ success: false, data: null, error: "navigation timeout" }} }}
                    }});
                    return;
                }}
                requestAnimationFrame(check);
            }}
            check();
        }})();"#,
                timeout = timeout_ms,
                expected_check = expected_check,
                id = escaped_id,
            )
        }
    }
}

// ============================================================================
// 安全配置
// ============================================================================

/// 浏览器安全配置
#[derive(Debug, Clone)]
pub struct BrowserSecurityConfig {
    /// JS 执行超时时间（毫秒）
    pub execution_timeout: u64,
}

impl Default for BrowserSecurityConfig {
    fn default() -> Self {
        Self {
            execution_timeout: 30_000, // 30 秒
        }
    }
}

// ============================================================================
// JsBridge
// ============================================================================

/// Rust 与 Webview JavaScript 之间的双向通信桥
///
/// 工作原理：
/// 1. Rust 端通过 `wait_for_result` 注册一个 oneshot channel sender
/// 2. JS 执行完毕后通过 Tauri IPC 调用 `browser_resolve_js`
/// 3. `resolve` 方法找到对应的 sender 并发送结果
pub struct JsBridge {
    /// 待处理的请求（request_id → oneshot sender）
    pending: Arc<Mutex<HashMap<String, oneshot::Sender<BrowserActionResult>>>>,
}

impl JsBridge {
    /// 创建新的 JsBridge 实例
    pub fn new() -> Self {
        Self {
            pending: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// 注册一个等待结果的请求，返回 Future
    ///
    /// 生成的 JS 应在执行完毕后通过 `browser_resolve_js` 调用 `resolve`。
    /// 如果超时内未收到结果，返回超时错误。
    pub fn wait_for_result(
        &self,
        request_id: &str,
        timeout: u64,
    ) -> Pin<Box<dyn Future<Output = Result<BrowserActionResult, String>> + Send + '_>> {
        let (tx, rx) = oneshot::channel::<BrowserActionResult>();
        {
            let pending = self.pending.lock().map_err(|e| e.to_string()).ok();
            if let Some(mut p) = pending {
                p.insert(request_id.to_string(), tx);
            }
        }

        let pending = self.pending.clone();
        let request_id = request_id.to_string();

        Box::pin(async move {
            let result = tokio::time::timeout(
                std::time::Duration::from_millis(timeout),
                rx,
            )
            .await;

            // Clean up the pending entry in case it wasn't removed by resolve
            {
                let _ = pending
                    .lock()
                    .map(|mut p| { p.remove(&request_id); });
            }

            match result {
                Ok(Ok(r)) => Ok(r),
                Ok(Err(_)) => Err("JsBridge channel closed".to_string()),
                Err(_) => Err(format!(
                    "JsBridge timeout after {timeout}ms for request {request_id}"
                )),
            }
        })
    }

    /// 解析 JS 执行结果，唤醒等待中的 `wait_for_result`
    ///
    /// 返回 true 表示成功找到并唤醒了对应的等待者，false 表示未找到。
    pub fn resolve(
        &self,
        request_id: &str,
        result: BrowserActionResult,
    ) -> Pin<Box<dyn Future<Output = bool> + Send + '_>> {
        let pending = self.pending.clone();
        let request_id = request_id.to_string();

        Box::pin(async move {
            let sender = {
                let mut p = match pending.lock() {
                    Ok(guard) => guard,
                    Err(_) => return false,
                };
                p.remove(&request_id)
            };
            match sender {
                Some(tx) => tx.send(result).map(|_| true).unwrap_or(false),
                None => false,
            }
        })
    }
}

impl Default for JsBridge {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================================
// 录制与回放
// ============================================================================

/// 单次录制的浏览器操作记录
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordedAction {
    /// 操作类型名称（与 BrowserAction::tool_name() 对应）
    pub action_type: String,
    /// 操作详情（JSON 格式的 BrowserAction）
    #[serde(default)]
    pub action_json: Option<String>,
    /// 执行结果
    #[serde(default)]
    pub success: bool,
    /// 错误信息
    #[serde(default)]
    pub error: Option<String>,
    /// 执行时的 URL
    #[serde(default)]
    pub url: Option<String>,
    /// 时间戳
    #[serde(default)]
    pub timestamp: Option<String>,
}

impl RecordedAction {
    /// 创建新的录制动作记录
    pub fn new(
        action_type: String,
        action_json: Option<String>,
        success: bool,
        error: Option<String>,
        url: Option<String>,
    ) -> Self {
        Self {
            action_type,
            action_json,
            success,
            error,
            url,
            timestamp: Some(chrono::Utc::now().to_rfc3339()),
        }
    }
}

/// 录制摘要统计
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordingSummary {
    /// 总操作数
    pub total_actions: usize,
    /// 成功操作数
    pub successful_actions: usize,
    /// 失败操作数
    pub failed_actions: usize,
}

/// 浏览器录制结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserRecording {
    /// 录制的操作列表
    pub actions: Vec<RecordedAction>,
}

impl BrowserRecording {
    /// 生成录制摘要统计
    pub fn summary(&self) -> RecordingSummary {
        let total = self.actions.len();
        let successful = self.actions.iter().filter(|a| a.success).count();
        let failed = total - successful;
        RecordingSummary {
            total_actions: total,
            successful_actions: successful,
            failed_actions: failed,
        }
    }
}

/// 回放结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReplayResult {
    /// 总操作数
    pub total: usize,
    /// 成功数
    pub successful: usize,
    /// 失败数
    pub failed: usize,
    /// 失败操作的索引列表
    pub failed_actions: Vec<usize>,
    /// 错误信息列表
    pub errors: Vec<String>,
}

/// 录制状态管理器
///
/// 管理每个线程的录制状态，记录 Agent 驱动的浏览器操作。
pub struct RecordingState {
    /// 每个线程的录制操作列表
    inner: Arc<Mutex<HashMap<String, Vec<RecordedAction>>>>,
}

impl RecordingState {
    /// 创建新的录制状态管理器
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// 开始录制
    ///
    /// 为该线程初始化一个空的录制列表。如果已有活跃录制，返回错误。
    pub fn start_recording(&self, thread_id: String) -> Result<(), String> {
        let mut map = self.inner.lock().map_err(|e| e.to_string())?;
        if map.contains_key(&thread_id) {
            return Err(format!("线程 {thread_id} 已有活跃录制"));
        }
        map.insert(thread_id, Vec::new());
        Ok(())
    }

    /// 停止录制并返回录制结果
    pub fn stop_recording(&self, thread_id: &str) -> Result<BrowserRecording, String> {
        let mut map = self.inner.lock().map_err(|e| e.to_string())?;
        let actions = map
            .remove(thread_id)
            .ok_or_else(|| format!("线程 {thread_id} 没有活跃录制"))?;
        Ok(BrowserRecording { actions })
    }

    /// 检查线程是否正在录制中
    pub fn is_recording(&self, thread_id: &str) -> bool {
        self.inner
            .lock()
            .map(|m| m.contains_key(thread_id))
            .unwrap_or(false)
    }

    /// 返回线程当前录制的操作数量
    pub fn action_count(&self, thread_id: &str) -> usize {
        self.inner
            .lock()
            .ok()
            .and_then(|m| m.get(thread_id).map(|v| v.len()))
            .unwrap_or(0)
    }

    /// 记录一次操作
    pub fn record_action(
        &self,
        thread_id: &str,
        action: &BrowserAction,
        success: bool,
        error: Option<String>,
        url: Option<String>,
    ) {
        let Ok(mut map) = self.inner.lock() else {
            return;
        };
        if let Some(actions) = map.get_mut(thread_id) {
            let action_json = serde_json::to_string(action).ok();
            let recorded = RecordedAction::new(
                action.tool_name().to_string(),
                action_json,
                success,
                error,
                url,
            );
            actions.push(recorded);
        }
    }
}

impl Default for RecordingState {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================================
// 回放辅助
// ============================================================================

/// 从录制的操作重建 BrowserAction
///
/// 根据 `action_type` 和 `action_json` 还原原始 BrowserAction。
/// 如果操作类型不支持或 JSON 解析失败，返回 None。
pub fn rebuild_action(recorded: &RecordedAction) -> Option<BrowserAction> {
    // 优先尝试从 action_json 反序列化
    if let Some(json_str) = &recorded.action_json {
        if let Ok(action) = serde_json::from_str::<BrowserAction>(json_str) {
            return Some(action);
        }
    }
    // 无法重建时返回 None
    None
}
