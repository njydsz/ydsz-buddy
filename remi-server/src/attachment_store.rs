//! # 附件存储模块
//!
//! 负责管理聊天图片附件、语音转写产物、文件卡片等内容在 Remi 本地的落盘存储。
//!
//! ## 核心职责
//!
//! - **落盘存储**：把前端通过 `multipart/form-data` 上传的附件写入 `attachments_dir`
//! - **安全命名**：使用 UUID 文件名 + 保留原始扩展名，避免路径穿越
//! - **元数据索引**：在 SQLite 中跟踪附件大小、MIME、关联 thread_id、上传者等
//! - **删除策略**：根据 retention 策略清理孤儿附件（无对应消息）
//!
//! ## 文件组织
//!
//! ```text
//! <attachments_dir>/
//!   ├── 2026/06/21/<uuid>.png       ← 按日期分桶
//!   ├── 2026/06/22/<uuid>.webp
//!   └── thumbs/<uuid>.jpg            ← 缩略图（可选）
//! ```
//!
//! ## HTTP 接口（由 `attachment_routes` 模块挂载）
//!
//! - `POST /api/attachments/upload`         上传附件
//! - `GET  /api/attachments/:id`            读取附件
//! - `GET  /api/attachments/:id/thumbnail`  读取缩略图
//! - `DELETE /api/attachments/:id`          删除附件

use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tracing::info;
use uuid::Uuid;

use crate::error::{ServerError, ServerResult};

/// 单个附件的元数据
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentMeta {
    /// 附件 ID（UUID 字符串）
    pub id: String,
    /// 原始文件名（仅用于展示）
    pub original_name: String,
    /// 落盘后相对路径
    pub relative_path: String,
    /// 文件扩展名（小写，含 `.`）
    pub extension: String,
    /// MIME 类型
    pub mime_type: String,
    /// 文件大小（字节）
    pub size_bytes: u64,
    /// 上传时间（Unix 毫秒）
    pub uploaded_at_ms: i64,
    /// 关联的 thread_id（可选）
    pub thread_id: Option<String>,
    /// 关联的消息 ID（可选）
    pub message_id: Option<String>,
    /// 上传者 user_id
    pub user_id: Option<String>,
    /// 业务类型（chat / voice / screenshot / file）
    pub kind: AttachmentKind,
}

/// 附件业务类型
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AttachmentKind {
    /// 聊天图片附件
    Chat,
    /// 语音转文字产物
    Voice,
    /// 屏幕截图
    Screenshot,
    /// 通用文件
    File,
}

impl AttachmentKind {
    /// 默认 MIME 类型
    pub fn default_mime(&self) -> &'static str {
        match self {
            AttachmentKind::Chat => "image/png",
            AttachmentKind::Voice => "audio/webm",
            AttachmentKind::Screenshot => "image/png",
            AttachmentKind::File => "application/octet-stream",
        }
    }
}

/// 附件存储配置
#[derive(Debug, Clone)]
pub struct AttachmentStoreConfig {
    /// 根目录（通常为 `state_dir/attachments`）
    pub root: PathBuf,
    /// 单个附件最大字节数（默认 25MB）
    pub max_size_bytes: u64,
    /// 允许的 MIME 列表（白名单）
    pub allowed_mime_prefixes: Vec<String>,
    /// 允许的扩展名（白名单，小写，含 `.`）
    pub allowed_extensions: Vec<String>,
}

impl Default for AttachmentStoreConfig {
    fn default() -> Self {
        Self {
            root: PathBuf::from(".remi-claw-test/userdata/attachments"),
            max_size_bytes: 25 * 1024 * 1024,
            allowed_mime_prefixes: vec![
                "image/".into(),
                "audio/".into(),
                "text/".into(),
                "application/pdf".into(),
                "application/json".into(),
                "application/octet-stream".into(),
            ],
            allowed_extensions: vec![
                ".png".into(),
                ".jpg".into(),
                ".jpeg".into(),
                ".gif".into(),
                ".webp".into(),
                ".avif".into(),
                ".bmp".into(),
                ".svg".into(),
                ".heic".into(),
                ".heif".into(),
                ".tiff".into(),
                ".ico".into(),
                ".webm".into(),
                ".mp3".into(),
                ".wav".into(),
                ".m4a".into(),
                ".ogg".into(),
                ".pdf".into(),
                ".txt".into(),
                ".md".into(),
                ".json".into(),
            ],
        }
    }
}

