use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use tauri::State;

pub struct TerminalState {
    terminals: Arc<Mutex<HashMap<String, TerminalSession>>>,
}

struct TerminalSession {
    reader: Box<dyn Read + Send>,
    writer: Box<dyn Write + Send>,
    process: Box<dyn portable_pty::Child + Send>,
}

impl TerminalState {
    pub fn new() -> Self {
        Self {
            terminals: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

#[tauri::command]
pub async fn create_terminal(
    state: State<'_, TerminalState>,
    cwd: String,
    shell: Option<String>,
) -> Result<String, String> {
    let pty_system = native_pty_system();
    let pty_pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let shell_cmd = shell.unwrap_or_else(|| {
        if cfg!(windows) {
            "cmd.exe".to_string()
        } else {
            std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
        }
    });

    let mut cmd = CommandBuilder::new(&shell_cmd);
    cmd.cwd(std::path::Path::new(&cwd));

    let child = pty_pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    let mut reader = pty_pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pty_pair.master.take_writer().map_err(|e| e.to_string())?;

    let terminal_id = uuid::Uuid::new_v4().to_string();
    
    let session = TerminalSession {
        reader: Box::new(reader),
        writer: Box::new(writer),
        process: child,
    };

    let mut terminals = state.terminals.lock().map_err(|e| e.to_string())?;
    terminals.insert(terminal_id.clone(), session);

    Ok(terminal_id)
}

#[tauri::command]
pub async fn write_terminal(
    state: State<'_, TerminalState>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    let mut terminals = state.terminals.lock().map_err(|e| e.to_string())?;
    if let Some(session) = terminals.get_mut(&session_id) {
        session.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
        session.writer.flush().map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Terminal session not found".to_string())
    }
}

#[tauri::command]
pub async fn resize_terminal(
    state: State<'_, TerminalState>,
    session_id: String,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    // Note: resize implementation depends on portable-pty version
    // This is a placeholder - actual resize needs PTY master reference
    Ok(())
}

#[tauri::command]
pub async fn close_terminal(
    state: State<'_, TerminalState>,
    session_id: String,
) -> Result<(), String> {
    let mut terminals = state.terminals.lock().map_err(|e| e.to_string())?;
    if let Some(mut session) = terminals.remove(&session_id) {
        let _ = session.process.kill();
        Ok(())
    } else {
        Ok(())
    }
}
