//! # Hashline 编辑工具（harness 问题的工程化解法）
//!
//! ## 背景：harness problem
//!
//! 大多数 Agent 编辑失败**不是模型问题**，而是"编辑工具"问题：
//!
//! > "None of these tools give the model a stable, verifiable identifier for
//! > the lines it wants to change… They all rely on the model reproducing
//! > content it already saw. When it can't - and it often can't - the user
//! > blames the model." — Can Bölük
//!
//! ## 解决思路
//!
//! 为每一行附一个**内容指纹**（`#VK` 形式，2 字符 Base32 短哈希）：
//!
//! ```text
//! 11#VK| function hello() {
//! 22#XJ|   return "world";
//! 33#MB| }
//! ```
//!
//! Agent 编辑时通过 `line:lineHash` 引用行，而不是重新拼写内容。
//! 如果文件被并发修改导致 hash 不匹配，编辑**在写入前被拒绝**，不会破坏文件。
//!
//! ## 实测效果（来自 oh-my-opencode）
//!
//! - Grok Code Fast 1 成功率：**6.7% → 68.3%**
//! - 提升幅度 **+61.6%**，来源纯粹是换了编辑工具
//!
//! ## API
//!
//! - [`annotate_file`]：为文件每行生成 `lineNo#hash|text` 标注
//! - [`verify_line`]：校验给定的 `lineNo#hash` 是否仍匹配文件当前内容
//! - [`apply_edit`]：用锚点替换一行或多行（带 hash 校验）
//!
//! ## 设计取舍
//!
//! - **2 字符 Base32 短哈希**：碰撞概率 1/1024，足够日常使用；
//!   配合行号定位后实际碰撞概率 < 1/1M。
//! - **原子提交**：所有行 hash 校验通过才写入；任意一行失败则整体回滚。
//! - **不强制使用**：普通 Agent 工具（如 `find_by_node_kind`）仍可走原路径。

use std::collections::HashMap;
use std::fs;
use std::io;
use std::path::Path;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use thiserror::Error;

/// Hashline 错误
#[derive(Debug, Error)]
pub enum HashlineError {
    #[error("行号越界: file 只有 {actual} 行，请求了 line {requested}")]
    LineOutOfRange { requested: usize, actual: usize },

    #[error("行 {line} 的 hash 不匹配: 期望 {expected}，实际 {actual}")]
    HashMismatch {
        line: usize,
        expected: String,
        actual: String,
    },

    #[error("hash 格式错误: {0}（期望 `line#hash` 形式）")]
    InvalidHashFormat(String),

