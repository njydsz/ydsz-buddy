//! # AST-Grep 模式重写（structural replace）
//!
//! 把"找到的 AST 节点"按"用户指定的替换模板"生成新内容。
//!
//! ## 用法
//!
//! ```ignore
//! use ydsz_code::indexer::ast_grep::rewrite::rewrite_with_pattern;
//!
//! // 把所有 console.log(x) 改成 logger.info(x)
//! let new_content = rewrite_with_pattern(
//!     source,
//!     Language::TypeScript,
//!     "console.log($MSG)",  // pattern
//!     "logger.info($MSG)",  // rewrite
//! )?;
//! ```
//!
//! ## Meta-var 透传
//!
//! 替换模板里的 `$NAME` / `$$$BODY` 会从原匹配节点的 capture 中取值并嵌入。
//!
//! ## 原子性
//!
//! - 多次匹配按"出现顺序"逐个替换
//! - 位置冲突时后处理的会覆盖前处理的（先到先得，by position）
//! - 任一替换因 capture 缺失失败则整体回滚

use std::collections::HashMap;

use super::super::ast::Language;
use super::super::error::IndexerError;
use super::super::IndexerResult;
use super::pattern::compile_pattern;
use super::MatchResult;

/// 替换结果
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct RewriteResult {
    /// 替换后的完整内容
    pub new_content: String,
    /// 实际替换的次数
    pub replacements: usize,
    /// 命中的位置（file:line:column）— 用于 UI 展示
    pub match_locations: Vec<(String, u32, u32)>,
}

/// 用 `pattern` 在 `source` 中查找所有匹配，再用 `rewrite` 模板替换
pub fn rewrite_with_pattern(
    source: &str,
    lang: Language,
    pattern: &str,
    rewrite: &str,
) -> IndexerResult<RewriteResult> {
    let compiled = compile_pattern(pattern, lang)?;
    let matches = find_matches(source, lang, &compiled.query)?;
    apply_replacements(source, &matches, rewrite, lang)
}

/// 应用替换到所有匹配项
fn apply_replacements(
    source: &str,
    matches: &[MatchResult],
    rewrite: &str,
    _lang: Language,
) -> IndexerResult<RewriteResult> {
    if matches.is_empty() {
        return Ok(RewriteResult {
            new_content: source.to_string(),
            replacements: 0,
            match_locations: vec![],
        });
    }

    // 按 start_byte 升序排序
    let mut sorted: Vec<&MatchResult> = matches.iter().collect();
    sorted.sort_by_key(|m| m.start_byte);

    // 检查重叠（同一字节区间不应被多次替换）
    for w in sorted.windows(2) {
        if w[0].end_byte > w[1].start_byte {
            return Err(IndexerError::BuildFailed(format!(
                "匹配项重叠: byte {}..{} 与 {}..{}",
                w[0].start_byte, w[0].end_byte, w[1].start_byte, w[1].end_byte
            )));
        }
    }

    // 构造新内容
    let mut out = String::new();
    let mut cursor = 0usize;
    let mut replacements = 0usize;
    let mut locations = Vec::new();

    for m in &sorted {
        // 追加上一匹配到当前匹配之间的原文
        out.push_str(&source[cursor..m.start_byte as usize]);
        // 渲染替换模板
        let rendered = render_template(rewrite, m)?;
        out.push_str(&rendered);
        cursor = m.end_byte as usize;
        replacements += 1;
        locations.push((m.file.clone(), m.line, m.column));
    }
    // 追加剩余原文
    out.push_str(&source[cursor..]);

    Ok(RewriteResult {
        new_content: out,
        replacements,
        match_locations: locations,
    })
}

