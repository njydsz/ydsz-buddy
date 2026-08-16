//! # Office 文档处理命令模块
//!
//! 提供与 Office 文档（docx / xlsx / pdf / pptx）读写相关的 Tauri 命令，
//! 直接调用 ydsz-shared crate 的处理器静态方法。
//!
//! ## 命令清单
//!
//! | 命令 | 说明 |
//! |------|------|
//! | `office_docx_read` | 读取 docx 文件，返回段落文本列表 |
//! | `office_docx_write` | 写入 docx 文件 |
//! | `office_xlsx_read` | 读取 xlsx 文件，返回 sheet 数据 |
//! | `office_xlsx_write` | 写入 xlsx 文件 |
//! | `office_pdf_extract` | 提取 pdf 文件文本内容 |
//! | `office_pptx_generate` | 根据幻灯片描述生成 pptx 文件 |

use std::path::Path;

use serde::{Deserialize, Serialize};
use tracing::info;

use ydsz_work::office::docx::{DocxBlock, DocxProcessor};
use ydsz_work::office::pdf::PdfProcessor;
use ydsz_work::office::pptx::PptxGenerator;
use ydsz_work::office::xlsx::{XlsxCellInput, XlsxProcessor};

/// xlsx sheet 数据
///
/// 表示一个 sheet 的名称和所有行数据（每行为字符串列表）。
#[derive(Debug, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct XlsxSheetData {
    /// sheet 名称
    pub sheet_name: String,
    /// 行数据（每行为单元格字符串列表）
    pub rows: Vec<Vec<String>>,
}

/// 读取 docx 文件
///
/// 读取指定路径的 docx 文件，返回所有段落的文本列表。
///
/// # 参数
///
/// - `path`: docx 文件路径
///
/// # 返回值
///
/// - `Ok(Vec<String>)`: 读取成功，返回段落文本列表
/// - `Err(String)`: 读取失败
#[tauri::command]
#[specta::specta]
pub async fn office_docx_read(path: String) -> Result<Vec<String>, String> {
    info!(path = %path, "读取 docx 文件");
    let paragraphs = DocxProcessor::read(Path::new(&path)).map_err(|e| e.to_string())?;
    Ok(paragraphs.into_iter().map(|p| p.text).collect())
}

/// 写入 docx 文件
///
/// 将段落文本列表写入指定路径的 docx 文件。
///
/// # 参数
///
/// - `path`: 目标 docx 文件路径
/// - `paragraphs`: 段落文本列表
///
/// # 返回值
///
/// - `Ok(())`: 写入成功
/// - `Err(String)`: 写入失败
#[tauri::command]
#[specta::specta]
pub async fn office_docx_write(path: String, paragraphs: Vec<String>) -> Result<(), String> {
    info!(path = %path, count = paragraphs.len(), "写入 docx 文件");
    DocxProcessor::write(Path::new(&path), &paragraphs).map_err(|e| e.to_string())?;
    Ok(())
}

/// docx 块类型描述(供 office_docx_write_rich 使用)
///
/// 每种块对应 `DocxBlock` 枚举的一种变体,通过 `kind` 字段区分:
/// - `paragraph`: 普通段落(text / style / bold / italic)
/// - `heading`: 标题(text / level 1-6)
/// - `table`: 表格(headers / rows)
/// - `bulletList`: 无序列表(items)
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct DocxBlockInput {
    /// 块类型: "paragraph" | "heading" | "table" | "bulletList"
    pub kind: String,
    /// 文本(用于 paragraph / heading)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    /// 段落样式名(仅 paragraph 使用,如 "Normal" / "Quote")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub style: Option<String>,
    /// 是否加粗(仅 paragraph 使用)
    #[serde(default)]
    pub bold: bool,
    /// 是否斜体(仅 paragraph 使用)
    #[serde(default)]
    pub italic: bool,
    /// 标题级别 1-6(仅 heading 使用)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub level: Option<u8>,
    /// 表头(仅 table 使用)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub headers: Option<Vec<String>>,
    /// 表格行数据(仅 table 使用)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rows: Option<Vec<Vec<String>>>,
    /// 要点列表(仅 bulletList 使用)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub items: Option<Vec<String>>,
}

