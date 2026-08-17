//! # 多模型并行对比 Fan-Out（P1-5）
//!
//! 同一 prompt 同时分发给多个 Provider/模型执行，对比结果选出最优。
//!
//! ## 核心概念
//!
//! - **FanOutSession**：一个 Fan-Out 会话记录（prompt、变体列表、结果、评分）
//! - **FanOutVariant**：单个模型变体的执行结果
//! - **FanOutRanker**：对结果进行排序和评分
//!
//! ## 执行流程
//!
//! 1. 定义 prompt 和模型变体列表
//! 2. 并行分发给各模型
//! 3. 收集结果
//! 4. 评分/对比
//! 5. 选出最优结果

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

// ============================================================================
// 变体结果
// ============================================================================

/// Fan-Out 变体执行结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FanOutVariantResult {
    /// 变体标签（如 "claude-opus"、"gpt-5"）
    pub label: String,
    /// 模型标识
    pub model_id: String,
    /// Provider 名称
    pub provider: String,
    /// 执行输出
    pub output: String,
    /// 执行状态
    pub status: FanOutVariantStatus,
    /// Token 使用量
    #[serde(default)]
    pub token_usage: Option<TokenUsage>,
    /// 执行耗时（毫秒）
    #[serde(default)]
    pub elapsed_ms: u64,
    /// 错误信息（失败时）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    /// 评分（0.0 - 1.0，由 ranker 计算）
    #[serde(default)]
    pub score: Option<f64>,
    /// 评分理由
    #[serde(skip_serializing_if = "Option::is_none")]
    pub score_reason: Option<String>,
}

/// 变体执行状态
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FanOutVariantStatus {
    Pending,
    Running,
    Completed,
    Failed,
    TimedOut,
}

/// Token 使用量
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenUsage {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
}

// ============================================================================
// Fan-Out 会话
// ============================================================================

/// Fan-Out 会话
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FanOutSession {
    /// 会话 ID
    pub id: String,
    /// 原始 prompt
    pub prompt: String,
    /// 变体结果
    pub variants: Vec<FanOutVariantResult>,
    /// 创建时间
    pub created_at: DateTime<Utc>,
    /// 完成时间
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<DateTime<Utc>>,
    /// 最优结果索引
    #[serde(skip_serializing_if = "Option::is_none")]
    pub best_variant_index: Option<usize>,
}

impl FanOutSession {
    /// 创建新的 Fan-Out 会话
    pub fn new(id: impl Into<String>, prompt: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            prompt: prompt.into(),
            variants: Vec::new(),
            created_at: Utc::now(),
            completed_at: None,
            best_variant_index: None,
        }
    }

    /// 添加变体结果
    pub fn add_variant(&mut self, variant: FanOutVariantResult) {
        self.variants.push(variant);
    }

    /// 是否全部完成
    pub fn all_done(&self) -> bool {
        !self.variants.is_empty()
            && self.variants.iter().all(|v| {
                matches!(
                    v.status,
                    FanOutVariantStatus::Completed
                        | FanOutVariantStatus::Failed
                        | FanOutVariantStatus::TimedOut
                )
            })
    }

    /// 获取最优结果
    pub fn best_variant(&self) -> Option<&FanOutVariantResult> {
        self.best_variant_index.and_then(|i| self.variants.get(i))
    }

    /// 获取成功的结果
    pub fn successful_variants(&self) -> Vec<&FanOutVariantResult> {
        self.variants
            .iter()
            .filter(|v| v.status == FanOutVariantStatus::Completed)
            .collect()
    }

    /// 完成会话
    pub fn finalize(&mut self) {
        self.completed_at = Some(Utc::now());
    }

    /// 生成对比摘要
    pub fn comparison_summary(&self) -> String {
        let mut lines = vec![format!(
            "📊 多模型对比结果（{} 个模型）\n",
            self.variants.len()
        )];

        for (i, v) in self.variants.iter().enumerate() {
            let score_str = v
                .score
                .map(|s| format!("{:.1}", s))
                .unwrap_or_else(|| "-".to_string());
            let status_icon = match v.status {
                FanOutVariantStatus::Completed => "✅",
                FanOutVariantStatus::Failed => "❌",
                FanOutVariantStatus::TimedOut => "⏰",
                _ => "⏳",
            };

            lines.push(format!(
                "  {}. {} {} | Score: {} | Tokens: {} | {}ms",
                i + 1,
                status_icon,
                v.label,
                score_str,
                v.token_usage.as_ref().map(|t| t.total_tokens).unwrap_or(0),
                v.elapsed_ms
            ));
        }

        if let Some(best) = self.best_variant() {
            lines.push(format!(
                "\n🏆 最优结果: {} (Score: {:.1})",
                best.label,
                best.score.unwrap_or(0.0)
            ));
        }

        lines.join("\n")
    }
}

// ============================================================================
// 评分器
// ============================================================================

/// Fan-Out 评分策略
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FanOutRankStrategy {
    /// 基于长度的评分（输出长度适中为佳）
    LengthBased,
    /// 基于代码质量的简单启发式评分
    CodeQuality,
    /// 基于响应速度评分
    SpeedBased,
    /// 综合评分
    Composite,
}

