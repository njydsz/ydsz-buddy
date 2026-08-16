//! # AST-Grep 结构搜索（Code 域）
//!
//! 基于 tree-sitter 的结构化代码搜索能力，是符号搜索的"超集"：
//!
//! | 能力 | 符号搜索 (`IndexerService::search`) | AST-Grep (`AstGrepSearcher`) |
//! |------|-------------------------------------|------------------------------|
//! | 输入 | 字符串（符号名模糊匹配） | 节点类型 / S-expression 查询 / 预设模式 |
//! | 匹配粒度 | 符号定义（fn/class/...） | 任意 AST 节点 |
//! | 典型场景 | "找到 `greet` 函数" | "找到所有 `console.log($MSG)` 调用" |
//!
//! ## 设计目标
//!
//! - **零额外依赖**：复用现有 tree-sitter 解析器，不引入 ast-grep crate（避免与多版本 tree-sitter 冲突）
//! - **可扩展**：`find_by_node_kind` / `find_by_query` / `find_calls_to` / `find_references` 四个核心 API
//! - **可降级**：未识别文件类型走文本搜索兜底
//!
//! ## 示例
//!
//! ```ignore
//! use ydsz_code::indexer::ast_grep::AstGrepSearcher;
//!
//! let searcher = AstGrepSearcher::new(workspace_root);
//! let matches = searcher.find_calls_to("console.log")?;
//! for m in matches {
//!     println!("{}:{}: {}", m.file, m.line, m.text);
//! }
//! ```

pub mod hashline;
pub mod pattern;
pub mod presets;
pub mod references;
pub mod rewrite;

use std::path::{Path, PathBuf};

use serde::Serialize;
use tracing::warn;
use tree_sitter::{Parser, Query};
use walkdir::WalkDir;

use super::ast::Language;
use super::IndexerResult;
use crate::indexer::ast::{cpp, go_lang, java, python, rust_lang, typescript};

/// 匹配命中
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct MatchResult {
    /// 命中的源文件
    pub file: String,
    /// 起始行（1-based）
    pub line: u32,
    /// 起始列（1-based）
    pub column: u32,
    /// 起始字节偏移
    pub start_byte: u32,
    /// 结束字节偏移
    pub end_byte: u32,
    /// 命中的原始文本
    pub text: String,
    /// 命中的节点类型
    pub node_kind: String,
    /// 捕获名 → 文本（仅 S-expression 查询使用）
    #[serde(default)]
    pub captures: Vec<(String, String)>,
}

/// AST-Grep 搜索器
///
/// 设计为无状态服务：每次搜索重新遍历工作区。
/// 工作区规模小（< 1k 文件）时性能可接受，大规模项目可扩展为"建索引 + 增量"模式。
pub struct AstGrepSearcher {
    root: PathBuf,
}

