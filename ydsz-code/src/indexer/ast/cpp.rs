//! # C/C++ 语言 AST 符号提取（P2-10）

use std::path::Path;

use tree_sitter::Tree;

pub use tree_sitter_cpp::LANGUAGE;

use crate::indexer::service::{SymbolEntry, SymbolKind};
use super::make_entry;

/// 从 C++ 源代码提取符号
pub fn extract(file: &Path, source: &str, tree: &Tree, symbols: &mut Vec<SymbolEntry>) {
    let root = tree.root_node();
    walk(file, source, &root, symbols);
}

/// 从 C 源代码提取符号（复用 C++ parser）
pub fn extract_c(file: &Path, source: &str, tree: &Tree, symbols: &mut Vec<SymbolEntry>) {
    extract(file, source, tree, symbols);
}

fn extract_cpp_name<'a>(source: &'a str, node: &tree_sitter::Node) -> Option<&'a str> {
    if let Some(n) = node.child_by_field_name("name") {
        return Some(&source[n.byte_range()]);
    }
    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        if matches!(child.kind(), "identifier" | "type_identifier" | "namespace_identifier") {
            return Some(&source[child.byte_range()]);
        }
    }
    None
}

fn walk(file: &Path, source: &str, node: &tree_sitter::Node, out: &mut Vec<SymbolEntry>) {
    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        match child.kind() {
            "function_definition" => {
                if let Some(name) = extract_cpp_name(source, &child) {
                    out.push(make_entry(file, name.to_string(), SymbolKind::Function, &child));
                }
            }
            "class_specifier" => {
                if let Some(name) = extract_cpp_name(source, &child) {
                    out.push(make_entry(file, name.to_string(), SymbolKind::Class, &child));
                }
            }
            "struct_specifier" => {
                if let Some(name) = extract_cpp_name(source, &child) {
                    out.push(make_entry(file, name.to_string(), SymbolKind::Class, &child));
                }
            }
            "enum_specifier" => {
                if let Some(name) = extract_cpp_name(source, &child) {
                    out.push(make_entry(file, name.to_string(), SymbolKind::Type, &child));
                }
            }
            "type_definition" => {
                if let Some(name) = extract_cpp_name(source, &child) {
                    out.push(make_entry(file, name.to_string(), SymbolKind::Type, &child));
                }
            }
            "namespace_definition" => {
                if let Some(name) = extract_cpp_name(source, &child) {
                    out.push(make_entry(file, name.to_string(), SymbolKind::Module, &child));
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
    fn test_extract_cpp_symbols() {
        let code = r#"
class Rectangle {
public:
    double area() { return 0; }
};

struct Point { int x; int y; };

enum Color { Red, Green, Blue };

namespace utils {
    int max(int a, int b) { return a > b ? a : b; }
}

int main() { return 0; }
"#;

        let mut parser = tree_sitter::Parser::new();
        parser.set_language(&LANGUAGE.into()).expect("设置语言失败");

        let tree = parser.parse(code, None).expect("解析失败");
        let mut symbols = Vec::new();
        extract(Path::new("test.cpp"), code, &tree, &mut symbols);

        assert!(symbols.iter().any(|s| s.name == "Rectangle"));
        assert!(symbols.iter().any(|s| s.name == "Point"));
        assert!(symbols.iter().any(|s| s.name == "Color"));
        assert!(symbols.iter().any(|s| s.name == "utils"));
        assert!(symbols.iter().any(|s| s.name == "main"));
    }
}
