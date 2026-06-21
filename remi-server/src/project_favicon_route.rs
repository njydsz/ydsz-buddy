//! # 项目 Favicon 路由模块
//!
//! 提供 `/api/project-favicon?path=<project_dir>` 接口，返回该项目的 favicon 字节。
//!
//! ## 查找策略
//!
//! 1. `<project>/.git/favicon.png`（Remi 自己的项目约定）
//! 2. `<project>/.git/favicon.ico`
//! 3. `<project>/favicon.ico`
//! 4. `<project>/favicon.png`
//! 5. 平台特定：`<project>/public/favicon.ico`
//! 6. `<project>/.vscode/favicon.ico`
//!
//! 都未命中时返回 [`FaviconLookup::fallback`]（透明 1×1 PNG），让前端占位即可。
//!
//! ## 安全
//!
//! - `path` 必须存在且是目录，否则 400
//! - 单文件大小上限（默认 256KB）
//! - 拒绝 symlink（fail-closed）

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use serde::{Deserialize, Serialize};

use crate::error::{ServerError, ServerResult};

/// 1×1 透明 PNG（base64 解码后约 67 字节）
pub const FALLBACK_PNG_BYTES: &[u8] = &[
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
    0x89, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x62, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
    0x42, 0x60, 0x82,
];

/// Favicon 查找配置
#[derive(Debug, Clone)]
pub struct FaviconConfig {
    /// 单个 favicon 文件最大字节数（默认 256KB）
    pub max_size_bytes: u64,
    /// 自定义候选路径（按优先级顺序，相对 project_dir）
    pub custom_candidates: Vec<String>,
    /// 允许 symlink（默认 false）
    pub allow_symlinks: bool,
}

impl Default for FaviconConfig {
    fn default() -> Self {
        Self {
            max_size_bytes: 256 * 1024,
            custom_candidates: Vec::new(),
            allow_symlinks: false,
        }
    }
}

/// 单次查找的命中结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FaviconResult {
    /// favicon 文件绝对路径（命中时），未命中时为 None
    pub absolute_path: Option<String>,
    /// 文件名（命中时），未命中时为 None
    pub file_name: Option<String>,
    /// MIME 类型
    pub mime_type: String,
    /// 是否命中（false 时返回 fallback）
    pub hit: bool,
    /// 项目根目录
    pub project_dir: String,
}

/// Favicon 查找器
#[derive(Clone)]
pub struct FaviconLookup {
    config: Arc<FaviconConfig>,
}

impl FaviconLookup {
    /// 创建查找器
    pub fn new(config: FaviconConfig) -> Self {
        Self {
            config: Arc::new(config),
        }
    }

    /// 默认候选路径（含平台相关）
    pub fn default_candidates(project_dir: &Path) -> Vec<PathBuf> {
        #[allow(unused_mut)]
        let mut out = vec![
            project_dir.join(".git").join("favicon.png"),
            project_dir.join(".git").join("favicon.ico"),
            project_dir.join("favicon.ico"),
            project_dir.join("favicon.png"),
            project_dir.join("public").join("favicon.ico"),
            project_dir.join(".vscode").join("favicon.ico"),
        ];
        #[cfg(target_os = "macos")]
        out.push(project_dir.join("Resources").join("favicon.ico"));
        out
    }

    /// 在项目目录中查找 favicon
    pub fn lookup(&self, project_dir: &Path) -> ServerResult<FaviconResult> {
        if !project_dir.exists() {
            return Err(ServerError::InvalidParams(format!(
                "项目目录不存在: {:?}",
                project_dir
            )));
        }
        if !project_dir.is_dir() {
            return Err(ServerError::InvalidParams(format!(
                "项目路径不是目录: {:?}",
                project_dir
            )));
        }

        // 构造候选路径
        let mut candidates = Self::default_candidates(project_dir);
        for c in &self.config.custom_candidates {
            candidates.push(project_dir.join(c));
        }

        for cand in candidates {
            match self.try_load(&cand) {
                Ok(Some((bytes, mime, name))) => {
                    if (bytes.len() as u64) > self.config.max_size_bytes {
                        // 单个文件过大，继续尝试下一个候选
                        continue;
                    }
                    return Ok(FaviconResult {
                        absolute_path: Some(cand.to_string_lossy().to_string()),
                        file_name: Some(name),
                        mime_type: mime.to_string(),
                        hit: true,
                        project_dir: project_dir.to_string_lossy().to_string(),
                    });
                }
                Ok(None) => continue,
                Err(e) => {
                    tracing::warn!("favicon 候选 {:?} 失败: {}", cand, e);
                    continue;
                }
            }
        }

        Ok(FaviconResult {
            absolute_path: None,
            file_name: None,
            mime_type: "image/png".to_string(),
            hit: false,
            project_dir: project_dir.to_string_lossy().to_string(),
        })
    }

