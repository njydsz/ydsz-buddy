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
use std::time::{Duration, Instant, SystemTime};
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_updater::UpdaterExt;

/// 更新状态枚举
///
/// 表示更新流程的当前阶段，对应 PeakCode 的 updateState.ts 状态机。
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum UpdateStatus {
    /// 自动更新已禁用（dev 模式、未打包、无配置等）
    Disabled,
    /// 空闲状态
    Idle,
    /// 正在检查更新
    Checking,
    /// 有可用更新
    Available,
    /// 正在下载
    Downloading,
    /// 已下载完成
    Downloaded,
    /// 已是最新版本
    UpToDate,
    /// 发生错误
    Error,
}

impl Default for UpdateStatus {
    fn default() -> Self {
        Self::Idle
    }
}

/// 更新操作禁用原因
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum UpdateDisabledReason {
    /// 开发模式（未打包）
    DevMode,
    /// 未配置 endpoints
    NoEndpoints,
    /// 未配置 pubkey
    NoPubkey,
    /// 环境变量显式禁用
    EnvDisabled,
    /// 平台不支持
    UnsupportedPlatform,
}

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
    /// 当前状态枚举
    pub status: UpdateStatus,
    /// 是否有可用更新
    pub available: bool,
    /// 当前应用版本
    pub current_version: String,
    /// 可用更新的版本号（如 '1.2.0'）
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
    /// 错误上下文（更详细的错误分类）
    pub error_context: Option<String>,
    /// 是否可以重试
    pub can_retry: bool,
    /// 上次检查时间（Unix 时间戳，秒）
    pub checked_at: Option<u64>,
    /// 禁用原因（当 status == Disabled 时）
    pub disabled_reason: Option<UpdateDisabledReason>,
    /// 已下载的更新包数据
    #[serde(skip)]
    pub downloaded_bytes: Vec<u8>,
    /// 上次进度上报时间（用于节流，内部使用）
    #[serde(skip)]
    pub last_progress_emit_at: Option<Instant>,
    /// 上次上报的进度百分比（用于节流，内部使用）
    #[serde(skip)]
    pub last_emitted_progress: f64,
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
            status: UpdateStatus::Idle,
            available: false,
            current_version: env!("CARGO_PKG_VERSION").to_string(),
            version: String::new(),
            notes: String::new(),
            pub_date: String::new(),
            download_progress: 0.0,
            downloaded: false,
            in_progress: false,
            error: None,
            error_context: None,
            can_retry: false,
            checked_at: None,
            disabled_reason: None,
            downloaded_bytes: Vec::new(),
            last_progress_emit_at: None,
            last_emitted_progress: 0.0,
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

    /// 重置为初始状态（保留 checked_at 和 disabled_reason）
    fn reset(&self) {
        if let Ok(mut info) = self.state.lock() {
            let checked_at = info.checked_at;
            let disabled_reason = info.disabled_reason;
            *info = UpdateInfo::default();
            info.checked_at = checked_at;
            info.disabled_reason = disabled_reason;
        }
    }

    /// 设置错误
    fn set_error(&self, msg: String, context: Option<String>) {
        if let Ok(mut info) = self.state.lock() {
            info.error = Some(msg);
            info.error_context = context;
            info.in_progress = false;
            info.status = UpdateStatus::Error;
            // 网络类错误可重试，配置类错误不可重试
            info.can_retry = true;
        }
    }

    /// 设置禁用状态
    #[allow(dead_code)]
    fn set_disabled(&self, reason: UpdateDisabledReason) {
        if let Ok(mut info) = self.state.lock() {
            info.status = UpdateStatus::Disabled;
            info.disabled_reason = Some(reason);
            info.in_progress = false;
            info.can_retry = false;
        }
    }

    /// 获取当前时间戳（秒）
    fn now_timestamp() -> u64 {
        SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0)
    }

    /// 判断是否应该在前台重检（后台时长 + 最小间隔双阈值）
    pub fn should_check_on_foreground(&self, background_duration_secs: u64, min_interval_secs: u64) -> bool {
        if let Ok(info) = self.state.lock() {
            if info.status == UpdateStatus::Disabled || info.in_progress {
                return false;
            }
            // 后台时长不足，不重检
            if background_duration_secs < 60 {
                return false;
            }
            // 检查最小间隔
            if let Some(checked_at) = info.checked_at {
                let elapsed = Self::now_timestamp().saturating_sub(checked_at);
                return elapsed >= min_interval_secs;
            }
            // 从未检查过
            return true;
        }
        false
    }

    /// 判断自动更新是否被禁用，并返回原因
    #[allow(dead_code)]
    pub fn get_disabled_reason() -> Option<UpdateDisabledReason> {
        // 环境变量显式禁用
        if std::env::var("REMI_UPDATER_DISABLED")
            .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
            .unwrap_or(false)
        {
            return Some(UpdateDisabledReason::EnvDisabled);
        }
        // 未配置 endpoints（既无环境变量，也无 tauri.conf.json 配置）
        // tauri.conf.json 中的配置在编译时嵌入，运行时无法直接读取
        // 这里通过环境变量判断是否覆盖了配置
        // 实际的 endpoint 可达性在 check 时才验证
        None
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
        info.status = UpdateStatus::Checking;
        info.current_version = env!("CARGO_PKG_VERSION").to_string();
        info.error = None;
        info.error_context = None;
    }

    let updater = match app.updater() {
        Ok(u) => u,
        Err(e) => {
            let msg = format!("Updater not available: {e}");
            state.set_error(msg.clone(), Some("updater_not_available".to_string()));
            let _ = app.emit("update://error", &msg);
            return Err(msg);
        }
    };

    match updater.check().await {
        Ok(Some(update)) => {
            let version = update.version.clone();
            let notes = update.body.clone().unwrap_or_default();
            let pub_date = update.date.map(|d| d.to_string()).unwrap_or_default();
            let info_snapshot = {
                let mut info = state.state.lock().map_err(|e| e.to_string())?;
                info.status = UpdateStatus::Available;
                info.available = true;
                info.version = version.clone();
                info.notes = notes.clone();
                info.pub_date = pub_date.clone();
                info.in_progress = false;
                info.checked_at = Some(UpdateState::now_timestamp());
                info.can_retry = false;
                info.clone()
            };
            // 通知前端
            let _ = app.emit("update://available", &info_snapshot);
            Ok(info_snapshot)
        }
        Ok(None) => {
            let info_snapshot = {
                let mut info = state.state.lock().map_err(|e| e.to_string())?;
                info.status = UpdateStatus::UpToDate;
                info.available = false;
                info.in_progress = false;
                info.checked_at = Some(UpdateState::now_timestamp());
                info.can_retry = false;
                info.clone()
            };
            Ok(info_snapshot)
        }
        Err(e) => {
            let msg = format!("Check for updates failed: {e}");
            state.set_error(msg.clone(), Some("check_failed".to_string()));
            let _ = app.emit("update://error", &msg);
            Err(msg)
        }
    }
}

