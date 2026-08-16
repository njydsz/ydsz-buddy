//! AST 解析器
//!
//! 使用 tree-sitter 解析代码文件，抽取结构化信息。
//!
//! ## 解析策略
//!
//! - **Rust / TypeScript / JavaScript / Python**：复用 [`crate::indexer::ast::AstIndexer`]（基于 tree-sitter）
//! - **Go**：保留正则兜底（项目未引入 tree-sitter-go 依赖）
//!
//! ## 符号字段
//!
//! [`CodeSymbol::signature`] 取符号所在行的源代码（trim 后）；
//! [`CodeSymbol::doc_comment`] 由 [`extract_doc_comment`] 从源代码向上扫描提取。

use std::path::{Path, PathBuf};
use std::sync::Arc;
use parking_lot::RwLock;
use tracing::{debug, info, warn};

use crate::indexer::ast::{AstIndexer, Language};
use crate::indexer::service::{SymbolKind as IndexerSymbolKind, SymbolEntry};

/// 代码符号类型
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq, Hash)]
pub enum SymbolKind {
    Module,
    Class,
    Function,
    Method,
    Interface,
    Type,
    Constant,
    Variable,
}

impl From<IndexerSymbolKind> for SymbolKind {
    fn from(k: IndexerSymbolKind) -> Self {
        match k {
            IndexerSymbolKind::Module => SymbolKind::Module,
            IndexerSymbolKind::Class => SymbolKind::Class,
            IndexerSymbolKind::Function => SymbolKind::Function,
            IndexerSymbolKind::Method => SymbolKind::Method,
            IndexerSymbolKind::Interface => SymbolKind::Interface,
            IndexerSymbolKind::Type => SymbolKind::Type,
            IndexerSymbolKind::Variable => SymbolKind::Variable,
        }
    }
}

/// 代码符号
///
/// 表示代码中的一个可识别符号（函数、类、接口等）
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct CodeSymbol {
    /// 符号名称
    pub name: String,
    /// 符号类型（函数、类、接口等）
    pub kind: SymbolKind,
    /// 定义该符号的文件路径
    pub file: PathBuf,
    /// 定义所在的行号
    pub line: u32,
    /// 定义所在的列号
    pub column: u32,
    /// 符号签名（函数签名或类型定义）
    pub signature: Option<String>,
    /// 文档注释内容
    pub doc_comment: Option<String>,
    /// 子符号列表（如类的成员方法）
    pub children: Vec<CodeSymbol>,
}

/// AST 解析器
///
/// 对 Rust/TS/JS/Python 复用 [`AstIndexer`]（tree-sitter）；对 Go 保留正则兜底。
pub struct AstParser {
    /// 项目根目录
    root: PathBuf,
    /// 解析出的符号列表
    symbols: Arc<RwLock<Vec<CodeSymbol>>>,
    /// 复用的 tree-sitter 索引器（Rust/TS/JS/Python）
    indexer: AstIndexer,
}

impl AstParser {
    /// 创建新的解析器
    pub fn new(root: PathBuf) -> Self {
        Self {
            root,
            symbols: Arc::new(RwLock::new(Vec::new())),
            indexer: AstIndexer::new(),
        }
    }

    /// 解析项目中的所有代码文件
    pub fn parse_project(&self) -> Result<usize, String> {
        info!("开始解析项目: {:?}", self.root);

        let mut symbols = Vec::new();
        let code_extensions = ["rs", "ts", "tsx", "js", "jsx", "py", "go"];

        for entry in walkdir::WalkDir::new(&self.root)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            if !entry.file_type().is_file() {
                continue;
            }

            let path = entry.path();
            let ext = match path.extension().and_then(|e| e.to_str()) {
                Some(e) => e.to_lowercase(),
                None => continue,
            };

            if !code_extensions.contains(&ext.as_str()) {
                continue;
            }

            // 跳过常见的非源码目录
            let path_str = path.to_string_lossy();
            if path_str.contains("node_modules")
                || path_str.contains("target")
                || path_str.contains(".git")
                || path_str.contains("dist")
                || path_str.contains("build")
            {
                continue;
            }

            if let Ok(content) = std::fs::read_to_string(path) {
                match self.parse_file(path, &content, &ext) {
                    Ok(file_symbols) => {
                        symbols.extend(file_symbols);
                    }
                    Err(e) => {
                        debug!("解析文件失败 {:?}: {}", path, e);
                    }
                }
            }
        }

        let count = symbols.len();
        *self.symbols.write() = symbols;

