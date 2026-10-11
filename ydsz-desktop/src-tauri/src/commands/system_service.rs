//! # 系统服务注册模块 (G14-P2)
//!
//! 支持将 ydsz-buddy 注册为系统服务（systemd / launchd / Windows Service），
//! 实现开机自启和后台常驻运行。
//!
//! 跨平台支持：
//! - Windows: 调用 `sc.exe` 注册/卸载 Windows 服务
//! - macOS: 生成 plist + `launchctl load/unload`
//! - Linux: 生成 systemd unit 文件 + `systemctl enable`

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::State;
use tracing::{info, warn};

// ============================================================================
// 数据结构
// ============================================================================

/// 服务状态信息
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct ServiceStatus {
    pub installed: bool,
    pub running: Option<bool>,
    pub startup_enabled: Option<bool>,
    pub platform: String,
    pub service_name: String,
    pub config_path: Option<String>,
    pub binary_path: Option<String>,
}

/// 安装配置输入
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct ServiceInstallConfig {
    pub auto_start: bool,
    pub port: Option<u16>,
    pub log_level: Option<String>,
}

impl Default for ServiceInstallConfig {
    fn default() -> Self {
        Self {
            auto_start: true,
            port: None,
            log_level: Some("info".to_string()),
        }
    }
}

/// 通用操作结果
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct ServiceOperationResult {
    pub success: bool,
    pub message: String,
}

/// 平台类型
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Platform {
    Windows,
    MacOS,
    Linux,
    Unsupported,
}

fn current_platform() -> Platform {
    #[cfg(target_os = "windows")]
    {
        Platform::Windows
    }
    #[cfg(target_os = "macos")]
    {
        Platform::MacOS
    }
    #[cfg(target_os = "linux")]
    {
        Platform::Linux
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        Platform::Unsupported
    }
}

fn service_name() -> &'static str {
    match current_platform() {
        Platform::Windows => "ydsz-buddy",
        Platform::MacOS => "com.ydsz-buddy.app",
        Platform::Linux => "ydsz-buddy",
        Platform::Unsupported => "ydsz-buddy",
    }
}

/// 获取当前可执行文件路径
fn current_binary_path() -> Option<PathBuf> {
    std::env::current_exe().ok()
}

// ============================================================================
// 通用帮助函数
// ============================================================================

/// 获取配置路径
fn service_config_path() -> Option<PathBuf> {
    match current_platform() {
        Platform::Windows => {
            // Windows: 使用 ProgramData 或用户 AppData
            std::env::var("PROGRAMDATA")
                .ok()
                .map(|p| PathBuf::from(p).join("ydsz-buddy").join("service.toml"))
                .or_else(|| {
                    std::env::var("APPDATA")
                        .ok()
                        .map(|p| PathBuf::from(p).join("ydsz-buddy").join("service.toml"))
                })
        }
        Platform::MacOS => {
            // macOS: LaunchAgents 目录
            std::env::var("HOME")
                .ok()
                .map(|p| {
                    PathBuf::from(p)
                        .join("Library")
                        .join("LaunchAgents")
                        .join("com.ydsz-buddy.app.plist")
                })
        }
        Platform::Linux => {
            // Linux: systemd user unit 路径
            std::env::var("HOME")
                .ok()
                .map(|p| {
                    PathBuf::from(p)
                        .join(".config")
                        .join("systemd")
                        .join("user")
                        .join("ydsz-buddy.service")
                })
        }
        Platform::Unsupported => None,
    }
}

// ============================================================================
// Platform-specific implementations
// ============================================================================

/// 检查服务是否已安装
fn check_installed() -> (bool, Option<String>) {
    match current_platform() {
        Platform::Windows => {
            let output = std::process::Command::new("sc.exe")
                .args(["query", service_name()])
                .output();
            match output {
                Ok(o) => {
                    let installed = o.status.success();
                    let config_path = service_config_path()
                        .and_then(|p| p.to_str().map(String::from));
                    (installed, config_path)
                }
                Err(_) => (false, None),
            }
        }
        Platform::MacOS => {
            if let Some(ref path) = service_config_path() {
                (path.exists(), path.to_str().map(String::from))
            } else {
                (false, None)
            }
        }
        Platform::Linux => {
            if let Some(ref path) = service_config_path() {
                (path.exists(), path.to_str().map(String::from))
            } else {
                (false, None)
            }
        }
        Platform::Unsupported => (false, None),
    }
}

