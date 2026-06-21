//! # Gemini ACP Probe 模块
//!
//! 探测 Gemini CLI 是否支持 ACP (Agent Client Protocol) 协议
//! 以及它在 `acp://` 模式下能做什么。
//!
//! ## 背景
//!
//! - `gemini --acp` 启动一个 ACP over stdio 服务器
//! - 但不同版本的 gemini CLI 对 ACP 的支持程度不同：
//!   - 部分早期版本只支持 `--experimental-acp`
//!   - 一些版本不识别 `tools/list` 方法
//!   - 一些版本需要 `--model` 才能启动
//!
//! ## 用途
//!
//! 在启动 ACP 适配器前先做一次能力握手，得到一个 `GeminiAcpCapabilityReport`，
//! 上层据此决定走'完整 ACP'还是'降级到 plain 模式'。
//!
//! ## 实现
//!
//! - 第一步：尝试 `gemini --acp --help` 解析（不需要真的启动）
//! - 第二步（可选）：spawn 1 秒子进程 `gemini --acp` 拉取 initialize 响应（带超时）
//! - 当前只做第一步，第二步是后续工作

use std::time::Duration;

use serde::{Deserialize, Serialize};
use tokio::process::Command;
use tracing::warn;

/// Gemini ACP 探测结果
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GeminiAcpCapabilityReport {
    /// CLI 二进制是否存在
    pub binary_found: bool,
    /// 原始 `--acp --help` 输出
    pub help_text: Option<String>,
    /// 是否支持 `--acp` 标志
    pub supports_acp_flag: bool,
    /// 是否支持 `--experimental-acp` 标志（旧版）
    pub supports_experimental_acp: bool,
    /// 推测的协议版本（'v1' / 'v0'）
    pub protocol_version: Option<String>,
    /// 是否需要在启动时传 `--model`
    pub requires_model_flag: bool,
    /// 备注（如 CLI 不可用 / 协议不可识别）
    pub note: Option<String>,
}

impl GeminiAcpCapabilityReport {
    /// 是否建议走 ACP 完整流程
    pub fn recommend_acp(&self) -> bool {
        self.binary_found && (self.supports_acp_flag || self.supports_experimental_acp)
    }
}

/// 默认探测超时
pub const GEMINI_PROBE_DEFAULT_TIMEOUT: Duration = Duration::from_secs(3);

/// 探测 Gemini ACP 能力（仅查 `--help`，不真的启动）
pub async fn probe_gemini_acp(binary: &str) -> GeminiAcpCapabilityReport {
    let probe = async {
        let output = Command::new(binary)
            .arg("--acp")
            .arg("--help")
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .output()
            .await
            .ok()
            .map(|o| (o.status.success(), o));
        output
    };

    match tokio::time::timeout(GEMINI_PROBE_DEFAULT_TIMEOUT, probe).await {
        Ok(Some((true, output))) => {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            let help_text = if stdout.is_empty() { stderr } else { stdout };
            classify_help(&help_text)
        }
        Ok(Some((false, output))) => {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            // --acp --help 失败时，可能是 CLI 不支持组合，但 --help 单独跑可能成
            if stderr.contains("unknown flag") || stderr.contains("unrecognized") {
                GeminiAcpCapabilityReport {
                    binary_found: true,
                    help_text: Some(stderr.clone()),
                    supports_acp_flag: false,
                    supports_experimental_acp: false,
                    protocol_version: None,
                    requires_model_flag: false,
                    note: Some("gemini 不识别 --acp --help 组合，疑似旧版".to_string()),
                }
            } else {
                GeminiAcpCapabilityReport {
                    binary_found: true,
                    help_text: Some(if stdout.is_empty() { stderr } else { stdout }),
                    supports_acp_flag: false,
                    supports_experimental_acp: false,
                    protocol_version: None,
                    requires_model_flag: false,
                    note: Some("gemini --acp --help 失败".to_string()),
                }
            }
        }
        Ok(None) => GeminiAcpCapabilityReport {
            binary_found: false,
            help_text: None,
            supports_acp_flag: false,
            supports_experimental_acp: false,
            protocol_version: None,
            requires_model_flag: false,
            note: Some("未找到 gemini CLI 或启动失败".to_string()),
        },
        Err(_) => {
            warn!("gemini --acp --help 探测超时");
            GeminiAcpCapabilityReport {
                binary_found: false,
                help_text: None,
                supports_acp_flag: false,
                supports_experimental_acp: false,
                protocol_version: None,
                requires_model_flag: false,
                note: Some("探测超时".to_string()),
            }
        }
    }
}

/// 从 help 文本推断能力
fn classify_help(help: &str) -> GeminiAcpCapabilityReport {
    let lower = help.to_lowercase();
    let supports_acp_flag = lower.contains("--acp") || lower.contains("acp mode");
    let supports_experimental_acp = lower.contains("--experimental-acp") || lower.contains("experimental acp");
    let requires_model_flag = lower.contains("--model") || lower.contains("requires --model");

    // 推测协议版本：扫 'acp/v0' / 'acp/v1'
    let protocol_version = if lower.contains("acp/v1") {
        Some("v1".to_string())
    } else if lower.contains("acp/v0") || supports_acp_flag {
        Some("v0".to_string())
    } else {
        None
    };

    GeminiAcpCapabilityReport {
        binary_found: true,
        help_text: Some(help.to_string()),
        supports_acp_flag,
        supports_experimental_acp,
        protocol_version,
        requires_model_flag,
        note: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classify_modern_help() {
        let help = "Usage: gemini [options]\n  --acp                Start in ACP mode (acp/v1)\n  --model <model>      Model to use";
        let r = classify_help(help);
        assert!(r.binary_found);
        assert!(r.supports_acp_flag);
        assert!(r.requires_model_flag);
        assert_eq!(r.protocol_version.as_deref(), Some("v1"));
    }

    #[test]
    fn classify_experimental_help() {
        let help = "Usage: gemini [options]\n  --experimental-acp   Use experimental ACP";
        let r = classify_help(help);
        assert!(r.supports_experimental_acp);
        assert!(!r.supports_acp_flag);
    }

    #[test]
    fn classify_no_acp() {
        let help = "Usage: gemini [options]\n  --version\n  --model <model>";
        let r = classify_help(help);
        assert!(!r.supports_acp_flag);
        assert!(!r.supports_experimental_acp);
        assert_eq!(r.protocol_version, None);
        assert!(!r.recommend_acp());
    }

    #[test]
    fn recommend_acp_when_supported() {
        let r = GeminiAcpCapabilityReport {
            binary_found: true,
            help_text: None,
            supports_acp_flag: true,
            supports_experimental_acp: false,
            protocol_version: Some("v1".to_string()),
            requires_model_flag: false,
            note: None,
        };
        assert!(r.recommend_acp());
    }
}

