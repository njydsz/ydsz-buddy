// Application state management
use std::sync::Arc;
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};

/// Mirrors the DesktopUpdateState from contracts
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateState {
    pub enabled: bool,
    pub status: String, // "disabled" | "idle" | "checking" | "up-to-date" | "available" | "downloading" | "downloaded" | "error"
    pub current_version: String,
    pub host_arch: String,
    pub app_arch: String,
    pub running_under_arm64_translation: bool,
    pub available_version: Option<String>,
    pub downloaded_version: Option<String>,
    pub download_percent: Option<f64>,
    pub checked_at: Option<String>,
    pub message: Option<String>,
    pub error_context: Option<String>,
    pub can_retry: bool,
}

impl Default for UpdateState {
    fn default() -> Self {
        Self {
            enabled: false,
            status: "disabled".into(),
            current_version: env!("CARGO_PKG_VERSION").into(),
            host_arch: std::env::consts::ARCH.into(),
            app_arch: std::env::consts::ARCH.into(),
            running_under_arm64_translation: false,
            available_version: None,
            downloaded_version: None,
            download_percent: None,
            checked_at: None,
            message: None,
            error_context: None,
            can_retry: false,
        }
    }
}

#[derive(Debug, Clone)]
pub struct AppState {
    pub backend_port: Arc<RwLock<u16>>,
    pub backend_auth_token: Arc<RwLock<String>>,
    pub backend_http_url: Arc<RwLock<String>>,
    pub backend_ws_url: Arc<RwLock<String>>,
    pub update_state: Arc<RwLock<UpdateState>>,
    pub is_quitting: Arc<RwLock<bool>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            backend_port: Arc::new(RwLock::new(0)),
            backend_auth_token: Arc::new(RwLock::new(String::new())),
            backend_http_url: Arc::new(RwLock::new(String::new())),
            backend_ws_url: Arc::new(RwLock::new(String::new())),
            update_state: Arc::new(RwLock::new(UpdateState::default())),
            is_quitting: Arc::new(RwLock::new(false)),
        }
    }
}
