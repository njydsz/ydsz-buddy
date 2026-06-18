// Tauri IPC commands
use tauri::{AppHandle, State, Manager};
use serde::{Deserialize, Serialize};
use anyhow::Result;
use tracing::{info, warn, error};

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
pub async fn set_theme(app: AppHandle, theme: String) -> Result<(), String> {
    use tauri::Emitter;
    
    info!("Setting theme to: {}", theme);
    
    // Emit an event to the frontend to apply the theme
    let _ = app.emit("theme-changed", &theme);
    
    // Platform-specific theme handling can be added here if needed
    // For now, the frontend handles theme application via the event
    
    Ok(())
}

#[tauri::command]
pub async fn show_context_menu(
    app: AppHandle,
    items: Vec<ContextMenuItemDto>,
    position: Option<PositionDto>,
) -> Result<Option<String>, String> {
    use tauri::Emitter;
    
    info!("Context menu requested with {} items at {:?}", items.len(), position);
    
    // Tauri 2 does not have a built-in native context menu API that returns a selection.
    // We emit an event to the frontend with the menu items and position.
    // The frontend can then show a custom context menu component and emit the selection back.
    
    #[derive(serde::Serialize, Clone)]
    struct ContextMenuEvent {
        items: Vec<ContextMenuItemDto>,
        position: Option<PositionDto>,
        request_id: String,
    }
    
    let request_id = uuid::Uuid::new_v4().to_string();
    
    let _ = app.emit("context-menu-request", ContextMenuEvent {
        items,
        position,
        request_id: request_id.clone(),
    });
    
    // Return None immediately - the actual selection will come via emit_menu_action
    // or a separate callback mechanism if needed
    Ok(None)
}

#[tauri::command]
pub async fn emit_menu_action(
    app: AppHandle,
    action: String,
) -> Result<(), String> {
    use tauri::Emitter;
    let _ = app.emit("menu-action", action);
    Ok(())
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
    app: AppHandle,
    state: State<'_, AppState>,
    updater: State<'_, UpdaterManager>,
) -> Result<UpdateState, String> {
    updater.check_for_updates(&app, state.inner()).await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn download_update(
    app: AppHandle,
    state: State<'_, AppState>,
    updater: State<'_, UpdaterManager>,
) -> Result<UpdateActionResult, String> {
    updater.download_update(&app, state.inner()).await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn install_update(
    app: AppHandle,
    state: State<'_, AppState>,
    updater: State<'_, UpdaterManager>,
) -> Result<UpdateActionResult, String> {
    updater.install_update(&app, state.inner()).await
        .map_err(|e| e.to_string())
}

// Voice transcription command
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceTranscriptionInput {
    pub provider: String,
    pub cwd: String,
    pub thread_id: Option<String>,
    pub mime_type: String,
    pub sample_rate_hz: u32,
    pub duration_ms: u32,
    pub audio_base64: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceTranscriptionResult {
    pub text: String,
}

#[tauri::command]
pub async fn server_transcribe_voice(
    state: State<'_, AppState>,
    input: VoiceTranscriptionInput,
) -> Result<VoiceTranscriptionResult, String> {
    use reqwest::Client;
    use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
    
    info!("Voice transcription requested for provider: {}", input.provider);
    
    // Get the backend HTTP URL
    let backend_url = state.backend_http_url.read().clone();
    let auth_token = state.backend_auth_token.read().clone();
    
    if backend_url.is_empty() || auth_token.is_empty() {
        warn!("Backend not available, returning placeholder transcription");
        return Ok(VoiceTranscriptionResult {
            text: "[Backend not available]".to_string(),
        });
    }
    
    // Forward the audio to the backend's transcription endpoint
    let client = Client::new();
    let endpoint = format!("{}/api/voice/transcribe", backend_url);
    
    // Decode the base64 audio data
    let audio_data = match BASE64.decode(&input.audio_base64) {
        Ok(data) => data,
        Err(e) => {
            error!("Failed to decode audio base64: {}", e);
            return Err(format!("Invalid audio data: {}", e));
        }
    };
    
    // Create multipart form data
    let part = reqwest::multipart::Part::bytes(audio_data)
        .file_name("audio.webm")
        .mime_str(&input.mime_type)
        .map_err(|e| e.to_string())?;
    
    let form = reqwest::multipart::Form::new()
        .part("audio", part)
        .text("provider", input.provider.clone())
        .text("sample_rate_hz", input.sample_rate_hz.to_string())
        .text("duration_ms", input.duration_ms.to_string());
    
    match client
        .post(&endpoint)
        .header("Authorization", format!("Bearer {}", auth_token))
        .multipart(form)
        .send()
        .await
    {
        Ok(response) => {
            if response.status().is_success() {
                match response.json::<serde_json::Value>().await {
                    Ok(json) => {
                        let text = json
                            .get("text")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();
                        Ok(VoiceTranscriptionResult { text })
                    }
                    Err(e) => {
                        error!("Failed to parse transcription response: {}", e);
                        Err(format!("Invalid response: {}", e))
                    }
                }
            } else {
                let status = response.status();
                let body = response.text().await.unwrap_or_default();
                error!("Transcription failed: {} - {}", status, body);
                Err(format!("Transcription failed: {}", status))
            }
        }
        Err(e) => {
            error!("Failed to send transcription request: {}", e);
            Err(format!("Network error: {}", e))
        }
    }
}

// Browser attach webview command
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserAttachWebviewInput {
    pub thread_id: String,
    pub tab_id: String,
    pub web_contents_id: i32,
}

#[tauri::command]
pub async fn browser_attach_webview(
    browser: State<'_, BrowserManager>,
    input: BrowserAttachWebviewInput,
) -> Result<ThreadBrowserState, String> {
    // In a full implementation, this would attach a webview to the browser tab
    info!("Attaching webview for tab: {}", input.tab_id);
    browser.get_state(BrowserThreadInput {
        thread_id: input.thread_id,
    }).await.map_err(|e| e.to_string())
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
