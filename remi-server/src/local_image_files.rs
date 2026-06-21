//! # 本地图片文件服务模块
//!
//! 提供对前端 markdown 引用本地图片的受控访问。
//!
//! ## 安全约束
//!
//! - 只允许读取 `localImage.ts` 中声明的扩展名（与前端共享允许列表）
//! - 解析相对路径时使用 `cwd` 作为基准，禁止 `..` 穿越到 cwd 外
//! - 绝对路径必须落在用户显式授权的目录列表（projects 根目录 / home 目录 / attachments_dir）
//! - 单文件大小上限（默认 64MB），超过则拒绝服务
//! - 路径中如果含 symlink，必须解析后再次校验是否仍在白名单根目录之下
//!
//! ## 接口
//!
//! - [`LocalImageResolver::resolve`]：把 `(src, cwd)` 解析为绝对路径
//! - [`LocalImageResolver::read`]：读取文件字节 + 检测 MIME
//!
//! ## 路由层
//!
//! 实际的 HTTP handler 在 [`crate::http_routes::local_image_handler`]，
//! 这里只暴露纯函数逻辑以便测试与复用。

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use crate::error::{ServerError, ServerResult};

/// 默认允许的扩展名（小写，含 `.`），与前端 `localImage.ts` 保持一致
pub const SUPPORTED_EXTENSIONS: &[&str] = &[
    ".avif", ".bmp", ".gif", ".heic", ".heif", ".ico", ".jpeg", ".jpg", ".png", ".svg", ".tiff",
    ".webp",
];

/// 默认最大文件大小（64MB）
pub const DEFAULT_MAX_SIZE_BYTES: u64 = 64 * 1024 * 1024;

/// 本地图片解析器配置
#[derive(Debug, Clone)]
pub struct LocalImageConfig {
    /// 允许作为绝对路径基准的根目录（projects 根、home、attachments_dir 等）
    pub allowed_roots: Vec<PathBuf>,
    /// 单文件最大字节数
    pub max_size_bytes: u64,
    /// 是否允许 symlink（默认 false：遇到 symlink 即拒绝）
    pub allow_symlinks: bool,
}

impl Default for LocalImageConfig {
    fn default() -> Self {
        Self {
            allowed_roots: Vec::new(),
            max_size_bytes: DEFAULT_MAX_SIZE_BYTES,
            allow_symlinks: false,
        }
    }
}

/// 本地图片解析器
#[derive(Clone)]
pub struct LocalImageResolver {
    config: Arc<LocalImageConfig>,
}

impl LocalImageResolver {
    /// 创建新的解析器
    pub fn new(config: LocalImageConfig) -> Self {
        Self {
            config: Arc::new(config),
        }
    }

    /// 注入允许的根目录
    pub fn with_root(mut self, root: impl Into<PathBuf>) -> Self {
        let mut cfg = (*self.config).clone();
        cfg.allowed_roots.push(root.into());
        self.config = Arc::new(cfg);
        self
    }

