//! # Sync Shell Environment 模块
//!
//! 把 Tauri 进程的 `PATH` / `HOME` / `USERPROFILE` / 等环境变量，与当前用户 shell 一致。
//!
//! ## 背景
//!
//! 在 macOS 上，Tauri 启动时不会加载用户的 `.zshrc` / `.bashrc`，因此 `PATH` 缺少
//! Homebrew / fnm / volta 等工具链位置，导致后端 spawn 子进程找不到命令。
//! 在 Windows 上类似问题：服务进程拿不到用户 PATH。
//!
//! 本模块通过读取登录 shell 的环境变量并合并到当前进程，来'补救'这一情况。

use std::collections::HashMap;
use std::ffi::OsString;
use std::path::PathBuf;
use std::process::Command;

use serde::{Deserialize, Serialize};

/// Shell 类型
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ShellFlavor {
    Zsh,
    Bash,
    Fish,
    Sh,
    PowerShell,
    Cmd,
    Unknown,
}

impl Default for ShellFlavor {
    fn default() -> Self {
        Self::Unknown
    }
}

impl ShellFlavor {
    pub fn from_program(p: &str) -> Self {
        let p = p.to_ascii_lowercase();
        if p.contains("zsh") {
            Self::Zsh
        } else if p.contains("fish") {
            Self::Fish
        } else if p.contains("bash") {
            Self::Bash
        } else if p.contains("pwsh") || p.contains("powershell") {
            Self::PowerShell
        } else if p.contains("cmd") {
            Self::Cmd
        } else if p == "sh" || p.ends_with("/sh") {
            Self::Sh
        } else {
            Self::Unknown
        }
    }
}

/// 同步结果
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ShellEnvSync {
    /// 用于同步的 shell 类型
    pub shell: ShellFlavor,
    /// 同步前 PATH
    pub old_path: Option<String>,
    /// 同步后 PATH
    pub new_path: Option<String>,
    /// 同步到当前进程的环境变量（已应用）
    pub applied_keys: Vec<String>,
    /// 警告（如 shell 不可用）
    pub warnings: Vec<String>,
}

/// 在指定 shell 中跑命令，捕获 stdout
fn run_shell_capture(shell: ShellFlavor, script: &str) -> Option<String> {
    let (program, args) = match shell {
        ShellFlavor::Zsh => ("zsh", vec!["-l", "-c", script]),
        ShellFlavor::Bash => ("bash", vec!["-l", "-c", script]),
        ShellFlavor::Fish => ("fish", vec!["-l", "-c", script]),
        ShellFlavor::Sh => ("sh", vec!["-l", "-c", script]),
        ShellFlavor::PowerShell => (
            "powershell",
            vec!["-NoLogo", "-NoProfile", "-Command", script],
        ),
        ShellFlavor::Cmd => ("cmd", vec!["/C", script]),
        ShellFlavor::Unknown => return None,
    };
    let out = Command::new(program).args(args).output().ok()?;
    if out.status.success() {
        Some(String::from_utf8_lossy(&out.stdout).to_string())
    } else {
        None
    }
}

/// 解析 key=value 列表（每行一对）
fn parse_kv_lines(text: &str) -> HashMap<String, String> {
    let mut out = HashMap::new();
    for line in text.lines() {
        let line = line.trim_end_matches('\r');
        if let Some((k, v)) = line.split_once('=') {
            out.insert(k.trim().to_string(), v.trim().to_string());
        }
    }
    out
}

/// 从 PowerShell 输出解析环境变量
fn parse_powershell_env(text: &str) -> HashMap<String, String> {
    // 输出形如 `Name=Value`
    parse_kv_lines(text)
}

/// 从 PATH-like 字符串拆分（按 `:` 或 `;`）
fn split_path(s: &str) -> Vec<PathBuf> {
    #[cfg(target_os = "windows")]
    let sep = ';';
    #[cfg(not(target_os = "windows"))]
    let sep = ':';
    s.split(sep)
        .filter(|p| !p.is_empty())
        .map(PathBuf::from)
        .collect()
}

/// 合并 PATH：保留当前 PATH，添加 shell 返回的、不在当前 PATH 中的目录
fn merge_path(current: &str, additional: &str) -> String {
    let cur = split_path(current);
    let extra = split_path(additional);
    let mut merged: Vec<PathBuf> = cur;
    for p in extra {
        if !merged.iter().any(|m| m == &p) {
            merged.push(p);
        }
    }
    #[cfg(target_os = "windows")]
    let sep = ';';
    #[cfg(not(target_os = "windows"))]
    let sep = ':';
    merged
        .iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect::<Vec<_>>()
        .join(&sep.to_string())
}

/// 同步 shell 环境变量到当前进程
pub fn sync(shell: ShellFlavor) -> ShellEnvSync {
    let mut report = ShellEnvSync {
        shell,
        old_path: std::env::var("PATH").ok(),
        ..Default::default()
    };
    // 1) 抓 shell 自己的环境
    let env_text = match shell {
        ShellFlavor::PowerShell => {
            let script = "[Environment]::GetEnvironmentVariables() | ForEach-Object { \"$($_.Key)=$($_.Value)\" }";
            run_shell_capture(shell, script)
        }
        _ => {
            let script = "env";
            run_shell_capture(shell, script)
        }
    };
    let env_map = match env_text {
        Some(s) if shell == ShellFlavor::PowerShell => parse_powershell_env(&s),
        Some(s) => parse_kv_lines(&s),
        None => {
            report.warnings.push(format!("shell {:?} 不可用", shell));
            return report;
        }
    };

    // 2) 把 shell 报上来的关键变量 apply 到当前进程
    let mut new_path = report.old_path.clone().unwrap_or_default();
    for (k, v) in &env_map {
        if k == "PATH" || k == "Path" {
            // PATH 单独合并
            if let Some(cur) = &report.old_path {
                new_path = merge_path(cur, v);
            } else {
                new_path = v.clone();
            }
            continue;
        }
        // 其它关键变量：直接覆盖
        let prev = std::env::var_os(k);
        std::env::set_var(k, v);
        if prev.as_deref() != Some(OsString::from(v).as_os_str()) {
            report.applied_keys.push(k.clone());
        }
    }
    // 3) 写回合并后的 PATH
    std::env::set_var("PATH", &new_path);
    report.new_path = Some(new_path);
    if report.applied_keys.iter().any(|k| k == "PATH" || k == "Path") {
        // 已合并
    } else {
        // 不在 apply 列表里也要标注
        report.applied_keys.push("PATH".to_string());
    }
    report
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_kv_lines_basic() {
        let mut s = String::new();
        s.push_str("FOO=bar\n");
        s.push_str("HELLO=world\r\n");
        s.push_str("EMPTY=\n");
        let m = parse_kv_lines(&s);
        assert_eq!(m.get("FOO").unwrap(), "bar");
        assert_eq!(m.get("HELLO").unwrap(), "world");
        assert_eq!(m.get("EMPTY").unwrap(), "");
    }

    #[test]
    fn merge_path_dedups() {
        let cur = "/a:/b:/c";
        let extra = "/c:/d";
        let merged = merge_path(cur, extra);
        assert_eq!(merged, "/a:/b:/c:/d");
    }

    #[test]
    fn shell_flavor_classification() {
        assert_eq!(ShellFlavor::from_program("/bin/zsh"), ShellFlavor::Zsh);
        assert_eq!(ShellFlavor::from_program("C:/Program Files/Git/bin/bash.exe"), ShellFlavor::Bash);
        assert_eq!(ShellFlavor::from_program("pwsh"), ShellFlavor::PowerShell);
    }
}

