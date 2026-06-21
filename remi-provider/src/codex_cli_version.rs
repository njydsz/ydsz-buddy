//! # Codex CLI Version 模块
//!
//! 探测本机安装的 `codex` CLI 版本，用于：
//!
//! - 在前端'模型/Provider 详情'中展示
//! - 判断是否需要提示用户升级（兼容性）
//! - 在认证时把版本作为能力声明的一部分
//!
//! ## 实现
//!
//! - 调用 `<codex> --version` 并解析首行
//! - 解析 `0.42.0` / `codex 0.42.0 (commit abc)` / `0.42.0-beta.1` 形式
//! - 失败时返回 None（不抛错）
//! - 解析失败但命令成功时，原样回填

use std::time::Duration;

use serde::{Deserialize, Serialize};
use tokio::process::Command;
use tracing::warn;

/// Codex CLI 版本信息
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CodexVersion {
    /// 原始输出
    pub raw: String,
    /// 主版本号
    pub major: Option<u32>,
    /// 次版本号
    pub minor: Option<u32>,
    /// 补丁版本号
    pub patch: Option<u32>,
    /// 预发布标签（`beta.1` / `rc.2` 等）
    pub pre_release: Option<String>,
    /// 完整版本字符串
    pub version: String,
    /// git commit / build 号（若 CLI 输出包含）
    pub build: Option<String>,
}

impl CodexVersion {
    /// 主版本是否 ≥ 给定值
    pub fn major_at_least(&self, target: u32) -> bool {
        self.major.map(|m| m >= target).unwrap_or(false)
    }

    /// 是否为预发布版
    pub fn is_prerelease(&self) -> bool {
        self.pre_release.is_some()
    }
}

/// 探测超时
pub const CODEX_PROBE_DEFAULT_TIMEOUT: Duration = Duration::from_secs(5);

/// 探测 Codex CLI 版本
pub async fn probe_codex_version(binary: &str) -> Option<CodexVersion> {
    let probe = async {
        let output = Command::new(binary)
            .arg("--version")
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .output()
            .await
            .ok()?;
        if !output.status.success() {
            return None;
        }
        let raw = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if raw.is_empty() {
            return None;
        }
        Some(parse(&raw))
    };

    match tokio::time::timeout(CODEX_PROBE_DEFAULT_TIMEOUT, probe).await {
        Ok(Some(v)) => Some(v),
        Ok(None) => None,
        Err(_) => {
            warn!("codex --version 探测超时");
            None
        }
    }
}

/// 解析输出（不执行任何 IO，纯字符串处理）
pub fn parse(raw: &str) -> CodexVersion {
    let raw = raw.trim().to_string();
    let mut major = None;
    let mut minor = None;
    let mut patch = None;
    let pre_release;
    let mut build = None;

    // 提取第一段版本号：`v?MAJOR(.MINOR(.PATCH)?)?(-PRERELEASE)?`
    let first_line = raw.lines().next().unwrap_or("").trim();
    let mut working = first_line.to_string();

    // 兼容 'codex 0.42.0 (commit abc)' — 取第一个看起来像版本号的 token
    if let Some(token) = first_line.split_whitespace().find(|t| t.contains('.')) {
        working = token.to_string();
    }

    // 去除可选的 'v' 前缀
    if let Some(stripped) = working.strip_prefix('v') {
        working = stripped.to_string();
    }

    // 拆 main / pre_release
    let (main_part, pre_part) = match working.split_once('-') {
        Some((m, p)) => (m.to_string(), Some(p.to_string())),
        None => (working.clone(), None),
    };

    // 解析数字段
    let parts: Vec<&str> = main_part.split('.').collect();
    if let Some(m) = parts.first() {
        major = m.parse().ok();
    }
    if let Some(n) = parts.get(1) {
        minor = n.parse().ok();
    }
    if let Some(p) = parts.get(2) {
        patch = p.parse().ok();
    }

    pre_release = pre_part;

    // 提取 build 号：`(commit abc)` 或 `(abc1234)`
    if let Some(start) = first_line.find('(') {
        if let Some(end) = first_line[start..].find(')') {
            let inside = &first_line[start + 1..start + end];
            let inside = inside.trim();
            // 取第一个 token
            if let Some(token) = inside.split_whitespace().next() {
                build = Some(token.to_string());
            }
        }
    }

    let version = main_part.clone();

    CodexVersion {
        raw,
        major,
        minor,
        patch,
        pre_release,
        version,
        build,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_simple_semver() {
        let v = parse("0.42.0");
        assert_eq!(v.major, Some(0));
        assert_eq!(v.minor, Some(42));
        assert_eq!(v.patch, Some(0));
        assert_eq!(v.pre_release, None);
        assert_eq!(v.version, "0.42.0");
    }

    #[test]
    fn parse_v_prefix() {
        let v = parse("v1.2.3");
        assert_eq!(v.major, Some(1));
        assert_eq!(v.minor, Some(2));
        assert_eq!(v.patch, Some(3));
        assert_eq!(v.version, "1.2.3");
    }

    #[test]
    fn parse_with_prerelease() {
        let v = parse("0.42.0-beta.1");
        assert_eq!(v.major, Some(0));
        assert_eq!(v.minor, Some(42));
        assert_eq!(v.patch, Some(0));
        assert_eq!(v.pre_release.as_deref(), Some("beta.1"));
        assert!(v.is_prerelease());
    }

    #[test]
    fn parse_with_build_hash() {
        let v = parse("codex 0.42.0 (commit abcdef123)");
        assert_eq!(v.major, Some(0));
        assert_eq!(v.version, "0.42.0");
        assert_eq!(v.build.as_deref(), Some("commit"));
    }

    #[test]
    fn parse_two_segments() {
        let v = parse("1.0");
        assert_eq!(v.major, Some(1));
        assert_eq!(v.minor, Some(0));
        assert_eq!(v.patch, None);
    }

    #[test]
    fn parse_garbage_returns_struct() {
        let v = parse("hello world");
        assert_eq!(v.major, None);
        assert_eq!(v.minor, None);
        assert_eq!(v.patch, None);
    }

    #[test]
    fn major_at_least() {
        let v = parse("2.0.0");
        assert!(v.major_at_least(1));
        assert!(v.major_at_least(2));
        assert!(!v.major_at_least(3));
    }
}

