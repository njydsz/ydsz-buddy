/**
 * @file 编辑器提及解析模块
 * @description 提供 `@...` 编辑器提及的解析和格式化工具，支持带引号的路径。
 *              用于 Web 编辑器辅助函数，包括提及标记格式化器和正则表达式辅助工具。
 *
 *              此外定义了 @codebase / @docx / @xlsx / @pdf 四种扩展提及类型，
 *              封装其触发字符串、搜索/文件选择逻辑与上下文附加格式。
 */

import { invoke } from "@tauri-apps/api/core";
import { open, type OpenDialogOptions } from "@tauri-apps/plugin-dialog";
import { searchAstGrep as searchAstGrepClient } from "./astGrepClient";

/**
 * 创建编辑器提及标记的正则表达式
 * @param options - 配置选项
 * @param options.includeTrailingTokenAtEnd - 是否在字符串末尾也匹配提及标记
 * @param options.global - 是否使用全局匹配模式，默认为 true
 * @returns 匹配 `@path` 或 `@"path with spaces"` 格式的正则表达式
 */
export function createComposerMentionTokenRegex(options: {
  includeTrailingTokenAtEnd: boolean;
  global?: boolean;
}): RegExp {
  const suffix = options.includeTrailingTokenAtEnd ? "(?=\\s|$)" : "(?=\\s)";
  return new RegExp(
    `(^|\\s)@(?:"([^"]+)"|([^\\s@]+))${suffix}`,
    options.global === false ? "" : "g",
  );
}

/**
 * 从正则匹配结果中提取提及路径
 * @param match - 正则表达式匹配结果
 * @returns 提取的路径字符串（去除引号和空白）
 */
export function extractComposerMentionPath(match: RegExpExecArray | RegExpMatchArray): string {
  return (match[2] ?? match[3] ?? "").trim();
}

/**
 * 格式化提及标记为字符串
 * @param path - 路径字符串（可带或不带 `@` 前缀）
 * @returns 格式化后的提及标记，如 `@path` 或 `@"path with spaces"`
 */
export function formatComposerMentionToken(path: string): string {
  const normalizedPath = path.startsWith("@") ? path.slice(1) : path;
  return /\s/.test(normalizedPath) ? `@"${normalizedPath}"` : `@${normalizedPath}`;
}

// ---------------------------------------------------------------------------
// 扩展提及类型（@codebase / @docx / @xlsx / @pdf）
//
// 集成说明（需在其他文件中配合修改，本文件仅提供数据层）：
//
// 1. ydsz-desktop/src/composer-logic.ts
//    - 在 `detectComposerTrigger` 中识别 `@codebase` / `@docx` / `@xlsx` / `@pdf`
//      触发器：当用户输入 `@codebase` 后，将其后的文本作为搜索查询；
//      对于 @docx/@xlsx/@pdf，识别到触发字符串后立即调用文件选择器。
//    - 可新增 `ComposerTriggerKind` 取值，如 `"codebase"` / `"office-doc"`。
//
// 2. ydsz-desktop/src/components/chat/ComposerCommandMenu.tsx
//    - 在 `ComposerCommandItem` 联合类型中新增 `codebase-result` / `office-doc` 分支。
//    - 渲染搜索结果时显示符号名 + 文件路径 + 行号（@codebase），
//      或文件名 + 提取内容预览（@docx/@xlsx/@pdf）。
//    - 选中后调用 `buildComposerMentionContext(item)` 生成上下文文本，
//      通过 `onSelect` 回调附加到消息中。
//
// 3. 调用方（Composer 容器组件）
//    - 使用 `getComposerMentionType(triggerString)` 获取提及类型定义。
//    - 对 @codebase：监听查询变化，调用 `searchCodebase(query)`（已内置 300ms 防抖）。
//    - 对 @docx/@xlsx/@pdf：触发时调用 `pickOfficeDocument(kind)` 选择文件并提取内容。
// ---------------------------------------------------------------------------

/** 代码库符号搜索结果（对应后端 `SymbolEntry`） */
export interface CodebaseSymbolResult {
  name: string;
  kind: string;
  file: string;
  line: number;
  column: number;
}

