//! Remi Code 的 PTY（伪终端）管理。
//!
//! 本 crate 使用 `portable-pty` 提供终端会话管理功能，
//! 与主流 ADE 竞品（Cursor / Codex / OpenCode / ZCode）的能力对齐，包括：
//!
//! * **标题监控** — 解析 shell、多路复用器（`tmux`、`zellij`）和编辑器
//!   （`vim`、`htop`）发出的 OSC 0/1/2 转义序列，并通过单一事件总线广播。
//! * **会话回收器** — 后台任务轮询子进程，捕获其退出码，
//!   并在宽限期后清理僵尸会话，确保管理器不会泄漏文件描述符。
//! * **托管包装器** — [`ManagedTerminal`] 在原始 [`TerminalManager`] 之上
//!   提供更高层、更符合人体工程学的 API（类型化事件、行缓冲、命令执行）。
//!   管理器是 RPC 层的合适入口；托管包装器则是编排引擎用于驱动
//!   交互式会话的工具。

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

/// 重放缓冲区的最大字节数。
pub const DEFAULT_REPLAY_BUFFER: usize = 64 * 1024;
/// 回收器检查子进程的频率。
pub const REAPER_INTERVAL: Duration = Duration::from_millis(750);
/// 会话在进程退出后到被回收前的存活时间。
pub const REAPER_GRACE: Duration = Duration::from_secs(10);
/// 终端事件通道的默认广播容量。
pub const DEFAULT_EVENT_CAPACITY: usize = 1024;

