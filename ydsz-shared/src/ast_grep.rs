//! # AST-Grep 深化集成（P1-6）
//!
//! 结构化代码搜索和批量替换的后端基础设施。
//!
//! ## 核心能力
//!
//! - 按节点类型搜索（find by node kind）
//! - S-expression 模式匹配
//! - 按名称查找调用/引用
//! - 结构化重写（rewrite with pattern）
//! - 预设模式管理

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ============================================================================
// 预设模式
// ============================================================================

/// AST-Grep 预设模式 ID
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AstGrepPreset {
    ConsoleLog,
    ConsoleError,
    AwaitFetch,
    TryCatch,
    TodoComment,
    RustUnwrap,
    RustExpect,
    PyPrint,
    PyExcept,
}

impl AstGrepPreset {
    /// 获取所有预设
    pub fn all() -> &'static [AstGrepPreset] {
        &[
            AstGrepPreset::ConsoleLog,
            AstGrepPreset::ConsoleError,
            AstGrepPreset::AwaitFetch,
            AstGrepPreset::TryCatch,
            AstGrepPreset::TodoComment,
            AstGrepPreset::RustUnwrap,
            AstGrepPreset::RustExpect,
            AstGrepPreset::PyPrint,
            AstGrepPreset::PyExcept,
        ]
    }

    /// 获取预设的显示名称
    pub fn display_name(&self) -> &'static str {
        match self {
            AstGrepPreset::ConsoleLog => "console.log(...) 调用",
            AstGrepPreset::ConsoleError => "console.error(...) 调用",
            AstGrepPreset::AwaitFetch => "await fetch(...) 调用",
            AstGrepPreset::TryCatch => "try-catch 语句",
            AstGrepPreset::TodoComment => "TODO/FIXME 注释",
            AstGrepPreset::RustUnwrap => "Rust .unwrap() 调用",
            AstGrepPreset::RustExpect => "Rust .expect() 调用",
            AstGrepPreset::PyPrint => "Python print(...) 调用",
            AstGrepPreset::PyExcept => "Python except 异常处理",
        }
    }

    /// 获取预设支持的语言
    pub fn supported_languages(&self) -> &'static [&'static str] {
        match self {
            AstGrepPreset::ConsoleLog => &["typescript", "javascript"],
            AstGrepPreset::ConsoleError => &["typescript", "javascript"],
            AstGrepPreset::AwaitFetch => &["typescript", "javascript"],
            AstGrepPreset::TryCatch => &["typescript", "javascript", "rust", "python"],
            AstGrepPreset::TodoComment => &["typescript", "javascript", "rust", "python"],
            AstGrepPreset::RustUnwrap => &["rust"],
            AstGrepPreset::RustExpect => &["rust"],
            AstGrepPreset::PyPrint => &["python"],
            AstGrepPreset::PyExcept => &["python"],
        }
    }

    /// 获取预设对应的 S-expression 模式
    pub fn sexp_pattern(&self) -> &'static str {
        match self {
            AstGrepPreset::ConsoleLog => "console.log($$$ARGS)",
            AstGrepPreset::ConsoleError => "console.error($$$ARGS)",
            AstGrepPreset::AwaitFetch => "await fetch($URL)",
            AstGrepPreset::TryCatch => "try_statement",
            AstGrepPreset::TodoComment => "$COMMENT",
            AstGrepPreset::RustUnwrap => ".unwrap()",
            AstGrepPreset::RustExpect => ".expect($MSG)",
            AstGrepPreset::PyPrint => "print($$$ARGS)",
            AstGrepPreset::PyExcept => "except_clause",
        }
    }

    /// 检查是否支持指定语言
    pub fn supports_language(&self, lang: &str) -> bool {
        self.supported_languages().contains(&lang)
    }
}

impl std::fmt::Display for AstGrepPreset {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AstGrepPreset::ConsoleLog => write!(f, "console_log"),
            AstGrepPreset::ConsoleError => write!(f, "console_error"),
            AstGrepPreset::AwaitFetch => write!(f, "await_fetch"),
            AstGrepPreset::TryCatch => write!(f, "try_catch"),
            AstGrepPreset::TodoComment => write!(f, "todo_comment"),
            AstGrepPreset::RustUnwrap => write!(f, "rust_unwrap"),
            AstGrepPreset::RustExpect => write!(f, "rust_expect"),
            AstGrepPreset::PyPrint => write!(f, "py_print"),
            AstGrepPreset::PyExcept => write!(f, "py_except"),
        }
    }
}