/** 代码库全文搜索结果（对应后端 `SearchResult`） */
export interface CodebaseTextResult {
  file: string;
  line: number;
  column: number;
  text: string;
  context: string;
}

/** 扩展提及类型标识 */
export type ComposerMentionKind =
  | "codebase"
  | "docx"
  | "xlsx"
  | "pdf"
  | "office"
  | "scheduler"
  | "browser"
  | "lsp"
  | "indexer"
  | "wiki"
  | "ast-grep"
  | "ppt"
  | "html"
  | "search";

/** 提及结果项，选中后通过 `context` 字段附加到消息上下文 */
export interface ComposerMentionItem {
  /** 唯一标识 */
  id: string;
  /** 提及类型 */
  kind: ComposerMentionKind;
  /** 主标签（符号名 / 文件名） */
  label: string;
  /** 副标签（符号种类 / 文件路径摘要） */
  description: string;
  /** 文件路径（@codebase 必填，@docx/@xlsx/@pdf 为选中文件路径） */
  file?: string;
  /** 行号（仅 @codebase） */
  line?: number;
  /** 附加到消息的上下文文本 */
  context: string;
}

/** 扩展提及类型定义 */
export interface ComposerMentionType {
  /** 触发字符串（含 @ 前缀） */
  trigger: string;
  /** 显示名称 */
  label: string;
  /** 描述说明 */
  description: string;
  /** 是否为搜索型提及（@codebase 为 true，需要输入查询关键词） */
  searchable: boolean;
  /** 是否为文件选择型提及（@docx/@xlsx/@pdf 为 true） */
  picksFile: boolean;
  /** 是否为 Skill 提及（@office/@scheduler/@browser/@lsp/@indexer 为 true） */
  isSkill: boolean;
}

/** 扩展提及类型注册表 */
const COMPOSER_MENTION_TYPES: Record<ComposerMentionKind, ComposerMentionType> = {
  codebase: {
    trigger: "@codebase",
    label: "Codebase",
    description: "搜索代码库符号与文本",
    searchable: true,
    picksFile: false,
    isSkill: false,
  },
  docx: {
    trigger: "@docx",
    label: "Word Document",
    description: "选择 .docx 文件并提取文本",
    searchable: false,
    picksFile: true,
    isSkill: false,
  },
  xlsx: {
    trigger: "@xlsx",
    label: "Excel Spreadsheet",
    description: "选择 .xlsx 文件并提取数据",
    searchable: false,
    picksFile: true,
    isSkill: false,
  },
  pdf: {
    trigger: "@pdf",
    label: "PDF Document",
    description: "选择 .pdf 文件并提取文本",
    searchable: false,
    picksFile: true,
    isSkill: false,
  },
  wiki: {
    trigger: "@wiki",
    label: "Wiki",
    description: "搜索项目 Wiki 文档",
    searchable: true,
    picksFile: false,
    isSkill: false,
  },
  office: {
    trigger: "@office",
    label: "Office",
    description: "Office 文档处理技能",
    searchable: false,
    picksFile: false,
    isSkill: true,
  },
  scheduler: {
    trigger: "@scheduler",
    label: "Scheduler",
    description: "任务调度技能",
    searchable: false,
    picksFile: false,
    isSkill: true,
  },
  browser: {
    trigger: "@browser",
    label: "Browser",
    description: "浏览器自动化技能",
    searchable: false,
    picksFile: false,
    isSkill: true,
  },
  lsp: {
    trigger: "@lsp",
    label: "LSP",
    description: "语言服务器协议技能",
    searchable: false,
    picksFile: false,
    isSkill: true,
  },
  indexer: {
    trigger: "@indexer",
    label: "Indexer",
    description: "索引器技能",
    searchable: false,
    picksFile: false,
    isSkill: true,
  },
  "ast-grep": {
    trigger: "@ast-grep",
    label: "AST-Grep",
    description: "结构化代码搜索（节点类型 / 模式 / 调用）",
    searchable: true,
    picksFile: false,
    isSkill: false,
  },
  ppt: {
    trigger: "@ppt",
    label: "PPT",
    description: "PPT 原型生成技能",
    searchable: false,
    picksFile: false,
    isSkill: true,
  },
  html: {
    trigger: "@html",
    label: "HTML",
    description: "HTML 原型生成技能",
    searchable: false,
    picksFile: false,
    isSkill: true,
  },
  search: {
    trigger: "@search",
    label: "Search",
    description: "联网搜索",
    searchable: true,
    picksFile: false,
    isSkill: false,
  },
};

