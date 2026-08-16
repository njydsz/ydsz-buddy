//! # AST-Grep 预设模式
//!
//! 把"AST-Grep 最常用的代码模式"打包成命名预设，用户可一键调用。
//!
//! ## 设计目标
//!
//! - **降低门槛**：用户不需要懂 tree-sitter S-expression 语法
//! - **可扩展**：通过 `Preset` 枚举新增模式，无需改前端
//! - **跨语言一致**：TS / Rust / Python 都有对应的预设

use serde::Serialize;
use tree_sitter::Language;

use super::super::ast::Language as AstLanguage;

/// 预设模式枚举
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Preset {
    /// 所有 `console.log(...)` 调用
    ConsoleLog,
    /// 所有 `console.error(...)` 调用
    ConsoleError,
    /// 所有 `await fetch(...)` 调用
    AwaitFetch,
    /// 所有 `try { ... } catch { ... }` 语句
    TryCatch,
    /// 所有 `TODO(...)` / `FIXME(...)` 注释
    TodoComment,
    /// Rust: 所有 `unwrap()` 调用
    RustUnwrap,
    /// Rust: 所有 `expect("...")` 调用
    RustExpect,
    /// Python: 所有 `print(...)` 调用
    PyPrint,
    /// Python: 所有 `except:` 异常处理
    PyExcept,
}

impl Preset {
    /// 预设的"显示名"（用于 UI 展示）
    pub fn display_name(self) -> &'static str {
        match self {
            Preset::ConsoleLog => "console.log 调用",
            Preset::ConsoleError => "console.error 调用",
            Preset::AwaitFetch => "await fetch 调用",
            Preset::TryCatch => "try/catch 语句",
            Preset::TodoComment => "TODO/FIXME 注释",
            Preset::RustUnwrap => "Rust .unwrap() 调用",
            Preset::RustExpect => "Rust .expect() 调用",
            Preset::PyPrint => "Python print() 调用",
            Preset::PyExcept => "Python except 异常处理",
        }
    }

    /// 预设支持的语言
    pub fn supported_languages(self) -> &'static [AstLanguage] {
        match self {
            Preset::ConsoleLog | Preset::ConsoleError => {
                &[AstLanguage::TypeScript, AstLanguage::JavaScript]
            }
            Preset::AwaitFetch | Preset::TryCatch => &[
                AstLanguage::TypeScript,
                AstLanguage::JavaScript,
                AstLanguage::Python,
                AstLanguage::Rust,
            ],
            Preset::TodoComment => &[
                AstLanguage::TypeScript,
                AstLanguage::JavaScript,
                AstLanguage::Python,
                AstLanguage::Rust,
            ],
            Preset::RustUnwrap | Preset::RustExpect => &[AstLanguage::Rust],
            Preset::PyPrint | Preset::PyExcept => &[AstLanguage::Python],
        }
    }

    /// 预设对应的 S-expression 查询（不含 @ 捕获，按预设需求可加）
    pub fn query_for(self, lang: AstLanguage) -> Option<String> {
        match (self, lang) {
            (Preset::ConsoleLog, AstLanguage::TypeScript | AstLanguage::JavaScript) => Some(
                r#"(call_expression
                    function: (member_expression
                        object: (identifier) @obj
                        property: (property_identifier) @prop)
                    arguments: (arguments (_) @arg)
                    (#eq? @obj "console")
                    (#eq? @prop "log"))"#
                    .to_string(),
            ),
            (Preset::ConsoleError, AstLanguage::TypeScript | AstLanguage::JavaScript) => Some(
                r#"(call_expression
                    function: (member_expression
                        object: (identifier) @obj
                        property: (property_identifier) @prop)
                    arguments: (arguments (_) @arg)
                    (#eq? @obj "console")
                    (#eq? @prop "error"))"#
                    .to_string(),
            ),
            (Preset::AwaitFetch, AstLanguage::TypeScript | AstLanguage::JavaScript) => Some(
                r#"(await_expression
                    argument: (call_expression
                        function: (identifier) @fn)
                    (#eq? @fn "fetch"))"#
                    .to_string(),
            ),
            (Preset::AwaitFetch, AstLanguage::Python) => Some(
                r#"(await
                    (call
                        function: (identifier) @fn)
                    (#eq? @fn "fetch"))"#
                    .to_string(),
            ),
            (Preset::AwaitFetch, AstLanguage::Rust) => Some(
                r#"(call_expression
                    function: (identifier) @fn
                    arguments: (arguments (await_token) (_))
                    (#eq? @fn "fetch"))"#
                    .to_string(),
            ),
            (Preset::TryCatch, AstLanguage::TypeScript | AstLanguage::JavaScript) => {
                Some(r#"(try_statement)"#.to_string())
            }
            (Preset::TryCatch, AstLanguage::Python) => {
                Some(r#"(try_statement)"#.to_string())
            }
            (Preset::TryCatch, AstLanguage::Rust) => {
                // Rust 无 try/catch，但有 ? 操作符
                Some(r#"((try_expression) (.await))"#.to_string())
            }
            (Preset::TodoComment, _) => Some(r#"(comment)"#.to_string()),
            (Preset::RustUnwrap, AstLanguage::Rust) => Some(
                r#"(call_expression
                    function: (field_expression
                        field: (field_identifier) @method)
                    (#eq? @method "unwrap"))"#
                    .to_string(),
            ),
            (Preset::RustExpect, AstLanguage::Rust) => Some(
                r#"(call_expression
                    function: (field_expression
                        field: (field_identifier) @method)
                    arguments: (arguments (string_literal) @msg)
                    (#eq? @method "expect"))"#
                    .to_string(),
            ),
            (Preset::PyPrint, AstLanguage::Python) => Some(
                r#"(call
                    function: (identifier) @fn
                    (#eq? @fn "print"))"#
                    .to_string(),
            ),
            (Preset::PyExcept, AstLanguage::Python) => Some(r#"(except_clause)"#.to_string()),
            _ => None,
        }
    }

    /// 预设列表（用于 UI 生成选项）
    pub fn all() -> &'static [Preset] {
        &[
            Preset::ConsoleLog,
            Preset::ConsoleError,
            Preset::AwaitFetch,
            Preset::TryCatch,
            Preset::TodoComment,
            Preset::RustUnwrap,
            Preset::RustExpect,
            Preset::PyPrint,
            Preset::PyExcept,
        ]
    }
}

/// 提取目标语言对应的 tree-sitter Language 引用（用于 query 编译）
pub fn language_ref(lang: AstLanguage) -> Language {
    lang.language_ref()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preset_console_log_has_ts_query() {
        let q = Preset::ConsoleLog.query_for(AstLanguage::TypeScript).unwrap();
        assert!(q.contains("console"));
        assert!(q.contains("log"));
    }

    #[test]
    fn preset_rust_unwrap_works_for_rust_only() {
        let langs = Preset::RustUnwrap.supported_languages();
        assert_eq!(langs, &[AstLanguage::Rust]);
        assert!(Preset::RustUnwrap.query_for(AstLanguage::Rust).is_some());
        assert!(Preset::RustUnwrap.query_for(AstLanguage::TypeScript).is_none());
    }

    #[test]
    fn preset_py_print_works_for_python() {
        let q = Preset::PyPrint.query_for(AstLanguage::Python).unwrap();
        assert!(q.contains("print"));
    }

    #[test]
    fn all_presets_have_display_name() {
        for p in Preset::all() {
            assert!(!p.display_name().is_empty());
        }
    }
}