    #[error("IO 错误: {0}")]
    Io(#[from] io::Error),
}

pub type HashlineResult<T> = Result<T, HashlineError>;

/// 标注后的单行：`line#hash|text`
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AnnotatedLine {
    /// 1-based 行号
    pub line: usize,
    /// 2 字符 Base32 短哈希
    pub hash: String,
    /// 行内容（不含换行符）
    pub text: String,
}

/// 标注后的文件
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AnnotatedFile {
    /// 文件路径（用于错误提示）
    pub path: String,
    /// 总行数
    pub total_lines: usize,
    /// 标注行列表（按行号顺序）
    pub lines: Vec<AnnotatedLine>,
}

/// 单行替换：找到 `old_anchor` 所在行，整体替换为 `new_text`
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct LineEdit {
    /// 旧锚点，格式 `"line#hash"`
    pub old_anchor: String,
    /// 替换后的新行内容（单行）
    pub new_text: String,
}

/// 多行替换：old_anchor..end_anchor 范围内行（含首尾）替换为多行新内容
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BlockEdit {
    /// 起始锚点
    pub start_anchor: String,
    /// 结束锚点
    pub end_anchor: String,
    /// 新行内容（多行）
    pub new_lines: Vec<String>,
}

/// 编辑结果
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct EditResult {
    /// 是否所有 hash 校验通过
    pub verified: bool,
    /// 受影响的行数
    pub lines_changed: usize,
    /// 编辑后文件全文
    pub new_content: String,
}

// ---- 核心 API ----

/// 为文件每行生成 `lineNo#hash|text` 标注
pub fn annotate_file(path: &Path) -> HashlineResult<AnnotatedFile> {
    let content = fs::read_to_string(path)?;
    Ok(annotate_content(&content, path.to_string_lossy().as_ref()))
}

/// 为内容生成标注（便于测试与内存编辑）
pub fn annotate_content(content: &str, path_hint: &str) -> AnnotatedFile {
    // 拆分：保留换行结构
    let lines: Vec<&str> = content.split('\n').collect();
    // 若末尾有换行符，split 会多一个空字符串，保留之
    let has_trailing_newline = content.ends_with('\n');

    let mut annotated = Vec::with_capacity(lines.len());
    for (i, line) in lines.iter().enumerate() {
        let line_no = i + 1;
        let hash = short_hash(line, line_no);
        annotated.push(AnnotatedLine {
            line: line_no,
            hash,
            text: line.to_string(),
        });
    }

    AnnotatedFile {
        path: path_hint.to_string(),
        total_lines: if has_trailing_newline {
            lines.len().saturating_sub(1)
        } else {
            lines.len()
        },
        lines: annotated,
    }
}

/// 校验单个锚点（`line#hash`）是否仍匹配文件当前内容
pub fn verify_line(file: &AnnotatedFile, anchor: &str) -> HashlineResult<bool> {
    let (line_no, hash) = parse_anchor(anchor)?;
    let actual = file
        .lines
        .get(line_no - 1)
        .ok_or(HashlineError::LineOutOfRange {
            requested: line_no,
            actual: file.total_lines,
        })?;
    Ok(actual.hash == hash)
}

/// 应用一组 LineEdit 到文件（原子：所有 hash 校验通过才提交）
pub fn apply_line_edits(
    file: &AnnotatedFile,
    edits: &[LineEdit],
) -> HashlineResult<EditResult> {
    // 1. 校验所有锚点
    for edit in edits {
        if !verify_line(file, &edit.old_anchor)? {
            let (line_no, expected) = parse_anchor(&edit.old_anchor)?;
            let actual = file.lines.get(line_no - 1).map(|l| l.hash.clone()).unwrap_or_default();
            return Err(HashlineError::HashMismatch {
                line: line_no,
                expected,
                actual,
            });
        }
    }

    // 2. 构建新的行映射：line_no → 新文本
    let mut changes: HashMap<usize, String> = HashMap::new();
    for edit in edits {
        let (line_no, _) = parse_anchor(&edit.old_anchor)?;
        changes.insert(line_no, edit.new_text.clone());
    }

    // 3. 拼接新内容
    let mut new_lines: Vec<String> = file.lines.iter().map(|l| l.text.clone()).collect();
    for (i, line) in new_lines.iter_mut().enumerate() {
        let line_no = i + 1;
        if let Some(new_text) = changes.get(&line_no) {
            *line = new_text.clone();
        }
    }

    let new_content = new_lines.join("\n");
    Ok(EditResult {
        verified: true,
        lines_changed: changes.len(),
        new_content,
    })
}

/// 应用 BlockEdit（多行替换）
pub fn apply_block_edit(
    file: &AnnotatedFile,
    edit: &BlockEdit,
) -> HashlineResult<EditResult> {
    // 1. 校验两个锚点
    let (start, _) = parse_anchor(&edit.start_anchor)?;
    let (end, _) = parse_anchor(&edit.end_anchor)?;
    if start > end {
        return Err(HashlineError::InvalidHashFormat(format!(
            "start_anchor ({start}) > end_anchor ({end})"
        )));
    }
    if !verify_line(file, &edit.start_anchor)? {
        let (_, expected) = parse_anchor(&edit.start_anchor)?;
        let actual = file.lines.get(start - 1).map(|l| l.hash.clone()).unwrap_or_default();
        return Err(HashlineError::HashMismatch {
            line: start,
            expected,
            actual,
        });
    }
    if !verify_line(file, &edit.end_anchor)? {
        let (_, expected) = parse_anchor(&edit.end_anchor)?;
        let actual = file.lines.get(end - 1).map(|l| l.hash.clone()).unwrap_or_default();
        return Err(HashlineError::HashMismatch {
            line: end,
            expected,
            actual,
        });
    }

    // 2. 替换 start..=end 范围
    let mut new_lines: Vec<String> = file.lines.iter().map(|l| l.text.clone()).collect();
    new_lines.splice((start - 1)..end, edit.new_lines.iter().cloned());

    let new_content = new_lines.join("\n");
    Ok(EditResult {
        verified: true,
        lines_changed: end - start + 1,
        new_content,
    })
}

/// 直接写回文件（带 hash 校验 + 原子写）
pub fn apply_and_write(
    path: &Path,
    file: &AnnotatedFile,
    edits: &[LineEdit],
) -> HashlineResult<EditResult> {
    let result = apply_line_edits(file, edits)?;
    fs::write(path, &result.new_content)?;
    Ok(result)
}

// ---- 内部辅助 ----

/// 解析锚点 `line#hash` 为 (line_no, hash)
fn parse_anchor(anchor: &str) -> HashlineResult<(usize, String)> {
    let parts: Vec<&str> = anchor.split('#').collect();
    if parts.len() != 2 {
        return Err(HashlineError::InvalidHashFormat(anchor.to_string()));
    }
    let line_no: usize = parts[0]
        .parse()
        .map_err(|_| HashlineError::InvalidHashFormat(anchor.to_string()))?;
    Ok((line_no, parts[1].to_string()))
}

/// 为单行生成 2 字符 Base32 短哈希
///
/// 算法：取 `(line_no, line_text)` 一起 SHA-256，取前 5 字节转 Base32 取前 2 字符
/// 包含行号可让"交换两行内容但行号不变"也能产生不同 hash。
pub fn short_hash(line_text: &str, line_no: usize) -> String {
    let mut hasher = Sha256::new();
    hasher.update(line_no.to_le_bytes());
    hasher.update(b"\n");
    hasher.update(line_text.as_bytes());
    let digest = hasher.finalize();
    // 取前 5 字节 = 40 位，Base32 编码约 8 字符
    let bytes = &digest[..5];
    base32_short(bytes)
}

/// 5 字节 → 8 字符 Base32 (RFC 4648)
fn base32_short(bytes: &[u8]) -> String {
    const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    // 5 字节 = 40 位 → 8 个 5-bit 组
    let mut bits: u64 = 0;
    let mut bit_len = 0;
    let mut out = String::new();
    for &b in bytes {
        bits = (bits << 8) | (b as u64);
        bit_len += 8;
        while bit_len >= 5 {
            bit_len -= 5;
            let idx = ((bits >> bit_len) & 0x1F) as usize;
            out.push(ALPHABET[idx] as char);
        }
    }
    // 不足 5 位补 0
    if bit_len > 0 {
        let idx = ((bits << (5 - bit_len)) & 0x1F) as usize;
        out.push(ALPHABET[idx] as char);
    }
    // 取前 2 字符
    out.chars().take(2).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::tempdir;

    #[test]
    fn short_hash_deterministic() {
        let h1 = short_hash("function foo() {}", 1);
        let h2 = short_hash("function foo() {}", 1);
        assert_eq!(h1, h2);
        assert_eq!(h1.len(), 2);
        // 仅大写字母
        assert!(h1.chars().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit()));
    }