/// 附件存储
///
/// 线程安全的附件落盘 + 元数据管理入口。
#[derive(Clone)]
pub struct AttachmentStore {
    config: Arc<AttachmentStoreConfig>,
}

impl AttachmentStore {
    /// 创建新的附件存储
    ///
    /// 自动创建根目录。
    pub fn new(config: AttachmentStoreConfig) -> ServerResult<Self> {
        fs::create_dir_all(&config.root)?;
        Ok(Self {
            config: Arc::new(config),
        })
    }

    /// 写入附件
    ///
    /// # 参数
    ///
    /// - `original_name`: 原始文件名（仅用于展示）
    /// - `mime_type`: MIME 类型
    /// - `bytes`: 文件内容
    /// - `kind`: 业务类型
    /// - `thread_id`: 可选 thread_id
    /// - `message_id`: 可选 message_id
    /// - `user_id`: 可选 user_id
    pub fn write(
        &self,
        original_name: &str,
        mime_type: &str,
        bytes: &[u8],
        kind: AttachmentKind,
        thread_id: Option<String>,
        message_id: Option<String>,
        user_id: Option<String>,
    ) -> ServerResult<AttachmentMeta> {
        // 大小校验
        if bytes.len() as u64 > self.config.max_size_bytes {
            return Err(ServerError::InvalidParams(format!(
                "附件过大: {} > {}",
                bytes.len(),
                self.config.max_size_bytes
            )));
        }

        // MIME 白名单
        let mime = if mime_type.is_empty() {
            kind.default_mime().to_string()
        } else {
            mime_type.to_string()
        };
        if !self
            .config
            .allowed_mime_prefixes
            .iter()
            .any(|p| mime.starts_with(p.as_str()))
        {
            return Err(ServerError::InvalidParams(format!(
                "不支持的 MIME: {}",
                mime
            )));
        }

        // 扩展名校验
        let ext = Path::new(original_name)
            .extension()
            .and_then(|s| s.to_str())
            .map(|s| format!(".{}", s.to_lowercase()))
            .unwrap_or_else(|| default_extension_for_mime(&mime).to_string());

        if !self
            .config
            .allowed_extensions
            .iter()
            .any(|e| e.eq_ignore_ascii_case(&ext))
        {
            return Err(ServerError::InvalidParams(format!(
                "不支持的扩展名: {}",
                ext
            )));
        }

        // 生成日期分桶路径
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e| ServerError::InternalError(format!("时间错误: {}", e)))?;
        let total_secs = now.as_secs();
        // UTC 日期分桶
        let (year, month, day) = epoch_to_ymd(total_secs);
        let id = Uuid::new_v4().to_string();
        let rel = format!("{:04}/{:02}/{:02}/{}{}", year, month, day, id, ext);
        let abs = self.config.root.join(&rel);
        if let Some(parent) = abs.parent() {
            fs::create_dir_all(parent)?;
        }
        let mut f = File::create(&abs)?;
        f.write_all(bytes)?;
        f.sync_all()?;