/// 写入富 docx 文件(支持表格/标题/样式)
///
/// 根据块列表生成 docx 文件,每个块对应段落、标题、表格或要点列表。
///
/// # 参数
///
/// - `path`: 输出 docx 文件路径
/// - `blocks`: 块描述列表(空数组也能生成空文档)
///
/// # 返回值
///
/// - `Ok(())`: 生成成功
/// - `Err(String)`: 生成失败(路径不可写 / 序列化失败等)
#[tauri::command]
#[specta::specta]
pub async fn office_docx_write_rich(
    path: String,
    blocks: Vec<DocxBlockInput>,
) -> Result<(), String> {
    info!(path = %path, count = blocks.len(), "写入富 docx 文件");
    let mapped: Vec<DocxBlock> = blocks
        .into_iter()
        .map(|b| -> Result<DocxBlock, String> {
            match b.kind.as_str() {
                "paragraph" => Ok(DocxBlock::Paragraph {
                    text: b.text.unwrap_or_default(),
                    style: b.style,
                    bold: b.bold,
                    italic: b.italic,
                }),
                "heading" => Ok(DocxBlock::Heading {
                    text: b.text.unwrap_or_default(),
                    level: b.level.unwrap_or(1),
                }),
                "table" => Ok(DocxBlock::Table {
                    headers: b.headers,
                    rows: b.rows.unwrap_or_default(),
                }),
                "bulletList" => Ok(DocxBlock::BulletList {
                    items: b.items.unwrap_or_default(),
                }),
                other => Err(format!(
                    "未知的 docx 块类型: '{other}',支持的类型: paragraph / heading / table / bulletList"
                )),
            }
        })
        .collect::<Result<Vec<_>, _>>()?;
    DocxProcessor::write_blocks(Path::new(&path), &mapped).map_err(|e| e.to_string())?;
    Ok(())
}

/// 读取 xlsx 文件
///
/// 读取指定路径的 xlsx 文件，返回所有 sheet 的数据。
///
/// # 参数
///
/// - `path`: xlsx 文件路径
///
/// # 返回值
///
/// - `Ok(Vec<XlsxSheetData>)`: 读取成功，返回 sheet 数据列表
/// - `Err(String)`: 读取失败
#[tauri::command]
#[specta::specta]
pub async fn office_xlsx_read(path: String) -> Result<Vec<XlsxSheetData>, String> {
    info!(path = %path, "读取 xlsx 文件");
    let sheets = XlsxProcessor::read(Path::new(&path)).map_err(|e| e.to_string())?;
    Ok(sheets
        .into_iter()
        .map(|(sheet_name, rows)| XlsxSheetData {
            sheet_name,
            rows: rows.into_iter().map(|row| row.into_iter().map(|c| c.as_string()).collect()).collect(),
        })
        .collect())
}

/// 写入 xlsx 文件
///
/// 将行数据写入指定路径的 xlsx 文件（新建文件）。
///
/// # 参数
///
/// - `path`: 目标 xlsx 文件路径
/// - `sheet_name`: sheet 名称
/// - `rows`: 行数据（每行为字符串列表）
///
/// # 返回值
///
/// - `Ok(())`: 写入成功
/// - `Err(String)`: 写入失败
#[tauri::command]
#[specta::specta]
pub async fn office_xlsx_write(
    path: String,
    sheet_name: String,
    rows: Vec<Vec<String>>,
) -> Result<(), String> {
    info!(path = %path, sheet = %sheet_name, rows = rows.len(), "写入 xlsx 文件");
    XlsxProcessor::write(Path::new(&path), &sheet_name, &rows).map_err(|e| e.to_string())?;
    Ok(())
}

/// xlsx 类型化单元格描述(供 office_xlsx_write_typed 使用)
///
/// 通过 `kind` 字段区分类型:
/// - `text`: 文本(value 字段必填)
/// - `number`: 数值(value 字段为字符串形式的数字,如 "10" / "9.9")
/// - `formula`: 公式(value 字段必填,以 `=` 开头;不带 `=` 会自动补)
/// - `bool`: 布尔(value 字段为 "true" / "false")
/// - `datetime`: 日期时间(value 字段为 ISO8601 字符串)
/// - `empty`: 空单元格(value 字段忽略)
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct XlsxTypedCellInput {
    /// 单元格类型: "text" | "number" | "formula" | "bool" | "datetime" | "empty"
    pub kind: String,
    /// 单元格值(字符串形式,所有类型统一通过 value 传递)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<String>,
}

