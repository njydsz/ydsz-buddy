// Office 契约：与 src-tauri/src/commands/office.rs 中的 Tauri 命令对齐。
//
// 命名约定：
// - Rust 端 `#[serde(rename_all = "camelCase")]` → TS 端 camelCase
// - 命令名：snake_case（与 Rust 函数名一致，invoke 时直接用）
// - 类型名：PascalCase
//
// 后端单源：ydsz-desktop/src-tauri/src/commands/office.rs
// 前端手写契约（tauri-specta 在 Windows 上有 STATUS_ENTRYPOINT_NOT_FOUND
// 链接问题，commands.ts 暂未自动生成；与 editor.ts / lsp.ts 同模式）。

import { invoke } from "@tauri-apps/api/core";

// ===== 共享类型 =====

/** xlsx sheet 数据（每行为单元格字符串列表） */
export interface XlsxSheetData {
  /** sheet 名称 */
  sheetName: string;
  /** 行数据（每行为单元格字符串列表） */
  rows: string[][];
}

/** docx 块类型 */
export type DocxBlockKind = "paragraph" | "heading" | "table" | "bulletList";

/** docx 块描述（供 officeDocxWriteRich 使用） */
export interface DocxBlockInput {
  /** 块类型 */
  kind: DocxBlockKind;
  /** 文本（用于 paragraph / heading） */
  text?: string;
  /** 段落样式名（仅 paragraph 使用，如 "Normal" / "Quote"） */
  style?: string;
  /** 是否加粗（仅 paragraph 使用） */
  bold?: boolean;
  /** 是否斜体（仅 paragraph 使用） */
  italic?: boolean;
  /** 标题级别 1-6（仅 heading 使用） */
  level?: number;
  /** 表头（仅 table 使用） */
  headers?: string[];
  /** 表格行数据（仅 table 使用） */
  rows?: string[][];
  /** 要点列表（仅 bulletList 使用） */
  items?: string[];
}

/** pptx 幻灯片类型 */
export type PptxSlideType =
  | "title"
  | "content"
  | "section"
  | "twoColumn"
  | "table";

/** pptx 幻灯片描述（供 officePptxGenerate 使用） */
export interface PptxSlideInput {
  /** 幻灯片类型 */
  slideType: PptxSlideType;
  /** 标题（所有类型必填） */
  title: string;
  /** 副标题（仅 title 类型使用，其他类型忽略） */
  subtitle?: string;
  /** 要点列表（仅 content 类型使用，其他类型忽略） */
  bullets?: string[];
  /** 左栏标题（仅 twoColumn 类型使用） */
  leftHeading?: string;
  /** 左栏要点（仅 twoColumn 类型使用） */
  leftBullets?: string[];
  /** 右栏标题（仅 twoColumn 类型使用） */
  rightHeading?: string;
  /** 右栏要点（仅 twoColumn 类型使用） */
  rightBullets?: string[];
  /** 表头（仅 table 类型使用） */
  headers?: string[];
  /** 表格行数据（仅 table 类型使用） */
  rows?: string[][];
  /** 演讲者备注（所有类型可选） */
  notes?: string;
}

// ===== 命令调用封装 =====

/**
 * 读取 docx 文件，返回段落文本列表
 * @param path docx 文件路径
 */
export function officeDocxRead(path: string): Promise<string[]> {
  return invoke<string[]>("office_docx_read", { path });
}

/**
 * 写入 docx 文件
 * @param path 目标 docx 文件路径
 * @param paragraphs 段落文本列表
 */
export function officeDocxWrite(path: string, paragraphs: string[]): Promise<void> {
  return invoke<void>("office_docx_write", { path, paragraphs });
}

/**
 * 写入富 docx 文件（支持表格/标题/样式/列表）
 * @param path 输出 docx 文件路径
 * @param blocks 块描述列表（空数组也能生成空文档）
 */
export function officeDocxWriteRich(
  path: string,
  blocks: DocxBlockInput[],
): Promise<void> {
  return invoke<void>("office_docx_write_rich", { path, blocks });
}

/**
 * 读取 xlsx 文件，返回所有 sheet 的数据
 * @param path xlsx 文件路径
 */
export function officeXlsxRead(path: string): Promise<XlsxSheetData[]> {
  return invoke<XlsxSheetData[]>("office_xlsx_read", { path });
}

/**
 * 写入 xlsx 文件（新建文件）
 * @param path 目标 xlsx 文件路径
 * @param sheetName sheet 名称
 * @param rows 行数据（每行为单元格字符串列表）
 */
export function officeXlsxWrite(
  path: string,
  sheetName: string,
  rows: string[][],
): Promise<void> {
  return invoke<void>("office_xlsx_write", { path, sheetName, rows });
}

/** xlsx 类型化单元格类型 */
export type XlsxCellKind =
  | "text"
  | "number"
  | "formula"
  | "bool"
  | "datetime"
  | "empty";

/** xlsx 类型化单元格描述（供 officeXlsxWriteTyped 使用） */
export interface XlsxTypedCellInput {
  /** 单元格类型 */
  kind: XlsxCellKind;
  /** 单元格值（字符串形式，所有类型统一通过 value 传递） */
  value?: string;
}

/**
 * 写入类型化 xlsx 文件（支持数值/公式/布尔/日期时间）
 * @param path 输出 xlsx 文件路径
 * @param sheetName sheet 名称
 * @param rows 类型化行数据
 */
export function officeXlsxWriteTyped(
  path: string,
  sheetName: string,
  rows: XlsxTypedCellInput[][],
): Promise<void> {
  return invoke<void>("office_xlsx_write_typed", { path, sheetName, rows });
}

/**
 * 提取 pdf 文件文本内容
 * @param path pdf 文件路径
 */
export function officePdfExtract(path: string): Promise<string> {
  return invoke<string>("office_pdf_extract", { path });
}

/**
 * 生成 pptx 文件并保存到指定路径
 * @param path 输出 pptx 文件路径
 * @param slides 幻灯片描述列表
 */
export function officePptxGenerate(
  path: string,
  slides: PptxSlideInput[],
): Promise<void> {
  return invoke<void>("office_pptx_generate", { path, slides });
}