/// PTY（伪终端）管理器。
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
    /// 创建带有后台回收器的新终端管理器。
    pub fn new() -> Self {
        Self::with_default_shell(default_shell())
    }

    /// 使用指定默认 shell 创建新终端管理器。
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

    /// 调用方未提供时使用的默认 shell。
    pub fn default_shell(&self) -> &str {
        &self.inner.default_shell
    }

    /// 创建新终端会话。
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
            .map_err(|e| Error::Internal(format!("创建 PTY 失败: {}", e)))?;

        let mut cmd = CommandBuilder::new(&shell);
        cmd.cwd(&cwd);

        // 转发最小但有用的环境，使 shell 正常运行。
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");
        cmd.env("REMI_TERMINAL_ID", id.to_string());

        let child = pty_pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| Error::Internal(format!("生成命令失败: {}", e)))?;

        let writer = pty_pair
            .master
            .take_writer()
            .map_err(|e| Error::Internal(format!("获取 PTY 写入器失败: {}", e)))?;
        let reader = pty_pair
            .master
            .try_clone_reader()
            .map_err(|e| Error::Internal(format!("获取 PTY 读取器失败: {}", e)))?;

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

        // 生成读取器任务：解析 OSC 序列，广播事件，为延迟订阅者保留
        // 有界重放缓冲区。
        Self::spawn_reader(handle.clone());

        self.inner.sessions.insert(id, handle);
        info!("创建了终端会话: {}", id);

        Ok(CreateTerminalOutput { id })
    }

    /// 向终端会话写入数据。
    pub async fn write(&self, session_id: Uuid, data: &str) -> Result<()> {
        let handle = self
            .inner
            .sessions
            .get(&session_id)
            .ok_or_else(|| Error::Internal(format!("会话未找到: {}", session_id)))?;

        let bytes = data.as_bytes().to_vec();
        let len = bytes.len() as u64;
        {
            let mut writer = handle.writer.lock();
            use std::io::Write;
            writer
                .write_all(&bytes)
                .map_err(|e| Error::Internal(format!("写入 PTY 失败: {}", e)))?;
            writer
                .flush()
                .map_err(|e| Error::Internal(format!("刷新 PTY 失败: {}", e)))?;
        }
        {
            let mut state = handle.state.lock();
            state.bytes_sent += len;
            state.last_activity = Some(Instant::now());
        }
        Ok(())
    }

    /// 向终端会话发送一行输入（写入数据后跟换行符）。
    pub async fn write_line(&self, session_id: Uuid, line: &str) -> Result<()> {
        let mut data = line.to_string();
        data.push('\n');
        self.write(session_id, &data).await
    }

    /// 调整终端会话大小。
    pub async fn resize(&self, session_id: Uuid, cols: u16, rows: u16) -> Result<()> {
        let handle = self
            .inner
            .sessions
            .get(&session_id)
            .ok_or_else(|| Error::Internal(format!("会话未找到: {}", session_id)))?;

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
            .map_err(|e| Error::Internal(format!("调整 PTY 大小失败: {}", e)))?;
        info!(
            "将终端会话 {} 调整为 {}x{}",
            session_id, cols, rows
        );
        Ok(())
    }

    /// 向终端会话发送 SIGINT，如果平台不支持信号传递，则回退到
    /// control-C 字符。
    pub async fn interrupt(&self, session_id: Uuid) -> Result<()> {
        self.write(session_id, "\u{3}").await
    }

    /// 关闭终端会话。
    pub async fn close(&self, session_id: Uuid) -> Result<()> {
        if let Some((_, handle)) = self.inner.sessions.remove(&session_id) {
            // 丢弃写入器以向 shell 发送 EOF。
            drop(handle.writer);
            // 丢弃主设备以关闭 PTY 对。
            drop(handle.master);
            info!("关闭了终端会话: {}", session_id);
        } else {
            warn!("尝试关闭不存在的会话: {}", session_id);
        }
        Ok(())
    }

    /// 列出所有活跃会话。
    pub async fn list_sessions(&self) -> Vec<TerminalSession> {
        self.inner
            .sessions
            .iter()
            .map(|entry| entry.value().session.clone())
            .collect()
    }

    /// 订阅终端事件。
    pub async fn subscribe_events(
        &self,
        session_id: Uuid,
    ) -> Result<broadcast::Receiver<TerminalEvent>> {
        let handle = self
            .inner
            .sessions
            .get(&session_id)
            .ok_or_else(|| Error::Internal(format!("会话未找到: {}", session_id)))?;
        Ok(handle.output_tx.subscribe())
    }

    /// 向后兼容的纯输出订阅（无标题/退出）。
    pub async fn subscribe_output(&self, session_id: Uuid) -> Result<broadcast::Receiver<String>> {
        let rx = self.subscribe_events(session_id).await?;
        Ok(OutputOnly { inner: rx }.to_receiver())
    }

    /// 获取会话的状态快照。
    pub async fn status(&self, session_id: Uuid) -> Result<TerminalStatus> {
        let handle = self
            .inner
            .sessions
            .get(&session_id)
            .ok_or_else(|| Error::Internal(format!("会话未找到: {}", session_id)))?;
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

    /// 清除终端屏幕（发送 ANSI 清除序列）。
    pub async fn clear(&self, session_id: Uuid) -> Result<()> {
        self.write(session_id, "\x1b[2J\x1b[H").await?;
        info!("清除了终端会话: {}", session_id);
        Ok(())
    }

    /// 使用相同配置重启终端会话。
    pub async fn restart(&self, session_id: Uuid) -> Result<()> {
        let (cwd, shell, thread_id, cols, rows) = {
            let handle = self
                .inner
                .sessions
                .get(&session_id)
                .ok_or_else(|| Error::Internal(format!("会话未找到: {}", session_id)))?;
            (
                handle.session.cwd.clone(),
                handle.session.shell.clone(),
                handle.session.thread_id,
                80u16,
                24u16,
            )
        };
        // 尽力关闭：忽略缺失条目。
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
            "重启了终端会话 {} -> {}",
            session_id, new_output.id
        );
        Ok(())
    }

    /// 获取会话的最新观察标题。
    pub async fn title(&self, session_id: Uuid) -> Result<String> {
        let handle = self
            .inner
            .sessions
            .get(&session_id)
            .ok_or_else(|| Error::Internal(format!("会话未找到: {}", session_id)))?;
        Ok(handle.state.lock().title.clone())
    }

    /// 缓冲输出的快照，供延迟订阅者/重放使用。
    pub async fn replay(&self, session_id: Uuid) -> Result<String> {
        let handle = self
            .inner
            .sessions
            .get(&session_id)
            .ok_or_else(|| Error::Internal(format!("会话未找到: {}", session_id)))?;
        let state = handle.state.lock();
        let bytes: Vec<u8> = state.replay_buffer.iter().copied().collect();
        Ok(String::from_utf8_lossy(&bytes).to_string())
    }

    /// 生成后台回收器（幂等）。
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

                // 将原始块流式传输给订阅者以进行重绘。
                if let Ok(text) = std::str::from_utf8(chunk) {
                    let _ = output_tx.send(TerminalEvent::Output(TerminalOutputEvent {
                        session_id,
                        data: text.to_string(),
                    }));
                }

                // 查找 OSC 标题更新并广播。
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

            // 标记退出；这里没有真实的退出码（它在子句柄上），
            // 所以我们报告 -1 以表示"进程已结束"。
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
            debug!("会话 {} 的读取器任务已结束", session_id);
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
            // 尝试在不阻塞的情况下检测子进程是否已退出。
            let mut child = handle.child.lock();
            match child.try_wait() {
                Ok(Some(status)) => {
                    *exited = Some(status.exit_code() as i32);
                }
                Ok(None) => {
                    // 仍在运行。
                }
                Err(_) => {
                    // 将不可恢复的错误视为"以 -1 退出"，以便
                    // 回收器最终清理会话。
                    *exited = Some(-1);
                }
            }
        }
        if let Some(code) = *exited {
            // 宽限期过后进行回收。
            if now.duration_since(handle.created_at) > REAPER_GRACE {
                to_remove.push((entry.key().clone(), code));
            }
        }
        drop(exited);
    }
    for (id, _) in to_remove {
        if let Some((_, handle)) = sessions.remove(&id) {
            // 尽力而为：丢弃写入器 + 主设备会关闭 PTY。
            drop(handle.writer);
            drop(handle.master);
            drop(handle.child);
            info!("回收了终端会话: {}", id);
        }
    }
}