        let meta = AttachmentMeta {
            id: id.clone(),
            original_name: sanitize_filename(original_name),
            relative_path: rel,
            extension: ext,
            mime_type: mime,
            size_bytes: bytes.len() as u64,
            uploaded_at_ms: (total_secs as i64) * 1000,
            thread_id,
            message_id,
            user_id,
            kind,
        };
        info!(
            "附件已落盘: id={}, path={:?}, size={}",
            meta.id, abs, meta.size_bytes
        );
        Ok(meta)
    }

    /// 读取附件字节
    pub fn read(&self, id: &str) -> ServerResult<(Vec<u8>, AttachmentMetaLite)> {
        let (abs, lite) = self.resolve(id)?;
        let mut f = File::open(&abs)?;
        let mut buf = Vec::with_capacity(lite.size_bytes as usize);
        f.read_to_end(&mut buf)?;
        Ok((buf, lite))
    }

    /// 解析附件 ID 到绝对路径 + 摘要信息
    pub fn resolve(&self, id: &str) -> ServerResult<(PathBuf, AttachmentMetaLite)> {
        if !is_safe_id(id) {
            return Err(ServerError::InvalidParams(format!("非法 ID: {}", id)));
        }
        // 直接在 root 下递归查找（深一层目录结构）
        let direct = self.config.root.join(id);
        if direct.is_file() {
            let meta = fs::metadata(&direct)?;
            return Ok((
                direct.clone(),
                AttachmentMetaLite {
                    id: id.to_string(),
                    absolute_path: direct.to_string_lossy().to_string(),
                    extension: extension_from_path(&direct),
                    size_bytes: meta.len(),
                },
            ));
        }
        // 按日期分桶路径查找：扫描 root 下的第一层日期目录
        let walker = walkdir_skip_hidden(&self.config.root);
        for entry in walker {
            let entry = entry?;
            let file_type = entry.file_type()?;
            if file_type.is_file() {
                if let Some(stem) = entry.path().file_stem().and_then(|s| s.to_str()) {
                    if stem == id {
                        let meta = entry.metadata()?;
                        let p = entry.path();
                        return Ok((
                            p.to_path_buf(),
                            AttachmentMetaLite {
                                id: id.to_string(),
                                absolute_path: p.to_string_lossy().to_string(),
                                extension: extension_from_path(&p),
                                size_bytes: meta.len(),
                            },
                        ));
                    }
                }
            }
        }
        Err(ServerError::InternalError(format!("附件不存在: {}", id)))
    }

    /// 删除附件
    pub fn delete(&self, id: &str) -> ServerResult<bool> {
        match self.resolve(id) {
            Ok((abs, _)) => {
                fs::remove_file(&abs)?;
                info!("附件已删除: id={}, path={:?}", id, abs);
                Ok(true)
            }
            Err(_) => Ok(false),
        }
    }

    /// 根目录引用
    pub fn root(&self) -> &Path {
        &self.config.root
    }
}

/// 附件的轻量元信息（仅包含解析时所需字段）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttachmentMetaLite {
    pub id: String,
    pub absolute_path: String,
    pub extension: String,
    pub size_bytes: u64,
}

// ────────── 工具函数 ──────────

/// 文件名净化：去除路径分隔符与控制字符
pub fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' | '\0' => '_',
            c if c.is_control() => '_',
            c => c,
        })
        .collect::<String>()
        .trim()
        .chars()
        .take(200)
        .collect()
}

/// 校验 ID 合法性（UUID 形式）
pub fn is_safe_id(id: &str) -> bool {
    id.len() == 36
        && id.chars().all(|c| {
            c.is_ascii_alphanumeric() || c == '-'
        })
        && id.chars().filter(|c| *c == '-').count() == 4
}

/// 简易 walkdir 包装，跳过隐藏目录
fn walkdir_skip_hidden(root: &Path) -> impl Iterator<Item = std::io::Result<std::fs::DirEntry>> {
    walkdir_inner(root).into_iter()
}

fn walkdir_inner(root: &Path) -> Vec<std::io::Result<std::fs::DirEntry>> {
    let mut out = Vec::new();
    if let Ok(read) = fs::read_dir(root) {
        for entry in read.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.') {
                continue;
            }
            let ft = match entry.file_type() {
                Ok(t) => t,
                Err(_) => continue,
            };
            if ft.is_dir() {
                out.extend(walkdir_inner(&entry.path()));
            } else if ft.is_file() {
                out.push(Ok(entry));
            }
        }
    }
    out
}

fn extension_from_path(p: &Path) -> String {
    p.extension()
        .and_then(|s| s.to_str())
        .map(|s| format!(".{}", s.to_lowercase()))
        .unwrap_or_default()
}

fn default_extension_for_mime(mime: &str) -> &'static str {
    match mime {
        "image/png" => ".png",
        "image/jpeg" => ".jpg",
        "image/gif" => ".gif",
        "image/webp" => ".webp",
        "image/svg+xml" => ".svg",
        "image/avif" => ".avif",
        "image/bmp" => ".bmp",
        "image/tiff" => ".tiff",
        "image/heic" => ".heic",
        "image/heif" => ".heif",
        "image/x-icon" => ".ico",
        "audio/webm" => ".webm",
        "audio/mpeg" => ".mp3",
        "audio/wav" => ".wav",
        "audio/mp4" => ".m4a",
        "audio/ogg" => ".ogg",
        "application/pdf" => ".pdf",
        "text/plain" => ".txt",
        "text/markdown" => ".md",
        "application/json" => ".json",
        _ => ".bin",
    }
}

