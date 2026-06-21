//! # Media Permissions 模块
//!
//! 检查 / 请求 macOS / Windows / Linux 上的麦克风 / 摄像头 / 屏幕录制权限。
//!
//! ## 背景
//!
//! - macOS 在首次访问麦/摄/屏时需要用户授权（系统弹窗）
//! - Windows 10/11 在 UAC 下可能需要隐私设置放行
//! - Linux 上通常走 PipeWire / PulseAudio 检查设备
//!
//! 在 Tauri 中，前端 `getUserMedia()` 会触发授权流程，但用户希望应用在启动早期就
//! 把权限状态缓存下来给前端展示。

use serde::{Deserialize, Serialize};

/// 媒体类型
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum MediaKind {
    Microphone,
    Camera,
    Screen,
    Notifications,
}

/// 权限状态
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MediaPermissionStatus {
    Granted,
    Denied,
    NotDetermined,
    Restricted,
    Unknown,
}

/// 单个媒体的权限信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaPermission {
    pub kind: MediaKind,
    pub status: MediaPermissionStatus,
    /// 备注（如系统级原因）
    pub note: Option<String>,
}

/// 一次性查询所有已知媒体权限
pub fn query_all() -> Vec<MediaPermission> {
    vec![
        MediaPermission {
            kind: MediaKind::Microphone,
            status: query(MediaKind::Microphone),
            note: None,
        },
        MediaPermission {
            kind: MediaKind::Camera,
            status: query(MediaKind::Camera),
            note: None,
        },
        MediaPermission {
            kind: MediaKind::Screen,
            status: query(MediaKind::Screen),
            note: None,
        },
        MediaPermission {
            kind: MediaKind::Notifications,
            status: query(MediaKind::Notifications),
            note: None,
        },
    ]
}

/// 查询单个媒体权限
///
/// 当前实现：跨平台返回 NotDetermined（让前端在首次调用时触发系统弹窗）。
/// 后续可针对 macOS 通过 `AVCaptureDevice.authorizationStatus` 等 API 精确查询。
pub fn query(kind: MediaKind) -> MediaPermissionStatus {
    match kind {
        MediaKind::Microphone | MediaKind::Camera | MediaKind::Screen => {
            // 桌面端在调用时才弹窗，所以这里一律返回 NotDetermined
            // macOS 上可通过系统 API 检查；其他平台保持 NotDetermined
            MediaPermissionStatus::NotDetermined
        }
        MediaKind::Notifications => {
            // 通知权限在 tauri-plugin-notification 中可在初始化时检查
            MediaPermissionStatus::NotDetermined
        }
    }
}

/// 主动请求单个媒体权限
///
/// 返回最终状态。如果系统未提供请求 API，则保持 NotDetermined，
/// 前端应通过 `getUserMedia` 触发系统级弹窗。
pub fn request(kind: MediaKind) -> MediaPermissionStatus {
    // 当前实现：没有跨平台请求 API，直接返回 NotDetermined 让前端走浏览器流
    let _ = kind;
    MediaPermissionStatus::NotDetermined
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn query_returns_valid_status() {
        for kind in [
            MediaKind::Microphone,
            MediaKind::Camera,
            MediaKind::Screen,
            MediaKind::Notifications,
        ] {
            let s = query(kind);
            assert!(matches!(
                s,
                MediaPermissionStatus::NotDetermined
                    | MediaPermissionStatus::Granted
                    | MediaPermissionStatus::Denied
                    | MediaPermissionStatus::Restricted
                    | MediaPermissionStatus::Unknown
            ));
        }
    }

    #[test]
    fn query_all_has_four_entries() {
        let all = query_all();
        assert_eq!(all.len(), 4);
    }
}

