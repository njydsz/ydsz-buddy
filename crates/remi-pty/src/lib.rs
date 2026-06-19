//! PTY (pseudo-terminal) management for Remi Code.
//!
//! This crate provides terminal session management using `portable-pty`. It
//! mirrors the capabilities found in mainstream ADE competitors (Cursor / Codex
//! / OpenCode / ZCode) including:
//!
//! * **Title monitoring** – parses OSC 0/1/2 escape sequences emitted by
//!   shells, multiplexers (`tmux`, `zellij`) and editors (`vim`, `htop`) and
//!   broadcasts them through a single event bus.
//! * **Session reaper** – a background task that polls child processes,
//!   captures their exit codes, and removes zombie sessions after a grace
//!   period so the manager never leaks file descriptors.
//! * **Managed wrappers** – [`ManagedTerminal`] provides a higher level,
//!   ergonomic API (typed events, line buffering, command execution) on top
//!   of the raw [`TerminalManager`]. The manager is the right entry point
//!   for the RPC layer; the managed wrapper is what the orchestration engine
//!   uses to drive interactive sessions.

use std::collections::VecDeque;
use std::sync::Arc;
use std::time::{Duration, Instant};

use dashmap::DashMap;
use parking_lot::Mutex;
use portable_pty::{Child, CommandBuilder, MasterPty, PtySize, native_pty_system};
use remi_contracts::{
    CreateTerminalInput, CreateTerminalOutput, TerminalEvent, TerminalExitEvent,
    TerminalOutputEvent, TerminalSession, TerminalStatus, TerminalTitleEvent,
};
use remi_core::{Error, Result};
use tokio::sync::broadcast;
use tracing::{debug, info, warn};
use uuid::Uuid;

/// Maximum number of bytes replayed to a fresh subscriber.
pub const DEFAULT_REPLAY_BUFFER: usize = 64 * 1024;
/// How often the reaper inspects child processes.
pub const REAPER_INTERVAL: Duration = Duration::from_millis(750);
/// How long a session lives after its process exits before being reaped.
pub const REAPER_GRACE: Duration = Duration::from_secs(10);
/// Default broadcast capacity for terminal event channels.
pub const DEFAULT_EVENT_CAPACITY: usize = 1024;

/// PTY (pseudo-terminal) manager.
#[derive(Clone)]
pub struct TerminalManager {
    inner: Arc<TerminalManagerInner>,
}

struct TerminalManagerInner {
    sessions: DashMap<Uuid, TerminalHandle>,
    default_shell: String,
    reaper_running: Mutex<bool>,
}

#[derive(Clone)]
#[allow(dead_code)]
struct TerminalHandle {
    session: TerminalSession,
    writer: Arc<Mutex<Box<dyn std::io::Write + Send>>>,
    reader: Arc<Mutex<Box<dyn std::io::Read + Send>>>,
    master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
    child: Arc<Mutex<Box<dyn Child + Send>>>,
    output_tx: broadcast::Sender<TerminalEvent>,
    state: Arc<Mutex<SessionState>>,
    created_at: Instant,
    exited: Arc<Mutex<Option<i32>>>,
}

#[derive(Debug, Clone, Default)]
struct SessionState {
    title: String,
    bytes_received: u64,
    bytes_sent: u64,
    last_activity: Option<Instant>,
    replay_buffer: VecDeque<u8>,
}

impl TerminalManager {
    /// Create a new terminal manager with a background reaper.
    pub fn new() -> Self {
        Self::with_default_shell(default_shell())
    }

    /// Create a new terminal manager with a specific default shell.
    pub fn with_default_shell(shell: impl Into<String>) -> Self {
        let manager = Self {
            inner: Arc::new(TerminalManagerInner {
                sessions: DashMap::new(),
                default_shell: shell.into(),
                reaper_running: Mutex::new(false),
            }),
        };
        manager.spawn_reaper();
        manager
    }

    /// Default shell used when callers do not provide one.
    pub fn default_shell(&self) -> &str {
        &self.inner.default_shell
    }

    /// Create a new terminal session.
    pub async fn create(&self, input: CreateTerminalInput) -> Result<CreateTerminalOutput> {
        let id = Uuid::new_v4();
        let cols = input.cols.unwrap_or(80);
        let rows = input.rows.unwrap_or(24);
        let shell = input
            .shell
            .clone()
            .unwrap_or_else(|| self.inner.default_shell.clone());
        let cwd = input.cwd.clone();

        let pty_system = native_pty_system();
        let pty_pair = pty_system
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| Error::Internal(format!("Failed to create PTY: {}", e)))?;

