//! 知识库多格式文档解析（P1-4）
//!
//! 解析 PDF / DOCX / PPTX / XLSX / HTML / TXT / MD 等非代码文档，
//! 提取纯文本内容后送至语义索引管线（参考 Octop knowledge/parse.rs + parse.py）。

use std::path::Path;
use serde::{Deserialize, Serialize};

/// 支持的文档格式
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum DocFormat {
    Pdf,
    Docx,
    Pptx,
    Xlsx,
    Html,
    Txt,
    Markdown,
    Csv,
}

impl DocFormat {
    /// 根据文件扩展名推断文档格式
    pub fn from_path<P: AsRef<Path>>(path: P) -> Option<Self> {
        let ext = path.as_ref().extension()?.to_str()?.to_lowercase();
        match ext.as_str() {
            "pdf" => Some(DocFormat::Pdf),
            "docx" | "doc" => Some(DocFormat::Docx),
            "pptx" | "ppt" => Some(DocFormat::Pptx),
            "xlsx" | "xls" => Some(DocFormat::Xlsx),
            "html" | "htm" => Some(DocFormat::Html),
            "txt" | "text" | "log" => Some(DocFormat::Txt),
            "md" | "markdown" => Some(DocFormat::Markdown),
            "csv" | "tsv" => Some(DocFormat::Csv),
            _ => None,
        }
    }

    /// MIME 类型
    pub fn mime_type(&self) -> &str {
        match self {
            DocFormat::Pdf => "application/pdf",
            DocFormat::Docx => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            DocFormat::Pptx => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            DocFormat::Xlsx => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            DocFormat::Html => "text/html",
            DocFormat::Txt => "text/plain",
            DocFormat::Markdown => "text/markdown",
            DocFormat::Csv => "text/csv",
        }
    }
}

/// 文档解析结果
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct DocParseResult {
    pub format: DocFormat,
    pub path: String,
    pub text_content: String,       // 提取的纯文本
    pub char_count: usize,
    pub page_count: Option<u32>,    // 仅 PDF/PPTX/DOCX 有意义
    pub title: Option<String>,      // 文档标题（如有）
}

/// 解析指定路径的文档
pub fn parse_document<P: AsRef<Path>>(path: P) -> Result<DocParseResult, String> {
    let path_ref = path.as_ref();
    let format = DocFormat::from_path(path_ref)
        .ok_or_else(|| format!("不支持的文档格式: {:?}", path_ref.extension()))?;

    let text_content = match format {
        DocFormat::Txt | DocFormat::Markdown | DocFormat::Csv => {
            std::fs::read_to_string(path_ref)
                .map_err(|e| format!("文件读取失败: {}", e))?
        }
        DocFormat::Html => {
            let raw = std::fs::read_to_string(path_ref)
                .map_err(|e| format!("文件读取失败: {}", e))?;
            strip_html_tags(&raw)
        }
        DocFormat::Pdf => {
            // 使用 pdf-extract crate 或外部 pdftotext 命令
            extract_pdf_text(path_ref)?
        }
        DocFormat::Docx => {
            // 使用 docx crate 或外部 python-docx/unzip+xml 解析
            extract_docx_text(path_ref)?
        }
        DocFormat::Pptx => extract_pptx_text(path_ref)?,
        DocFormat::Xlsx => extract_xlsx_text(path_ref)?,
    };

    let char_count = text_content.chars().count();

    Ok(DocParseResult {
        format,
        path: path_ref.to_string_lossy().to_string(),
        text_content,
        char_count,
        page_count: None,
        title: None,
    })
}