/// 检查服务运行状态
fn check_running() -> Option<bool> {
    match current_platform() {
        Platform::Windows => {
            let output = std::process::Command::new("sc.exe")
                .args(["query", service_name()])
                .output()
                .ok()?;
            let stdout = String::from_utf8_lossy(&output.stdout);
            if stdout.contains("RUNNING") {
                Some(true)
            } else if stdout.contains("STOPPED") {
                Some(false)
            } else {
                None
            }
        }
        Platform::MacOS => {
            let output = std::process::Command::new("launchctl")
                .args(["list", service_name()])
                .output()
                .ok()?;
            Some(output.status.success())
        }
        Platform::Linux => {
            let output = std::process::Command::new("systemctl")
                .args(["--user", "is-active", service_name()])
                .output()
                .ok()?;
            Some(output.status.success())
        }
        Platform::Unsupported => None,
    }
}

// ============================================================================
// 安装
// ============================================================================

#[cfg(target_os = "windows")]
fn do_install(config: &ServiceInstallConfig) -> ServiceOperationResult {
    let Some(binary_path) = current_binary_path() else {
        return ServiceOperationResult {
            success: false,
            message: "无法获取当前可执行文件路径".to_string(),
        };
    };

    // 创建服务（Windows）
    let bin_path_arg = format!("\"{}\"", binary_path.to_string_lossy());
    let output = std::process::Command::new("sc.exe")
        .args([
            "create",
            service_name(),
            "binPath=",
            &bin_path_arg,
            "start=",
            if config.auto_start { "auto" } else { "demand" },
            "DisplayName=",
            "\"ydsz-buddy AI Workspace\"",
        ])
        .output();

    match output {
        Ok(o) if o.status.success() => {
            // 设置描述
            let _ = std::process::Command::new("sc.exe")
                .args([
                    "description",
                    service_name(),
                    "\"ydsz-buddy AI-native workspace background service\"",
                ])
                .output();

            // 保存配置
            if let Some(config_path) = service_config_path() {
                if let Some(parent) = config_path.parent() {
                    let _ = std::fs::create_dir_all(parent);
                }
                let content = format!(
                    "auto_start = {}\nport = {}\nlog_level = \"{}\"\n",
                    config.auto_start,
                    config.port.unwrap_or(9721),
                    config.log_level.as_deref().unwrap_or("info"),
                );
                let _ = std::fs::write(&config_path, content);
            }

            ServiceOperationResult {
                success: true,
                message: "Windows 服务安装成功".to_string(),
            }
        }
        Ok(o) => {
            let stderr = String::from_utf8_lossy(&o.stderr);
            ServiceOperationResult {
                success: false,
                message: format!("安装失败: {}", stderr),
            }
        }
        Err(e) => ServiceOperationResult {
            success: false,
            message: format!("安装执行失败: {}", e),
        },
    }
}

#[cfg(target_os = "macos")]
fn do_install(config: &ServiceInstallConfig) -> ServiceOperationResult {
    let Some(binary_path) = current_binary_path() else {
        return ServiceOperationResult {
            success: false,
            message: "无法获取当前可执行文件路径".to_string(),
        };
    };

    let Some(ref plist_path) = service_config_path() else {
        return ServiceOperationResult {
            success: false,
            message: "无法确定 plist 文件路径".to_string(),
        };
    };

    let port = config.port.unwrap_or(9721);
    let log_level = config.log_level.as_deref().unwrap_or("info");

    // 生成 plist 文件
    let plist_content = format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>{}</string>
    <key>ProgramArguments</key>
    <array>
        <string>{}</string>
        <string>--port</string>
        <string>{}</string>
        <string>--log-level</string>
        <string>{}</string>
    </array>
    <key>RunAtLoad</key>
    <{} />
    <key>KeepAlive</key>
    <true />
    <key>StandardOutPath</key>
    <string>/tmp/ydsz-buddy.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/ydsz-buddy.err.log</string>
    <key>WorkingDirectory</key>
    <string>/tmp</string>
</dict>
</plist>"#,
        service_name(),
        binary_path.to_string_lossy(),
        port,
        log_level,
        if config.auto_start { "true" } else { "false" },
    );

    // 确保目录存在
    if let Some(parent) = plist_path.parent() {
        if let Err(e) = std::fs::create_dir_all(parent) {
            return ServiceOperationResult {
                success: false,
                message: format!("创建 LaunchAgents 目录失败: {}", e),
            };
        }
    }

    // 写入 plist
    if let Err(e) = std::fs::write(plist_path, &plist_content) {
        return ServiceOperationResult {
            success: false,
            message: format!("写入 plist 文件失败: {}", e),
        };
    }

    // Load the service
    let load_result = std::process::Command::new("launchctl")
        .args(["load", plist_path.to_str().unwrap_or("")])
        .output();

    match load_result {
        Ok(o) if o.status.success() => ServiceOperationResult {
            success: true,
            message: "macOS LaunchAgent 安装成功并已加载".to_string(),
        },
        Ok(o) => ServiceOperationResult {
            success: false,
            message: format!("加载服务失败: {}", String::from_utf8_lossy(&o.stderr)),
        },
        Err(e) => ServiceOperationResult {
            success: false,
            message: format!("加载服务执行失败: {}", e),
        },
    }
}

