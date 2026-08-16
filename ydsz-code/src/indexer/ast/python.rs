//! # Python AST 符号提取

use std::path::Path;

use tree_sitter::Tree;

pub use tree_sitter_python::LANGUAGE;

use super::super::service::{SymbolEntry, SymbolKind};
use super::make_entry;

/// 从 Python 节点提取 name（先看字段，再回退第一个 identifier 子节点）
fn extract_python_name<'a>(source: &'a str, node: &tree_sitter::Node) -> Option<&'a str> {
    if let Some(n) = node.child_by_field_name("name") {
        return Some(&source[n.byte_range()]);
    }
    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        if child.kind() == "identifier" {
            return Some(&source[child.byte_range()]);
        }
    }
    None
}

/// 从 Python 源码提取顶层符号
pub fn extract(file: &Path, source: &str, tree: &Tree, out: &mut Vec<SymbolEntry>) {
    let root = tree.root_node();
    walk(file, source, &root, out, None);
}

fn walk(
    file: &Path,
    source: &str,
    node: &tree_sitter::Node,
    out: &mut Vec<SymbolEntry>,
    parent_class: Option<&str>,
) {
    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        match child.kind() {
            // 函数定义：def foo(): 或 async def foo():
            "function_definition" => {
                if let Some(name) = extract_python_name(source, &child) {
                    let full = match parent_class {
                        Some(c) => format!("{}.{}", c, name),
                        None => name.to_string(),
                    };
                    out.push(make_entry(file, full, SymbolKind::Function, &child));
                }
            }
            // 类定义：class Foo(Base): ...
            "class_definition" => {
                if let Some(name) = extract_python_name(source, &child) {
                    let class_name = name.to_string();
                    out.push(make_entry(
                        file,
                        class_name.clone(),
                        SymbolKind::Class,
                        &child,
                    ));
                    if let Some(body) = child.child_by_field_name("body") {
                        walk(file, source, &body, out, Some(&class_name));
                    }
                }
            }
            // 装饰器定义的解包：@decorator / def foo
            "decorated_definition" => {
                if let Some(def) = child.child_by_field_name("definition") {
                    let mut sub_cursor = def.walk();
                    for sub in def.children(&mut sub_cursor) {
                        if sub.kind() == "function_definition"
                            || sub.kind() == "class_definition"
                        {
                            if let Some(name) = extract_python_name(source, &sub) {
                                let kind = if sub.kind() == "class_definition" {
                                    SymbolKind::Class
                                } else {
                                    SymbolKind::Function
                                };
                                out.push(make_entry(file, name.to_string(), kind, &sub));
                            }
                        }
                    }
                }
            }
            // import 语句
            "import_statement" | "import_from_statement" => {
                if let Some(name) = child.child_by_field_name("name") {
                    out.push(make_entry(
                        file,
                        source[name.byte_range()].to_string(),
                        SymbolKind::Module,
                        &child,
                    ));
                }
            }
            // 顶层变量赋值
            "expression_statement" if parent_class.is_none() => {
                let mut sub_cursor = child.walk();
                for sub in child.children(&mut sub_cursor) {
                    if sub.kind() == "assignment" {
                        if let Some(left) = sub.child_by_field_name("left") {
                            if left.kind() == "identifier" {
                                out.push(make_entry(
                                    file,
                                    source[left.byte_range()].to_string(),
                                    SymbolKind::Variable,
                                    &sub,
                                ));
                            }
                        }
                    }
                }
            }
            _ => {}
        }
    }
}
