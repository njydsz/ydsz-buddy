//! # 应用自动更新命令模块
//!
//! 本模块提供与应用自动更新相关的 Tauri 命令，支持版本检查、下载、安装等功能。
//!
//! ## 模块职责
//!
//! - 管理应用更新的状态（可用版本、下载进度等）
//! - 提供前端可调用的更新检查、下载、安装命令
//! - 维护更新状态信息
//! - 通过 Tauri 事件总线向前端推送下载进度
//!
//! ## 核心功能
//!
//! 1. **状态查询**：获取当前更新状态（是否有可用更新、下载进度等）
//! 2. **版本检查**：检查是否有新版本可用
//! 3. **下载更新**：下载更新包，并在下载过程中向前端推送进度事件
//! 4. **安装更新**：安装已下载的更新（重启应用）
//!
//! ## 使用场景
//!
//! - 前端需要检查更新状态时调用 `get_update_state`
//! - 用户手动检查更新时调用 `check_for_updates`
//! - 用户确认下载更新时调用 `download_update`
//! - 用户确认安装更新时调用 `install_update`
//!
//! ## 依赖说明
//!
//! 本模块依赖 `tauri_plugin_updater` 插件。
//!
//! ## 事件
//!
//! - `update://available`：发现可用更新
//! - `update://progress`：下载进度更新
//! - `update://downloaded`：下载完成
//! - `update://error`：更新过程出错

use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_updater::UpdaterExt;

/// 更新状态管理器
///
/// 持有应用更新的状态信息，通过互斥锁保证线程安全。
pub struct UpdateState {
    /// 更新信息（通过互斥锁保证线程安全的内部可变性）
    state: Arc<Mutex<UpdateInfo>>,
}

/// 更新信息结构
///
/// 表示应用更新的当前状态。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateInfo {
    /// 是否有可用更新
    pub available: bool,
    /// 当前应用版本
    pub current_version: String,
    /// 可用更新的版本号（如 "1.2.0"）
    pub version: String,
    /// 更新公告
    pub notes: String,
    /// 发布时间（RFC3339）
    pub pub_date: String,
    /// 下载进度（0.0 - 100.0）
    pub download_progress: f64,
    /// 是否已下载完成
    pub downloaded: bool,
    /// 是否正在检查/下载中
    pub in_progress: bool,
    /// 错误信息（最近一次失败）
    pub error: Option<String>,
}

/// 更新操作结果结构
#[derive(Debug, Serialize)]
pub struct UpdateActionResult {
    /// 操作是否成功
    pub success: bool,
    /// 操作结果消息
    pub message: String,
}

impl Default for UpdateInfo {
    fn default() -> Self {
        Self {
            available: false,
            current_version: env!("CARGO_PKG_VERSION").to_string(),
            version: String::new(),
            notes: String::new(),
            pub_date: String::new(),
            download_progress: 0.0,
            downloaded: false,
            in_progress: false,
            error: None,
        }
    }
}

impl UpdateState {
    /// 创建新的更新状态管理器
    pub fn new() -> Self {
        Self {
            state: Arc::new(Mutex::new(UpdateInfo::default())),
        }
    }

    /// 重置为初始状态
    fn reset(&self) {
        if let Ok(mut info) = self.state.lock() {
            *info = UpdateInfo::default();
        }
    }

    /// 设置错误
    fn set_error(&self, msg: String) {
        if let Ok(mut info) = self.state.lock() {
            info.error = Some(msg);
            info.in_progress = false;
        }
    }
}

impl Default for UpdateState {
    fn default() -> Self {
        Self::new()
    }
}

/// 获取更新状态命令
///
/// 获取当前的应用更新状态信息。
#[tauri::command]
pub async fn get_update_state(state: State<'_, UpdateState>) -> Result<UpdateInfo, String> {
    let update_info = state.state.lock().map_err(|e| e.to_string())?;
    Ok(update_info.clone())
}

