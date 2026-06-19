use tauri::Manager;

#[tauri::command]
pub async fn set_theme(app: tauri::AppHandle, theme: String) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("Window not found")?;
    
    if theme == "dark" {
        window.set_theme(Some(tauri::Theme::Dark)).map_err(|e| e.to_string())?;
    } else {
        window.set_theme(Some(tauri::Theme::Light)).map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

#[tauri::command]
pub async fn show_in_folder(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .args(["/select,", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(["-R", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

#[tauri::command]
pub async fn open_external(url: String) -> Result<(), String> {
    open::that(&url).map_err(|e| e.to_string())
}
