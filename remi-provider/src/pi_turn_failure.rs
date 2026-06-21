//! # Pi Turn Failure 分析器
//!
//! 分析 Pi Provider 在 turn 过程中可能出现的失败，给上层提供：
//!
//! - 失败分类（auth / network / model-not-found / context-overflow / ...）
//! - 是否可恢复（自动重试 / 需用户介入 / 需重新登录）
//! - 建议的应对动作（重试、退回 plan 模式、切换模型、提示升级）
//!
//! ## 用法
//!
//! ```rust,ignore
//! let classifier = PiTurnFailureClassifier::new();
//! let diag = classifier.classify(&error_message);
//! if diag.retryable {
//!     adapter.retry_turn(turn_id).await?;
//! }
//! ```

use serde::{Deserialize, Serialize};

/// 失败类别
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PiFailureKind {
    /// 鉴权失败（token 过期 / 未登录）
    Authentication,
    /// 网络问题（连接失败 / 读超时）
    Network,
    /// 模型不存在或被禁用
    ModelNotFound,
    /// 上下文超长
    ContextOverflow,
    /// 限流 / 配额用尽
    RateLimited,
    /// 服务端 5xx
    ServerError,
    /// 用户中止（Cancel / Esc）
    UserAbort,
    /// 不明错误
    Unknown,
}

impl PiFailureKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Authentication => "authentication",
            Self::Network => "network",
            Self::ModelNotFound => "model_not_found",
            Self::ContextOverflow => "context_overflow",
            Self::RateLimited => "rate_limited",
            Self::ServerError => "server_error",
            Self::UserAbort => "user_abort",
            Self::Unknown => "unknown",
        }
    }
}

/// 失败诊断结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PiFailureDiagnosis {
    /// 失败类别
    pub kind: PiFailureKind,
    /// 是否可自动重试
    pub retryable: bool,
    /// 建议的应对动作（人类可读）
    pub suggested_action: String,
    /// 匹配到的关键字（用于展示）
    pub matched_keywords: Vec<String>,
    /// 置信度 (0.0 - 1.0)
    pub confidence: f32,
}

impl PiFailureDiagnosis {
    fn new(kind: PiFailureKind, retryable: bool, action: impl Into<String>) -> Self {
        Self {
            kind,
            retryable,
            suggested_action: action.into(),
            matched_keywords: Vec::new(),
            confidence: 0.0,
        }
    }
}

/// 分类器
pub struct PiTurnFailureClassifier {
    /// 关键字 → (kind, retryable, action)
    rules: Vec<FailureRule>,
}

struct FailureRule {
    keywords: &'static [&'static str],
    kind: PiFailureKind,
    retryable: bool,
    action: &'static str,
    confidence: f32,
}

impl Default for PiTurnFailureClassifier {
    fn default() -> Self {
        Self::new()
    }
}

impl PiTurnFailureClassifier {
    pub fn new() -> Self {
        Self {
            rules: vec![
                // 顺序敏感：更具体的规则放前面，避免被通用词误匹配
                // "context_length" 必须排在 "token" 前面，因为 tokens 包含 "token"
                FailureRule {
                    keywords: &["context length", "context_length", "too long", "max tokens"],
                    kind: PiFailureKind::ContextOverflow,
                    retryable: false,
                    action: "上下文超长，请新建会话或使用 /compact",
                    confidence: 0.9,
                },
                FailureRule {
                    keywords: &["unauthorized", "401", "auth", "login required", "session expired"],
                    kind: PiFailureKind::Authentication,
                    retryable: false,
                    action: "请重新登录 Pi（Settings → 登录 Pi）",
                    confidence: 0.95,
                },
                FailureRule {
                    keywords: &["token expired", "invalid_token", "access_token"],
                    kind: PiFailureKind::Authentication,
                    retryable: false,
                    action: "Token 失效，请重新登录 Pi",
                    confidence: 0.95,
                },
                FailureRule {
                    keywords: &["model not found", "unknown model", "invalid model"],
                    kind: PiFailureKind::ModelNotFound,
                    retryable: false,
                    action: "请在模型列表中选择其他模型",
                    confidence: 0.9,
                },
                FailureRule {
                    keywords: &["rate limit", "429", "quota", "too many requests"],
                    kind: PiFailureKind::RateLimited,
                    retryable: true,
                    action: "已触发限流，10 秒后自动重试",
                    confidence: 0.85,
                },
                FailureRule {
                    keywords: &["server error", "500", "502", "503", "504", "internal"],
                    kind: PiFailureKind::ServerError,
                    retryable: true,
                    action: "Pi 服务端异常，将在 5 秒后重试",
                    confidence: 0.7,
                },
                FailureRule {
                    keywords: &["cancel", "aborted", "user interrupted", "esc pressed"],
                    kind: PiFailureKind::UserAbort,
                    retryable: false,
                    action: "用户中止，无需重试",
                    confidence: 0.95,
                },
                FailureRule {
                    keywords: &["network", "connection", "timeout", "econnrefused", "reset"],
                    kind: PiFailureKind::Network,
                    retryable: true,
                    action: "网络异常，将在 3 秒后重试",
                    confidence: 0.8,
                },
            ],
        }
    }

    /// 分类一个错误消息
    pub fn classify(&self, error_message: &str) -> PiFailureDiagnosis {
        let lower = error_message.to_lowercase();
        let mut best: Option<PiFailureDiagnosis> = None;
        for rule in &self.rules {
            let mut matched = Vec::new();
            for kw in rule.keywords {
                if lower.contains(kw) {
                    matched.push((*kw).to_string());
                }
            }
            if matched.is_empty() {
                continue;
            }
            let mut diag = PiFailureDiagnosis::new(rule.kind, rule.retryable, rule.action);
            diag.matched_keywords = matched;
            diag.confidence = rule.confidence;
            match &best {
                None => best = Some(diag),
                Some(current) if diag.confidence > current.confidence => best = Some(diag),
                _ => {}
            }
        }
        best.unwrap_or_else(|| {
            let mut d = PiFailureDiagnosis::new(
                PiFailureKind::Unknown,
                false,
                "未识别的失败，请查看日志或反馈问题",
            );
            d.confidence = 0.0;
            d
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classify_auth_failure() {
        let c = PiTurnFailureClassifier::new();
        let d = c.classify("Error 401: Unauthorized. Token expired.");
        assert_eq!(d.kind, PiFailureKind::Authentication);
        assert!(!d.retryable);
        assert!(d.confidence > 0.9);
        assert!(d.matched_keywords.contains(&"401".to_string()));
    }

    #[test]
    fn classify_context_overflow() {
        let c = PiTurnFailureClassifier::new();
        let d = c.classify("context_length_exceeded: max tokens = 8000");
        assert_eq!(d.kind, PiFailureKind::ContextOverflow);
    }

    #[test]
    fn classify_rate_limit_retryable() {
        let c = PiTurnFailureClassifier::new();
        let d = c.classify("429 Too Many Requests (rate limit exceeded)");
        assert_eq!(d.kind, PiFailureKind::RateLimited);
        assert!(d.retryable);
    }

    #[test]
    fn classify_unknown_message() {
        let c = PiTurnFailureClassifier::new();
        let d = c.classify("some weird edge case that no rule matches");
        assert_eq!(d.kind, PiFailureKind::Unknown);
        assert_eq!(d.confidence, 0.0);
    }

    #[test]
    fn classify_user_abort() {
        let c = PiTurnFailureClassifier::new();
        let d = c.classify("turn aborted by user (esc pressed)");
        assert_eq!(d.kind, PiFailureKind::UserAbort);
    }
}
