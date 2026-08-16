//! # 语音文本润色模块
//!
//! 提供语音转文字后的智能润色功能，包括：
//! - 去除口语化表达（"嗯"、"啊"、"那个"等）
//! - 修正语法错误
//! - 添加结构化提示词
//! - 优化句子结构

use serde::{Deserialize, Serialize};

/// 润色配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolishConfig {
    /// 是否启用润色
    pub enabled: bool,
    /// 是否去除口语化表达
    pub remove_filler_words: bool,
    /// 是否修正语法
    pub fix_grammar: bool,
    /// 是否添加结构化提示词
    pub add_structure: bool,
    /// 目标语言（zh/en）
    pub target_language: String,
}

impl Default for PolishConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            remove_filler_words: true,
            fix_grammar: true,
            add_structure: false,
            target_language: "zh".to_string(),
        }
    }
}

/// 润色结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolishResult {
    /// 润色后的文本
    pub text: String,
    /// 应用的润色规则数量
    pub applied_rules: Vec<String>,
    /// 原始文本长度
    pub original_length: usize,
    /// 润色后文本长度
    pub polished_length: usize,
}

/// 中文口语填充词
const CHINESE_FILLER_WORDS: &[&str] = &[
    "嗯", "啊", "那个", "这个", "就是", "然后", "所以", "其实",
    "吧", "呢", "嘛", "呀", "哦", "呃", "唔",
];

/// 英文口语填充词
const ENGLISH_FILLER_WORDS: &[&str] = &[
    "um", "uh", "like", "you know", "so", "actually", "basically",
    "well", "I mean", "right", "okay", "hmm",
];

/// 语音文本润色器
pub struct VoiceTextPolisher {
    config: PolishConfig,
}

impl VoiceTextPolisher {
    /// 创建新的润色器
    pub fn new(config: PolishConfig) -> Self {
        Self { config }
    }

    /// 润色语音文本
    pub fn polish(&self, text: &str) -> PolishResult {
        if !self.config.enabled {
            return PolishResult {
                text: text.to_string(),
                applied_rules: vec![],
                original_length: text.len(),
                polished_length: text.len(),
            };
        }

        let mut result = text.to_string();
        let mut applied_rules = Vec::new();

        // 1. 去除口语化表达
        if self.config.remove_filler_words {
            let (cleaned, rules) = self.remove_filler_words(&result);
            result = cleaned;
            applied_rules.extend(rules);
        }

        // 2. 修正语法
        if self.config.fix_grammar {
            let (fixed, rules) = self.fix_grammar(&result);
            result = fixed;
            applied_rules.extend(rules);
        }

        // 3. 添加结构化提示词
        if self.config.add_structure {
            let (structured, rules) = self.add_structure(&result);
            result = structured;
            applied_rules.extend(rules);
        }

        // 4. 清理多余空白
        result = self.clean_whitespace(&result);

        let polished_length = result.len();
        PolishResult {
            text: result,
            applied_rules,
            original_length: text.len(),
            polished_length,
        }
    }

    /// 去除口语化表达
    fn remove_filler_words(&self, text: &str) -> (String, Vec<String>) {
        let mut result = text.to_string();
        let mut rules = Vec::new();

        let filler_words = if self.config.target_language == "zh" {
            CHINESE_FILLER_WORDS
        } else {
            ENGLISH_FILLER_WORDS
        };

        let mut removed_count = 0;
        for word in filler_words {
            if result.contains(word) {
                // 使用正则表达式去除填充词及其周围的空白
                let pattern = format!(r"\s*{}\s*", regex::escape(word));
                if let Ok(re) = regex::Regex::new(&pattern) {
                    let new_result = re.replace_all(&result, " ").to_string();
                    if new_result != result {
                        removed_count += 1;
                        result = new_result;
                    }
                }
            }
        }

        if removed_count > 0 {
            rules.push(format!("removed_{}_filler_words", removed_count));
        }

        (result, rules)
    }

    /// 修正语法
    fn fix_grammar(&self, text: &str) -> (String, Vec<String>) {
        let mut result = text.to_string();
        let mut rules = Vec::new();

        // 1. 修正重复的标点符号
        // 用手动字符扫描而非 regex 反向引用（regex crate 不支持 backreference）。
        // 同时兼容中文全角（。！？）与半角（.!?）标点。
        let deduped = dedup_consecutive_punctuation(&result);
        if deduped != result {
            rules.push("fixed_duplicate_punctuation".to_string());
            result = deduped;
        }

        // 2. 修正句首大写（英文）
        if self.config.target_language == "en" {
            let pattern = r"(?m)^([a-z])";
            if let Ok(re) = regex::Regex::new(pattern) {
                let new_result = re.replace_all(&result, |caps: &regex::Captures| {
                    caps[1].to_uppercase()
                }).to_string();
                if new_result != result {
                    rules.push("fixed_sentence_capitalization".to_string());
                    result = new_result;
                }
            }
        }

        // 3. 修正多余的逗号
        let pattern = r",\s*,";
        if let Ok(re) = regex_lite::Regex::new(pattern) {
            let new_result = re.replace_all(&result, ",").to_string();
            if new_result != result {
                rules.push("fixed_duplicate_commas".to_string());
                result = new_result;
            }
        }

        (result, rules)
    }