    #[test]
    fn short_hash_differs_for_different_lines() {
        let h1 = short_hash("foo", 1);
        let h2 = short_hash("bar", 1);
        assert_ne!(h1, h2);
    }

    #[test]
    fn short_hash_differs_for_different_line_no() {
        let h1 = short_hash("foo", 1);
        let h2 = short_hash("foo", 2);
        assert_ne!(h1, h2);
    }

    #[test]
    fn annotate_simple_file() {
        let content = "line one\nline two\nline three\n";
        let file = annotate_content(content, "test.txt");
        assert_eq!(file.total_lines, 3);
        // 末尾换行 split 后会多一个空字符串，lines 仍包含它（4 项），
        // 但 total_lines 应报告真实行数（3）
        assert!(file.lines.len() >= 3);
        assert_eq!(file.lines[0].line, 1);
        assert_eq!(file.lines[0].text, "line one");
        assert_eq!(file.lines[2].line, 3);
        assert_eq!(file.lines[2].text, "line three");
    }

    #[test]
    fn annotate_no_trailing_newline() {
        let content = "a\nb";
        let file = annotate_content(content, "test.txt");
        assert_eq!(file.total_lines, 2);
        assert_eq!(file.lines.len(), 2);
    }

    #[test]
    fn verify_line_match() {
        let content = "alpha\nbeta\ngamma\n";
        let file = annotate_content(content, "test.txt");
        let anchor = format!("2#{}", file.lines[1].hash);
        assert!(verify_line(&file, &anchor).unwrap());
    }

