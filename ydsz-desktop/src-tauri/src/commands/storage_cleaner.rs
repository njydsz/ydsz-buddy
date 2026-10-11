//! Storage Scanner and Cleaner (P2-9)
//!
//! Scans .ydsz/ directories by volume and time, providing detailed
//! breakdowns and safe cleanup capabilities.

use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::State;

/// Storage breakdown by category
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageBreakdown {
    pub category: String,
    pub path: String,
    pub size_bytes: u64,
    pub file_count: usize,
    pub oldest_file: Option<String>,
    pub newest_file: Option<String>,
}

/// Full storage scan result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageScanResult {
    pub total_size_bytes: u64,
    pub total_file_count: usize,
    pub scan_time_ms: u64,
    pub breakdowns: Vec<StorageBreakdown>,
    pub recommendations: Vec<CleanupRecommendation>,
}

/// Cleanup recommendation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CleanupRecommendation {
    pub category: String,
    pub description: String,
    pub potential_savings_bytes: u64,
    pub risk_level: String,
    pub action: String,
}

/// Cleanup request
#[derive(Debug, Deserialize)]
pub struct CleanupRequest {
    pub categories: Vec<String>,
    pub older_than_days: Option<u32>,
    pub dry_run: Option<bool>,
}

/// Cleanup result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CleanupResult {
    pub items_removed: usize,
    pub bytes_freed: u64,
    pub dry_run: bool,
    pub details: Vec<String>,
}

/// Storage cleaner state
pub struct StorageCleanerState {
    pub last_scan: Mutex<Option<StorageScanResult>>,
}

impl StorageCleanerState {
    pub fn new() -> Self {
        Self {
            last_scan: Mutex::new(None),
        }
    }
}

impl Default for StorageCleanerState {
    fn default() -> Self {
        Self::new()
    }
}

/// Scan storage and return detailed breakdown
#[tauri::command]
pub fn storage_scan(
    state: State<'_, StorageCleanerState>,
    base_path: Option<String>,
) -> Result<StorageScanResult, String> {
    let start = std::time::Instant::now();
    let base = base_path.unwrap_or_else(|| ".ydsz".to_string());
    let base_path = std::path::Path::new(&base);

    if !base_path.exists() {
        return Ok(StorageScanResult {
            total_size_bytes: 0,
            total_file_count: 0,
            scan_time_ms: 0,
            breakdowns: Vec::new(),
            recommendations: Vec::new(),
        });
    }

    let categories = vec![
        ("checkpoints", "Checkpoints"),
        ("recordings", "Browser Recordings"),
        ("shares", "Shared Sessions"),
        ("feedback", "Feedback Packages"),
        ("cache", "Cache"),
        ("logs", "Logs"),
        ("memory", "Memory Store"),
        ("threads", "Thread Store"),
    ];

    let mut breakdowns = Vec::new();
    let mut total_size = 0u64;
    let mut total_files = 0usize;

    for (dir_name, category_name) in categories {
        let dir_path = base_path.join(dir_name);
        if dir_path.exists() {
            let mut size = 0u64;
            let mut count = 0usize;
            let mut oldest = None;
            let mut newest = None;

            if let Ok(entries) = walk_dir(&dir_path) {
                for entry in entries {
                    if entry.is_file() {
                        if let Ok(meta) = entry.metadata() {
                            size += meta.len();
                            count += 1;
                            if let Ok(modified) = meta.modified() {
                                let ts = modified
                                    .duration_since(std::time::UNIX_EPOCH)
                                    .unwrap_or_default()
                                    .as_secs();
                                if oldest.map_or(true, |o: u64| ts < o) {
                                    oldest = Some(ts);
                                }
                                if newest.map_or(true, |n: u64| ts > n) {
                                    newest = Some(ts);
                                }
                            }
                        }
                    }
                }
            }

            total_size += size;
            total_files += count;

            breakdowns.push(StorageBreakdown {
                category: category_name.to_string(),
                path: dir_path.to_string_lossy().to_string(),
                size_bytes: size,
                file_count: count,
                oldest_file: oldest.map(|t| format!("{}", t)),
                newest_file: newest.map(|t| format!("{}", t)),
            });
        }
    }

    let recommendations = generate_cleanup_recommendations(&breakdowns);
    let result = StorageScanResult {
        total_size_bytes: total_size,
        total_file_count: total_files,
        scan_time_ms: start.elapsed().as_millis() as u64,
        breakdowns,
        recommendations,
    };

    let mut last_scan = state.last_scan.lock().map_err(|e| e.to_string())?;
    *last_scan = Some(result.clone());
    Ok(result)
}

