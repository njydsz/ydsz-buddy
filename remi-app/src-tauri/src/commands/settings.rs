use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::State;

pub struct SettingsState {
    settings: Arc<Mutex<Value>>,
    settings_path: PathBuf,
}

impl SettingsState {
    pub fn new() -> Self {
        let settings_path = dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("remi-code")
            .join("settings.json");
        
        let settings = std::fs::read_to_string(&settings_path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_else(|| Value::Object(serde_json::Map::new()));
        
        Self {
            settings: Arc::new(Mutex::new(settings)),
            settings_path,
        }
    }
}

#[tauri::command]
pub async fn get_settings(state: State<'_, SettingsState>) -> Result<Value, String> {
    let settings = state.settings.lock().map_err(|e| e.to_string())?;
    Ok(settings.clone())
}

#[tauri::command]
pub async fn save_settings(
    state: State<'_, SettingsState>,
    settings: Value,
) -> Result<(), String> {
    let mut current = state.settings.lock().map_err(|e| e.to_string())?;
    *current = settings;
    
    if let Some(parent) = state.settings_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    
    let json = serde_json::to_string_pretty(&*current).map_err(|e| e.to_string())?;
    std::fs::write(&state.settings_path, json).map_err(|e| e.to_string())?;
    
    Ok(())
}
