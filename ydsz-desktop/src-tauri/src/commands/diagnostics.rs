//! # 诊断日志打包模块
//!
//! 提供 P0-3 级别诊断日志打包、导出、上报功能。
//!
//! ## 命令清单
//!
//! | 命令 | 说明 |
//! |------|------|
//! | `diagnostics_get_logs` | 读取近期日志行，返回结构化条目 |
//! | `diagnostics_clear_logs` | 清空内存缓冲区（文件日志不可清除，为 no-op） |
//! | `diagnostics_export_zip` | 将诊断文件打包成 zip 并返回文件路径 |
//! | `diagnostics_report_issue` | 生成预填系统信息的 GitHub Issue URL |
//! | `diagnostics_reveal_in_folder` | 在系统文件管理器中打开指定路径 |
//!
//! ## 打包内容（位于 zip 内）
//!
//! - `logs/` — 近期日志文件副本
//! - `settings.json` — 脱敏后的用户设置
//! - `system_info.json` — OS 版本、应用版本、CPU、内存
//! - `manifest.json` — 应用版本、时间戳、复现步骤模板
//!
//! ## 输出位置
//!
//! 临时目录下 `<staging_dir_name>.zip`（与 staging 同目录）。
//! staging 目录在 zip 打包完成后会被自动清理。

use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use chrono::Utc;
use serde::Serialize;
use tauri::Manager;
use tracing::{info, warn};
use zip::write::FileOptions;
use zip::CompressionMethod;

// ===========================================================================
// 数据结构
// ===========================================================================

/// 单条日志条目
#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct LogEntry {
    /// 原始行内容
    pub line: String,
    /// 行号（从 1 开始，最近的行号最大）
    pub line_number: usize,
    /// 时间戳（如果解析成功）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<String>,
    /// 日志级别（如果解析成功）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub level: Option<String>,
    /// 目标模块（如果解析成功）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target: Option<String>,
}

/// 系统信息
#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct SystemInfo {
    /// 操作系统名称
    pub os_name: String,
    /// 操作系统版本
    pub os_version: String,
    /// 架构
    pub arch: String,
    /// 应用版本
    pub app_version: String,
    /// CPU 核心数
    pub cpu_cores: Option<usize>,
    /// 总内存（MB）
    pub total_memory_mb: Option<u64>,
}

/// 诊断包清单
#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct DiagnosticsManifest {
    /// 应用版本
    pub app_version: String,
    /// 打包时间戳
    pub timestamp: String,
    /// 复现步骤模板
    pub reproduction_steps: String,
}

// ===========================================================================
// 敏感信息脱敏
// ===========================================================================

/// 需要脱敏的 JSON key 关键词（不区分大小写匹配）
const SENSITIVE_KEYS: &[&str] = &[
    "api_key",
    "apikey",
    "token",
    "secret",
    "password",
    "credential",
    "access_key",
    "accesskey",
    "private_key",
    "privatekey",
];

/// 简单的脱敏格式：REDACTED:前N个字符...
fn redact_value(value: &str) -> String {
    let prefix: String = value.chars().take(4).collect();
    format!("REDACTED:{}***", prefix)
}

/// 判断 key 是否敏感
fn is_sensitive_key(key: &str) -> bool {
    let lower = key.to_lowercase();
    SENSITIVE_KEYS.iter().any(|s| lower.contains(*s))
}

/// 对 JSON 值进行递归脱敏
fn redact_json(value: serde_json::Value) -> serde_json::Value {
    match value {
        serde_json::Value::Object(mut map) => {
            for (key, val) in map.iter_mut() {
                if is_sensitive_key(key) {
                    if val.is_string() {
                        *val = serde_json::Value::String(redact_value(val.as_str().unwrap_or("")));
                    } else {
                        *val = serde_json::Value::String("[REDACTED]".to_string());
                    }
                } else {
                    *val = redact_json(std::mem::take(val));
                }
            }
            serde_json::Value::Object(map)
        }
        serde_json::Value::Array(arr) => {
            serde_json::Value::Array(arr.into_iter().map(redact_json).collect())
        }
        other => other,
    }
}

/// 对字符串中的邮箱进行脱敏（不使用 regex，避免额外依赖）
fn redact_emails(text: &str) -> String {
    let mut result = String::with_capacity(text.len());
    let mut i = 0;
    let chars: Vec<char> = text.chars().collect();
    let len = chars.len();

    while i < len {
        // 尝试在此位置检测邮箱
        if let Some((email_start, email_end)) = find_email_at(&chars, i) {
            let email: String = chars[email_start..email_end].iter().collect();
            result.push_str(&redact_value(&email));
            i = email_end;
        } else {
            result.push(chars[i]);
            i += 1;
        }
    }

    result
}

/// 在字符数组中从 pos 开始查找邮箱地址
/// 返回 Some((start, end)) 如果找到，否则 None
fn find_email_at(chars: &[char], pos: usize) -> Option<(usize, usize)> {
    let len = chars.len();
    // 向前找 local-part 起始位置
    let mut start = pos;
    while start > 0 && is_email_local_char(chars[start - 1]) {
        start -= 1;
    }

    // local-part 至少需要 1 个字符
    if start == pos {
        return None;
    }

    // 检查 @ 符号
    if pos >= len || chars[pos] != '@' {
        return None;
    }

    // 找 domain 部分
    let mut end = pos + 1;
    while end < len && is_email_domain_char(chars[end]) {
        end += 1;
    }

    // domain 至少需要 x.y 格式（至少 3 个字符 + 一个点）
    let domain: String = chars[pos + 1..end].iter().collect();
    if domain.contains('.') && domain.len() >= 3 {
        Some((start, end))
    } else {
        None
    }
}