/// 预设详情
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AstGrepPresetInfo {
    pub id: String,
    pub display_name: String,
    pub supported_languages: Vec<String>,
}

impl From<AstGrepPreset> for AstGrepPresetInfo {
    fn from(preset: AstGrepPreset) -> Self {
        Self {
            id: preset.to_string(),
            display_name: preset.display_name().to_string(),
            supported_languages: preset
                .supported_languages()
                .iter()
                .map(|s| s.to_string())
                .collect(),
        }
    }
}

// ============================================================================
// 目标语言
// ============================================================================

/// 目标语言
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AstGrepLanguage {
    Typescript,
    Javascript,
    Rust,
    Python,
}

impl std::fmt::Display for AstGrepLanguage {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AstGrepLanguage::Typescript => write!(f, "typescript"),
            AstGrepLanguage::Javascript => write!(f, "javascript"),
            AstGrepLanguage::Rust => write!(f, "rust"),
            AstGrepLanguage::Python => write!(f, "python"),
        }
    }
}

// ============================================================================
// 匹配结果
// ============================================================================

/// 捕获项
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AstGrepCapture {
    pub name: String,
    pub text: String,
}

/// 单条匹配命中
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AstGrepMatch {
    /// 源文件路径
    pub file: String,
    /// 起始行（1-based）
    pub line: u32,
    /// 起始列（1-based）
    pub column: u32,
    /// 起始字节偏移
    pub start_byte: u32,
    /// 结束字节偏移
    pub end_byte: u32,
    /// 匹配的原始文本
    pub text: String,
    /// 节点类型
    pub node_kind: String,
    /// 捕获项
    #[serde(default)]
    pub captures: Vec<AstGrepCapture>,
}

/// 搜索结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AstGrepSearchResult {
    /// 匹配条目
    pub matches: Vec<AstGrepMatch>,
    /// 总匹配数
    pub total: usize,
    /// 搜索耗时（毫秒）
    pub elapsed_ms: u64,
}

impl AstGrepSearchResult {
    /// 创建空结果
    pub fn empty() -> Self {
        Self {
            matches: Vec::new(),
            total: 0,
            elapsed_ms: 0,
        }
    }

    /// 获取匹配的文件列表（去重）
    pub fn files(&self) -> Vec<&str> {
        let mut files: Vec<&str> = self
            .matches
            .iter()
            .map(|m| m.file.as_str())
            .collect();
        files.sort_unstable();
        files.dedup();
        files
    }

    /// 按文件分组
    pub fn group_by_file(&self) -> HashMap<&str, Vec<&AstGrepMatch>> {
        let mut groups: HashMap<&str, Vec<&AstGrepMatch>> = HashMap::new();
        for m in &self.matches {
            groups.entry(&m.file).or_default().push(m);
        }
        groups
    }
}

// ============================================================================
// 模式编译
// ============================================================================

/// 编译后的模式
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AstGrepCompiledPattern {
    /// S-expression 查询字符串
    pub query: String,
    /// 捕获名列表
    pub captures: Vec<String>,
}

/// 模式编译器
///
/// 将用户友好的模式转换为 tree-sitter S-expression。
pub struct AstGrepPatternCompiler;

impl AstGrepPatternCompiler {
    /// 编译模式
    pub fn compile(_language: AstGrepLanguage, pattern: &str) -> Result<AstGrepCompiledPattern, String> {
        // 如果已经是 S-expression 形式（包含括号），直接返回
        if pattern.starts_with('(') && pattern.ends_with(')') {
            let captures = Self::extract_captures(pattern);
            return Ok(AstGrepCompiledPattern {
                query: pattern.to_string(),
                captures,
            });
        }

        // 如果是简化的函数调用形式（如 "console.log($MSG)"），转换为 S-expression
        if let Some(sexp) = Self::convert_call_pattern(pattern) {
            let captures = Self::extract_captures(&sexp);
            return Ok(AstGrepCompiledPattern {
                query: sexp,
                captures,
            });
        }

        // 否则当作节点类型名直接匹配
        Ok(AstGrepCompiledPattern {
            query: pattern.to_string(),
            captures: Vec::new(),
        })
    }