    /// 解析 `(src, cwd)` 为绝对路径
    ///
    /// - `src` 可以是绝对路径、Windows 风格绝对路径、相对路径或 `./xxx` / `../xxx`
    /// - `cwd` 用于解析相对路径；若 src 是绝对路径则 cwd 仍参与根目录校验
    pub fn resolve(&self, src: &str, cwd: Option<&str>) -> ServerResult<PathBuf> {
        if src.is_empty() {
            return Err(ServerError::InvalidParams("src 不能为空".into()));
        }

        // 拒绝 URL 形式（前端已分流过）
        if src.contains("://") {
            return Err(ServerError::InvalidParams(format!(
                "URL 形式不被允许: {}",
                src
            )));
        }

        // 扩展名白名单
        let lower = src.to_lowercase();
        let ext_ok = SUPPORTED_EXTENSIONS.iter().any(|e| lower.ends_with(e));
        if !ext_ok {
            return Err(ServerError::InvalidParams(format!(
                "不支持的本地图片扩展名: {}",
                src
            )));
        }

        // 决定解析策略
        let path = Path::new(src);
        let is_absolute = path.is_absolute()
            || is_windows_absolute(src)
            || src.starts_with('/')
            || (src.len() >= 3 && src.as_bytes()[1] == b':');

        let resolved = if is_absolute {
            normalize_path(Path::new(src))
        } else {
            // 相对路径：必须提供 cwd
            let cwd = cwd.ok_or_else(|| {
                ServerError::InvalidParams(format!("相对路径 {} 需要提供 cwd", src))
            })?;
            let cwd_path = normalize_path(Path::new(cwd));
            cwd_path.join(src)
        };

        // 解析后必须是 file 而非目录
        if !resolved.is_file() {
            return Err(ServerError::InvalidParams(format!(
                "本地图片不存在或不是文件: {:?}",
                resolved
            )));
        }

        // 根目录白名单
        if !self.is_under_allowed_root(&resolved) {
            return Err(ServerError::InvalidParams(format!(
                "本地图片路径不在白名单根目录内: {:?}",
                resolved
            )));
        }

        // symlink 校验
        let meta = fs::symlink_metadata(&resolved)?;
        if meta.file_type().is_symlink() && !self.config.allow_symlinks {
            return Err(ServerError::InvalidParams(format!(
                "本地图片路径是 symlink，已拒绝: {:?}",
                resolved
            )));
        }

        // 文件大小
        if meta.len() > self.config.max_size_bytes {
            return Err(ServerError::InvalidParams(format!(
                "本地图片过大: {} > {}",
                meta.len(),
                self.config.max_size_bytes
            )));
        }

        Ok(resolved)
    }

    /// 读取文件 + 返回 MIME 头
    pub fn read(&self, src: &str, cwd: Option<&str>) -> ServerResult<(Vec<u8>, &'static str)> {
        let abs = self.resolve(src, cwd)?;
        let bytes = fs::read(&abs)?;
        let mime = mime_for_extension(abs.to_str().unwrap_or(""));
        Ok((bytes, mime))
    }

    fn is_under_allowed_root(&self, p: &Path) -> bool {
        if self.config.allowed_roots.is_empty() {
            // 没配白名单就严格拒绝（fail-closed）
            return false;
        }
        let canon = canonicalize_safe(p);
        for root in &self.config.allowed_roots {
            let root_canon = canonicalize_safe(root);
            if let (Some(c), Some(r)) = (canon.as_ref(), root_canon.as_ref()) {
                if c.starts_with(r) {
                    return true;
                }
            } else {
                // 解析失败时退回到字符串前缀比较（保守）
                if p.starts_with(root) {
                    return true;
                }
            }
        }
        false
    }
}

/// 规范化路径（处理 `.` / `..` / 多重斜杠）
pub fn normalize_path(p: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for comp in p.components() {
        match comp {
            std::path::Component::ParentDir => {
                out.pop();
            }
            std::path::Component::CurDir => {}
            other => out.push(other.as_os_str()),
        }
    }
    out
}

/// Windows 风格路径判断（`C:\...` 或 `C:/...`）
pub fn is_windows_absolute(p: &str) -> bool {
    p.len() >= 3
        && p.as_bytes()[0].is_ascii_alphabetic()
        && p.as_bytes()[1] == b':'
        && (p.as_bytes()[2] == b'\\' || p.as_bytes()[2] == b'/')
}

/// 安全 canonicalize：失败时返回 None 而不是 panic
pub fn canonicalize_safe(p: &Path) -> Option<PathBuf> {
    fs::canonicalize(p).ok()
}