/// 检查更新命令
///
/// 通过 `tauri_plugin_updater` 检查远端是否有新版本可用。
/// 若可用，会将版本信息写入 `UpdateState` 并向前端发送 `update://available` 事件。
#[tauri::command]
pub async fn check_for_updates(
    app: AppHandle,
    state: State<'_, UpdateState>,
) -> Result<UpdateInfo, String> {
    state.reset();
    {
        let mut info = state.state.lock().map_err(|e| e.to_string())?;
        info.in_progress = true;
        info.current_version = env!("CARGO_PKG_VERSION").to_string();
    }

    let updater = match app.updater() {
        Ok(u) => u,
        Err(e) => {
            let msg = format!("Updater not available: {e}");
            state.set_error(msg.clone());
            return Err(msg);
        }
    };

    match updater.check().await {
        Ok(Some(update)) => {
            let version = update.version.clone();
            let notes = update.body.clone().unwrap_or_default();
            let pub_date = update.date.map(|d| d.to_rfc3339()).unwrap_or_default();
            let info_snapshot = {
                let mut info = state.state.lock().map_err(|e| e.to_string())?;
                info.available = true;
                info.version = version.clone();
                info.notes = notes.clone();
                info.pub_date = pub_date.clone();
                info.in_progress = false;
                info.clone()
            };
            // 通知前端
            let _ = app.emit("update://available", &info_snapshot);
            Ok(info_snapshot)
        }
        Ok(None) => {
            let info_snapshot = {
                let mut info = state.state.lock().map_err(|e| e.to_string())?;
                info.available = false;
                info.in_progress = false;
                info.clone()
            };
            Ok(info_snapshot)
        }
        Err(e) => {
            let msg = format!("Check for updates failed: {e}");
            state.set_error(msg.clone());
            Err(msg)
        }
    }
}

/// 下载更新命令
///
/// 下载可用的应用更新。在下载过程中会通过 `update://progress` 事件向前端推送进度。
#[tauri::command]
pub async fn download_update(
    app: AppHandle,
    state: State<'_, UpdateState>,
) -> Result<UpdateActionResult, String> {
    {
        let mut info = state.state.lock().map_err(|e| e.to_string())?;
        if !info.available {
            return Err("No update available".to_string());
        }
        info.download_progress = 0.0;
        info.in_progress = true;
        info.error = None;
    }

    let updater = app
        .updater()
        .map_err(|e| format!("Updater not available: {e}"))?;

    match updater.check().await {
        Ok(Some(update)) => {
            // 启动下载任务，定期上报进度
            let app_handle = app.clone();
            let state_arc = state.state.clone();
            let update_clone = update.clone();

            let on_progress = move |received: u64, total: Option<u64>| {
                let pct = match total {
                    Some(t) if t > 0 => (received as f64 / t as f64) * 100.0,
                    _ => 0.0,
                };
                if let Ok(mut info) = state_arc.lock() {
                    info.download_progress = pct;
                }
                let _ = app_handle.emit(
                    "update://progress",
                    serde_json::json!({
                        "received": received,
                        "total": total,
                        "progress": pct,
                    }),
                );
            };

            match update_clone.download(on_progress).await {
                Ok(bytes) => {
                    let info_snapshot = {
                        let mut info = state.state.lock().map_err(|e| e.to_string())?;
                        info.downloaded = true;
                        info.download_progress = 100.0;
                        info.in_progress = false;
                        info.clone()
                    };
                    let _ = app.emit("update://downloaded", &info_snapshot);
                    Ok(UpdateActionResult {
                        success: true,
                        message: format!("Update downloaded ({} bytes)", bytes),
                    })
                }
                Err(e) => {
                    let msg = format!("Download failed: {e}");
                    state.set_error(msg.clone());
                    let _ = app.emit("update://error", &msg);
                    Ok(UpdateActionResult {
                        success: false,
                        message: msg,
                    })
                }
            }
        }
        Ok(None) => {
            let msg = "No update available".to_string();
            state.set_error(msg.clone());
            Ok(UpdateActionResult {
                success: false,
                message: msg,
            })
        }
        Err(e) => {
            let msg = format!("Check failed: {e}");
            state.set_error(msg.clone());
            Ok(UpdateActionResult {
                success: false,
                message: msg,
            })
        }
    }
}

/// 安装更新命令
///
/// 安装已下载的应用更新：关闭当前实例并以新版本重启。
/// 在调用此命令前，状态必须处于 `downloaded == true`。
#[tauri::command]
pub async fn install_update(
    app: AppHandle,
    state: State<'_, UpdateState>,
) -> Result<UpdateActionResult, String> {
    if !state.state.lock().map_err(|e| e.to_string())?.downloaded {
        return Ok(UpdateActionResult {
            success: false,
            message: "Update has not been downloaded yet".to_string(),
        });
    }

    let updater = app
        .updater()
        .map_err(|e| format!("Updater not available: {e}"))?;

    match updater.check().await {
        Ok(Some(update)) => {
            // install 在内部会执行：关闭应用、以新版本重启
            if let Err(e) = update.install().await {
                let msg = format!("Install failed: {e}");
                state.set_error(msg.clone());
                return Ok(UpdateActionResult {
                    success: false,
                    message: msg,
                });
            }
            // 通常执行到这里时应用已经重启或即将退出
            Ok(UpdateActionResult {
                success: true,
                message: "Update installed, application is restarting".to_string(),
            })
        }
        Ok(None) => Ok(UpdateActionResult {
            success: false,
            message: "No update available to install".to_string(),
        }),
        Err(e) => Ok(UpdateActionResult {
            success: false,
            message: format!("Check failed: {e}"),
        }),
    }
}
