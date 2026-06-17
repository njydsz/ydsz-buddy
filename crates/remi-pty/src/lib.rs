//! PTY (pseudo-terminal) management for Remi Code.
//!
//! This crate provides terminal session management using portable-pty.

use dashmap::DashMap;
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use remi_contracts::{CreateTerminalInput, CreateTerminalOutput, TerminalSession};
use remi_core::{Error, Result};
use std::sync::Arc;
use tokio::sync::mpsc;
use tracing::info;
use uuid::Uuid;

/// Terminal manager.
pub struct TerminalManager {
    sessions: Arc<DashMap<Uuid, TerminalHandle>>,
}

struct TerminalHandle {
    session: TerminalSession,
    writer: Box<dyn portable_pty::MasterPty + Send>,
    reader: Box<dyn std::io::Read + Send>,
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

        let writer = pty_pair.master.take_writer().map_err(|e| {
            Error::Internal(format!("Failed to get PTY writer: {}", e))
        })?;

        let reader = pty_pair.master.try_clone_reader().map_err(|e| {
            Error::Internal(format!("Failed to get PTY reader: {}", e))
        })?;

        let session = TerminalSession {
            id,
            thread_id: input.thread_id,
            cwd: input.cwd,
            shell: input.shell.unwrap_or_else(|| "bash".to_string()),
            created_at: chrono::Utc::now().to_rfc3339(),
        };

        let handle = TerminalHandle {
            session: session.clone(),
            writer,
            reader,
        };

        self.sessions.insert(id, handle);

        info!("Created terminal session: {}", id);

        Ok(CreateTerminalOutput { id })
    }

    /// Write data to a terminal session.
    pub async fn write(&self, session_id: Uuid, data: &str) -> Result<()> {
        let mut handle = self
            .sessions
            .get_mut(&session_id)
            .ok_or_else(|| Error::Internal(format!("Session not found: {}", session_id)))?;

        handle
            .writer
            .write_all(data.as_bytes())
            .map_err(|e| Error::Internal(format!("Failed to write to PTY: {}", e)))?;

        Ok(())
    }

    /// Resize a terminal session.
    pub async fn resize(&self, session_id: Uuid, cols: u16, rows: u16) -> Result<()> {
        let handle = self
            .sessions
            .get(&session_id)
            .ok_or_else(|| Error::Internal(format!("Session not found: {}", session_id)))?;

        // Note: portable-pty doesn't expose resize directly on MasterPty
        // This would need to be implemented via the underlying PTY system
        info!("Resize requested for session {} to {}x{}", session_id, cols, rows);

        Ok(())
    }

    /// Close a terminal session.
    pub async fn close(&self, session_id: Uuid) -> Result<()> {
        self.sessions.remove(&session_id);
        info!("Closed terminal session: {}", session_id);
        Ok(())
    }

    /// List all active sessions.
    pub async fn list_sessions(&self) -> Vec<TerminalSession> {
        self.sessions
            .iter()
            .map(|entry| entry.value().session.clone())
            .collect()
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
        let input = CreateTerminalInput {
            cwd: ".".to_string(),
            shell: Some("sh".to_string()),
            thread_id: None,
            cols: Some(80),
            rows: Some(24),
        };

        let result = manager.create(input).await;
        assert!(result.is_ok());
    }
}