/// 写入类型化 xlsx 文件(支持数值/公式/布尔/日期时间)
///
/// 根据单元格类型化数据创建 xlsx 文件。
///
/// # 参数
///
/// - `path`: 输出 xlsx 文件路径
/// - `sheet_name`: sheet 名称
/// - `rows`: 类型化行数据
///
/// # 返回值
///
/// - `Ok(())`: 写入成功
/// - `Err(String)`: 写入失败(路径不可写 / 类型未知 / 公式格式错误等)
#[tauri::command]
#[specta::specta]
pub async fn office_xlsx_write_typed(
    path: String,
    sheet_name: String,
    rows: Vec<Vec<XlsxTypedCellInput>>,
) -> Result<(), String> {
    info!(path = %path, sheet = %sheet_name, rows = rows.len(), "写入类型化 xlsx 文件");
    let mapped: Vec<Vec<XlsxCellInput>> = rows
        .into_iter()
        .map(|row| {
            row.into_iter()
                .map(|c| -> Result<XlsxCellInput, String> {
                    match c.kind.as_str() {
                        "text" => Ok(XlsxCellInput::Text(c.value.unwrap_or_default())),
                        "number" => {
                            let v = c.value.unwrap_or_default();
                            let n: f64 = v.parse().map_err(|_| {
                                format!("number 单元格的值无法解析为 f64: '{v}'")
                            })?;
                            Ok(XlsxCellInput::Number(n))
                        }
                        "formula" => Ok(XlsxCellInput::Formula(c.value.unwrap_or_default())),
                        "bool" => {
                            let v = c.value.unwrap_or_default().to_lowercase();
                            let b = match v.as_str() {
                                "true" | "1" | "yes" | "y" => true,
                                "false" | "0" | "no" | "n" | "" => false,
                                _ => return Err(format!("bool 单元格的值无法解析: '{v}'")),
                            };
                            Ok(XlsxCellInput::Bool(b))
                        }
                        "datetime" => Ok(XlsxCellInput::DateTime(c.value.unwrap_or_default())),
                        "empty" => Ok(XlsxCellInput::Empty),
                        other => Err(format!(
                            "未知的 xlsx 单元格类型: '{other}',支持的类型: text / number / formula / bool / datetime / empty"
                        )),
                    }
                })
                .collect::<Result<Vec<_>, _>>()
        })
        .collect::<Result<Vec<_>, _>>()?;
    XlsxProcessor::write_typed(Path::new(&path), &sheet_name, &mapped).map_err(|e| e.to_string())?;
    Ok(())
}

/// 提取 pdf 文件文本
///
/// 提取指定路径的 pdf 文件的文本内容。
///
/// # 参数
///
/// - `path`: pdf 文件路径
///
/// # 返回值
///
/// - `Ok(String)`: 提取成功，返回文本内容
/// - `Err(String)`: 提取失败
#[tauri::command]
#[specta::specta]
pub async fn office_pdf_extract(path: String) -> Result<String, String> {
    info!(path = %path, "提取 pdf 文本");
    PdfProcessor::extract_text(Path::new(&path)).map_err(|e| e.to_string())
}

