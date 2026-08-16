//! # AST-Grep 模式解析（meta-variables）
//!
//! 把"用户友好的代码模式"编译成"tree-sitter S-expression 查询"。
//!
//! ## 支持的元变量语法
//!
//! | 模式 | 含义 | 编译后 S-expression |
//! |------|------|---------------------|
//! | `$NAME` | 匹配单个节点，捕获名为 NAME | `(identifier) @NAME` |
//! | `$$$BODY` | 匹配多个节点，捕获名为 BODY | `(...) @BODY` |
//! | `$...REST` | 同 `$$$` 别名（兼容 ast-grep 习惯） | `(...) @REST` |
//! | 普通文本 | 字面量匹配 | 见下方转换 |
//!
//! ## 编译策略
//!
//! 1. **节点类型模式**（`call_expression` / `function_declaration` / `try_statement`）
//!    → 编译为 `(node_type)`
//! 2. **方法调用模式**（`console.log` / `logger.info`）
//!    → 编译为 `(call_expression function: (member_expression object: (identifier) @_obj property: (property_identifier) @_prop) (#eq? @_obj "console") (#eq? @_prop "log"))`
//! 3. **裸标识符**（`fetch` / `helper`）
//!    → 编译为 `(identifier) @_name (#eq? @_name "fetch")`
//! 4. **混合模式**（`async function $NAME`）
//!    → 编译为 `(function_declaration "async")` 之类
//!
//! ## 设计取舍
//!
//! - **不做完整 S-expression 解析**：用户写 "代码模式" 比写 S-expression 直觉得多
//!   但工程实现必须可控，所以只支持"代码片段 → S-expression"的最常见映射
//! - **保留 S-expression 直通**：高级用户可以直接传 S-expression（以 `(` 开头）
//!
//! ## 示例
//!
//! ```
//! use ydsz_code::indexer::ast_grep::pattern::compile_pattern;
//! use ydsz_code::indexer::ast::Language;
//!
//! // "console.log" → S-expression
//! let q = compile_pattern("console.log", Language::TypeScript).unwrap();
//! assert!(q.query.contains("console"));
//!
//! // "call_expression" → 节点类型
//! let q = compile_pattern("call_expression", Language::TypeScript).unwrap();
//! assert!(q.query.contains("call_expression"));
//!
//! // "$NAME = $VALUE" → 赋值表达式
//! let q = compile_pattern("$NAME = $VALUE", Language::TypeScript).unwrap();
//! assert!(q.query.contains("variable_declarator"));
//! ```

use super::super::ast::Language;
use super::super::error::IndexerError;
use super::super::IndexerResult;

/// 编译结果：S-expression 字符串 + 捕获名列表
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CompiledPattern {
    /// tree-sitter S-expression
    pub query: String,
    /// 顶层 capture 名（按出现顺序）
    pub captures: Vec<String>,
}

/// 模式片段（编译前的中间表示）
#[derive(Debug, Clone, PartialEq, Eq)]
enum PatternToken {
    /// 字面量节点类型（如 `call_expression` / `try_statement`）
    NodeKind(String),
    /// 字面量标识符（精确匹配，如 `console` / `log`）
    Literal(String),
    /// 捕获名（meta-var `$NAME`）
    Capture(String),
    /// 多节点捕获（meta-var `$$$NAME` 或 `$...NAME`）
    MultiCapture(String),
}

