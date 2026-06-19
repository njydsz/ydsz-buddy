use serde::{Deserialize, Serialize};
use tauri::Manager;

#[derive(Debug, Deserialize)]
pub struct ContextMenuItem {
    pub id: String,
    pub label: String,
    pub enabled: Option<bool>,
}

#[tauri::command]
pub async fn show_context_menu(
    app: tauri::AppHandle,
    items: Vec<ContextMenuItem>,
    position: Option<Position>,
) -> Result<Option<String>, String> {
    // Note: Tauri 2.0 context menu implementation would go here
    // For now, return None as placeholder
    Ok(None)
}

#[derive(Debug, Deserialize)]
pub struct Position {
    pub x: f64,
    pub y: f64,
}