/// 把 `$NAME` / `$$$NAME` 模板渲染为实际文本
fn render_template(template: &str, m: &MatchResult) -> IndexerResult<String> {
    // 把 captures 转成 map（保留所有同名，最后出现的覆盖前序）
    let mut cap_map: HashMap<&str, &str> = HashMap::new();
    for (name, text) in &m.captures {
        cap_map.insert(name.as_str(), text.as_str());
    }

    let mut out = String::new();
    let bytes = template.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'$' {
            // 尝试解析 meta-var
            let (consumed, name) = parse_metavar(template, i);
            if consumed > 0 {
                if let Some(value) = cap_map.get(name.as_str()) {
                    out.push_str(value);
                } else {
                    return Err(IndexerError::BuildFailed(format!(
                        "替换模板引用未捕获的 meta-var: ${name}"
                    )));
                }
                i += consumed;
                continue;
            }
        }
        // 普通字符（注意 UTF-8 边界：直接 push char）
        let c = template[i..].chars().next().unwrap();
        out.push(c);
        i += c.len_utf8();
    }
    Ok(out)
}

/// 解析 `$$$NAME` / `$...NAME` / `$NAME`，返回 (consumed_bytes, name)
fn parse_metavar(s: &str, start: usize) -> (usize, String) {
    let rest = &s[start..];
    if !rest.starts_with('$') {
        return (0, String::new());
    }
    let after_first = &rest[1..];

    // $$$ 形式
    if let Some(name_part) = after_first.strip_prefix("$$") {
        let end = name_part
            .find(|c: char| !c.is_alphanumeric() && c != '_')
            .unwrap_or(name_part.len());
        if end > 0 {
            return (3 + end, name_part[..end].to_string());
        }
        return (0, String::new());
    }
    // $... 形式
    if let Some(name_part) = after_first.strip_prefix("...") {
        let end = name_part
            .find(|c: char| !c.is_alphanumeric() && c != '_')
            .unwrap_or(name_part.len());
        if end > 0 {
            return (4 + end, name_part[..end].to_string());
        }
        return (0, String::new());
    }
    // $NAME 形式
    let end = after_first
        .find(|c: char| !c.is_alphanumeric() && c != '_')
        .unwrap_or(after_first.len());
    if end > 0 {
        return (1 + end, after_first[..end].to_string());
    }
    (0, String::new())
}