/// Fan-Out 评分器
pub struct FanOutRanker {
    strategy: FanOutRankStrategy,
}

impl FanOutRanker {
    /// 创建新的评分器
    pub fn new(strategy: FanOutRankStrategy) -> Self {
        Self { strategy }
    }

    /// 使用默认综合策略创建评分器
    pub fn default() -> Self {
        Self::new(FanOutRankStrategy::Composite)
    }

    /// 对变体结果进行评分并排序
    pub fn rank(&self, variants: &mut [FanOutVariantResult]) {
        for variant in variants.iter_mut() {
            if variant.status != FanOutVariantStatus::Completed {
                variant.score = Some(0.0);
                variant.score_reason = Some(format!("{:?}状态不参与评分", variant.status));
                continue;
            }

            let (score, reason) = match self.strategy {
                FanOutRankStrategy::LengthBased => self.score_by_length(variant),
                FanOutRankStrategy::CodeQuality => self.score_by_code_quality(variant),
                FanOutRankStrategy::SpeedBased => self.score_by_speed(variant),
                FanOutRankStrategy::Composite => self.score_composite(variant),
            };

            variant.score = Some(score);
            variant.score_reason = Some(reason);
        }

        // 按分数降序排列
        variants.sort_by(|a, b| {
            b.score
                .unwrap_or(0.0)
                .partial_cmp(&a.score.unwrap_or(0.0))
                .unwrap_or(std::cmp::Ordering::Equal)
        });
    }

    /// 基于长度的评分
    ///
    /// 评估标准：输出长度适中（不太短说明有实质内容，不冗长说明精炼）
    fn score_by_length(&self, variant: &FanOutVariantResult) -> (f64, String) {
        let len = variant.output.len();
        let score = if len < 50 {
            0.2 // 太短，可能敷衍
        } else if len < 500 {
            0.5 + (len as f64 / 500.0) * 0.3 // 500 字符内为上升趋势
        } else if len < 5000 {
            0.8 // 适中长度
        } else if len < 20000 {
            0.6 // 偏长
        } else {
            0.4 // 太长可能冗余
        };

        (score, format!("基于长度评分（{} 字符）", len))
    }

    /// 基于代码质量的简单启发式评分
    fn score_by_code_quality(&self, variant: &FanOutVariantResult) -> (f64, String) {
        let output = &variant.output;
        let mut score = 0.5_f64;

        // 包含代码块加分
        if output.contains("```") {
            score += 0.1;
        }

        // 包含解释说明加分
        if output.contains("解释") || output.contains("说明") || output.contains("因为") {
            score += 0.1;
        }

        // 包含注意事项加分
        if output.contains("注意") || output.contains("⚠️") || output.contains("警告") {
            score += 0.05;
        }

        // 包含测试相关加分
        if output.contains("test") || output.contains("测试") || output.contains("spec") {
            score += 0.1;
        }

        // 包含步骤说明加分
        if output.contains("1.") || output.contains("第一步") || output.contains("Step") {
            score += 0.05;
        }

        (score.min(1.0), "基于代码质量启发式评分".to_string())
    }

    /// 基于响应速度评分
    fn score_by_speed(&self, variant: &FanOutVariantResult) -> (f64, String) {
        let ms = variant.elapsed_ms;
        let score = if ms < 1000 {
            1.0
        } else if ms < 5000 {
            0.8
        } else if ms < 15000 {
            0.6
        } else if ms < 30000 {
            0.4
        } else {
            0.2
        };

        (score, format!("基于速度评分（{}ms）", ms))
    }

    /// 综合评分
    fn score_composite(&self, variant: &FanOutVariantResult) -> (f64, String) {
        let (length_score, _) = self.score_by_length(variant);
        let (quality_score, _) = self.score_by_code_quality(variant);
        let (speed_score, _) = self.score_by_speed(variant);

        // 加权：质量 50%，速度 30%，长度 20%
        let composite = quality_score * 0.5 + speed_score * 0.3 + length_score * 0.2;

        (
            composite,
            format!(
                "综合评分（质量{:.1} + 速度{:.1} + 长度{:.1}）",
                quality_score, speed_score, length_score
            ),
        )
    }
}

// ============================================================================
// 变体配置
// ============================================================================

/// Fan-Out 变体配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FanOutVariantConfig {
    /// 标签名称
    pub label: String,
    /// 模型 ID
    pub model_id: String,
    /// Provider 名称
    pub provider: String,
    /// 温度参数
    #[serde(default = "default_temperature")]
    pub temperature: f64,
    /// 最大 token 数
    #[serde(default = "default_max_tokens")]
    pub max_tokens: u32,
}

fn default_temperature() -> f64 {
    0.7
}

fn default_max_tokens() -> u32 {
    4096
}

impl FanOutVariantConfig {
    /// 创建新的变体配置
    pub fn new(label: impl Into<String>, model_id: impl Into<String>, provider: impl Into<String>) -> Self {
        Self {
            label: label.into(),
            model_id: model_id.into(),
            provider: provider.into(),
            temperature: default_temperature(),
            max_tokens: default_max_tokens(),
        }
    }

