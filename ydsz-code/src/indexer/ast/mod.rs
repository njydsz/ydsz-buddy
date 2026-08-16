//! # AST 索引模块（基于 tree-sitter 的语义级符号提取）
//!
//! 用 tree-sitter 为每种语言建立精确的 AST，然后从中提取符号定义。
//!
//! ## 支持语言
//!
//! | 语言 | 文件扩展名 | 节点类型 |
//! |------|-----------|---------|
//! | TypeScript | `.ts` / `.tsx` | function_declaration, class_declaration, interface_declaration, type_alias_declaration, export_statement |
//! | JavaScript | `.js` / `.jsx` | 同上（用 tsx parser 兼容） |
//! | Rust | `.rs` | function_item, struct_item, enum_item, trait_item, impl_item, type_item |
//! | Python | `.py` | function_definition, class_definition, decorated_definition |
//!
//! ## 失败降级
//!
//! AST 解析失败（语法错误、tree-sitter 内部错误等）时，
//! 调用方应回退到 [crate::indexer::service::IndexerService] 的正则提取器。

pub mod typescript;
pub mod rust_lang;
pub mod python;
pub mod go_lang;
pub mod cpp;
pub mod java;

use std::path::Path;

use tree_sitter::Parser;

use crate::indexer::service::{SymbolEntry, SymbolKind};
use crate::indexer::IndexerResult;

/// 支持的编程语言
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Language {
    TypeScript,
    JavaScript,
    Rust,
    Python,
    Go,
    C,
    Cpp,
    Java,
}

impl Language {
    /// 从文件扩展名识别语言
    pub fn from_path(path: &Path) -> Option<Self> {
        let ext = path.extension()?.to_str()?.to_lowercase();
        match ext.as_str() {
            "ts" | "mts" | "cts" => Some(Language::TypeScript),
            "tsx" => Some(Language::TypeScript),
            "js" | "mjs" | "cjs" => Some(Language::JavaScript),
            "jsx" => Some(Language::JavaScript),
            "rs" => Some(Language::Rust),
            "py" | "pyi" => Some(Language::Python),
            "go" => Some(Language::Go),
            "c" | "h" => Some(Language::C),
            "cpp" | "cc" | "cxx" | "hpp" | "hh" | "hxx" => Some(Language::Cpp),
            "java" => Some(Language::Java),
            _ => None,
        }
    }
}

/// AST 索引器：为不同语言创建 tree-sitter parser 并提取符号
pub struct AstIndexer {
    /// 复用的 parser（避免每次重建）。`Parser::new` 比较昂贵，缓存可大幅提升索引速度。
    parser: parking_lot::Mutex<Option<Parser>>,
}

impl Default for AstIndexer {
    fn default() -> Self {
        Self::new()
    }
}

impl AstIndexer {
    pub fn new() -> Self {
        Self {
            parser: parking_lot::Mutex::new(None),
        }
    }

    /// 从源代码提取符号（自动识别语言）
    pub fn extract_symbols(
        &self,
        file: &Path,
        source: &str,
    ) -> IndexerResult<Vec<SymbolEntry>> {
        let lang = Language::from_path(file).ok_or_else(|| {
            crate::indexer::IndexerError::UnsupportedFile(file.to_string_lossy().to_string())
        })?;
        self.extract_with_lang(file, source, lang)
    }

    /// 从源代码提取符号（显式指定语言）
    pub fn extract_with_lang(
        &self,
        file: &Path,
        source: &str,
        lang: Language,
    ) -> IndexerResult<Vec<SymbolEntry>> {
        let tree = self.parse(source, lang)?;
        let mut symbols = Vec::new();
        match lang {
            Language::TypeScript | Language::JavaScript => {
                typescript::extract(file, source, &tree, &mut symbols);
            }
            Language::Rust => {
                rust_lang::extract(file, source, &tree, &mut symbols);
            }
            Language::Python => {
                python::extract(file, source, &tree, &mut symbols);
            }
            Language::Go => {
                go_lang::extract(file, source, &tree, &mut symbols);
            }
            Language::C => {
                cpp::extract_c(file, source, &tree, &mut symbols);
            }
            Language::Cpp => {
                cpp::extract(file, source, &tree, &mut symbols);
            }
            Language::Java => {
                java::extract(file, source, &tree, &mut symbols);
            }
        }
        Ok(symbols)
    }

    /// 用 tree-sitter 解析源代码，得到一棵语法树
    fn parse(&self, source: &str, lang: Language) -> IndexerResult<tree_sitter::Tree> {
        let mut guard = self.parser.lock();
        if guard.is_none() {
            *guard = Some(Parser::new());
        }
        let parser = guard.as_mut().unwrap();
        // 每次都重新 set_language：parser 缓存只复用 Parser 对象本身，
        // 切换语言（TS→Rust→Go）时必须重设 language 才能正确解析。
        parser
            .set_language(&lang.language_ref())
            .map_err(|e| super::error::IndexerError::ParseError(e.to_string()))?;
        parser
            .parse(source, None)
            .ok_or_else(|| crate::indexer::IndexerError::ParseError("tree-sitter parse returned None".into()))
    }
}

/// 工具函数：把 tree-sitter 节点转换为 SymbolEntry
pub(crate) fn make_entry(
    file: &Path,
    name: String,
    kind: SymbolKind,
    node: &tree_sitter::Node,
) -> SymbolEntry {
    SymbolEntry {
        name,
        kind,
        file: file.to_path_buf(),
        line: node.start_position().row as u32 + 1,
        column: node.start_position().column as u32 + 1,
    }
}
