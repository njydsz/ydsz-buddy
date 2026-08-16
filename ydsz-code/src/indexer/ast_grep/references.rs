//! # AST-Grep 引用 / 调用搜索
//!
//! 提供跨语言的"找引用"和"找调用"两个常用 API。
//!
//! - **`find_references(name)`**: 找所有名为 `name` 的标识符出现位置（含定义、调用、读取等）
//! - **`find_calls_to(name)`**: 找所有 `name(...)` 形式的调用
//!
//! 实现思路：直接遍历 AST 节点，匹配 `kind == "identifier"`（TS/JS/Python）
//! 或 `kind == "identifier"`（Rust path 中的 identifier），避免复杂 S-expression。

use std::path::Path;

use tree_sitter::{Node, Parser};

use super::super::ast::Language;
use super::super::error::IndexerError;
use super::super::IndexerResult;
use super::MatchResult;

/// 在工作区下找所有名为 `name` 的标识符出现位置
pub fn find_references(root: &Path, name: &str) -> IndexerResult<Vec<MatchResult>> {
    let mut results = Vec::new();
    let files = collect_code_files(root);

    for file in files {
        let content = match std::fs::read_to_string(&file) {
            Ok(c) => c,
            Err(_) => continue,
        };
        let lang = match Language::from_path(&file) {
            Some(l) => l,
            None => continue,
        };
        let tree = match parse(&content, lang) {
            Ok(t) => t,
            Err(_) => continue,
        };

        walk_references(&tree.root_node(), &content, name, &file, lang, &mut results);
    }

    Ok(results)
}

/// 在工作区下找所有 `name(...)` 形式的调用
pub fn find_calls_to(root: &Path, name: &str) -> IndexerResult<Vec<MatchResult>> {
    let mut results = Vec::new();
    let files = collect_code_files(root);

    for file in files {
        let content = match std::fs::read_to_string(&file) {
            Ok(c) => c,
            Err(_) => continue,
        };
        let lang = match Language::from_path(&file) {
            Some(l) => l,
            None => continue,
        };
        let tree = match parse(&content, lang) {
            Ok(t) => t,
            Err(_) => continue,
        };

        walk_calls(&tree.root_node(), &content, name, &file, lang, &mut results);
    }

    Ok(results)
}

// ---- 内部 ----