/** 触发字符串 → 提及类型的映射，用于 O(1) 查找 */
const TRIGGER_TO_KIND: Record<string, ComposerMentionKind> = Object.fromEntries(
  Object.entries(COMPOSER_MENTION_TYPES).map(([kind, def]) => [def.trigger, kind as ComposerMentionKind]),
) as Record<string, ComposerMentionKind>;

/**
 * 根据触发字符串获取提及类型定义
 * @param trigger - 触发字符串，如 `@codebase`
 * @returns 提及类型定义，未匹配返回 null
 */
export function getComposerMentionType(trigger: string): ComposerMentionType | null {
  const kind = TRIGGER_TO_KIND[trigger];
  return kind ? COMPOSER_MENTION_TYPES[kind] : null;
}

/** 获取所有扩展提及类型定义 */
export function listComposerMentionTypes(): ComposerMentionType[] {
  return Object.values(COMPOSER_MENTION_TYPES);
}

// ---------------------------------------------------------------------------
// @codebase 搜索（带 300ms 防抖）
// ---------------------------------------------------------------------------

/** 防抖计时器句柄 */
let codebaseSearchTimer: ReturnType<typeof setTimeout> | null = null;

/** 防抖延迟（毫秒） */
const CODEBASE_SEARCH_DEBOUNCE_MS = 300;

/** 单次搜索返回的最大结果数 */
const CODEBASE_MAX_RESULTS = 20;

/**
 * 将符号结果转换为统一的提及结果项
 */
function symbolToItem(symbol: CodebaseSymbolResult): ComposerMentionItem {
  const relativeFile = shortenFilePath(symbol.file);
  return {
    id: `symbol:${symbol.file}:${symbol.line}:${symbol.name}`,
    kind: "codebase",
    label: symbol.name,
    description: `${symbol.kind} · ${relativeFile}:${symbol.line}`,
    file: symbol.file,
    line: symbol.line,
    context: buildCodebaseSymbolContext(symbol),
  };
}

/**
 * 将文本搜索结果转换为统一的提及结果项
 */
function textResultToItem(result: CodebaseTextResult): ComposerMentionItem {
  const relativeFile = shortenFilePath(result.file);
  const snippet = result.text.length > 80 ? `${result.text.slice(0, 80)}…` : result.text;
  return {
    id: `text:${result.file}:${result.line}:${result.column}`,
    kind: "codebase",
    label: snippet,
    description: `${relativeFile}:${result.line}`,
    file: result.file,
    line: result.line,
    context: buildCodebaseTextContext(result),
  };
}

/**
 * 缩短文件路径，移除常见前缀以提升可读性
 */
function shortenFilePath(filePath: string): string {
  // 用静态 regex literal 避免 happy-dom 解析动态拼接的 `[/\]` 失败
  const segments = filePath.split(/[/\\]/);
  if (segments.length <= 3) {
    return filePath;
  }
  return segments.slice(-3).join("/");
}

/**
 * 构建符号提及的上下文文本（附加到消息中）
 */
function buildCodebaseSymbolContext(symbol: CodebaseSymbolResult): string {
  return `@codebase 符号: ${symbol.name} (${symbol.kind})\n文件: ${symbol.file}:${symbol.line}:${symbol.column}`;
}

/**
 * 构建文本搜索结果的上下文文本
 */
function buildCodebaseTextContext(result: CodebaseTextResult): string {
  return `@codebase 匹配: ${result.file}:${result.line}:${result.column}\n内容: ${result.context.trim()}`;
}