#[cfg(target_os = "linux")]
fn do_install(config: &ServiceInstallConfig) -> ServiceOperationResult {
    let Some(binary_path) = current_binary_path() else {
        return ServiceOperationResult {
            success: false,
            message: "无法获取当前可执行文件路径".to_string(),
        };
    };

    let Some(ref unit_path) = service_config_path() else {
        return ServiceOperationResult {
            success: false,
            message: "无法确定 systemd unit 文件路径".to_string(),
        };
    };

    let port = config.port.unwrap_or(9721);
    let log_level = config.log_level.as_deref().unwrap_or("info");

    // 生成 systemd unit 文件
    let unit_content = format!(
        r#"[Unit]
Description=ydsz-buddy AI-native workspace background service
After=network.target

[Service]
Type=simple
ExecStart={} --port {} --log-level {}
Restart=on-failure
RestartSec=5
WorkingDirectory=/tmp
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=default.target
"#,
        binary_path.to_string_lossy(),
        port,
        log_level,
    );

    // 确保目录存在
    if let Some(parent) = unit_path.parent() {
        if let Err(e) = std::fs::create_dir_all(parent) {
            return ServiceOperationResult {
                success: false,
                message: format!("创建 systemd user 目录失败: {}", e),
            };
        }
    }

    // 写入 unit 文件
    if let Err(e) = std::fs::write(unit_path, &unit_content) {
        return ServiceOperationResult {
            success: false,
            message: format!("写入 unit 文件失败: {}", e),
        };
    }

    // Reload systemd and enable
    let _ = std::process::Command::new("systemctl")
        .args(["--user", "daemon-reload"])
        .output();

    if config.auto_start {
        let enable_result = std::process::Command::new("systemctl")
            .args(["--user", "enable", service_name()])
            .output();
        if let Ok(ref o) = enable_result {
            if !o.status.success() {
                warn!("启用开机自启失败: {}", String::from_utf8_lossy(&o.stderr));
            }
        }
    }

    // Start the service
    let start_result = std::process::Command::new("systemctl")
        .args(["--user", "start", service_name()])
        .output();

    match start_result {
        Ok(o) if o.status.success() => ServiceOperationResult {
            success: true,
            message: "systemd user service 安装并启动成功".to_string(),
        },
        Ok(o) => ServiceOperationResult {
            success: false,
            message: format!("启动服务失败: {}", String::from_utf8_lossy(&o.stderr)),
        },
        Err(e) => ServiceOperationResult {
            success: false,
            message: format!("启动服务执行失败: {}", e),
        },
    }
}

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
fn do_install(_config: &ServiceInstallConfig) -> ServiceOperationResult {
    ServiceOperationResult {
        success: false,
        message: "当前平台不支持系统服务注册".to_string(),
    }
}

// ============================================================================
// 卸载
// ============================================================================

#[cfg(target_os = "windows")]
fn do_uninstall() -> ServiceOperationResult {
    // 先停止服务
    let _ = std::process::Command::new("sc.exe")
        .args(["stop", service_name()])
        .output();

    // 删除服务
    let output = std::process::Command::new("sc.exe")
        .args(["delete", service_name()])
        .output();

    match output {
        Ok(o) if o.status.success() => {
            // 清理配置文件
            if let Some(config_path) = service_config_path() {
                let _ = std::fs::remove_file(&config_path);
            }
            ServiceOperationResult {
                success: true,
                message: "Windows 服务卸载成功".to_string(),
            }
        }
        Ok(o) => ServiceOperationResult {
            success: false,
            message: format!("卸载失败: {}", String::from_utf8_lossy(&o.stderr)),
        },
        Err(e) => ServiceOperationResult {
            success: false,
            message: format!("卸载执行失败: {}", e),
        },
    }
}

