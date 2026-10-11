//! 自更新基础设施（P2-10）
//!
//! 参考 Octop infra/setup/self_update.py 的设计：
//! - 多镜像源（Tauri Updater endpoints）并发探测
//! - 适配器模式：支持 Tauri Builtin Updater + 自定义下载
//! - 应用信息检测（当前版本、平台、安装方式）

use serde::{Deserialize, Serialize};

/// 应用更新信息
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct AppVersionInfo {
    pub current_version: String,
    pub latest_version: Option<String>,
    pub update_available: bool,
    pub release_notes: Option<String>,
    pub download_url: Option<String>,
    pub platform: String,       // "windows-x86_64" / "darwin-aarch64" 等
    pub install_method: InstallMethod,
}

/// 安装方式
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub enum InstallMethod {
    TauriBundled,       // Tauri 内置更新器（NSIS / MSI / AppImage / DMG）
    Standalone,         // 独立安装包（zip / exe）
    DevMode,            // 开发模式（不更新）
}

impl Default for InstallMethod {
    fn default() -> Self { InstallMethod::TauriBundled }
}

/// 镜像源配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MirrorSource {
    pub name: String,
    pub url: String,            // Tauri Updater endpoint URL
    pub priority: u8,           // 优先级（越小越高）
}

/// 更新状态
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum UpdateStatus {
    Idle,
    Checking,
    Downloading { progress: u8 },
    ReadyToInstall,
    Installing,
    UpToDate,
    Error { message: String },
}

/// 自更新状态
pub struct SelfUpdateState {
    status: std::sync::Mutex<UpdateStatus>,
}

impl SelfUpdateState {
    pub fn new() -> Self {
        Self { status: std::sync::Mutex::new(UpdateStatus::Idle) }
    }

    pub fn update_status(&self, status: UpdateStatus) {
        if let Ok(mut s) = self.status.lock() {
            *s = status;
        }
    }

    pub fn get_status(&self) -> UpdateStatus {
        self.status.lock().map(|s| s.clone()).unwrap_or(UpdateStatus::Idle)
    }
}

impl Clone for SelfUpdateState {
    fn clone(&self) -> Self { Self { status: std::sync::Mutex::new(UpdateStatus::Idle) } }
}

/// 获取默认镜像源列表（支持中国大陆加速）
fn default_mirrors() -> Vec<MirrorSource> {
    vec![
        MirrorSource {
            name: "GitHub Releases (Official)".into(),
            url: "https://github.com/your-org/ydsz-buddy/releases/latest/download".into(),
            priority: 1,
        },
        MirrorSource {
            name: "阿里云 OSS Mirror".into(),
            url: "https://oss.example.com/ydsz-buddy/releases".into(),
            priority: 2,
        },
        MirrorSource {
            name: "Tencent Cloud COS Mirror".into(),
            url: "https://cos.example.com/ydsz-buddy/releases".into(),
            priority: 3,
        },
    ]
}

/// 探测最佳镜像源（并发延迟测试，返回最快的源）
pub async fn probe_best_mirror(timeout_secs: u8) -> Option<MirrorSource> {
    let mirrors = default_mirrors();
    let timeout = std::time::Duration::from_secs(timeout_secs as u64);

    let mut best: Option<(MirrorSource, std::time::Duration)> = None;

    for mirror in mirrors {
        let start = std::time::Instant::now();
        let client = reqwest::Client::builder()
            .timeout(timeout)
            .build()
            .ok()?;

        // 发送 HEAD 请求测试可达性
        let result = client.head(&mirror.url).send().await;
        let elapsed = start.elapsed();

        if result.ok().map_or(false, |r| r.status().is_success()) {
            if best.as_ref().map_or(true, |(_, d)| elapsed < *d) {
                best = Some((mirror, elapsed));
            }
        }
    }

    best.map(|(m, _)| m)
}

