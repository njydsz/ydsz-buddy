//! # 仓库语义检索（Code 域能力）
//!
//! 提供 `@codebase` 提及触发的全仓库语义检索能力。
//!
//! ## 核心职责
//!
//! - 基于 tree-sitter 的 AST 符号提取（首选，语义级）
//! - 正则表达式符号提取（兜底，兼容性广）
//! - 内存索引 + 模糊搜索
//! - walkdir 全文本检索
//! - 后台增量索引构建 + 进度回调
//!
//! ## 架构
//!
//! ```text
//! ┌──────────────────────────────────────────┐
//! │ IndexerService                           │
//! ├──────────────────────────────────────────┤
//! │  ┌────────────────┐  ┌────────────────┐  │
//! │  │ AstIndexer     │  │ RegexExtractor │  │
//! │  │ (tree-sitter)  │  │ (兜底)         │  │
//! │  └────────────────┘  └────────────────┘  │
//! │  ┌──────────────────────────────────────┐│
//! │  │ TextSearch (walkdir 全文本)          ││
//! │  └──────────────────────────────────────┘│
//! └──────────────────────────────────────────┘
//! ```

pub mod ast;
pub mod ast_grep;
pub mod error;
pub mod service;
pub mod query;

pub use ast::{AstIndexer, Language};
pub use ast_grep::hashline::{
    annotate_content as annotate_content_lines, annotate_file, apply_and_write,
    apply_block_edit, apply_line_edits, verify_line, AnnotatedFile, AnnotatedLine, BlockEdit,
    EditResult, LineEdit,
};
pub use ast_grep::pattern::{compile_pattern, CompiledPattern};
pub use ast_grep::presets::Preset;
pub use ast_grep::references::{find_calls_to as find_calls_to_refs, find_references as find_references_refs};
pub use ast_grep::rewrite::{rewrite_with_pattern, RewriteResult};
pub use ast_grep::{AstGrepSearcher, MatchResult};
pub use error::IndexerError;
pub use service::{BuildStats, IndexerService, SymbolEntry, SymbolKind};
pub use query::{text_search, SearchResult};

pub type IndexerResult<T> = Result<T, IndexerError>;
