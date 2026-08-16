//! # Skill 清单（SKILL.md frontmatter）
//!
//! 解析 SKILL.md 文件中的 YAML frontmatter，得到 [`SkillManifest`]。
//!
//! ## SKILL.md 格式
//!
//! ```markdown
//! ---
//! name: react-best-practices
//! version: 1.2.0
//! description: 推荐的 React 编码模式
//! author: 云顶数字 Team
//! runtime: code
//! tags: [react, frontend]
//! depends: [typescript-strict, testing-patterns]
//! ---
//!
//! # React Best Practices
//!
//! ... 自由正文，作为 skill prompt 注入模型上下文 ...
//! ```
//!
//! ## 必填 vs 选填
//!
//! - **必填**：`name`
//! - **强烈推荐**：`description`（前端展示用）
//! - **可选**：`version`（默认 `0.0.0`）/ `author` / `runtime` / `tags` / `depends`
//!
//! ## 设计取舍
//!
//! - **不引入 YAML 依赖**：frontmatter 用最小手写解析器处理（避免引入 `serde_yaml` 体积炸弹）
//! - **容错**：缺失字段填默认值；解析失败时返回精确错误

use serde::{Deserialize, Serialize};
use std::path::Path;

use super::error::{SkillError, SkillResult};

/// Skill 清单（YAML frontmatter 解析结果）
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SkillManifest {
    /// Skill 名称（小写 + 数字 + `_` + `-`，1-40 字符）
    pub name: String,
    /// 版本（默认 "0.0.0"）
    #[serde(default = "default_version")]
    pub version: String,
    /// 描述
    #[serde(default)]
    pub description: String,
    /// 作者
    #[serde(default)]
    pub author: String,
    /// 运行时模式（`code` / `work` / `any`）
    #[serde(default = "default_runtime")]
    pub runtime: String,
    /// 标签
    #[serde(default)]
    pub tags: Vec<String>,
    /// 依赖的其它 skill 名
    #[serde(default)]
    pub depends: Vec<String>,
    /// SKILL.md 正文（frontmatter 之后的部分），作为 prompt 注入
    #[serde(default)]
    pub body: String,
}

fn default_version() -> String {
    "0.0.0".to_string()
}

fn default_runtime() -> String {
    "any".to_string()
}

/// 校验 name 合法性
pub fn validate_name(name: &str) -> SkillResult<()> {
    if name.is_empty() || name.len() > 40 {
        return Err(SkillError::InvalidName(name.to_string()));
    }
    let bytes = name.as_bytes();
    // 首字符：小写字母或数字
    let first = bytes[0];
    if !(first.is_ascii_lowercase() || first.is_ascii_digit()) {
        return Err(SkillError::InvalidName(name.to_string()));
    }
    // 后续字符：小写字母、数字、`_`、`-`
    for &b in &bytes[1..] {
        if !(b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_' || b == b'-') {
            return Err(SkillError::InvalidName(name.to_string()));
        }
    }
    Ok(())
}

/// 解析 SKILL.md 文本
pub fn parse_skill_md(content: &str) -> SkillResult<SkillManifest> {
    let (yaml_str, body) = split_frontmatter(content)?;
    let mut manifest: SkillManifest = parse_yaml_minimal(yaml_str)?;
    manifest.body = body.trim().to_string();
    // 必填字段校验
    if manifest.name.is_empty() {
        return Err(SkillError::ManifestMissingField("name".to_string()));
    }
    validate_name(&manifest.name)?;
    Ok(manifest)
}

/// 拆分为 frontmatter + body
///
/// - 必须以 `---\n` 开头
/// - 第二个 `---\n` 结束 frontmatter
fn split_frontmatter(content: &str) -> SkillResult<(&str, &str)> {
    let content = content.trim_start();
    if !content.starts_with("---") {
        // 没有 frontmatter：当作空 frontmatter + 全文 body
        return Ok(("", content));
    }
    // 跳过开头的 "---\n"
    let after_open = if let Some(rest) = content.strip_prefix("---\r\n") {
        rest
    } else if let Some(rest) = content.strip_prefix("---\n") {
        rest
    } else {
        return Ok(("", content));
    };
    // 找下一个 "\n---" 结束符
    if let Some(end_idx) = find_frontmatter_end(after_open) {
        let yaml = &after_open[..end_idx];
        let body = &after_open[end_idx..];
        // 跳过结束标记
        let body = body
            .trim_start_matches('\n')
            .trim_start_matches("\r\n")
            .trim_start_matches("---")
            .trim_start_matches('\n')
            .trim_start_matches("\r\n");
        Ok((yaml, body))
    } else {
        // 没有结束标记：整个内容当作 body
        Ok(("", after_open))
    }
}

/// 找 frontmatter 结束位置（行首为 `---`）
fn find_frontmatter_end(s: &str) -> Option<usize> {
    let mut start = 0;
    for line in s.split_inclusive('\n') {
        let trimmed = line.trim_end_matches(['\n', '\r']);
        if trimmed == "---" {
            return Some(start);
        }
        start += line.len();
    }
    None
}

