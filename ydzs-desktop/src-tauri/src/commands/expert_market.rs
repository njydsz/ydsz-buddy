// ! Expert Market Commands (G11-P2)
// !
// ! Provides expert (Agent Bundle) export, import, sharing, and validation.

use tauri::State;
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use serde::{Deserialize, Serialize};
use tracing::{info, warn, error};
use walkdir::WalkDir;

/// Expert information
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ExpertInfo {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub author: Option<String>,
    pub skill_count: u32,
    pub created_at: String,
}

/// Export manifest
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ExpertExportManifest {
    pub expert: ExpertInfo,
    pub files: Vec<String>,
    pub exported_at: String,
    pub format_version: String,
}

/// Validation report
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ValidationReport {
    pub valid: bool,
    pub expert_id: String,
    pub checks: Vec<ValidationCheck>,
    pub summary: String,
}

/// Individual validation check result
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ValidationCheck {
    pub name: String,
    pub passed: bool,
    pub message: String,
}

/// Default experts directory
fn experts_dir() -> PathBuf {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| ".".to_string());
    PathBuf::from(home).join(".ydsz-buddy").join("experts")
}

/// Find expert directory by ID
fn find_expert_dir(id: &str) -> Option<PathBuf> {
    let dir = experts_dir().join(id);
    if dir.exists() && dir.is_dir() {
        Some(dir)
    } else {
        None
    }
}

/// Gather expert info from directory
fn gather_expert_info(id: &str, dir: &std::path::Path) -> Result<ExpertInfo, String> {
    let manifest_path = dir.join("expert.json");
    if manifest_path.exists() {
        let manifest_str = fs::read_to_string(&manifest_path)
            .map_err(|e| format!("Failed to read manifest: {}", e))?;
        let manifest: ExpertExportManifest = serde_json::from_str(&manifest_str)
            .map_err(|e| format!("Failed to parse manifest: {}", e))?;
        return Ok(manifest.expert);
    }
    // Fallback: scan directory
    let skill_count = WalkDir::new(dir)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.file_name()
                .to_str()
                .map(|s| s == "SKILL.md")
                .unwrap_or(false)
        })
        .count() as u32;
    Ok(ExpertInfo {
        id: id.to_string(),
        name: id.to_string(),
        version: "0.1.0".to_string(),
        description: format!("Expert bundle at {}", dir.display()),
        author: None,
        skill_count,
        created_at: chrono::Utc::now().to_rfc3339(),
    })
}

/// Export expert as a zip archive.
#[tauri::command]
#[specta::specta]
pub async fn expert_export(
    id: String,
    target_path: String,
) -> Result<(), String> {
    let src_dir = find_expert_dir(&id).ok_or_else(|| format!("Expert not found: {}", id))?;
    let target = PathBuf::from(&target_path);
    info!("Exporting expert {} to {}", id, target.display());

    // Create parent directory if needed
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create dir: {}", e))?;
    }

    // Build zip using the zip crate
    let file = fs::File::create(&target).map_err(|e| format!("Failed to create file: {}", e))?;
    let mut zip = zip::ZipWriter::new(file);
    let options = zip::write::FileOptions::<()>().compression_method(zip::CompressionMethod::Deflated);

    let mut buffer = Vec::new();
    for entry in WalkDir::new(&src_dir) {
        let entry = entry.map_err(|e| format!("WalkDir error: {}", e))?;
        let path = entry.path();
        let name = path.strip_prefix(&src_dir).unwrap();
        if path.is_dir() {
            zip.add_directory(name.to_string_lossy(), options)
                .map_err(|e| format!("Zip error: {}", e))?;
        } else {
            zip.start_file(name.to_string_lossy(), options)
                .map_err(|e| format!("Zip error: {}", e))?;
            let data = fs::read(path).map_err(|e| format!("Read error: {}", e))?;
            use std::io::Write;
            zip.write_all(&data).map_err(|e| format!("Zip write error: {}", e))?;
        }
    }

    zip.finish().map_err(|e| format!("Zip finish error: {}", e))?;
    info!("Export complete: {}", target.display());
    Ok(())
}