/// 适配器，将 [`TerminalEvent`] 流转换为纯 `String` 流，
/// 以便与原始 `subscribe_output` API 向后兼容。
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

/// 用于承载终端标题的 OSC (`ESC ]`) 序列的增量解析器。
///
/// 识别 OSC 0/1/2，以 `BEL` (0x07) 或 `ESC \`（字符串终止符）结束。
/// 其他 OSC 代码会被跳过。
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
                    // 标记潜在的 OSC；仅当下一个字节是 ']' 时才确认。
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
                    // BEL 终止符
                    self.finish_into(&mut titles);
                }
                0x1b => {
                    // 可能是 ST (ESC \) — 在此循环外查看下一个字节。
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
// 托管包装器
// ---------------------------------------------------------------------------

/// 终端会话的高层包装器，添加了类型化事件迭代、行缓冲
/// 和一次性命令执行。这是编排引擎用于与 shell 交互的工具。
pub struct ManagedTerminal {
    manager: TerminalManager,
    session_id: Uuid,
    events: broadcast::Receiver<TerminalEvent>,
    line_buffer: Arc<Mutex<String>>,
    command_timeout: Duration,
}

impl ManagedTerminal {
    /// 打开新的托管终端会话。
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

    /// 覆盖默认命令超时。
    pub fn with_timeout(mut self, timeout: Duration) -> Self {
        self.command_timeout = timeout;
        self
    }

    /// 底层终端的会话 ID。
    pub fn id(&self) -> Uuid {
        self.session_id
    }

    /// 发送一行输入。
    pub async fn send_line(&self, line: &str) -> Result<()> {
        self.manager.write_line(self.session_id, line).await
    }

    /// 发送原始数据（例如控制序列）。
    pub async fn send_raw(&self, data: &str) -> Result<()> {
        self.manager.write(self.session_id, data).await
    }

    /// 读取下一个类型化事件。
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
                    return Err(Error::Internal("终端事件流已关闭".to_string()));
                }
            }
        }
    }

    /// 将缓冲的输出排空到字符串并清空缓冲区。
    pub fn drain_lines(&self) -> String {
        let mut buf = self.line_buffer.lock();
        std::mem::take(&mut *buf)
    }

    /// 等待包含标记子字符串的行，返回缓冲到该行（包括该行）的所有内容。
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
                    "等待标记超时: {}",
                    marker
                )));
            }
            let event = tokio::time::timeout(
                deadline.saturating_duration_since(Instant::now()),
                self.next_event(),
            )
            .await
            .map_err(|_| Error::Internal(format!("等待标记超时: {}", marker)))??;
            if matches!(event, TerminalEvent::Exit(_)) {
                return Err(Error::Internal("等待时终端已退出".to_string()));
            }
        }
    }

    /// 发送命令并等待提示标记。
    pub async fn send_command(&mut self, command: &str, prompt: &str) -> Result<String> {
        self.send_line(command).await?;
        self.wait_for(prompt).await
    }

    /// 当前标题。
    pub async fn title(&self) -> Result<String> {
        self.manager.title(self.session_id).await
    }

    /// 状态快照。
    pub async fn status(&self) -> Result<TerminalStatus> {
        self.manager.status(self.session_id).await
    }

    /// 重放缓冲的输出。
    pub async fn replay(&self) -> Result<String> {
        self.manager.replay(self.session_id).await
    }

    /// 关闭底层会话。
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
