use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, Mutex};
use tauri::State;

pub struct WorkspaceState {
    projects: Arc<Mutex<Vec<ProjectInfo>>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectInfo {
    pub id: String,
    pub path: String,
    pub name: String,
}

impl WorkspaceState {
    pub fn new() -> Self {
        Self {
            projects: Arc::new(Mutex::new(Vec::new())),
        }
    }
}

#[tauri::command]
pub async fn list_projects(state: State<'_, WorkspaceState>) -> Result<Vec<ProjectInfo>, String> {
    let projects = state.projects.lock().map_err(|e| e.to_string())?;
    Ok(projects.clone())
}

#[tauri::command]
pub async fn add_project(
    state: State<'_, WorkspaceState>,
    path: String,
) -> Result<(), String> {
    let mut projects = state.projects.lock().map_err(|e| e.to_string())?;
    
    let name = Path::new(&path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Unknown")
        .to_string();
    
    let project = ProjectInfo {
        id: uuid::Uuid::new_v4().to_string(),
        path: path.clone(),
        name,
    };
    
    projects.push(project);
    Ok(())
}

#[tauri::command]
pub async fn remove_project(
    state: State<'_, WorkspaceState>,
    project_id: String,
) -> Result<(), String> {
    let mut projects = state.projects.lock().map_err(|e| e.to_string())?;
    projects.retain(|p| p.id != project_id);
    Ok(())
}

#[tauri::command]
pub async fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn write_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| e.to_string())
}
