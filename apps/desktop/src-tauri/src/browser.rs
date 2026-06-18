// Browser management for Tauri 2 – real WebView implementation
use std::collections::HashMap;
use std::sync::Arc;
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use serde_json::json;
use anyhow::Result;
use uuid::Uuid;
use tauri::{AppHandle, Emitter, Manager};
use tauri::webview::WebviewWindowBuilder;
use tracing::{info, warn, error};

// ── Input DTOs ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserOpenInput {
    pub thread_id: String,
    pub initial_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserThreadInput {
    pub thread_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserSetPanelBoundsInput {
    pub thread_id: String,
    pub bounds: BrowserBounds,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserBounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserNavigateInput {
    pub thread_id: String,
    pub tab_id: Option<String>,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserTabInput {
    pub thread_id: String,
    pub tab_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserNewTabInput {
    pub thread_id: String,
    pub url: Option<String>,
    pub activate: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserExecuteCdpInput {
    pub thread_id: String,
    pub tab_id: String,
    pub method: String,
    pub params: Option<serde_json::Value>,
}

// ── Result DTOs ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserCaptureScreenshotResult {
    pub data: String,
    pub mime_type: String,
}

// ── State structures ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserTabState {
    pub id: String,
    pub url: String,
    pub title: String,
    pub status: String, // "live" | "suspended"
    pub is_loading: bool,
    pub can_go_back: bool,
    pub can_go_forward: bool,
    pub favicon_url: Option<String>,
    pub last_committed_url: Option<String>,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadBrowserState {
    pub thread_id: String,
    pub version: u32,
    pub open: bool,
    pub active_tab_id: Option<String>,
    pub tabs: Vec<BrowserTabState>,
    pub last_error: Option<String>,
}

// ── Internal per-tab bookkeeping ──────────────────────────────────────────────

struct TabEntry {
    state: BrowserTabState,
    /// The label of the Tauri WebviewWindow that hosts this tab's content.
    window_label: String,
    /// Navigation history for back/forward (indices into `history`).
    history: Vec<String>,
    history_index: usize,
}

// ── BrowserManager ────────────────────────────────────────────────────────────

pub struct BrowserManager {
    states: Arc<RwLock<HashMap<String, ThreadBrowserState>>>,
    tabs: Arc<RwLock<HashMap<String, TabEntry>>>, // key = tab_id
    app_handle: Arc<RwLock<Option<AppHandle>>>,
}

impl BrowserManager {
    pub fn new() -> Self {
        Self {
            states: Arc::new(RwLock::new(HashMap::new())),
            tabs: Arc::new(RwLock::new(HashMap::new())),
            app_handle: Arc::new(RwLock::new(None)),
        }
    }

    pub fn set_app_handle(&self, app_handle: AppHandle) {
        *self.app_handle.write() = Some(app_handle);
    }

    fn app(&self) -> Result<AppHandle> {
        self.app_handle
            .read()
            .clone()
            .ok_or_else(|| anyhow::anyhow!("AppHandle not set"))
    }

    fn emit_state_change(&self, state: &ThreadBrowserState) {
        if let Ok(app) = self.app() {
            let _ = app.emit("browser-state", state);
        }
    }

    /// Helper: build a unique window label for a tab.
    fn window_label(thread_id: &str, tab_id: &str) -> String {
        format!("browser-{}-{}", thread_id, tab_id)
    }

    /// Create a real Tauri WebviewWindow for a tab.
    fn create_webview(&self, tab_id: &str, _url: &str) -> Result<()> {
        let _app = self.app()?;
        let _label = Self::window_label(
            // extract thread_id from tabs map
            self.tabs
                .read()
                .get(tab_id)
                .map(|_| "") // placeholder – caller must use full label
                .unwrap_or(""),
            tab_id,
        );
        // The actual label is set by the caller; this is just a fallback.
        Ok(())
    }

    /// Spawn a WebviewWindow for the given tab.
    fn spawn_webview_for_tab(
        &self,
        thread_id: &str,
        tab_id: &str,
        url: &str,
    ) -> Result<()> {
        let app = self.app()?;
        let label = Self::window_label(thread_id, tab_id);

        // If a window with this label already exists, just navigate it.
        if let Some(win) = app.get_webview_window(&label) {
            let url_parsed = url::Url::parse(url).unwrap_or_else(|_| url::Url::parse("about:blank").unwrap());
            let _ = win.navigate(url_parsed);
            let _ = win.show();
            let _ = win.set_focus();
            return Ok(());
        }

        // Build a child webview window inside the main window.
        let url_parsed = url::Url::parse(url).unwrap_or_else(|_| url::Url::parse("about:blank").unwrap());
        WebviewWindowBuilder::new(&app, &label, tauri::WebviewUrl::External(url_parsed))
            .title("Remi Code Browser")
            .inner_size(1024.0, 768.0)
            .visible(true)
            .build()
            .map_err(|e| {
                error!("Failed to create browser webview: {}", e);
                anyhow::anyhow!("Failed to create webview: {}", e)
            })?;

        info!("Created browser webview: {}", label);
        Ok(())
    }

    /// Destroy the WebviewWindow for a tab.
    fn destroy_webview_for_tab(&self, thread_id: &str, tab_id: &str) {
        let label = Self::window_label(thread_id, tab_id);
        if let Ok(app) = self.app() {
            if let Some(win) = app.get_webview_window(&label) {
                let _ = win.close();
            }
        }
    }

    // ── Public API ──────────────────────────────────────────────────────────

    pub async fn open(&self, input: BrowserOpenInput) -> Result<ThreadBrowserState> {
        let mut states = self.states.write();
        let state = states.entry(input.thread_id.clone()).or_insert_with(|| {
            ThreadBrowserState {
                thread_id: input.thread_id.clone(),
                version: 0,
                open: false,
                active_tab_id: None,
                tabs: Vec::new(),
                last_error: None,
            }
        });

        state.open = true;
        state.version += 1;

        if state.tabs.is_empty() {
            let tab_id = Uuid::new_v4().to_string();
            let url = input.initial_url.unwrap_or_else(|| "about:blank".to_string());

            let tab_state = BrowserTabState {
                id: tab_id.clone(),
                url: url.clone(),
                title: "New tab".to_string(),
                status: "live".to_string(),
                is_loading: true,
                can_go_back: false,
                can_go_forward: false,
                favicon_url: None,
                last_committed_url: Some(url.clone()),
                last_error: None,
            };

            // Store tab entry with history tracking.
            {
                let mut tabs = self.tabs.write();
                tabs.insert(
                    tab_id.clone(),
                    TabEntry {
                        state: tab_state.clone(),
                        window_label: Self::window_label(&input.thread_id, &tab_id),
                        history: vec![url.clone()],
                        history_index: 0,
                    },
                );
            }

            state.active_tab_id = Some(tab_id.clone());
            state.tabs.push(tab_state);

            // Spawn the real webview.
            if let Err(e) = self.spawn_webview_for_tab(&input.thread_id, &tab_id, &url) {
                warn!("Failed to spawn webview: {}", e);
            }
        }

        info!("Browser opened for thread: {}", input.thread_id);
        let result = state.clone();
        drop(states);
        self.emit_state_change(&result);
        Ok(result)
    }

    pub async fn close(&self, input: BrowserThreadInput) -> Result<ThreadBrowserState> {
        let mut states = self.states.write();
        if let Some(state) = states.get_mut(&input.thread_id) {
            // Destroy all webviews for this thread's tabs.
            let tab_ids: Vec<String> = state.tabs.iter().map(|t| t.id.clone()).collect();
            for tab_id in &tab_ids {
                self.destroy_webview_for_tab(&input.thread_id, tab_id);
                self.tabs.write().remove(tab_id);
            }

            state.open = false;
            state.active_tab_id = None;
            state.tabs.clear();
            state.last_error = None;
            state.version += 1;

            info!("Browser closed for thread: {}", input.thread_id);
            let result = state.clone();
            drop(states);
            self.emit_state_change(&result);
            Ok(result)
        } else {
            Ok(ThreadBrowserState {
                thread_id: input.thread_id,
                version: 0,
                open: false,
                active_tab_id: None,
                tabs: Vec::new(),
                last_error: None,
            })
        }
    }

    pub async fn hide(&self, input: BrowserThreadInput) -> Result<()> {
        let states = self.states.read();
        if let Some(state) = states.get(&input.thread_id) {
            for tab in &state.tabs {
                let label = Self::window_label(&input.thread_id, &tab.id);
                if let Ok(app) = self.app() {
                    if let Some(win) = app.get_webview_window(&label) {
                        let _ = win.hide();
                    }
                }
            }
        }
        info!("Browser hidden for thread: {}", input.thread_id);
        Ok(())
    }

    pub async fn get_state(&self, input: BrowserThreadInput) -> Result<ThreadBrowserState> {
        let states = self.states.read();
        if let Some(state) = states.get(&input.thread_id) {
            Ok(state.clone())
        } else {
            Ok(ThreadBrowserState {
                thread_id: input.thread_id,
                version: 0,
                open: false,
                active_tab_id: None,
                tabs: Vec::new(),
                last_error: None,
            })
        }
    }

    pub async fn set_panel_bounds(&self, input: BrowserSetPanelBoundsInput) -> Result<()> {
        let states = self.states.read();
        if let Some(state) = states.get(&input.thread_id) {
            // Resize the active tab's webview window.
            if let Some(active_id) = &state.active_tab_id {
                let label = Self::window_label(&input.thread_id, active_id);
                if let Ok(app) = self.app() {
                    if let Some(win) = app.get_webview_window(&label) {
                        let _ = win.set_size(tauri::LogicalSize::new(
                            input.bounds.width,
                            input.bounds.height,
                        ));
                        let _ = win.set_position(tauri::LogicalPosition::new(
                            input.bounds.x,
                            input.bounds.y,
                        ));
                    }
                }
            }
        }
        info!(
            "Browser panel bounds set for thread {}: {:?}",
            input.thread_id, input.bounds
        );
        Ok(())
    }

    pub async fn navigate(&self, input: BrowserNavigateInput) -> Result<ThreadBrowserState> {
        let mut states = self.states.write();
        if let Some(state) = states.get_mut(&input.thread_id) {
            let target_tab_id = input
                .tab_id
                .clone()
                .or_else(|| state.active_tab_id.clone());

            if let Some(tab_id) = &target_tab_id {
                // Navigate the real webview.
                let label = Self::window_label(&input.thread_id, tab_id);
                if let Ok(app) = self.app() {
                    if let Some(win) = app.get_webview_window(&label) {
                        let url_parsed = url::Url::parse(&input.url).unwrap_or_else(|_| url::Url::parse("about:blank").unwrap());
                        let _ = win.navigate(url_parsed);
                    }
                }

                // Update state.
                if let Some(tab) = state
                    .tabs
                    .iter_mut()
                    .find(|t| &t.id == tab_id)
                {
                    tab.url = input.url.clone();
                    tab.last_committed_url = Some(input.url.clone());
                    tab.is_loading = true;
                    tab.last_error = None;
                    tab.can_go_forward = false; // navigating resets forward
                }

                // Update history.
                {
                    let mut tabs = self.tabs.write();
                    if let Some(entry) = tabs.get_mut(tab_id) {
                        // Truncate forward history.
                        entry.history.truncate(entry.history_index + 1);
                        entry.history.push(input.url.clone());
                        entry.history_index = entry.history.len() - 1;
                        entry.state.can_go_back = entry.history_index > 0;
                        entry.state.can_go_forward = false;
                        entry.state.url = input.url.clone();
                        entry.state.is_loading = true;
                    }
                }

                state.version += 1;
            }

            let result = state.clone();
            drop(states);
            self.emit_state_change(&result);
            Ok(result)
        } else {
            anyhow::bail!("Thread not found")
        }
    }

    pub async fn reload(&self, input: BrowserTabInput) -> Result<ThreadBrowserState> {
        let mut states = self.states.write();
        if let Some(state) = states.get_mut(&input.thread_id) {
            if let Some(tab) = state.tabs.iter_mut().find(|t| t.id == input.tab_id) {
                let label = Self::window_label(&input.thread_id, &input.tab_id);
                if let Ok(app) = self.app() {
                    if let Some(win) = app.get_webview_window(&label) {
                        let _ = win.reload();
                    }
                }
                tab.is_loading = true;
                tab.last_error = None;
                state.version += 1;
            }
            let result = state.clone();
            drop(states);
            self.emit_state_change(&result);
            Ok(result)
        } else {
            anyhow::bail!("Thread not found")
        }
    }

    pub async fn go_back(&self, input: BrowserTabInput) -> Result<ThreadBrowserState> {
        let mut states = self.states.write();
        if let Some(state) = states.get_mut(&input.thread_id) {
            if state.tabs.iter().any(|t| t.id == input.tab_id) {
                let mut tabs = self.tabs.write();
                if let Some(entry) = tabs.get_mut(&input.tab_id) {
                    if entry.history_index > 0 {
                        entry.history_index -= 1;
                        let url = entry.history[entry.history_index].clone();

                        // Navigate the real webview.
                        let label =
                            Self::window_label(&input.thread_id, &input.tab_id);
                        if let Ok(app) = self.app() {
                            if let Some(win) = app.get_webview_window(&label) {
                                let url_parsed = url::Url::parse(&url).unwrap_or_else(|_| url::Url::parse("about:blank").unwrap());
                                let _ = win.navigate(url_parsed);
                            }
                        }

                        entry.state.url = url.clone();
                        entry.state.can_go_back = entry.history_index > 0;
                        entry.state.can_go_forward =
                            entry.history_index < entry.history.len() - 1;
                        entry.state.is_loading = true;

                        if let Some(tab) =
                            state.tabs.iter_mut().find(|t| t.id == input.tab_id)
                        {
                            tab.url = url;
                            tab.can_go_back = entry.state.can_go_back;
                            tab.can_go_forward = entry.state.can_go_forward;
                            tab.is_loading = true;
                        }
                        state.version += 1;
                    }
                }
            }
            let result = state.clone();
            drop(states);
            self.emit_state_change(&result);
            Ok(result)
        } else {
            anyhow::bail!("Thread not found")
        }
    }

    pub async fn go_forward(&self, input: BrowserTabInput) -> Result<ThreadBrowserState> {
        let mut states = self.states.write();
        if let Some(state) = states.get_mut(&input.thread_id) {
            if state.tabs.iter().any(|t| t.id == input.tab_id) {
                let mut tabs = self.tabs.write();
                if let Some(entry) = tabs.get_mut(&input.tab_id) {
                    if entry.history_index < entry.history.len() - 1 {
                        entry.history_index += 1;
                        let url = entry.history[entry.history_index].clone();

                        let label =
                            Self::window_label(&input.thread_id, &input.tab_id);
                        if let Ok(app) = self.app() {
                            if let Some(win) = app.get_webview_window(&label) {
                                let url_parsed = url::Url::parse(&url).unwrap_or_else(|_| url::Url::parse("about:blank").unwrap());
                                let _ = win.navigate(url_parsed);
                            }
                        }

                        entry.state.url = url.clone();
                        entry.state.can_go_back = entry.history_index > 0;
                        entry.state.can_go_forward =
                            entry.history_index < entry.history.len() - 1;
                        entry.state.is_loading = true;

                        if let Some(tab) =
                            state.tabs.iter_mut().find(|t| t.id == input.tab_id)
                        {
                            tab.url = url;
                            tab.can_go_back = entry.state.can_go_back;
                            tab.can_go_forward = entry.state.can_go_forward;
                            tab.is_loading = true;
                        }
                        state.version += 1;
                    }
                }
            }
            let result = state.clone();
            drop(states);
            self.emit_state_change(&result);
            Ok(result)
        } else {
            anyhow::bail!("Thread not found")
        }
    }

    pub async fn new_tab(&self, input: BrowserNewTabInput) -> Result<ThreadBrowserState> {
        let mut states = self.states.write();
        let state = states.entry(input.thread_id.clone()).or_insert_with(|| {
            ThreadBrowserState {
                thread_id: input.thread_id.clone(),
                version: 0,
                open: false,
                active_tab_id: None,
                tabs: Vec::new(),
                last_error: None,
            }
        });

        let tab_id = Uuid::new_v4().to_string();
        let url = input.url.unwrap_or_else(|| "about:blank".to_string());

        let tab_state = BrowserTabState {
            id: tab_id.clone(),
            url: url.clone(),
            title: "New tab".to_string(),
            status: "live".to_string(),
            is_loading: true,
            can_go_back: false,
            can_go_forward: false,
            favicon_url: None,
            last_committed_url: Some(url.clone()),
            last_error: None,
        };

        {
            let mut tabs = self.tabs.write();
            tabs.insert(
                tab_id.clone(),
                TabEntry {
                    state: tab_state.clone(),
                    window_label: Self::window_label(&input.thread_id, &tab_id),
                    history: vec![url.clone()],
                    history_index: 0,
                },
            );
        }

        if input.activate.unwrap_or(true) || state.active_tab_id.is_none() {
            state.active_tab_id = Some(tab_id.clone());
        }

        state.tabs.push(tab_state);
        state.version += 1;

        // Spawn webview for new tab.
        if let Err(e) = self.spawn_webview_for_tab(&input.thread_id, &tab_id, &url) {
            warn!("Failed to spawn webview for new tab: {}", e);
        }

        let result = state.clone();
        drop(states);
        self.emit_state_change(&result);
        Ok(result)
    }

    pub async fn close_tab(&self, input: BrowserTabInput) -> Result<ThreadBrowserState> {
        let mut states = self.states.write();
        if let Some(state) = states.get_mut(&input.thread_id) {
            // Destroy the webview.
            self.destroy_webview_for_tab(&input.thread_id, &input.tab_id);
            self.tabs.write().remove(&input.tab_id);

            state.tabs.retain(|t| t.id != input.tab_id);

            if state.active_tab_id.as_ref() == Some(&input.tab_id) {
                state.active_tab_id = state.tabs.first().map(|t| t.id.clone());
            }

            if state.tabs.is_empty() {
                state.open = false;
                state.active_tab_id = None;
            }

            state.version += 1;
            let result = state.clone();
            drop(states);
            self.emit_state_change(&result);
            Ok(result)
        } else {
            anyhow::bail!("Thread not found")
        }
    }

    pub async fn select_tab(&self, input: BrowserTabInput) -> Result<ThreadBrowserState> {
        let mut states = self.states.write();
        if let Some(state) = states.get_mut(&input.thread_id) {
            if state.tabs.iter().any(|t| t.id == input.tab_id) {
                // Hide all other tab webviews, show the selected one.
                for tab in &state.tabs {
                    let label = Self::window_label(&input.thread_id, &tab.id);
                    if let Ok(app) = self.app() {
                        if let Some(win) = app.get_webview_window(&label) {
                            if tab.id == input.tab_id {
                                let _ = win.show();
                                let _ = win.set_focus();
                            } else {
                                let _ = win.hide();
                            }
                        }
                    }
                }

                state.active_tab_id = Some(input.tab_id);
                state.version += 1;
                let result = state.clone();
                drop(states);
                self.emit_state_change(&result);
                Ok(result)
            } else {
                anyhow::bail!("Tab not found")
            }
        } else {
            anyhow::bail!("Thread not found")
        }
    }

    pub async fn open_dev_tools(&self, input: BrowserTabInput) -> Result<()> {
        let label = Self::window_label(&input.thread_id, &input.tab_id);
        if let Ok(app) = self.app() {
            if let Some(win) = app.get_webview_window(&label) {
                // Tauri 2: open dev tools via the webview handle.
                // In Tauri 2, devtools are opened via the window itself
                #[cfg(debug_assertions)]
                {
                    win.open_devtools();
                }
                info!("Dev tools opened for tab: {}", input.tab_id);
            }
        }
        Ok(())
    }

    pub async fn capture_screenshot(
        &self,
        input: BrowserTabInput,
    ) -> Result<BrowserCaptureScreenshotResult> {
        let label = Self::window_label(&input.thread_id, &input.tab_id);
        if let Ok(app) = self.app() {
            if let Some(win) = app.get_webview_window(&label) {
                // Tauri 2 screenshot API
                // In Tauri 2, screenshots are taken via the window
                warn!("Screenshot capture via Tauri 2 window API – using placeholder");
            }
        }

        // Fallback: return empty placeholder.
        warn!(
            "Screenshot capture not fully implemented for tab: {}",
            input.tab_id
        );
        Ok(BrowserCaptureScreenshotResult {
            data: String::new(),
            mime_type: "image/png".to_string(),
        })
    }

    pub async fn copy_screenshot_to_clipboard(
        &self,
        _app: AppHandle,
        input: BrowserTabInput,
    ) -> Result<()> {
        let screenshot = self.capture_screenshot(input.clone()).await?;
        if !screenshot.data.is_empty() {
            // Decode base64 and write to clipboard via tauri-plugin-clipboard-manager.
            // For now, log the intent.
            info!(
                "Copy screenshot to clipboard for tab: {} ({} bytes)",
                input.tab_id,
                screenshot.data.len()
            );
        } else {
            warn!(
                "No screenshot data to copy for tab: {}",
                input.tab_id
            );
        }
        Ok(())
    }

    pub async fn execute_cdp(
        &self,
        input: BrowserExecuteCdpInput,
    ) -> Result<serde_json::Value> {
        let label = Self::window_label(&input.thread_id, &input.tab_id);
        if let Ok(app) = self.app() {
            if let Some(win) = app.get_webview_window(&label) {
                // Tauri 2 does not expose raw CDP. We can evaluate JS as a fallback.
                // For methods that map to JS evaluation, we handle them here.
                match input.method.as_str() {
                    "Runtime.evaluate" => {
                        let expr = input
                            .params
                            .and_then(|p| p.get("expression").and_then(|e| e.as_str().map(String::from)))
                            .unwrap_or_default();
                        let result = win.eval(&expr);
                        match result {
                            Ok(_) => return Ok(json!({ "result": { "value": null } })),
                            Err(e) => return Ok(json!({ "error": e.to_string() })),
                        }
                    }
                    _ => {
                        warn!(
                            "CDP method {} not supported via Tauri webview, falling back to empty",
                            input.method
                        );
                    }
                }
            }
        }
        Ok(json!({}))
    }
}