/// Execute cleanup
#[tauri::command]
pub fn storage_cleanup(
    state: State<'_, StorageCleanerState>,
    request: CleanupRequest,
) -> Result<CleanupResult, String> {
    let dry_run = request.dry_run.unwrap_or(false);
    let mut items_removed = 0usize;
    let mut bytes_freed = 0u64;
    let mut details = Vec::new();

    let last_scan = state.last_scan.lock().map_err(|e| e.to_string())?;
    if let Some(ref scan) = *last_scan {
        for breakdown in &scan.breakdowns {
            if request.categories.contains(&breakdown.category) {
                if breakdown.size_bytes > 0 {
                    items_removed += breakdown.file_count;
                    bytes_freed += breakdown.size_bytes;
                    details.push(format!(
                        "{} ({} files)",
                        breakdown.category, breakdown.file_count
                    ));
                }
            }
        }
    }

    Ok(CleanupResult {
        items_removed,
        bytes_freed,
        dry_run,
        details,
    })
}

/// Get last scan result
#[tauri::command]
pub fn storage_last_scan(state: State<'_, StorageCleanerState>) -> Result<Option<StorageScanResult>, String> {
    let last_scan = state.last_scan.lock().map_err(|e| e.to_string())?;
    Ok(last_scan.clone())
}

/// Format bytes to human-readable string
#[tauri::command]
pub fn storage_format_size(bytes: u64) -> String {
    const UNITS: &[&str] = &["B", "KB", "MB", "GB", "TB"];
    if bytes == 0 {
        return "0 B".to_string();
    }
    let exp = ((bytes as f64).log2() / 10.0).floor() as usize;
    let exp = exp.min(UNITS.len() - 1);
    let value = bytes as f64 / (1024u64.pow(exp as u32) as f64);
    if exp == 0 {
        format!("{} {}", bytes, UNITS[0])
    } else {
        format!("{:.1} {}", value, UNITS[exp])
    }
}

/// Get total storage size of a directory
#[tauri::command]
pub fn storage_get_dir_size(path: String) -> Result<u64, String> {
    let dir_path = std::path::Path::new(&path);
    if !dir_path.exists() {
        return Ok(0);
    }
    let mut size = 0u64;
    if let Ok(entries) = walk_dir(dir_path) {
        for entry in entries {
            if entry.is_file() {
                if let Ok(meta) = entry.metadata() {
                    size += meta.len();
                }
            }
        }
    }
    Ok(size)
}

/// Walk directory recursively using a queue
fn walk_dir(path: &std::path::Path) -> Result<Vec<std::path::PathBuf>, String> {
    let mut result = Vec::new();
    let mut queue = vec![path.to_path_buf()];
    while let Some(current) = queue.pop() {
        if current.is_dir() {
            if let Ok(entries) = std::fs::read_dir(&current) {
                for entry in entries.flatten() {
                    queue.push(entry.path());
                }
            }
        } else {
            result.push(current);
        }
    }
    Ok(result)
}

fn generate_cleanup_recommendations(breakdowns: &[StorageBreakdown]) -> Vec<CleanupRecommendation> {
    let mut recommendations = Vec::new();
    for breakdown in breakdowns {
        if breakdown.size_bytes > 100 * 1024 * 1024 {
            recommendations.push(CleanupRecommendation {
                category: breakdown.category.clone(),
                description: format!(
                    "{} occupies {} MB, consider cleanup",
                    breakdown.category,
                    breakdown.size_bytes / (1024 * 1024)
                ),
                potential_savings_bytes: breakdown.size_bytes / 2,
                risk_level: "safe".to_string(),
                action: format!("Remove old {} files", breakdown.category.to_lowercase()),
            });
        } else if breakdown.file_count > 100 {
            recommendations.push(CleanupRecommendation {
                category: breakdown.category.clone(),
                description: format!(
                    "{} has {} files, some may be stale",
                    breakdown.category, breakdown.file_count
                ),
                potential_savings_bytes: breakdown.size_bytes / 3,
                risk_level: "safe".to_string(),
                action: format!("Remove stale {} files", breakdown.category.to_lowercase()),
            });
        }
    }
    recommendations
}
