//! # 进程运行器模块
//!
//! 提供跨平台的子进程运行能力，支持：
//!
//! - 同步 / 异步执行 + 超时控制
//! - stdout / stderr 实时流式回调
//! - 工作目录 / 环境变量 / 输入流
//! - 跨平台差异处理（Windows 隐藏窗口、Unix 信号组）
//!
//! ## 设计
//!
//! ```text
//!   CommandSpec  ──build──▶ tokio::Command ──run──▶ ProcessOutput
//!        │                       │                    │
//!        ▼                       ▼                    ▼
//!   args / cwd / env       stdout/stderr       { status, stdout,
//!                                              stderr, duration }
//! ```

use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::process::Command;
use tokio::sync::mpsc;
use tracing::{debug, warn};

/// 进程执行结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessOutput {
    /// 退出状态码（None 表示被信号杀死）
    pub status: Option<i32>,
    /// 是否成功（status == 0）
    pub success: bool,
    /// 完整 stdout（如果设置了 capture，则包含全部）
    pub stdout: String,
    /// 完整 stderr
    pub stderr: String,
    /// 实际耗时
    pub duration_ms: u64,
    /// 进程是否超时被杀
    pub timed_out: bool,
}

/// 进程执行规格
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandSpec {
    /// 可执行文件 / 命令
    pub program: String,
    /// 参数列表
    pub args: Vec<String>,
    /// 工作目录
    pub cwd: Option<PathBuf>,
    /// 额外环境变量
    pub env: HashMap<String, String>,
    /// 输入（stdin）
    pub stdin: Option<String>,
    /// 超时（毫秒）
    pub timeout_ms: Option<u64>,
    /// 是否捕获 stdout/stderr
    pub capture: bool,
}

impl CommandSpec {
    /// 创建简单的 `program [args...]` 规格
    pub fn new(program: impl Into<String>, args: impl IntoIterator<Item = impl Into<String>>) -> Self {
        Self {
            program: program.into(),
            args: args.into_iter().map(Into::into).collect(),
            cwd: None,
            env: HashMap::new(),
            stdin: None,
            timeout_ms: None,
            capture: true,
        }
    }

    /// 设置工作目录
    pub fn with_cwd(mut self, cwd: impl Into<PathBuf>) -> Self {
        self.cwd = Some(cwd.into());
        self
    }

    /// 设置环境变量
    pub fn with_env(mut self, key: impl Into<String>, val: impl Into<String>) -> Self {
        self.env.insert(key.into(), val.into());
        self
    }

    /// 设置超时
    pub fn with_timeout(mut self, ms: u64) -> Self {
        self.timeout_ms = Some(ms);
        self
    }

    /// 设置 stdin
    pub fn with_stdin(mut self, input: impl Into<String>) -> Self {
        self.stdin = Some(input.into());
        self
    }

    /// 切换是否捕获输出
    pub fn with_capture(mut self, capture: bool) -> Self {
        self.capture = capture;
        self
    }

    /// 构造一个 `tokio::process::Command`
    fn build(&self) -> Command {
        let mut cmd = Command::new(&self.program);
        cmd.args(&self.args);
        if let Some(cwd) = &self.cwd {
            cmd.current_dir(cwd);
        }
        for (k, v) in &self.env {
            cmd.env(k, v);
        }
        if self.stdin.is_some() {
            cmd.stdin(Stdio::piped());
        } else {
            cmd.stdin(Stdio::null());
        }
        if self.capture {
            cmd.stdout(Stdio::piped());
            cmd.stderr(Stdio::piped());
        } else {
            cmd.stdout(Stdio::null());
            cmd.stderr(Stdio::null());
        }

        // Windows: 防止弹出额外的控制台窗口
        #[cfg(target_os = "windows")]
        {
            #[allow(unused_imports)]
            use std::os::windows::process::CommandExt;
            // CREATE_NO_WINDOW = 0x08000000
            cmd.creation_flags(0x08000000);
        }
        // Unix: 子进程放进新的进程组，便于按组杀
        #[cfg(unix)]
        {
            unsafe {
                use std::os::unix::process::CommandExt;
                cmd.pre_exec(|| {
                    // setpgid(0, 0)
                    libc::setpgid(0, 0);
                    Ok(())
                });
            }
        }

        cmd
    }
}

/// 进程运行器
pub struct ProcessRunner;

impl ProcessRunner {
    /// 创建运行器
    pub fn new() -> Self {
        Self
    }

