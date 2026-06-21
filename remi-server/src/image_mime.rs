//! # 图片 MIME 类型检测模块
//!
//! 本模块提供图片 MIME 类型相关的工具函数，包括：
//! - MIME 类型到文件扩展名的映射
//! - 安全的图片文件扩展名白名单
//! - Base64 Data URL 解析
//! - 图片扩展名推断
//!
//! 迁移自 Peak Code `apps/server/src/imageMime.ts`

use std::collections::HashMap;

/// MIME 类型到图片文件扩展名的映射表
pub fn image_extension_by_mime_type() -> HashMap<&"static str, &"static str> {
    HashMap::from([
        ("image/avif", ".avif"),
        ("image/bmp", ".bmp"),
        ("image/gif", ".gif"),
        ("image/heic", ".heic"),
        ("image/heif", ".heif"),
        ("image/jpeg", ".jpg"),
        ("image/jpg", ".jpg"),
        ("image/png", ".png"),
        ("image/svg+xml", ".svg"),
        ("image/tiff", ".tiff"),
        ("image/webp", ".webp"),
    ])
}

/// 安全的图片文件扩展名白名单
pub fn safe_image_file_extensions() -> std::collections::HashSet<&'static str> {
    std::collections::HashSet::from([
        ".avif", ".bmp", ".gif", ".heic", ".heif", ".ico", ".jpeg", ".jpg", ".png", ".svg",
        ".tiff", ".webp",
    ])
}

/// 解析 Base64 Data URL
///
/// 格式: `data:[<mediatype>][;base64],<data>`
///
/// 返回 `(mime_type, base64_data)` 或 `None`（解析失败）
pub fn parse_base64_data_url(data_url: &str) -> Option<(String, String)> {
    let trimmed = data_url.trim();
    let after_prefix = trimmed.strip_prefix("data:")?;

    let comma_pos = after_prefix.find(',')?;
    let header = &after_prefix[..comma_pos];
    let base64_data = after_prefix[comma_pos + 1..].replace(char::is_whitespace, "");

    if base64_data.is_empty() {
        return None;
    }

    // 检查 header 是否以 ';base64' 结尾
    let header_parts: Vec<&str> = header
        .split(';')
        .map(|p| p.trim())
        .filter(|p| !p.is_empty())
        .collect();

    if header_parts.len() < 2 {
        return None;
    }

    let trailing = header_parts.last()?.to_lowercase();
    if trailing != "base64" {
        return None;
    }

    let mime_type = header_parts.first()?.to_lowercase();

    Some((mime_type, base64_data))
}

/// 推断图片文件的扩展名
///
/// 按以下优先级推断：
/// 1. 已知 MIME 类型映射表
/// 2. 安全扩展名白名单中的 MIME 扩展名
/// 3. 文件名中的扩展名（如果在白名单中）
/// 4. 默认 `.bin`
pub fn infer_image_extension(mime_type: &str, file_name: Option<&str>) -> String {
    let mime_key = mime_type.to_lowercase();

    // 1. 从已知映射表中查找
    if let Some(ext) = image_extension_by_mime_type().get(mime_key.as_str()) {
        return ext.to_string();
    }

    // 2. 从 MIME 类型推断扩展名并检查白名单
    let mime_ext = mime_type_to_extension(&mime_key);
    let safe_extensions = safe_image_file_extensions();
    if let Some(ref ext) = mime_ext {
        if safe_extensions.contains(ext.as_str()) {
            return ext.clone();
        }
    }

    // 3. 从文件名中提取扩展名
    if let Some(name) = file_name {
        let trimmed = name.trim();
        if let Some(dot_pos) = trimmed.rfind('.') {
            let ext = &trimmed[dot_pos..];
            let lower_ext = ext.to_lowercase();
            if safe_extensions.contains(lower_ext.as_str()) {
                return lower_ext;
            }
        }
    }

    // 4. 默认回退
    ".bin".to_string()
}

/// 从 MIME 类型字符串中提取扩展名
///
/// 例如 `image/png` → `.png`，`image/svg+xml` → `.svg`
fn mime_type_to_extension(mime_type: &str) -> Option<String> {
    let subtype = mime_type.split('/').nth(1)?;
    // 处理 `svg+xml` 这种复合子类型，取第一个部分
    let base_subtype = subtype.split('+').next()?;
    if base_subtype.is_empty() {
        return None;
    }
    Some(format!(".{}", base_subtype))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_base64_data_url_valid() {
        let (mime, data) =
            parse_base64_data_url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUg").unwrap();
        assert_eq!(mime, "image/png");
        assert_eq!(data, "iVBORw0KGgoAAAANSUhEUg");
    }

    #[test]
    fn test_parse_base64_data_url_no_base64() {
        assert!(parse_base64_data_url("data:image/png,iVBORw0KGgo").is_none());
    }

    #[test]
    fn test_parse_base64_data_url_invalid() {
        assert!(parse_base64_data_url("not a data url").is_none());
        assert!(parse_base64_data_url("data:").is_none());
    }

    #[test]
    fn test_infer_image_extension_from_mime() {
        assert_eq!(infer_image_extension("image/png", None), ".png");
        assert_eq!(infer_image_extension("image/jpeg", None), ".jpg");
        assert_eq!(infer_image_extension("image/webp", None), ".webp");
    }

    #[test]
    fn test_infer_image_extension_from_file_name() {
        assert_eq!(
            infer_image_extension("application/octet-stream", Some("photo.jpg")),
            ".jpg"
        );
        assert_eq!(
            infer_image_extension("application/octet-stream", Some("icon.ico")),
            ".ico"
        );
    }

    #[test]
    fn test_infer_image_extension_fallback() {
        assert_eq!(
            infer_image_extension("application/octet-stream", None),
            ".bin"
        );
    }
}