/// 将解析后的文档内容分块（准备送入语义索引）
pub fn chunk_text(text: &str, max_chunk_size: usize, overlap: usize) -> Vec<TextChunk> {
    if text.is_empty() {
        return Vec::new();
    }

    let mut chunks = Vec::new();
    let mut start = 0;
    let chars: Vec<char> = text.chars().collect();
    let total = chars.len();

    while start < total {
        let end = (start + max_chunk_size).min(total);
        let chunk: String = chars[start..end].iter().collect();
        chunks.push(TextChunk {
            text: chunk,
            char_offset: start,
            char_length: end - start,
        });

        if end >= total {
            break;
        }
        // 滑动窗口（带重叠）
        start = if end > overlap { end - overlap } else { end };
    }

    chunks
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct TextChunk {
    pub text: String,
    pub char_offset: usize,
    pub char_length: usize,
}

// ──────────── 格式专属提取器 ────────────

/// 简单 HTML 标签剥离（MVP：无依赖；生产环境可替换为 scraper/ammonia）
fn strip_html_tags(html: &str) -> String {
    let mut result = String::new();
    let mut in_tag = false;
    let mut in_script = false;

    for line in html.lines() {
        let lower = line.trim().to_lowercase();
        if lower.contains("<script") { in_script = true; }
        if lower.contains("</script>") { in_script = false; continue; }
        if in_script { continue; }

        for ch in line.chars() {
            match ch {
                '<' => in_tag = true,
                '>' => { in_tag = false; }
                _ if !in_tag => result.push(ch),
                _ => {}
            }
        }
        result.push('\n');
    }

    // 合并多余空白
    result.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// 提取 PDF 文本（优先 pdftotext 命令，回退到直接读取错误提示）
fn extract_pdf_text(path: &Path) -> Result<String, String> {
    // 尝试使用系统 pdftotext 命令（Poppler 工具集）
    let output = std::process::Command::new("pdftotext")
        .arg(path)
        .arg("-")
        .output()
        .map_err(|e| format!("无法调用 pdftotext 命令: {}（请安装 Poppler 工具集）", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // 如果 pdftotext 不可用，给出更友好的错误提示
        if stderr.contains("not found") || stderr.contains("not recognized") {
            Err("PDF 解析未安装。请安装 Poppler 工具集（pdftotext 命令）后重试。".into())
        } else {
            Err(format!("PDF 解析失败: {}", stderr))
        }
    }
}

/// 提取 DOCX 文本（使用 unzip + xml 解析）
fn extract_docx_text(path: &Path) -> Result<String, String> {
    use std::io::Read;

    let file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("DOCX _zip_解析失败: {}", e))?;

    // DOCX 文档正文位于 word/document.xml
    let mut xml_content = String::new();
    {
        let mut doc = archive.by_name("word/document.xml")
            .map_err(|e| format!("DOCX 缺少 document.xml: {}", e))?;
        doc.read_to_string(&mut xml_content).map_err(|e| e.to_string())?;
    }

    // 简单 XML 标签剥离（<w:t> 标签内的文本）
    Ok(extract_xml_text(&xml_content, "w:t"))
}

/// 提取 PPTX 文本
fn extract_pptx_text(path: &Path) -> Result<String, String> {
    use std::io::Read;

    let file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("PPTX zip 解析失败: {}", e))?;

    let mut all_text = Vec::new();

    // 遍历 ppt/slides/slide*.xml
    let file_names: Vec<String> = (0..archive.len())
        .filter_map(|i| archive.by_index(i).ok().map(|f| f.name().to_string()))
        .filter(|n| n.starts_with("ppt/slides/slide") && n.ends_with(".xml"))
        .collect();

    // 按文件名中的数字排序
    let mut sorted_names = file_names;
    sorted_names.sort_by(|a, b| extract_slide_number(a).cmp(&extract_slide_number(b)));

    for name in sorted_names {
        if let Ok(mut file) = archive.by_name(&name) {
            let mut xml = String::new();
            if file.read_to_string(&mut xml).is_ok() {
                let text = extract_xml_text(&xml, "a:t");
                if !text.trim().is_empty() {
                    all_text.push(format!("[Slide] {}", text.trim()));
                }
            }
        }
    }

    Ok(all_text.join("\n\n"))
}

/// 提取 XLSX 文本（共享字符串 + 单元格值）
fn extract_xlsx_text(path: &Path) -> Result<String, String> {
    use std::io::Read;

    let file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("XLSX zip 解析失败: {}", e))?;

    // 读取共享字符串表
    let shared_strings = {
        let mut ss_content = String::new();
        if let Ok(mut f) = archive.by_name("xl/sharedStrings.xml") {
            let _ = f.read_to_string(&mut ss_content);
        }
        parse_shared_strings(&ss_content)
    };

    // 第一个工作表
    let mut sheet_content = String::new();
    if let Ok(mut f) = archive.by_name("xl/worksheets/sheet1.xml") {
        let _ = f.read_to_string(&mut sheet_content);
    }

    Ok(extract_sheet_text(&sheet_content, &shared_strings))
}

// ──────────── XML 解析辅助 ────────────

/// 从 XML 中提取指定标签内的文本
fn extract_xml_text(xml: &str, tag: &str) -> String {
    let open = format!("<{}>", tag);
    let close = format!("</{}>", tag);
    let open_attrs = format!("<{}", tag);

    let mut result = Vec::new();
    let mut search_start = 0;

    while let Some(open_pos) = xml[search_start..].find(&open_attrs) {
        let abs_open = search_start + open_pos;
        // 找到 > 结束开标签
        let tag_end = xml[abs_open..].find('>').map(|p| abs_open + p + 1).unwrap_or(abs_open + open.len() + 1);
        if let Some(close_pos) = xml[tag_end..].find(&close) {
            let text = &xml[tag_end..tag_end + close_pos];
            // 解码 XML 实体
            let decoded = text
                .replace("&lt;", "<")
                .replace("&gt;", ">")
                .replace("&amp;", "&")
                .replace("&quot;", "\"")
                .replace("&apos;", "'");
            if !decoded.trim().is_empty() {
                result.push(decoded);
            }
            search_start = tag_end + close_pos + close.len();
        } else {
            break;
        }
    }

    result.join(" ")
}