fn is_email_local_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || "._%+-".contains(c)
}

fn is_email_domain_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || ".-".contains(c)
}

// ===========================================================================
// 日志读取
// ===========================================================================

/// 解析单行日志（tracing 格式）
///
/// 典型格式：`2024-01-15T10:30:00.000Z  INFO ydsz_buddy::some_module: message`
///
/// 注意：tracing 在时间戳与 level 之间可能存在**两个空格**（visual alignment），
/// 因此不能用 `split(' ')` 而需要过滤空段。
fn parse_log_line(line: &str) -> LogEntry {
    let mut timestamp = None;
    let mut level = None;
    let mut target = None;

    // 尝试解析 tracing 格式
    // 格式可能为：TIMESTAMP LEVEL target: message
    // 段与段之间可能有 1 或 2 个空格
    let parts: Vec<&str> = line.split_whitespace().take(4).collect();
    if parts.len() >= 3 {
        // 第一部分可能是时间戳
        let candidate = parts[0];
        if candidate.contains('T') && candidate.len() >= 19 {
            timestamp = Some(candidate.to_string());
        }

        // 第二部分可能是级别
        let level_candidate = parts[1].trim_end_matches(|c: char| !c.is_alphabetic());
        if matches!(
            level_candidate.to_uppercase().as_str(),
            "TRACE" | "DEBUG" | "INFO" | "WARN" | "ERROR"
        ) {
            level = Some(level_candidate.to_uppercase());
        }

        // 第三部分可能是 target（以冒号结尾）
        let target_candidate = parts[2].trim_end_matches(':');
        if !target_candidate.is_empty()
            && target_candidate.contains(|c: char| c == '_' || c == ':' || c.is_ascii_lowercase())
        {
            target = Some(target_candidate.to_string());
        }
    }

    LogEntry {
        line: line.to_string(),
        line_number: 0, // 由调用者填充
        timestamp,
        level,
        target,
    }
}

/// 读取日志目录中的所有日志文件，返回最近的行
fn read_recent_log_lines(log_dir: &PathBuf, max_lines: usize) -> Vec<String> {
    let mut all_lines: Vec<String> = Vec::new();

    if !log_dir.exists() {
        return all_lines;
    }

    // 读取目录下所有 .log 文件
    let entries = match fs::read_dir(log_dir) {
        Ok(e) => e,
        Err(e) => {
            warn!("无法读取日志目录 {:?}: {}", log_dir, e);
            return all_lines;
        }
    };

    let mut log_files: Vec<PathBuf> = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().is_some_and(|ext| ext == "log") {
            log_files.push(path);
        }
    }

    // 按修改时间排序，最新的在前
    log_files.sort_by(|a, b| {
        let a_meta = fs::metadata(a).ok();
        let b_meta = fs::metadata(b).ok();
        let a_time = a_meta.and_then(|m| m.modified().ok());
        let b_time = b_meta.and_then(|m| m.modified().ok());
        b_time.cmp(&a_time)
    });

    // 读取文件内容，直到达到 max_lines
    for file_path in &log_files {
        if all_lines.len() >= max_lines {
            break;
        }
        if let Ok(content) = fs::read_to_string(file_path) {
            let file_lines: Vec<String> = content
                .lines()
                .map(String::from)
                .collect();
            // 每个文件最多取最后 500 行
            let take_count = (max_lines - all_lines.len()).min(file_lines.len()).min(500);
            let start = file_lines.len().saturating_sub(take_count);
            all_lines.extend(file_lines[start..].iter().cloned());
        }
    }

    // 只保留最后 max_lines 行
    if all_lines.len() > max_lines {
        all_lines = all_lines.split_off(all_lines.len() - max_lines);
    }

    all_lines
}

// ===========================================================================
// 系统信息收集
// ===========================================================================