    /// 添加结构化提示词
    fn add_structure(&self, text: &str) -> (String, Vec<String>) {
        let mut result = text.to_string();
        let mut rules = Vec::new();

        // 检测是否是命令式语句
        let command_indicators = if self.config.target_language == "zh" {
            vec!["请", "帮我", "给我", "创建", "生成", "写", "做"]
        } else {
            vec!["please", "create", "generate", "write", "make", "do"]
        };

        let is_command = command_indicators.iter().any(|&indicator| {
            result.to_lowercase().contains(&indicator.to_lowercase())
        });

        if is_command && !result.ends_with(['。', '！', '.', '!']) {
            // 为命令式语句添加句号
            result.push(if self.config.target_language == "zh" { '。' } else { '.' });
            rules.push("added_terminal_punctuation".to_string());
        }

        (result, rules)
    }

    /// 清理多余空白
    fn clean_whitespace(&self, text: &str) -> String {
        let mut result = text.to_string();

        // 去除首尾空白
        result = result.trim().to_string();

        // 合并多个空格为一个
        let pattern = r"  +";
        if let Ok(re) = regex_lite::Regex::new(pattern) {
            result = re.replace_all(&result, " ").to_string();
        }

        // 去除标点前的空格
        let pattern = r"\s+([。！？，,.;:!?])";
        if let Ok(re) = regex_lite::Regex::new(pattern) {
            result = re.replace_all(&result, "$1").to_string();
        }

        result
    }
}

/// 连续重复的标点合并成一个（中文全角 + ASCII 半角）
fn dedup_consecutive_punctuation(text: &str) -> String {
    const PUNCT: &[char] = &['。', '！', '？', '.', '!', '?'];
    let mut out = String::with_capacity(text.len());
    let mut prev: Option<char> = None;
    for ch in text.chars() {
        if PUNCT.contains(&ch) {
            if prev == Some(ch) {
                // 跳过重复的标点
                continue;
            }
            prev = Some(ch);
        } else {
            prev = None;
        }
        out.push(ch);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_remove_chinese_filler_words() {
        let config = PolishConfig {
            enabled: true,
            remove_filler_words: true,
            fix_grammar: false,
            add_structure: false,
            target_language: "zh".to_string(),
        };
        let polisher = VoiceTextPolisher::new(config);

        let result = polisher.polish("嗯，那个，请帮我写一个函数");
        assert!(!result.text.contains("嗯"));
        assert!(!result.text.contains("那个"));
        assert!(result.applied_rules.iter().any(|r| r.contains("filler_words")));
    }

    #[test]
    fn test_remove_english_filler_words() {
        let config = PolishConfig {
            enabled: true,
            remove_filler_words: true,
            fix_grammar: false,
            add_structure: false,
            target_language: "en".to_string(),
        };
        let polisher = VoiceTextPolisher::new(config);

        let result = polisher.polish("um, like, please create a function");
        assert!(!result.text.contains("um"));
        assert!(!result.text.contains("like"));
        assert!(result.applied_rules.iter().any(|r| r.contains("filler_words")));
    }

    #[test]
    fn test_fix_grammar() {
        let config = PolishConfig {
            enabled: true,
            remove_filler_words: false,
            fix_grammar: true,
            add_structure: false,
            target_language: "zh".to_string(),
        };
        let polisher = VoiceTextPolisher::new(config);

        let result = polisher.polish("请帮我写一个函数。。。");
        assert_eq!(result.text, "请帮我写一个函数。");
        assert!(result.applied_rules.iter().any(|r| r.contains("punctuation")));
    }

    #[test]
    fn test_disabled_polish() {
        let config = PolishConfig {
            enabled: false,
            remove_filler_words: true,
            fix_grammar: true,
            add_structure: true,
            target_language: "zh".to_string(),
        };
        let polisher = VoiceTextPolisher::new(config);

        let original = "嗯，请帮我写一个函数。。。";
        let result = polisher.polish(original);
        assert_eq!(result.text, original);
        assert!(result.applied_rules.is_empty());
    }
}
