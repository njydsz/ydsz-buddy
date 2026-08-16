// LSP 契约：与 src-tauri/src/commands/lsp.rs 中的 Tauri 命令对齐。
//
// 命名约定：
// - Rust 端 `#[serde(rename_all = "camelCase")]` → TS 端 camelCase
// - 命令名：snake_case（与 Rust 函数名一致，invoke 时直接用）
// - 类型名：PascalCase
//
// 后端单源：ydsz-desktop/src-tauri/src/commands/lsp.rs
// 前端手写契约（tauri-specta 在 Windows 上有 STATUS_ENTRYPOINT_NOT_FOUND
// 链接问题，commands.ts 暂未自动生成；与 editor.ts 同模式）。

import { invoke } from "@tauri-apps/api/core";

// ===== 共享类型 =====

/** LSP 预设语言服务器信息（与 useComposerLspPick.ts 中的定义保持一致） */
export interface LspPresetInfo {
  language: string;
  displayName: string;
  fileExtensions: readonly string[];
  active: boolean;
}

/** LSP 位置（行号/列号均为 0-based，与 Monaco 一致） */
export interface LspPosition {
  line: number;
  character: number;
}

/** LSP 范围 */
export interface LspRange {
  start: LspPosition;
  end: LspPosition;
}

/** LSP Location：URI + Range */
export interface LspLocation {
  uri: string;
  range: LspRange;
}

/** LSP 诊断严重程度（与 lsp_types::DiagnosticSeverity 对齐） */
export const LspDiagnosticSeverity = {
  Error: 1,
  Warning: 2,
  Information: 3,
  Hint: 4,
} as const;

export type LspDiagnosticSeverity =
  (typeof LspDiagnosticSeverity)[keyof typeof LspDiagnosticSeverity];

/** LSP 诊断 */
export interface LspDiagnostic {
  range: LspRange;
  severity?: LspDiagnosticSeverity;
  code?: number | string;
  source?: string;
  message: string;
  relatedInformation?: Array<{
    location: LspLocation;
    message: string;
  }>;
}

/** LSP Hover 内容（MarkupContent 形态） */
export interface LspHoverMarkup {
  kind: "markdown" | "plaintext";
  value: string;
}

/** LSP Hover（contents 可能是 MarkupContent / MarkedString / MarkedString[]） */
export interface LspHover {
  contents: LspHoverMarkup | string | Array<LspHoverMarkup | string>;
  range?: LspRange;
}

/** LSP 补全项 */
export interface LspCompletionItem {
  label: string;
  kind?: number;
  detail?: string;
  documentation?: string | LspHoverMarkup;
  insertText?: string;
  insertTextFormat?: number;
  sortText?: string;
  filterText?: string;
}

/** LSP 补全列表 */
export interface LspCompletionList {
  isIncomplete: boolean;
  items: LspCompletionItem[];
}

/** LSP WorkspaceEdit（重命名结果） */
export interface LspWorkspaceEdit {
  changes?: Record<string, LspRange[]>;
  documentChanges?: Array<{
    textDocument: { uri: string; version: number | null };
    edits: Array<{ range: LspRange; newText: string }>;
  }>;
}

/** LSP Code Action（代码操作） */
export interface LspCodeAction {
  title: string;
  /** "quickfix" | "refactor" | "source" */
  kind?: string;
  edit?: LspWorkspaceEdit;
  command?: { title: string; command: string; arguments?: unknown[] };
  isPreferred?: boolean;
}

/** LSP Signature Information（签名信息） */
export interface LspSignatureInfo {
  label: string;
  documentation?: string | { value: string };
  parameters?: Array<{ label: string; documentation?: string }>;
}

/** LSP Signature Help（签名提示） */
export interface LspSignatureHelp {
  signatures: LspSignatureInfo[];
  activeSignature?: number;
  activeParameter?: number;
}

/** LSP Text Edit（文本编辑，格式化结果） */
export interface LspTextEdit {
  range: { start: LspPosition; end: LspPosition };
  newText: string;
}

// ===== 命令调用封装 =====

/**
 * 启动 LSP 服务器
 * @param language 语言名（typescript/python/rust/go）
 * @param workspaceRoot 工作区根目录绝对路径
 * @param mode 工作区模式（"local" 默认 / "ssh" 远端开发）
 * @param connectionId SSH 连接 ID（mode === "ssh" 时必填）
 */
