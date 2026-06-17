// Tauri IPC commands
use tauri::{AppHandle, State};
use serde::{Deserialize, Serialize};
use anyhow::Result;
use tracing::info;

use crate::state::{AppState, UpdateState};
use crate::browser::{BrowserManager, ThreadBrowserState, BrowserOpenInput, BrowserThreadInput, 
                     BrowserSetPanelBoundsInput, BrowserNavigateInput, BrowserTabInput, 
                     BrowserNewTabInput, BrowserExecuteCdpInput, BrowserCaptureScreenshotResult};
use crate::updater::UpdaterManager;

// DTO structures
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextMenuItemDto {
    pub id: String,
    pub label: String,
    #[serde(default)]
    pub separator_before: bool,
    #[serde(default)]
    pub destructive: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PositionDto {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveFileInput {
    pub default_filename: String,
    pub contents: String,
    pub filters: Option<Vec<(String, Vec<String>)>>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateActionResult {
    pub success: bool,
    pub message: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationInput {
    pub title: String,
    pub body: String,
    pub icon: Option<String>,
}

// Core commands
#[tauri::command]
pub async fn get_ws_url(state: State<'_, AppState>) -> Result<Option<String>, String> {
    let ws_url = state.backend_ws_url.read().clone();
    if ws_url.is_empty() {
        Ok(None)
    } else {
        Ok(Some(ws_url))
    }
}

#[tauri::command]
pub async fn pick_folder(app: AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    
    let folder = app.dialog().file().blocking_pick_folder();
    Ok(folder.and_then(|p| p.into_path().ok().map(|path| path.to_string_lossy().to_string())))
}

#[tauri::command]
pub async fn save_file(app: AppHandle, input: SaveFileInput) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    
    let mut dialog = app.dialog().file().set_file_name(&input.default_filename);
    
    if let Some(filters) = input.filters {
        for (name, extensions) in filters {
            let ext_refs: Vec<&str> = extensions.iter().map(|s| s.as_str()).collect();
            dialog = dialog.add_filter(&name, &ext_refs);
        }
    }
    
    let file = dialog.blocking_save_file();
    if let Some(file_path) = file {
        let path_str = file_path.into_path().map_err(|_| "Invalid file path".to_string())?;
        let path = std::path::PathBuf::from(&path_str);
        std::fs::write(&path, input.contents).map_err(|e| e.to_string())?;
        Ok(Some(path.to_string_lossy().to_string()))
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub async fn confirm(app: AppHandle, message: String) -> Result<bool, String> {
    use tauri_plugin_dialog::DialogExt;
    
    let result = app.dialog().message(&message).blocking_show();
    Ok(result)
}

#[tauri::command]
pub async fn set_theme(_app: AppHandle, theme: String) -> Result<(), String> {
    // Tauri 2 theme support would need to be implemented via window evaluation
    info!("Setting theme to: {}", theme);
    Ok(())
}

#[tauri::command]
pub async fn show_context_menu(
    _app: AppHandle,
    items: Vec<ContextMenuItemDto>,
    _position: Option<PositionDto>,
) -> Result<Option<String>, String> {
    // Context menu implementation would require custom window handling
    // For now, return None (no selection)
    info!("Context menu requested with {} items", items.len());
    Ok(None)
}

#[tauri::command]
pub async fn open_external(app: AppHandle, url: String) -> Result<bool, String> {
    use tauri_plugin_opener::OpenerExt;

    app.opener().open_url(&url, None::<&str>).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub async fn show_in_folder(_app: AppHandle, path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        // On Windows, use explorer /select
        std::process::Command::new("explorer")
            .arg(format!("/select,{}", path))
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    
    #[cfg(target_os = "macos")]
    {
        // On macOS, use open -R
        std::process::Command::new("open")
            .arg("-R")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    
    #[cfg(target_os = "linux")]
    {
        // On Linux, use xdg-open
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

// Update commands
#[tauri::command]
pub async fn get_update_state(state: State<'_, AppState>) -> Result<UpdateState, String> {
    Ok(state.update_state.read().clone())
}

#[tauri::command]
pub async fn check_for_updates(
    state: State<'_, AppState>,
    updater: State<'_, UpdaterManager>,
) -> Result<UpdateState, String> {
    updater.check_for_updates(state.inner()).await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn download_update(
    state: State<'_, AppState>,
    updater: State<'_, UpdaterManager>,
) -> Result<UpdateActionResult, String> {
    updater.download_update(state.inner()).await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn install_update(
    app: AppHandle,
    state: State<'_, AppState>,
    updater: State<'_, UpdaterManager>,
) -> Result<UpdateActionResult, String> {
    updater.install_update(app, state.inner()).await
        .map_err(|e| e.to_string())
}

// Notification commands
#[tauri::command]
pub async fn notifications_is_supported() -> Result<bool, String> {
    // Tauri notification plugin support check
    Ok(true)
}

#[tauri::command]
pub async fn notifications_show(app: AppHandle, input: NotificationInput) -> Result<bool, String> {
    use tauri_plugin_notification::NotificationExt;
    
    app.notification()
        .builder()
        .title(&input.title)
        .body(&input.body)
        .show()
        .map_err(|e| e.to_string())?;
    
    Ok(true)
}

// Browser commands
#[tauri::command]
pub async fn browser_open(
    browser: State<'_, BrowserManager>,
    input: BrowserOpenInput,
) -> Result<ThreadBrowserState, String> {
    browser.open(input).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_close(
    browser: State<'_, BrowserManager>,
    input: BrowserThreadInput,
) -> Result<ThreadBrowserState, String> {
    browser.close(input).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_hide(
    browser: State<'_, BrowserManager>,
    input: BrowserThreadInput,
) -> Result<(), String> {
    browser.hide(input).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_get_state(
    browser: State<'_, BrowserManager>,
    input: BrowserThreadInput,
) -> Result<ThreadBrowserState, String> {
    browser.get_state(input).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_set_panel_bounds(
    browser: State<'_, BrowserManager>,
    input: BrowserSetPanelBoundsInput,
) -> Result<(), String> {
    browser.set_panel_bounds(input).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_navigate(
    browser: State<'_, BrowserManager>,
    input: BrowserNavigateInput,
) -> Result<ThreadBrowserState, String> {
    browser.navigate(input).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_reload(
    browser: State<'_, BrowserManager>,
    input: BrowserTabInput,
) -> Result<ThreadBrowserState, String> {
    browser.reload(input).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_go_back(
    browser: State<'_, BrowserManager>,
    input: BrowserTabInput,
) -> Result<ThreadBrowserState, String> {
    browser.go_back(input).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_go_forward(
    browser: State<'_, BrowserManager>,
    input: BrowserTabInput,
) -> Result<ThreadBrowserState, String> {
    browser.go_forward(input).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_new_tab(
    browser: State<'_, BrowserManager>,
    input: BrowserNewTabInput,
) -> Result<ThreadBrowserState, String> {
    browser.new_tab(input).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_close_tab(
    browser: State<'_, BrowserManager>,
    input: BrowserTabInput,
) -> Result<ThreadBrowserState, String> {
    browser.close_tab(input).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_select_tab(
    browser: State<'_, BrowserManager>,
    input: BrowserTabInput,
) -> Result<ThreadBrowserState, String> {
    browser.select_tab(input).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_open_dev_tools(
    browser: State<'_, BrowserManager>,
    input: BrowserTabInput,
) -> Result<(), String> {
    browser.open_dev_tools(input).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_capture_screenshot(
    browser: State<'_, BrowserManager>,
    input: BrowserTabInput,
) -> Result<BrowserCaptureScreenshotResult, String> {
    browser.capture_screenshot(input).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_copy_screenshot_to_clipboard(
    app: AppHandle,
    browser: State<'_, BrowserManager>,
    input: BrowserTabInput,
) -> Result<(), String> {
    browser.copy_screenshot_to_clipboard(app, input).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_execute_cdp(
    browser: State<'_, BrowserManager>,
    input: BrowserExecuteCdpInput,
) -> Result<serde_json::Value, String> {
    browser.execute_cdp(input).await.map_err(|e| e.to_string())
}
