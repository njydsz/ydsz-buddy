// Auto-updater management for Tauri 2
use anyhow::Result;
use tracing::{info, warn, error};
use tauri::{AppHandle, Emitter};
use tauri_plugin_updater::UpdaterExt;
use serde::Deserialize;

use crate::state::{AppState, UpdateState};
use crate::commands::UpdateActionResult;

pub struct UpdaterManager {
    #[allow(dead_code)]
    github_owner: String,
    #[allow(dead_code)]
    github_repo: String,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct GitHubRelease {
    tag_name: String,
    prerelease: bool,
    draft: bool,
    assets: Vec<GitHubAsset>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct GitHubAsset {
    name: String,
    browser_download_url: String,
}

impl UpdaterManager {
    pub fn new() -> Self {
        Self {
            github_owner: "RemiCode-AI".to_string(),
            github_repo: "RemiCode".to_string(),
        }
    }

    pub async fn check_for_updates(&self, app: &AppHandle, state: &AppState) -> Result<UpdateState> {
        info!("Checking for updates...");
        
        {
            let mut update_state = state.update_state.write();
            update_state.status = "checking".to_string();
            update_state.checked_at = Some(chrono::Utc::now().to_rfc3339());
            let _ = app.emit("update-state", &*update_state);
        }

        // Use Tauri's updater plugin to check for updates
        match app.updater() {
            Ok(updater) => {
                match updater.check().await {
                    Ok(Some(update)) => {
                        let latest_version = update.version.clone();
                        let current_version = env!("CARGO_PKG_VERSION").to_string();

                        let mut update_state = state.update_state.write();
                        update_state.checked_at = Some(chrono::Utc::now().to_rfc3339());

                        if Self::compare_versions(&latest_version, &current_version) > 0 {
                            info!("Update available: {} -> {}", current_version, latest_version);
                            update_state.status = "available".to_string();
                            update_state.available_version = Some(latest_version);
                            update_state.message = update.body.clone();
                            update_state.can_retry = false;
                        } else {
                            info!("Application is up to date");
                            update_state.status = "up-to-date".to_string();
                            update_state.available_version = None;
                            update_state.message = None;
                            update_state.can_retry = false;
                        }

                        let _ = app.emit("update-state", &*update_state);
                        return Ok(update_state.clone());
                    }
                    Ok(None) => {
                        info!("No update available");
                        let mut update_state = state.update_state.write();
                        update_state.status = "up-to-date".to_string();
                        update_state.checked_at = Some(chrono::Utc::now().to_rfc3339());
                        update_state.available_version = None;
                        update_state.message = None;
                        update_state.can_retry = false;
                        let _ = app.emit("update-state", &*update_state);
                        return Ok(update_state.clone());
                    }
                    Err(e) => {
                        error!("Failed to check for updates: {}", e);
                        let mut update_state = state.update_state.write();
                        update_state.status = "error".to_string();
                        update_state.error_context = Some(format!("Update check failed: {}", e));
                        update_state.can_retry = true;
                        let _ = app.emit("update-state", &*update_state);
                        return Ok(update_state.clone());
                    }
                }
            }
            Err(e) => {
                error!("Failed to get updater: {}", e);
                let mut update_state = state.update_state.write();
                update_state.status = "error".to_string();
                update_state.error_context = Some(format!("Failed to get updater: {}", e));
                update_state.can_retry = true;
                let _ = app.emit("update-state", &*update_state);
                return Ok(update_state.clone());
            }
        }
    }

    pub async fn download_update(&self, app: &AppHandle, state: &AppState) -> Result<UpdateActionResult> {
        info!("Downloading update...");
        
        {
            let update_state = state.update_state.read();
            if update_state.available_version.is_none() {
                return Ok(UpdateActionResult {
                    success: false,
                    message: Some("No update available".to_string()),
                });
            }
        }

        {
            let mut update_state = state.update_state.write();
            update_state.status = "downloading".to_string();
            update_state.download_percent = Some(0.0);
            let _ = app.emit("update-state", &*update_state);
        }

        // Use Tauri's updater plugin to download the update
        match app.updater() {
            Ok(updater) => {
                match updater.check().await {
                    Ok(Some(update)) => {
                        // Download with progress callback
                        let state_ref = state.clone();
                        let app_ref = app.clone();
                        let on_chunk = move |chunk_length: usize, content_length: Option<u64>| {
                            if let Some(total) = content_length {
                                let percent = (chunk_length as f64 / total as f64) * 100.0;
                                let mut update_state = state_ref.update_state.write();
                                update_state.download_percent = Some(percent);
                                let _ = app_ref.emit("update-state", &*update_state);
                            }
                        };
                        let on_body = move || {};

                        match update.download(on_chunk, on_body).await {
                            Ok(bytes) => {
                                // Store downloaded bytes for later install
                                *state.downloaded_bytes.write() = Some(bytes);

                                let mut update_state = state.update_state.write();
                                update_state.status = "downloaded".to_string();
                                update_state.downloaded_version = update_state.available_version.clone();
                                update_state.download_percent = Some(100.0);
                                let _ = app.emit("update-state", &*update_state);

                                info!("Update downloaded successfully");
                                Ok(UpdateActionResult {
                                    success: true,
                                    message: Some("Update downloaded successfully".to_string()),
                                })
                            }
                            Err(e) => {
                                error!("Failed to download update: {}", e);
                                let mut update_state = state.update_state.write();
                                update_state.status = "error".to_string();
                                update_state.error_context = Some(format!("Download failed: {}", e));
                                update_state.can_retry = true;
                                let _ = app.emit("update-state", &*update_state);

                                Ok(UpdateActionResult {
                                    success: false,
                                    message: Some(format!("Download failed: {}", e)),
                                })
                            }
                        }
                    }
                    Ok(None) => {
                        warn!("No update available to download");
                        Ok(UpdateActionResult {
                            success: false,
                            message: Some("No update available".to_string()),
                        })
                    }
                    Err(e) => {
                        error!("Failed to check for update: {}", e);
                        let mut update_state = state.update_state.write();
                        update_state.status = "error".to_string();
                        update_state.error_context = Some(format!("Update check failed: {}", e));
                        update_state.can_retry = true;
                        let _ = app.emit("update-state", &*update_state);

                        Ok(UpdateActionResult {
                            success: false,
                            message: Some(format!("Update check failed: {}", e)),
                        })
                    }
                }
            }
            Err(e) => {
                error!("Failed to get updater: {}", e);
                Ok(UpdateActionResult {
                    success: false,
                    message: Some(format!("Failed to get updater: {}", e)),
                })
            }
        }
    }

    pub async fn install_update(&self, app: &AppHandle, state: &AppState) -> Result<UpdateActionResult> {
        info!("Installing update...");
        
        {
            let update_state = state.update_state.read();
            if update_state.downloaded_version.is_none() {
                return Ok(UpdateActionResult {
                    success: false,
                    message: Some("No update downloaded".to_string()),
                });
            }
        }

        // Get the downloaded bytes
        let bytes = state.downloaded_bytes.read().clone();
        match bytes {
            Some(bytes) => {
                // Use Tauri's updater plugin to install the update
                match app.updater() {
                    Ok(updater) => {
                        match updater.check().await {
                            Ok(Some(update)) => {
                                // Install the update using the downloaded bytes
                                match update.install(bytes) {
                                    Ok(_) => {
                                        info!("Update installed successfully, restarting...");
                                        Ok(UpdateActionResult {
                                            success: true,
                                            message: Some("Update installed, restarting application".to_string()),
                                        })
                                    }
                                    Err(e) => {
                                        error!("Failed to install update: {}", e);
                                        let mut update_state = state.update_state.write();
                                        update_state.status = "error".to_string();
                                        update_state.error_context = Some(format!("Install failed: {}", e));
                                        update_state.can_retry = true;
                                        let _ = app.emit("update-state", &*update_state);

                                        Ok(UpdateActionResult {
                                            success: false,
                                            message: Some(format!("Install failed: {}", e)),
                                        })
                                    }
                                }
                            }
                            Ok(None) => {
                                warn!("No update available to install");
                                Ok(UpdateActionResult {
                                    success: false,
                                    message: Some("No update available".to_string()),
                                })
                            }
                            Err(e) => {
                                error!("Failed to check for update: {}", e);
                                Ok(UpdateActionResult {
                                    success: false,
                                    message: Some(format!("Update check failed: {}", e)),
                                })
                            }
                        }
                    }
                    Err(e) => {
                        error!("Failed to get updater: {}", e);
                        Ok(UpdateActionResult {
                            success: false,
                            message: Some(format!("Failed to get updater: {}", e)),
                        })
                    }
                }
            }
            None => {
                Ok(UpdateActionResult {
                    success: false,
                    message: Some("No downloaded update data found".to_string()),
                })
            }
        }
    }

    /// Compare two semantic version strings
    /// Returns: > 0 if v1 > v2, < 0 if v1 < v2, 0 if equal
    fn compare_versions(v1: &str, v2: &str) -> i32 {
        let parse_version = |v: &str| -> Vec<u32> {
            v.split('.')
                .filter_map(|s| s.parse::<u32>().ok())
                .collect()
        };

        let v1_parts = parse_version(v1);
        let v2_parts = parse_version(v2);

        let max_len = v1_parts.len().max(v2_parts.len());

        for i in 0..max_len {
            let v1_part = v1_parts.get(i).copied().unwrap_or(0);
            let v2_part = v2_parts.get(i).copied().unwrap_or(0);

            if v1_part > v2_part {
                return 1;
            } else if v1_part < v2_part {
                return -1;
            }
        }

        0
    }
}
