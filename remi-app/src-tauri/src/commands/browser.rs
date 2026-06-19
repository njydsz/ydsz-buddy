use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::State;

pub struct BrowserState {
    tabs: Arc<Mutex<HashMap<String, BrowserTab>>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserTab {
    pub id: String,
    pub thread_id: String,
    pub url: String,
    pub title: String,
    pub is_active: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ThreadBrowserState {
    pub thread_id: String,
    pub tabs: Vec<BrowserTab>,
    pub active_tab_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct BrowserOpenInput {
    pub thread_id: String,
    pub url: String,
}

#[derive(Debug, Deserialize)]
pub struct BrowserThreadInput {
    pub thread_id: String,
}

#[derive(Debug, Deserialize)]
pub struct BrowserSetPanelBoundsInput {
    pub thread_id: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Deserialize)]
pub struct BrowserAttachWebviewInput {
    pub thread_id: String,
}

#[derive(Debug, Deserialize)]
pub struct BrowserTabInput {
    pub thread_id: String,
    pub tab_id: String,
}

#[derive(Debug, Deserialize)]
pub struct BrowserNavigateInput {
    pub thread_id: String,
    pub tab_id: String,
    pub url: String,
}

#[derive(Debug, Deserialize)]
pub struct BrowserNewTabInput {
    pub thread_id: String,
    pub url: String,
}

#[derive(Debug, Serialize)]
pub struct BrowserCaptureScreenshotResult {
    pub data: String,
}

#[derive(Debug, Deserialize)]
pub struct BrowserExecuteCdpInput {
    pub thread_id: String,
    pub tab_id: String,
    pub method: String,
    pub params: serde_json::Value,
}

impl BrowserState {
    pub fn new() -> Self {
        Self {
            tabs: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

#[tauri::command]
pub async fn browser_open(
    state: State<'_, BrowserState>,
    input: BrowserOpenInput,
) -> Result<ThreadBrowserState, String> {
    let mut tabs = state.tabs.lock().map_err(|e| e.to_string())?;
    
    let tab = BrowserTab {
        id: uuid::Uuid::new_v4().to_string(),
        thread_id: input.thread_id.clone(),
        url: input.url,
        title: "New Tab".to_string(),
        is_active: true,
    };
    
    tabs.insert(tab.id.clone(), tab.clone());
    
    Ok(ThreadBrowserState {
        thread_id: input.thread_id,
        tabs: vec![tab.clone()],
        active_tab_id: Some(tab.id),
    })
}

#[tauri::command]
pub async fn browser_close(
    state: State<'_, BrowserState>,
    input: BrowserThreadInput,
) -> Result<ThreadBrowserState, String> {
    let mut tabs = state.tabs.lock().map_err(|e| e.to_string())?;
    tabs.retain(|_, tab| tab.thread_id != input.thread_id);
    
    Ok(ThreadBrowserState {
        thread_id: input.thread_id,
        tabs: vec![],
        active_tab_id: None,
    })
}

#[tauri::command]
pub async fn browser_hide(
    state: State<'_, BrowserState>,
    input: BrowserThreadInput,
) -> Result<(), String> {
    // Placeholder for hiding browser panel
    Ok(())
}

#[tauri::command]
pub async fn browser_get_state(
    state: State<'_, BrowserState>,
    input: BrowserThreadInput,
) -> Result<ThreadBrowserState, String> {
    let tabs = state.tabs.lock().map_err(|e| e.to_string())?;
    let thread_tabs: Vec<BrowserTab> = tabs
        .values()
        .filter(|tab| tab.thread_id == input.thread_id)
        .cloned()
        .collect();
    
    let active_tab_id = thread_tabs.iter().find(|t| t.is_active).map(|t| t.id.clone());
    
    Ok(ThreadBrowserState {
        thread_id: input.thread_id,
        tabs: thread_tabs,
        active_tab_id,
    })
}

#[tauri::command]
pub async fn browser_set_panel_bounds(
    input: BrowserSetPanelBoundsInput,
) -> Result<(), String> {
    // Placeholder for setting panel bounds
    Ok(())
}

#[tauri::command]
pub async fn browser_attach_webview(
    state: State<'_, BrowserState>,
    input: BrowserAttachWebviewInput,
) -> Result<ThreadBrowserState, String> {
    let tabs = state.tabs.lock().map_err(|e| e.to_string())?;
    let thread_tabs: Vec<BrowserTab> = tabs
        .values()
        .filter(|tab| tab.thread_id == input.thread_id)
        .cloned()
        .collect();
    
    let active_tab_id = thread_tabs.iter().find(|t| t.is_active).map(|t| t.id.clone());
    
    Ok(ThreadBrowserState {
        thread_id: input.thread_id,
        tabs: thread_tabs,
        active_tab_id,
    })
}

#[tauri::command]
pub async fn browser_copy_screenshot_to_clipboard(
    input: BrowserTabInput,
) -> Result<(), String> {
    // Placeholder for clipboard screenshot
    Ok(())
}

#[tauri::command]
pub async fn browser_capture_screenshot(
    input: BrowserTabInput,
) -> Result<BrowserCaptureScreenshotResult, String> {
    Ok(BrowserCaptureScreenshotResult {
        data: String::new(),
    })
}

#[tauri::command]
pub async fn browser_execute_cdp(
    input: BrowserExecuteCdpInput,
) -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({}))
}

#[tauri::command]
pub async fn browser_navigate(
    state: State<'_, BrowserState>,
    input: BrowserNavigateInput,
) -> Result<ThreadBrowserState, String> {
    let mut tabs = state.tabs.lock().map_err(|e| e.to_string())?;
    
    if let Some(tab) = tabs.get_mut(&input.tab_id) {
        tab.url = input.url;
    }
    
    let thread_tabs: Vec<BrowserTab> = tabs
        .values()
        .filter(|tab| tab.thread_id == input.thread_id)
        .cloned()
        .collect();
    
    let active_tab_id = thread_tabs.iter().find(|t| t.is_active).map(|t| t.id.clone());
    
    Ok(ThreadBrowserState {
        thread_id: input.thread_id,
        tabs: thread_tabs,
        active_tab_id,
    })
}

#[tauri::command]
pub async fn browser_reload(
    state: State<'_, BrowserState>,
    input: BrowserTabInput,
) -> Result<ThreadBrowserState, String> {
    let tabs = state.tabs.lock().map_err(|e| e.to_string())?;
    let thread_tabs: Vec<BrowserTab> = tabs
        .values()
        .filter(|tab| tab.thread_id == input.thread_id)
        .cloned()
        .collect();
    
    let active_tab_id = thread_tabs.iter().find(|t| t.is_active).map(|t| t.id.clone());
    
    Ok(ThreadBrowserState {
        thread_id: input.thread_id,
        tabs: thread_tabs,
        active_tab_id,
    })
}

#[tauri::command]
pub async fn browser_go_back(
    state: State<'_, BrowserState>,
    input: BrowserTabInput,
) -> Result<ThreadBrowserState, String> {
    let tabs = state.tabs.lock().map_err(|e| e.to_string())?;
    let thread_tabs: Vec<BrowserTab> = tabs
        .values()
        .filter(|tab| tab.thread_id == input.thread_id)
        .cloned()
        .collect();
    
    let active_tab_id = thread_tabs.iter().find(|t| t.is_active).map(|t| t.id.clone());
    
    Ok(ThreadBrowserState {
        thread_id: input.thread_id,
        tabs: thread_tabs,
        active_tab_id,
    })
}

#[tauri::command]
pub async fn browser_go_forward(
    state: State<'_, BrowserState>,
    input: BrowserTabInput,
) -> Result<ThreadBrowserState, String> {
    let tabs = state.tabs.lock().map_err(|e| e.to_string())?;
    let thread_tabs: Vec<BrowserTab> = tabs
        .values()
        .filter(|tab| tab.thread_id == input.thread_id)
        .cloned()
        .collect();
    
    let active_tab_id = thread_tabs.iter().find(|t| t.is_active).map(|t| t.id.clone());
    
    Ok(ThreadBrowserState {
        thread_id: input.thread_id,
        tabs: thread_tabs,
        active_tab_id,
    })
}

#[tauri::command]
pub async fn browser_new_tab(
    state: State<'_, BrowserState>,
    input: BrowserNewTabInput,
) -> Result<ThreadBrowserState, String> {
    let mut tabs = state.tabs.lock().map_err(|e| e.to_string())?;
    
    // Deactivate existing tabs
    for tab in tabs.values_mut() {
        if tab.thread_id == input.thread_id {
            tab.is_active = false;
        }
    }
    
    let new_tab = BrowserTab {
        id: uuid::Uuid::new_v4().to_string(),
        thread_id: input.thread_id.clone(),
        url: input.url,
        title: "New Tab".to_string(),
        is_active: true,
    };
    
    tabs.insert(new_tab.id.clone(), new_tab.clone());
    
    let thread_tabs: Vec<BrowserTab> = tabs
        .values()
        .filter(|tab| tab.thread_id == input.thread_id)
        .cloned()
        .collect();
    
    Ok(ThreadBrowserState {
        thread_id: input.thread_id,
        tabs: thread_tabs,
        active_tab_id: Some(new_tab.id),
    })
}

#[tauri::command]
pub async fn browser_close_tab(
    state: State<'_, BrowserState>,
    input: BrowserTabInput,
) -> Result<ThreadBrowserState, String> {
    let mut tabs = state.tabs.lock().map_err(|e| e.to_string())?;
    tabs.remove(&input.tab_id);
    
    let thread_tabs: Vec<BrowserTab> = tabs
        .values()
        .filter(|tab| tab.thread_id == input.thread_id)
        .cloned()
        .collect();
    
    let active_tab_id = thread_tabs.iter().find(|t| t.is_active).map(|t| t.id.clone());
    
    Ok(ThreadBrowserState {
        thread_id: input.thread_id,
        tabs: thread_tabs,
        active_tab_id,
    })
}

#[tauri::command]
pub async fn browser_select_tab(
    state: State<'_, BrowserState>,
    input: BrowserTabInput,
) -> Result<ThreadBrowserState, String> {
    let mut tabs = state.tabs.lock().map_err(|e| e.to_string())?;
    
    for tab in tabs.values_mut() {
        if tab.thread_id == input.thread_id {
            tab.is_active = tab.id == input.tab_id;
        }
    }
    
    let thread_tabs: Vec<BrowserTab> = tabs
        .values()
        .filter(|tab| tab.thread_id == input.thread_id)
        .cloned()
        .collect();
    
    Ok(ThreadBrowserState {
        thread_id: input.thread_id,
        tabs: thread_tabs,
        active_tab_id: Some(input.tab_id),
    })
}

#[tauri::command]
pub async fn browser_open_dev_tools(
    input: BrowserTabInput,
) -> Result<(), String> {
    // Placeholder for opening dev tools
    Ok(())
}