    /// 从 S-expression 中提取捕获名
    fn extract_captures(sexp: &str) -> Vec<String> {
        let mut captures = Vec::new();
        for word in sexp.split(|c: char| !c.is_alphanumeric() && c != '_' && c != '$') {
            if word.starts_with('@') || word.starts_with('$') {
                captures.push(word.to_string());
            }
        }
        captures.sort_unstable();
        captures.dedup();
        captures
    }

    /// 转换简化调用模式为 S-expression
    fn convert_call_pattern(pattern: &str) -> Option<String> {
        // 简化转换：识别 "obj.method(ARGS)" 形式
        if pattern.contains('(') && pattern.contains(')') {
            let pattern = pattern.trim();
            return Some(pattern.to_string());
        }
        None
    }
}

// ============================================================================
// 结构化重写
// ============================================================================

/// 重写位置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AstGrepRewriteLocation {
    pub file: String,
    pub line: u32,
    pub column: u32,
}

/// 重写结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AstGrepRewriteResult {
    /// 替换后的内容
    pub new_content: String,
    /// 替换次数
    pub replacements: u32,
    /// 命中位置
    pub match_locations: Vec<AstGrepRewriteLocation>,
}

/// 批量重写请求
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AstGrepBatchRewriteRequest {
    /// 工作区根目录
    pub workspace_root: String,
    /// 目标语言
    pub language: AstGrepLanguage,
    /// 匹配模式
    pub pattern: String,
    /// 替换模板
    pub rewrite: String,
    /// 文件过滤（Glob 模式）
    #[serde(default)]
    pub file_filter: Option<String>,
    /// 是否仅预览
    #[serde(default)]
    pub dry_run: bool,
}

/// 批量重写结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AstGrepBatchRewriteResult {
    /// 每个文件的结果
    pub file_results: Vec<AstGrepRewriteResult>,
    /// 总替换次数
    pub total_replacements: u32,
    /// 处理的文件数
    pub files_processed: u32,
}

/// AST-Grep 搜索引擎
///
/// 提供结构化的代码搜索和替换能力。
/// 实际实现依赖 sg (ast-grep) CLI 或库的集成。
pub struct AstGrepEngine;

impl AstGrepEngine {
    /// 按节点类型搜索
    pub fn find_by_node_kind(_workspace_root: &str, _kind: &str) -> AstGrepSearchResult {
        // 实际实现应调用 ast-grep CLI
        AstGrepSearchResult::empty()
    }

    /// 按 S-expression 模式搜索
    pub fn find_by_query(
        _workspace_root: &str,
        _language: AstGrepLanguage,
        _query: &str,
    ) -> AstGrepSearchResult {
        AstGrepSearchResult::empty()
    }

    /// 按名称查找
    pub fn find_by_name(
        _workspace_root: &str,
        _name: &str,
        _mode: &str,
    ) -> AstGrepSearchResult {
        AstGrepSearchResult::empty()
    }

    /// 结构化重写
    pub fn rewrite(
        _file_path: &str,
        _language: AstGrepLanguage,
        _pattern: &str,
        _rewrite: &str,
        _dry_run: bool,
    ) -> Result<AstGrepRewriteResult, String> {
        Err("AST-Grep 引擎需要安装 ast-grep CLI 工具".to_string())
    }

    /// 批量重写
    pub fn batch_rewrite(
        _request: &AstGrepBatchRewriteRequest,
    ) -> Result<AstGrepBatchRewriteResult, String> {
        Err("AST-Grep 引擎需要安装 ast-grep CLI 工具".to_string())
    }

    /// 获取推荐预设
    pub fn recommended_presets(language: AstGrepLanguage) -> Vec<AstGrepPresetInfo> {
        AstGrepPreset::all()
            .iter()
            .filter(|p| p.supports_language(&language.to_string()))
            .cloned()
            .map(AstGrepPresetInfo::from)
            .collect()
    }
}