#[cfg(target_os = "macos")]
fn do_uninstall() -> ServiceOperationResult {
    let Some(ref plist_path) = service_config_path() else {
        return ServiceOperationResult {
            success: false,
            message: "无法确定 plist 文件路径".to_string(),
        };
    };

    // Unload the service
    let _ = std::process::Command::new("launchctl")
        .args(["unload", plist_path.to_str().unwrap_or("")])
        .output();

    // Remove plist file
    match std::fs::remove_file(plist_path) {
        Ok(()) => ServiceOperationResult {
            success: true,
            message: "macOS LaunchAgent 卸载成功".to_string(),
        },
        Err(e) => ServiceOperationResult {
            success: false,
            message: format!("删除 plist 文件失败: {}", e),
        },
    }
}

#[cfg(target_os = "linux")]
fn do_uninstall() -> ServiceOperationResult {
    // Stop service
    let _ = std::process::Command::new("systemctl")
        .args(["--user", "stop", service_name()])
        .output();

    // Disable service
    let _ = std::process::Command::new("systemctl")
        .args(["--user", "disable", service_name()])
        .output();

    // Remove unit file
    if let Some(ref unit_path) = service_config_path() {
        if unit_path.exists() {
            if let Err(e) = std::fs::remove_file(unit_path) {
                return ServiceOperationResult {
                    success: false,
                    message: format!("删除 unit 文件失败: {}", e),
                };
            }
        }
    }

    // Reload systemd
    let _ = std::process::Command::new("systemctl")
        .args(["--user", "daemon-reload"])
        .output();

    ServiceOperationResult {
        success: true,
        message: "systemd user service 卸载成功".to_string(),
    }
}

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
fn do_uninstall() -> ServiceOperationResult {
    ServiceOperationResult {
        success: false,
        message: "当前平台不支持系统服务卸载".to_string(),
    }
}

// ============================================================================
// 服务控制
// ============================================================================

#[cfg(target_os = "windows")]
fn do_start() -> ServiceOperationResult {
    let output = std::process::Command::new("sc.exe")
        .args(["start", service_name()])
        .output();
    match output {
        Ok(o) if o.status.success() => ServiceOperationResult {
            success: true,
            message: "服务启动成功".to_string(),
        },
        Ok(o) => ServiceOperationResult {
            success: false,
            message: format!("启动失败: {}", String::from_utf8_lossy(&o.stderr)),
        },
        Err(e) => ServiceOperationResult {
            success: false,
            message: format!("启动执行失败: {}", e),
        },
    }
}

#[cfg(target_os = "macos")]
fn do_start() -> ServiceOperationResult {
    let Some(ref plist_path) = service_config_path() else {
        return ServiceOperationResult {
            success: false,
            message: "无法确定 plist 文件路径".to_string(),
        };
    };
    let output = std::process::Command::new("launchctl")
        .args(["load", plist_path.to_str().unwrap_or("")])
        .output();
    match output {
        Ok(o) if o.status.success() => ServiceOperationResult {
            success: true,
            message: "LaunchAgent 启动成功".to_string(),
        },
        Err(e) => ServiceOperationResult {
            success: false,
            message: format!("启动失败: {}", e),
        },
        Ok(o) => ServiceOperationResult {
            success: false,
            message: format!("启动失败: {}", String::from_utf8_lossy(&o.stderr)),
        },
    }
}

#[cfg(target_os = "linux")]
fn do_start() -> ServiceOperationResult {
    let output = std::process::Command::new("systemctl")
        .args(["--user", "start", service_name()])
        .output();
    match output {
        Ok(o) if o.status.success() => ServiceOperationResult {
            success: true,
            message: "服务启动成功".to_string(),
        },
        Ok(o) => ServiceOperationResult {
            success: false,
            message: format!("启动失败: {}", String::from_utf8_lossy(&o.stderr)),
        },
        Err(e) => ServiceOperationResult {
            success: false,
            message: format!("启动执行失败: {}", e),
        },
    }
}

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
fn do_start() -> ServiceOperationResult {
    ServiceOperationResult {
        success: false,
        message: "当前平台不支持服务管理".to_string(),
    }
}

