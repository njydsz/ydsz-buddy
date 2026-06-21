//! # Codex 错误分类
//!
//! 本模块将 Codex 子进程或 App Server 返回的各类错误分类为内部标准类型，
//! 便于上层业务根据错误类别采取不同恢复策略。
//!
//! ## 分类标准
//!
//! | 分类 | 含义 | 恢复策略 |
//! |------|------|----------|
//! | `Auth` | 鉴权失败 / token 过期 | 重新登录 |
//! | `RateLimit` | 速率限制 | 退避重试 |
//! | `ContextLength` | 上下文超长 | 截断历史 |
//! | `Network` | 网络错误 | 退避重试 |
//! | `Server` | 上游服务错误 | 退避重试 |
//! | `Client` | 客户端错误 | 修正请求 |
//! | `Unknown` | 未分类错误 | 视情况 |

use serde::{Deserialize, Serialize};

/// Codex 错误分类
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum CodexErrorClass {
    Auth,
    RateLimit,
    ContextLength,
    Network,
    Server,
    Client,
    Unknown,
}

/// 错误分类结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClassifiedError {
    pub class: CodexErrorClass,
    pub retryable: bool,
    pub human_message: String,
}

/// 分类一段错误文本/JSON
pub fn classify_error_text(text: &str) -> ClassifiedError {
    let lower = text.to_lowercase();
    classify_by_keywords(&lower, text)
}

fn classify_by_keywords(lower: &str, original: &str) -> ClassifiedError {
    if contains_any(lower, &["unauthorized", "401", "api key", "auth_token", "token expired"]) {
        return ClassifiedError {
            class: CodexErrorClass::Auth,
            retryable: false,
            human_message: "鉴权失败，请重新登录 Codex".to_string(),
        };
    }
    if contains_any(lower, &["rate limit", "rate_limit", "429", "too many requests"]) {
        return ClassifiedError {
            class: CodexErrorClass::RateLimit,
            retryable: true,
            human_message: "触发速率限制，请稍后重试".to_string(),
        };
    }
    if contains_any(
        lower,
        &[
            "context length",
            "context_length",
            "maximum context",
            "tokens exceed",
        ],
    ) {
        return ClassifiedError {
            class: CodexErrorClass::ContextLength,
            retryable: false,
            human_message: "上下文长度超出模型限制".to_string(),
        };
    }
    if contains_any(lower, &["econnrefused", "etimedout", "enotfound", "network"]) {
        return ClassifiedError {
            class: CodexErrorClass::Network,
            retryable: true,
            human_message: "网络错误".to_string(),
        };
    }
    if contains_any(lower, &["500", "502", "503", "504", "internal server error"]) {
        return ClassifiedError {
            class: CodexErrorClass::Server,
            retryable: true,
            human_message: "上游 Codex 服务错误".to_string(),
        };
    }
    if contains_any(lower, &["400", "invalid request", "bad request", "validation"]) {
        return ClassifiedError {
            class: CodexErrorClass::Client,
            retryable: false,
            human_message: format!("请求无效: {original}"),
        };
    }
    ClassifiedError {
        class: CodexErrorClass::Unknown,
        retryable: false,
        human_message: original.to_string(),
    }
}

fn contains_any(haystack: &str, needles: &[&str]) -> bool {
    needles.iter().any(|n| haystack.contains(n))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classify_auth() {
        let r = classify_error_text("401 Unauthorized: invalid api key");
        assert_eq!(r.class, CodexErrorClass::Auth);
        assert!(!r.retryable);
    }

    #[test]
    fn classify_rate_limit() {
        let r = classify_error_text("429 Too Many Requests");
        assert_eq!(r.class, CodexErrorClass::RateLimit);
        assert!(r.retryable);
    }

    #[test]
    fn classify_network() {
        let r = classify_error_text("connect ECONNREFUSED 127.0.0.1:443");
        assert_eq!(r.class, CodexErrorClass::Network);
    }

    #[test]
    fn classify_unknown() {
        let r = classify_error_text("Something went sideways");
        assert_eq!(r.class, CodexErrorClass::Unknown);
    }
}