/**
 * 执行代码库搜索（符号 + 全文），合并并截断结果
 *
 * 内部调用 Tauri 命令 `indexer_search_symbols` 与 `indexer_search_text`，
 * 两个请求并行发出，任一失败则忽略其结果（降级为仅返回成功的那一类）。
 *
 * @param query - 搜索查询字符串
 * @returns 合并后的提及结果项列表
 */
export async function searchCodebase(query: string): Promise<ComposerMentionItem[]> {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return [];
  }

  const [symbolsResult, textResult] = await Promise.allSettled([
    invoke<CodebaseSymbolResult[]>("indexer_search_symbols", { query: trimmed }),
    invoke<CodebaseTextResult[]>("indexer_search_text", { query: trimmed }),
  ]);

  const items: ComposerMentionItem[] = [];

  if (symbolsResult.status === "fulfilled") {
    items.push(...symbolsResult.value.slice(0, CODEBASE_MAX_RESULTS).map(symbolToItem));
  }
  if (textResult.status === "fulfilled") {
    const remaining = CODEBASE_MAX_RESULTS - items.length;
    if (remaining > 0) {
      items.push(...textResult.value.slice(0, remaining).map(textResultToItem));
    }
  }

  return items;
}

/**
 * 带防抖的代码库搜索
 *
 * 在 {@link CODEBASE_SEARCH_DEBOUNCE_MS} 毫秒内重复调用会取消前一次，
 * 仅执行最后一次。适合绑定到输入框 `onChange`。
 *
 * @param query - 搜索查询字符串
 * @returns 防抖结束后执行的搜索结果
 */
export function searchCodebaseDebounced(query: string): Promise<ComposerMentionItem[]> {
  if (codebaseSearchTimer) {
    clearTimeout(codebaseSearchTimer);
  }
  return new Promise((resolve, reject) => {
    codebaseSearchTimer = setTimeout(() => {
      searchCodebase(query).then(resolve, reject);
    }, CODEBASE_SEARCH_DEBOUNCE_MS);
  });
}

// ---------------------------------------------------------------------------
// @wiki 搜索（带 300ms 防抖）
// ---------------------------------------------------------------------------

/** Wiki 搜索结果（对应后端 `WikiEntryDto`） */
export interface WikiSearchResultDto {
  module: string;
  title: string;
  content: string;
  symbols: string[];
  updated_at: string;
}

/** Wiki 搜索响应（对应后端 `WikiSearchResult`） */
export interface WikiSearchResponse {
  count: number;
  entries: WikiSearchResultDto[];
}

/** Wiki 搜索防抖计时器句柄 */
let wikiSearchTimer: ReturnType<typeof setTimeout> | null = null;

/** Wiki 搜索防抖延迟（毫秒） */
const WIKI_SEARCH_DEBOUNCE_MS = 300;

/** Wiki 单次搜索返回的最大结果数 */
const WIKI_MAX_RESULTS = 20;

/**
 * 将 Wiki 条目转换为提及结果项
 */
function wikiEntryToItem(entry: WikiSearchResultDto): ComposerMentionItem {
  return {
    id: `wiki:${entry.module}`,
    kind: "wiki",
    label: entry.title,
    description: `${entry.module} · ${entry.symbols.length} 符号`,
    context: buildWikiContext(entry),
  };
}

/**
 * 构建 Wiki 提及的上下文文本
 */
function buildWikiContext(entry: WikiSearchResultDto): string {
  const symbolsList = entry.symbols.slice(0, 10).join(", ");
  const moreSymbols = entry.symbols.length > 10 ? ` 等 ${entry.symbols.length} 个符号` : "";
  return `@wiki 模块: ${entry.module}\n标题: ${entry.title}\n符号: ${symbolsList}${moreSymbols}\n\n${entry.content}`;
}

/**
 * 执行 Wiki 搜索
 *
 * 调用 Tauri 命令 `repo_wiki_search` 搜索项目 Wiki 文档。
 *
 * @param query - 搜索查询字符串
 * @param root - 项目根目录（可选，不传则使用当前工作区）
 * @returns 匹配的 Wiki 条目列表
 */