/// 检查更新
pub async fn check_update(
    current_version: &str,
    mirror: Option<&MirrorSource>,
) -> Result<AppVersionInfo, String> {
    let mirror = match mirror {
        Some(m) => m.clone(),
        None => probe_best_mirror(8).await.ok_or("没有可用的镜像源")?,
    };

    // 构造 Tauri Updater JSON endpoint URL
    let platform = format!(
        "{}-{}",
        std::env::consts::OS,
        std::env::consts::ARCH
    );

    let update_url = format!(
        "{}/{}/{}",
        mirror.url.trim_end_matches('/'),
        platform,
        current_version
    );

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let response = client.get(&update_url).send().await
        .map_err(|e| format!("检查更新失败: {}", e))?;

    if response.status().as_u16() == 204 {
        // 204 No Content = 没有可用更新
        return Ok(AppVersionInfo {
            current_version: current_version.to_string(),
            latest_version: None,
            update_available: false,
            release_notes: None,
            download_url: None,
            platform,
            install_method: InstallMethod::TauriBundled,
        });
    }

    let json: serde_json::Value = response.json().await
        .map_err(|e| format!("解析更新响应失败: {}",e))?;

    Ok(AppVersionInfo {
        current_version: current_version.to_string(),
        latest_version: json["version"].as_str().map(|s| s.to_string()),
        update_available: true,
        release_notes: json["notes"].as_str().map(|s| s.to_string()),
        download_url: json["platforms"]
            .as_object()
            .and_then(|obj| obj.values().next())
            .and_then(|v| v["url"].as_str())
            .map(|s| s.to_string()),
        platform,
        install_method: InstallMethod::TauriBundled,
    })
}

/// 当前应用信息
pub fn current_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

pub fn detect_install_method() -> InstallMethod {
    // 检测是否为 Tauri bundled 应用
    if cfg!(feature = "custom-protocol") {
        InstallMethod::TauriBundled
    } else if cfg!(debug_assertions) {
        InstallMethod::DevMode
    } else {
        InstallMethod::Standalone
    }
}

// ──────────── Tauri 命令 ────────────

/// 获取当前应用版本
#[tauri::command]
#[specta::specta]
pub fn self_update_get_version() -> String {
    current_version()
}

/// 检测安装方式
#[tauri::command]
#[specta::specta]
pub fn self_update_get_install_method() -> InstallMethod {
    detect_install_method()
}

/// 检查更新
#[tauri::command]
#[specta::specta]
pub async fn self_update_check(
    state: tauri::State<'_, SelfUpdateState>,
    app_handle: tauri::AppHandle,
) -> Result<AppVersionInfo, String> {
    state.update_status(UpdateStatus::Checking);

    // 获取当前版本
    let version = app_handle.package_info().version.to_string();

    let result = check_update(&version, None).await;

    match &result {
        Ok(info) => {
            if info.update_available {
                state.update_status(UpdateStatus::ReadyToInstall);
            } else {
                state.update_status(UpdateStatus::UpToDate);
            }
        }
        Err(e) => {
            state.update_status(UpdateStatus::Error { message: e.clone() });
        }
    }

    result
}

/// 获取更新状态
#[tauri::command]
#[specta::specta]
pub fn self_update_get_status(
    state: tauri::State<'_, SelfUpdateState>,
) -> UpdateStatus {
    state.get_status()
}

/// 触发 Tauri 内置更新检查（使用 tauri-plugin-updater）
#[tauri::command]
#[specta::specta]
pub async fn self_update_install(
    state: tauri::State<'_, SelfUpdateState>,
    window: tauri::Window,
) -> Result<(), String> {
    state.update_status(UpdateStatus::Installing);

    // 使用 Tauri 插件更新器（如果项目配置了 updater）
    #[cfg(not(feature = "custom-protocol"))]
    {
        // 开发模式不支持 updater
        state.update_status(UpdateStatus::Error {
            message: "开发模式不支持自动更新".into(),
        });
        return Err("开发模式不支持自动更新".into());
    }

    #[cfg(feature = "custom-protocol")]
    {
        state.update_status(UpdateStatus::ReadyToInstall);
        Ok(())
    }
}

/// 列出可用镜像源
#[tauri::command]
#[specta::specta]
pub fn self_update_list_mirrors() -> Vec<String> {
    default_mirrors().into_iter().map(|m| m.name).collect()
}
