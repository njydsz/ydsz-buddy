//! # 模糊搜索
//!
//! 借鉴 Zed 的 nucleo 和 VS Code 的 fuzzy matching，
//! 实现轻量级模糊匹配算法。
//!
//! ## 特性
//!
//! - **子序列匹配**：查询字符按顺序出现即可
//! - **连续匹配优先**：连续字符匹配得分更高
//! - **首字符匹配加分**：单词开头匹配得分更高
//! - **大小写不敏感**：默认忽略大小写
//! - **高亮信息**：返回匹配位置用于 UI 高亮

use serde::{Deserialize, Serialize};

/// 模糊匹配结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FuzzyMatchResult {
    /// 匹配的文本
    pub text: String,
    /// 匹配分数（越高越好）
    pub score: i32,
    /// 匹配的字符位置索引（用于高亮）
    pub matched_indices: Vec<usize>,
}

/// 模糊匹配选项
#[derive(Debug, Clone, Default)]
pub struct FuzzyMatchOptions {
    /// 是否大小写敏感
    pub case_sensitive: bool,
    /// 最小分数阈值
    pub min_score: i32,
}

impl FuzzyMatchOptions {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn case_sensitive(mut self) -> Self {
        self.case_sensitive = true;
        self
    }

    pub fn min_score(mut self, score: i32) -> Self {
        self.min_score = score;
        self
    }
}

/// 对单个文本进行模糊匹配
///
/// 返回 None 表示不匹配。
pub fn fuzzy_match(
    query: &str,
    text: &str,
    options: &FuzzyMatchOptions,
) -> Option<FuzzyMatchResult> {
    if query.is_empty() {
        return Some(FuzzyMatchResult {
            text: text.to_string(),
            score: 0,
            matched_indices: vec![],
        });
    }

    let query_chars: Vec<char> = if options.case_sensitive {
        query.chars().collect()
    } else {
        query.to_lowercase().chars().collect()
    };

    let text_chars: Vec<char> = text.chars().collect();
    let text_lower: Vec<char> = if options.case_sensitive {
        text_chars.clone()
    } else {
        text.to_lowercase().chars().collect()
    };

    if query_chars.len() > text_lower.len() {
        return None;
    }

    // 子序列匹配 + 评分
    let mut matched_indices = Vec::new();
    let mut qi = 0;
    let mut score: i32 = 0;
    let mut prev_match = false;

    for (ti, tc) in text_lower.iter().enumerate() {
        if qi >= query_chars.len() {
            break;
        }

        if tc == &query_chars[qi] {
            matched_indices.push(ti);

            // 基础分数
            score += 1;

            // 连续匹配加分
            if prev_match {
                score += 5;
            }

            // 单词首字符加分
            if ti == 0 || is_word_boundary(text_chars.get(ti - 1).copied().unwrap_or(' ')) {
                score += 10;
            }

            // 路径分隔符后加分
            if ti > 0 && text_chars.get(ti - 1) == Some(&'/') {
                score += 8;
            }

            prev_match = true;
            qi += 1;
        } else {
            prev_match = false;
        }
    }

    // 没有匹配完所有查询字符
    if qi < query_chars.len() {
        return None;
    }

    // 完全匹配加分
    if matched_indices.len() == text_chars.len() && query_chars.len() == text_chars.len() {
        score += 50;
    }

    // 前缀匹配加分
    if matched_indices.first() == Some(&0) {
        score += 15;
    }

    if score < options.min_score {
        return None;
    }

    Some(FuzzyMatchResult {
        text: text.to_string(),
        score,
        matched_indices,
    })
}

/// 批量模糊匹配，返回按分数降序排列的结果
pub fn fuzzy_match_many(
    query: &str,
    texts: &[&str],
    options: &FuzzyMatchOptions,
) -> Vec<FuzzyMatchResult> {
    let mut results: Vec<FuzzyMatchResult> = texts
        .iter()
        .filter_map(|&text| fuzzy_match(query, text, options))
        .collect();

    // 按分数降序排列
    results.sort_by(|a, b| b.score.cmp(&a.score));
    results
}

/// 判断字符是否为单词边界
fn is_word_boundary(c: char) -> bool {
    c == ' ' || c == '\t' || c == '/' || c == '\\' || c == '_' || c == '-'
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exact_match() {
        let result = fuzzy_match("hello", "hello", &FuzzyMatchOptions::default()).unwrap();
        assert!(result.score > 50);
        assert_eq!(result.matched_indices.len(), 5);
    }

    #[test]
    fn prefix_match() {
        let result = fuzzy_match("hel", "hello", &FuzzyMatchOptions::default()).unwrap();
        assert!(result.score > 15);
        assert_eq!(result.matched_indices, vec![0, 1, 2]);
    }

    #[test]
    fn subsequence_match() {
        let result = fuzzy_match("hlo", "hello", &FuzzyMatchOptions::default()).unwrap();
        assert!(result.score > 0);
        assert_eq!(result.matched_indices, vec![0, 2, 4]);
    }

    #[test]
    fn no_match() {
        let result = fuzzy_match("xyz", "hello", &FuzzyMatchOptions::default());
        assert!(result.is_none());
    }

    #[test]
    fn case_insensitive() {
        let result = fuzzy_match("HELLO", "hello", &FuzzyMatchOptions::default()).unwrap();
        assert!(result.score > 0);
    }

    #[test]
    fn case_sensitive() {
        let opts = FuzzyMatchOptions::default().case_sensitive();
        let result = fuzzy_match("HELLO", "hello", &opts);
        assert!(result.is_none());
    }

    #[test]
    fn path_match() {
        let result = fuzzy_match("src/main", "src/main.rs", &FuzzyMatchOptions::default()).unwrap();
        assert!(result.score > 0);
    }

    #[test]
    fn word_boundary_bonus() {
        let r1 = fuzzy_match("test", "test_file", &FuzzyMatchOptions::default()).unwrap();
        let r2 = fuzzy_match("test", "xtest", &FuzzyMatchOptions::default()).unwrap();
        // 单词开头的 "test" 得分应高于中间的 "test"
        assert!(r1.score > r2.score);
    }

    #[test]
    fn many_sorted_by_score() {
        let texts = vec!["hello", "help", "world", "helicopter"];
        let results = fuzzy_match_many("hel", &texts, &FuzzyMatchOptions::default());
        assert!(results.len() >= 3);
        // 第一个结果应该是最匹配的
        assert!(results[0].score >= results[1].score);
    }

    #[test]
    fn empty_query_matches_all() {
        let result = fuzzy_match("", "anything", &FuzzyMatchOptions::default()).unwrap();
        assert_eq!(result.score, 0);
    }

    #[test]
    fn min_score_filter() {
        let opts = FuzzyMatchOptions::default().min_score(100);
        let result = fuzzy_match("h", "hello", &opts);
        // 单字符匹配分数应该不够 100
        assert!(result.is_none());
    }
}