    /// 设置温度
    pub fn with_temperature(mut self, temp: f64) -> Self {
        self.temperature = temp.clamp(0.0, 2.0);
        self
    }

    /// 设置最大 token 数
    pub fn with_max_tokens(mut self, max: u32) -> Self {
        self.max_tokens = max;
        self
    }

    /// 预定义的常用组合配置
    pub fn presets() -> Vec<FanOutVariantConfig> {
        vec![
            FanOutVariantConfig::new("Claude Opus", "claude-opus-4-20250514", "anthropic")
                .with_temperature(0.7),
            FanOutVariantConfig::new("GPT-5", "gpt-5", "openai")
                .with_temperature(0.7),
            FanOutVariantConfig::new("Gemini 2.5 Pro", "gemini-2.5-pro", "google")
                .with_temperature(0.7),
            FanOutVariantConfig::new("DeepSeek V3", "deepseek-chat", "deepseek")
                .with_temperature(0.7),
        ]
    }
}

// ============================================================================
// 测试
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fanout_session_creation() {
        let session = FanOutSession::new("session-1", "Write a sorting function");
        assert_eq!(session.prompt, "Write a sorting function");
        assert_eq!(session.variants.len(), 0);
        assert!(!session.all_done());
    }

    #[test]
    fn test_fanout_add_variant() {
        let mut session = FanOutSession::new("session-1", "test");
        session.add_variant(FanOutVariantResult {
            label: "Claude".to_string(),
            model_id: "claude-opus".to_string(),
            provider: "anthropic".to_string(),
            output: "Here is the code...".to_string(),
            status: FanOutVariantStatus::Completed,
            token_usage: Some(TokenUsage {
                prompt_tokens: 100,
                completion_tokens: 200,
                total_tokens: 300,
            }),
            elapsed_ms: 1500,
            error: None,
            score: None,
            score_reason: None,
        });

        assert_eq!(session.variants.len(), 1);
    }

    #[test]
    fn test_ranker_length_based() {
        let ranker = FanOutRanker::new(FanOutRankStrategy::LengthBased);
        let mut variants = vec![
            FanOutVariantResult {
                label: "Short".to_string(),
                model_id: "a".to_string(),
                provider: "p".to_string(),
                output: "Hi".to_string(),
                status: FanOutVariantStatus::Completed,
                token_usage: None,
                elapsed_ms: 0,
                error: None,
                score: None,
                score_reason: None,
            },
            FanOutVariantResult {
                label: "Long".to_string(),
                model_id: "b".to_string(),
                provider: "p".to_string(),
                output: "a".repeat(3000),
                status: FanOutVariantStatus::Completed,
                token_usage: None,
                elapsed_ms: 0,
                error: None,
                score: None,
                score_reason: None,
            },
        ];

        ranker.rank(&mut variants);

        // 长输出的评分应该更高（在适中范围内）
        assert!(variants[0].score.unwrap() >= variants[1].score.unwrap());
    }

    #[test]
    fn test_ranker_speed_based() {
        let ranker = FanOutRanker::new(FanOutRankStrategy::SpeedBased);
        let mut variants = vec![
            FanOutVariantResult {
                label: "Fast".to_string(),
                model_id: "a".to_string(),
                provider: "p".to_string(),
                output: "output".to_string(),
                status: FanOutVariantStatus::Completed,
                token_usage: None,
                elapsed_ms: 500,
                error: None,
                score: None,
                score_reason: None,
            },
            FanOutVariantResult {
                label: "Slow".to_string(),
                model_id: "b".to_string(),
                provider: "p".to_string(),
                output: "output".to_string(),
                status: FanOutVariantStatus::Completed,
                token_usage: None,
                elapsed_ms: 20000,
                error: None,
                score: None,
                score_reason: None,
            },
        ];

        ranker.rank(&mut variants);

        assert_eq!(variants[0].label, "Fast");
        assert_eq!(variants[1].label, "Slow");
        assert!(variants[0].score.unwrap() > variants[1].score.unwrap());
    }

    #[test]
    fn test_variant_presets() {
        let presets = FanOutVariantConfig::presets();
        assert_eq!(presets.len(), 4);
        assert!(presets.iter().any(|p| p.provider == "anthropic"));
        assert!(presets.iter().any(|p| p.provider == "openai"));
        assert!(presets.iter().any(|p| p.provider == "google"));
        assert!(presets.iter().any(|p| p.provider == "deepseek"));
    }

    #[test]
    fn test_session_comparison_summary() {
        let mut session = FanOutSession::new("s1", "test prompt");
        session.add_variant(FanOutVariantResult {
            label: "A".to_string(),
            model_id: "a".to_string(),
            provider: "p".to_string(),
            output: "output A".to_string(),
            status: FanOutVariantStatus::Completed,
            token_usage: None,
            elapsed_ms: 1000,
            error: None,
            score: Some(0.8),
            score_reason: None,
        });

        let summary = session.comparison_summary();
        assert!(summary.contains("多模型对比结果"));
        assert!(summary.contains("A"));
    }
}