/// pptx 幻灯片描述(供 office_pptx_generate 使用)
///
/// 每张幻灯片通过 `slide_type` 区分布局:
/// - `title`: 标题页(居中大标题 + 副标题)
/// - `content`: 内容页(顶部标题 + 下方要点列表)
/// - `section`: 章节分隔页(仅标题)
/// - `twoColumn`: 两栏对比页(左右各一栏标题 + 要点列表)
/// - `table`: 表格页(标题 + 表头 + 多行数据)
///
/// 所有类型都支持可选的 `notes` 演讲者备注。
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct PptxSlideInput {
    /// 幻灯片类型: "title" | "content" | "section" | "twoColumn" | "table"
    pub slide_type: String,
    /// 标题(所有类型必填)
    pub title: String,
    /// 副标题(仅 title 类型使用,其他类型忽略)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subtitle: Option<String>,
    /// 要点列表(仅 content 类型使用,其他类型忽略)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bullets: Option<Vec<String>>,
    /// 左栏标题(仅 twoColumn 类型使用)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub left_heading: Option<String>,
    /// 左栏要点(仅 twoColumn 类型使用)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub left_bullets: Option<Vec<String>>,
    /// 右栏标题(仅 twoColumn 类型使用)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub right_heading: Option<String>,
    /// 右栏要点(仅 twoColumn 类型使用)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub right_bullets: Option<Vec<String>>,
    /// 表头(仅 table 类型使用)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub headers: Option<Vec<String>>,
    /// 表格行数据(仅 table 类型使用)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rows: Option<Vec<Vec<String>>>,
    /// 演讲者备注(所有类型可选)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
}

