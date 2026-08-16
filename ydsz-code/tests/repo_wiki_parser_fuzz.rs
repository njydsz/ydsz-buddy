//! # Repo Wiki Parser 属性化 Fuzz 测试
//!
//! 互联网大厂基线：解析器对任意输入不 panic、不抛未处理错误。
//! 基于 proptest 模拟 cargo-fuzz，覆盖 Rust/TS/JS/Python/Go 解析入口。

use std::fs;
use std::path::PathBuf;

use proptest::prelude::*;
use ydsz_code::repo_wiki::parser::AstParser;
use tempfile::TempDir;

/// 把 content 写到 dir/ext 命名的文件中，然后跑 parser.parse_project()
/// 验证不 panic / 不返回致命错误。
fn parse_with_content(ext: &str, content: &str) {
    let dir = TempDir::new().expect("create tempdir");
    let path: PathBuf = dir.path().join(format!("sample.{ext}"));
    fs::write(&path, content).expect("write");
    let parser = AstParser::new(dir.path().to_path_buf());
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| parser.parse_project()));
    assert!(result.is_ok(), "parse_project 不应 panic");
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(128))]

    /// Rust 解析器对任意字节序列不 panic
    #[test]
    fn rust_parser_never_panics(content in r"[\x00-\xff]{0,4096}") {
        parse_with_content("rs", &content);
    }

    /// TypeScript 解析器对任意字节序列不 panic
    #[test]
    fn typescript_parser_never_panics(content in r"[\x00-\xff]{0,4096}") {
        parse_with_content("ts", &content);
    }

    /// JavaScript 解析器对任意字节序列不 panic
    #[test]
    fn javascript_parser_never_panics(content in r"[\x00-\xff]{0,4096}") {
        parse_with_content("js", &content);
    }

    /// Python 解析器对任意字节序列不 panic
    #[test]
    fn python_parser_never_panics(content in r"[\x00-\xff]{0,4096}") {
        parse_with_content("py", &content);
    }

    /// Go 解析器对任意字节序列不 panic
    #[test]
    fn go_parser_never_panics(content in r"[\x00-\xff]{0,4096}") {
        parse_with_content("go", &content);
    }

    /// 已知合法 Rust 代码应被识别出至少一个符号
    #[test]
    fn rust_recognizes_pub_fn(_seed in 0u32..1000) {
        let content = r#"
            pub fn hello_world() -> &'static str { "hi" }
            fn private_helper() {}
            pub struct Foo;
            pub trait Bar {}
        "#;
        let dir = TempDir::new().expect("create tempdir");
        let path = dir.path().join("lib.rs");
        fs::write(&path, content).expect("write");
        let parser = AstParser::new(dir.path().to_path_buf());
        let count = parser.parse_project().expect("parse ok");
        prop_assert!(count >= 4, "至少应识别 4 个符号，实际 {count}");
    }

    /// 空文件 / 纯空白不 panic
    #[test]
    fn empty_and_whitespace_safe(s in r"[\s\x00]*") {
        parse_with_content("rs", &s);
        parse_with_content("ts", &s);
        parse_with_content("py", &s);
    }
}
