//! # 截图 OCR 命令模块
//!
//! 本模块提供与截图 OCR 相关的 Tauri 命令，支持将图像中的文字识别出来。
//!
//! ## 平台适配策略
//!
//! - **macOS**: 优先使用 Apple Vision 框架(`VNRecognizeTextRequest`),
//!   通过内嵌的 Swift 脚本调用,识别准确率最高
//! - **Windows**: 优先使用 Windows.Media.Ocr(Win10+ UWP OCR),
//!   通过 PowerShell 脚本调用
//! - **其它平台 / 兜底**: 调用系统中的 `tesseract` 二进制
//!
//! ## 输入来源
//!
//! 接受 Base64 编码的图像数据 **或** 磁盘上的文件路径;
//! Base64 数据会先落盘到临时文件,再交给 provider 处理。
//!
//! ## 错误语义
//!
//! - provider 不可用时返回明确的错误信息,前端可以选择降级到"无 OCR 模式"或展示
//!   "请安装 tesseract"等引导文案
//! - 临时文件会在命令结束时自动清理(NamedTempFile 析构)

use base64::Engine;
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Stdio;

/// OCR 识别输入
#[derive(Debug, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct OcrImageInput {
    /// 图像数据源
    pub source: OcrSource,
    /// BCP-47 语言标签(如 "zh-Hans"、"en-US"),可选
    #[serde(default)]
    pub language: Option<String>,
}

/// 图像数据源
#[derive(Debug, Deserialize, specta::Type)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum OcrSource {
    /// Base64 编码的图像数据
    Base64 {
        /// 完整 Base64 字符串(可带 data URL 前缀)
        data: String,
        /// MIME 类型(用于写临时文件扩展名,可选)
        #[serde(default)]
        mime: Option<String>,
    },
    /// 磁盘上的文件绝对路径
    Path { path: String },
}

/// 单行识别结果
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct OcrLine {
    /// 行文本
    pub text: String,
    /// 置信度(0.0 - 1.0)
    pub confidence: f32,
    /// 像素坐标 [x, y, width, height],可能为 None(provider 不支持)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bbox: Option<[i32; 4]>,
}

/// OCR 识别结果
#[derive(Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct OcrResult {
    /// 识别出的完整文本(多行用 \n 分隔)
    pub text: String,
    /// 使用的 provider
    pub provider: String,
    /// 整体置信度
    pub confidence: f32,
    /// 单行结果
    pub lines: Vec<OcrLine>,
    /// 识别耗时(毫秒)
    pub elapsed_ms: u64,
}

/// OCR provider 信息
#[derive(Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct OcrProviderInfo {
    /// 当前激活的 provider
    pub active: String,
    /// 当前平台
    pub platform: String,
    /// 系统中是否找到 tesseract
    pub tesseract_installed: bool,
    /// tesseract 路径(若已安装)
    pub tesseract_path: Option<String>,
    /// 可用的 provider 列表(按优先级)
    pub available: Vec<String>,
    /// macOS Swift 运行时是否可用
    pub swift_available: bool,
    /// PowerShell 运行时是否可用(仅 Windows)
    pub powershell_available: bool,
}

/// 列出当前可用的 OCR provider
#[tauri::command]
#[specta::specta]
pub fn ocr_list_providers() -> OcrProviderInfo {
    let tesseract = which::which("tesseract").ok();
    let swift = which::which("swift").ok();
    let powershell = which::which("powershell")
        .or_else(|_| which::which("pwsh"))
        .ok();
    let available = build_available_providers(
        tesseract.is_some(),
        swift.is_some(),
        powershell.is_some(),
    );
    let active = pick_active_provider(&available).to_string();

    OcrProviderInfo {
        active,
        platform: std::env::consts::OS.to_string(),
        tesseract_installed: tesseract.is_some(),
        tesseract_path: tesseract.map(|p| p.display().to_string()),
        swift_available: swift.is_some(),
        powershell_available: powershell.is_some(),
        available,
    }
}

