//! # PR 自动评审
//!
//! 自动分析 GitHub Pull Request 的 diff，生成 AI 驱动的代码评审意见。
//!
//! ## 评审维度
//!
//! - 正确性：逻辑错误、边界条件、异常处理
//! - 安全性：注入风险、权限问题、敏感信息泄露
//! - 性能：不必要的计算、内存泄漏
//! - 可读性：命名规范、注释完整性、代码结构
//! - 最佳实践：设计模式、DRY 原则

use serde::{Deserialize, Serialize};
use tracing::info;

/// PR 评审严重级别
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReviewSeverity {
    Info,
    Suggestion,
    Warning,
    Error,
}

impl std::fmt::Display for ReviewSeverity {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Info => write!(f, "Info"),
            Self::Suggestion => write!(f, "Suggestion"),
            Self::Warning => write!(f, "Warning"),
            Self::Error => write!(f, "Error"),
        }
    }
}

/// PR 评审条目
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewItem {
    pub severity: ReviewSeverity,
    pub file: String,
    pub line: Option<u32>,
    pub comment: String,
    pub suggestion: Option<String>,
}

/// PR 评审结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrReviewResult {
    pub pr_number: u64,
    pub pr_title: String,
    pub summary: String,
    pub items: Vec<ReviewItem>,
    pub reviewed_at: chrono::DateTime<chrono::Utc>,
    pub score: u8,
    pub approve: bool,
}

/// 评审请求参数
#[derive(Debug, Clone)]
pub struct PrReviewRequest {
    pub pr_number: u64,
    pub pr_title: String,
    pub diff: String,
    pub repo_path: String,
    pub context: Option<String>,
}

/// 构建 PR 评审系统提示词
pub fn build_review_system_prompt() -> String {
    r#"You are a senior code reviewer. Analyze the following Pull Request diff and provide a comprehensive review.

Evaluate these dimensions:
1. Correctness: logic errors, edge cases, exception handling
2. Security: injection risks, permission issues, sensitive data leaks
3. Performance: unnecessary computation, memory leaks
4. Readability: naming, comments, code structure
5. Best practices: design patterns, DRY, single responsibility

Output JSON format:
{
  "summary": "Overall assessment (1-3 sentences)",
  "score": 85,
  "approve": true,
  "items": [
    {
      "severity": "warning",
      "file": "src/main.rs",
      "line": 42,
      "comment": "None case not handled",
      "suggestion": "Use ok_or_else to return an error"
    }
  ]
}

Rules:
- severity values: info / suggestion / warning / error
- Only report meaningful findings
- suggestion is optional
- score: 0-100 (70+ = approve)
- Be constructive and specific"#.to_string()
}

/// 构建用户消息（包含 diff）
pub fn build_review_user_prompt(request: &PrReviewRequest) -> String {
    let mut prompt = format!(
        "## Pull Request #{}: {}\n\n```diff\n{}\n```",
        request.pr_number, request.pr_title, request.diff
    );
    if let Some(ctx) = &request.context {
        prompt.push_str(&format!("\n\n## Additional Context\n{}", ctx));
    }
    prompt
}