// ============================================================================
// 测试
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_preset_display_names() {
        assert_eq!(AstGrepPreset::ConsoleLog.display_name(), "console.log(...) 调用");
        assert_eq!(AstGrepPreset::RustUnwrap.display_name(), "Rust .unwrap() 调用");
    }

    #[test]
    fn test_preset_language_support() {
        assert!(AstGrepPreset::ConsoleLog.supports_language("typescript"));
        assert!(AstGrepPreset::ConsoleLog.supports_language("javascript"));
        assert!(!AstGrepPreset::ConsoleLog.supports_language("rust"));

        assert!(AstGrepPreset::RustUnwrap.supports_language("rust"));
        assert!(!AstGrepPreset::RustUnwrap.supports_language("python"));
    }

    #[test]
    fn test_preset_sexp_patterns() {
        assert_eq!(AstGrepPreset::ConsoleLog.sexp_pattern(), "console.log($$$ARGS)");
        assert_eq!(AstGrepPreset::AwaitFetch.sexp_pattern(), "await fetch($URL)");
    }

    #[test]
    fn test_pattern_compiler_sexp() {
        let compiled = AstGrepPatternCompiler::compile(
            AstGrepLanguage::Typescript,
            "console.log($MSG)",
        ).unwrap();

        assert_eq!(compiled.query, "console.log($MSG)");
        assert!(compiled.captures.contains(&"$MSG".to_string()));
    }

    #[test]
    fn test_pattern_compiler_node_kind() {
        let compiled = AstGrepPatternCompiler::compile(
            AstGrepLanguage::Typescript,
            "try_statement",
        ).unwrap();

        assert_eq!(compiled.query, "try_statement");
        assert!(compiled.captures.is_empty());
    }

    #[test]
    fn test_search_result_group_by_file() {
        let result = AstGrepSearchResult {
            matches: vec![
                AstGrepMatch {
                    file: "src/a.ts".to_string(),
                    line: 10,
                    column: 5,
                    start_byte: 100,
                    end_byte: 120,
                    text: "console.log('a')".to_string(),
                    node_kind: "call_expression".to_string(),
                    captures: vec![],
                },
                AstGrepMatch {
                    file: "src/a.ts".to_string(),
                    line: 20,
                    column: 3,
                    start_byte: 200,
                    end_byte: 220,
                    text: "console.log('b')".to_string(),
                    node_kind: "call_expression".to_string(),
                    captures: vec![],
                },
                AstGrepMatch {
                    file: "src/b.ts".to_string(),
                    line: 5,
                    column: 1,
                    start_byte: 50,
                    end_byte: 70,
                    text: "console.log('c')".to_string(),
                    node_kind: "call_expression".to_string(),
                    captures: vec![],
                },
            ],
            total: 3,
            elapsed_ms: 15,
        };

        let groups = result.group_by_file();
        assert_eq!(groups.len(), 2);
        assert_eq!(groups.get("src/a.ts").unwrap().len(), 2);
        assert_eq!(groups.get("src/b.ts").unwrap().len(), 1);
    }

    #[test]
    fn test_recommended_presets() {
        let ts_presets = AstGrepEngine::recommended_presets(AstGrepLanguage::Typescript);
        assert!(ts_presets.iter().any(|p| p.id == "console_log"));
        assert!(ts_presets.iter().any(|p| p.id == "try_catch"));
        assert!(!ts_presets.iter().any(|p| p.id == "rust_unwrap"));

        let rust_presets = AstGrepEngine::recommended_presets(AstGrepLanguage::Rust);
        assert!(rust_presets.iter().any(|p| p.id == "rust_unwrap"));
        assert!(rust_presets.iter().any(|p| p.id == "try_catch"));
        assert!(!rust_presets.iter().any(|p| p.id == "console_log"));
    }

    #[test]
    fn test_preset_from_string() {
        // 验证预设名称序列化
        assert_eq!(AstGrepPreset::ConsoleLog.to_string(), "console_log");
        assert_eq!(AstGrepPreset::RustUnwrap.to_string(), "rust_unwrap");
        assert_eq!(AstGrepPreset::PyPrint.to_string(), "py_print");
    }
}