/// 收集系统信息
fn collect_system_info() -> SystemInfo {
    SystemInfo {
        os_name: std::env::consts::OS.to_string(),
        os_version: os_version_string(),
        arch: std::env::consts::ARCH.to_string(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        cpu_cores: Some(num_cpus()),
        total_memory_mb: total_memory_mb(),
    }
}

/// 获取操作系统版本字符串
fn os_version_string() -> String {
    // 尝试从系统获取版本信息
    #[cfg(target_os = "windows")]
    {
        if let Ok(output) = std::process::Command::new("cmd")
            .args(["/c", "ver"])
            .output()
        {
            let ver = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !ver.is_empty() {
                return ver;
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        if let Ok(output) = std::process::Command::new("sw_vers")
            .arg("-productVersion")
            .output()
        {
            let ver = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !ver.is_empty() {
                return format!("macOS {}", ver);
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        if let Ok(content) = fs::read_to_string("/etc/os-release") {
            for line in content.lines() {
                if let Some(version) = line.strip_prefix("PRETTY_NAME=") {
                    return version.trim_matches('"').to_string();
                }
            }
        }
    }

    format!(
        "{} {}",
        std::env::consts::OS,
        std::env::consts::ARCH
    )
}

/// 获取 CPU 核心数
fn num_cpus() -> usize {
    std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(0)
}

/// 获取总内存（MB）
fn total_memory_mb() -> Option<u64> {
    #[cfg(target_os = "windows")]
    {
        use std::mem::size_of;

        #[repr(C)]
        struct MemoryStatus {
            length: u32,
            memory_load: u32,
            total_phys: u64,
            avail_phys: u64,
            total_pagefile: u64,
            avail_pagefile: u64,
            total_virtual: u64,
            avail_virtual: u64,
        }

        extern "system" {
            fn GlobalMemoryStatus(lpBuffer: *mut MemoryStatus);
        }

        let mut status = MemoryStatus {
            length: size_of::<MemoryStatus>() as u32,
            memory_load: 0,
            total_phys: 0,
            avail_phys: 0,
            total_pagefile: 0,
            avail_pagefile: 0,
            total_virtual: 0,
            avail_virtual: 0,
        };

        unsafe {
            GlobalMemoryStatus(&mut status);
        }

        Some(status.total_phys / (1024 * 1024))
    }

    #[cfg(not(target_os = "windows"))]
    {
        // sysinfo crate 不在依赖中，返回 None
        None
    }
}

// ===========================================================================
// 设置文件脱敏
// ===========================================================================

/// 读取并脱敏设置文件
fn read_redacted_settings(base_dir: &PathBuf) -> serde_json::Value {
    let profile_path = base_dir.join("profile.json");

    let raw_value: serde_json::Value = match fs::read_to_string(&profile_path) {
        Ok(content) => {
            // 先脱敏邮箱
            let content = redact_emails(&content);
            serde_json::from_str(&content).unwrap_or_else(|e| {
                warn!("解析 profile.json 失败: {}", e);
                serde_json::json!({ "error": "Failed to parse settings" })
            })
        }
        Err(_) => {
            serde_json::json!({ "note": "Settings file not found" })
        }
    };

    // 递归脱敏敏感字段
    redact_json(raw_value)
}

// ===========================================================================
// Tauri 命令
// ===========================================================================

/// 获取近期日志条目
///
/// 从应用日志目录读取最近的日志行，解析为结构化条目返回。
///
/// # 返回值
///
/// - `Ok(Vec<LogEntry>)`: 日志条目列表（最近 500 行）
/// - `Err(String)`: 读取失败
#[tauri::command]
#[specta::specta]
pub fn diagnostics_get_logs(app: tauri::AppHandle) -> Result<Vec<LogEntry>, String> {
    info!("diagnostics_get_logs: 读取近期日志");

    let log_dir = app
        .path()
        .app_log_dir()
        .map_err(|e| format!("Failed to get app log dir: {}", e))?;

    let lines = read_recent_log_lines(&log_dir, 500);

    let entries: Vec<LogEntry> = lines
        .into_iter()
        .enumerate()
        .map(|(i, line)| {
            let mut entry = parse_log_line(&line);
            entry.line_number = i + 1;
            entry
        })
        .collect();

    Ok(entries)
}

/// 清空日志缓冲区（no-op，文件日志无法清除）
///
/// 此命令保留用于 API 一致性。文件日志只能通过轮转或手动删除来清除。
///
/// # 返回值
///
/// - `Ok(())`: 始终成功
#[tauri::command]
#[specta::specta]
pub fn diagnostics_clear_logs() -> Result<(), String> {
    info!("diagnostics_clear_logs: no-op (文件日志不可清除)");
    Ok(())
}

// ===========================================================================
// ZIP 打包
// ===========================================================================

/// 收集 staging 目录下所有需要被打包的文件
///
/// 返回 (绝对路径, 在 zip 内的相对路径) 的列表。
fn collect_zip_entries(staging_dir: &Path) -> Vec<(PathBuf, String)> {
    let mut entries: Vec<(PathBuf, String)> = Vec::new();
    if !staging_dir.exists() {
        return entries;
    }

    let walker = walkdir::WalkDir::new(staging_dir)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok());

    for entry in walker {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let rel = match path.strip_prefix(staging_dir) {
            Ok(r) => r,
            Err(_) => continue,
        };
        // 统一使用正斜杠作为 zip 内部路径分隔符
        let rel_str = rel
            .components()
            .map(|c| c.as_os_str().to_string_lossy().into_owned())
            .collect::<Vec<_>>()
            .join("/");
        entries.push((path.to_path_buf(), rel_str));
    }
    entries
}

/// 把 staging 目录打包为 zip 文件
///
/// - 使用 deflate 压缩以减小包体积
/// - 文件名格式：`<staging_dir_name>.zip`，与 staging 同目录
/// - 打包完成后**删除 staging 目录**
///
/// # 参数
///
/// - `staging_dir`: 临时 staging 目录（包含所有诊断文件）
///
/// # 返回值
///
/// - `Ok(PathBuf)`: 生成的 zip 文件绝对路径
/// - `Err(String)`: 打包失败
fn pack_zip_from_staging(staging_dir: &Path) -> Result<PathBuf, String> {
    let parent = staging_dir
        .parent()
        .ok_or_else(|| "Staging directory has no parent".to_string())?;
    let dir_name = staging_dir
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "Invalid staging directory name".to_string())?;

    let zip_path = parent.join(format!("{}.zip", dir_name));
    let zip_file = fs::File::create(&zip_path)
        .map_err(|e| format!("Failed to create zip file {:?}: {}", zip_path, e))?;

    let mut zip_writer = zip::ZipWriter::new(zip_file);
    let options = FileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .unix_permissions(0o644);

    let entries = collect_zip_entries(staging_dir);
    info!(
        "pack_zip_from_staging: 打包 {} 个文件到 {:?}",
        entries.len(),
        zip_path
    );

    for (abs_path, rel_path) in &entries {
        zip_writer
            .start_file(rel_path, options)
            .map_err(|e| format!("Failed to start zip entry {}: {}", rel_path, e))?;

        let mut file = fs::File::open(abs_path)
            .map_err(|e| format!("Failed to open {}: {}", abs_path.display(), e))?;
        let mut buffer = Vec::new();
        file.read_to_end(&mut buffer)
            .map_err(|e| format!("Failed to read {}: {}", abs_path.display(), e))?;
        zip_writer
            .write_all(&buffer)
            .map_err(|e| format!("Failed to write {}: {}", rel_path, e))?;
    }

    zip_writer
        .finish()
        .map_err(|e| format!("Failed to finalize zip: {}", e))?;

    // 打包成功：删除 staging 目录
    if let Err(e) = fs::remove_dir_all(staging_dir) {
        warn!(
            "Failed to clean up staging dir {:?}: {}",
            staging_dir, e
        );
    }

    Ok(zip_path)
}

/// 导出诊断包到 zip 文件
///
/// 在应用临时目录中创建 staging 目录，写入以下内容：
/// - `logs/` — 近期日志文件
/// - `settings.json` — 脱敏后的用户设置
/// - `system_info.json` — 系统和应用信息
/// - `manifest.json` — 清单（版本、时间戳、复现步骤模板）
///
/// staging 完成后立即打包为 `<staging_dir_name>.zip`（deflate 压缩），
/// 并删除 staging 目录。返回 zip 文件的**绝对路径**。
///
/// # 返回值
///
/// - `Ok(String)`: zip 文件绝对路径
/// - `Err(String)`: 导出失败（包含 staging 失败与打包失败）
#[tauri::command]
#[specta::specta]
pub fn diagnostics_export_zip(app: tauri::AppHandle) -> Result<String, String> {
    info!("diagnostics_export_zip: 开始导出诊断包");

    // 创建临时 staging 目录
    let timestamp = Utc::now().format("%Y%m%d_%H%M%S");
    let diag_dir = std::env::temp_dir()
        .join(format!("ydsz-diagnostics-{}", timestamp));

    fs::create_dir_all(&diag_dir)
        .map_err(|e| format!("Failed to create diagnostics directory: {}", e))?;

    // === 1. 复制日志文件 ===
    let logs_dir = diag_dir.join("logs");
    fs::create_dir_all(&logs_dir)
        .map_err(|e| format!("Failed to create logs directory: {}", e))?;

    let app_log_dir = app
        .path()
        .app_log_dir()
        .map_err(|e| format!("Failed to get app log dir: {}", e))?;

    if app_log_dir.exists() {
        // 复制最近的日志文件（最多 5 个）
        let entries = match fs::read_dir(&app_log_dir) {
            Ok(e) => e,
            Err(e) => {
                warn!("无法读取日志目录: {}", e);
                return Err(format!("Failed to read log directory: {}", e));
            }
        };

        let mut log_files: Vec<(PathBuf, std::time::SystemTime)> = Vec::new();
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().is_some_and(|ext| ext == "log") {
                let modified = fs::metadata(&path)
                    .ok()
                    .and_then(|m| m.modified().ok())
                    .unwrap_or(std::time::UNIX_EPOCH);
                log_files.push((path, modified));
            }
        }

        // 按修改时间排序，最新的在前
        log_files.sort_by(|a, b| b.1.cmp(&a.1));

        // 复制最多 5 个最近的日志文件
        for (src_path, _) in log_files.iter().take(5) {
            if let Some(file_name) = src_path.file_name() {
                let dest_path = logs_dir.join(file_name);
                if let Err(e) = fs::copy(src_path, &dest_path) {
                    warn!("复制日志文件失败 {:?}: {}", src_path, e);
                }
            }
        }

        // 同时写入一个合并的日志文件（最近 2000 行）
        let all_lines = read_recent_log_lines(&app_log_dir, 2000);
        let merged_content = all_lines.join("\n");
        let _ = fs::write(logs_dir.join("recent.log"), merged_content);
    }

    // === 2. 脱敏设置文件 ===
    let base_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| dirs::home_dir().unwrap_or_default().join(".2. 环境变量 YDSZ_BOOTSTRAP_TOKEN"));

    let settings = read_redacted_settings(&base_dir);
    let settings_json = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;
    fs::write(diag_dir.join("settings.json"), settings_json)
        .map_err(|e| format!("Failed to write settings.json: {}", e))?;

    // === 3. 系统信息 ===
    let system_info = collect_system_info();
    let system_info_json = serde_json::to_string_pretty(&system_info)
        .map_err(|e| format!("Failed to serialize system info: {}", e))?;
    fs::write(diag_dir.join("system_info.json"), system_info_json)
        .map_err(|e| format!("Failed to write system_info.json: {}", e))?;

    // === 4. 清单文件 ===
    let manifest = DiagnosticsManifest {
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        timestamp: Utc::now().to_rfc3339(),
        reproduction_steps: "1. 描述您遇到的问题的复现步骤\n2. 尽可能提供截图或录屏\n3. 说明期望的行为与实际行为\n4. 附加任何其他相关信息"
            .to_string(),
    };
    let manifest_json = serde_json::to_string_pretty(&manifest)
        .map_err(|e| format!("Failed to serialize manifest: {}", e))?;
    fs::write(diag_dir.join("manifest.json"), manifest_json)
        .map_err(|e| format!("Failed to write manifest.json: {}", e))?;

    // === 5. 把 staging 目录打包成 zip ===
    let zip_path = pack_zip_from_staging(&diag_dir)?;

    let path_str = zip_path
        .to_str()
        .ok_or_else(|| "Invalid path encoding".to_string())?
        .to_string();

    info!("diagnostics_export_zip: 诊断包已导出到 {}", path_str);
    Ok(path_str)
}

/// 生成 GitHub Issue 上报 URL
///
/// 生成一个带有预填标题和正文的 GitHub Issue 链接，
/// 正文包含脱敏后的系统信息摘要。
///
/// # 返回值
///
/// - `Ok(String)`: GitHub Issue URL
/// - `Err(String)`: 生成失败
#[tauri::command]
#[specta::specta]
pub fn diagnostics_report_issue(_app: tauri::AppHandle) -> Result<String, String> {
    info!("diagnostics_report_issue: 生成 Issue URL");

    let system_info = collect_system_info();

    // 构建 Issue 正文
    let body = format!(
        "## 环境信息

| 项目 | 值 |
| --- | --- |
| 操作系统 | {os_name} {os_version} |
| 架构 | {arch} |
| 应用版本 | {app_version} |
| CPU 核心数 | {cpu_cores} |
| 总内存 | {memory_mb} |

## 问题描述

<!-- 请在此描述您遇到的问题 -->

## 复现步骤

1. 
2. 
3. 

## 期望行为

<!-- 描述您期望的行为 -->

## 实际行为

<!-- 描述实际发生的情况 -->

## 附加信息

<!-- 如有日志文件、截图等，请附加到 Issue 中 -->

---

*此 Issue 由 云顶数字 Buddy 诊断工具自动生成*
",
        os_name = system_info.os_name,
        os_version = system_info.os_version,
        arch = system_info.arch,
        app_version = system_info.app_version,
        cpu_cores = system_info
            .cpu_cores
            .map(|n| n.to_string())
            .unwrap_or_else(|| "N/A".to_string()),
        memory_mb = system_info
            .total_memory_mb
            .map(|m| format!("{} MB", m))
            .unwrap_or_else(|| "N/A".to_string()),
    );

    // URL 编码
    let title_encoded = urlencoding::encode("Bug Report - ydsz-buddy");
    let body_encoded = urlencoding::encode(&body);

    // ydsz-buddy 仓库地址
    let issue_url = format!(
        "https://github.com/ydsz-org/ydsz-buddy/issues/new?title={}&body={}",
        title_encoded, body_encoded
    );

    // 尝试在默认浏览器中打开
    let _ = open::that(&issue_url);

    Ok(issue_url)
}

// ===========================================================================
// 在系统文件管理器中打开诊断包
// ===========================================================================

/// 在系统文件管理器中打开诊断包目录
///
/// 调用操作系统命令打开诊断包所在目录，方便用户快速定位。
/// - Windows: 使用 `explorer.exe` 打开目录
/// - macOS: 使用 `open` 命令
/// - Linux: 使用 `xdg-open` 命令
///
/// # 参数
///
/// - `path`: 诊断包目录的绝对路径
///
/// # 返回值
///
/// - `Ok(())`: 成功发起打开命令
/// - `Err(String)`: 路径为空或打开失败
#[tauri::command]
#[specta::specta]
pub fn diagnostics_reveal_in_folder(path: String) -> Result<(), String> {
    info!("diagnostics_reveal_in_folder: 在文件管理器中打开 {}", path);

    if path.trim().is_empty() {
        return Err("Path is empty".to_string());
    }

    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err(format!("Path does not exist: {}", path));
    }

    #[cfg(target_os = "windows")]
    {
        // explorer.exe 直接打开目录
        let result = std::process::Command::new("explorer.exe")
            .arg(&path)
            .spawn();
        match result {
            Ok(_) => Ok(()),
            Err(e) => Err(format!("Failed to open path in Explorer: {}", e)),
        }
    }

    #[cfg(target_os = "macos")]
    {
        let result = std::process::Command::new("open").arg(&path).spawn();
        match result {
            Ok(_) => Ok(()),
            Err(e) => Err(format!("Failed to open path in Finder: {}", e)),
        }
    }

    #[cfg(target_os = "linux")]
    {
        let result = std::process::Command::new("xdg-open").arg(&path).spawn();
        match result {
            Ok(_) => Ok(()),
            Err(e) => Err(format!("Failed to open path in file manager: {}", e)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ─── parse_log_line ──────────────────────────────────────────────────────

    #[test]
    fn parse_log_line_typical_tracing_format() {
        let line = "2024-01-15T10:30:00.000Z  INFO ydsz_buddy::some_module: hello world";
        let entry = parse_log_line(line);
        assert_eq!(entry.line, line);
        assert_eq!(entry.timestamp.as_deref(), Some("2024-01-15T10:30:00.000Z"));
        assert_eq!(entry.level.as_deref(), Some("INFO"));
        assert_eq!(entry.target.as_deref(), Some("ydsz_buddy::some_module"));
    }

    #[test]
    fn parse_log_line_error_level() {
        let line = "2024-01-15T10:30:00.000Z ERROR something: error happened";
        let entry = parse_log_line(line);
        assert_eq!(entry.level.as_deref(), Some("ERROR"));
    }

    #[test]
    fn parse_log_line_warn_level() {
        let line = "2024-01-15T10:30:00.000Z WARN something: warning";
        let entry = parse_log_line(line);
        assert_eq!(entry.level.as_deref(), Some("WARN"));
    }

    #[test]
    fn parse_log_line_debug_level() {
        let line = "2024-01-15T10:30:00.000Z DEBUG something: debug info";
        let entry = parse_log_line(line);
        assert_eq!(entry.level.as_deref(), Some("DEBUG"));
    }

    #[test]
    fn parse_log_line_trace_level() {
        let line = "2024-01-15T10:30:00.000Z TRACE something: trace info";
        let entry = parse_log_line(line);
        assert_eq!(entry.level.as_deref(), Some("TRACE"));
    }

    #[test]
    fn parse_log_line_invalid_level() {
        let line = "2024-01-15T10:30:00.000Z INVALID something: msg";
        let entry = parse_log_line(line);
        assert_eq!(entry.level, None);
    }

    #[test]
    fn parse_log_line_no_timestamp() {
        let line = "plain text without timestamp";
        let entry = parse_log_line(line);
        assert_eq!(entry.timestamp, None);
        assert_eq!(entry.level, None);
    }

    #[test]
    fn parse_log_line_short_line() {
        let line = "abc def";
        let entry = parse_log_line(line);
        assert_eq!(entry.timestamp, None);
        assert_eq!(entry.level, None);
    }

    #[test]
    fn parse_log_line_target_with_colons() {
        let line = "2024-01-15T10:30:00.000Z  INFO ydsz_buddy::sub::module: msg";
        let entry = parse_log_line(line);
        assert_eq!(entry.target.as_deref(), Some("ydsz_buddy::sub::module"));
    }

    // ─── is_sensitive_key ────────────────────────────────────────────────────

    #[test]
    fn is_sensitive_key_detects_api_key() {
        assert!(is_sensitive_key("api_key"));
        assert!(is_sensitive_key("API_KEY"));
        assert!(is_sensitive_key("myApiKey"));
    }

    #[test]
    fn is_sensitive_key_detects_token() {
        assert!(is_sensitive_key("token"));
        assert!(is_sensitive_key("access_token"));
        assert!(is_sensitive_key("authToken"));
    }

    #[test]
    fn is_sensitive_key_detects_secret() {
        assert!(is_sensitive_key("secret"));
        assert!(is_sensitive_key("client_secret"));
    }

    #[test]
    fn is_sensitive_key_detects_password() {
        assert!(is_sensitive_key("password"));
        assert!(is_sensitive_key("user_password"));
    }

    #[test]
    fn is_sensitive_key_detects_credential() {
        assert!(is_sensitive_key("credential"));
        assert!(is_sensitive_key("credentials"));
    }

    #[test]
    fn is_sensitive_key_detects_access_key() {
        assert!(is_sensitive_key("access_key"));
        assert!(is_sensitive_key("AWS_ACCESS_KEY_ID"));
    }

    #[test]
    fn is_sensitive_key_detects_private_key() {
        assert!(is_sensitive_key("private_key"));
        assert!(is_sensitive_key("privateKey"));
    }

    #[test]
    fn is_sensitive_key_rejects_normal_keys() {
        assert!(!is_sensitive_key("username"));
        assert!(!is_sensitive_key("email"));
        assert!(!is_sensitive_key("model"));
        assert!(!is_sensitive_key("provider"));
    }

    // ─── redact_value ────────────────────────────────────────────────────────

    #[test]
    fn redact_value_short_string() {
        let result = redact_value("abc");
        assert_eq!(result, "REDACTED:abc***");
    }

    #[test]
    fn redact_value_empty_string() {
        let result = redact_value("");
        assert_eq!(result, "REDACTED:***");
    }

    #[test]
    fn redact_value_long_string() {
        let result = redact_value("sk-1234567890abcdef");
        assert_eq!(result, "REDACTED:sk-1***");
    }

    #[test]
    fn redact_value_chinese_string() {
        let result = redact_value("我的密钥");
        assert_eq!(result, "REDACTED:我的密钥***");
    }

    // ─── redact_json ─────────────────────────────────────────────────────────

    #[test]
    fn redact_json_string_value() {
        let value = serde_json::json!({
            "api_key": "sk-1234567890"
        });
        let redacted = redact_json(value);
        assert_eq!(redacted["api_key"], "REDACTED:sk-1***");
    }

    #[test]
    fn redact_json_nested_string() {
        let value = serde_json::json!({
            "outer": {
                "inner": {
                    "token": "abc123"
                }
            }
        });
        let redacted = redact_json(value);
        assert_eq!(redacted["outer"]["inner"]["token"], "REDACTED:abc1***");
    }

    #[test]
    fn redact_json_non_string_sensitive_value() {
        let value = serde_json::json!({
            "password": 12345
        });
        let redacted = redact_json(value);
        assert_eq!(redacted["password"], "[REDACTED]");
    }

    #[test]
    fn redact_json_array_of_objects() {
        let value = serde_json::json!({
            "users": [
                { "name": "alice", "token": "abc" },
                { "name": "bob", "token": "xyz" }
            ]
        });
        let redacted = redact_json(value);
        assert_eq!(redacted["users"][0]["name"], "alice");
        assert_eq!(redacted["users"][0]["token"], "REDACTED:abc***");
        assert_eq!(redacted["users"][1]["token"], "REDACTED:xyz***");
    }

    #[test]
    fn redact_json_preserves_non_sensitive() {
        let value = serde_json::json!({
            "model": "codex",
            "temperature": 0.7,
            "api_key": "secret"
        });
        let redacted = redact_json(value);
        assert_eq!(redacted["model"], "codex");
        assert_eq!(redacted["temperature"], 0.7);
        assert_eq!(redacted["api_key"], "REDACTED:secr***");
    }

    #[test]
    fn redact_json_preserves_primitives() {
        let value = serde_json::json!(42);
        let redacted = redact_json(value);
        assert_eq!(redacted, 42);

        let value = serde_json::json!(true);
        let redacted = redact_json(value);
        assert_eq!(redacted, true);

        let value = serde_json::json!(null);
        let redacted = redact_json(value);
        assert_eq!(redacted, serde_json::Value::Null);
    }

    // ─── redact_emails ───────────────────────────────────────────────────────

    #[test]
    fn redact_emails_simple_email() {
        let text = "Contact me at user@example.com for details";
        let result = redact_emails(text);
        assert!(result.contains("REDACTED:user***"));
        assert!(!result.contains("user@example.com"));
    }

    #[test]
    fn redact_emails_multiple_emails() {
        let text = "Email alice@foo.com or bob@bar.org for info";
        let result = redact_emails(text);
        assert!(!result.contains("alice@foo.com"));
        assert!(!result.contains("bob@bar.org"));
        assert_eq!(result.matches("REDACTED:").count(), 2);
    }

    #[test]
    fn redact_emails_with_subdomain() {
        let text = "Reach out to support@help.example.com please";
        let result = redact_emails(text);
        assert!(!result.contains("support@help.example.com"));
        assert!(result.contains("REDACTED:"));
    }

    #[test]
    fn redact_emails_with_plus() {
        let text = "Send to user+tag@example.com";
        let result = redact_emails(text);
        assert!(!result.contains("user+tag@example.com"));
        assert!(result.contains("REDACTED:"));
    }

    #[test]
    fn redact_emails_no_email() {
        let text = "This is a normal text without email addresses";
        let result = redact_emails(text);
        assert_eq!(result, text);
    }

    #[test]
    fn redact_emails_preserves_at_in_other_context() {
        let text = "Use @username for mentions";
        let result = redact_emails(text);
        assert_eq!(result, text);
    }

    #[test]
    fn redact_emails_in_json_like_text() {
        let text = r#"{"email": "user@foo.com", "name": "alice"}"#;
        let result = redact_emails(text);
        assert!(!result.contains("user@foo.com"));
        assert!(result.contains(r#""email":"#));
    }

    // ─── is_email_local_char / is_email_domain_char ──────────────────────────

    #[test]
    fn is_email_local_char_accepts_alphanumeric() {
        assert!(is_email_local_char('a'));
        assert!(is_email_local_char('Z'));
        assert!(is_email_local_char('0'));
        assert!(is_email_local_char('9'));
    }

    #[test]
    fn is_email_local_char_accepts_specials() {
        assert!(is_email_local_char('.'));
        assert!(is_email_local_char('_'));
        assert!(is_email_local_char('%'));
        assert!(is_email_local_char('+'));
        assert!(is_email_local_char('-'));
    }

    #[test]
    fn is_email_local_char_rejects_others() {
        assert!(!is_email_local_char(' '));
        assert!(!is_email_local_char('@'));
        assert!(!is_email_local_char('!'));
        assert!(!is_email_local_char('中'));
    }

    #[test]
    fn is_email_domain_char_accepts_alphanumeric() {
        assert!(is_email_domain_char('a'));
        assert!(is_email_domain_char('Z'));
        assert!(is_email_domain_char('0'));
        assert!(is_email_domain_char('9'));
    }

    #[test]
    fn is_email_domain_char_accepts_dot_and_dash() {
        assert!(is_email_domain_char('.'));
        assert!(is_email_domain_char('-'));
    }

    #[test]
    fn is_email_domain_char_rejects_underscore() {
        assert!(!is_email_domain_char('_'));
    }

    #[test]
    fn is_email_domain_char_rejects_plus() {
        assert!(!is_email_domain_char('+'));
    }

    // ─── diagnostics_reveal_in_folder ───────────────────────────────────────

    #[test]
    fn reveal_in_folder_rejects_empty_path() {
        let result = diagnostics_reveal_in_folder(String::new());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("empty"));
    }

    #[test]
    fn reveal_in_folder_rejects_nonexistent_path() {
        let result = diagnostics_reveal_in_folder(
            "/this/path/should/not/exist/anywhere/12345".to_string(),
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("does not exist"));
    }

    #[test]
    fn reveal_in_folder_rejects_whitespace_path() {
        let result = diagnostics_reveal_in_folder("   ".to_string());
        assert!(result.is_err());
    }

    // ─── collect_zip_entries ─────────────────────────────────────────────────

    #[test]
    fn collect_zip_entries_empty_dir() {
        let tmp = tempfile::tempdir().expect("create tempdir");
        let entries = collect_zip_entries(tmp.path());
        assert!(entries.is_empty());
    }

    #[test]
    fn collect_zip_entries_nonexistent_dir() {
        let entries = collect_zip_entries(Path::new("/this/path/does/not/exist/12345"));
        assert!(entries.is_empty());
    }

    #[test]
    fn collect_zip_entries_returns_flat_files() {
        let tmp = tempfile::tempdir().expect("create tempdir");
        fs::write(tmp.path().join("a.txt"), "alpha").expect("write a");
        fs::write(tmp.path().join("b.txt"), "beta").expect("write b");

        let entries = collect_zip_entries(tmp.path());
        assert_eq!(entries.len(), 2);
        let names: Vec<String> = entries.iter().map(|(_, n)| n.clone()).collect();
        assert!(names.contains(&"a.txt".to_string()));
        assert!(names.contains(&"b.txt".to_string()));
    }

    #[test]
    fn collect_zip_entries_nested_files_use_relative_paths() {
        let tmp = tempfile::tempdir().expect("create tempdir");
        let nested = tmp.path().join("logs");
        fs::create_dir(&nested).expect("mkdir logs");
        fs::write(nested.join("app.log"), "log line").expect("write app.log");

        let entries = collect_zip_entries(tmp.path());
        assert_eq!(entries.len(), 1);
        // Windows 上 walkdir 使用反斜杠，代码中我们手动转换为正斜杠
        let (_, rel) = &entries[0];
        assert_eq!(rel, "logs/app.log");
    }

    // ─── pack_zip_from_staging ───────────────────────────────────────────────

    #[test]
    fn pack_zip_from_staging_produces_zip_and_cleans_up() {
        let tmp = tempfile::tempdir().expect("create tempdir");
        let staging = tmp.path().join("ydsz-diagnostics-test");
        fs::create_dir(&staging).expect("mkdir staging");
        fs::write(staging.join("manifest.json"), r#"{"version":"0.3.0"}"#)
            .expect("write manifest");
        fs::write(staging.join("settings.json"), r#"{"theme":"dark"}"#)
            .expect("write settings");

        let zip_path = pack_zip_from_staging(&staging).expect("pack");

        // 1. zip 文件存在
        assert!(zip_path.exists(), "zip file should exist: {:?}", zip_path);
        // 2. zip 文件名后缀为 .zip
        assert_eq!(zip_path.extension().and_then(|e| e.to_str()), Some("zip"));
        // 3. staging 目录已被清理
        assert!(!staging.exists(), "staging dir should be cleaned up");
    }

    #[test]
    fn pack_zip_from_staging_zip_contains_expected_files() {
        let tmp = tempfile::tempdir().expect("create tempdir");
        let staging = tmp.path().join("ydsz-diagnostics-content-test");
        fs::create_dir(&staging).expect("mkdir staging");
        let logs_dir = staging.join("logs");
        fs::create_dir(&logs_dir).expect("mkdir logs");
        fs::write(staging.join("manifest.json"), r#"{"app_version":"0.3.0"}"#)
            .expect("write manifest");
        fs::write(logs_dir.join("app.log"), "log content here").expect("write log");

        let zip_path = pack_zip_from_staging(&staging).expect("pack");

        // 用 zip crate 打开验证
        let file = fs::File::open(&zip_path).expect("open zip");
        let mut archive = zip::ZipArchive::new(file).expect("read archive");
        let mut names: Vec<String> = (0..archive.len())
            .map(|i| archive.by_index(i).unwrap().name().to_string())
            .collect();
        names.sort();
        assert_eq!(
            names,
            vec!["logs/app.log".to_string(), "manifest.json".to_string()]
        );

        // 验证文件内容
        let mut manifest_entry = archive.by_name("manifest.json").expect("entry");
        let mut content = String::new();
        std::io::Read::read_to_string(&mut manifest_entry, &mut content)
            .expect("read content");
        assert!(content.contains("0.3.0"));
    }

    #[test]
    fn pack_zip_from_staging_empty_dir() {
        let tmp = tempfile::tempdir().expect("create tempdir");
        let staging = tmp.path().join("ydsz-diagnostics-empty");
        fs::create_dir(&staging).expect("mkdir staging");

        let zip_path = pack_zip_from_staging(&staging).expect("pack empty");

        assert!(zip_path.exists());
        // 空 staging 也应生成有效的空 zip
        let file = fs::File::open(&zip_path).expect("open zip");
        let archive = zip::ZipArchive::new(file).expect("read archive");
        assert_eq!(archive.len(), 0);
    }

    #[test]
    fn pack_zip_from_staging_nonexistent_returns_error() {
        let result = pack_zip_from_staging(Path::new("/this/path/does/not/exist/99999"));
        assert!(result.is_err());
    }
}
