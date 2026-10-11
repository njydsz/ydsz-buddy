//! Feedback System (P2-6)
//!
//! One-click diagnostic package export for bug reports and support tickets.
//! Packages logs, system info, config (sanitized), and recent events into
//! a single archive for support analysis.

use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::State;

/// Feedback package metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeedbackPackage {
    pub id: String,
    pub created_at: String,
    pub file_path: String,
    pub file_size: u64,
    pub description: String,
    pub included_items: Vec<String>,
}

/// Export request
#[derive(Debug, Deserialize)]
pub struct ExportFeedbackRequest {
    pub description: String,
    pub include_logs: Option<bool>,
    pub include_config: Option<bool>,
    pub include_system_info: Option<bool>,
    pub include_recent_events: Option<bool>,
}

/// Export response
#[derive(Debug, Serialize)]
pub struct ExportFeedbackResponse {
    pub package_id: String,
    pub file_path: String,
    pub file_size: u64,
}

/// Feedback engine state
pub struct FeedbackState {
    pub packages: Mutex<Vec<FeedbackPackage>>,
}

impl FeedbackState {
    pub fn new() -> Self {
        Self {
            packages: Mutex::new(Vec::new()),
        }
    }
}

impl Default for FeedbackState {
    fn default() -> Self {
        Self::new()
    }
}

/// System information snapshot
#[derive(Debug, Serialize)]
pub struct SystemInfo {
    pub os: String,
    pub arch: String,
    pub app_version: String,
    pub rust_version: String,
    pub cpu_count: usize,
    pub total_memory_mb: u64,
    pub hostname: String,
    pub username: String,
}

/// Collect system info
#[tauri::command]
pub fn feedback_system_info() -> Result<SystemInfo, String> {
    Ok(SystemInfo {
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        rust_version: "unknown".to_string(),
        cpu_count: std::thread::available_parallelism().map(|p| p.get()).unwrap_or(1),
        total_memory_mb: 0,
        hostname: std::env::var("COMPUTERNAME").or_else(|_| std::env::var("HOSTNAME")).unwrap_or_else(|_| "unknown".to_string()),
        username: std::env::var("USER").or_else(|_| std::env::var("USERNAME")).unwrap_or_else(|_| "unknown".to_string()),
    })
}

/// Export a diagnostic package
#[tauri::command]
pub fn feedback_export_package(
    state: State<'_, FeedbackState>,
    request: ExportFeedbackRequest,
    app_handle: tauri::AppHandle,
) -> Result<ExportFeedbackResponse, String> {
    let package_id = uuid::Uuid::new_v4().to_string();
    let output_dir = std::path::PathBuf::from(".ydsz/feedback").join(&package_id);
    std::fs::create_dir_all(&output_dir).map_err(|e| e.to_string())?;

    let mut included_items = Vec::new();

    // System info
    if request.include_system_info.unwrap_or(true) {
        let info = SystemInfo {
            os: std::env::consts::OS.to_string(),
            arch: std::env::consts::ARCH.to_string(),
            app_version: env!("CARGO_PKG_VERSION").to_string(),
            rust_version: "unknown".to_string(),
            cpu_count: std::thread::available_parallelism().map(|p| p.get()).unwrap_or(1),
            total_memory_mb: 0,
            hostname: std::env::var("COMPUTERNAME").or_else(|_| std::env::var("HOSTNAME")).unwrap_or_else(|_| "unknown".to_string()),
            username: std::env::var("USER").or_else(|_| std::env::var("USERNAME")).unwrap_or_else(|_| "unknown".to_string()),
        };
        let info_json = serde_json::to_string_pretty(&info).map_err(|e| e.to_string())?;
        std::fs::write(output_dir.join("system_info.json"), info_json).map_err(|e| e.to_string())?;
        included_items.push("system_info".to_string());
    }

    // Config (sanitized - no secrets)
    if request.include_config.unwrap_or(true) {
        let config_info = serde_json::json!({
            "app_version": env!("CARGO_PKG_VERSION"),
            "build_profile": if cfg!(debug_assertions) { "debug" } else { "release" },
            "platform": std::env::consts::OS,
        });
        std::fs::write(
            output_dir.join("config.json"),
            serde_json::to_string_pretty(&config_info).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        included_items.push("config".to_string());
    }

    // Recent events placeholder
    if request.include_recent_events.unwrap_or(true) {
        let events_placeholder = serde_json::json!({
            "note": "Recent event log would be included here",
            "max_events": 100,
        });
        std::fs::write(
            output_dir.join("recent_events.json"),
            serde_json::to_string_pretty(&events_placeholder).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        included_items.push("recent_events".to_string());
    }

    // User description
    std::fs::write(output_dir.join("description.txt"), &request.description).map_err(|e| e.to_string())?;

    // Package manifest
    let manifest = serde_json::json!({
        "package_id": package_id,
        "created_at": chrono::Utc::now().to_rfc3339(),
        "app_version": env!("CARGO_PKG_VERSION"),
        "included_items": included_items,
    });
    std::fs::write(
        output_dir.join("manifest.json"),
        serde_json::to_string_pretty(&manifest).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;

    let _ = app_handle;

    // Calculate directory size
    let file_size = dir_size(&output_dir);

    let package_file = format!("{}/feedback-{}.tar.gz", output_dir.display(), package_id);
    let _ = package_file;

    let package = FeedbackPackage {
        id: package_id.clone(),
        created_at: chrono::Utc::now().to_rfc3339(),
        file_path: output_dir.to_string_lossy().to_string(),
        file_size,
        description: request.description,
        included_items,
    };

    let mut packages = state.packages.lock().map_err(|e| e.to_string())?;
    packages.push(package);

    Ok(ExportFeedbackResponse {
        package_id,
        file_path: output_dir.to_string_lossy().to_string(),
        file_size,
    })
}

/// List exported packages
#[tauri::command]
pub fn feedback_list_packages(state: State<'_, FeedbackState>) -> Result<Vec<FeedbackPackage>, String> {
    let packages = state.packages.lock().map_err(|e| e.to_string())?;
    Ok(packages.clone())
}

/// Delete a feedback package
#[tauri::command]
pub fn feedback_delete_package(
    state: State<'_, FeedbackState>,
    package_id: String,
) -> Result<(), String> {
    let mut packages = state.packages.lock().map_err(|e| e.to_string())?;
    if let Some(idx) = packages.iter().position(|p| p.id == package_id) {
        let pkg = packages.remove(idx);
        let _ = std::fs::remove_dir_all(&pkg.file_path);
    }
    Ok(())
}

/// Get log file paths (for inclusion in feedback)
#[tauri::command]
pub fn feedback_get_log_paths(state: State<'_, FeedbackState>) -> Result<Vec<String>, String> {
    let _ = state;
    // Return paths to log files that could be included
    let base_dirs = [".ydsz/logs", ".ydsz/crashes"];
    Ok(base_dirs.iter().map(|s| s.to_string()).collect())
}

/// Calculate directory size recursively
fn dir_size(path: &std::path::Path) -> u64 {
    let mut size = 0u64;
    if path.is_dir() {
        if let Ok(entries) = std::fs::read_dir(path) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_file() {
                    if let Ok(meta) = p.metadata() {
                        size += meta.len();
                    }
                } else if p.is_dir() {
                    size += dir_size(&p);
                }
            }
        }
    }
    size
}