        info!("解析完成，共发现 {} 个符号", count);
        Ok(count)
    }

    /// 解析单个文件
    ///
    /// - Rust/TS/JS/Python：调用 [`AstIndexer::extract_with_lang`]（tree-sitter）
    /// - Go：正则兜底（项目未引入 tree-sitter-go）
    fn parse_file(&self, path: &Path, content: &str, ext: &str) -> Result<Vec<CodeSymbol>, String> {
        match ext {
            "rs" | "ts" | "tsx" | "js" | "jsx" | "py" => self.parse_with_tree_sitter(path, content),
            "go" => self.parse_go(path, content),
            _ => Ok(Vec::new()),
        }
    }

    /// 用 tree-sitter（复用 AstIndexer）解析 Rust/TS/JS/Python 文件
    fn parse_with_tree_sitter(&self, path: &Path, content: &str) -> Result<Vec<CodeSymbol>, String> {
        let lang = Language::from_path(path).ok_or_else(|| {
            format!("无法识别文件语言: {}", path.display())
        })?;

        let entries: Vec<SymbolEntry> = self.indexer.extract_with_lang(path, content, lang)
            .map_err(|e| {
                warn!(file = %path.display(), error = %e, "tree-sitter 解析失败，回退到空符号列表");
                format!("tree-sitter 解析失败: {e}")
            })?;

        let lines: Vec<&str> = content.lines().collect();
        let symbols = entries
            .into_iter()
            .map(|entry| {
                let line_idx = (entry.line.saturating_sub(1)) as usize;
                let signature = lines.get(line_idx).map(|l| l.trim().to_string());
                let doc_comment = extract_doc_comment(content, line_idx);
                CodeSymbol {
                    name: entry.name,
                    kind: entry.kind.into(),
                    file: entry.file,
                    line: entry.line,
                    column: entry.column,
                    signature,
                    doc_comment,
                    children: Vec::new(),
                }
            })
            .collect();

        Ok(symbols)
    }

    /// 解析 Go 文件（正则兜底，无 tree-sitter-go 依赖）
    fn parse_go(&self, path: &Path, content: &str) -> Result<Vec<CodeSymbol>, String> {
        let mut symbols = Vec::new();

        // 提取函数定义
        let fn_pattern = regex_lite::Regex::new(r"func\s+(?:\(\w+\s+\*?\w+\)\s+)?(\w+)").unwrap();
        for (line_idx, line) in content.lines().enumerate() {
            if let Some(caps) = fn_pattern.captures(line) {
                if let Some(name) = caps.get(1) {
                    let kind = if line.contains("func (") {
                        SymbolKind::Method
                    } else {
                        SymbolKind::Function
                    };

                    symbols.push(CodeSymbol {
                        name: name.as_str().to_string(),
                        kind,
                        file: path.to_path_buf(),
                        line: (line_idx + 1) as u32,
                        column: 1,
                        signature: Some(line.trim().to_string()),
                        doc_comment: extract_doc_comment(content, line_idx),
                        children: Vec::new(),
                    });
                }
            }
        }

        // 提取结构体定义
        let struct_pattern = regex_lite::Regex::new(r"type\s+(\w+)\s+struct").unwrap();
        for (line_idx, line) in content.lines().enumerate() {
            if let Some(caps) = struct_pattern.captures(line) {
                if let Some(name) = caps.get(1) {
                    symbols.push(CodeSymbol {
                        name: name.as_str().to_string(),
                        kind: SymbolKind::Class,
                        file: path.to_path_buf(),
                        line: (line_idx + 1) as u32,
                        column: 1,
                        signature: Some(line.trim().to_string()),
                        doc_comment: extract_doc_comment(content, line_idx),
                        children: Vec::new(),
                    });
                }
            }
        }

        Ok(symbols)
    }

    /// 获取所有解析的符号
    pub fn get_symbols(&self) -> Vec<CodeSymbol> {
        self.symbols.read().clone()
    }

    /// 按类型过滤符号
    pub fn get_symbols_by_kind(&self, kind: SymbolKind) -> Vec<CodeSymbol> {
        self.symbols.read().iter().filter(|s| s.kind == kind).cloned().collect()
    }

    /// 搜索符号
    pub fn search(&self, query: &str) -> Vec<CodeSymbol> {
        let lower = query.to_lowercase();
        self.symbols.read().iter()
            .filter(|s| s.name.to_lowercase().contains(&lower))
            .cloned()
            .collect()
    }

    /// 从文件内容提取 import/use 语句
    ///
    /// 返回该文件依赖的外部模块路径列表（原始字符串）。
    /// 支持 Rust (`use`)、TypeScript/JavaScript (`import`/`require`)、Python (`import`/`from`)、Go (`import`)。
    pub fn extract_imports(&self, path: &Path, content: &str) -> Vec<String> {
        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
        match ext {
            "rs" => Self::extract_rust_imports(content),
            "ts" | "tsx" | "js" | "jsx" => Self::extract_ts_imports(content),
            "py" => Self::extract_python_imports(content),
            "go" => Self::extract_go_imports(content),
            _ => Vec::new(),
        }
    }

    /// 提取 Rust `use` 语句
    fn extract_rust_imports(content: &str) -> Vec<String> {
        let mut imports = Vec::new();
        // 匹配 `use crate::module::...;` 或 `use ::module::...;`
        let pattern = regex_lite::Regex::new(
            r"^\s*use\s+(?:::)?([\w:]+)"
        ).unwrap();
        for line in content.lines() {
            if let Some(caps) = pattern.captures(line) {
                if let Some(m) = caps.get(1) {
                    let path = m.as_str();
                    // 过滤 self / crate / super 开头的内部路径但仍保留
                    imports.push(path.to_string());
                }
            }
        }
        imports
    }

    /// 提取 TypeScript/JavaScript import/require 语句
    fn extract_ts_imports(content: &str) -> Vec<String> {
        let mut imports = Vec::new();
        // `import ... from '...'` / `import '...'`
        let import_re = regex_lite::Regex::new(
            r#"(?:import\s+[^;]*?\s+from\s+|import\s+|require\s*\(\s*)['"]([^'"]+)['"]"#
        ).unwrap();
        for caps in import_re.captures_iter(content) {
            if let Some(m) = caps.get(1) {
                imports.push(m.as_str().to_string());
            }
        }
        imports
    }

    /// 提取 Python import/from 语句
    fn extract_python_imports(content: &str) -> Vec<String> {
        let mut imports = Vec::new();
        let import_re = regex_lite::Regex::new(
            r"^\s*(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))"
        ).unwrap();
        for line in content.lines() {
            if let Some(caps) = import_re.captures(line) {
                let path = caps.get(1).or_else(|| caps.get(2));
                if let Some(m) = path {
                    imports.push(m.as_str().to_string());
                }
            }
        }
        imports
    }

    /// 提取 Go import 语句
    fn extract_go_imports(content: &str) -> Vec<String> {
        let mut imports = Vec::new();
        // 单行: `import "path"`
        let single_re = regex_lite::Regex::new(
            r#"^\s*import\s+"([^"]+)""#
        ).unwrap();
        // 多行: `import ( ... )` 中的每一行 `"path"`
        let multi_re = regex_lite::Regex::new(
            r#"^\s*"([^"]+)""#
        ).unwrap();

        let mut in_import_block = false;
        for line in content.lines() {
            let trimmed = line.trim();
            if trimmed.starts_with("import (") || trimmed.starts_with("import\t(") {
                in_import_block = true;
                continue;
            }
            if in_import_block {
                if trimmed == ")" {
                    in_import_block = false;
                    continue;
                }
                if let Some(caps) = multi_re.captures(trimmed) {
                    if let Some(m) = caps.get(1) {
                        imports.push(m.as_str().to_string());
                    }
                }
                continue;
            }
            if let Some(caps) = single_re.captures(line) {
                if let Some(m) = caps.get(1) {
                    imports.push(m.as_str().to_string());
                }
            }
        }
        imports
    }

    /// 构建模块间依赖图
    ///
    /// 返回 HashMap<模块名, Vec<被依赖的模块名>>
    /// 通过分析每个符号所在文件的 import/use 语句，
    /// 将 import 路径映射到项目内模块名。
    pub fn build_dependency_graph(&self) -> std::collections::HashMap<String, Vec<String>> {
        let mut graph: std::collections::HashMap<String, Vec<String>> = std::collections::HashMap::new();
        let symbols = self.symbols.read();

        // 收集每个模块的文件集合
        let mut module_files: std::collections::HashMap<String, Vec<PathBuf>> = std::collections::HashMap::new();
        for sym in symbols.iter() {
            let module = self.extract_module_name_for_dep(&sym.file);
            module_files.entry(module).or_default().push(sym.file.clone());
        }

        // 对每个模块，收集其所有文件的 import
        for (module, files) in &module_files {
            let mut deps = std::collections::HashSet::new();
            for file in files {
                if let Ok(content) = std::fs::read_to_string(file) {
                    let imports = self.extract_imports(file, &content);
                    for imp in imports {
                        // 尝试将 import 路径映射到项目内模块名
                        if let Some(dep_module) = self.resolve_import_to_module(&imp, &module_files) {
                            if dep_module != *module {
                                deps.insert(dep_module);
                            }
                        }
                    }
                }
            }
            if !deps.is_empty() {
                graph.insert(module.clone(), deps.into_iter().collect());
            }
        }

        graph
    }

    /// 从文件路径提取模块名（用于依赖图构建）
    fn extract_module_name_for_dep(&self, path: &Path) -> String {
        let relative = path.strip_prefix(&self.root).unwrap_or(path);
        if let Some(parent) = relative.parent() {
            let parent_str = parent.to_string_lossy();
            if parent_str.is_empty() || parent_str == "." {
                return path.file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("root")
                    .to_string();
            }
            parent_str.replace(std::path::MAIN_SEPARATOR, "::")
        } else {
            "root".to_string()
        }
    }

    /// 尝试将 import 路径解析为项目内模块名
    ///
    /// - Rust: `crate::module::sub` → `module::sub`
    /// - TS/JS: `./module` or `../module` → 相对路径映射
    /// - Python: `package.module` → `package/module`
    /// - Go: `github.com/user/repo/pkg` → `pkg`
    fn resolve_import_to_module(
        &self,
        import: &str,
        module_files: &std::collections::HashMap<String, Vec<PathBuf>>,
    ) -> Option<String> {
        // 去除 crate:: / :: 前缀
        let cleaned = import
            .trim_start_matches("crate::")
            .trim_start_matches("::")
            .trim_start_matches("self::")
            .trim_start_matches("super::");

        // 尝试直接匹配
        if module_files.contains_key(cleaned) {
            return Some(cleaned.to_string());
        }

        // 尝试将 `::` 替换为 `/` 后匹配路径
        let as_path = cleaned.replace("::", "/");
        for key in module_files.keys() {
            let key_path = key.replace("::", "/");
            if key_path == as_path || as_path.ends_with(&key_path) || key_path.ends_with(&as_path) {
                return Some(key.clone());
            }
        }

        // TS/JS 相对路径：取最后一段
        if import.starts_with('.') {
            let base = import.rsplit('/').next().unwrap_or(import);
            let base = base.trim_end_matches(".ts")
                .trim_end_matches(".tsx")
                .trim_end_matches(".js")
                .trim_end_matches(".jsx");
            for key in module_files.keys() {
                if key.ends_with(base) || base == key {
                    return Some(key.clone());
                }
            }
        }

        None
    }
}