export async function searchWiki(query: string, root?: string): Promise<ComposerMentionItem[]> {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return [];
  }

  try {
    const result = await invoke<WikiSearchResponse>("repo_wiki_search", {
      params: {
        root: root ?? "",
        query: trimmed,
      },
    });

    return result.entries.slice(0, WIKI_MAX_RESULTS).map(wikiEntryToItem);
  } catch (error) {
    console.error("Wiki search failed:", error);
    return [];
  }
}

/**
 * 带防抖的 Wiki 搜索
 *
 * 在 {@link WIKI_SEARCH_DEBOUNCE_MS} 毫秒内重复调用会取消前一次，
 * 仅执行最后一次。适合绑定到输入框 `onChange`。
 *
 * @param query - 搜索查询字符串
 * @param root - 项目根目录（可选）
 * @returns 防抖结束后执行的搜索结果
 */
export function searchWikiDebounced(query: string, root?: string): Promise<ComposerMentionItem[]> {
  if (wikiSearchTimer) {
    clearTimeout(wikiSearchTimer);
  }
  return new Promise((resolve, reject) => {
    wikiSearchTimer = setTimeout(() => {
      searchWiki(query, root).then(resolve, reject);
    }, WIKI_SEARCH_DEBOUNCE_MS);
  });
}

// ---------------------------------------------------------------------------
// @ast-grep 搜索（带 300ms 防抖）
// ---------------------------------------------------------------------------

/** AST-Grep 匹配命中（与 contracts/astGrep.ts 中的 AstGrepMatch 同构） */
export interface AstGrepMatchItem {
  file: string;
  line: number;
  column: number;
  text: string;
  nodeKind: string;
}

/** AST-Grep 搜索防抖计时器句柄 */
let astGrepSearchTimer: ReturnType<typeof setTimeout> | null = null;

/** AST-Grep 搜索防抖延迟（毫秒） */
const AST_GREP_SEARCH_DEBOUNCE_MS = 300;

/** AST-Grep 单次搜索返回的最大结果数 */
const AST_GREP_MAX_RESULTS = 30;

/**
 * 解析 @ast-grep 触发器中的查询模式
 *
 * - `@ast-grep kind:call_expression` → { mode: "node-kind", query: "call_expression" }
 * - `@ast-grep console.log($MSG)` → { mode: "pattern", query: "console.log($MSG)" }
 * - `@ast-grep console.log` → { mode: "calls-to", query: "console.log" }（启发式：纯名称时走 calls-to）
 */
export interface AstGrepSearchSpec {
  mode: "pattern" | "node-kind" | "calls-to" | "references";
  query: string;
}

export function parseAstGrepQuery(rawQuery: string): AstGrepSearchSpec {
  const trimmed = rawQuery.trim();
  const kindMatch = /^kind:\s*(\w+)\s*$/.exec(trimmed);
  if (kindMatch) {
    return { mode: "node-kind", query: kindMatch[1] ?? "" };
  }
  const refMatch = /^refs?:\s*(\S+)\s*$/.exec(trimmed);
  if (refMatch) {
    return { mode: "references", query: refMatch[1] ?? "" };
  }
  // 启发式：含括号 / $ / 空格 → pattern；否则 → calls-to
  if (/[()$\s]/.test(trimmed)) {
    return { mode: "pattern", query: trimmed };
  }
  return { mode: "calls-to", query: trimmed };
}

/**
 * 把 AST-Grep 匹配命中转换为 ComposerMentionItem
 */
function astGrepMatchToItem(
  match: AstGrepMatchItem,
  originalQuery: string,
): ComposerMentionItem {
  const snippet = match.text.length > 80 ? `${match.text.slice(0, 80)}…` : match.text;
  return {
    id: `ast-grep:${match.file}:${match.line}:${match.column}`,
    kind: "ast-grep",
    label: snippet,
    description: `${match.nodeKind} · ${match.file}:${match.line}`,
    file: match.file,
    line: match.line,
    context: buildAstGrepContext(match, originalQuery),
  };
}