    /// 同步执行（阻塞当前任务）
    pub async fn run(&self, spec: &CommandSpec) -> ProcessOutput {
        let start = Instant::now();
        let mut cmd = spec.build();
        let child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                warn!("spawn 失败: program={}, err={}", spec.program, e);
                return ProcessOutput {
                    status: None,
                    success: false,
                    stdout: String::new(),
                    stderr: format!("spawn failed: {}", e),
                    duration_ms: start.elapsed().as_millis() as u64,
                    timed_out: false,
                };
            }
        };
        self.collect(child, spec, start).await
    }

    /// 实时流式执行：每个 stdout/stderr 行通过 `tx` 发出
    ///
    /// - 频道协议：每条消息是 `(StreamKind, &str)`，kind=0=stdout, 1=stderr, 2=exit
    pub async fn run_streaming(
        &self,
        spec: &CommandSpec,
    ) -> (mpsc::Receiver<StreamEvent>, tokio::task::JoinHandle<ProcessOutput>) {
        let (tx, rx) = mpsc::channel::<StreamEvent>(256);
        let mut cmd = spec.build();
        let child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                let _ = tx
                    .send(StreamEvent::Error(format!("spawn failed: {}", e)))
                    .await;
                let (_tx2, rx2) = mpsc::channel(1);
                let h = tokio::spawn(async move {
                    ProcessOutput {
                        status: None,
                        success: false,
                        stdout: String::new(),
                        stderr: format!("spawn failed: {}", e),
                        duration_ms: 0,
                        timed_out: false,
                    }
                });
                return (rx2, h);
            }
        };

        let timeout_ms = spec.timeout_ms;
        let capture = spec.capture;
        let handle = tokio::spawn(async move {
            let start = Instant::now();
            Self::collect_streaming(child, capture, timeout_ms, start, tx).await
        });
        (rx, handle)
    }

    async fn collect(
        &self,
        mut child: tokio::process::Child,
        spec: &CommandSpec,
        start: Instant,
    ) -> ProcessOutput {
        // stdin 写入
        if let Some(input) = &spec.stdin {
            if let Some(mut stdin) = child.stdin.take() {
                let _ = stdin.write_all(input.as_bytes()).await;
                let _ = stdin.flush().await;
                drop(stdin);
            }
        }

        let (stdout, stderr, timed_out, status) = if spec.capture {
            self.collect_with_timeout(child, spec.timeout_ms).await
        } else {
            let status = if let Some(t) = spec.timeout_ms {
                match tokio::time::timeout(Duration::from_millis(t), child.wait()).await {
                    Ok(r) => r,
                    Err(_) => {
                        let _ = child.kill().await;
                        return ProcessOutput {
                            status: None,
                            success: false,
                            stdout: String::new(),
                            stderr: String::new(),
                            duration_ms: start.elapsed().as_millis() as u64,
                            timed_out: true,
                        };
                    }
                }
            } else {
                child.wait().await
            };
            (String::new(), String::new(), (false, false), status)
        };

        let success = !timed_out.0 && matches!(&status, Ok(s) if s.success());
        ProcessOutput {
            status: status.ok().and_then(|s| s.code()),
            success,
            stdout,
            stderr,
            duration_ms: start.elapsed().as_millis() as u64,
            timed_out: timed_out.0,
        }
    }

    async fn collect_with_timeout(
        &self,
        mut child: tokio::process::Child,
        timeout_ms: Option<u64>,
    ) -> (String, String, (bool, bool), std::io::Result<std::process::ExitStatus>) {
        let mut stdout_buf = Vec::new();
        let mut stderr_buf = Vec::new();

        if let Some(mut out) = child.stdout.take() {
            let _ = out.read_to_end(&mut stdout_buf).await;
        }
        if let Some(mut err) = child.stderr.take() {
            let _ = err.read_to_end(&mut stderr_buf).await;
        }

        let wait_fut = child.wait();
        let result = if let Some(t) = timeout_ms {
            match tokio::time::timeout(Duration::from_millis(t), wait_fut).await {
                Ok(r) => r,
                Err(_) => {
                    let _ = child.kill().await;
                    return (
                        String::from_utf8_lossy(&stdout_buf).to_string(),
                        String::from_utf8_lossy(&stderr_buf).to_string(),
                        (true, false),
                        child.wait().await,
                    );
                }
            }
        } else {
            wait_fut.await
        };

        (
            String::from_utf8_lossy(&stdout_buf).to_string(),
            String::from_utf8_lossy(&stderr_buf).to_string(),
            (false, false),
            result,
        )
    }

    async fn collect_streaming(
        mut child: tokio::process::Child,
        capture: bool,
        timeout_ms: Option<u64>,
        start: Instant,
        tx: mpsc::Sender<StreamEvent>,
    ) -> ProcessOutput {
        let mut stdout_buf = Vec::new();
        let mut stderr_buf = Vec::new();

        if let Some(mut out) = child.stdout.take() {
            // 简易按行流式
            Self::pipe_stream(&mut out, StreamKind::Stdout, &tx, &mut stdout_buf, capture).await;
        }
        if let Some(mut err) = child.stderr.take() {
            Self::pipe_stream(&mut err, StreamKind::Stderr, &tx, &mut stderr_buf, capture).await;
        }

        let wait = child.wait();
        let timed_out;
        let status = if let Some(t) = timeout_ms {
            match tokio::time::timeout(Duration::from_millis(t), wait).await {
                Ok(r) => {
                    timed_out = false;
                    r
                }
                Err(_) => {
                    let _ = child.kill().await;
                    timed_out = true;
                    child.wait().await
                }
            }
        } else {
            timed_out = false;
            wait.await
        };

        let success = !timed_out && matches!(&status, Ok(s) if s.success());
        let output = ProcessOutput {
            status: status.ok().and_then(|s| s.code()),
            success,
            stdout: String::from_utf8_lossy(&stdout_buf).to_string(),
            stderr: String::from_utf8_lossy(&stderr_buf).to_string(),
            duration_ms: start.elapsed().as_millis() as u64,
            timed_out,
        };
        let _ = tx.send(StreamEvent::Exit(output.clone())).await;
        output
    }

    async fn pipe_stream<R>(
        reader: &mut R,
        kind: StreamKind,
        tx: &mpsc::Sender<StreamEvent>,
        buf: &mut Vec<u8>,
        capture: bool,
    ) where
        R: tokio::io::AsyncRead + Unpin,
    {
        let mut tmp = [0u8; 4096];
        let mut line_buf = String::new();
        loop {
            match reader.read(&mut tmp).await {
                Ok(0) => break,
                Ok(n) => {
                    if capture {
                        buf.extend_from_slice(&tmp[..n]);
                    }
                    // 简易按行切分
                    let chunk = String::from_utf8_lossy(&tmp[..n]);
                    for ch in chunk.chars() {
                        if ch == '\n' {
                            if !line_buf.is_empty() {
                                let line = std::mem::take(&mut line_buf);
                                let _ = tx.send(StreamEvent::Line(kind, line)).await;
                            }
                        } else {
                            line_buf.push(ch);
                        }
                    }
                }
                Err(e) => {
                    debug!("读取流失败: {}", e);
                    break;
                }
            }
        }
        if !line_buf.is_empty() {
            let line = std::mem::take(&mut line_buf);
            let _ = tx.send(StreamEvent::Line(kind, line)).await;
        }
    }
}

