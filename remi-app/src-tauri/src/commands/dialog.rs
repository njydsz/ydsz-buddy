use serde::{Deserialize, Serialize};
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub async fn pick_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let dialog = app.dialog();
    let folder = dialog.file().blocking_pick_folder();
    Ok(folder.map(|p| p.to_string_lossy().to_string()))
}

#[tauri::command]
pub async fn save_file(
    app: tauri::AppHandle,
    default_filename: String,
    contents: String,
    filters: Option<Vec<FileFilter>>,
) -> Result<Option<String>, String> {
    let dialog = app.dialog();
    let mut file_dialog = dialog.file().set_file_name(&default_filename);
    
    if let Some(filter_list) = filters {
        for filter in filter_list {
            file_dialog = file_dialog.add_filter(&filter.name, &filter.extensions);
        }
    }
    
    let path = file_dialog.blocking_save_file();
    
    if let Some(path) = path {
        std::fs::write(&path, contents).map_err(|e| e.to_string())?;
        Ok(Some(path.to_string_lossy().to_string()))
    } else {
        Ok(None)
    }
}

#[derive(Debug, Deserialize)]
pub struct FileFilter {
    pub name: String,
    pub extensions: Vec<String>,
}

#[tauri::command]
pub async fn show_confirm(app: tauri::AppHandle, message: String) -> Result<bool, String> {
    let dialog = app.dialog();
    let confirmed = dialog.message(&message)
        .title("确认")
        .kind(tauri_plugin_dialog::MessageDialogKind::Info)
        .blocking_show();
    Ok(confirmed)
}

#[tauri::command]
pub async fn show_message(app: tauri::AppHandle, message: String, title: Option<String>) -> Result<(), String> {
    let dialog = app.dialog();
    let mut msg = dialog.message(&message);
    if let Some(t) = title {
        msg = msg.title(&t);
    }
    msg.blocking_show();
    Ok(())
}
