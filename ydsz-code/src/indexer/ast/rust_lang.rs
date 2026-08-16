//! # Rust AST 符号提取

use std::path::Path;

use tree_sitter::Tree;

pub use tree_sitter_rust::LANGUAGE;

use super::super::service::{SymbolEntry, SymbolKind};
use super::make_entry;

/// 从函数/方法/类型节点提取 name（先看字段，再回退到第一个 identifier 子节点）
fn extract_rust_name<'a>(source: &'a str, node: &tree_sitter::Node) -> Option<&'a str> {
    if let Some(n) = node.child_by_field_name("name") {
        return Some(&source[n.byte_range()]);
    }
    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        if child.kind() == "identifier" || child.kind() == "type_identifier" {
            return Some(&source[child.byte_range()]);
        }
    }
    None
}

/// 从 Rust 源码提取顶层符号
pub fn extract(file: &Path, source: &str, tree: &Tree, out: &mut Vec<SymbolEntry>) {
    let root = tree.root_node();
    walk(file, source, &root, out, None);
}

fn walk(
    file: &Path,
    source: &str,
    node: &tree_sitter::Node,
    out: &mut Vec<SymbolEntry>,
    parent_impl: Option<&str>,
) {
    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        match child.kind() {
            // 函数定义：fn foo() {}
            "function_item" => {
                if let Some(name) = extract_rust_name(source, &child) {
                    let full = match parent_impl {
                        Some(t) => format!("{}::{}", t, name),
                        None => name.to_string(),
                    };
                    out.push(make_entry(file, full, SymbolKind::Function, &child));
                }
            }
            // 结构体：struct Foo {}
            "struct_item" => {
                if let Some(name) = extract_rust_name(source, &child) {
                    out.push(make_entry(file, name.to_string(), SymbolKind::Class, &child));
                }
            }
            // 枚举：enum E { ... }
            "enum_item" => {
                if let Some(name) = extract_rust_name(source, &child) {
                    out.push(make_entry(file, name.to_string(), SymbolKind::Type, &child));
                }
            }
            // Trait：trait T { ... }
            "trait_item" => {
                if let Some(name) = extract_rust_name(source, &child) {
                    out.push(make_entry(
                        file,
                        name.to_string(),
                        SymbolKind::Interface,
                        &child,
                    ));
                }
            }
            // 类型别名：type T = ...;
            "type_item" => {
                if let Some(name) = extract_rust_name(source, &child) {
                    out.push(make_entry(file, name.to_string(), SymbolKind::Type, &child));
                }
            }
            // impl 块：impl Foo { ... } 或 impl Trait for Type { ... }
            "impl_item" => {
                // impl Trait for Type 时优先用 trait 名称作命名空间（语义上方法属于 trait）
                // impl Type 时则用 type 名称
                let impl_target = child
                    .child_by_field_name("trait")
                    .map(|n| &source[n.byte_range()])
                    .or_else(|| {
                        child
                            .child_by_field_name("type")
                            .map(|n| &source[n.byte_range()])
                    });
                if let Some(target) = impl_target {
                    if let Some(body) = child.child_by_field_name("body") {
                        walk(file, source, &body, out, Some(target));
                    }
                }
            }
            // 模块：mod foo { ... }
            "mod_item" => {
                if let Some(name) = extract_rust_name(source, &child) {
                    out.push(make_entry(file, name.to_string(), SymbolKind::Module, &child));
                }
            }
            // 静态变量：static FOO: ... = ...;
            "static_item" => {
                if let Some(name) = extract_rust_name(source, &child) {
                    out.push(make_entry(
                        file,
                        name.to_string(),
                        SymbolKind::Variable,
                        &child,
                    ));
                }
            }
            // 常量：const FOO: ... = ...;
            "const_item" => {
                if let Some(name) = extract_rust_name(source, &child) {
                    out.push(make_entry(
                        file,
                        name.to_string(),
                        SymbolKind::Variable,
                        &child,
                    ));
                }
            }
            _ => {}
        }
    }
}