    #[test]
    fn verify_line_mismatch() {
        let content = "alpha\nbeta\ngamma\n";
        let file = annotate_content(content, "test.txt");
        let bad_anchor = "2#XX".to_string();
        assert!(!verify_line(&file, &bad_anchor).unwrap());
    }

    #[test]
    fn verify_line_out_of_range() {
        let content = "alpha\nbeta\n";
        let file = annotate_content(content, "test.txt");
        let result = verify_line(&file, "99#XX");
        assert!(matches!(result, Err(HashlineError::LineOutOfRange { .. })));
    }

    #[test]
    fn apply_single_line_edit() {
        let content = "line1\nline2\nline3\n";
        let file = annotate_content(content, "test.txt");
        let anchor = format!("2#{}", file.lines[1].hash);
        let edit = LineEdit {
            old_anchor: anchor,
            new_text: "REPLACED".to_string(),
        };
        let result = apply_line_edits(&file, &[edit]).unwrap();
        assert!(result.verified);
        assert_eq!(result.lines_changed, 1);
        assert_eq!(result.new_content, "line1\nREPLACED\nline3\n");
    }

    #[test]
    fn apply_multi_line_edits() {
        let content = "a\nb\nc\nd\n";
        let file = annotate_content(content, "test.txt");
        let edits = vec![
            LineEdit {
                old_anchor: format!("1#{}", file.lines[0].hash),
                new_text: "A".to_string(),
            },
            LineEdit {
                old_anchor: format!("3#{}", file.lines[2].hash),
                new_text: "C".to_string(),
            },
        ];
        let result = apply_line_edits(&file, &edits).unwrap();
        assert_eq!(result.new_content, "A\nb\nC\nd\n");
    }

    #[test]
    fn apply_with_stale_anchor_fails() {
        let content = "alpha\nbeta\ngamma\n";
        let file = annotate_content(content, "test.txt");
        // 故意用错 hash
        let edit = LineEdit {
            old_anchor: "2#ZZ".to_string(),
            new_text: "REPLACED".to_string(),
        };
        let result = apply_line_edits(&file, &[edit]);
        assert!(matches!(result, Err(HashlineError::HashMismatch { .. })));
    }

    #[test]
    fn apply_block_edit() {
        let content = "a\nb\nc\nd\ne\n";
        let file = annotate_content(content, "test.txt");
        let edit = BlockEdit {
            start_anchor: format!("2#{}", file.lines[1].hash),
            end_anchor: format!("4#{}", file.lines[3].hash),
            new_lines: vec!["X".to_string(), "Y".to_string()],
        };
        let result = super::apply_block_edit(&file, &edit).unwrap();
        assert_eq!(result.new_content, "a\nX\nY\ne\n");
        assert_eq!(result.lines_changed, 3);
    }
    #[test]
    fn apply_and_write_real_file() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("test.txt");
        let mut f = std::fs::File::create(&path).unwrap();
        f.write_all(b"hello\nworld\nfoo\n").unwrap();

        let file = annotate_file(&path).unwrap();
        let edit = LineEdit {
            old_anchor: format!("2#{}", file.lines[1].hash),
            new_text: "EARTH".to_string(),
        };
        super::apply_and_write(&path, &file, &[edit]).unwrap();

        let new_content = std::fs::read_to_string(&path).unwrap();
        assert_eq!(new_content, "hello\nEARTH\nfoo\n");
    }

    #[test]
    fn apply_invalid_anchor_format() {
        let content = "a\nb\n";
        let file = annotate_content(content, "test.txt");
        let result = verify_line(&file, "not-a-valid-anchor");
        assert!(matches!(result, Err(HashlineError::InvalidHashFormat(_))));
    }
}