impl Default for ProcessRunner {
    fn default() -> Self {
        Self::new()
    }
}

/// 流事件
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum StreamEvent {
    /// 一行输出
    Line(StreamKind, String),
    /// 进程退出
    Exit(ProcessOutput),
    /// 启动失败
    Error(String),
}

/// 流类型
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum StreamKind {
    Stdout,
    Stderr,
}

// Unix-only libc binding
#[cfg(unix)]
mod libc {
    extern "C" {
        pub fn setpgid(pid: i32, pgid: i32) -> i32;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn echo_command_runs() {
        let spec = if cfg!(target_os = "windows") {
            CommandSpec::new("cmd", ["/C", "echo hello"])
        } else {
            CommandSpec::new("sh", ["-c", "echo hello"])
        };
        let runner = ProcessRunner::new();
        let out = runner.run(&spec).await;
        assert!(out.success, "stderr: {}", out.stderr);
        assert!(out.stdout.contains("hello"));
    }

    #[tokio::test]
    async fn timeout_kills_long_command() {
        let spec = if cfg!(target_os = "windows") {
            CommandSpec::new("cmd", ["/C", "ping -n 3 127.0.0.1 > NUL"]).with_timeout(200)
        } else {
            CommandSpec::new("sh", ["-c", "sleep 3"]).with_timeout(200)
        };
        let runner = ProcessRunner::new();
        let out = runner.run(&spec).await;
        assert!(out.timed_out, "expected timeout, got {:?}", out);
    }

    #[tokio::test]
    async fn env_and_cwd_applied() {
        let tmp = std::env::temp_dir();
        let spec = if cfg!(target_os = "windows") {
            CommandSpec::new("cmd", ["/C", "echo %REMI_TEST_VAR%"])
                .with_env("REMI_TEST_VAR", "world")
                .with_cwd(&tmp)
        } else {
            CommandSpec::new("sh", ["-c", "echo $REMI_TEST_VAR"])
                .with_env("REMI_TEST_VAR", "world")
                .with_cwd(&tmp)
        };
        let runner = ProcessRunner::new();
        let out = runner.run(&spec).await;
        assert!(out.success, "stderr: {}", out.stderr);
        assert!(out.stdout.contains("world"));
    }

    #[tokio::test]
    async fn failed_command_returns_error() {
        let spec = if cfg!(target_os = "windows") {
            CommandSpec::new("cmd", ["/C", "exit 7"])
        } else {
            CommandSpec::new("sh", ["-c", "exit 7"])
        };
        let runner = ProcessRunner::new();
        let out = runner.run(&spec).await;
        assert!(!out.success);
        assert_eq!(out.status, Some(7));
    }
}