/// 生成 pptx 文件
///
/// 根据幻灯片描述列表生成 PowerPoint 演示文稿并保存到指定路径。
///
/// # 参数
///
/// - `path`: 输出 pptx 文件路径
/// - `slides`: 幻灯片描述列表
///
/// # 返回值
///
/// - `Ok(())`: 生成成功
/// - `Err(String)`: 生成失败(路径不可写 / ZIP 打包失败等)
#[tauri::command]
#[specta::specta]
pub async fn office_pptx_generate(
    path: String,
    slides: Vec<PptxSlideInput>,
) -> Result<(), String> {
    info!(path = %path, count = slides.len(), "生成 pptx 文件");
    let mut generator = PptxGenerator::new();
    for slide in &slides {
        match slide.slide_type.as_str() {
            "title" => generator.add_title_slide_with_notes(
                slide.title.clone(),
                slide.subtitle.clone().unwrap_or_default(),
                slide.notes.clone(),
            ),
            "content" => generator.add_content_slide_with_notes(
                slide.title.clone(),
                slide.bullets.clone().unwrap_or_default(),
                slide.notes.clone(),
            ),
            "section" => generator.add_section_slide_with_notes(
                slide.title.clone(),
                slide.notes.clone(),
            ),
            "twoColumn" => generator.add_two_column_slide_with_notes(
                slide.title.clone(),
                slide.left_heading.clone().unwrap_or_default(),
                slide.left_bullets.clone().unwrap_or_default(),
                slide.right_heading.clone().unwrap_or_default(),
                slide.right_bullets.clone().unwrap_or_default(),
                slide.notes.clone(),
            ),
            "table" => generator.add_table_slide_with_notes(
                slide.title.clone(),
                slide.headers.clone().unwrap_or_default(),
                slide.rows.clone().unwrap_or_default(),
                slide.notes.clone(),
            ),
            other => {
                return Err(format!(
                    "未知的幻灯片类型: '{other}',支持的类型: title / content / section / twoColumn / table"
                ));
            }
        }
    }
    generator.save(Path::new(&path)).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn xlsx_sheet_data_serialization() {
        let sheet = XlsxSheetData {
            sheet_name: "Sheet1".to_string(),
            rows: vec![
                vec!["A1".to_string(), "B1".to_string()],
                vec!["A2".to_string(), "B2".to_string()],
            ],
        };
        let v = serde_json::to_value(&sheet).unwrap();
        assert_eq!(v["sheetName"], "Sheet1");
        assert_eq!(v["rows"][0][0], "A1");
        assert_eq!(v["rows"][1][1], "B2");
    }

    #[test]
    fn xlsx_sheet_data_empty_rows() {
        let sheet = XlsxSheetData {
            sheet_name: "Empty".to_string(),
            rows: vec![],
        };
        let json = serde_json::to_string(&sheet).unwrap();
        let back: XlsxSheetData = serde_json::from_str(&json).unwrap();
        assert_eq!(back.sheet_name, "Empty");
        assert!(back.rows.is_empty());
    }

    #[tokio::test(flavor = "current_thread")]
    async fn docx_read_missing_file_returns_err() {
        // 互联网大厂基线：文件不存在必须返回 Err 而非 panic
        let result = office_docx_read("/non/existent/file.docx".to_string()).await;
        assert!(result.is_err());
    }

    #[tokio::test(flavor = "current_thread")]
    async fn xlsx_read_missing_file_returns_err() {
        let result = office_xlsx_read("/non/existent/file.xlsx".to_string()).await;
        assert!(result.is_err());
    }

    #[tokio::test(flavor = "current_thread")]
    async fn pdf_extract_missing_file_returns_err() {
        let result = office_pdf_extract("/non/existent/file.pdf".to_string()).await;
        assert!(result.is_err());
    }

    #[tokio::test(flavor = "current_thread")]
    async fn docx_write_empty_paragraphs_succeeds() {
        // 互联网大厂基线：空内容也能正常生成（不抛错）
        let dir = std::env::temp_dir().join(format!(
            "ydsz-office-test-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("empty.docx");
        let result = office_docx_write(path.to_string_lossy().to_string(), vec![]).await;
        assert!(result.is_ok(), "空段落应能写入: {result:?}");
        assert!(path.exists());
    }

    #[tokio::test(flavor = "current_thread")]
    async fn docx_write_rich_with_blocks_succeeds() {
        // 端到端:标题 + 段落 + 表格 + 列表,再读回来验证文本提取
        let dir = std::env::temp_dir().join(format!(
            "ydsz-docx-rich-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("rich.docx");
        let blocks = vec![
            DocxBlockInput {
                kind: "heading".to_string(),
                text: Some("周报".to_string()),
                level: Some(1),
                bold: false,
                italic: false,
                style: None,
                headers: None,
                rows: None,
                items: None,
            },
            DocxBlockInput {
                kind: "paragraph".to_string(),
                text: Some("作者:张三".to_string()),
                bold: true,
                italic: false,
                style: None,
                level: None,
                headers: None,
                rows: None,
                items: None,
            },
            DocxBlockInput {
                kind: "bulletList".to_string(),
                items: Some(vec!["完成 A".to_string(), "完成 B".to_string()]),
                text: None,
                bold: false,
                italic: false,
                style: None,
                level: None,
                headers: None,
                rows: None,
            },
            DocxBlockInput {
                kind: "table".to_string(),
                headers: Some(vec!["任务".to_string(), "状态".to_string()]),
                rows: Some(vec![
                    vec!["需求评审".to_string(), "已完成".to_string()],
                    vec!["编码".to_string(), "进行中".to_string()],
                ]),
                text: None,
                bold: false,
                italic: false,
                style: None,
                level: None,
                items: None,
            },
        ];
        let result = office_docx_write_rich(path.to_string_lossy().to_string(), blocks).await;
        assert!(result.is_ok(), "富文档应能写入: {result:?}");
        assert!(path.exists());

        // 读回来验证
        let paragraphs = office_docx_read(path.to_string_lossy().to_string())
            .await
            .expect("read rich docx");
        let all_text: String = paragraphs.into_iter().map(|p| p).collect::<String>();
        assert!(all_text.contains("周报"));
        assert!(all_text.contains("作者:张三"));
        assert!(all_text.contains("完成 A"));
        assert!(all_text.contains("任务"));
        assert!(all_text.contains("进行中"));
    }

    #[tokio::test(flavor = "current_thread")]
    async fn docx_write_rich_rejects_unknown_kind() {
        // 未知 kind 必须返回 Err 而不是 panic
        let dir = std::env::temp_dir().join(format!(
            "ydsz-docx-bad-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("bad.docx");
        let blocks = vec![DocxBlockInput {
            kind: "unknown_kind".to_string(),
            text: Some("x".to_string()),
            bold: false,
            italic: false,
            style: None,
            level: None,
            headers: None,
            rows: None,
            items: None,
        }];
        let result = office_docx_write_rich(path.to_string_lossy().to_string(), blocks).await;
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.contains("unknown_kind"), "err: {err}");
    }

    #[tokio::test(flavor = "current_thread")]
    async fn xlsx_write_then_read_roundtrip() {
        // 端到端：写一个简单 xlsx，再读出来比对
        let dir = std::env::temp_dir().join(format!(
            "ydsz-xlsx-test-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("data.xlsx");
        let rows = vec![
            vec!["a".to_string(), "b".to_string()],
            vec!["c".to_string(), "d".to_string()],
        ];
        office_xlsx_write(
            path.to_string_lossy().to_string(),
            "Sheet1".to_string(),
            rows.clone(),
        )
        .await
        .expect("write xlsx");

        let sheets = office_xlsx_read(path.to_string_lossy().to_string())
            .await
            .expect("read xlsx");
        assert_eq!(sheets.len(), 1);
        assert_eq!(sheets[0].sheet_name, "Sheet1");
        assert_eq!(sheets[0].rows.len(), 2);
        assert_eq!(sheets[0].rows[0][0], "a");
        assert_eq!(sheets[0].rows[1][1], "d");
    }

    #[tokio::test(flavor = "current_thread")]
    async fn xlsx_write_typed_with_formula_and_number_roundtrip() {
        // 端到端:写入数值 + 公式,再读出来验证
        let dir = std::env::temp_dir().join(format!(
            "ydsz-xlsx-typed-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("typed.xlsx");
        let rows = vec![
            vec![
                XlsxTypedCellInput { kind: "text".to_string(), value: Some("数量".to_string()) },
                XlsxTypedCellInput { kind: "text".to_string(), value: Some("单价".to_string()) },
                XlsxTypedCellInput { kind: "text".to_string(), value: Some("总价".to_string()) },
            ],
            vec![
                XlsxTypedCellInput { kind: "number".to_string(), value: Some("10".to_string()) },
                XlsxTypedCellInput { kind: "number".to_string(), value: Some("9.9".to_string()) },
                XlsxTypedCellInput { kind: "formula".to_string(), value: Some("=A2*B2".to_string()) },
            ],
            vec![
                XlsxTypedCellInput { kind: "number".to_string(), value: Some("5".to_string()) },
                XlsxTypedCellInput { kind: "number".to_string(), value: Some("20".to_string()) },
                XlsxTypedCellInput { kind: "formula".to_string(), value: Some("A3*B3".to_string()) },
            ],
        ];
        let result = office_xlsx_write_typed(
            path.to_string_lossy().to_string(),
            "Sales".to_string(),
            rows,
        )
        .await;
        assert!(result.is_ok(), "类型化 xlsx 应能写入: {result:?}");
        assert!(path.exists());

        // 读回来验证数值
        let sheets = office_xlsx_read(path.to_string_lossy().to_string())
            .await
            .expect("read typed xlsx");
        assert_eq!(sheets.len(), 1);
        assert_eq!(sheets[0].sheet_name, "Sales");
        assert_eq!(sheets[0].rows.len(), 3);
        // 表头
        assert_eq!(sheets[0].rows[0][0], "数量");
        // 数值
        let a2 = &sheets[0].rows[1][0];
        assert_eq!(a2, "10");
    }

    #[tokio::test(flavor = "current_thread")]
    async fn xlsx_write_typed_rejects_invalid_number() {
        // number 类型传入非数字 value 必须返回 Err 而不是 panic
        let dir = std::env::temp_dir().join(format!(
            "ydsz-xlsx-bad-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("bad.xlsx");
        let rows = vec![vec![XlsxTypedCellInput {
            kind: "number".to_string(),
            value: Some("not-a-number".to_string()),
        }]];
        let result = office_xlsx_write_typed(
            path.to_string_lossy().to_string(),
            "Bad".to_string(),
            rows,
        )
        .await;
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.contains("not-a-number"), "err: {err}");
    }

    #[tokio::test(flavor = "current_thread")]
    async fn xlsx_write_typed_rejects_unknown_kind() {
        // 未知 kind 必须返回 Err
        let dir = std::env::temp_dir().join(format!(
            "ydsz-xlsx-unknown-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("unknown.xlsx");
        let rows = vec![vec![XlsxTypedCellInput {
            kind: "unknown_kind".to_string(),
            value: Some("x".to_string()),
        }]];
        let result = office_xlsx_write_typed(
            path.to_string_lossy().to_string(),
            "Unknown".to_string(),
            rows,
        )
        .await;
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.contains("unknown_kind"), "err: {err}");
    }
}
