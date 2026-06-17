// Browser management for Tauri 2
use std::collections::HashMap;
use std::sync::Arc;
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use serde_json::json;
use anyhow::Result;
use uuid::Uuid;
use tauri::AppHandle;
use tracing::{info, warn};

// Input DTOs
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

// Result DTOs
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserCaptureScreenshotResult {
    pub data: String,
    pub mime_type: String,
}

// State structures
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

pub struct BrowserManager {
    states: Arc<RwLock<HashMap<String, ThreadBrowserState>>>,
    // In a full implementation, this would also hold webview window handles
}

impl BrowserManager {
    pub fn new() -> Self {
        Self {
            states: Arc::new(RwLock::new(HashMap::new())),
        }
    }

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
            let tab = BrowserTabState {
                id: Uuid::new_v4().to_string(),
                url: input.initial_url.unwrap_or_else(|| "about:blank".to_string()),
                title: "New tab".to_string(),
                status: "suspended".to_string(),
                is_loading: false,
                can_go_back: false,
                can_go_forward: false,
                favicon_url: None,
                last_committed_url: None,
                last_error: None,
            };
            state.active_tab_id = Some(tab.id.clone());
            state.tabs.push(tab);
        }

        info!("Browser opened for thread: {}", input.thread_id);
        Ok(state.clone())
    }

    pub async fn close(&self, input: BrowserThreadInput) -> Result<ThreadBrowserState> {
        let mut states = self.states.write();
        if let Some(state) = states.get_mut(&input.thread_id) {
            state.open = false;
            state.active_tab_id = None;
            state.tabs.clear();
            state.last_error = None;
            state.version += 1;
            info!("Browser closed for thread: {}", input.thread_id);
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

    pub async fn hide(&self, input: BrowserThreadInput) -> Result<()> {
        // In a full implementation, this would hide the webview window
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
        // In a full implementation, this would resize the webview window
        info!(
            "Browser panel bounds set for thread {}: {:?}",
            input.thread_id, input.bounds
        );
        Ok(())
    }

    pub async fn navigate(&self, input: BrowserNavigateInput) -> Result<ThreadBrowserState> {
        let mut states = self.states.write();
        if let Some(state) = states.get_mut(&input.thread_id) {
            let target_tab_id = input.tab_id.or_else(|| state.active_tab_id.clone());
            if let Some(tab) = state.tabs.iter_mut().find(|t| Some(&t.id) == target_tab_id.as_ref()) {
                tab.url = input.url.clone();
                tab.last_committed_url = Some(input.url);
                tab.is_loading = true;
                tab.last_error = None;
                state.version += 1;
            }
            Ok(state.clone())
        } else {
            anyhow::bail!("Thread not found")
        }
    }

    pub async fn reload(&self, input: BrowserTabInput) -> Result<ThreadBrowserState> {
        let mut states = self.states.write();
        if let Some(state) = states.get_mut(&input.thread_id) {
            if let Some(tab) = state.tabs.iter_mut().find(|t| t.id == input.tab_id) {
                tab.is_loading = true;
                tab.last_error = None;
                state.version += 1;
            }
            Ok(state.clone())
        } else {
            anyhow::bail!("Thread not found")
        }
    }

    pub async fn go_back(&self, input: BrowserTabInput) -> Result<ThreadBrowserState> {
        let mut states = self.states.write();
        if let Some(state) = states.get_mut(&input.thread_id) {
            if let Some(tab) = state.tabs.iter_mut().find(|t| t.id == input.tab_id) {
                // In a full implementation, this would navigate back in the webview
                tab.can_go_back = false; // Reset after going back
                state.version += 1;
            }
            Ok(state.clone())
        } else {
            anyhow::bail!("Thread not found")
        }
    }

    pub async fn go_forward(&self, input: BrowserTabInput) -> Result<ThreadBrowserState> {
        let mut states = self.states.write();
        if let Some(state) = states.get_mut(&input.thread_id) {
            if let Some(tab) = state.tabs.iter_mut().find(|t| t.id == input.tab_id) {
                // In a full implementation, this would navigate forward in the webview
                tab.can_go_forward = false; // Reset after going forward
                state.version += 1;
            }
            Ok(state.clone())
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

        let tab = BrowserTabState {
            id: Uuid::new_v4().to_string(),
            url: input.url.unwrap_or_else(|| "about:blank".to_string()),
            title: "New tab".to_string(),
            status: "suspended".to_string(),
            is_loading: false,
            can_go_back: false,
            can_go_forward: false,
            favicon_url: None,
            last_committed_url: None,
            last_error: None,
        };

        if input.activate.unwrap_or(true) || state.active_tab_id.is_none() {
            state.active_tab_id = Some(tab.id.clone());
        }

        state.tabs.push(tab);
        state.version += 1;

        Ok(state.clone())
    }

    pub async fn close_tab(&self, input: BrowserTabInput) -> Result<ThreadBrowserState> {
        let mut states = self.states.write();
        if let Some(state) = states.get_mut(&input.thread_id) {
            state.tabs.retain(|t| t.id != input.tab_id);
            
            if state.active_tab_id.as_ref() == Some(&input.tab_id) {
                state.active_tab_id = state.tabs.first().map(|t| t.id.clone());
            }

            if state.tabs.is_empty() {
                state.open = false;
                state.active_tab_id = None;
            }

            state.version += 1;
            Ok(state.clone())
        } else {
            anyhow::bail!("Thread not found")
        }
    }

    pub async fn select_tab(&self, input: BrowserTabInput) -> Result<ThreadBrowserState> {
        let mut states = self.states.write();
        if let Some(state) = states.get_mut(&input.thread_id) {
            if state.tabs.iter().any(|t| t.id == input.tab_id) {
                state.active_tab_id = Some(input.tab_id);
                state.version += 1;
                Ok(state.clone())
            } else {
                anyhow::bail!("Tab not found")
            }
        } else {
            anyhow::bail!("Thread not found")
        }
    }

    pub async fn open_dev_tools(&self, input: BrowserTabInput) -> Result<()> {
        // In a full implementation, this would open dev tools for the webview
        info!("Dev tools opened for tab: {}", input.tab_id);
        Ok(())
    }

    pub async fn capture_screenshot(&self, input: BrowserTabInput) -> Result<BrowserCaptureScreenshotResult> {
        // Stub implementation - in a full implementation, this would capture a screenshot
        warn!("Screenshot capture not yet implemented for tab: {}", input.tab_id);
        Ok(BrowserCaptureScreenshotResult {
            data: String::new(),
            mime_type: "image/png".to_string(),
        })
    }

    pub async fn copy_screenshot_to_clipboard(&self, _app: AppHandle, input: BrowserTabInput) -> Result<()> {
        // Stub implementation - in a full implementation, this would copy screenshot to clipboard
        warn!("Copy screenshot to clipboard not yet implemented for tab: {}", input.tab_id);
        Ok(())
    }

    pub async fn execute_cdp(&self, input: BrowserExecuteCdpInput) -> Result<serde_json::Value> {
        // Stub implementation - in a full implementation, this would execute CDP commands
        warn!("CDP execution not yet implemented for method: {}", input.method);
        Ok(json!({}))
    }
}