export function lspStartServer(
  language: string,
  workspaceRoot: string,
  mode?: "local" | "ssh",
  connectionId?: string | null,
): Promise<void> {
  return invoke<void>("lsp_start_server", {
    language,
    workspaceRoot,
    mode: mode ?? "local",
    connectionId: connectionId ?? null,
  });
}

/** 列出所有可用 LSP 预设 */
export function lspListPresets(): Promise<LspPresetInfo[]> {
  return invoke<LspPresetInfo[]>("lsp_list_presets");
}

/** 停止指定语言的 LSP 服务器（多语言并发管理） */
export function lspStopServer(language: string): Promise<void> {
  return invoke<void>("lsp_stop_server", { language });
}

/** 跳转到定义 */
export function lspGotoDefinition(
  filePath: string,
  line: number,
  character: number,
): Promise<LspLocation[]> {
  return invoke<LspLocation[]>("lsp_goto_definition", {
    filePath,
    line,
    character,
  });
}

/** 查找引用 */
export function lspReferences(
  filePath: string,
  line: number,
  character: number,
  includeDeclaration = true,
): Promise<LspLocation[]> {
  return invoke<LspLocation[]>("lsp_references", {
    filePath,
    line,
    character,
    includeDeclaration,
  });
}

/** 悬浮提示 */
export function lspHover(
  filePath: string,
  line: number,
  character: number,
): Promise<LspHover | null> {
  return invoke<LspHover | null>("lsp_hover", { filePath, line, character });
}

/** 重命名符号 */
export function lspRename(
  filePath: string,
  line: number,
  character: number,
  newName: string,
): Promise<LspWorkspaceEdit | null> {
  return invoke<LspWorkspaceEdit | null>("lsp_rename", {
    filePath,
    line,
    character,
    newName,
  });
}

/** 代码补全（返回 CompletionList 或 CompletionItem[]，统一展开为 items） */
export async function lspCompletion(
  filePath: string,
  line: number,
  character: number,
): Promise<LspCompletionItem[]> {
  const raw = await invoke<LspCompletionList | LspCompletionItem[] | null>(
    "lsp_completion",
    { filePath, line, character },
  );
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw;
  return raw.items ?? [];
}

/** 获取文件诊断 */
export function lspDiagnostics(filePath: string): Promise<LspDiagnostic[]> {
  return invoke<LspDiagnostic[]>("lsp_diagnostics", { filePath });
}

/** 通知 LSP 服务器打开文件 */
export function lspDidOpen(
  filePath: string,
  languageId: string,
  text: string,
): Promise<void> {
  return invoke<void>("lsp_did_open", { filePath, languageId, text });
}

/** 通知 LSP 服务器文件内容变更 */
export function lspDidChange(
  filePath: string,
  version: number,
  text: string,
): Promise<void> {
  return invoke<void>("lsp_did_change", { filePath, version, text });
}

/** 通知 LSP 服务器文件已保存 */
export function lspDidSave(
  filePath: string,
  text?: string,
): Promise<void> {
  return invoke<void>("lsp_did_save", { filePath, text });
}

/** Code Action（代码操作：quickfix / refactor / source） */
export function lspCodeAction(
  filePath: string,
  startLine: number,
  startChar: number,
  endLine: number,
  endChar: number,
): Promise<LspCodeAction[]> {
  return invoke<LspCodeAction[]>("lsp_code_action", {
    filePath,
    startLine,
    startChar,
    endLine,
    endChar,
  });
}

/** Signature Help（签名提示） */
export function lspSignatureHelp(
  filePath: string,
  line: number,
  character: number,
): Promise<LspSignatureHelp | null> {
  return invoke<LspSignatureHelp | null>("lsp_signature_help", {
    filePath,
    line,
    character,
  });
}

/** 格式化文档 */
export function lspFormatting(
  filePath: string,
  tabSize: number,
  insertSpaces: boolean,
): Promise<LspTextEdit[]> {
  return invoke<LspTextEdit[]>("lsp_formatting", {
    filePath,
    tabSize,
    insertSpaces,
  });
}
