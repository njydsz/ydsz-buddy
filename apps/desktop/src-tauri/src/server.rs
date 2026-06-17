// Backend process management
use std::process::Stdio;
use std::sync::Arc;
use tokio::process::{Child, Command};
use tokio::io::{AsyncBufReadExt, BufReader};
use anyhow::{Result, Context};
use tracing::{info, warn, error};

use crate::state::AppState;

pub struct BackendServer {
    child: Arc<tokio::sync::Mutex<Option<Child>>>,
    restart_attempt: Arc<tokio::sync::Mutex<u32>>,
}

impl BackendServer {
    pub fn new() -> Self {
        Self {
            child: Arc::new(tokio::sync::Mutex::new(None)),
            restart_attempt: Arc::new(tokio::sync::Mutex::new(0)),
        }
    }

    /// Reserve a random available loopback port
    pub async fn reserve_port() -> Result<u16> {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .context("Failed to bind to loopback")?;
        let port = listener.local_addr()?.port();
        drop(listener);
        Ok(port)
    }

    /// Generate a random auth token (hex-encoded 24 random bytes)
    pub fn generate_auth_token() -> String {
        use rand::RngCore;
        let mut bytes = [0u8; 24];
        rand::thread_rng().fill_bytes(&mut bytes);
        hex::encode(bytes)
    }

    /// Resolve the backend entry point path
    fn resolve_backend_entry() -> Result<std::path::PathBuf> {
        let exe_path = std::env::current_exe().context("Failed to get current exe path")?;
        let exe_dir = exe_path.parent()
            .ok_or_else(|| anyhow::anyhow!("Failed to get exe directory"))?;

        // In development: look for apps/server/dist/index.mjs relative to workspace root
        // Workspace root is typically 3 levels up from target/debug or target/release
        let dev_entry = exe_dir
            .ancestors()
            .nth(3)
            .map(|p| p.join("apps").join("server").join("dist").join("index.mjs"));

        if let Some(ref dev_path) = dev_entry {
            if dev_path.exists() {
                info!("Using dev backend entry: {}", dev_path.display());
                return Ok(dev_path.clone());
            }
        }

        // In production: look relative to resources directory
        let prod_entry = exe_dir.join("resources").join("apps").join("server").join("dist").join("index.mjs");
        if prod_entry.exists() {
            info!("Using prod backend entry: {}", prod_entry.display());
            return Ok(prod_entry);
        }

        // Fallback: try current directory
        let cwd_entry = std::path::PathBuf::from("apps/server/dist/index.mjs");
        if cwd_entry.exists() {
            info!("Using CWD backend entry: {}", cwd_entry.display());
            return Ok(cwd_entry);
        }

        anyhow::bail!("Backend entry not found. Tried:\n  - {:?}\n  - {}", dev_entry, prod_entry.display())
    }

    /// Resolve the backend working directory
    fn resolve_backend_cwd() -> Result<std::path::PathBuf> {
        let exe_path = std::env::current_exe().context("Failed to get current exe path")?;
        let exe_dir = exe_path.parent()
            .ok_or_else(|| anyhow::anyhow!("Failed to get exe directory"))?;

        // In development: use monorepo root (3 levels up)
        let dev_cwd = exe_dir.ancestors().nth(3).map(|p| p.to_path_buf());
        if let Some(ref dev_path) = dev_cwd {
            if dev_path.join("apps/server/dist/index.mjs").exists() {
                return Ok(dev_path.clone());
            }
        }

        // In production: use exe directory
        Ok(exe_dir.to_path_buf())
    }

    /// Resolve the base directory for app data
    fn resolve_base_dir() -> Result<String> {
        if let Ok(home) = std::env::var("REMI_CODE_HOME") {
            return Ok(home);
        }

        let home = dirs::home_dir()
            .ok_or_else(|| anyhow::anyhow!("Failed to get home directory"))?;
        Ok(home.join(".remi-code").to_string_lossy().to_string())
    }

