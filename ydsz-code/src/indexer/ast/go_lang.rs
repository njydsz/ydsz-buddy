//! # Go 语言 AST 符号提取（P2-10）

use std::path::Path;

use tree_sitter::Tree;

pub use tree_sitter_go::LANGUAGE;

use crate::indexer::service::{SymbolEntry, SymbolKind};
use super::make_entry;

/// 从 Go 源码提取符号
pub fn extract(file: &Path, source: &str, tree: &Tree, symbols: &mut Vec<SymbolEntry>) {
    let root = tree.root_node();
    walk(file, source, &root, symbols);
}

fn extract_go_name<'a>(source: &'a str, node: &tree_sitter::Node) -> Option<&'a str> {
    if let Some(n) = node.child_by_field_name("name") {
        return Some(&source[n.byte_range()]);
    }
    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        if matches!(child.kind(), "identifier" | "type_identifier" | "field_identifier") {
            return Some(&source[child.byte_range()]);
        }
    }
    None
}

fn walk(file: &Path, source: &str, node: &tree_sitter::Node, out: &mut Vec<SymbolEntry>) {
    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        match child.kind() {
            "function_declaration" => {
                if let Some(name) = extract_go_name(source, &child) {
                    out.push(make_entry(file, name.to_string(), SymbolKind::Function, &child));
                }
            }
            "method_declaration" => {
                if let Some(name) = extract_go_name(source, &child) {
                    out.push(make_entry(file, name.to_string(), SymbolKind::Method, &child));
                }
            }
            "type_spec" => {
                if let Some(name) = extract_go_name(source, &child) {
                    let kind = match child
                        .child_by_field_name("type")
                        .map(|t| t.kind())
                    {
                        Some("struct_type") => SymbolKind::Class,
                        Some("interface_type") => SymbolKind::Interface,
                        _ => SymbolKind::Type,
                    };
                    out.push(make_entry(file, name.to_string(), kind, &child));
                }
            }
            "var_spec" | "const_spec" => {
                if let Some(name) = extract_go_name(source, &child) {
                    out.push(make_entry(file, name.to_string(), SymbolKind::Variable, &child));
                }
            }
            _ => {
                walk(file, source, &child, out);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_language_available() {
        let lang: tree_sitter::Language = LANGUAGE.into();
        assert!(lang.node_kind_count() > 0);
    }

    #[test]
    fn test_extract_go_symbols() {
        let code = r#"
package main

import "fmt"

func add(a, b int) int {
    return a + b
}

type Person struct {
    Name string
    Age  int
}

func (p *Person) Greet() string {
    return fmt.Sprintf("Hello, %s", p.Name)
}

var count = 0

const MaxSize = 100
"#;

        let mut parser = tree_sitter::Parser::new();
        parser
            .set_language(&LANGUAGE.into())
            .expect("设置语言失败");

        let tree = parser.parse(code, None).expect("解析失败");
        let mut symbols = Vec::new();
        let path = Path::new("test.go");
        extract(path, code, &tree, &mut symbols);

        assert!(symbols.iter().any(|s| s.name == "add"));
        assert!(symbols.iter().any(|s| s.name == "Person"));
        assert!(symbols.iter().any(|s| s.name == "Greet"));
    }
}