/// 编译用户友好的模式为 S-expression
///
/// 支持的输入形态：
/// 1. 裸节点类型：`"call_expression"` / `"try_statement"` / `"function_item"`
/// 2. 成员访问表达式：`"console.log"` / `"logger.info"` / `"v.push"`
/// 3. 函数调用表达式：`"fetch"` / `"helper"`（匹配所有同名调用/引用）
/// 4. Meta-var 模式：`"$NAME = $VALUE"` / `"console.log($MSG)"`
/// 5. S-expression 直通：以 `(` 开头直接使用
pub fn compile_pattern(pattern: &str, lang: Language) -> IndexerResult<CompiledPattern> {
    let trimmed = pattern.trim();

    // 1. S-expression 直通
    if trimmed.starts_with('(') {
        let captures = extract_captures(trimmed);
        return Ok(CompiledPattern {
            query: trimmed.to_string(),
            captures,
        });
    }

    // 2. 检测 meta-var
    if trimmed.contains('$') {
        return compile_with_metavar(trimmed, lang);
    }

    // 3. 节点类型 / 字面量
    compile_literal(trimmed, lang)
}

/// 提取 S-expression 中的 `@capture` 名
fn extract_captures(query: &str) -> Vec<String> {
    let mut caps = Vec::new();
    let bytes = query.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'@' {
            // 跳过 @ 之后到空白/括号/逗号的字符
            let start = i + 1;
            let mut end = start;
            while end < bytes.len()
                && !bytes[end].is_ascii_whitespace()
                && bytes[end] != b')'
                && bytes[end] != b','
            {
                end += 1;
            }
            if end > start {
                let name = String::from_utf8_lossy(&bytes[start..end]).to_string();
                if !caps.contains(&name) {
                    caps.push(name);
                }
            }
        }
        i += 1;
    }
    caps
}