    /// 读取 favicon 字节
    pub fn read(&self, project_dir: &Path) -> ServerResult<(Vec<u8>, FaviconResult)> {
        let result = self.lookup(project_dir)?;
        if result.hit {
            if let Some(p) = &result.absolute_path {
                let bytes = fs::read(p)?;
                return Ok((bytes, result));
            }
        }
        Ok((FALLBACK_PNG_BYTES.to_vec(), result))
    }

    fn try_load(&self, p: &Path) -> ServerResult<Option<(Vec<u8>, &'static str, String)>> {
        if !p.exists() {
            return Ok(None);
        }
        let meta = fs::symlink_metadata(p)?;
        if meta.file_type().is_symlink() && !self.config.allow_symlinks {
            return Ok(None);
        }
        if !meta.is_file() {
            return Ok(None);
        }
        let bytes = fs::read(p)?;
        let ext = p
            .extension()
            .and_then(|s| s.to_str())
            .map(|s| s.to_lowercase())
            .unwrap_or_default();
        let mime = match ext.as_str() {
            "png" => "image/png",
            "ico" => "image/x-icon",
            "jpg" | "jpeg" => "image/jpeg",
            "gif" => "image/gif",
            "webp" => "image/webp",
            "svg" => "image/svg+xml",
            _ => "application/octet-stream",
        };
        let name = p
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("favicon")
            .to_string();
        Ok(Some((bytes, mime, name)))
    }

    /// fallback 字节
    pub fn fallback() -> Vec<u8> {
        FALLBACK_PNG_BYTES.to_vec()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn make_project() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("remi-fav-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn lookup_finds_ico_in_root() {
        let proj = make_project();
        fs::write(proj.join("favicon.ico"), b"ICO").unwrap();
        let l = FaviconLookup::new(FaviconConfig::default());
        let r = l.lookup(&proj).unwrap();
        assert!(r.hit);
        assert_eq!(r.mime_type, "image/x-icon");
        let (bytes, _) = l.read(&proj).unwrap();
        assert_eq!(bytes, b"ICO");
    }

    #[test]
    fn lookup_finds_git_favicon_png_first() {
        let proj = make_project();
        fs::create_dir_all(proj.join(".git")).unwrap();
        fs::write(proj.join(".git").join("favicon.png"), b"PNGGIT").unwrap();
        fs::write(proj.join("favicon.ico"), b"ICO").unwrap();
        let l = FaviconLookup::new(FaviconConfig::default());
        let r = l.lookup(&proj).unwrap();
        assert!(r.hit);
        assert_eq!(r.mime_type, "image/png");
        let (bytes, _) = l.read(&proj).unwrap();
        assert_eq!(bytes, b"PNGGIT");
    }

    #[test]
    fn lookup_fallback_when_missing() {
        let proj = make_project();
        let l = FaviconLookup::new(FaviconConfig::default());
        let r = l.lookup(&proj).unwrap();
        assert!(!r.hit);
        let (bytes, _) = l.read(&proj).unwrap();
        assert_eq!(bytes, FALLBACK_PNG_BYTES);
    }

    #[test]
    fn lookup_rejects_non_dir() {
        let proj = make_project();
        let file = proj.join("not_a_dir");
        fs::write(&file, b"x").unwrap();
        let l = FaviconLookup::new(FaviconConfig::default());
        let err = l.lookup(&file).unwrap_err();
        matches!(err, ServerError::InvalidParams(_));
    }

    #[test]
    fn lookup_rejects_nonexistent() {
        let l = FaviconLookup::new(FaviconConfig::default());
        let err = l
            .lookup(Path::new("/this/does/not/exist/anywhere"))
            .unwrap_err();
        matches!(err, ServerError::InvalidParams(_));
    }

    #[test]
    fn oversized_candidate_skipped() {
        let proj = make_project();
        // 创建一个 1KB 的 favicon，max_size 设为 100 字节
        fs::write(proj.join("favicon.ico"), vec![0u8; 1024]).unwrap();
        let l = FaviconLookup::new(FaviconConfig {
            max_size_bytes: 100,
            ..Default::default()
        });
        let r = l.lookup(&proj).unwrap();
        assert!(!r.hit);
    }
}