/** 构建 AST-Grep 命中节点的上下文文本 */
function buildAstGrepContext(match: AstGrepMatchItem, query: string): string {
  return `@ast-grep 命中: ${match.file}:${match.line}:${match.column}\n` +
    `节点类型: ${match.nodeKind}\n` +
    `查询: ${query}\n` +
    `内容: ${match.text.trim()}`;
}

/**
 * 执行 AST-Grep 搜索
 *
 * 调用 `searchAstGrepClient`（内部双路径：Tauri 命令或 WebSocket），
 * 命中节点转换为 ComposerMentionItem 后返回。
 *
 * @param query - 搜索查询字符串
 * @param root - 项目根目录（可选）
 * @returns 匹配的 AST 节点列表
 */
export async function searchAstGrep(
  query: string,
  root?: string,
): Promise<ComposerMentionItem[]> {
  const trimmed = query.trim();
  if (trimmed.length === 0 || !root) {
    return [];
  }
  const spec = parseAstGrepQuery(trimmed);
  if (!spec.query) return [];

  try {
    const raw = await searchAstGrepClient({
      workspaceRoot: root,
      mode: spec.mode,
      query: spec.query,
    });
    return raw.slice(0, AST_GREP_MAX_RESULTS).map((m) =>
      astGrepMatchToItem(
        {
          file: m.file,
          line: m.line,
          column: m.column,
          text: m.text,
          nodeKind: m.nodeKind,
        },
        trimmed,
      ),
    );
  } catch (error) {
    console.error("AST-Grep search failed:", error);
    return [];
  }
}

/**
 * 带防抖的 AST-Grep 搜索
 *
 * 在 {@link AST_GREP_SEARCH_DEBOUNCE_MS} 毫秒内重复调用会取消前一次，
 * 仅执行最后一次。适合绑定到输入框 `onChange`。
 */
export function searchAstGrepDebounced(
  query: string,
  root?: string,
): Promise<ComposerMentionItem[]> {
  if (astGrepSearchTimer) {
    clearTimeout(astGrepSearchTimer);
  }
  return new Promise((resolve, reject) => {
    astGrepSearchTimer = setTimeout(() => {
      searchAstGrep(query, root).then(resolve, reject);
    }, AST_GREP_SEARCH_DEBOUNCE_MS);
  });
}

// ---------------------------------------------------------------------------
// @docx / @xlsx / @pdf 文件选择与内容提取
// ---------------------------------------------------------------------------

/** Office 文档提及类型 → 允许的文件扩展名 */
const OFFICE_DOC_EXTENSIONS: Record<"docx" | "xlsx" | "pdf", string[]> = {
  docx: ["docx"],
  xlsx: ["xlsx"],
  pdf: ["pdf"],
};

/** Office 文档提及类型 → 文件选择对话框标题 */
const OFFICE_DOC_TITLES: Record<"docx" | "xlsx" | "pdf", string> = {
  docx: "选择 Word 文档",
  xlsx: "选择 Excel 工作簿",
  pdf: "选择 PDF 文件",
};

/**
 * 弹出文件选择对话框，返回选中文件路径
 *
 * @param kind - Office 文档提及类型
 * @returns 选中文件路径，用户取消返回 null
 */
