// Backend process management
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use anyhow::{Context, Result};
use tracing::{error, info, warn};

use crate::state::AppState;

pub struct BackendServer {
    child: Arc<tokio::sync::Mutex<Option<Child>>>,
    restart_attempt: Arc<tokio::sync::Mutex<u32>>,
}

/// Resolved backend entry metadata used when spawning the process.
struct BackendEntry {
    /// Path to the executable or script to run.
    path: PathBuf,
    /// If true, the entry is a Node script that must be launched with `node`.
    is_node_script: bool,
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

    /// Returns true if the legacy Node/TypeScript backend should be spawned.
    ///
    /// The migration goal is Rust (`remi-server`) by default. Set
    /// `REMI_CODE_LEGACY_NODE_BACKEND=1` to fall back to the old
    /// `apps/server/dist/index.mjs` path during the transition period.
    fn use_legacy_node_backend() -> bool {
        std::env::var("REMI_CODE_LEGACY_NODE_BACKEND")
            .map(|v| matches!(v.as_str(), "1" | "true" | "yes"))
            .unwrap_or(false)
    }

    /// Resolve the backend entry point path.
    ///
    /// Prefers the Rust `remi-server` binary. Falls back to the legacy Node
    /// backend only when `REMI_CODE_LEGACY_NODE_BACKEND=1` is set.
    fn resolve_backend_entry() -> Result<BackendEntry> {
        if Self::use_legacy_node_backend() {
            let path = Self::resolve_legacy_node_backend_entry()?;
            return Ok(BackendEntry {
                path,
                is_node_script: true,
            });
        }

        let path = Self::resolve_rust_backend_entry()?;
        Ok(BackendEntry {
            path,
            is_node_script: false,
        })
    }

    /// Resolve the Rust `remi-server` binary path.
    fn resolve_rust_backend_entry() -> Result<PathBuf> {
        let exe_path = std::env::current_exe().context("Failed to get current exe path")?;
        let exe_dir = exe_path
            .parent()
            .ok_or_else(|| anyhow::anyhow!("Failed to get exe directory"))?;

        // Development: the Tauri binary lives under
        //   target/<profile>/remi-code-desktop.exe
        // Going up 3 ancestors lands at the workspace root, where the
        // remi-server binary is at target/<profile>/remi-server[.exe].
        let profile_dir = if cfg!(debug_assertions) {
            "debug"
        } else {
            "release"
        };
        let dev_entry = exe_dir
            .ancestors()
            .nth(3)
            .map(|workspace_root| {
                Self::with_platform_exe_extension(
                    workspace_root.join("target").join(profile_dir).join("remi-server"),
                )
            });

        if let Some(ref dev_path) = dev_entry {
            if dev_path.exists() {
                info!("Using dev Rust backend entry: {}", dev_path.display());
                return Ok(dev_path.clone());
            }
        }

        // Production: sidecar binary next to the app executable.
        let prod_entry = Self::with_platform_exe_extension(exe_dir.join("remi-server"));
        if prod_entry.exists() {
            info!("Using prod Rust backend entry: {}", prod_entry.display());
            return Ok(prod_entry);
        }

        // Fallback: bundled under resources/bin.
        let resource_entry = Self::with_platform_exe_extension(
            exe_dir
                .join("resources")
                .join("bin")
                .join("remi-server"),
        );
        if resource_entry.exists() {
            info!(
                "Using resource Rust backend entry: {}",
                resource_entry.display()
            );
            return Ok(resource_entry);
        }

        anyhow::bail!(
            "Rust backend binary not found. Tried:\n  - {:?}\n  - {}\n  - {}\nSet REMI_CODE_LEGACY_NODE_BACKEND=1 to use the legacy Node backend.",
            dev_entry,
            prod_entry.display(),
            resource_entry.display()
        )
    }

    /// Resolve the legacy Node/TypeScript backend entry point path.
    fn resolve_legacy_node_backend_entry() -> Result<PathBuf> {
        let exe_path = std::env::current_exe().context("Failed to get current exe path")?;
        let exe_dir = exe_path
            .parent()
            .ok_or_else(|| anyhow::anyhow!("Failed to get exe directory"))?;

        let dev_entry = exe_dir
            .ancestors()
            .nth(3)
            .map(|p| p.join("apps").join("server").join("dist").join("index.mjs"));

        if let Some(ref dev_path) = dev_entry {
            if dev_path.exists() {
                info!("Using legacy dev backend entry: {}", dev_path.display());
                return Ok(dev_path.clone());
            }
        }

        let prod_entry = exe_dir
            .join("resources")
            .join("apps")
            .join("server")
            .join("dist")
            .join("index.mjs");
        if prod_entry.exists() {
            info!(
                "Using legacy prod backend entry: {}",
                prod_entry.display()
            );
            return Ok(prod_entry);
        }

        let cwd_entry = PathBuf::from("apps/server/dist/index.mjs");
        if cwd_entry.exists() {
            info!("Using legacy CWD backend entry: {}", cwd_entry.display());
            return Ok(cwd_entry);
        }

        anyhow::bail!(
            "Legacy Node backend entry not found. Tried:\n  - {:?}\n  - {}\n  - {}",
            dev_entry,
            prod_entry.display(),
            cwd_entry.display()
        )
    }

    /// Resolve the backend working directory.
    fn resolve_backend_cwd() -> Result<PathBuf> {
        let exe_path = std::env::current_exe().context("Failed to get current exe path")?;
        let exe_dir = exe_path
            .parent()
            .ok_or_else(|| anyhow::anyhow!("Failed to get exe directory"))?;

        // In development the workspace root is a few levels above the binary.
        let dev_cwd = exe_dir.ancestors().nth(3).map(PathBuf::from);
        if let Some(ref dev_path) = dev_cwd {
            let rust_marker = dev_path.join("Cargo.toml");
            let node_marker = dev_path.join("apps/server/dist/index.mjs");
            if rust_marker.exists() || node_marker.exists() {
                return Ok(dev_path.clone());
            }
        }

        // In production use the directory containing the app executable.
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

    /// Append the platform executable extension when needed.
    fn with_platform_exe_extension(path: PathBuf) -> PathBuf {
        #[cfg(windows)]
        {
            if path.extension().is_none() {
                return path.with_extension("exe");
            }
        }
        path
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

        info!("Starting backend server at {}", backend_entry.path.display());
        info!("Backend CWD: {}", backend_cwd.display());
        info!("Backend base dir: {}", base_dir);

        let mut command = if backend_entry.is_node_script {
            let mut cmd = Command::new("node");
            cmd.arg(&backend_entry.path);
            cmd
        } else {
            Command::new(&backend_entry.path)
        };

        let mut child = command
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