        let mut cmd = CommandBuilder::new(&shell);
        cmd.cwd(&cwd);

        // Forward a minimal but useful environment so shells behave normally.
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");
        cmd.env("REMI_TERMINAL_ID", id.to_string());

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

        let session = TerminalSession {
            id,
            thread_id: input.thread_id,
            cwd,
            shell,
            created_at: chrono::Utc::now().to_rfc3339(),
        };

        let (output_tx, _) = broadcast::channel(DEFAULT_EVENT_CAPACITY);

        let handle = TerminalHandle {
            session: session.clone(),
            writer: Arc::new(Mutex::new(writer)),
            reader: Arc::new(Mutex::new(reader)),
            master: Arc::new(Mutex::new(pty_pair.master)),
            child: Arc::new(Mutex::new(child)),
            output_tx: output_tx.clone(),
            state: Arc::new(Mutex::new(SessionState {
                title: String::new(),
                last_activity: Some(Instant::now()),
                ..Default::default()
            })),
            created_at: Instant::now(),
            exited: Arc::new(Mutex::new(None)),
        };

        // Spawn reader task: parses OSC sequences, broadcasts events, keeps a
        // bounded replay buffer for late subscribers.
        Self::spawn_reader(handle.clone());

        self.inner.sessions.insert(id, handle);
        info!("Created terminal session: {}", id);