#[cfg(target_os = "windows")]
fn do_stop() -> ServiceOperationResult {
    let output = std::process::Command::new("sc.exe")
        .args(["stop", service_name()])
        .output();
    match output {
        Ok(o) if o.status.success() => ServiceOperationResult {
            success: true,
            message: "服务停止成功".to_string(),
        },
        Ok(o) => ServiceOperationResult {
            success: false,
            message: format!("停止失败: {}", String::from_utf8_lossy(&o.stderr)),
        },
        Err(e) => ServiceOperationResult {
            success: false,
            message: format!("停止执行失败: {}", e),
        },
    }
}

#[cfg(target_os = "macos")]
fn do_stop() -> ServiceOperationResult {
    let Some(ref plist_path) = service_config_path() else {
        return ServiceOperationResult {
            success: false,
            message: "无法确定 plist 文件路径".to_string(),
        };
    };
    let output = std::process::Command::new("launchctl")
        .args(["unload", plist_path.to_str().unwrap_or("")])
        .output();
    match output {
        Ok(o) if o.status.success() => ServiceOperationResult {
            success: true,
            message: "LaunchAgent 卸载（停止）成功".to_string(),
        },
        Ok(o) => ServiceOperationResult {
            success: false,
            message: format!("卸载失败: {}", String::from_utf8_lossy(&o.stderr)),
        },
        Err(e) => ServiceOperationResult {
            success: false,
            message: format!("卸载执行失败: {}", e),
        },
    }
}

#[cfg(target_os = "linux")]
fn do_stop() -> ServiceOperationResult {
    let output = std::process::Command::new("systemctl")
        .args(["--user", "stop", service_name()])
        .output();
    match output {
        Ok(o) if o.status.success() => ServiceOperationResult {
            success: true,
            message: "服务停止成功".to_string(),
        },
        Ok(o) => ServiceOperationResult {
            success: false,
            message: format!("停止失败: {}", String::from_utf8_lossy(&o.stderr)),
        },
        Err(e) => ServiceOperationResult {
            success: false,
            message: format!("停止执行失败: {}", e),
        },
    }
}

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
fn do_stop() -> ServiceOperationResult {
    ServiceOperationResult {
        success: false,
        message: "当前平台不支持服务管理".to_string(),
    }
}

// ============================================================================
// Tauri 命令
// ============================================================================

/// 获取系统服务管理器状态（无状态管理器，纯系统查询）
pub struct SystemServiceState;

impl SystemServiceState {
    pub fn new() -> Self {
        Self
    }
}

impl Default for SystemServiceState {
    fn default() -> Self {
        Self::new()
    }
}

/// 查询系统服务状态
#[tauri::command]
#[specta::specta]
pub async fn system_service_status(
    _state: State<'_, SystemServiceState>,
) -> Result<ServiceStatus, String> {
    let (installed, config_path) = check_installed();
    let running = check_running();
    let platform = format!("{:?}", current_platform()).to_lowercase();

    // 检查开机自启状态
    let startup_enabled = match current_platform() {
        Platform::Linux => {
            let output = std::process::Command::new("systemctl")
                .args(["--user", "is-enabled", service_name()])
                .output()
                .ok();
            output.map(|o| o.status.success())
        }
        _ => {
            // Windows: auto start config is reflected by "start= auto" in sc query
            // macOS: RunAtLoad in plist
            Some(installed)
        }
    };

    Ok(ServiceStatus {
        installed,
        running,
        startup_enabled,
        platform,
        service_name: service_name().to_string(),
        config_path,
        binary_path: current_binary_path().and_then(|p| p.to_str().map(String::from)),
    })
}

/// 安装系统服务
#[tauri::command]
#[specta::specta]
pub async fn system_service_install(
    _state: State<'_, SystemServiceState>,
    config: ServiceInstallConfig,
) -> Result<ServiceOperationResult, String> {
    info!("安装系统服务: auto_start={}", config.auto_start);

    if current_platform() == Platform::Unsupported {
        return Ok(ServiceOperationResult {
            success: false,
            message: "当前平台不支持系统服务".to_string(),
        });
    }

    // 检查是否已安装
    let (installed, _) = check_installed();
    if installed {
        return Ok(ServiceOperationResult {
            success: false,
            message: "服务已安装，请先卸载后再重新安装".to_string(),
        });
    }

    Ok(do_install(&config))
}