    /// Start the backend server process
    pub async fn start(
        &self,
        state: Arc<AppState>,
        port: u16,
        auth_token: String,
    ) -> Result<()> {
        let backend_entry = Self::resolve_backend_entry()?;
        let backend_cwd = Self::resolve_backend_cwd()?;
        let base_dir = Self::resolve_base_dir()?;

        info!("Starting backend server at {}", backend_entry.display());
        info!("Backend CWD: {}", backend_cwd.display());
        info!("Backend base dir: {}", base_dir);

        let mut child = Command::new("node")
            .arg(&backend_entry)
            .current_dir(&backend_cwd)
            .env("REMI_CODE_MODE", "desktop")
            .env("REMI_CODE_NO_BROWSER", "1")
            .env("REMI_CODE_PORT", port.to_string())
            .env("REMI_CODE_HOME", &base_dir)
            .env("REMI_CODE_AUTH_TOKEN", &auth_token)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .context("Failed to spawn backend process")?;

        // Capture stdout
        if let Some(stdout) = child.stdout.take() {
            let stdout_reader = BufReader::new(stdout);
            let mut stdout_lines = stdout_reader.lines();
            tokio::spawn(async move {
                while let Ok(Some(line)) = stdout_lines.next_line().await {
                    info!("[backend:stdout] {}", line);
                }
            });
        }

        // Capture stderr
        if let Some(stderr) = child.stderr.take() {
            let stderr_reader = BufReader::new(stderr);
            let mut stderr_lines = stderr_reader.lines();
            tokio::spawn(async move {
                while let Ok(Some(line)) = stderr_lines.next_line().await {
                    warn!("[backend:stderr] {}", line);
                }
            });
        }

        // Update state
        {
            let mut port_lock = state.backend_port.write();
            *port_lock = port;
        }
        {
            let mut token_lock = state.backend_auth_token.write();
            *token_lock = auth_token.clone();
        }
        {
            let mut http_url_lock = state.backend_http_url.write();
            *http_url_lock = format!("http://127.0.0.1:{}", port);
        }
        {
            let mut ws_url_lock = state.backend_ws_url.write();
            *ws_url_lock = format!("ws://127.0.0.1:{}/?token={}", port, auth_token);
        }

        // Store child process
        {
            let mut child_lock = self.child.lock().await;
            *child_lock = Some(child);
        }

        // Reset restart attempts on successful start
        {
            let mut attempts = self.restart_attempt.lock().await;
            *attempts = 0;
        }

        info!("Backend server started successfully on port {}", port);
        Ok(())
    }

    /// Stop the backend server gracefully
    pub async fn stop(&self) -> Result<()> {
        let mut child_lock = self.child.lock().await;
        if let Some(mut child) = child_lock.take() {
            info!("Stopping backend server...");

            // Try graceful shutdown first (SIGTERM on Unix, kill on Windows)
            #[cfg(unix)]
            {
                use std::os::unix::process::CommandExt;
                if let Some(pid) = child.id() {
                    unsafe {
                        libc::kill(pid as i32, libc::SIGTERM);
                    }
                }

                // Wait up to 8 seconds for graceful shutdown
                let timeout = tokio::time::Duration::from_secs(8);
                match tokio::time::timeout(timeout, child.wait()).await {
                    Ok(Ok(status)) => {
                        info!("Backend server stopped gracefully: {}", status);
                        return Ok(());
                    }
                    Ok(Err(e)) => {
                        warn!("Error waiting for backend to stop: {}", e);
                    }
                    Err(_) => {
                        warn!("Backend did not stop gracefully, forcing kill...");
                    }
                }
            }

            // Force kill if graceful shutdown failed or on Windows
            match child.kill().await {
                Ok(_) => {
                    info!("Backend server force killed");
                    let _ = child.wait().await;
                }
                Err(e) => {
                    error!("Failed to kill backend server: {}", e);
                }
            }
        }
        Ok(())
    }

    /// Get the current restart attempt count
    pub async fn get_restart_attempt(&self) -> u32 {
        *self.restart_attempt.lock().await
    }

    /// Increment and get the new restart attempt count
    pub async fn increment_restart_attempt(&self) -> u32 {
        let mut attempts = self.restart_attempt.lock().await;
        *attempts += 1;
        *attempts
    }

    /// Calculate backoff delay based on restart attempts (exponential backoff)
    pub fn calculate_backoff(attempt: u32) -> tokio::time::Duration {
        let base_ms = 1000u64;
        let max_ms = 30000u64;
        let delay_ms = (base_ms * 2u64.pow(attempt.min(5))).min(max_ms);
        tokio::time::Duration::from_millis(delay_ms)
    }
}

impl Drop for BackendServer {
    fn drop(&mut self) {
        // Synchronous cleanup on drop
        if let Ok(mut child_lock) = self.child.try_lock() {
            if let Some(mut child) = child_lock.take() {
                let _ = child.start_kill();
            }
        }
    }
}