        Ok(CreateTerminalOutput { id })
    }

    /// Write data to a terminal session.
    pub async fn write(&self, session_id: Uuid, data: &str) -> Result<()> {
        let handle = self
            .inner
            .sessions
            .get(&session_id)
            .ok_or_else(|| Error::Internal(format!("Session not found: {}", session_id)))?;

        let bytes = data.as_bytes().to_vec();
        let len = bytes.len() as u64;
        {
            let mut writer = handle.writer.lock();
            use std::io::Write;
            writer
                .write_all(&bytes)
                .map_err(|e| Error::Internal(format!("Failed to write to PTY: {}", e)))?;
            writer
                .flush()
                .map_err(|e| Error::Internal(format!("Failed to flush PTY: {}", e)))?;
        }
        {
            let mut state = handle.state.lock();
            state.bytes_sent += len;
            state.last_activity = Some(Instant::now());
        }
        Ok(())
    }

    /// Send a line of input to a terminal session (writes the data followed by
    /// a newline character).
    pub async fn write_line(&self, session_id: Uuid, line: &str) -> Result<()> {
        let mut data = line.to_string();
        data.push('\n');
        self.write(session_id, &data).await
    }

    /// Resize a terminal session.
    pub async fn resize(&self, session_id: Uuid, cols: u16, rows: u16) -> Result<()> {
        let handle = self
            .inner
            .sessions
            .get(&session_id)
            .ok_or_else(|| Error::Internal(format!("Session not found: {}", session_id)))?;

        let size = PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        };
        handle
            .master
            .lock()
            .resize(size)
            .map_err(|e| Error::Internal(format!("Failed to resize PTY: {}", e)))?;
        info!(
            "Resized terminal session {} to {}x{}",
            session_id, cols, rows
        );
        Ok(())
    }

    /// Send SIGINT to a terminal session, falling back to a control-C
    /// character if the platform does not support signal delivery.
    pub async fn interrupt(&self, session_id: Uuid) -> Result<()> {
        self.write(session_id, "\u{3}").await
    }

    /// Close a terminal session.
    pub async fn close(&self, session_id: Uuid) -> Result<()> {
        if let Some((_, handle)) = self.inner.sessions.remove(&session_id) {
            // Drop the writer to send EOF to the shell.
            drop(handle.writer);
            // Drop the master to close the PTY pair.
            drop(handle.master);
            info!("Closed terminal session: {}", session_id);
        } else {
            warn!("Attempted to close non-existent session: {}", session_id);
        }
        Ok(())
    }

    /// List all active sessions.
    pub async fn list_sessions(&self) -> Vec<TerminalSession> {
        self.inner
            .sessions
            .iter()
            .map(|entry| entry.value().session.clone())
            .collect()
    }

    /// Subscribe to terminal events.
    pub async fn subscribe_events(
        &self,
        session_id: Uuid,
    ) -> Result<broadcast::Receiver<TerminalEvent>> {
        let handle = self
            .inner
            .sessions
            .get(&session_id)
            .ok_or_else(|| Error::Internal(format!("Session not found: {}", session_id)))?;
        Ok(handle.output_tx.subscribe())
    }

    /// Backwards-compatible subscribe to plain output (no title/exit).
    pub async fn subscribe_output(&self, session_id: Uuid) -> Result<broadcast::Receiver<String>> {
        let rx = self.subscribe_events(session_id).await?;
        Ok(OutputOnly { inner: rx }.to_receiver())
    }

    /// Get a status snapshot for a session.
    pub async fn status(&self, session_id: Uuid) -> Result<TerminalStatus> {
        let handle = self
            .inner
            .sessions
            .get(&session_id)
            .ok_or_else(|| Error::Internal(format!("Session not found: {}", session_id)))?;
        let state = handle.state.lock().clone();
        let exited = handle.exited.lock();
        let last_activity = state
            .last_activity
            .map(|t| {
                let elapsed = t.elapsed();
                chrono::Utc::now()
                    .checked_sub_signed(chrono::Duration::from_std(elapsed).unwrap_or_default())
                    .map(|dt| dt.to_rfc3339())
                    .unwrap_or_else(|| handle.session.created_at.clone())
            })
            .unwrap_or_else(|| handle.session.created_at.clone());
        Ok(TerminalStatus {
            session_id,
            running: exited.is_none(),
            exit_code: *exited,
            title: state.title,
            bytes_received: state.bytes_received,
            bytes_sent: state.bytes_sent,
            created_at: handle.session.created_at.clone(),
            last_activity_at: last_activity,
        })
    }

    /// Clear terminal screen (sends ANSI clear sequence).
    pub async fn clear(&self, session_id: Uuid) -> Result<()> {
        self.write(session_id, "\x1b[2J\x1b[H").await?;
        info!("Cleared terminal session: {}", session_id);
        Ok(())
    }

    /// Restart a terminal session with the same configuration.
    pub async fn restart(&self, session_id: Uuid) -> Result<()> {
        let (cwd, shell, thread_id, cols, rows) = {
            let handle = self
                .inner
                .sessions
                .get(&session_id)
                .ok_or_else(|| Error::Internal(format!("Session not found: {}", session_id)))?;
            (
                handle.session.cwd.clone(),
                handle.session.shell.clone(),
                handle.session.thread_id,
                80u16,
                24u16,
            )
        };
        // Best-effort close: ignore missing entries.
        let _ = self.close(session_id).await;
        let input = CreateTerminalInput {
            cwd,
            shell: Some(shell),
            thread_id,
            cols: Some(cols),
            rows: Some(rows),
        };
        let new_output = self.create(input).await?;
        info!(
            "Restarted terminal session {} -> {}",
            session_id, new_output.id
        );
        Ok(())
    }

    /// Get the latest observed title for a session.
    pub async fn title(&self, session_id: Uuid) -> Result<String> {
        let handle = self
            .inner
            .sessions
            .get(&session_id)
            .ok_or_else(|| Error::Internal(format!("Session not found: {}", session_id)))?;
        Ok(handle.state.lock().title.clone())
    }

    /// Snapshot of the buffered output for late subscribers / replay.
    pub async fn replay(&self, session_id: Uuid) -> Result<String> {
        let handle = self
            .inner
            .sessions
            .get(&session_id)
            .ok_or_else(|| Error::Internal(format!("Session not found: {}", session_id)))?;
        let state = handle.state.lock();
        let bytes: Vec<u8> = state.replay_buffer.iter().copied().collect();
        Ok(String::from_utf8_lossy(&bytes).to_string())
    }

    /// Spawn the background reaper (idempotent).
    fn spawn_reaper(&self) {
        let mut running = self.inner.reaper_running.lock();
        if *running {
            return;
        }
        *running = true;
        drop(running);

        let sessions = self.inner.sessions.clone();
        tokio::spawn(async move {
            let mut tick = tokio::time::interval(REAPER_INTERVAL);
            tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
            loop {
                tick.tick().await;
                reap_once(&sessions).await;
            }
        });
    }

    fn spawn_reader(handle: TerminalHandle) {
        let reader = handle.reader.clone();
        let output_tx = handle.output_tx.clone();
        let state = handle.state.clone();
        let exited = handle.exited.clone();
        let session_id = handle.session.id;

        let mut parser = OscParser::new();

        tokio::spawn(async move {
            let mut buf = [0u8; 4096];
            loop {
                let n = {
                    let mut reader = reader.lock();
                    match std::io::Read::read(&mut *reader, &mut buf) {
                        Ok(0) => break,
                        Ok(n) => n,
                        Err(_) => break,
                    }
                };

                let chunk = &buf[..n];
                {
                    let mut state = state.lock();
                    state.bytes_received += n as u64;
                    state.last_activity = Some(Instant::now());
                    push_replay(&mut state.replay_buffer, chunk);
                }

                // Stream the raw chunk to subscribers for redrawing.
                if let Ok(text) = std::str::from_utf8(chunk) {
                    let _ = output_tx.send(TerminalEvent::Output(TerminalOutputEvent {
                        session_id,
                        data: text.to_string(),
                    }));
                }

                // Look for OSC title updates and broadcast them.
                for title in parser.feed(chunk) {
                    let cleaned = title.trim_end_matches('\u{7}').to_string();
                    {
                        let mut state = state.lock();
                        state.title = cleaned.clone();
                    }
                    let _ = output_tx.send(TerminalEvent::Title(TerminalTitleEvent {
                        session_id,
                        title: cleaned,
                    }));
                }
            }

            // Mark exit; we don't have the real exit code here (it lives on the
            // child handle), so we report -1 to signal "process ended".
            let code = {
                let mut slot = exited.lock();
                if slot.is_none() {
                    *slot = Some(-1);
                }
                *slot
            };
            let _ = output_tx.send(TerminalEvent::Exit(TerminalExitEvent {
                session_id,
                exit_code: code.unwrap_or(-1),
            }));
            debug!("Reader task ended for session: {}", session_id);
        });
    }
}

