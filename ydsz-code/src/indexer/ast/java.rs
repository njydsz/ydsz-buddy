//! # Java 语言 AST 符号提取（P2-10）

use std::path::Path;

use tree_sitter::Tree;

pub use tree_sitter_java::LANGUAGE;

use crate::indexer::service::{SymbolEntry, SymbolKind};
use super::make_entry;

/// 从 Java 源代码提取符号
pub fn extract(file: &Path, source: &str, tree: &Tree, symbols: &mut Vec<SymbolEntry>) {
    let root = tree.root_node();
    walk(file, source, &root, symbols);
}

fn extract_java_name<'a>(source: &'a str, node: &tree_sitter::Node) -> Option<&'a str> {
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

fn walk(file: &Path, source: &str, node: &tree_sitter::Node, out: &mut Vec<SymbolEntry>) {
    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        match child.kind() {
            "class_declaration" => {
                if let Some(name) = extract_java_name(source, &child) {
                    out.push(make_entry(file, name.to_string(), SymbolKind::Class, &child));
                }
            }
            "interface_declaration" => {
                if let Some(name) = extract_java_name(source, &child) {
                    out.push(make_entry(file, name.to_string(), SymbolKind::Interface, &child));
                }
            }
            "enum_declaration" => {
                if let Some(name) = extract_java_name(source, &child) {
                    out.push(make_entry(file, name.to_string(), SymbolKind::Type, &child));
                }
            }
            "method_declaration" => {
                if let Some(name) = extract_java_name(source, &child) {
                    out.push(make_entry(file, name.to_string(), SymbolKind::Method, &child));
                }
            }
            "constructor_declaration" => {
                if let Some(name) = extract_java_name(source, &child) {
                    out.push(make_entry(file, name.to_string(), SymbolKind::Function, &child));
                }
            }
            "field_declaration" => {
                if let Some(name) = extract_java_name(source, &child) {
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
    fn test_extract_java_symbols() {
        let code = r#"
public class Calculator {
    private double result;

    public Calculator() { this.result = 0.0; }

    public double add(double a, double b) { return a + b; }
}

interface MathOperation { double execute(double a, double b); }

enum Operation { ADD, SUBTRACT }
"#;

        let mut parser = tree_sitter::Parser::new();
        parser.set_language(&LANGUAGE.into()).expect("设置语言失败");

        let tree = parser.parse(code, None).expect("解析失败");
        let mut symbols = Vec::new();
        extract(Path::new("Calculator.java"), code, &tree, &mut symbols);

        assert!(symbols.iter().any(|s| s.name == "Calculator"));
        assert!(symbols.iter().any(|s| s.name == "add"));
        assert!(symbols.iter().any(|s| s.name == "MathOperation"));
        assert!(symbols.iter().any(|s| s.name == "Operation"));
    }
}
