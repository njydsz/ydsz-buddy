//! Browser Recorder (P1-5)
//!
//! CDP-based screenshot sequence recording with timeline playback.
//! Captures browser panel screenshots at intervals and stores them
//! as a replayable sequence for debugging and demonstration.

use std::collections::HashMap;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::State;

/// Recording session
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordingSession {
    pub id: String,
    pub name: String,
    pub url: String,
    pub status: RecordingStatus,
    pub frame_count: usize,
    pub duration_ms: Option<u64>,
    pub output_path: String,
    pub created_at: String,
    pub finished_at: Option<String>,
}

/// Recording status
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RecordingStatus {
    Recording,
    Paused,
    Completed,
    Failed,
}

/// A single frame in a recording
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordingFrame {
    pub index: usize,
    pub timestamp_ms: u64,
    pub screenshot_path: Option<String>,
    pub action_description: Option<String>,
}

/// Recorder state
pub struct BrowserRecorderState {
    pub sessions: Mutex<HashMap<String, RecordingSession>>,
    pub active_session: Mutex<Option<String>>,
    pub output_dir: Mutex<String>,
}

impl BrowserRecorderState {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
            active_session: Mutex::new(None),
            output_dir: Mutex::new(".ydsz/recordings".to_string()),
        }
    }
}

impl Default for BrowserRecorderState {
    fn default() -> Self {
        Self::new()
    }
}

/// Start a recording session
#[derive(Debug, Deserialize)]
pub struct StartRecordingRequest {
    pub name: String,
    pub url: String,
}

/// Start a recording session
#[tauri::command]
pub fn browser_recorder_start(
    state: State<'_, BrowserRecorderState>,
    request: StartRecordingRequest,
) -> Result<RecordingSession, String> {
    let mut active = state.active_session.lock().map_err(|e| e.to_string())?;
    if active.is_some() {
        return Err("A recording session is already active".to_string());
    }

    let id = uuid::Uuid::new_v4().to_string();
    let output_dir = state.output_dir.lock().map_err(|e| e.to_string())?;
    let session_dir = std::path::PathBuf::from(&*output_dir).join(&id);
    std::fs::create_dir_all(&session_dir).map_err(|e| e.to_string())?;
    drop(output_dir);

    let session = RecordingSession {
        id: id.clone(),
        name: request.name,
        url: request.url,
        status: RecordingStatus::Recording,
        frame_count: 0,
        duration_ms: None,
        output_path: session_dir.to_string_lossy().to_string(),
        created_at: chrono::Utc::now().to_rfc3339(),
        finished_at: None,
    };

    let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    sessions.insert(id.clone(), session.clone());
    *active = Some(id);

    Ok(session)
}

/// Record a frame (append screenshot path to session)
#[tauri::command]
pub fn browser_recorder_add_frame(
    state: State<'_, BrowserRecorderState>,
    session_id: String,
    screenshot_path: String,
    timestamp_ms: u64,
    action_description: Option<String>,
) -> Result<usize, String> {
    let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    let session = sessions
        .get_mut(&session_id)
        .ok_or("Session not found")?;

    if session.status != RecordingStatus::Recording {
        return Err("Session is not recording".to_string());
    }

    session.frame_count += 1;
    let frame = RecordingFrame {
        index: session.frame_count - 1,
        timestamp_ms,
        screenshot_path: Some(screenshot_path),
        action_description,
    };

    // Save frame metadata
    let frames_path = std::path::PathBuf::from(&session.output_path).join("frames.jsonl");
    let frame_json = serde_json::to_string(&frame).map_err(|e| e.to_string())?;
    use std::io::Write;
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&frames_path)
        .map_err(|e| e.to_string())?;
    writeln!(file, "{}", frame_json).map_err(|e| e.to_string())?;

    Ok(session.frame_count)
}

/// Pause a recording session
#[tauri::command]
pub fn browser_recorder_pause(
    state: State<'_, BrowserRecorderState>,
    session_id: String,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    let session = sessions
        .get_mut(&session_id)
        .ok_or("Session not found")?;
    session.status = RecordingStatus::Paused;
    Ok(())
}

/// Resume a recording session
#[tauri::command]
pub fn browser_recorder_resume(
    state: State<'_, BrowserRecorderState>,
    session_id: String,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    let session = sessions
        .get_mut(&session_id)
        .ok_or("Session not found")?;
    session.status = RecordingStatus::Recording;
    Ok(())
}

/// Stop a recording session
#[tauri::command]
pub fn browser_recorder_stop(
    state: State<'_, BrowserRecorderState>,
    session_id: String,
) -> Result<RecordingSession, String> {
    let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    let session = sessions
        .get_mut(&session_id)
        .ok_or("Session not found")?;

    session.status = RecordingStatus::Completed;
    session.finished_at = Some(chrono::Utc::now().to_rfc3339());

    let start = chrono::DateTime::parse_from_rfc3339(&session.created_at)
        .map_err(|e| e.to_string())?;
    let end = chrono::Utc::now();
    session.duration_ms = Some((end - start.to_utc()).num_milliseconds().max(0) as u64);

    let session_clone = session.clone();

    let mut active = state.active_session.lock().map_err(|e| e.to_string())?;
    if active.as_ref() == Some(&session_id) {
        *active = None;
    }

    Ok(session_clone)
}

/// Get recording session info
#[tauri::command]
pub fn browser_recorder_get(
    state: State<'_, BrowserRecorderState>,
    session_id: String,
) -> Result<Option<RecordingSession>, String> {
    let sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    Ok(sessions.get(&session_id).cloned())
}

/// List all recording sessions
#[tauri::command]
pub fn browser_recorder_list(state: State<'_, BrowserRecorderState>) -> Result<Vec<RecordingSession>, String> {
    let sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    Ok(sessions.values().cloned().collect())
}

/// Delete a recording session
#[tauri::command]
pub fn browser_recorder_delete(
    state: State<'_, BrowserRecorderState>,
    session_id: String,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    if let Some(session) = sessions.remove(&session_id) {
        let _ = std::fs::remove_dir_all(&session.output_path);
    }
    Ok(())
}

/// Get active session (if any)
#[tauri::command]
pub fn browser_recorder_active(state: State<'_, BrowserRecorderState>) -> Result<Option<RecordingSession>, String> {
    let active = state.active_session.lock().map_err(|e| e.to_string())?;
    if let Some(ref id) = *active {
        let sessions = state.sessions.lock().map_err(|e| e.to_string())?;
        return Ok(sessions.get(id).cloned());
    }
    Ok(None)
}

/// Get output directory for recordings
#[tauri::command]
pub fn browser_recorder_output_dir(state: State<'_, BrowserRecorderState>) -> Result<String, String> {
    let output_dir = state.output_dir.lock().map_err(|e| e.to_string())?;
    Ok(output_dir.clone())
}
