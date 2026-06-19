use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::State;

pub struct UpdateState {
    state: Arc<Mutex<UpdateInfo>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateInfo {
    pub available: bool,
    pub version: String,
    pub download_progress: f64,
    pub downloaded: bool,
}

#[derive(Debug, Serialize)]
pub struct UpdateActionResult {
    pub success: bool,
    pub message: String,
}

impl UpdateState {
    pub fn new() -> Self {
        Self {
            state: Arc::new(Mutex::new(UpdateInfo {
                available: false,
                version: String::new(),
                download_progress: 0.0,
                downloaded: false,
            })),
        }
    }
}

#[tauri::command]
pub async fn get_update_state(state: State<'_, UpdateState>) -> Result<UpdateInfo, String> {
    let update_info = state.state.lock().map_err(|e| e.to_string())?;
    Ok(update_info.clone())
}

#[tauri::command]
pub async fn check_for_updates(state: State<'_, UpdateState>) -> Result<UpdateInfo, String> {
    // Placeholder - actual update check would use tauri-plugin-updater
    let mut update_info = state.state.lock().map_err(|e| e.to_string())?;
    update_info.available = false;
    Ok(update_info.clone())
}

#[tauri::command]
pub async fn download_update(state: State<'_, UpdateState>) -> Result<UpdateActionResult, String> {
    let mut update_info = state.state.lock().map_err(|e| e.to_string())?;
    update_info.downloaded = true;
    Ok(UpdateActionResult {
        success: true,
        message: "Update downloaded".to_string(),
    })
}

#[tauri::command]
pub async fn install_update() -> Result<UpdateActionResult, String> {
    // Placeholder - actual install would restart the app
    Ok(UpdateActionResult {
        success: true,
        message: "Installing update".to_string(),
    })
}
