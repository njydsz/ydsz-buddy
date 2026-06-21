//! # Desktop User Data Profile 模块
//!
//! 管理桌面端'用户画像'——用户身份、首选语言、主题、快捷键、登录态等。
//!
//! ## 设计
//!
//! - 存放在 `<base_dir>/profile.json`
//! - 启动时加载、修改时落盘
//! - 跨设备同步：标记 `sync_id`、最近一次同步时间（具体同步交给云端，本地不实现）

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// 桌面用户画像
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DesktopUserProfile {
    /// 内部稳定 ID
    pub id: String,
    /// 显示名
    #[serde(default)]
    pub display_name: Option<String>,
    /// 邮箱（可选）
    #[serde(default)]
    pub email: Option<String>,
    /// 首选语言，如 `zh-CN` / `en-US`
    #[serde(default = "default_locale")]
    pub locale: String,
    /// 主题：`light` / `dark` / `system`
    #[serde(default = "default_theme")]
    pub theme: String,
    /// 字体偏好
    #[serde(default)]
    pub font_family: Option<String>,
    /// 同步 ID（云端去重 key）
    #[serde(default)]
    pub sync_id: Option<String>,
    /// 最近一次同步时间（毫秒时间戳）
    #[serde(default)]
    pub last_sync_ms: Option<i64>,
    /// 创建时间（毫秒时间戳）
    #[serde(default = "now_ms")]
    pub created_at_ms: i64,
    /// 更新时间（毫秒时间戳）
    #[serde(default = "now_ms")]
    pub updated_at_ms: i64,
}

fn default_locale() -> String {
    "en-US".to_string()
}
fn default_theme() -> String {
    "system".to_string()
}
fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

impl Default for DesktopUserProfile {
    fn default() -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            display_name: None,
            email: None,
            locale: default_locale(),
            theme: default_theme(),
            font_family: None,
            sync_id: None,
            last_sync_ms: None,
            created_at_ms: now_ms(),
            updated_at_ms: now_ms(),
        }
    }
}

impl DesktopUserProfile {
    /// 加载或初始化
    pub fn load_or_init(path: &Path) -> Self {
        match fs::read_to_string(path) {
            Ok(s) => serde_json::from_str(&s).unwrap_or_else(|_| {
                let p = Self::default();
                let _ = p.save(path);
                p
            }),
            Err(_) => {
                let p = Self::default();
                let _ = p.save(path);
                p
            }
        }
    }

    /// 落盘
    pub fn save(&self, path: &Path) -> std::io::Result<()> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let tmp = path.with_extension("json.tmp");
        let json = serde_json::to_string_pretty(self)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
        fs::write(&tmp, json)?;
        fs::rename(&tmp, path)?;
        Ok(())
    }

    /// 修改主题
    pub fn set_theme(&mut self, theme: impl Into<String>) {
        self.theme = theme.into();
        self.touch();
    }

    /// 修改语言
    pub fn set_locale(&mut self, locale: impl Into<String>) {
        self.locale = locale.into();
        self.touch();
    }

    /// 触摸 updated_at
    pub fn touch(&mut self) {
        self.updated_at_ms = now_ms();
    }

    /// 默认 profile 路径
    pub fn default_path(base_dir: &Path) -> PathBuf {
        base_dir.join("profile.json")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp() -> PathBuf {
        let p = std::env::temp_dir().join(format!("remi-profile-test-{}", uuid::Uuid::new_v4()));
        let _ = fs::remove_dir_all(&p);
        fs::create_dir_all(&p).unwrap();
        p
    }

    #[test]
    fn load_or_init_creates_when_missing() {
        let dir = tmp();
        let p = dir.join("profile.json");
        let profile = DesktopUserProfile::load_or_init(&p);
        assert!(p.exists());
        assert!(!profile.id.is_empty());
    }

    #[test]
    fn save_and_reload() {
        let dir = tmp();
        let p = dir.join("profile.json");
        let mut profile = DesktopUserProfile::load_or_init(&p);
        profile.set_theme("dark");
        profile.set_locale("zh-CN");
        profile.save(&p).unwrap();
        let reloaded = DesktopUserProfile::load_or_init(&p);
        assert_eq!(reloaded.theme, "dark");
        assert_eq!(reloaded.locale, "zh-CN");
    }
}