/// 卸载系统服务
#[tauri::command]
#[specta::specta]
pub async fn system_service_uninstall(
    _state: State<'_, SystemServiceState>,
) -> Result<ServiceOperationResult, String> {
    info!("卸载系统服务");
    Ok(do_uninstall())
}

/// 启动系统服务
#[tauri::command]
#[specta::specta]
pub async fn system_service_start(
    _state: State<'_, SystemServiceState>,
) -> Result<ServiceOperationResult, String> {
    info!("启动系统服务");
    Ok(do_start())
}

/// 停止系统服务
#[tauri::command]
#[specta::specta]
pub async fn system_service_stop(
    _state: State<'_, SystemServiceState>,
) -> Result<ServiceOperationResult, String> {
    info!("停止系统服务");
    Ok(do_stop())
}

/// 重启系统服务
#[tauri::command]
#[specta::specta]
pub async fn system_service_restart(
    _state: State<'_, SystemServiceState>,
) -> Result<ServiceOperationResult, String> {
    info!("重启系统服务");
    let stop_result = do_stop();
    if !stop_result.success && current_platform() != Platform::Windows {
        // On macOS/Linux, stopping a non-running service may fail - continue anyway
    }
    let start_result = do_start();
    Ok(ServiceOperationResult {
        success: start_result.success,
        message: format!("{}; {}", stop_result.message, start_result.message),
    })
}

/// 设置开机自启
#[tauri::command]
#[specta::specta]
pub async fn system_service_set_autostart(
    _state: State<'_, SystemServiceState>,
    enabled: bool,
) -> Result<ServiceOperationResult, String> {
    info!(enabled, "设置开机自启");

    match current_platform() {
        Platform::Linux => {
            let action = if enabled { "enable" } else { "disable" };
            let output = std::process::Command::new("systemctl")
                .args(["--user", action, service_name()])
                .output();
            match output {
                Ok(o) if o.status.success() => Ok(ServiceOperationResult {
                    success: true,
                    message: format!("开机自启已{}", if enabled { "启用" } else { "禁用" }),
                }),
                Ok(o) => Ok(ServiceOperationResult {
                    success: false,
                    message: format!("{}", String::from_utf8_lossy(&o.stderr)),
                }),
                Err(e) => Ok(ServiceOperationResult {
                    success: false,
                    message: format!("{}", e),
                }),
            }
        }
        Platform::MacOS => {
            // 对于 macOS，需要修改 plist 中的 RunAtLoad
            if let Some(ref plist_path) = service_config_path() {
                if plist_path.exists() {
                    let content = std::fs::read_to_string(plist_path).map_err(|e| e.to_string())?;
                    let updated = if enabled {
                        content.replace("<false />", "<true />")
                    } else {
                        content.replace("<true />", "<false />")
                    };
                    std::fs::write(plist_path, updated).map_err(|e| e.to_string())?;
                    // Reload
                    let _ = std::process::Command::new("launchctl")
                        .args(["unload", plist_path.to_str().unwrap_or("")])
                        .output();
                    let _ = std::process::Command::new("launchctl")
                        .args(["load", plist_path.to_str().unwrap_or("")])
                        .output();
                }
            }
            Ok(ServiceOperationResult {
                success: true,
                message: format!("macOS LaunchAgent RunAtLoad 已设置为 {}", enabled),
            })
        }
        Platform::Windows => {
            let start_type = if enabled { "auto" } else { "demand" };
            let output = std::process::Command::new("sc.exe")
                .args(["config", service_name(), "start=", start_type])
                .output();
            match output {
                Ok(o) if o.status.success() => Ok(ServiceOperationResult {
                    success: true,
                    message: format!("Windows 服务启动类型已设置为 {}", start_type),
                }),
                Ok(o) => Ok(ServiceOperationResult {
                    success: false,
                    message: format!("{}", String::from_utf8_lossy(&o.stderr)),
                }),
                Err(e) => Ok(ServiceOperationResult {
                    success: false,
                    message: format!("{}", e),
                }),
            }
        }
        Platform::Unsupported => Ok(ServiceOperationResult {
            success: false,
            message: "当前平台不支持此操作".to_string(),
        }),
    }
}