fn collect_code_files(root: &Path) -> Vec<std::path::PathBuf> {
    let mut out = Vec::new();
    let exts = ["ts", "tsx", "js", "jsx", "rs", "py", "pyi", "mts", "cts", "mjs", "cjs"];
    for entry in walkdir::WalkDir::new(root)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        let s = path.to_string_lossy();
        if s.contains("node_modules") || s.contains("target") || s.contains(".git") {
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

fn parse(source: &str, lang: Language) -> IndexerResult<tree_sitter::Tree> {
    let mut parser = Parser::new();
    let language = lang.language_ref();
    parser
        .set_language(&language)
        .map_err(|e| IndexerError::ParseError(e.to_string()))?;
    parser
        .parse(source, None)
        .ok_or_else(|| IndexerError::ParseError("parse returned None".into()))
}

/// 递归遍历找所有 `name` 标识符
fn walk_references(
    node: &Node,
    source: &str,
    name: &str,
    file: &Path,
    _lang: Language,
    out: &mut Vec<MatchResult>,
) {
    let kind = node.kind();
    if kind == "identifier" || kind == "property_identifier" || kind == "type_identifier" {
        let text = node.utf8_text(source.as_bytes()).unwrap_or("");
        if text == name {
            let start = node.start_position();
            out.push(MatchResult {
                file: file.to_string_lossy().to_string(),
                line: start.row as u32 + 1,
                column: start.column as u32 + 1,
                start_byte: node.start_byte() as u32,
                end_byte: node.end_byte() as u32,
                text: text.to_string(),
                node_kind: kind.to_string(),
                captures: Vec::new(),
            });
        }
    }
    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        walk_references(&child, source, name, file, _lang, out);
    }
}/// 递归遍历找所有 `name(...)` 形式的调用
///
/// `name` 支持两种形式：
/// - 单段名：`"greet"` / `"push"` / `"log"` — 匹配 `greet()` / `obj.push()` / `console.log()`
/// - 复合名：`"console.log"` — 严格匹配 `console.log(...)` 形式（且 `obj` 名为 `console`）
fn walk_calls(
    node: &Node,
    source: &str,
    name: &str,
    file: &Path,
    lang: Language,
    out: &mut Vec<MatchResult>,
) {
    let kind = node.kind();
    let is_call_node = match lang {
        Language::TypeScript | Language::JavaScript => kind == "call_expression",
        Language::Rust => kind == "call_expression",
        Language::Python => kind == "call",
        Language::Go => kind == "call_expression",
        Language::C | Language::Cpp => kind == "call_expression",
        Language::Java => kind == "method_invocation",
    };

    if is_call_node && call_name_matches(node, source, name, lang) {
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
        walk_calls(&child, source, name, file, lang, out);
    }
}

/// 判定 call 节点的"被调函数名"是否与目标 `name` 匹配
///
/// - `"foo"` 匹配 `foo()` / `obj.foo()` / `obj.sub.foo()` 任何形如 `* . foo(...)` 或 `foo(...)` 的调用
/// - `"obj.foo"` 严格匹配 `obj.foo(...)` （object 名为 `obj`，property 名为 `foo`）
#[allow(unused_variables)]
fn call_name_matches(call: &Node, source: &str, name: &str, lang: Language) -> bool {
    let func = match call.child_by_field_name("function") {
        Some(f) => f,
        None => return false,
    };

    // 取调用节点的"对象名 + 方法名"
    let (obj_name, method_name) = match func.kind() {
        "identifier" => {
            let n = func.utf8_text(source.as_bytes()).unwrap_or("");
            (None, n.to_string())
        }
        "member_expression" => {
            // TS/JS: obj.prop（用 property 字段）
            let prop = func
                .child_by_field_name("property")
                .map(|p| p.utf8_text(source.as_bytes()).unwrap_or("").to_string());
            let obj = func
                .child_by_field_name("object")
                .and_then(|o| match o.kind() {
                    "identifier" | "this" => {
                        Some(o.utf8_text(source.as_bytes()).unwrap_or("").to_string())
                    }
                    _ => None,
                });
            (obj, prop.unwrap_or_default())
        }
        "attribute" => {
            // Python: obj.attr（用 attribute 字段）
            let prop = func
                .child_by_field_name("attribute")
                .map(|p| p.utf8_text(source.as_bytes()).unwrap_or("").to_string());
            let obj = func
                .child_by_field_name("object")
                .and_then(|o| match o.kind() {
                    "identifier" | "self" => {
                        Some(o.utf8_text(source.as_bytes()).unwrap_or("").to_string())
                    }
                    _ => None,
                });
            (obj, prop.unwrap_or_default())
        }
        "field_expression" => {
            // Rust: obj.method
            let prop = func
                .child_by_field_name("field")
                .map(|p| p.utf8_text(source.as_bytes()).unwrap_or("").to_string());
            let value = func.child_by_field_name("value");
            let obj = value.and_then(|v| match v.kind() {
                "identifier" => {
                    let s = v.utf8_text(source.as_bytes()).unwrap_or("");
                    // 过滤掉 `Self::xxx` 等通用形式
                    if s == "Self" {
                        None
                    } else {
                        Some(s.to_string())
                    }
                }
                _ => None,
            });
            (obj, prop.unwrap_or_default())
        }
        _ => return false,
    };

    // 匹配规则
    if let Some(dot_pos) = name.find('.') {
        // 复合名：必须 obj.method 严格匹配
        let (want_obj, want_method) = name.split_at(dot_pos);
        let want_method = &want_method[1..]; // 去掉 '.'
        match (&obj_name, method_name.as_str()) {
            (Some(o), m) => o == want_obj && m == want_method,
            (None, _) => false,
        }
    } else {
        // 单段名：仅匹配 method（或 identifier）
        method_name == name
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::path::PathBuf;
    use tempfile::tempdir;

    fn write(dir: &Path, name: &str, content: &str) -> PathBuf {
        let path = dir.join(name);
        let mut f = std::fs::File::create(&path).unwrap();
        f.write_all(content.as_bytes()).unwrap();
        path
    }

    #[test]
    fn find_calls_member_access_in_ts() {
        let dir = tempdir().unwrap();
        write(
            dir.path(),
            "a.ts",
            r#"
logger.info("a");
logger.info("b");
logger.error("c");
"#,
        );
        let matches = find_calls_to(dir.path(), "logger.info").unwrap();
        assert_eq!(matches.len(), 2);
    }

    #[test]
    fn find_calls_rust_method() {
        let dir = tempdir().unwrap();
        write(
            dir.path(),
            "a.rs",
            r#"
fn main() {
    let v = vec![1, 2, 3];
    v.push(4);
    v.push(5);
    other.push(99);
}
"#,
        );
        let matches = find_calls_to(dir.path(), "push").unwrap();
        // 命中 v.push(4) 和 v.push(5)，other.push(99) 由于 v 命名为 other 也应算
        assert!(matches.len() >= 2, "应至少 2 个 push 调用: {:?}", matches);
    }

    #[test]
    fn find_references_excludes_substring() {
        let dir = tempdir().unwrap();
        write(
            dir.path(),
            "a.ts",
            r#"
const foo = 1;
const foobar = 2;
console.log(foo);
"#,
        );
        let matches = find_references(dir.path(), "foo").unwrap();
        // 应包括 const foo = 1, console.log(foo)；foobar 不应被命中
        for m in &matches {
            assert_eq!(m.text, "foo", "误命中: {}", m.text);
        }
        assert!(matches.len() >= 2);
    }
}