/// 最小 YAML 解析器：只支持 `key: value` 单行格式 + `[a, b, c]` 数组
///
/// 不支持嵌套/多行字符串/引号转义等高级特性 —— 对 SKILL.md 足够。
fn parse_yaml_minimal(yaml: &str) -> SkillResult<SkillManifest> {
    let mut name = String::new();
    let mut version = default_version();
    let mut description = String::new();
    let mut author = String::new();
    let mut runtime = default_runtime();
    let mut tags: Vec<String> = Vec::new();
    let mut depends: Vec<String> = Vec::new();

    for line in yaml.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        // 找第一个 `:` 分割 key/value
        let Some(colon_idx) = line.find(':') else {
            continue; // 跳过格式不明的行
        };
        let key = line[..colon_idx].trim();
        let value = line[colon_idx + 1..].trim();

        match key {
            "name" => name = value.to_string(),
            "version" => version = value.to_string(),
            "description" => description = strip_quotes(value),
            "author" => author = strip_quotes(value),
            "runtime" => runtime = strip_quotes(value),
            "tags" => tags = parse_inline_array(value),
            "depends" => depends = parse_inline_array(value),
            _ => {} // 忽略未知字段
        }
    }

    Ok(SkillManifest {
        name,
        version,
        description,
        author,
        runtime,
        tags,
        depends,
        body: String::new(),
    })
}

/// 去除首尾引号
fn strip_quotes(s: &str) -> String {
    let s = s.trim();
    if s.len() >= 2 {
        let bytes = s.as_bytes();
        if (bytes[0] == b'"' && bytes[bytes.len() - 1] == b'"')
            || (bytes[0] == b'\'' && bytes[bytes.len() - 1] == b'\'')
        {
            return s[1..s.len() - 1].to_string();
        }
    }
    s.to_string()
}

/// 解析 `[a, b, c]` 内联数组
fn parse_inline_array(s: &str) -> Vec<String> {
    let s = s.trim();
    let inner = if s.starts_with('[') && s.ends_with(']') {
        &s[1..s.len() - 1]
    } else {
        s
    };
    inner
        .split(',')
        .map(|x| strip_quotes(x.trim()))
        .filter(|x| !x.is_empty())
        .collect()
}

/// 从 SKILL.md 文件路径解析
pub fn parse_skill_md_file(path: &Path) -> SkillResult<SkillManifest> {
    let content = std::fs::read_to_string(path)?;
    parse_skill_md(&content)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_name_ok() {
        assert!(validate_name("react-best-practices").is_ok());
        assert!(validate_name("test").is_ok());
        assert!(validate_name("my_skill").is_ok());
        assert!(validate_name("a1b2").is_ok());
    }

    #[test]
    fn validate_name_rejects() {
        assert!(validate_name("").is_err());
        assert!(validate_name("A").is_err()); // 大写
        assert!(validate_name("-abc").is_err()); // - 开头
        assert!(validate_name("a b").is_err()); // 空格
        assert!(validate_name("a.b").is_err()); // 点
        assert!(validate_name(&"a".repeat(41)).is_err()); // 超长
    }

    #[test]
    fn split_frontmatter_basic() {
        let md = "---\nname: foo\n---\n# Hello";
        let (yaml, body) = split_frontmatter(md).unwrap();
        assert!(yaml.contains("name: foo"));
        assert!(body.contains("# Hello"));
    }

    #[test]
    fn split_frontmatter_no_frontmatter() {
        let md = "just plain text";
        let (yaml, body) = split_frontmatter(md).unwrap();
        assert!(yaml.is_empty());
        assert_eq!(body, "just plain text");
    }

    #[test]
    fn split_frontmatter_unterminated() {
        let md = "---\nname: foo\nno end";
        let (yaml, body) = split_frontmatter(md).unwrap();
        assert!(yaml.is_empty());
        assert!(body.contains("name: foo"));
    }

    #[test]
    fn parse_full_skill_md() {
        let md = r#"---
name: react-best-practices
version: 1.2.0
description: "React 编码规范"
author: 云顶数字 Team
runtime: code
tags: [react, frontend, hooks]
depends: [typescript-strict]
---

# React Best Practices

useEffect 应该显式列出依赖。
"#;
        let manifest = parse_skill_md(md).unwrap();
        assert_eq!(manifest.name, "react-best-practices");
        assert_eq!(manifest.version, "1.2.0");
        assert_eq!(manifest.description, "React 编码规范");
        assert_eq!(manifest.author, "云顶数字 Team");
        assert_eq!(manifest.runtime, "code");
        assert_eq!(manifest.tags, vec!["react", "frontend", "hooks"]);
        assert_eq!(manifest.depends, vec!["typescript-strict"]);
        assert!(manifest.body.contains("useEffect"));
    }

    #[test]
    fn parse_minimal_skill_md() {
        let md = r#"---
name: minimal
---

body only
"#;
        let manifest = parse_skill_md(md).unwrap();
        assert_eq!(manifest.name, "minimal");
        assert_eq!(manifest.version, "0.0.0");
        assert_eq!(manifest.runtime, "any");
        assert!(manifest.tags.is_empty());
        assert!(manifest.depends.is_empty());
    }

    #[test]
    fn parse_missing_name_errors() {
        let md = r#"---
description: no name
---
body
"#;
        let result = parse_skill_md(md);
        assert!(matches!(result, Err(SkillError::ManifestMissingField(_))));
    }

    #[test]
    fn parse_invalid_name_errors() {
        let md = r#"---
name: "Bad Name"
---
body
"#;
        let result = parse_skill_md(md);
        assert!(matches!(result, Err(SkillError::InvalidName(_))));
    }

    #[test]
    fn parse_skill_md_file_real() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("SKILL.md");
        std::fs::write(
            &path,
            r#"---
name: file-skill
description: from file
---
content
"#,
        )
        .unwrap();
        let manifest = parse_skill_md_file(&path).unwrap();
        assert_eq!(manifest.name, "file-skill");
        assert_eq!(manifest.description, "from file");
    }
}