/// 提取文档注释（从指定行号向上扫描）
///
/// 支持的注释风格：
/// - Rust: `///` / `//!`
/// - TypeScript/JavaScript: `/** ... */`
/// - Python: `"""..."""` / `'''...'''`
/// - Go: `//`
fn extract_doc_comment(content: &str, line_idx: usize) -> Option<String> {
    let lines: Vec<&str> = content.lines().collect();
    let mut comments = Vec::new();

    // 向上查找文档注释
    let mut i = line_idx;
    while i > 0 {
        i -= 1;
        let line = lines[i].trim();

        // Rust 风格: /// 或 //!
        if line.starts_with("///") || line.starts_with("//!") {
            comments.push(line.trim_start_matches('/').trim_start_matches('!').trim());
            continue;
        }

        // TypeScript/JavaScript 风格: /** ... */
        if line.starts_with("*/") {
            // 多行注释，继续向上查找
            while i > 0 {
                i -= 1;
                let comment_line = lines[i].trim();
                if comment_line.starts_with("/**") {
                    break;
                }
                if comment_line.starts_with('*') {
                    comments.push(comment_line.trim_start_matches('*').trim());
                }
            }
            break;
        }

        // Python 风格: """ 或 '''
        if line.starts_with("\"\"\"") || line.starts_with("'''") {
            let quote = &line[..3];
            while i > 0 {
                i -= 1;
                let comment_line = lines[i].trim();
                if comment_line.starts_with(quote) {
                    break;
                }
                comments.push(comment_line);
            }
            break;
        }

        // Go 风格: //
        if line.starts_with("//") {
            comments.push(line.trim_start_matches('/').trim());
            continue;
        }

        // 遇到空行或非注释行，停止
        if line.is_empty() || !line.starts_with('/') && !line.starts_with('*') {
            break;
        }
    }

    if comments.is_empty() {
        None
    } else {
        comments.reverse();
        Some(comments.join("\n"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_rust_function_via_tree_sitter() {
        let parser = AstParser::new(PathBuf::from("."));
        let src = r#"
/// 文档注释
pub fn greet(name: &str) -> String {
    format!("hello {}", name)
}
"#;
        let symbols = parser.parse_with_tree_sitter(Path::new("test.rs"), src).unwrap();
        assert!(symbols.iter().any(|s| s.name == "greet" && s.kind == SymbolKind::Function));
        // 验证 doc_comment 被提取
        let greet = symbols.iter().find(|s| s.name == "greet").unwrap();
        assert!(greet.doc_comment.as_ref().is_some_and(|d| d.contains("文档注释")));
    }

    #[test]
    fn parse_typescript_interface_via_tree_sitter() {
        let parser = AstParser::new(PathBuf::from("."));
        let src = r#"
export interface User {
  id: number;
  name: string;
}
"#;
        let symbols = parser.parse_with_tree_sitter(Path::new("test.ts"), src).unwrap();
        assert!(symbols.iter().any(|s| s.name == "User" && s.kind == SymbolKind::Interface));
    }

    #[test]
    fn parse_python_class_via_tree_sitter() {
        let parser = AstParser::new(PathBuf::from("."));
        let src = r#"
class Animal:
    def speak(self):
        pass
"#;
        let symbols = parser.parse_with_tree_sitter(Path::new("test.py"), src).unwrap();
        assert!(symbols.iter().any(|s| s.name == "Animal" && s.kind == SymbolKind::Class));
    }

    #[test]
    fn parse_go_function_via_regex() {
        let parser = AstParser::new(PathBuf::from("."));
        let src = r#"
package main

func main() {
    println("hello")
}

func (s *Server) Start() {}
"#;
        let symbols = parser.parse_go(Path::new("test.go"), src).unwrap();
        assert!(symbols.iter().any(|s| s.name == "main" && s.kind == SymbolKind::Function));
        assert!(symbols.iter().any(|s| s.name == "Start" && s.kind == SymbolKind::Method));
    }

    #[test]
    fn extract_doc_comment_rust_style() {
        let content = "/// 第一行\n/// 第二行\npub fn foo() {}";
        let doc = extract_doc_comment(content, 2);
        assert!(doc.is_some());
        let doc = doc.unwrap();
        assert!(doc.contains("第一行"));
        assert!(doc.contains("第二行"));
    }

    #[test]
    fn extract_doc_comment_empty_when_no_comment() {
        let content = "pub fn foo() {}";
        let doc = extract_doc_comment(content, 0);
        assert!(doc.is_none());
    }

    #[test]
    fn extract_rust_imports_basic() {
        let content = r#"
use std::collections::HashMap;
use crate::engine::Engine;
use super::utils::helper;
use regex_lite::Regex;
"#;
        let imports = AstParser::extract_rust_imports(content);
        assert!(imports.iter().any(|i| i.contains("std::collections::HashMap")));
        assert!(imports.iter().any(|i| i.contains("engine::Engine")));
        assert!(imports.iter().any(|i| i.contains("utils::helper")));
        assert!(imports.iter().any(|i| i.contains("regex_lite::Regex")));
    }

    #[test]
    fn extract_ts_imports_basic() {
        let content = r#"
import React from 'react';
import { foo } from './utils';
import bar from '../lib/bar';
const baz = require('baz');
"#;
        let imports = AstParser::extract_ts_imports(content);
        assert!(imports.iter().any(|i| i == "react"));
        assert!(imports.iter().any(|i| i == "./utils"));
        assert!(imports.iter().any(|i| i == "../lib/bar"));
        assert!(imports.iter().any(|i| i == "baz"));
    }

    #[test]
    fn extract_python_imports_basic() {
        let content = r#"
import os
from pathlib import Path
import collections.abc
from utils import helper
"#;
        let imports = AstParser::extract_python_imports(content);
        assert!(imports.iter().any(|i| i == "os"));
        assert!(imports.iter().any(|i| i == "pathlib"));
        assert!(imports.iter().any(|i| i == "collections.abc"));
        assert!(imports.iter().any(|i| i == "utils"));
    }

    #[test]
    fn extract_go_imports_basic() {
        let content = r#"
package main

import "fmt"
import (
    "os"
    "strings"
)
"#;
        let imports = AstParser::extract_go_imports(content);
        assert!(imports.iter().any(|i| i == "fmt"));
        assert!(imports.iter().any(|i| i == "os"));
        assert!(imports.iter().any(|i| i == "strings"));
    }
}