/// 识别图像中的文字
#[tauri::command]
#[specta::specta]
pub async fn ocr_recognize_text(input: OcrImageInput) -> Result<OcrResult, String> {
    let started = std::time::Instant::now();

    // 1. 落盘到临时文件(若 source 是 Base64)或使用给定路径
    let (image_path, _tmpfile_guard) = match &input.source {
        OcrSource::Path { path } => {
            let p = PathBuf::from(path);
            if !p.exists() {
                return Err(format!("image file not found: {path}"));
            }
            (p, None)
        }
        OcrSource::Base64 { data, mime } => {
            let cleaned = strip_data_url_prefix(data);
            let bytes = base64::engine::general_purpose::STANDARD
                .decode(cleaned)
                .map_err(|e| format!("invalid base64 data: {e}"))?;
            let ext = mime_to_extension(mime.as_deref());
            let mut tmp = tempfile::Builder::new()
                .prefix("ydsz-ocr-")
                .suffix(&format!(".{ext}"))
                .tempfile()
                .map_err(|e| format!("create temp file failed: {e}"))?;
            tmp.write_all(&bytes)
                .map_err(|e| format!("write temp file failed: {e}"))?;
            let path = tmp.path().to_path_buf();
            (path, Some(tmp))
        }
    };

    // 2. 选 provider
    let lang = input
        .language
        .unwrap_or_else(|| "en".to_string());
    let tesseract_ok = which::which("tesseract").is_ok();
    let swift_ok = which::which("swift").is_ok();
    let powershell_ok = which::which("powershell")
        .or_else(|_| which::which("pwsh"))
        .is_ok();
    let available = build_available_providers(tesseract_ok, swift_ok, powershell_ok);
    let provider = pick_active_provider(&available).to_string();

    // 3. 调对应 provider
    let mut result = match provider.as_str() {
        "tesseract" => recognize_with_tesseract(&image_path, &lang).await?,
        #[cfg(target_os = "macos")]
        "macos_vision" => recognize_with_macos_vision(&image_path, &lang).await?,
        #[cfg(target_os = "windows")]
        "windows_ocr" => recognize_with_windows_ocr(&image_path, &lang).await?,
        other => return Err(format!("unsupported provider: {other}")),
    };
    result.elapsed_ms = started.elapsed().as_millis() as u64;
    Ok(result)
}

/// 识别图像中的文字（简化版 Agent 接口）
///
/// 接收文件路径直接返回识别文本，适合 Agent 调用。
///
/// # 参数
/// - `path`: 图像文件路径
/// - `language`: 可选语言标签（如 "zh-Hans"、"en-US"）
#[tauri::command]
#[specta::specta]
pub async fn ocr_recognize_from_path(
    path: String,
    language: Option<String>,
) -> Result<String, String> {
    let input = OcrImageInput {
        source: OcrSource::Path { path },
        language,
    };
    let result = ocr_recognize_text(input).await?;
    Ok(result.text)
}

/// 把 "data:image/png;base64,xxxx" 前缀剥掉
fn strip_data_url_prefix(data: &str) -> &str {
    if let Some(idx) = data.find("base64,") {
        &data[idx + "base64,".len()..]
    } else {
        data
    }
}

fn mime_to_extension(mime: Option<&str>) -> &'static str {
    match mime.unwrap_or("image/png") {
        m if m.contains("jpeg") || m.contains("jpg") => "jpg",
        m if m.contains("webp") => "webp",
        m if m.contains("bmp") => "bmp",
        m if m.contains("gif") => "gif",
        m if m.contains("tiff") => "tiff",
        _ => "png",
    }
}

/// 按平台构造可用 provider 列表
fn build_available_providers(
    tesseract_installed: bool,
    swift_installed: bool,
    powershell_installed: bool,
) -> Vec<String> {
    let mut out = Vec::new();
    #[cfg(target_os = "macos")]
    {
        if swift_installed {
            out.push("macos_vision".to_string());
        }
    }
    #[cfg(target_os = "windows")]
    {
        if powershell_installed {
            out.push("windows_ocr".to_string());
        }
    }
    #[cfg(all(target_os = "linux", not(target_os = "macos")))]
    {
        // Linux 平台只走 Tesseract
    }
    if tesseract_installed {
        out.push("tesseract".to_string());
    }
    out
}

fn pick_active_provider(available: &[String]) -> &str {
    for pref in ["macos_vision", "windows_ocr", "tesseract"] {
        if available.iter().any(|p| p == pref) {
            return pref;
        }
    }
    "none"
}

/// 调用 tesseract CLI
async fn recognize_with_tesseract(
    image_path: &Path,
    language: &str,
) -> Result<OcrResult, String> {
    // tesseract <image> stdout -l <lang> tsv
    // 我们用 stdout + 默认文本输出,简单稳定
    let output = tokio::process::Command::new("tesseract")
        .arg(image_path)
        .arg("stdout")
        .arg("-l")
        .arg(language)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("tesseract spawn failed: {e}; please install tesseract (brew install tesseract / apt install tesseract-ocr)"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "tesseract exited with {:?}: {}",
            output.status.code(),
            stderr.trim()
        ));
    }

    let text = String::from_utf8_lossy(&output.stdout).trim_end().to_string();
    let lines: Vec<OcrLine> = text
        .lines()
        .filter(|l| !l.trim().is_empty())
        .map(|l| OcrLine {
            text: l.to_string(),
            confidence: 0.0, // tesseract 默认输出不含 confidence
            bbox: None,
        })
        .collect();
    Ok(OcrResult {
        text,
        provider: "tesseract".to_string(),
        confidence: 0.0,
        lines,
        elapsed_ms: 0,
    })
}