/// 下载更新命令
///
/// 下载可用的应用更新。在下载过程中会通过 `update://progress` 事件向前端推送进度。
/// 进度上报采用 10% 步进节流，避免高频事件淹没前端。
#[tauri::command]
pub async fn download_update(
    app: AppHandle,
    state: State<'_, UpdateState>,
) -> Result<UpdateActionResult, String> {
    {
        let mut info = state.state.lock().map_err(|e| e.to_string())?;
        if !info.available && !info.can_retry {
            return Err("No update available".to_string());
        }
        info.download_progress = 0.0;
        info.in_progress = true;
        info.status = UpdateStatus::Downloading;
        info.error = None;
        info.error_context = None;
        info.last_emitted_progress = 0.0;
        info.last_progress_emit_at = None;
    }

    let updater = app
        .updater()
        .map_err(|e| format!("Updater not available: {e}"))?;

    match updater.check().await {
        Ok(Some(update)) => {
            // 启动下载任务，定期上报进度（10% 步进节流）
            let app_handle = app.clone();
            let state_arc = state.state.clone();
            let update_clone = update.clone();

            let on_progress = move |received: usize, total: Option<u64>| {
                let pct = match total {
                    Some(t) if t > 0 => (received as f64 / t as f64) * 100.0,
                    _ => 0.0,
                };

                let should_emit = {
                    if let Ok(mut info) = state_arc.lock() {
                        info.download_progress = pct;
                        // 节流：首次、每 10% 步进、或 100% 时上报
                        let last = info.last_emitted_progress;
                        let last_time = info.last_progress_emit_at;
                        let now = Instant::now();
                        let time_since_last = last_time.map(|t| now.duration_since(t)).unwrap_or(Duration::from_secs(60));
                        let step_threshold = (last / 10.0).floor() * 10.0 + 10.0;
                        let should = pct >= 100.0
                            || pct >= step_threshold
                            || time_since_last > Duration::from_secs(2);
                        if should {
                            info.last_emitted_progress = pct;
                            info.last_progress_emit_at = Some(now);
                        }
                        should
                    } else {
                        false
                    }
                };

                if should_emit {
                    let _ = app_handle.emit(
                        "update://progress",
                        serde_json::json!({
                            "received": received,
                            "total": total,
                            "progress": pct,
                        }),
                    );
                }
            };

            match update_clone.download(on_progress, || {}).await {
                Ok(bytes) => {
                    let info_snapshot = {
                        let mut info = state.state.lock().map_err(|e| e.to_string())?;
                        info.status = UpdateStatus::Downloaded;
                        info.downloaded = true;
                        info.download_progress = 100.0;
                        info.in_progress = false;
                        info.downloaded_bytes = bytes.clone();
                        info.can_retry = false;
                        info.clone()
                    };
                    let _ = app.emit("update://downloaded", &info_snapshot);
                    Ok(UpdateActionResult {
                        success: true,
                        message: format!("Update downloaded ({} bytes)", bytes.len()),
                    })
                }
                Err(e) => {
                    let msg = format!("Download failed: {e}");
                    state.set_error(msg.clone(), Some("download_failed".to_string()));
                    // 下载失败后仍可重试
                    if let Ok(mut info) = state.state.lock() {
                        info.can_retry = true;
                        info.available = true; // 保持可用状态以便重试
                    }
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
            state.set_error(msg.clone(), Some("no_update".to_string()));
            Ok(UpdateActionResult {
                success: false,
                message: msg,
            })
        }
        Err(e) => {
            let msg = format!("Check failed: {e}");
            state.set_error(msg.clone(), Some("check_failed".to_string()));
            let _ = app.emit("update://error", &msg);
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
            let bytes = {
                let info = state.state.lock().map_err(|e| e.to_string())?;
                info.downloaded_bytes.clone()
            };
            if let Err(e) = update.install(&bytes) {
                let msg = format!("Install failed: {e}");
                state.set_error(msg.clone(), Some("install_failed".to_string()));
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
        Err(e) => {
            let msg = format!("Check failed: {e}");
            state.set_error(msg.clone(), Some("check_failed".to_string()));
            Ok(UpdateActionResult {
                success: false,
                message: msg,
            })
        }
    }
}

/// 判断是否应该在前台重检更新
///
/// 前端在窗口重新获得焦点时调用此命令，判断是否需要触发一次后台更新检查。
#[tauri::command]
pub async fn should_check_for_updates_on_foreground(
    state: State<'_, UpdateState>,
    background_duration_secs: u64,
) -> Result<bool, String> {
    // 最小检查间隔：1 小时
    Ok(state.should_check_on_foreground(background_duration_secs, 3600))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_status_is_idle() {
        let info = UpdateInfo::default();
        assert_eq!(info.status, UpdateStatus::Idle);
        assert!(!info.available);
        assert!(!info.in_progress);
        assert!(!info.can_retry);
        assert!(info.checked_at.is_none());
    }

    #[test]
    fn reset_preserves_checked_at() {
        let state = UpdateState::new();
        {
            let mut info = state.state.lock().unwrap();
            info.checked_at = Some(12345);
        }
        state.reset();
        let info = state.state.lock().unwrap();
        assert_eq!(info.checked_at, Some(12345));
    }

    #[test]
    fn set_error_sets_can_retry() {
        let state = UpdateState::new();
        state.set_error("boom".to_string(), Some("test".to_string()));
        let info = state.state.lock().unwrap();
        assert_eq!(info.status, UpdateStatus::Error);
        assert!(info.can_retry);
        assert_eq!(info.error.as_deref(), Some("boom"));
        assert_eq!(info.error_context.as_deref(), Some("test"));
    }

    #[test]
    fn should_check_on_foreground_respects_min_interval() {
        let state = UpdateState::new();
        // 从未检查过，应该返回 true
        assert!(state.should_check_on_foreground(120, 3600));
        // 设置 checked_at 为当前时间
        {
            let mut info = state.state.lock().unwrap();
            info.checked_at = Some(UpdateState::now_timestamp());
        }
        // 刚检查过，不应该重检
        assert!(!state.should_check_on_foreground(120, 3600));
    }
}

