//! PTY (pseudo-terminal) management for Remi Code.
//!
//! This crate provides terminal session management using portable-pty.

use dashmap::DashMap;
use portable_pty::{CommandBuilder, PtySize, native_pty_system};
use remi_contracts::{CreateTerminalInput, CreateTerminalOutput, TerminalSession};
use remi_core::{Error, Result};
use std::sync::Arc;
use tokio::sync::{Mutex, broadcast};
use tracing::{info, warn};
use uuid::Uuid;

/// Terminal manager.
#[derive(Clone)]
pub struct TerminalManager {
    sessions: Arc<DashMap<Uuid, TerminalHandle>>,
}

#[derive(Clone)]
#[allow(dead_code)]
struct TerminalHandle {
    session: TerminalSession,
    writer: Arc<Mutex<Box<dyn std::io::Write + Send>>>,
    reader: Arc<Mutex<Box<dyn std::io::Read + Send>>>,
    output_tx: broadcast::Sender<String>,
    size: PtySize,
    child: Arc<Mutex<Box<dyn portable_pty::Child + Send>>>,
    reader_task: Arc<tokio::sync::Notify>,
}

impl TerminalManager {
    /// Create a new terminal manager.
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(DashMap::new()),
        }
    }

    /// Create a new terminal session.
    pub async fn create(&self, input: CreateTerminalInput) -> Result<CreateTerminalOutput> {
        let id = Uuid::new_v4();
        let cols = input.cols.unwrap_or(80);
        let rows = input.rows.unwrap_or(24);

        let pty_system = native_pty_system();
        let pty_pair = pty_system
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| Error::Internal(format!("Failed to create PTY: {}", e)))?;

        let mut cmd = CommandBuilder::new(input.shell.as_deref().unwrap_or("bash"));
        cmd.cwd(&input.cwd);

        let child = pty_pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| Error::Internal(format!("Failed to spawn command: {}", e)))?;

        let writer = pty_pair
            .master
            .take_writer()
            .map_err(|e| Error::Internal(format!("Failed to get PTY writer: {}", e)))?;

        let reader = pty_pair
            .master
            .try_clone_reader()
            .map_err(|e| Error::Internal(format!("Failed to get PTY reader: {}", e)))?;

        let size = PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        };

        let session = TerminalSession {
            id,
            thread_id: input.thread_id,
            cwd: input.cwd,
            shell: input.shell.unwrap_or_else(|| "bash".to_string()),
            created_at: chrono::Utc::now().to_rfc3339(),
        };

        let (output_tx, _) = broadcast::channel(1000);
        let reader_task = Arc::new(tokio::sync::Notify::new());

        let handle = TerminalHandle {
            session: session.clone(),
            writer: Arc::new(Mutex::new(writer)),
            reader: Arc::new(Mutex::new(reader)),
            output_tx: output_tx.clone(),
            size,
            child: Arc::new(Mutex::new(child)),
            reader_task: reader_task.clone(),
        };

        // Spawn reader task to forward PTY output to subscribers
        let reader_handle = handle.reader.clone();
        let output_tx_clone = output_tx.clone();
        let session_id_clone = id;
        tokio::spawn(async move {
            let mut buf = [0u8; 4096];
            loop {
                let n = {
                    let mut reader = reader_handle.lock().await;
                    match std::io::Read::read(&mut *reader, &mut buf) {
                        Ok(n) => n,
                        Err(_) => break,
                    }
                };
                if n == 0 {
                    break;
                }
                if let Ok(text) = String::from_utf8(buf[..n].to_vec()) {
                    let _ = output_tx_clone.send(text);
                }
            }
            info!("Reader task ended for session: {}", session_id_clone);
        });

        self.sessions.insert(id, handle);

        info!("Created terminal session: {}", id);

        Ok(CreateTerminalOutput { id })
    }

    /// Write data to a terminal session.
    pub async fn write(&self, session_id: Uuid, data: &str) -> Result<()> {
        let handle = self
            .sessions
            .get(&session_id)
            .ok_or_else(|| Error::Internal(format!("Session not found: {}", session_id)))?;

        let mut writer = handle.writer.lock().await;

        use std::io::Write;
        writer
            .write_all(data.as_bytes())
            .map_err(|e| Error::Internal(format!("Failed to write to PTY: {}", e)))?;

        Ok(())
    }

    /// Resize a terminal session.
    pub async fn resize(&self, session_id: Uuid, cols: u16, rows: u16) -> Result<()> {
        let mut handle = self
            .sessions
            .get_mut(&session_id)
            .ok_or_else(|| Error::Internal(format!("Session not found: {}", session_id)))?;

        handle.size = PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        };

        info!(
            "Resized terminal session {} to {}x{}",
            session_id, cols, rows
        );

        Ok(())
    }

    /// Close a terminal session.
    pub async fn close(&self, session_id: Uuid) -> Result<()> {
        if let Some((_, handle)) = self.sessions.remove(&session_id) {
            // Drop writer to signal EOF
            drop(handle.writer);
            info!("Closed terminal session: {}", session_id);
        } else {
            warn!("Attempted to close non-existent session: {}", session_id);
        }
        Ok(())
    }

    /// List all active sessions.
    pub async fn list_sessions(&self) -> Vec<TerminalSession> {
        self.sessions
            .iter()
            .map(|entry| entry.value().session.clone())
            .collect()
    }

    /// Subscribe to terminal output.
    pub async fn subscribe_output(&self, session_id: Uuid) -> Result<broadcast::Receiver<String>> {
        let handle = self
            .sessions
            .get(&session_id)
            .ok_or_else(|| Error::Internal(format!("Session not found: {}", session_id)))?;

        Ok(handle.output_tx.subscribe())
    }

    /// Clear terminal history (send clear command to PTY).
    pub async fn clear(&self, session_id: Uuid) -> Result<()> {
        let handle = self
            .sessions
            .get(&session_id)
            .ok_or_else(|| Error::Internal(format!("Session not found: {}", session_id)))?;

        let mut writer = handle.writer.lock().await;
        // Send ANSI clear screen command
        use std::io::Write;
        writer
            .write_all(b"\x1b[2J\x1b[H")
            .map_err(|e| Error::Internal(format!("Failed to clear terminal: {}", e)))?;

        info!("Cleared terminal session: {}", session_id);
        Ok(())
    }

    /// Restart a terminal session with the same configuration.
    pub async fn restart(&self, session_id: Uuid) -> Result<()> {
        let handle = self
            .sessions
            .get(&session_id)
            .ok_or_else(|| Error::Internal(format!("Session not found: {}", session_id)))?;

        let old_session = handle.session.clone();
        let old_size = handle.size;

        // Close the old session
        drop(handle);
        self.sessions.remove(&session_id);

        // Create a new session with the same configuration
        let input = CreateTerminalInput {
            cwd: old_session.cwd,
            shell: Some(old_session.shell),
            thread_id: old_session.thread_id,
            cols: Some(old_size.cols),
            rows: Some(old_size.rows),
        };

        let new_output = self.create(input).await?;

        info!(
            "Restarted terminal session {} -> {}",
            session_id, new_output.id
        );
        Ok(())
    }
}

impl Default for TerminalManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_create_terminal() {
        let manager = TerminalManager::new();
        let shell = if cfg!(windows) {
            "cmd.exe".to_string()
        } else {
            "sh".to_string()
        };
        let input = CreateTerminalInput {
            cwd: ".".to_string(),
            shell: Some(shell),
            thread_id: None,
            cols: Some(80),
            rows: Some(24),
        };

        let result = manager.create(input).await;
        assert!(result.is_ok(), "Failed to create terminal: {:?}", result);
    }
}
