/**
 * @file Composer Office 文档 Pick Hook
 *
 * 当 Composer 中识别到 `@docx` / `@xlsx` / `@pdf` 触发器时,
 * 弹出文件选择对话框,提取文档内容,并将结果映射为
 * `ComposerCommandItem` 列表。
 *
 * ## 工作机制
 *
 * 1. **触发器识别**: 仅在 `composerTrigger.kind === "mention"` 且
 *    query 完全等于 `docx` / `xlsx` / `pdf` 时启用。
 * 2. **文件选择**: ChatView 在 `office-hint` 项被选中时调用 hook
 *    暴露的 `triggerPick()`,由 hook 内部弹文件选择对话框并执行提取。
 * 3. **结果展示**: 提取成功后 hook 输出 `office-result` 项,可被选中
 *    插入到 Composer(`@<kind> "<file>"` 形式)。
 * 4. **错误降级**: 文件选择取消或读取失败时,显示 `office-empty` 提示。
 *
 * ## 使用场景
 *
 * - `useComposerCommandMenuItems` 在 `mention` 触发器下拉取 office 结果
 * - ChatView 在 `office-hint` 选中时调用 `triggerPick()` 触发文件选择
 *
 * ## 注意事项
 *
 * - 状态机:`hint` → (选中)→ `isPicking` → `result` / `empty`
 * - 切换触发器 (docx↔xlsx↔pdf) 时自动清空旧状态
 * - 选中 `office-result` 后由 ChatView 负责把 `context` 写入 selectedComposerMentions
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { open, type OpenDialogOptions } from "@tauri-apps/plugin-dialog";
import type { ComposerCommandItem } from "../components/chat/ComposerCommandMenu";
import type { ComposerTrigger } from "../composer-logic";
import { officeDocxRead, officePdfExtract, officeXlsxRead } from "../contracts/office";

/** 支持的 Office 文档类型 */
export type OfficeKind = "docx" | "xlsx" | "pdf";

/** 触发字符串 → 文档类型映射 */
const TRIGGER_TO_KIND: Record<string, OfficeKind> = {
  docx: "docx",
  xlsx: "xlsx",
  pdf: "pdf",
};

/** 文件选择对话框标题 */
const OFFICE_DIALOG_TITLES: Record<OfficeKind, string> = {
  docx: "选择 Word 文档",
  xlsx: "选择 Excel 工作簿",
  pdf: "选择 PDF 文件",
};

/** 允许的文件扩展名 */
const OFFICE_EXTENSIONS: Record<OfficeKind, string[]> = {
  docx: ["docx"],
  xlsx: ["xlsx"],
  pdf: ["pdf"],
};

/** 最大提取字符数,避免上下文过长 */
const MAX_DOC_CHARS = 8000;

/** Xlsx 单 sheet 最大行数 */
const MAX_XLSX_ROWS_PER_SHEET = 50;
/** Xlsx 整体最大单元格数 */
const MAX_XLSX_CELLS = 5000;

/** Hook 内部维护的"已提取文件"快照 */
export interface OfficeExtractedFile {
  kind: OfficeKind;
  filePath: string;
  context: string;
  description: string;
}

export interface UseComposerOfficePickResult {
  /** 当前命中的 Office 文档类型(未匹配时为 null) */
  activeKind: OfficeKind | null;
  /** 菜单项(hint / empty / result) */
  items: ComposerCommandItem[];
  /** 是否正在弹文件选择对话框 / 提取中 */
  isPicking: boolean;
  /** 最近一次 triggerPick 是否失败 */
  hasError: boolean;
  /** 已提取文件快照(未提取时为 null) */
  extractedFile: OfficeExtractedFile | null;
  /** 由 ChatView 在 `office-hint` 选中时调用,触发文件选择 + 提取 */
  triggerPick: () => Promise<void>;
  /** 主动重置 hook 状态(用于外部撤销/重选场景) */
  reset: () => void;
}