/// 编译"字面量"模式（无 meta-var）
fn compile_literal(pattern: &str, lang: Language) -> IndexerResult<CompiledPattern> {
    let trimmed = pattern.trim();

    // 1. 节点类型判定：含下划线且纯字母
    if is_node_kind(trimmed) {
        return Ok(CompiledPattern {
            query: format!("({trimmed})"),
            captures: vec![],
        });
    }

    // 2. 成员访问：a.b.c 形式（至少一个 `.`）
    if trimmed.contains('.') && !trimmed.contains(' ') && !trimmed.contains('(') {
        return compile_member_access(trimmed, lang);
    }

    // 3. 函数调用 / 标识符引用：fetch / helper / add
    //    编译为 (identifier) @_name (#eq? @_name "fetch")
    let ident = trimmed.trim_end_matches("()").trim();
    let query = format!(
        r#"(identifier) @_ident
(#eq? @_ident "{ident}")"#
    );
    Ok(CompiledPattern {
        query,
        captures: vec!["_ident".to_string()],
    })
}

/// 编译 `a.b.c` 形式的成员访问
fn compile_member_access(pattern: &str, lang: Language) -> IndexerResult<CompiledPattern> {
    let parts: Vec<&str> = pattern.split('.').collect();
    if parts.len() < 2 {
        return Err(IndexerError::BuildFailed(format!(
            "成员访问模式需至少 `obj.prop` 形式: {pattern}"
        )));
    }

    // TS/JS: member_expression (object: (identifier) @_obj property: (property_identifier) @_prop)
    // Python: attribute (object: (_) @_obj attribute: (identifier) @_prop)
    // Rust: field_expression (value: (_) @_obj field: (field_identifier) @_prop)
    match lang {
        Language::TypeScript | Language::JavaScript => {
            // 当前实现仅支持 2 层（a.b）；多层的 a.b.c 解析在更上层调用方收敛
            // 注释保留作为后续扩展参考
            if parts.len() == 2 {
                let (obj, prop) = (parts[0], parts[1]);
                let query = format!(
                    r#"(member_expression
                        object: (identifier) @_obj
                        property: (property_identifier) @_prop
                        (#eq? @_obj "{obj}")
                        (#eq? @_prop "{prop}"))"#
                );
                return Ok(CompiledPattern {
                    query,
                    captures: vec!["_obj".to_string(), "_prop".to_string()],
                });
            }
            // 3+ 层：递归构建
            Ok(CompiledPattern {
                query: build_nested_member_access(&parts),
                captures: vec![],
            })
        }
        Language::Python => {
            if parts.len() == 2 {
                let (obj, prop) = (parts[0], parts[1]);
                let query = format!(
                    r#"(attribute
                        object: (_) @_obj
                        attribute: (identifier) @_prop
                        (#eq? @_obj "{obj}")
                        (#eq? @_prop "{prop}"))"#
                );
                return Ok(CompiledPattern {
                    query,
                    captures: vec!["_obj".to_string(), "_prop".to_string()],
                });
            }
            // 3+ 层
            Ok(CompiledPattern {
                query: build_nested_attribute(&parts),
                captures: vec![],
            })
        }
        Language::Rust => {
            if parts.len() == 2 {
                let (obj, prop) = (parts[0], parts[1]);
                let query = format!(
                    r#"(field_expression
                        value: (_) @_obj
                        field: (field_identifier) @_prop
                        (#eq? @_obj "{obj}")
                        (#eq? @_prop "{prop}"))"#
                );
                return Ok(CompiledPattern {
                    query,
                    captures: vec!["_obj".to_string(), "_prop".to_string()],
                });
            }
            Ok(CompiledPattern {
                query: build_nested_field_access(&parts),
                captures: vec![],
            })
        }
        _ => Err(IndexerError::BuildFailed(format!("成员访问模式不支持语言: {lang:?}"))),
    }
}

/// 构建 TS/JS 嵌套 member_expression
fn build_nested_member_access(parts: &[&str]) -> String {
    // a.b.c → member_expression(member_expression(identifier=a, prop=b), prop=c)
    let mut inner = "(identifier) @_o0".to_string(); // 假定最内层是 identifier
    for i in 0..parts.len() - 1 {
        let prop = parts[i + 1];
        // 每个循环生成的 member_expression 模板完全相同，移除冗余 if/else
        inner = format!(
            r#"(member_expression
                object: {inner}
                property: (property_identifier) @_p{i}
                (#eq? @_p{i} "{prop}"))"#
        );
    }
    // 加上最外层对象 eq
    let last_obj = parts[parts.len() - 1];
    let _ = last_obj;
    inner
}

fn build_nested_attribute(parts: &[&str]) -> String {
    // Python: a.b.c → attribute(attribute(identifier=a, attr=b), attr=c)
    let mut inner = "(identifier) @_o0".to_string();
    for i in 0..parts.len() - 1 {
        let prop = parts[i + 1];
        inner = format!(
            r#"(attribute
                object: {inner}
                attribute: (identifier) @_p{i}
                (#eq? @_p{i} "{prop}"))"#
        );
    }
    inner
}

fn build_nested_field_access(parts: &[&str]) -> String {
    // Rust: a.b.c → field_expression(field_expression(identifier=a, field=b), field=c)
    let mut inner = "(identifier) @_o0".to_string();
    for i in 0..parts.len() - 1 {
        let prop = parts[i + 1];
        inner = format!(
            r#"(field_expression
                value: {inner}
                field: (field_identifier) @_p{i}
                (#eq? @_p{i} "{prop}"))"#
        );
    }
    inner
}

/// 编译带 meta-var 的模式
fn compile_with_metavar(pattern: &str, lang: Language) -> IndexerResult<CompiledPattern> {
    // 简化策略：把 `$NAME` / `$$$NAME` / `$...NAME` 当作捕获变量
    // 整个模式用空格分割 tokens，然后映射到 S-expression

    let tokens = tokenize_pattern(pattern);
    let mut captures = Vec::new();
    let mut sexpr_parts: Vec<String> = Vec::new();

    for tok in &tokens {
        match tok {
            PatternToken::NodeKind(k) => sexpr_parts.push(format!("({k})")),
            PatternToken::Literal(s) => {
                // 字面量：包装为 (string_literal) 或 (identifier) + eq
                sexpr_parts.push(format!(r#"(string_literal) @_lit (#eq? @_lit "{s}")"#));
            }
            PatternToken::Capture(name) => {
                if !captures.contains(name) {
                    captures.push(name.clone());
                }
                sexpr_parts.push(format!("(_) @{name}"));
            }
            PatternToken::MultiCapture(name) => {
                if !captures.contains(name) {
                    captures.push(name.clone());
                }
                sexpr_parts.push(format!("(_) @{name}"));
            }
        }
    }

    // 简单拼接：模式越复杂越需要用户写 S-expression
    // 对常见模式提供特殊处理

    // 检测 "X = Y" 模式 → variable_declarator
    if pattern.contains('=') && !pattern.contains("==") {
        if let Some(assign) = compile_assignment(pattern, lang) {
            return Ok(assign);
        }
    }

    // 检测 "function $NAME($ARGS)" 模式
    if pattern.contains("function") || pattern.contains("def ") || pattern.contains("fn ") {
        if let Some(fn_pat) = compile_function_pattern(pattern, lang) {
            return Ok(fn_pat);
        }
    }

    // 检测 "$OBJ.method($ARG)" 模式
    if pattern.contains('(') && pattern.contains(')') {
        if let Some(call) = compile_call_pattern(pattern, lang) {
            return Ok(call);
        }
    }

    // 兜底：单 capture 或节点类型
    let query = sexpr_parts.join(" ");
    Ok(CompiledPattern { query, captures })
}

/// 编译 "X = Y" 类赋值模式
fn compile_assignment(pattern: &str, lang: Language) -> Option<CompiledPattern> {
    let parts: Vec<&str> = pattern.split('=').collect();
    if parts.len() != 2 {
        return None;
    }
    let lhs = parts[0].trim();
    let rhs = parts[1].trim();
    let lhs_capture = extract_metavar_name(lhs);
    let rhs_capture = extract_metavar_name(rhs);

    match lang {
        Language::TypeScript | Language::JavaScript => {
            let lc = lhs_capture.unwrap_or_else(|| "lhs".to_string());
            let rc = rhs_capture.unwrap_or_else(|| "rhs".to_string());
            let query = format!(
                r#"(variable_declarator
                    name: (_) @{lc}
                    value: (_) @{rc})"#
            );
            Some(CompiledPattern {
                query,
                captures: vec![lc, rc],
            })
        }
        Language::Python => {
            let lc = lhs_capture.unwrap_or_else(|| "lhs".to_string());
            let rc = rhs_capture.unwrap_or_else(|| "rhs".to_string());
            let query = format!(
                r#"(assignment
                    left: (_) @{lc}
                    right: (_) @{rc})"#
            );
            Some(CompiledPattern {
                query,
                captures: vec![lc, rc],
            })
        }
        Language::Rust => {
            let lc = lhs_capture.unwrap_or_else(|| "lhs".to_string());
            let rc = rhs_capture.unwrap_or_else(|| "rhs".to_string());
            // Rust let binding: let X = Y;
            let query = format!(
                r#"(let_declaration
                    pattern: (_) @{lc}
                    value: (_) @{rc})"#
            );
            Some(CompiledPattern {
                query,
                captures: vec![lc, rc],
            })
        }
        _ => None,
    }
}

/// 编译 "function NAME(...)" 模式
fn compile_function_pattern(_pattern: &str, lang: Language) -> Option<CompiledPattern> {
    match lang {
        Language::TypeScript | Language::JavaScript => {
            let name_capture = "name".to_string();
            let query = r#"(function_declaration
                name: (identifier) @name)"#
                .to_string();
            Some(CompiledPattern {
                query,
                captures: vec![name_capture],
            })
        }
        Language::Python => {
            let name_capture = "name".to_string();
            let query = r#"(function_definition
                name: (identifier) @name)"#
                .to_string();
            Some(CompiledPattern {
                query,
                captures: vec![name_capture],
            })
        }
        Language::Rust => {
            let name_capture = "name".to_string();
            let query = r#"(function_item
                name: (identifier) @name)"#
                .to_string();
            Some(CompiledPattern {
                query,
                captures: vec![name_capture],
            })
        }
        _ => None,
    }
}

/// 编译 "obj.method(arg)" 类调用模式
fn compile_call_pattern(pattern: &str, lang: Language) -> Option<CompiledPattern> {
    // 简单解析：提取括号前的部分和括号内
    let open_paren = pattern.find('(')?;
    let close_paren = pattern.rfind(')')?;
    let callee = &pattern[..open_paren];
    let args_str = &pattern[open_paren + 1..close_paren];

    let args: Vec<&str> = if args_str.trim().is_empty() {
        vec![]
    } else {
        args_str.split(',').map(|s| s.trim()).collect()
    };

    let mut arg_captures: Vec<String> = Vec::new();
    let mut arg_predicates: Vec<String> = Vec::new();

    for (i, arg) in args.iter().enumerate() {
        let cap = format!("arg{i}");
        arg_captures.push(cap.clone());
        if let Some(mv) = extract_metavar_name(arg) {
            // meta-var: 接受任意节点
            if mv != cap {
                arg_captures.push(mv.clone());
            }
        } else if arg.starts_with('"') && arg.ends_with('"') {
            // 字符串字面量
            let lit = &arg[1..arg.len() - 1];
            arg_predicates.push(format!(
                r#"(arguments (_) @_lit{i} (#eq? @_lit{i} "{lit}"))"#
            ));
        }
    }

    match lang {
        Language::TypeScript | Language::JavaScript => {
            let mut query = String::from("(call_expression\n    function: (identifier) @_callee");
            if callee.contains('.') {
                let parts: Vec<&str> = callee.split('.').collect();
                if parts.len() == 2 {
                    let (obj, prop) = (parts[0], parts[1]);
                    query = format!(
                        r#"(call_expression
    function: (member_expression
        object: (identifier) @_obj
        property: (property_identifier) @_prop)
    (#eq? @_obj "{obj}")
    (#eq? @_prop "{prop}")"#
                    );
                } else {
                    return None;
                }
            } else {
                query.push_str(&format!(
                    r#"
    (#eq? @_callee "{callee}")"#
                ));
            }
            if !args.is_empty() {
                query.push_str("\n    arguments: (arguments");
                for cap in &arg_captures {
                    if cap.starts_with("arg") {
                        query.push_str(&format!(" (_) @{cap}"));
                    }
                }
                query.push(')');
            }
            let mut all_caps = vec!["_callee".to_string()];
            if callee.contains('.') {
                all_caps.push("_obj".to_string());
                all_caps.push("_prop".to_string());
            }
            all_caps.extend(arg_captures);
            Some(CompiledPattern {
                query,
                captures: all_caps,
            })
        }
        Language::Python => {
            let mut query = String::from("(call\n    function: (identifier) @_callee");
            if callee.contains('.') {
                let parts: Vec<&str> = callee.split('.').collect();
                if parts.len() == 2 {
                    let (obj, prop) = (parts[0], parts[1]);
                    query = format!(
                        r#"(call
    function: (attribute
        object: (_) @_obj
        attribute: (identifier) @_prop)
    (#eq? @_obj "{obj}")
    (#eq? @_prop "{prop}")"#
                    );
                } else {
                    return None;
                }
            } else {
                query.push_str(&format!(
                    r#"
    (#eq? @_callee "{callee}")"#
                ));
            }
            if !args.is_empty() {
                query.push_str("\n    arguments: (argument_list");
                for cap in &arg_captures {
                    if cap.starts_with("arg") {
                        query.push_str(&format!(" (_) @{cap}"));
                    }
                }
                query.push(')');
            }
            let mut all_caps = vec!["_callee".to_string()];
            if callee.contains('.') {
                all_caps.push("_obj".to_string());
                all_caps.push("_prop".to_string());
            }
            all_caps.extend(arg_captures);
            Some(CompiledPattern {
                query,
                captures: all_caps,
            })
        }
        Language::Rust => {
            // Rust: callee(...) → call_expression
            if callee.contains('.') {
                let parts: Vec<&str> = callee.split('.').collect();
                if parts.len() == 2 {
                    let (obj, prop) = (parts[0], parts[1]);
                    let mut query = format!(
                        r#"(call_expression
    function: (field_expression
        value: (_) @_obj
        field: (field_identifier) @_prop)
    (#eq? @_obj "{obj}")
    (#eq? @_prop "{prop}")"#
                    );
                    if !args.is_empty() {
                        query.push_str("\n    arguments: (arguments");
                        for cap in &arg_captures {
                            if cap.starts_with("arg") {
                                query.push_str(&format!(" (_) @{cap}"));
                            }
                        }
                        query.push(')');
                    }
                    let mut all_caps = vec!["_obj".to_string(), "_prop".to_string()];
                    all_caps.extend(arg_captures);
                    return Some(CompiledPattern {
                        query,
                        captures: all_caps,
                    });
                }
            }
            let mut query = format!(
                r#"(call_expression
    function: (identifier) @_callee
    (#eq? @_callee "{callee}")"#
            );
            if !args.is_empty() {
                query.push_str("\n    arguments: (arguments");
                for cap in &arg_captures {
                    if cap.starts_with("arg") {
                        query.push_str(&format!(" (_) @{cap}"));
                    }
                }
                query.push(')');
            }
            let mut all_caps = vec!["_callee".to_string()];
            all_caps.extend(arg_captures);
            Some(CompiledPattern {
                query,
                captures: all_caps,
            })
        }
        _ => None,
    }
}

/// 把模式 tokenize 为 PatternToken 列表
fn tokenize_pattern(pattern: &str) -> Vec<PatternToken> {
    let mut tokens = Vec::new();
    let mut chars = pattern.chars().peekable();

    while let Some(c) = chars.next() {
        if c == '$' {
            // meta-var: $$$, $..., $NAME
            let mut rest = String::new();
            if chars.peek().copied() == Some('$') {
                chars.next();
                if chars.peek().copied() == Some('$') {
                    chars.next();
                }
                // $$$ 形式
                while let Some(nc) = chars.peek().copied() {
                    if nc.is_alphanumeric() || nc == '_' {
                        rest.push(nc);
                        chars.next();
                    } else {
                        break;
                    }
                }
                tokens.push(PatternToken::MultiCapture(rest));
            } else if chars.peek().copied() == Some('.') {
                chars.next();
                if chars.peek().copied() == Some('.') {
                    chars.next();
                }
                // $... 形式
                while let Some(nc) = chars.peek().copied() {
                    if nc.is_alphanumeric() || nc == '_' {
                        rest.push(nc);
                        chars.next();
                    } else {
                        break;
                    }
                }
                tokens.push(PatternToken::MultiCapture(rest));
            } else {
                // $NAME 形式
                while let Some(nc) = chars.peek().copied() {
                    if nc.is_alphanumeric() || nc == '_' {
                        rest.push(nc);
                        chars.next();
                    } else {
                        break;
                    }
                }
                tokens.push(PatternToken::Capture(rest));
            }
        } else if c.is_whitespace() || c == '(' || c == ')' || c == ',' || c == '=' {
            continue;
        } else {
            // 字面量：累积到下一个空白/特殊字符
            let mut lit = String::from(c);
            while let Some(nc) = chars.peek().copied() {
                if nc.is_whitespace() || nc == '(' || nc == ')' || nc == ',' || nc == '=' || nc == '$' {
                    break;
                }
                lit.push(nc);
                chars.next();
            }
            // 判定是节点类型还是普通字面量
            if is_node_kind(&lit) {
                tokens.push(PatternToken::NodeKind(lit));
            } else {
                tokens.push(PatternToken::Literal(lit));
            }
        }
    }

    tokens
}

/// 提取形如 `$NAME` 的元变量名（仅一个）
fn extract_metavar_name(s: &str) -> Option<String> {
    let trimmed = s.trim();
    if !trimmed.starts_with('$') {
        return None;
    }
    let rest = &trimmed[1..];
    // $$$ 形式
    if let Some(stripped) = rest.strip_prefix("$$") {
        return Some(stripped.to_string());
    }
    // $... 形式
    if let Some(stripped) = rest.strip_prefix("..") {
        return Some(stripped.to_string());
    }
    // $NAME 形式
    Some(rest.to_string())
}

/// 判定字符串是否为合法 tree-sitter 节点类型名
/// 规则：含下划线的小写 ASCII 标识符，且不全是字母数字
fn is_node_kind(s: &str) -> bool {
    if s.is_empty() {
        return false;
    }
    let mut has_underscore = false;
    for c in s.chars() {
        if c == '_' {
            has_underscore = true;
        } else if !c.is_ascii_lowercase() && !c.is_ascii_digit() {
            return false;
        }
    }
    has_underscore
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compile_node_kind() {
        let p = compile_pattern("call_expression", Language::TypeScript).unwrap();
        assert_eq!(p.query, "(call_expression)");
        assert!(p.captures.is_empty());
    }

    #[test]
    fn compile_member_access_ts() {
        let p = compile_pattern("console.log", Language::TypeScript).unwrap();
        assert!(p.query.contains("console"));
        assert!(p.query.contains("log"));
    }

    #[test]
    fn compile_bare_identifier() {
        let p = compile_pattern("fetch", Language::TypeScript).unwrap();
        assert!(p.query.contains("identifier"));
        assert!(p.query.contains("fetch"));
    }

    #[test]
    fn compile_metavar_simple() {
        let p = compile_pattern("$NAME", Language::TypeScript).unwrap();
        assert!(p.captures.contains(&"NAME".to_string()));
    }

    #[test]
    fn compile_metavar_assignment() {
        let p = compile_pattern("$NAME = $VALUE", Language::TypeScript).unwrap();
        assert!(p.captures.contains(&"NAME".to_string()));
        assert!(p.captures.contains(&"VALUE".to_string()));
        assert!(p.query.contains("variable_declarator"));
    }

    #[test]
    fn compile_call_with_metavar_arg() {
        let p = compile_pattern("console.log($MSG)", Language::TypeScript).unwrap();
        assert!(p.query.contains("call_expression"));
        assert!(p.query.contains("console"));
        assert!(p.query.contains("log"));
    }

    #[test]
    fn compile_s_expression_passthrough() {
        let raw = "(call_expression) @call";
        let p = compile_pattern(raw, Language::TypeScript).unwrap();
        assert_eq!(p.query, raw);
        assert_eq!(p.captures, vec!["call".to_string()]);
    }

    #[test]
    fn compile_rust_member_access() {
        let p = compile_pattern("v.push", Language::Rust).unwrap();
        assert!(p.query.contains("field_expression"));
        assert!(p.query.contains("push"));
    }

    #[test]
    fn compile_python_member_access() {
        let p = compile_pattern("logger.info", Language::Python).unwrap();
        assert!(p.query.contains("attribute"));
        assert!(p.query.contains("info"));
    }

    #[test]
    fn extract_captures_works() {
        let caps = extract_captures("(call_expression function: (identifier) @name arguments: (_) @args)");
        assert!(caps.contains(&"name".to_string()));
        assert!(caps.contains(&"args".to_string()));
    }

    #[test]
    fn is_node_kind_validates_correctly() {
        assert!(is_node_kind("call_expression"));
        assert!(is_node_kind("function_declaration"));
        assert!(is_node_kind("try_statement"));
        assert!(!is_node_kind("fetch"));
        assert!(!is_node_kind("console"));
        assert!(!is_node_kind(""));
    }
}