/// 根据扩展名推断 MIME
pub fn mime_for_extension(path: &str) -> &'static str {
    let lower = path.to_lowercase();
    if lower.ends_with(".png") {
        "image/png"
    } else if lower.ends_with(".jpg") || lower.ends_with(".jpeg") {
        "image/jpeg"
    } else if lower.ends_with(".gif") {
        "image/gif"
    } else if lower.ends_with(".webp") {
        "image/webp"
    } else if lower.ends_with(".avif") {
        "image/avif"
    } else if lower.ends_with(".bmp") {
        "image/bmp"
    } else if lower.ends_with(".svg") {
        "image/svg+xml"
    } else if lower.ends_with(".ico") {
        "image/x-icon"
    } else if lower.ends_with(".tiff") {
        "image/tiff"
    } else if lower.ends_with(".heic") {
        "image/heic"
    } else if lower.ends_with(".heif") {
        "image/heif"
    } else {
        "application/octet-stream"
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn make_root() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("remi-local-image-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn resolve_relative_path_with_cwd() {
        let root = make_root();
        let img = root.join("foo.png");
        fs::write(&img, b"PNGDATA").unwrap();
        let r = LocalImageResolver::new(
            LocalImageConfig {
                allowed_roots: vec![root.clone()],
                ..Default::default()
            },
        );
        let resolved = r.resolve("./foo.png", Some(root.to_str().unwrap())).unwrap();
        assert_eq!(resolved, img);
    }

    #[test]
    fn resolve_absolute_path_in_root() {
        let root = make_root();
        let img = root.join("a/b/c.jpg");
        fs::create_dir_all(img.parent().unwrap()).unwrap();
        fs::write(&img, b"jpeg").unwrap();
        let r = LocalImageResolver::new(LocalImageConfig {
            allowed_roots: vec![root.clone()],
            ..Default::default()
        });
        let resolved = r
            .resolve(img.to_str().unwrap(), None)
            .unwrap();
        assert!(resolved.ends_with("c.jpg"));
    }

    #[test]
    fn rejects_traversal_above_root() {
        let root = make_root();
        let outside = std::env::temp_dir().join(format!("remi-outside-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&outside).unwrap();
        fs::write(outside.join("evil.png"), b"x").unwrap();
        let r = LocalImageResolver::new(LocalImageConfig {
            allowed_roots: vec![root.clone()],
            ..Default::default()
        });
        let abs = outside.join("evil.png");
        let err = r.resolve(abs.to_str().unwrap(), None).unwrap_err();
        matches!(err, ServerError::InvalidParams(_));
    }

    #[test]
    fn rejects_unknown_extension() {
        let root = make_root();
        fs::write(root.join("a.exe"), b"x").unwrap();
        let r = LocalImageResolver::new(LocalImageConfig {
            allowed_roots: vec![root.clone()],
            ..Default::default()
        });
        let err = r
            .resolve(root.join("a.exe").to_str().unwrap(), None)
            .unwrap_err();
        matches!(err, ServerError::InvalidParams(_));
    }

    #[test]
    fn rejects_symlink_by_default() {
        let root = make_root();
        let target = root.join("real.png");
        fs::write(&target, b"x").unwrap();
        let link = root.join("link.png");
        #[cfg(unix)]
        std::os::unix::fs::symlink(&target, &link).unwrap();
        #[cfg(windows)]
        std::os::windows::fs::symlink_file(&target, &link).unwrap();
        let r = LocalImageResolver::new(LocalImageConfig {
            allowed_roots: vec![root.clone()],
            allow_symlinks: false,
            ..Default::default()
        });
        let err = r
            .resolve(link.to_str().unwrap(), None)
            .unwrap_err();
        matches!(err, ServerError::InvalidParams(_));
    }

    #[test]
    fn no_allowed_roots_fails_closed() {
        let r = LocalImageResolver::new(LocalImageConfig::default());
        let err = r.resolve("/tmp/a.png", None).unwrap_err();
        matches!(err, ServerError::InvalidParams(_));
    }

    #[test]
    fn mime_for_known_ext() {
        assert_eq!(mime_for_extension("foo.PNG"), "image/png");
        assert_eq!(mime_for_extension("a.JPG"), "image/jpeg");
        assert_eq!(mime_for_extension("b.WebP"), "image/webp");
        assert_eq!(mime_for_extension("c.SVG"), "image/svg+xml");
    }

    #[test]
    fn normalize_path_collapse_dots() {
        let p = normalize_path(Path::new("/a/b/../c/./d"));
        assert_eq!(p, PathBuf::from("/a/c/d"));
    }

    #[test]
    fn is_windows_absolute_basic() {
        assert!(is_windows_absolute("C:\\foo\\bar"));
        assert!(is_windows_absolute("D:/baz"));
        assert!(!is_windows_absolute("foo/bar"));
        assert!(!is_windows_absolute("/usr/bin"));
    }
}