fn epoch_to_ymd(secs: u64) -> (u32, u32, u32) {
    // 简化版：使用 chrono 的 NaiveDate::from_epoch_days 思路
    // 这里采用 Howard Hinnant 算法，避免引入 chrono
    let days = (secs / 86_400) as i64;
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64; // [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365; // [0, 399]
    let y = (yoe as i64) + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
    let mp = (5 * doy + 2) / 153; // [0, 11]
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32; // [1, 31]
    let m_raw = if mp < 10 { mp + 3 } else { mp - 9 } as i64; // [1, 12]
    let y_final = y + (m_raw <= 2) as i64;
    (y_final as u32, m_raw as u32, d)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp_root() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("remi-attach-{}", Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn write_and_read() {
        let store = AttachmentStore::new(AttachmentStoreConfig {
            root: tmp_root(),
            ..Default::default()
        })
        .unwrap();
        let meta = store
            .write(
                "hello.png",
                "image/png",
                b"\x89PNG\r\n\x1a\nfake",
                AttachmentKind::Chat,
                Some("t-1".into()),
                Some("m-1".into()),
                Some("u-1".into()),
            )
            .unwrap();
        assert_eq!(meta.original_name, "hello.png");
        assert_eq!(meta.extension, ".png");
        assert_eq!(meta.size_bytes, 12);
        let (bytes, lite) = store.read(&meta.id).unwrap();
        assert_eq!(bytes.len(), 12);
        assert!(lite.absolute_path.contains(&meta.id));
    }

    #[test]
    fn rejects_oversize() {
        let store = AttachmentStore::new(AttachmentStoreConfig {
            root: tmp_root(),
            max_size_bytes: 4,
            ..Default::default()
        })
        .unwrap();
        let err = store
            .write(
                "big.png",
                "image/png",
                b"0123456789",
                AttachmentKind::Chat,
                None,
                None,
                None,
            )
            .unwrap_err();
        matches!(err, ServerError::InvalidParams(_));
    }

    #[test]
    fn rejects_unknown_mime() {
        let store = AttachmentStore::new(AttachmentStoreConfig {
            root: tmp_root(),
            ..Default::default()
        })
        .unwrap();
        let err = store
            .write(
                "x.exe",
                "application/x-msdownload",
                b"MZ",
                AttachmentKind::File,
                None,
                None,
                None,
            )
            .unwrap_err();
        matches!(err, ServerError::InvalidParams(_));
    }

    #[test]
    fn rejects_unknown_extension() {
        let store = AttachmentStore::new(AttachmentStoreConfig {
            root: tmp_root(),
            ..Default::default()
        })
        .unwrap();
        let err = store
            .write(
                "x.exe",
                "application/octet-stream",
                b"MZ",
                AttachmentKind::File,
                None,
                None,
                None,
            )
            .unwrap_err();
        matches!(err, ServerError::InvalidParams(_));
    }

    #[test]
    fn delete_removes_file() {
        let store = AttachmentStore::new(AttachmentStoreConfig {
            root: tmp_root(),
            ..Default::default()
        })
        .unwrap();
        let meta = store
            .write(
                "a.jpg",
                "image/jpeg",
                b"jpeg",
                AttachmentKind::Chat,
                None,
                None,
                None,
            )
            .unwrap();
        assert!(store.delete(&meta.id).unwrap());
        assert!(store.read(&meta.id).is_err());
    }

    #[test]
    fn sanitize_filename_strips_slashes() {
        assert_eq!(sanitize_filename("../etc/passwd"), ".._etc_passwd");
        assert_eq!(sanitize_filename("nul\0.txt"), "nul_.txt");
        assert_eq!(sanitize_filename("a:b/c\\d"), "a_b_c_d");
    }

    #[test]
    fn is_safe_id_rejects_path_traversal() {
        assert!(!is_safe_id("../etc"));
        assert!(!is_safe_id(""));
        assert!(is_safe_id("12345678-1234-1234-1234-123456789012"));
    }

    #[test]
    fn epoch_to_ymd_basic() {
        // 2026-01-01
        let secs = 1_767_225_600_u64;
        let (y, m, d) = epoch_to_ymd(secs);
        assert_eq!((y, m, d), (2026, 1, 1));
    }
}