export async function pickOfficeDocument(
  kind: "docx" | "xlsx" | "pdf",
): Promise<string | null> {
  const extensions = OFFICE_DOC_EXTENSIONS[kind];
  const options: OpenDialogOptions = {
    multiple: false,
    directory: false,
    title: OFFICE_DOC_TITLES[kind],
    filters: [
      {
        name: kind.toUpperCase(),
        extensions,
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
 * 从文件名提取短标签（不含扩展名）
 */
function fileBaseName(filePath: string): string {
  // 用静态 regex literal 避免 happy-dom 解析动态拼接的 `[/\\\\]` 失败
  const segments = filePath.split(/[/\\]/);
  const fileName = segments[segments.length - 1] ?? filePath;
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
}

/**
 * 构建 docx 提及结果项
 *
 * 调用 Tauri 命令 `office_docx_read` 提取段落文本列表，
 * 拼接为上下文文本（每段一行），并截断超长内容。
 */
async function buildDocxMentionItem(filePath: string): Promise<ComposerMentionItem> {
  const paragraphs = await invoke<string[]>("office_docx_read", { path: filePath });
  const MAX_CHARS = 8000;
  const joined = paragraphs.join("\n");
  const truncated =
    joined.length > MAX_CHARS ? `${joined.slice(0, MAX_CHARS)}\n…（已截断）` : joined;
  return {
    id: `docx:${filePath}`,
    kind: "docx",
    label: fileBaseName(filePath),
    description: `Word · ${paragraphs.length} 段`,
    file: filePath,
    context: `@docx 文档: ${filePath}\n\n${truncated}`,
  };
}

/**
 * 构建 xlsx 提及结果项
 *
 * 调用 Tauri 命令 `office_xlsx_read` 提取 sheet 数据，
 * 将每个 sheet 转换为 Markdown 表格片段作为上下文。
 */
async function buildXlsxMentionItem(filePath: string): Promise<ComposerMentionItem> {
  interface XlsxSheetData {
    sheetName: string;
    rows: string[][];
  }
  const sheets = await invoke<XlsxSheetData[]>("office_xlsx_read", { path: filePath });
  const MAX_ROWS_PER_SHEET = 50;
  const MAX_CELLS = 5000;
  let cellCount = 0;
  const sections = sheets.map((sheet) => {
    const header = `### Sheet: ${sheet.sheetName}`;
    const limitedRows = sheet.rows.slice(0, MAX_ROWS_PER_SHEET);
    const tableRows: string[] = [];
    for (const row of limitedRows) {
      if (cellCount + row.length > MAX_CELLS) {
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
    id: `xlsx:${filePath}`,
    kind: "xlsx",
    label: fileBaseName(filePath),
    description: `Excel · ${sheets.length} sheet`,
    file: filePath,
    context: `@xlsx 工作簿: ${filePath}\n\n${sections.join("\n\n")}`,
  };
}

/**
 * 构建 pdf 提及结果项
 *
 * 调用 Tauri 命令 `office_pdf_extract` 提取全文，
 * 截断超长内容后作为上下文。
 */
async function buildPdfMentionItem(filePath: string): Promise<ComposerMentionItem> {
  const text = await invoke<string>("office_pdf_extract", { path: filePath });
  const MAX_CHARS = 8000;
  const truncated =
    text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS)}\n…（已截断）` : text;
  return {
    id: `pdf:${filePath}`,
    kind: "pdf",
    label: fileBaseName(filePath),
    description: `PDF · ${text.length} 字符`,
    file: filePath,
    context: `@pdf 文档: ${filePath}\n\n${truncated}`,
  };
}

/**
 * 选择并提取 Office 文档内容，返回提及结果项
 *
 * 流程：弹出文件选择对话框 → 调用对应 Tauri 命令提取内容 → 封装为提及项。
 * 用户取消选择时返回 null。
 *
 * @param kind - Office 文档提及类型（docx / xlsx / pdf）
 * @returns 提及结果项，用户取消返回 null
 */
export async function pickAndExtractOfficeDocument(
  kind: "docx" | "xlsx" | "pdf",
): Promise<ComposerMentionItem | null> {
  const filePath = await pickOfficeDocument(kind);
  if (!filePath) {
    return null;
  }
  switch (kind) {
    case "docx":
      return buildDocxMentionItem(filePath);
    case "xlsx":
      return buildXlsxMentionItem(filePath);
    case "pdf":
      return buildPdfMentionItem(filePath);
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// 上下文附加辅助函数
// ---------------------------------------------------------------------------

/**
 * 将提及结果项的上下文格式化为可附加到消息的文本块
 *
 * @param item - 提及结果项
 * @returns 格式化后的上下文文本块（以 ``` 包裹）
 */
export function buildComposerMentionContext(item: ComposerMentionItem): string {
  return `\n\`\`\`\n${item.context}\n\`\`\`\n`;
}