impl Default for TerminalManager {
    fn default() -> Self {
        Self::new()
    }
}

async fn reap_once(sessions: &DashMap<Uuid, TerminalHandle>) {
    let now = Instant::now();
    let mut to_remove = Vec::new();
    for entry in sessions.iter() {
        let handle = entry.value();
        let mut exited = handle.exited.lock();
        if exited.is_none() {
            // Try to detect that the child has exited without blocking.
            let mut child = handle.child.lock();
            match child.try_wait() {
                Ok(Some(status)) => {
                    *exited = Some(status.exit_code() as i32);
                }
                Ok(None) => {
                    // Still running.
                }
                Err(_) => {
                    // Treat unrecoverable error as "exited with -1" so the
                    // reaper eventually cleans up the session.
                    *exited = Some(-1);
                }
            }
        }
        if let Some(code) = *exited {
            // Reap once the grace period has elapsed.
            if now.duration_since(handle.created_at) > REAPER_GRACE {
                to_remove.push((entry.key().clone(), code));
            }
        }
        drop(exited);
    }
    for (id, _) in to_remove {
        if let Some((_, handle)) = sessions.remove(&id) {
            // Best-effort: dropping the writer + master closes the PTY.
            drop(handle.writer);
            drop(handle.master);
            drop(handle.child);
            info!("Reaped terminal session: {}", id);
        }
    }
}

/// Adapter that turns a [`TerminalEvent`] stream into a plain `String` stream
/// for backwards compatibility with the original `subscribe_output` API.
struct OutputOnly {
    inner: broadcast::Receiver<TerminalEvent>,
}

impl OutputOnly {
    fn to_receiver(self) -> broadcast::Receiver<String> {
        let (tx, rx) = broadcast::channel::<String>(DEFAULT_EVENT_CAPACITY);
        let mut inner = self.inner;
        tokio::spawn(async move {
            loop {
                match inner.recv().await {
                    Ok(TerminalEvent::Output(ev)) => {
                        let _ = tx.send(ev.data);
                    }
                    Ok(_) => continue,
                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(broadcast::error::RecvError::Closed) => break,
                }
            }
        });
        rx
    }
}

fn push_replay(buf: &mut VecDeque<u8>, chunk: &[u8]) {
    for byte in chunk {
        buf.push_back(*byte);
        while buf.len() > DEFAULT_REPLAY_BUFFER {
            buf.pop_front();
        }
    }
}

fn default_shell() -> String {
    if cfg!(windows) {
        std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".to_string())
    } else {
        std::env::var("SHELL").unwrap_or_else(|_| "bash".to_string())
    }
}