/// macOS Vision OCR: 通过内嵌 Swift 脚本调用
#[cfg(target_os = "macos")]
async fn recognize_with_macos_vision(
    image_path: &Path,
    language: &str,
) -> Result<OcrResult, String> {
    let script = include_str!("../../scripts/ocr_vision.swift");
    // 把脚本写到临时文件(swift 不支持 -c 走 stdin)
    let mut tmp = tempfile::Builder::new()
        .prefix("ydsz-ocr-")
        .suffix(".swift")
        .tempfile()
        .map_err(|e| format!("create temp swift script failed: {e}"))?;
    tmp.write_all(script.as_bytes())
        .map_err(|e| format!("write temp swift script failed: {e}"))?;
    let script_path = tmp.path().to_path_buf();

    // macOS 语言代码转换: zh-Hans -> zh-Hans, en-US -> en-US
    let lang_arg = language.to_string();

    let output = tokio::process::Command::new("swift")
        .arg(script_path)
        .arg(image_path)
        .arg(&lang_arg)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("swift spawn failed: {e}; please ensure Xcode CommandLineTools installed"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "macOS Vision OCR failed (exit {:?}): {}",
            output.status.code(),
            stderr.trim()
        ));
    }

    let text = String::from_utf8_lossy(&output.stdout).trim_end().to_string();
    let lines: Vec<OcrLine> = text
        .lines()
        .filter(|l| !l.trim().is_empty())
        .map(|l| OcrLine {
            text: l.to_string(),
            confidence: 1.0,
            bbox: None,
        })
        .collect();
    Ok(OcrResult {
        text,
        provider: "macos_vision".to_string(),
        confidence: 1.0,
        lines,
        elapsed_ms: 0,
    })
}

/// Windows OCR: 通过 PowerShell 调用 Windows.Media.Ocr
#[cfg(target_os = "windows")]
async fn recognize_with_windows_ocr(
    image_path: &Path,
    language: &str,
) -> Result<OcrResult, String> {
    let script = include_str!("../../scripts/ocr_windows.ps1");
    let mut tmp = tempfile::Builder::new()
        .prefix("ydsz-ocr-")
        .suffix(".ps1")
        .tempfile()
        .map_err(|e| format!("create temp powershell script failed: {e}"))?;
    tmp.write_all(script.as_bytes())
        .map_err(|e| format!("write temp powershell script failed: {e}"))?;
    let script_path = tmp.path().to_path_buf();

    let lang_arg = language.to_string();

    let output = tokio::process::Command::new("powershell")
        .arg("-NoProfile")
        .arg("-ExecutionPolicy")
        .arg("Bypass")
        .arg("-File")
        .arg(script_path)
        .arg("-ImagePath")
        .arg(image_path)
        .arg("-Language")
        .arg(&lang_arg)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("powershell spawn failed: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "Windows OCR failed (exit {:?}): {}",
            output.status.code(),
            stderr.trim()
        ));
    }

    let text = String::from_utf8_lossy(&output.stdout).trim_end().to_string();
    let lines: Vec<OcrLine> = text
        .lines()
        .filter(|l| !l.trim().is_empty())
        .map(|l| OcrLine {
            text: l.to_string(),
            confidence: 1.0,
            bbox: None,
        })
        .collect();
    Ok(OcrResult {
        text,
        provider: "windows_ocr".to_string(),
        confidence: 1.0,
        lines,
        elapsed_ms: 0,
    })
}

// =====================
// Tests
// =====================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strip_data_url_prefix_handles_data_url() {
        assert_eq!(
            strip_data_url_prefix("data:image/png;base64,abc"),
            "abc"
        );
        assert_eq!(strip_data_url_prefix("raw-base64"), "raw-base64");
    }

    #[test]
    fn mime_to_extension_maps_common_mime_types() {
        assert_eq!(mime_to_extension(Some("image/png")), "png");
        assert_eq!(mime_to_extension(Some("image/jpeg")), "jpg");
        assert_eq!(mime_to_extension(Some("image/webp")), "webp");
        assert_eq!(mime_to_extension(Some("image/bmp")), "bmp");
        assert_eq!(mime_to_extension(None), "png");
    }

    #[test]
    fn pick_active_provider_prefers_native_then_tesseract() {
        let list = vec!["tesseract".to_string(), "macos_vision".to_string()];
        assert_eq!(pick_active_provider(&list), "macos_vision");
        let list2 = vec!["tesseract".to_string(), "windows_ocr".to_string()];
        assert_eq!(pick_active_provider(&list2), "windows_ocr");
        let list3 = vec!["tesseract".to_string()];
        assert_eq!(pick_active_provider(&list3), "tesseract");
        let empty: Vec<String> = vec![];
        assert_eq!(pick_active_provider(&empty), "none");
    }

    #[test]
    fn build_available_providers_respects_platform() {
        // 仅在 tesseract 存在时包含
        let list = build_available_providers(true, false, false);
        #[cfg(target_os = "macos")]
        assert_eq!(list, vec!["tesseract".to_string()]);
        #[cfg(target_os = "windows")]
        assert_eq!(list, vec!["tesseract".to_string()]);
        #[cfg(all(target_os = "linux", not(target_os = "macos")))]
        assert_eq!(list, vec!["tesseract".to_string()]);

        // 无 tesseract 时列表应为空
        let list_none = build_available_providers(false, false, false);
        assert!(list_none.is_empty());
    }

    #[test]
    fn ocr_provider_info_shape() {
        let info = ocr_list_providers();
        // active 不为空
        assert!(!info.active.is_empty());
        // available 不为 None
        // platform 是当前 OS
        assert_eq!(info.platform, std::env::consts::OS);
    }
}