/// 从 LLM 响应文本解析评审结果
pub fn parse_review_response(
    response: &str,
    pr_number: u64,
    pr_title: &str,
) -> Result<PrReviewResult, String> {
    // 尝试从响应中提取 JSON
    let json_str = extract_json_from_response(response)?;
    let parsed: serde_json::Value = serde_json::from_str(&json_str)
        .map_err(|e| format!("JSON 解析失败: {}", e))?;

    let summary = parsed
        .get("summary")
        .and_then(|v| v.as_str())
        .unwrap_or("评审完成")
        .to_string();

    let score = parsed
        .get("score")
        .and_then(|v| v.as_u64())
        .unwrap_or(70) as u8;

    let approve = parsed
        .get("approve")
        .and_then(|v| v.as_bool())
        .unwrap_or(score >= 70);

    let items: Vec<ReviewItem> = parsed
        .get("items")
        .and_then(|v| v.as_array())
        .map(|arr: &Vec<serde_json::Value>| {
            arr.iter()
                .filter_map(|item| {
                    let severity_str = item.get("severity")?.as_str()?;
                    let severity = match severity_str {
                        "info" => ReviewSeverity::Info,
                        "suggestion" => ReviewSeverity::Suggestion,
                        "warning" => ReviewSeverity::Warning,
                        "error" => ReviewSeverity::Error,
                        _ => return None,
                    };
                    Some(ReviewItem {
                        severity,
                        file: item.get("file")?.as_str()?.to_string(),
                        line: item.get("line").and_then(|v| v.as_u64()).map(|n| n as u32),
                        comment: item.get("comment")?.as_str()?.to_string(),
                        suggestion: item.get("suggestion").and_then(|v| v.as_str()).map(|s| s.to_string()),
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    info!(pr_number, items = items.len(), score, approve, "PR 评审解析完成");

    Ok(PrReviewResult {
        pr_number,
        pr_title: pr_title.to_string(),
        summary,
        items,
        reviewed_at: chrono::Utc::now(),
        score,
        approve,
    })
}

/// 从 LLM 响应中提取 JSON（可能被包裹在 markdown 代码块中）
fn extract_json_from_response(response: &str) -> Result<String, String> {
    let trimmed = response.trim();

    // 尝试直接解析
    if trimmed.starts_with('{') {
        return Ok(trimmed.to_string());
    }

    // 尝试从 ```json ... ``` 中提取
    if let Some(start) = trimmed.find("```json") {
        let after = &trimmed[start + 7..];
        if let Some(end) = after.find("```") {
            return Ok(after[..end].trim().to_string());
        }
    }

    // 尝试从 ``` ... ``` 中提取
    if let Some(start) = trimmed.find("```") {
        let after = &trimmed[start + 3..];
        if let Some(end) = after.find("```") {
            let inner = after[..end].trim();
            if inner.starts_with('{') {
                return Ok(inner.to_string());
            }
        }
    }

    // 尝试找到第一个 { 和最后一个 }
    if let Some(start) = trimmed.find('{') {
        if let Some(end) = trimmed.rfind('}') {
            if end > start {
                return Ok(trimmed[start..=end].to_string());
            }
        }
    }

    Err(format!("无法从响应中提取 JSON: {}", &response[..response.len().min(200)]))
}

/// 将评审结果格式化为 Markdown 评论
pub fn format_review_as_comment(result: &PrReviewResult) -> String {
    let mut md = String::new();

    md.push_str(&format!("## 🤖 AI Code Review\n\n"));
    md.push_str(&format!("**Score: {}/100** | ", result.score));
    md.push_str(&format!("**Verdict: {}**\n\n", if result.approve { "✅ Approve" } else { "❌ Request Changes" }));
    md.push_str(&format!("{}\n\n", result.summary));

    if result.items.is_empty() {
        md.push_str("No issues found. Great work! 🎉\n");
    } else {
        md.push_str("### Findings\n\n");
        for item in &result.items {
            md.push_str(&format!(
                "- **{}** `{}`",
                item.severity, item.file
            ));
            if let Some(line) = item.line {
                md.push_str(&format!(":{}", line));
            }
            md.push_str(&format!(" — {}\n", item.comment));
            if let Some(suggestion) = &item.suggestion {
                md.push_str(&format!("  - 💡 Suggestion: {}\n", suggestion));
            }
        }
    }

    md.push_str(&format!(
        "\n---\n*Reviewed by ydsz-buddy at {}*",
        result.reviewed_at.format("%Y-%m-%d %H:%M UTC")
    ));

    md
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_review_response() {
        let json = r#"```json
        {
          "summary": "Good PR with minor issues",
          "score": 85,
          "approve": true,
          "items": [
            {
              "severity": "warning",
              "file": "src/main.rs",
              "line": 42,
              "comment": "None case not handled",
              "suggestion": "Use ok_or_else"
            },
            {
              "severity": "info",
              "file": "src/lib.rs",
              "line": null,
              "comment": "Consider adding docs",
              "suggestion": null
            }
          ]
        }
        ```"#;

        let result = parse_review_response(json, 42, "Test PR").unwrap();
        assert_eq!(result.pr_number, 42);
        assert_eq!(result.score, 85);
        assert!(result.approve);
        assert_eq!(result.items.len(), 2);
        assert_eq!(result.items[0].severity, ReviewSeverity::Warning);
        assert_eq!(result.items[0].file, "src/main.rs");
        assert_eq!(result.items[0].line, Some(42));
    }

    #[test]
    fn test_parse_raw_json() {
        let json = r#"{"summary":"OK","score":90,"approve":true,"items":[]}"#;
        let result = parse_review_response(json, 1, "Test").unwrap();
        assert_eq!(result.score, 90);
        assert!(result.items.is_empty());
    }

    #[test]
    fn test_format_comment() {
        let result = PrReviewResult {
            pr_number: 42,
            pr_title: "Test PR".into(),
            summary: "Looks good".into(),
            items: vec![ReviewItem {
                severity: ReviewSeverity::Warning,
                file: "src/main.rs".into(),
                line: Some(10),
                comment: "Fix this".into(),
                suggestion: Some("Use unwrap_or".into()),
            }],
            reviewed_at: chrono::Utc::now(),
            score: 80,
            approve: true,
        };

        let comment = format_review_as_comment(&result);
        assert!(comment.contains("Score: 80/100"));
        assert!(comment.contains("Approve"));
        assert!(comment.contains("Fix this"));
        assert!(comment.contains("unwrap_or"));
    }

    #[test]
    fn test_build_prompts() {
        let request = PrReviewRequest {
            pr_number: 1,
            pr_title: "Test".into(),
            diff: "+fn hello() {}".into(),
            repo_path: "/tmp".into(),
            context: Some("First PR".into()),
        };

        let system = build_review_system_prompt();
        assert!(system.contains("code reviewer"));

        let user = build_review_user_prompt(&request);
        assert!(user.contains("Pull Request #1"));
        assert!(user.contains("Test"));
        assert!(user.contains("hello()"));
        assert!(user.contains("First PR"));
    }
}