/// Import expert from a zip archive.
#[tauri::command]
#[specta::specta]
pub async fn expert_import(
    source_path: String,
) -> Result<ExpertInfo, String> {
    let src = PathBuf::from(&source_path);
    if !src.exists() {
        return Err(format!("Source not found: {}", source_path));
    }
    info!("Importing expert from {}", src.display());

    let file = fs::File::open(&src).map_err(|e| format!("Failed to open: {}", e))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("Not a valid zip: {}", e))?;

    // Read manifest to get expert ID
    let mut expert_id = None;
    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| format!("Zip read error: {}", e))?;
        if file.name() == "expert.json" {
            let mut content = String::new();
            use std::io::Read;
            file.read_to_string(&mut content).map_err(|e| format!("Read error: {}", e))?;
            let manifest: ExpertExportManifest = serde_json::from_str(&content)
                .map_err(|e| format!("Manifest parse error: {}", e))?;
            expert_id = Some(manifest.expert.id);
            break;
        }
    }

    let expert_id = expert_id.unwrap_or_else(|| {
        src.file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("imported-expert")
            .to_string()
    });

    let dest_dir = experts_dir().join(&expert_id);
    fs::create_dir_all(&dest_dir).map_err(|e| format!("Failed to create dir: {}", e))?;

    // Extract zip
    let mut archive = zip::ZipArchive::new(fs::File::open(&src).map_err(|e| e.to_string())?)
        .map_err(|e| format!("Zip open error: {}", e))?;
    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        let outpath = dest_dir.join(file.name());
        if file.name().ends_with('/') {
            fs::create_dir_all(&outpath).map_err(|e| e.to_string())?;
        } else {
            if let Some(p) = outpath.parent() {
                fs::create_dir_all(p).map_err(|e| e.to_string())?;
            }
            let mut outfile = fs::File::create(&outpath).map_err(|e| e.to_string())?;
            use std::io::copy;
            copy(&mut file, &mut outfile).map_err(|e| e.to_string())?;
        }
    }

    let info = gather_expert_info(&expert_id, &dest_dir)?;
    info!("Import complete: {} -> {}", source_path, dest_dir.display());
    Ok(info)
}

/// Generate a local share link for an expert.
#[tauri::command]
#[specta::specta]
pub async fn expert_share_link(
    id: String,
) -> Result<String, String> {
    let _ = id;
    // First version: local-only, no network market
    Ok("local://expert-share-not-implemented".to_string())
}

/// Validate expert bundle integrity.
#[tauri::command]
#[specta::specta]
pub async fn expert_validate(
    id: String,
) -> Result<ValidationReport, String> {
    let dir = find_expert_dir(&id);
    let mut checks = Vec::new();

    // Check directory exists
    if let Some(ref d) = dir {
        checks.push(ValidationCheck {
            name: "directory_exists".to_string(),
            passed: true,
            message: format!("Expert directory found: {}", d.display()),
        });

        // Check manifest
        let manifest_path = d.join("expert.json");
        let manifest_valid = manifest_path.exists();
        checks.push(ValidationCheck {
            name: "manifest_exists".to_string(),
            passed: manifest_valid,
            message: if manifest_valid {
                "expert.json found".to_string()
            } else {
                "Missing expert.json manifest".to_string()
            },
        });

        // Check at least one SKILL.md
        let has_skills = WalkDir::new(d)
            .into_iter()
            .filter_map(|e| e.ok())
            .any(|e| e.file_name() == "SKILL.md");
        checks.push(ValidationCheck {
            name: "has_skills".to_string(),
            passed: has_skills,
            message: if has_skills {
                "At least one SKILL.md found".to_string()
            } else {
                "No SKILL.md found".to_string()
            },
        });
    } else {
        checks.push(ValidationCheck {
            name: "directory_exists".to_string(),
            passed: false,
            message: format!("Expert directory not found for ID: {}", id),
        });
    }

    let all_passed = checks.iter().all(|c| c.passed);
    let summary = if all_passed {
        format!("Expert {} is valid ({} checks passed)", id, checks.len())
    } else {
        let failed = checks.iter().filter(|c| !c.passed).count();
        format!("Expert {} has {} failing checks", id, failed)
    };

    Ok(ValidationReport {
        valid: all_passed,
        expert_id: id,
        checks,
        summary,
    })
}