impl AstGrepSearcher {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }

    /// 获取工作区根
    pub fn root(&self) -> &Path {
        &self.root
    }

    /// 按节点类型搜索（如 `"call_expression"` / `"try_statement"` / `"await_expression"`）
    ///
    /// 匹配所有"节点类型为 `kind`"的 AST 节点，并返回节点的源文本。
    pub fn find_by_node_kind(&self, kind: &str) -> IndexerResult<Vec<MatchResult>> {
        let mut results = Vec::new();
        let files = collect_code_files(&self.root);

        for file in files {
            let content = match std::fs::read_to_string(&file) {
                Ok(c) => c,
                Err(e) => {
                    warn!(file = %file.display(), error = %e, "读取失败，跳过");
                    continue;
                }
            };
            let lang = match Language::from_path(&file) {
                Some(l) => l,
                None => continue,
            };
            let tree = match parse_source(&content, lang) {
                Ok(t) => t,
                Err(_) => continue,
            };

            walk_for_kind(&tree.root_node(), &content, kind, &file, &mut results);
        }

        Ok(results)
    }

    /// 按 S-expression tree-sitter 查询搜索
    ///
    /// 直接接受 tree-sitter 查询字符串，例如：
    /// - TS: `(call_expression function: (member_expression object: (identifier) @obj property: (property_identifier) @prop) @call)`
    /// - Rust: `(call_expression function: (identifier) @name)`
    /// - Python: `(call function: (identifier) @name)`
    pub fn find_by_query(
        &self,
        lang: Language,
        query_str: &str,
    ) -> IndexerResult<Vec<MatchResult>> {
        let language = lang.language_ref();
        let query = Query::new(&language, query_str)
            .map_err(|e| super::error::IndexerError::BuildFailed(format!("查询语法错误: {e}")))?;

        let capture_names: Vec<String> = query.capture_names().iter().map(|s| s.to_string()).collect();
        let mut results = Vec::new();
        let files = collect_code_files(&self.root);

        for file in files {
            // 只对匹配语言的文件做查询
            if Language::from_path(&file) != Some(lang) {
                continue;
            }
            let content = match std::fs::read_to_string(&file) {
                Ok(c) => c,
                Err(_) => continue,
            };
            let tree = match parse_source(&content, lang) {
                Ok(t) => t,
                Err(_) => continue,
            };
            let mut cursor = tree_sitter::QueryCursor::new();
            let mut matches = cursor.matches(&query, tree.root_node(), content.as_bytes());
            use tree_sitter::StreamingIterator;
            while let Some(m) = matches.next() {
                let mut capture_texts: Vec<(String, String)> = Vec::new();
                for cap in m.captures {
                    let name = capture_names
                        .get(cap.index as usize)
                        .cloned()
                        .unwrap_or_default();
                    let text = cap.node.utf8_text(content.as_bytes()).unwrap_or("").to_string();
                    capture_texts.push((name, text));
                }
                // 选一个"主命中"：用第一个 capture 的节点作为位置
                if let Some(first) = m.captures.first() {
                    let node = first.node;
                    let start = node.start_position();
                    let text = node
                        .utf8_text(content.as_bytes())
                        .unwrap_or("")
                        .to_string();
                    let kind = node.kind().to_string();
                    results.push(MatchResult {
                        file: file.to_string_lossy().to_string(),
                        line: start.row as u32 + 1,
                        column: start.column as u32 + 1,
                        start_byte: node.start_byte() as u32,
                        end_byte: node.end_byte() as u32,
                        text,
                        node_kind: kind,
                        captures: capture_texts,
                    });
                }
            }
        }
        Ok(results)
    }

    /// 查找所有对 `name` 的"调用"或"引用"
    ///
    /// 语义：
    /// - TS/JS: `name(...)` 和 `obj.name(...)` 视为调用；`name` 作为 identifier 视为引用
    /// - Rust: `name(...)` 和 `name.method(...)` 视为调用；`name` 作为 path 视为引用
    /// - Python: `name(...)` 和 `obj.name(...)` 视为调用；`name` 作为 identifier 视为引用
    ///
    /// 跨语言统一暴露一个最简单的接口（同名匹配），用户可基于此自行过滤
    /// 调用类型或引用类型。
    pub fn find_references(&self, name: &str) -> IndexerResult<Vec<MatchResult>> {
        references::find_references(&self.root, name)
    }

    /// 查找所有形如 `name(...)` 的调用（不含成员访问）
    pub fn find_calls_to(&self, name: &str) -> IndexerResult<Vec<MatchResult>> {
        references::find_calls_to(&self.root, name)
    }
}

// ---- 内部辅助 ----

/// 收集工作区下所有代码文件
fn collect_code_files(root: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let exts = ["ts", "tsx", "js", "jsx", "rs", "py", "pyi", "mts", "cts", "mjs", "cjs"];
    for entry in WalkDir::new(root).into_iter().filter_map(|e| e.ok()) {
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        let path_str = path.to_string_lossy();
        if path_str.contains("node_modules")
            || path_str.contains("target")
            || path_str.contains(".git")
        {
            continue;
        }
        let ext = match path.extension().and_then(|e| e.to_str()) {
            Some(e) => e.to_lowercase(),
            None => continue,
        };
        if !exts.contains(&ext.as_str()) {
            continue;
        }
        out.push(path.to_path_buf());
    }
    out
}

/// 复用 IndexerService 的 tree-sitter parser（避免重复实现）
fn parse_source(source: &str, lang: Language) -> IndexerResult<tree_sitter::Tree> {
    let mut parser = Parser::new();
    parser
        .set_language(&lang.language_ref())
        .map_err(|e| super::error::IndexerError::ParseError(e.to_string()))?;
    parser
        .parse(source, None)
        .ok_or_else(|| super::error::IndexerError::ParseError("tree-sitter parse returned None".into()))
}

/// 递归遍历 AST，找到所有 `kind` 节点
fn walk_for_kind(
    node: &tree_sitter::Node,
    source: &str,
    kind: &str,
    file: &Path,
    out: &mut Vec<MatchResult>,
) {
    if node.kind() == kind {
        let start = node.start_position();
        let text = node.utf8_text(source.as_bytes()).unwrap_or("").to_string();
        out.push(MatchResult {
            file: file.to_string_lossy().to_string(),
            line: start.row as u32 + 1,
            column: start.column as u32 + 1,
            start_byte: node.start_byte() as u32,
            end_byte: node.end_byte() as u32,
            text,
            node_kind: kind.to_string(),
            captures: Vec::new(),
        });
    }
    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        walk_for_kind(&child, source, kind, file, out);
    }
}