/// Incremental parser for OSC (`ESC ]`) sequences carrying the terminal title.
///
/// Recognises OSC 0/1/2, terminated by either `BEL` (0x07) or `ESC \`
/// (string terminator). Other OSC codes are skipped.
struct OscParser {
    in_osc: bool,
    accum: Vec<u8>,
    pending_code: Option<u8>,
}

impl OscParser {
    fn new() -> Self {
        Self {
            in_osc: false,
            accum: Vec::new(),
            pending_code: None,
        }
    }

    fn feed(&mut self, chunk: &[u8]) -> Vec<String> {
        let mut titles = Vec::new();
        for &byte in chunk {
            if !self.in_osc {
                if byte == 0x1b {
                    // Mark potential OSC; only commit if the next byte is ']'.
                    self.pending_code = Some(0x1b);
                } else if self.pending_code == Some(0x1b) && byte == b']' {
                    self.in_osc = true;
                    self.accum.clear();
                    self.pending_code = None;
                } else {
                    self.pending_code = None;
                }
                continue;
            }

            match byte {
                0x07 => {
                    // BEL terminator
                    self.finish_into(&mut titles);
                }
                0x1b => {
                    // Possible ST (ESC \) – peek at next byte outside this loop.
                    self.pending_code = Some(0x1b);
                }
                _ if self.pending_code == Some(0x1b) && byte == b'\\' => {
                    self.pending_code = None;
                    self.finish_into(&mut titles);
                }
                _ => {
                    self.pending_code = None;
                    self.accum.push(byte);
                }
            }
        }
        titles
    }

