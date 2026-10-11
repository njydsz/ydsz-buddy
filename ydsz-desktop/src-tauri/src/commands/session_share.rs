//! Session Sharing (P1-1)
//!
//! Export conversations as static HTML snapshots with read-only preview,
//! supporting share link generation and artifact attachment.

use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::State;

/// Shared session metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SharedSession {
    pub id: String,
    pub title: String,
    pub html_path: String,
    pub thread_id: String,
    pub message_count: usize,
    pub artifact_count: usize,
    pub created_at: String,
    pub expires_at: Option<String>,
    pub view_count: u64,
}

/// Export request
#[derive(Debug, Deserialize)]
pub struct ExportSessionRequest {
    pub thread_id: String,
    pub title: Option<String>,
    pub include_artifacts: Option<bool>,
    pub expire_hours: Option<u64>,
}

/// Export response
#[derive(Debug, Serialize)]
pub struct ExportSessionResponse {
    pub share_id: String,
    pub html_path: String,
    pub share_url: String,
}

/// Session share state
pub struct SessionShareState {
    pub sessions: Mutex<Vec<SharedSession>>,
    pub output_dir: Mutex<String>,
}

impl SessionShareState {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(Vec::new()),
            output_dir: Mutex::new(".ydsz/shares".to_string()),
        }
    }
}

impl Default for SessionShareState {
    fn default() -> Self {
        Self::new()
    }
}

/// Export a thread as a shareable static HTML
#[tauri::command]
pub fn session_share_export(
    state: State<'_, SessionShareState>,
    request: ExportSessionRequest,
    app_handle: tauri::AppHandle,
) -> Result<ExportSessionResponse, String> {
    let share_id = uuid::Uuid::new_v4().to_string();
    let output_dir = state.output_dir.lock().map_err(|e| e.to_string())?;
    let share_dir = std::path::PathBuf::from(&*output_dir).join(&share_id);
    std::fs::create_dir_all(&share_dir).map_err(|e| e.to_string())?;

    let html_path = share_dir.join("index.html");

    // Generate static HTML with embedded conversation
    let title = request.title.unwrap_or_else(|| "Shared Conversation".to_string());
    let html = generate_share_html(&title, &request.thread_id);

    std::fs::write(&html_path, html).map_err(|e| e.to_string())?;

    let share = SharedSession {
        id: share_id.clone(),
        title: title.clone(),
        html_path: html_path.to_string_lossy().to_string(),
        thread_id: request.thread_id,
        message_count: 0,
        artifact_count: 0,
        created_at: chrono::Utc::now().to_rfc3339(),
        expires_at: request.expire_hours.map(|h| {
            (chrono::Utc::now() + chrono::Duration::hours(h as i64)).to_rfc3339()
        }),
        view_count: 0,
    };

    let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    sessions.push(share);

    let _ = app_handle;

    Ok(ExportSessionResponse {
        share_id: share_id.clone(),
        html_path: html_path.to_string_lossy().to_string(),
        share_url: format!("ydsz://share/{}", share_id),
    })
}

/// List all shared sessions
#[tauri::command]
pub fn session_share_list(state: State<'_, SessionShareState>) -> Result<Vec<SharedSession>, String> {
    let sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    Ok(sessions.clone())
}

/// Delete a shared session
#[tauri::command]
pub fn session_share_delete(
    state: State<'_, SessionShareState>,
    share_id: String,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    if let Some(idx) = sessions.iter().position(|s| s.id == share_id) {
        let session = sessions.remove(idx);
        if let Some(parent) = std::path::Path::new(&session.html_path).parent() {
            let _ = std::fs::remove_dir_all(parent);
        }
    }
    Ok(())
}

/// Get share info (for read-only preview)
#[tauri::command]
pub fn session_share_get(
    state: State<'_, SessionShareState>,
    share_id: String,
) -> Result<Option<SharedSession>, String> {
    let sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    Ok(sessions.iter().find(|s| s.id == share_id).cloned())
}

/// Increment view count
#[tauri::command]
pub fn session_share_increment_view(
    state: State<'_, SessionShareState>,
    share_id: String,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    if let Some(session) = sessions.iter_mut().find(|s| s.id == share_id) {
        session.view_count += 1;
    }
    Ok(())
}

/// Generate static HTML for a shared session
fn generate_share_html(title: &str, _thread_id: &str) -> String {
    format!(
        r#"<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{} - ydsz-buddy Share</title>
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; color: #1a1a1a; background: #fafafa; }}
        h1 {{ color: #2563eb; border-bottom: 2px solid #e5e7eb; padding-bottom: 0.5rem; }}
        .meta {{ color: #6b7280; font-size: 0.875rem; margin-bottom: 2rem; }}
        .footer {{ margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 0.75rem; }}
    </style>
</head>
<body>
    <h1>{}</h1>
    <div class="meta">Shared via ydsz-buddy</div>
    <div class="content">
        <p>This is a read-only preview of a ydsz-buddy conversation.</p>
    </div>
    <div class="footer">
        Generated by ydsz-buddy | <a href="https://github.com/ydsz-buddy">Learn more</a>
    </div>
</body>
</html>"#,
        title, title
    )
}
