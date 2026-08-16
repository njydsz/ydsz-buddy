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
use specta::Type;

/// 桌面用户画像
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
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
    #[allow(dead_code)]
    pub fn set_theme(&mut self, theme: impl Into<String>) {
        self.theme = theme.into();
        self.touch();
    }

    /// 修改语言
    #[allow(dead_code)]
    pub fn set_locale(&mut self, locale: impl Into<String>) {
        self.locale = locale.into();
        self.touch();
    }

    /// 触摸 updated_at
    #[allow(dead_code)]
    pub fn touch(&mut self) {
        self.updated_at_ms = now_ms();
    }

    /// 默认 profile 路径
    #[allow(dead_code)]
    pub fn default_path(base_dir: &Path) -> PathBuf {
        base_dir.join("profile.json")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp() -> PathBuf {
        let p = std::env::temp_dir().join(format!("ydsz-profile-test-{}", uuid::Uuid::new_v4()));
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

    #[test]
    fn default_values() {
        let p = DesktopUserProfile::default();
        assert_eq!(p.locale, "en-US");
        assert_eq!(p.theme, "system");
        assert!(p.display_name.is_none());
        assert!(p.email.is_none());
        assert!(p.sync_id.is_none());
        assert!(p.last_sync_ms.is_none());
        assert!(!p.id.is_empty());
        assert!(p.created_at_ms > 0);
        assert!(p.updated_at_ms > 0);
    }

    #[test]
    fn id_is_stable_across_saves() {
        // 互联网大厂基线：profile id 一旦生成不能变
        let dir = tmp();
        let p = dir.join("profile.json");
        let mut profile = DesktopUserProfile::load_or_init(&p);
        let id_before = profile.id.clone();
        profile.set_theme("dark");
        profile.save(&p).unwrap();
        let reloaded = DesktopUserProfile::load_or_init(&p);
        assert_eq!(reloaded.id, id_before);
    }

    #[test]
    fn updated_at_changes_on_touch() {
        let mut p = DesktopUserProfile::default();
        let t1 = p.updated_at_ms;
        std::thread::sleep(std::time::Duration::from_millis(2));
        p.touch();
        assert!(p.updated_at_ms >= t1);
    }

    #[test]
    fn created_at_does_not_change_on_touch() {
        // 关键约束：touch 只能更新 updated_at，不能改 created_at
        let mut p = DesktopUserProfile::default();
        let c = p.created_at_ms;
        std::thread::sleep(std::time::Duration::from_millis(2));
        p.touch();
        assert_eq!(p.created_at_ms, c);
    }

    #[test]
    fn corrupted_file_triggers_reinit() {
        // 互联网大厂基线：profile.json 损坏不能导致 app 崩溃，应静默重置
        let dir = tmp();
        let p = dir.join("profile.json");
        fs::write(&p, "{ not valid json").unwrap();
        let profile = DesktopUserProfile::load_or_init(&p);
        // 重新生成默认值
        assert!(!profile.id.is_empty());
        // 读回也是合法 JSON
        let s = fs::read_to_string(&p).unwrap();
        let back: DesktopUserProfile = serde_json::from_str(&s).unwrap();
        assert_eq!(back.id, profile.id);
    }

    #[test]
    fn save_creates_parent_dirs() {
        let dir = tmp();
        let nested = dir.join("a/b/c/profile.json");
        let p = DesktopUserProfile::default();
        p.save(&nested).unwrap();
        assert!(nested.exists());
    }

    #[test]
    fn save_is_atomic_via_rename() {
        // save 期间不应留下 .tmp 残留（除非中断）
        let dir = tmp();
        let p = dir.join("profile.json");
        let profile = DesktopUserProfile::default();
        profile.save(&p).unwrap();
        let tmp_file = p.with_extension("json.tmp");
        assert!(!tmp_file.exists(), "save 完成后不应残留 .tmp");
    }

    #[test]
    fn default_path_convention() {
        let base = PathBuf::from("/tmp/base");
        assert_eq!(
            DesktopUserProfile::default_path(&base),
            PathBuf::from("/tmp/base/profile.json")
        );
    }

    #[test]
    fn partial_json_uses_defaults_for_missing_fields() {
        // JSON 中缺字段时，serde default 应触发
        let dir = tmp();
        let p = dir.join("profile.json");
        let minimal = serde_json::json!({
            "id": "fixed-id-123",
            "locale": "zh-CN",
            "theme": "light",
            "created_at_ms": 1_000_000,
            "updated_at_ms": 1_000_000,
        });
        fs::write(&p, serde_json::to_string(&minimal).unwrap()).unwrap();
        let loaded = DesktopUserProfile::load_or_init(&p);
        assert_eq!(loaded.id, "fixed-id-123");
        assert_eq!(loaded.locale, "zh-CN");
        assert_eq!(loaded.theme, "light");
        assert!(loaded.display_name.is_none());
        assert!(loaded.email.is_none());
        assert!(loaded.font_family.is_none());
    }
}