/** 从文件路径提取短标签(不含扩展名) */
function fileBaseName(filePath: string): string {
  const segments = filePath.split(/[/\\]/);
  const fileName = segments[segments.length - 1] ?? filePath;
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
}

/**
 * 判断 mention 触发器是否匹配 @docx/@xlsx/@pdf
 *
 * 只有在用户输入完整个触发词(query 完全等于 trigger 字符串,后面跟空白)时
 * 才匹配,避免输入 @documentation 时误触发。
 */
function extractOfficeKind(trigger: ComposerTrigger | null): OfficeKind | null {
  if (!trigger || trigger.kind !== "mention") {
    return null;
  }
  const raw = trigger.query.trim().toLowerCase();
  if (raw in TRIGGER_TO_KIND) {
    return TRIGGER_TO_KIND[raw];
  }
  return null;
}

/**
 * 提取 docx 段落列表
 */
async function readDocx(filePath: string): Promise<{ context: string; description: string }> {
  const paragraphs = await officeDocxRead(filePath);
  const joined = paragraphs.join("\n");
  const truncated = joined.length > MAX_DOC_CHARS ? `${joined.slice(0, MAX_DOC_CHARS)}\n…（已截断）` : joined;
  return {
    context: `@docx 文档: ${filePath}\n\n${truncated}`,
    description: `Word · ${paragraphs.length} 段`,
  };
}

/**
 * 提取 xlsx 表格数据为 Markdown 表格
 */
async function readXlsx(filePath: string): Promise<{ context: string; description: string }> {
  const sheets = await officeXlsxRead(filePath);
  let cellCount = 0;
  const sections = sheets.map((sheet) => {
    const header = `### Sheet: ${sheet.sheetName}`;
    const limitedRows = sheet.rows.slice(0, MAX_XLSX_ROWS_PER_SHEET);
    const tableRows: string[] = [];
    for (const row of limitedRows) {
      if (cellCount + row.length > MAX_XLSX_CELLS) {
        tableRows.push("| …（已截断） |");
        break;
      }
      cellCount += row.length;
      tableRows.push(`| ${row.map((c) => c.replace(/\|/g, "\\|")).join(" | ")} |`);
    }
    const separator = `| ${limitedRows[0]?.map(() => "---").join(" | ")} |`;
    return `${header}\n${tableRows.length > 0 ? `${separator}\n${tableRows.join("\n")}` : "_（空 sheet）_"}`;
  });
  return {
    context: `@xlsx 工作簿: ${filePath}\n\n${sections.join("\n\n")}`,
    description: `Excel · ${sheets.length} sheet`,
  };
}

/**
 * 提取 pdf 全文
 */
async function readPdf(filePath: string): Promise<{ context: string; description: string }> {
  const text = await officePdfExtract(filePath);
  const truncated = text.length > MAX_DOC_CHARS ? `${text.slice(0, MAX_DOC_CHARS)}\n…（已截断）` : text;
  return {
    context: `@pdf 文档: ${filePath}\n\n${truncated}`,
    description: `PDF · ${text.length} 字符`,
  };
}

/**
 * 弹出文件选择对话框,过滤允许的扩展名
 */
async function pickOfficeFile(kind: OfficeKind): Promise<string | null> {
  const options: OpenDialogOptions = {
    multiple: false,
    directory: false,
    title: OFFICE_DIALOG_TITLES[kind],
    filters: [
      {
        name: kind.toUpperCase(),
        extensions: OFFICE_EXTENSIONS[kind],
      },
    ],
  };
  const result = await open(options);
  if (Array.isArray(result)) {
    return result[0] ?? null;
  }
  return result;
}

/**
 * 选择 + 提取 office 文件,返回 null 表示用户取消或失败
 */
