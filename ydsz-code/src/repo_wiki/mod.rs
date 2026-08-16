//! # Repo Wiki 模块
//!
//! 本模块实现项目级结构化知识沉淀：
//!
//! - **AST 解析**：使用 tree-sitter 解析代码，抽取模块/类/函数/接口
//! - **Wiki 生成**：自动生成 `.ydsz/wiki/<module>.md` 文档
//! - **增量更新**：随 commit 增量更新 Wiki（基于文件 mtime）
//! - **按需检索**：Composer Skill 提及 "wiki" 时自动检索
//! - **依赖图**：提取 use/import 构建模块间依赖关系
//! - **相关性搜索**：按匹配质量评分排序搜索结果
//! - **文档大纲**：从 Markdown 内容提取标题层级 TOC
//! - **全量导出**：将所有模块合并为单个 Markdown 文档

pub mod generator;
pub mod parser;
pub mod wiki;

pub use generator::{WikiGenerator, DependencyGraph};
pub use parser::{AstParser, CodeSymbol, SymbolKind};
pub use wiki::{WikiEntry, WikiService, WikiStats, OutlineNode, SearchResult};
