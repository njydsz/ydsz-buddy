//! # TypeScript/JavaScript AST 符号提取

use std::path::Path;

use tree_sitter::Tree;

/// TypeScript 解析器语言（同时用作 JavaScript 解析器，TS 是 JS 的超集）
pub use tree_sitter_typescript::LANGUAGE_TYPESCRIPT as LANGUAGE;

use super::super::service::{SymbolEntry, SymbolKind};
use super::make_entry;

/// 从 TS/JS 源码提取顶层符号
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
            // 函数声明：function foo() {}
            "function_declaration" => {
                if let Some(name) = extract_decl_name(source, &child) {
                    out.push(make_entry(file, name.to_string(), SymbolKind::Function, &child));
                }
            }
            // 生成器函数：function* foo() {}
            "generator_function_declaration" => {
                if let Some(name) = extract_decl_name(source, &child) {
                    out.push(make_entry(file, name.to_string(), SymbolKind::Function, &child));
                }
            }
            // 类声明：class Foo {}
            "class_declaration" => {
                if let Some(name) = extract_decl_name(source, &child) {
                    let class_name = name.to_string();
                    out.push(make_entry(
                        file,
                        class_name.clone(),
                        SymbolKind::Class,
                        &child,
                    ));
                    // 递归类体
                    walk_into_class_body(file, source, &child, out, &class_name);
                }
            }
            // 接口声明：interface I {}
            "interface_declaration" => {
                if let Some(name) = extract_decl_name(source, &child) {
                    out.push(make_entry(
                        file,
                        name.to_string(),
                        SymbolKind::Interface,
                        &child,
                    ));
                }
            }
            // 类型别名：type T = ...
            "type_alias_declaration" => {
                if let Some(name) = extract_decl_name(source, &child) {
                    out.push(make_entry(file, name.to_string(), SymbolKind::Type, &child));
                }
            }
            // 枚举：enum E { ... }
            "enum_declaration" => {
                if let Some(name) = extract_decl_name(source, &child) {
                    out.push(make_entry(file, name.to_string(), SymbolKind::Type, &child));
                }
            }
            // 类方法（class body 内部）
            "method_definition" => {
                if let Some(name) = extract_decl_name(source, &child) {
                    let full = match parent_class {
                        Some(c) => format!("{}.{}", c, name),
                        None => name.to_string(),
                    };
                    out.push(make_entry(file, full, SymbolKind::Method, &child));
                }
            }
            // 导出语句：export function/class/interface/type
            "export_statement" => {
                let mut sub_cursor = child.walk();
                for sub in child.children(&mut sub_cursor) {
                    if let Some(name) = extract_decl_name(source, &sub) {
                        let kind = match sub.kind() {
                            "function_declaration" | "generator_function_declaration" => {
                                SymbolKind::Function
                            }
                            "class_declaration" => SymbolKind::Class,
                            "interface_declaration" => SymbolKind::Interface,
                            "type_alias_declaration" => SymbolKind::Type,
                            "enum_declaration" => SymbolKind::Type,
                            "lexical_declaration" | "variable_declaration" => {
                                SymbolKind::Variable
                            }
                            _ => continue,
                        };
                        out.push(make_entry(file, name.to_string(), kind, &sub));
                    }
                }
            }
            // 顶层变量声明
            "lexical_declaration" | "variable_declaration" if parent_class.is_none() => {
                let mut sub_cursor = child.walk();
                for sub in child.children(&mut sub_cursor) {
                    if sub.kind() == "variable_declarator" {
                        if let Some(name) = extract_decl_name(source, &sub) {
                            out.push(make_entry(
                                file,
                                name.to_string(),
                                SymbolKind::Variable,
                                &sub,
                            ));
                        }
                    }
                }
            }
            _ => {}
        }
    }
}

/// TS 中声明节点的名字提取：先看 `name` 字段，否则遍历子节点找第一个 identifier
fn extract_decl_name<'a>(source: &'a str, node: &tree_sitter::Node) -> Option<&'a str> {
    if let Some(n) = node.child_by_field_name("name") {
        return Some(&source[n.byte_range()]);
    }
    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        if child.kind() == "identifier" || child.kind() == "property_identifier" {
            return Some(&source[child.byte_range()]);
        }
    }
    None
}

/// 把 class body 内的方法视为父类方法（用 child_by_field_name 找到 class body）
fn walk_into_class_body(
    file: &Path,
    source: &str,
    class_node: &tree_sitter::Node,
    out: &mut Vec<SymbolEntry>,
    class_name: &str,
) {
    let mut cursor = class_node.walk();
    let body = class_node
        .child_by_field_name("body")
        .or_else(|| {
            class_node
                .children(&mut cursor)
                .find(|&child| child.kind() == "class_body")
        });
    if let Some(body) = body {
        walk(file, source, &body, out, Some(class_name));
    }
}
