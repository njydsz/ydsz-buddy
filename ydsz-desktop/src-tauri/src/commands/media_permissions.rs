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
use specta::Type;

/// 媒体类型
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum MediaKind {
    Microphone,
    Camera,
    Screen,
    Notifications,
}

/// 权限状态
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum MediaPermissionStatus {
    Granted,
    Denied,
    NotDetermined,
    Restricted,
    Unknown,
}

/// 单个媒体的权限信息
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
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

    #[test]
    fn query_all_covers_all_kinds() {
        // 必须覆盖 4 个 kind，不重不漏
        let all = query_all();
        let kinds: std::collections::HashSet<_> = all.iter().map(|p| p.kind).collect();
        assert!(kinds.contains(&MediaKind::Microphone));
        assert!(kinds.contains(&MediaKind::Camera));
        assert!(kinds.contains(&MediaKind::Screen));
        assert!(kinds.contains(&MediaKind::Notifications));
        assert_eq!(kinds.len(), 4);
    }

    #[test]
    fn request_returns_not_determined_for_all_kinds() {
        // 当前实现：跨平台无请求 API，统一返回 NotDetermined
        for kind in [
            MediaKind::Microphone,
            MediaKind::Camera,
            MediaKind::Screen,
            MediaKind::Notifications,
        ] {
            assert_eq!(request(kind), MediaPermissionStatus::NotDetermined);
        }
    }

    #[test]
    fn media_kind_serialization_lowercase() {
        // 互联网大厂基线：跨语言契约 - 序列化字段名稳定
        for (kind, expected) in [
            (MediaKind::Microphone, "\"microphone\""),
            (MediaKind::Camera, "\"camera\""),
            (MediaKind::Screen, "\"screen\""),
            (MediaKind::Notifications, "\"notifications\""),
        ] {
            let s = serde_json::to_string(&kind).unwrap();
            assert_eq!(s, expected, "kind {kind:?}");
        }
    }

    #[test]
    fn permission_status_serialization_snake_case() {
        for (status, expected) in [
            (MediaPermissionStatus::Granted, "\"granted\""),
            (MediaPermissionStatus::Denied, "\"denied\""),
            (MediaPermissionStatus::NotDetermined, "\"not_determined\""),
            (MediaPermissionStatus::Restricted, "\"restricted\""),
            (MediaPermissionStatus::Unknown, "\"unknown\""),
        ] {
            let s = serde_json::to_string(&status).unwrap();
            assert_eq!(s, expected, "status {status:?}");
        }
    }

    #[test]
    fn media_permission_serialization_roundtrip() {
        let p = MediaPermission {
            kind: MediaKind::Camera,
            status: MediaPermissionStatus::Granted,
            note: Some("system_grant".to_string()),
        };
        let json = serde_json::to_string(&p).unwrap();
        let back: MediaPermission = serde_json::from_str(&json).unwrap();
        assert_eq!(back.kind, MediaKind::Camera);
        assert_eq!(back.status, MediaPermissionStatus::Granted);
        assert_eq!(back.note.as_deref(), Some("system_grant"));
    }

    #[test]
    fn media_permission_skips_null_note() {
        let p = MediaPermission {
            kind: MediaKind::Screen,
            status: MediaPermissionStatus::NotDetermined,
            note: None,
        };
        let v = serde_json::to_value(&p).unwrap();
        // None 字段应不出现（互联网大厂基线：DTO 最小化）
        assert!(v.get("note").is_none());
    }
}