fn extract_slide_number(name: &str) -> u32 {
    name.chars().filter(|c| c.is_plaintext_digit()).collect::<String>().parse().unwrap_or(0)
}

trait CharExt {
    fn is_plaintext_digit(&self) -> bool;
}
impl CharExt for char {
    fn is_plaintext_digit(&self) -> bool { self.is_ascii_digit() }
}

/// 解析 XLSX 共享字符串表
fn parse_shared_strings(xml: &str) -> Vec<String> {
    let mut result = Vec::new();
    let open = "<t>";
    let close = "</t>";

    let mut search_start = 0;
    while let Some(pos) = xml[search_start..].find(open) {
        let abs_pos = search_start + pos + open.len();
        if let Some(end_pos) = xml[abs_pos..].find(close) {
            result.push(xml[abs_pos..abs_pos + end_pos].to_string());
            search_start = abs_pos + end_pos + close.len();
        } else {
            break;
        }
    }
    result
}

/// 解析 XLSX sheet XML 为文本行
fn extract_sheet_text(xml: &str, shared_strings: &[String]) -> String {
    let mut rows: Vec<Vec<String>> = Vec::new();
    let mut current_row: Vec<String> = Vec::new();

    // 简单提取 <c> 标签内的 <v> 或 <t> 值
    let cell_open = "<c ";
    let cell_close = "</c>";
    let row_open = "<row";
    let row_close = "</row>";

    let mut pos = 0;
    while pos < xml.len() {
        if let Some(rpos) = xml[pos..].find(row_open) {
            let row_start = pos + rpos;
            let row_end = xml[row_start..].find(row_close)
                .map(|p| row_start + p + row_close.len())
                .unwrap_or(xml.len());

            let row_xml = &xml[row_start..row_end];
            let row_text = extract_row_cells(row_xml, shared_strings);
            if !row_text.is_empty() {
                rows.push(vec![row_text]);
            }
            pos = row_end;
        } else {
            break;
        }
    }

    rows.into_iter().map(|r| r.join("\t")).collect::<Vec<_>>().join("\n")
}

fn extract_row_cells(row_xml: &str, shared_strings: &[String]) -> String {
    let mut cells = Vec::new();
    let mut pos = 0;

    while pos < row_xml.len() {
        // 查找 <c ... > 标签
        if let Some(cpos) = row_xml[pos..].find("<c ") {
            let cell_start = pos + cpos;
            // 找 t 属性（类型）
            let t_attr = &row_xml[cell_start..];
            let is_shared_string = t_attr.contains("t=\"s\"");

            // 找 </c>
            if let Some(cend) = row_xml[cell_start..].find("</c>") {
                let cell_xml = &row_xml[cell_start..cell_start + cend];

                if let Some(v_start) = cell_xml.find("<v>") {
                    let v_content_start = v_start + 3;
                    if let Some(v_end) = cell_xml[v_content_start..].find("</v>") {
                        let val = &cell_xml[v_content_start..v_content_start + v_end];
                        let display_val = if is_shared_string {
                            val.parse::<usize>().ok().and_then(|idx| shared_strings.get(idx).cloned()).unwrap_or_default()
                        } else {
                            val.to_string()
                        };
                        cells.push(display_val);
                    }
                }
                pos = cell_start + cend + 4;
            } else {
                break;
            }
        } else {
            break;
        }
    }

    cells.join(" | ")
}

// ──────────── Tauri 命令 ────────────

/// 解析文档并提取文本（供前端调用）
#[tauri::command]
#[specta::specta]
pub fn knowledge_parse_document(
    path: String,
) -> Result<DocParseResult, String> {
    parse_document(&path)
}

/// 列出支持的文档格式
#[tauri::command]
#[specta::specta]
pub fn knowledge_list_supported_formats() -> Vec<DocFormat> {
    vec![
        DocFormat::Pdf,
        DocFormat::Docx,
        DocFormat::Pptx,
        DocFormat::Xlsx,
        DocFormat::Html,
        DocFormat::Txt,
        DocFormat::Markdown,
        DocFormat::Csv,
    ]
}