export async function pickAndExtractOfficeFile(
  kind: OfficeKind,
): Promise<OfficeExtractedFile | null> {
  const filePath = await pickOfficeFile(kind);
  if (!filePath) {
    return null;
  }
  const reader = kind === "docx" ? readDocx : kind === "xlsx" ? readXlsx : readPdf;
  try {
    const result = await reader(filePath);
    return { kind, filePath, context: result.context, description: result.description };
  } catch (error) {
    // 透传错误信息,让 hook 内部置 hasError
    throw error instanceof Error ? error : new Error(String(error));
  }
}

/**
 * Composer Office 文档 Pick hook
 *
 * 触发规则:用户输入 `@docx` / `@xlsx` / `@pdf` 后,菜单显示"选择文件"提示;
 * ChatView 在 `office-hint` 项被选中时调用 `triggerPick()` 触发文件选择
 * 与内容提取,提取完成后菜单项变为 `office-result`,可被选中插入 Composer。
 *
 * @param trigger - 当前 Composer 触发器
 */
export function useComposerOfficePick(trigger: ComposerTrigger | null): UseComposerOfficePickResult {
  const kind = extractOfficeKind(trigger);
  const [extractedFile, setExtractedFile] = useState<OfficeExtractedFile | null>(null);
  const [isPicking, setIsPicking] = useState(false);
  const [hasError, setHasError] = useState(false);
  // 跟踪上一次触发的类型,避免在切换类型时仍尝试加载上一个文件
  const lastKindRef = useRef<OfficeKind | null>(null);
  // 跟踪组件挂载状态,避免 setState 在 unmount 后被调用
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // 当 kind 变化时清空旧状态
  useEffect(() => {
    if (lastKindRef.current !== kind) {
      lastKindRef.current = kind;
      setExtractedFile(null);
      setHasError(false);
      setIsPicking(false);
    }
  }, [kind]);

  const triggerPick = useCallback(async () => {
    if (!kind) return;
    setIsPicking(true);
    setHasError(false);
    try {
      const result = await pickAndExtractOfficeFile(kind);
      if (!mountedRef.current) return;
      if (result) {
        setExtractedFile(result);
      } else {
        // 用户取消选择 → 显示"未选择文件"提示
        setHasError(false);
        setExtractedFile(null);
      }
    } catch (error) {
      if (!mountedRef.current) return;
      setHasError(true);
      // eslint-disable-next-line no-console
      console.warn("[useComposerOfficePick] 文件提取失败", error);
    } finally {
      if (mountedRef.current) {
        setIsPicking(false);
      }
    }
  }, [kind]);

  const reset = useCallback(() => {
    setExtractedFile(null);
    setHasError(false);
    setIsPicking(false);
  }, []);

  const items = useMemo<ComposerCommandItem[]>(() => {
    if (!kind) return [];

    if (hasError) {
      return [
        {
          id: `office-empty:${kind}:error`,
          type: "office-empty",
          officeKind: kind,
          label: `${kind.toUpperCase()} 提取失败`,
          description: "请检查文件是否有效,或稍后重试",
        } satisfies ComposerCommandItem,
      ];
    }

    if (extractedFile) {
      return [
        {
          id: `office-result:${kind}:${extractedFile.filePath}`,
          type: "office-result",
          officeKind: kind,
          kind,
          file: extractedFile.filePath,
          label: fileBaseName(extractedFile.filePath),
          description: extractedFile.description,
          context: extractedFile.context,
        } satisfies ComposerCommandItem,
      ];
    }

    return [
      {
        id: `office-hint:${kind}:pick`,
        type: "office-hint",
        officeKind: kind,
        label: `选择 ${kind.toUpperCase()} 文件`,
        description: "点击或按 Enter 弹出文件选择对话框",
      } satisfies ComposerCommandItem,
    ];
  }, [kind, hasError, extractedFile]);

  return {
    activeKind: kind,
    items,
    isPicking,
    hasError,
    extractedFile,
    triggerPick,
    reset,
  };
}