impl Language {
    /// 暴露给 `find_by_query` 的语言引用
    pub(crate) fn language_ref(&self) -> tree_sitter::Language {
        match self {
            Language::TypeScript | Language::JavaScript => typescript::LANGUAGE.into(),
            Language::Rust => rust_lang::LANGUAGE.into(),
            Language::Python => python::LANGUAGE.into(),
            Language::Go => go_lang::LANGUAGE.into(),
            Language::C => tree_sitter_c::LANGUAGE.into(),
            Language::Cpp => cpp::LANGUAGE.into(),
            Language::Java => java::LANGUAGE.into(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::tempdir;

    fn write(dir: &Path, name: &str, content: &str) -> PathBuf {
        let path = dir.join(name);
        let mut f = std::fs::File::create(&path).unwrap();
        f.write_all(content.as_bytes()).unwrap();
        path
    }

    #[test]
    fn find_by_node_kind_finds_all_try_statements() {
        let dir = tempdir().unwrap();
        write(
            dir.path(),
            "a.ts",
            r#"
try { foo(); } catch (e) { console.log(e); }
try { bar(); } finally { cleanup(); }
"#,
        );
        let searcher = AstGrepSearcher::new(dir.path().to_path_buf());
        let matches = searcher.find_by_node_kind("try_statement").unwrap();
        assert_eq!(matches.len(), 2, "应找到 2 个 try 语句: {:?}", matches);
        for m in &matches {
            assert_eq!(m.node_kind, "try_statement");
        }
    }

    #[test]
    fn find_calls_to_finds_console_log_calls() {
        let dir = tempdir().unwrap();
        write(
            dir.path(),
            "a.ts",
            r#"
console.log("hello");
console.log("world");
console.error("oops");
"#,
        );
        let searcher = AstGrepSearcher::new(dir.path().to_path_buf());
        let matches = searcher.find_calls_to("console.log").unwrap();
        assert_eq!(matches.len(), 2, "应找到 2 个 console.log 调用");
        for m in &matches {
            assert!(m.text.contains("console.log"), "匹配文本错误: {}", m.text);
        }
    }

    #[test]
    fn find_references_finds_all_usages() {
        let dir = tempdir().unwrap();
        write(
            dir.path(),
            "a.ts",
            r#"
const x = 1;
console.log(x);
const y = x + 2;
"#,
        );
        let searcher = AstGrepSearcher::new(dir.path().to_path_buf());
        let matches = searcher.find_references("x").unwrap();
        // 找到 const x, console.log(x), x + 2 至少 3 处
        assert!(matches.len() >= 3, "应找到 ≥3 处引用: {:?}", matches);
    }

    #[test]
    fn find_by_query_with_captures() {
        let dir = tempdir().unwrap();
        write(
            dir.path(),
            "a.ts",
            r#"
foo(1);
foo(2, 3);
bar();
"#,
        );
        let searcher = AstGrepSearcher::new(dir.path().to_path_buf());
        let q = r#"(call_expression function: (identifier) @fn arguments: (arguments (_) @arg))"#;
        let matches = searcher.find_by_query(Language::TypeScript, q).unwrap();
        // 至少应命中 foo(1), foo(2,3), bar()
        assert!(matches.len() >= 3, "应至少 3 个调用: {:?}", matches);
        // 验证 captures
        let first = &matches[0];
        assert!(!first.captures.is_empty(), "captures 不应为空");
    }

    #[test]
    fn rust_calls_to_function() {
        let dir = tempdir().unwrap();
        write(
            dir.path(),
            "a.rs",
            r#"
fn helper() {}
fn main() {
    helper();
    helper();
    other();
}
"#,
        );
        let searcher = AstGrepSearcher::new(dir.path().to_path_buf());
        let matches = searcher.find_calls_to("helper").unwrap();
        assert_eq!(matches.len(), 2, "应找到 2 个 helper() 调用: {:?}", matches);
    }

    #[test]
    fn python_calls_to_function() {
        let dir = tempdir().unwrap();
        write(
            dir.path(),
            "a.py",
            r#"
def greet():
    return "hi"

print(greet())
print(greet())
"#,
        );
        let searcher = AstGrepSearcher::new(dir.path().to_path_buf());
        let matches = searcher.find_calls_to("greet").unwrap();
        assert_eq!(matches.len(), 2, "应找到 2 个 greet() 调用: {:?}", matches);
    }
}
