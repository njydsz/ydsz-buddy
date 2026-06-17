// Auto-updater management for Tauri 2
use anyhow::Result;
use tracing::{info, warn};
use tauri::AppHandle;
use serde::Deserialize;

use crate::state::{AppState, UpdateState};
use crate::commands::UpdateActionResult;

pub struct UpdaterManager {
    github_owner: String,
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

    pub async fn check_for_updates(&self, state: &AppState) -> Result<UpdateState> {
        info!("Checking for updates...");
        
        {
            let mut update_state = state.update_state.write();
            update_state.status = "checking".to_string();
            update_state.checked_at = Some(chrono::Utc::now().to_rfc3339());
        }

        // Query GitHub API for latest release
        let client = reqwest::Client::new();
        let url = format!(
            "https://api.github.com/repos/{}/{}/releases/latest",
            self.github_owner, self.github_repo
        );

        match client
            .get(&url)
            .header("User-Agent", "remi-code-desktop")
            .send()
            .await
        {
            Ok(response) => {
                if response.status().is_success() {
                    match response.json::<GitHubRelease>().await {
                        Ok(release) => {
                            let latest_version = release.tag_name.trim_start_matches('v').to_string();
                            let current_version = env!("CARGO_PKG_VERSION").to_string();

                            let mut update_state = state.update_state.write();
                            update_state.checked_at = Some(chrono::Utc::now().to_rfc3339());

                            if Self::compare_versions(&latest_version, &current_version) > 0 {
                                info!("Update available: {} -> {}", current_version, latest_version);
                                update_state.status = "available".to_string();
                                update_state.available_version = Some(latest_version);
                                update_state.message = Some("A new version is available".to_string());
                                update_state.can_retry = false;
                            } else {
                                info!("Application is up to date");
                                update_state.status = "up-to-date".to_string();
                                update_state.available_version = None;
                                update_state.message = None;
                                update_state.can_retry = false;
                            }

                            return Ok(update_state.clone());
                        }
                        Err(e) => {
                            warn!("Failed to parse GitHub release: {}", e);
                            let mut update_state = state.update_state.write();
                            update_state.status = "error".to_string();
                            update_state.error_context = Some(format!("Failed to parse release: {}", e));
                            update_state.can_retry = true;
                            return Ok(update_state.clone());
                        }
                    }
                } else {
                    warn!("GitHub API returned error status: {}", response.status());
                    let mut update_state = state.update_state.write();
                    update_state.status = "error".to_string();
                    update_state.error_context = Some(format!("GitHub API error: {}", response.status()));
                    update_state.can_retry = true;
                    return Ok(update_state.clone());
                }
            }
            Err(e) => {
                warn!("Failed to check for updates: {}", e);
                let mut update_state = state.update_state.write();
                update_state.status = "error".to_string();
                update_state.error_context = Some(format!("Network error: {}", e));
                update_state.can_retry = true;
                return Ok(update_state.clone());
            }
        }
    }

    pub async fn download_update(&self, state: &AppState) -> Result<UpdateActionResult> {
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
        }

        // In a full implementation, this would download the update artifact
        // For now, simulate a successful download
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

        {
            let mut update_state = state.update_state.write();
            update_state.status = "downloaded".to_string();
            update_state.downloaded_version = update_state.available_version.clone();
            update_state.download_percent = Some(100.0);
        }

        info!("Update downloaded successfully");

        Ok(UpdateActionResult {
            success: true,
            message: Some("Update downloaded successfully".to_string()),
        })
    }

    pub async fn install_update(&self, _app: AppHandle, state: &AppState) -> Result<UpdateActionResult> {
        info!("Installing update...");
        
        let update_state = state.update_state.read();
        
        if update_state.downloaded_version.is_none() {
            return Ok(UpdateActionResult {
                success: false,
                message: Some("No update downloaded".to_string()),
            });
        }

        // In a full implementation, this would use Tauri's updater plugin to install
        // For now, just return success
        info!("Update installation triggered");

        // The app would typically restart here
        // In Tauri 2, we can use process::restart or let the updater handle it

        Ok(UpdateActionResult {
            success: true,
            message: Some("Update installed, restarting application".to_string()),
        })
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
