//! Project Memory System (P1-2)
//!
//! Cross-session memory with project-level .ydsz/memory.md auto-generation
//! and context injection into Agent conversations.

use std::collections::HashMap;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::State;

/// A single memory entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryEntry {
    pub id: String,
    pub project_path: String,
    pub content: String,
    pub tags: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Project memory summary
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectMemory {
    pub project_path: String,
    pub entries: Vec<MemoryEntry>,
    pub auto_summary: Option<String>,
    pub memory_file_path: Option<String>,
}

/// Memory engine state
pub struct MemoryState {
    pub entries: Mutex<HashMap<String, Vec<MemoryEntry>>>, // project_path -> entries
    pub summaries: Mutex<HashMap<String, String>>,         // project_path -> auto summary
}

impl MemoryState {
    pub fn new() -> Self {
        Self {
            entries: Mutex::new(HashMap::new()),
            summaries: Mutex::new(HashMap::new()),
        }
    }
}

impl Default for MemoryState {
    fn default() -> Self {
        Self::new()
    }
}

/// Create a memory entry
#[derive(Debug, Deserialize)]
pub struct CreateMemoryRequest {
    pub project_path: String,
    pub content: String,
    pub tags: Option<Vec<String>>,
}

/// Update a memory entry
#[derive(Debug, Deserialize)]
pub struct UpdateMemoryRequest {
    pub entry_id: String,
    pub project_path: String,
    pub content: String,
    pub tags: Option<Vec<String>>,
}

/// List memory entries for a project
#[tauri::command]
pub fn memory_list(
    state: State<'_, MemoryState>,
    project_path: String,
) -> Result<Vec<MemoryEntry>, String> {
    let entries = state.entries.lock().map_err(|e| e.to_string())?;
    Ok(entries.get(&project_path).cloned().unwrap_or_default())
}

/// Create a new memory entry
#[tauri::command]
pub fn memory_create(
    state: State<'_, MemoryState>,
    request: CreateMemoryRequest,
) -> Result<MemoryEntry, String> {
    let mut entries = state.entries.lock().map_err(|e| e.to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let entry = MemoryEntry {
        id: id.clone(),
        project_path: request.project_path.clone(),
        content: request.content,
        tags: request.tags.unwrap_or_default(),
        created_at: now.clone(),
        updated_at: now,
    };
    entries
        .entry(request.project_path)
        .or_default()
        .push(entry.clone());
    Ok(entry)
}

/// Update a memory entry
#[tauri::command]
pub fn memory_update(
    state: State<'_, MemoryState>,
    request: UpdateMemoryRequest,
) -> Result<MemoryEntry, String> {
    let mut entries = state.entries.lock().map_err(|e| e.to_string())?;
    let project_entries = entries
        .get_mut(&request.project_path)
        .ok_or("Project not found")?;
    let entry = project_entries
        .iter_mut()
        .find(|e| e.id == request.entry_id)
        .ok_or("Entry not found")?;
    entry.content = request.content;
    entry.tags = request.tags.unwrap_or_default();
    entry.updated_at = chrono::Utc::now().to_rfc3339();
    Ok(entry.clone())
}

/// Delete a memory entry
#[tauri::command]
pub fn memory_delete(
    state: State<'_, MemoryState>,
    project_path: String,
    entry_id: String,
) -> Result<(), String> {
    let mut entries = state.entries.lock().map_err(|e| e.to_string())?;
    if let Some(project_entries) = entries.get_mut(&project_path) {
        project_entries.retain(|e| e.id != entry_id);
    }
    Ok(())
}

/// Get auto-generated context summary for injection
#[tauri::command]
pub fn memory_get_context_injection(
    state: State<'_, MemoryState>,
    project_path: String,
) -> Result<Option<String>, String> {
    let entries = state.entries.lock().map_err(|e| e.to_string())?;
    let summaries = state.summaries.lock().map_err(|e| e.to_string())?;

    if let Some(memory_entries) = entries.get(&project_path) {
        if memory_entries.is_empty() {
            return Ok(None);
        }
        let summary = summaries.get(&project_path).cloned().unwrap_or_else(|| {
            let mut ctx = String::from("## Project Memory\n");
            for entry in memory_entries {
                ctx.push_str(&format!("- [{}] {}\n", entry.tags.join(", "), entry.content));
            }
            ctx
        });
        return Ok(Some(summary));
    }
    Ok(None)
}

/// Set auto summary (called by Agent after summarizing)
#[tauri::command]
pub fn memory_set_summary(
    state: State<'_, MemoryState>,
    project_path: String,
    summary: String,
) -> Result<(), String> {
    let mut summaries = state.summaries.lock().map_err(|e| e.to_string())?;
    summaries.insert(project_path, summary);
    Ok(())
}

/// List all projects with memory
#[tauri::command]
pub fn memory_list_projects(state: State<'_, MemoryState>) -> Result<Vec<String>, String> {
    let entries = state.entries.lock().map_err(|e| e.to_string())?;
    Ok(entries.keys().cloned().collect())
}