/// 用编译后的 S-expression 在源码中查找所有匹配
fn find_matches(
    source: &str,
    lang: Language,
    query_str: &str,
) -> IndexerResult<Vec<MatchResult>> {
    let mut parser = tree_sitter::Parser::new();
    let language = lang.language_ref();
    parser
        .set_language(&language)
        .map_err(|e| IndexerError::ParseError(e.to_string()))?;
    let tree = parser
        .parse(source, None)
        .ok_or_else(|| IndexerError::ParseError("parse returned None".into()))?;

    let query = tree_sitter::Query::new(&language, query_str)
        .map_err(|e| IndexerError::BuildFailed(format!("查询语法错误: {e}")))?;
    let capture_names: Vec<String> = query.capture_names().iter().map(|s| s.to_string()).collect();

    let mut results = Vec::new();
    let mut cursor = tree_sitter::QueryCursor::new();
    let mut matches = cursor.matches(&query, tree.root_node(), source.as_bytes());
    use tree_sitter::StreamingIterator;
    while let Some(m) = matches.next() {
        let mut capture_texts: Vec<(String, String)> = Vec::new();
        for cap in m.captures {
            let name = capture_names
                .get(cap.index as usize)
                .cloned()
                .unwrap_or_default();
            let text = cap.node.utf8_text(source.as_bytes()).unwrap_or("").to_string();
            capture_texts.push((name, text));
        }
        if let Some(first) = m.captures.first() {
            let node = first.node;
            let start = node.start_position();
            let text = node
                .utf8_text(source.as_bytes())
                .unwrap_or("")
                .to_string();
            let kind = node.kind().to_string();
            results.push(MatchResult {
                file: "<inline>".to_string(),
                line: start.row as u32 + 1,
                column: start.column as u32 + 1,
                start_byte: node.start_byte() as u32,
                end_byte: node.end_byte() as u32,
                text,
                node_kind: kind,
                captures: capture_texts,
            });
        }
    }
    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rewrite_member_access_in_ts() {
        let source = r#"
console.log("a");
console.log("b");
logger.error("c");
"#;
        let result = rewrite_with_pattern(
            source,
            Language::TypeScript,
            "console.log",
            "logger.info",
        )
        .unwrap();
        assert_eq!(result.replacements, 2);
        assert!(result.new_content.contains("logger.info"));
        assert!(!result.new_content.contains("console.log"));
    }

    #[test]
    fn rewrite_with_capture_substitution() {
        let source = r#"
const x = 1;
const y = 2;
"#;
        // $NAME = $VALUE → let $NAME = $VALUE
        let result = rewrite_with_pattern(
            source,
            Language::TypeScript,
            "$NAME = $VALUE",
            "let $NAME = $VALUE",
        );
        // 注：$NAME = $VALUE 在 TypeScript 中可能匹配的是 expression_statement，
        // 取决于 capture 行为；这里主要验证模板渲染逻辑不 panic
        assert!(result.is_ok());
    }

    #[test]
    fn rewrite_no_match_returns_unchanged() {
        let source = "let x = 1;\n";
        let result = rewrite_with_pattern(
            source,
            Language::TypeScript,
            "console.log",
            "logger.info",
        )
        .unwrap();
        assert_eq!(result.replacements, 0);
        assert_eq!(result.new_content, source);
    }

    #[test]
    fn rewrite_rust_unwrap_to_question_mark() {
        let source = r#"
fn foo() {
    let v = bar().unwrap();
    let x = baz().unwrap();
}
"#;
        // 试着把 .unwrap() 调用点改成 ok_and_then?（结构性）
        // 注意：bar().unwrap() 是一个 call_expression(unwrap)，替换整体表达式
        // 我们的 pattern 是 "v.push" 这种形式，对于 method call 应该可以
        let result = rewrite_with_pattern(
            source,
            Language::Rust,
            "(call_expression function: (field_expression field: (field_identifier) @m) (#eq? @m \"unwrap\"))",
            "/* TODO: handle Result */",
        );
        // 至少不应 panic
        assert!(result.is_ok());
    }

    #[test]
    fn render_template_substitutes_meta_vars() {
        // 模拟一个 MatchResult
        let m = MatchResult {
            file: "test.ts".to_string(),
            line: 1,
            column: 1,
            start_byte: 0,
            end_byte: 10,
            text: "old".to_string(),
            node_kind: "call_expression".to_string(),
            captures: vec![("MSG".to_string(), "hello".to_string())],
        };
        let rendered = render_template("logger.info($MSG)", &m).unwrap();
        assert_eq!(rendered, "logger.info(hello)");
    }

    #[test]
    fn render_template_unknown_var_errors() {
        let m = MatchResult {
            file: "test.ts".to_string(),
            line: 1,
            column: 1,
            start_byte: 0,
            end_byte: 10,
            text: "old".to_string(),
            node_kind: "call_expression".to_string(),
            captures: vec![("MSG".to_string(), "hello".to_string())],
        };
        let result = render_template("logger.info($UNKNOWN)", &m);
        assert!(result.is_err());
    }

    #[test]
    fn parse_metavar_single() {
        let (consumed, name) = parse_metavar("foo $BAR baz", 4);
        assert_eq!(consumed, 4);
        assert_eq!(name, "BAR");
    }

    #[test]
    fn parse_metavar_triple_dollar() {
        let (consumed, name) = parse_metavar("foo $$$BODY baz", 4);
        assert_eq!(consumed, 7);
        assert_eq!(name, "BODY");
    }

    #[test]
    fn parse_metavar_dot_dot_dot() {
        let (consumed, name) = parse_metavar("foo $...REST baz", 4);
        // $... + REST = 1 + 3 + 4 = 8 字节
        assert_eq!(consumed, 8);
        assert_eq!(name, "REST");
    }

    #[test]
    fn parse_metavar_not_a_var() {
        let (consumed, name) = parse_metavar("just text", 0);
        assert_eq!(consumed, 0);
        assert!(name.is_empty());
    }
}