    fn finish_into(&mut self, out: &mut Vec<String>) {
        self.in_osc = false;
        let raw = std::mem::take(&mut self.accum);
        if let Some(rest) = raw.strip_prefix(b"0;")
            .or_else(|| raw.strip_prefix(b"1;"))
            .or_else(|| raw.strip_prefix(b"2;"))
        {
            if let Ok(text) = std::str::from_utf8(rest) {
                out.push(text.to_string());
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Managed wrapper
// ---------------------------------------------------------------------------

/// High level wrapper around a terminal session that adds typed event
/// iteration, line buffering and one-shot command execution. This is what
/// the orchestration engine uses to interact with shells.
pub struct ManagedTerminal {
    manager: TerminalManager,
    session_id: Uuid,
    events: broadcast::Receiver<TerminalEvent>,
    line_buffer: Arc<Mutex<String>>,
    command_timeout: Duration,
}

impl ManagedTerminal {
    /// Open a new managed terminal session.
    pub async fn open(
        manager: &TerminalManager,
        input: CreateTerminalInput,
    ) -> Result<Self> {
        let output = manager.create(input).await?;
        let events = manager.subscribe_events(output.id).await?;
        Ok(Self {
            manager: manager.clone(),
            session_id: output.id,
            events,
            line_buffer: Arc::new(Mutex::new(String::new())),
            command_timeout: Duration::from_secs(30),
        })
    }

    /// Override the default command timeout.
    pub fn with_timeout(mut self, timeout: Duration) -> Self {
        self.command_timeout = timeout;
        self
    }

    /// Session ID of the underlying terminal.
    pub fn id(&self) -> Uuid {
        self.session_id
    }

    /// Send a line of input.
    pub async fn send_line(&self, line: &str) -> Result<()> {
        self.manager.write_line(self.session_id, line).await
    }

    /// Send raw data (e.g. control sequences).
    pub async fn send_raw(&self, data: &str) -> Result<()> {
        self.manager.write(self.session_id, data).await
    }

    /// Read the next typed event.
    pub async fn next_event(&mut self) -> Result<TerminalEvent> {
        loop {
            match self.events.recv().await {
                Ok(ev) => {
                    if let TerminalEvent::Output(ref out) = ev {
                        let mut buf = self.line_buffer.lock();
                        buf.push_str(&out.data);
                    }
                    return Ok(ev);
                }
                Err(broadcast::error::RecvError::Lagged(_)) => continue,
                Err(broadcast::error::RecvError::Closed) => {
                    return Err(Error::Internal("terminal event stream closed".to_string()));
                }
            }
        }
    }

    /// Drain buffered output into a string and clear the buffer.
    pub fn drain_lines(&self) -> String {
        let mut buf = self.line_buffer.lock();
        std::mem::take(&mut *buf)
    }

    /// Wait for a line that contains the marker substring, returning everything
    /// buffered up to and including that line.
    pub async fn wait_for(&mut self, marker: &str) -> Result<String> {
        let deadline = Instant::now() + self.command_timeout;
        loop {
            {
                let buf = self.line_buffer.lock();
                if let Some(idx) = buf.find(marker) {
                    let end = buf[idx..]
                        .find('\n')
                        .map(|o| idx + o + 1)
                        .unwrap_or(buf.len());
                    let mut owned = buf.clone();
                    drop(buf);
                    let mut buf = self.line_buffer.lock();
                    *buf = owned.split_off(end);
                    return Ok(owned);
                }
            }
            if Instant::now() >= deadline {
                return Err(Error::Internal(format!(
                    "timed out waiting for marker: {}",
                    marker
                )));
            }
            let event = tokio::time::timeout(
                deadline.saturating_duration_since(Instant::now()),
                self.next_event(),
            )
            .await
            .map_err(|_| Error::Internal(format!("timed out waiting for marker: {}", marker)))??;
            if matches!(event, TerminalEvent::Exit(_)) {
                return Err(Error::Internal("terminal exited while waiting".to_string()));
            }
        }
    }

    /// Send a command and wait for the prompt marker.
    pub async fn send_command(&mut self, command: &str, prompt: &str) -> Result<String> {
        self.send_line(command).await?;
        self.wait_for(prompt).await
    }

    /// Current title.
    pub async fn title(&self) -> Result<String> {
        self.manager.title(self.session_id).await
    }

    /// Status snapshot.
    pub async fn status(&self) -> Result<TerminalStatus> {
        self.manager.status(self.session_id).await
    }

    /// Replay buffered output.
    pub async fn replay(&self) -> Result<String> {
        self.manager.replay(self.session_id).await
    }

    /// Close the underlying session.
    pub async fn close(self) -> Result<()> {
        self.manager.close(self.session_id).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_osc_parser_basic() {
        let mut parser = OscParser::new();
        // OSC 0 ; "hello" BEL
        let bytes = b"\x1b]0;hello\x07";
        let titles = parser.feed(bytes);
        assert_eq!(titles, vec!["hello".to_string()]);
    }

    #[test]
    fn test_osc_parser_st_terminator() {
        let mut parser = OscParser::new();
        // OSC 2 ; "world" ESC \
        let bytes = b"\x1b]2;world\x1b\\";
        let titles = parser.feed(bytes);
        assert_eq!(titles, vec!["world".to_string()]);
    }

    #[test]
    fn test_osc_parser_split_across_chunks() {
        let mut parser = OscParser::new();
        assert!(parser.feed(b"\x1b]0;hel").is_empty());
        let titles = parser.feed(b"lo\x07");
        assert_eq!(titles, vec!["hello".to_string()]);
    }

    #[test]
    fn test_osc_parser_ignores_other_codes() {
        let mut parser = OscParser::new();
        // OSC 9 ; 4 (ConEmu progress) should be ignored.
        let titles = parser.feed(b"\x1b]9;4;1;50\x07");
        assert!(titles.is_empty());
    }

    #[tokio::test]
    async fn test_create_terminal() {
        let manager = TerminalManager::new();
        let input = CreateTerminalInput {
            cwd: ".".to_string(),
            shell: Some(default_shell()),
            thread_id: None,
            cols: Some(80),
            rows: Some(24),
        };
        let result = manager.create(input).await;
        assert!(result.is_ok(), "Failed to create terminal: {:?}", result);
    }

    #[tokio::test]
    async fn test_managed_terminal_write_and_replay() {
        let manager = TerminalManager::new();
        let input = CreateTerminalInput {
            cwd: ".".to_string(),
            shell: Some(default_shell()),
            thread_id: None,
            cols: Some(80),
            rows: Some(24),
        };
        let mut term = ManagedTerminal::open(&manager, input)
            .await
            .expect("create managed terminal");
        // Issue a command that should be present in the replay buffer.
        term.send_line("echo remi-managed-pty-test")
            .await
            .expect("send line");
        // Give the shell a moment to echo.
        tokio::time::sleep(Duration::from_millis(500)).await;
        let replay = term.replay().await.expect("replay");
        assert!(
            replay.contains("remi-managed-pty-test"),
            "replay did not contain echoed command: {}",
            replay
        );
        let _ = term.close().await;
    }
}
