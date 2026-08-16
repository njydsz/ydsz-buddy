/**
 * @file Monaco 编辑器 LSP 集成 hook
 * @description 把 contracts/lsp.ts 中的 LSP 命令接入 Monaco editor:
 *   - 文件打开 → lspDidOpen + 启动 LSP 服务器（按语言匹配）
 *   - 内容变更 → 防抖 lspDidChange
 *   - 保存 → lspDidSave + 拉取 diagnostics
 *   - hover → lspHover（光标停留时）
 *   - 诊断 → lspDiagnostics 渲染为 Monaco markers
 *   - 右键菜单 → lspGotoDefinition / lspReferences / lspRename
 *
 * 设计原则：
 *   - 所有 LSP 调用失败都静默吞掉（编辑器功能不能因 LSP 失败而中断）
 *   - LSP 服务器按需启动：第一次打开支持语言的文件时才启动
 *   - 多语言并发：不同语言的 LSP 服务器可同时运行（与后端 LspState HashMap 对齐）
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { editor as MonacoEditorNS, IDisposable, languages as MonacoLanguagesNS } from "monaco-editor";

import type { MonacoEditor, MonacoNamespace } from "~/lib/monacoSetup";
import {
  lspCodeAction,
  lspCompletion,
  lspDidChange,
  lspDiagnostics,
  lspDidOpen,
  lspFormatting,
  lspGotoDefinition,
  lspHover,
  lspListPresets,
  lspReferences,
  lspRename,
  lspSignatureHelp,
  lspStartServer,
  type LspDiagnostic,
  type LspLocation,
} from "~/contracts/lsp";
import { detectLanguageId } from "./languageDetection";

/** LSP 启动状态 */
type LspStatus = "idle" | "starting" | "ready" | "failed";

/** 支持自动启动 LSP 的语言 ID（与后端 preset_for_language 对齐） */
const LSP_SUPPORTED_LANGUAGES = new Set(["typescript", "javascript", "python", "rust", "go", "java", "csharp", "cpp", "c"]);

/** Monaco languageId → 后端 languageId（用于 didOpen） */
const MONACO_TO_LANGUAGE_ID: Record<string, string> = {
  typescript: "typescript",
  javascript: "javascript",
  python: "python",
  rust: "rust",
  go: "go",
  java: "java",
  csharp: "csharp",
  cpp: "cpp",
  c: "cpp",
  // Monaco 把 .tsx 识别为 typescriptreact，统一映射到 typescript
  typescriptreact: "typescript",
  javascriptreact: "javascript",
};

/** didChange 防抖间隔（ms） */
const DID_CHANGE_DEBOUNCE_MS = 300;

/** hover 触发延迟（ms） */
const HOVER_DELAY_MS = 250;

/** Monaco MarkerSeverity 常量（与 monaco-editor MarkerSeverity enum 对齐） */
const MONACO_MARKER_SEVERITY = {
  Error: 8,
  Warning: 4,
  Info: 2,
  Hint: 1,
} as const;

/** 把 LspLocation 转换为 Monaco IWordAtPosition / 跳转目标 */
function lspLocationToMonaco(loc: LspLocation): {
  uri: { path: string };
  range: {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  };
} {
  // uri 形如 file:///D:/foo/bar.ts → 取 path 部分
  let path = loc.uri;
  if (path.startsWith("file:///")) {
    path = path.slice("file://".length);
    // Windows: /D:/foo → D:/foo
    if (/^\/[A-Za-z]:/.test(path)) {
      path = path.slice(1);
    }
  } else if (path.startsWith("file://")) {
    path = path.slice("file://".length);
  }
  return {
    uri: { path },
    range: {
      startLineNumber: loc.range.start.line + 1,
      startColumn: loc.range.start.character + 1,
      endLineNumber: loc.range.end.line + 1,
      endColumn: loc.range.end.character + 1,
    },
  };
}

/** LSP DiagnosticSeverity → Monaco MarkerSeverity 数字常量 */
function severityToMonaco(severity: LspDiagnostic["severity"]): number {
  switch (severity) {
    case 1: return MONACO_MARKER_SEVERITY.Error;
    case 2: return MONACO_MARKER_SEVERITY.Warning;
    case 3: return MONACO_MARKER_SEVERITY.Info;
    case 4: return MONACO_MARKER_SEVERITY.Hint;
    default: return MONACO_MARKER_SEVERITY.Error;
  }
}

/** 把 LSP diagnostics 转换为 Monaco markers */
function diagnosticsToMarkers(
  diagnostics: readonly LspDiagnostic[],
): MonacoEditorNS.IMarkerData[] {
  return diagnostics.map((d) => ({
    startLineNumber: d.range.start.line + 1,
    startColumn: d.range.start.character + 1,
    endLineNumber: d.range.end.line + 1,
    endColumn: d.range.end.character + 1,
    message: d.message,
    severity: severityToMonaco(d.severity),
    source: d.source,
    code: d.code?.toString(),
  }));
}

export interface UseCodeEditorLspResult {
  /** LSP 当前状态 */
  status: LspStatus;
  /** LSP 启动错误信息 */
  error: string | null;
  /** 最近一次 diagnostics（用于状态栏展示计数） */
  diagnosticsCount: number;
}

export interface UseCodeEditorLspParams {
  /** 工作区根目录（用于 lspStartServer） */
  workspaceRoot: string;
  /** 当前打开的文件绝对路径 */
  filePath: string | null;
  /** Monaco editor 实例（onMount 时拿到） */
  editor: MonacoEditor | null;
  /** Monaco namespace（onMount 时拿到） */
  monaco: MonacoNamespace | null;
  /** 工作区模式（"local" 默认 / "ssh" 远端开发） */
  mode?: "local" | "ssh";
  /** SSH 连接 ID（mode === "ssh" 时必填） */
  sshConnectionId?: string | null;
}

/**
 * 把 LSP 集成到 Monaco 编辑器。
 *
 * 调用方只需在 CodeEditor 的 onMount 中把 editor/monaco 传入,
 * hook 会自动处理 didOpen/didChange/didSave + hover + diagnostics + 跳转.
 */
export function useCodeEditorLsp({
  workspaceRoot,
  filePath,
  editor,
  monaco,
  mode,
  sshConnectionId,
}: UseCodeEditorLspParams): UseCodeEditorLspResult {
  const [status, setStatus] = useState<LspStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [diagnosticsCount, setDiagnosticsCount] = useState(0);

  // refs：避免闭包过期
  const versionRef = useRef(0);
  const activeLanguagesRef = useRef<Set<string>>(new Set());
  const didChangeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disposablesRef = useRef<IDisposable[]>([]);

  // 清理所有 disposable
  const disposeAll = useCallback(() => {
    disposablesRef.current.forEach((d) => d.dispose());
    disposablesRef.current = [];
    if (didChangeTimerRef.current) {
      clearTimeout(didChangeTimerRef.current);
      didChangeTimerRef.current = null;
    }
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }, []);

  // 启动 LSP 服务器（多语言并发，按语言按需启动）
  const ensureServer = useCallback(
    async (languageId: string): Promise<boolean> => {
      if (activeLanguagesRef.current.has(languageId)) {
        return true;
      }
      if (!LSP_SUPPORTED_LANGUAGES.has(languageId)) {
        return false;
      }

      // 检查后端是否已启动该语言服务器（可能由其他编辑器实例启动）
      try {
        const presets = await lspListPresets();
        const matched = presets.find((p) => p.language === languageId && p.active);
        if (matched) {
          activeLanguagesRef.current.add(languageId);
          setStatus("ready");
          return true;
        }
      } catch {
        // 列表失败 → 尝试启动
      }

      setStatus("starting");
      setError(null);
      try {
        await lspStartServer(languageId, workspaceRoot, mode, sshConnectionId);
        activeLanguagesRef.current.add(languageId);
        setStatus("ready");
        return true;
      } catch (e) {
        setStatus("failed");
        setError(e instanceof Error ? e.message : String(e));
        return false;
      }
    },
    [workspaceRoot, mode, sshConnectionId],
  );

  // 拉取并渲染 diagnostics
  const refreshDiagnostics = useCallback(
    async (path: string, model: MonacoEditorNS.ITextModel) => {
      if (!monaco) return;
      try {
        const diags = await lspDiagnostics(path);
        const markers = diagnosticsToMarkers(diags);
        monaco.editor.setModelMarkers(model, "lsp", markers);
        setDiagnosticsCount(diags.length);
      } catch {
        // 静默
      }
    },
    [monaco],
  );

  // 文件切换：didOpen + 拉取 diagnostics
  useEffect(() => {
    if (!editor || !monaco || !filePath) return;

    const monacoLangId = detectLanguageId(filePath);
    const backendLangId = MONACO_TO_LANGUAGE_ID[monacoLangId];
    if (!backendLangId) {
      // 不支持的语言，跳过 LSP
      return;
    }

    let cancelled = false;
    versionRef.current += 1;

    (async () => {
      const ok = await ensureServer(backendLangId);
      if (cancelled || !ok) return;

      const model = editor.getModel();
      if (!model) return;

      // 发送 didOpen
      try {
        await lspDidOpen(filePath, backendLangId, model.getValue());
      } catch {
        // 静默
      }

      if (cancelled) return;
      // 拉取初始 diagnostics（延迟一点等服务器分析）
      setTimeout(() => {
        if (!cancelled) void refreshDiagnostics(filePath, model);
      }, 200);
    })();

    return () => {
      cancelled = true;
    };
  }, [editor, monaco, filePath, ensureServer, refreshDiagnostics]);

  // 注册 hover provider / definition provider / references provider / rename provider
  // （只在 monaco 可用时注册一次）
  useEffect(() => {
    if (!monaco || !editor) return;

    const languages = monaco.languages;

    // ===== Hover Provider =====
    const hoverProvider = languages.registerHoverProvider(
      ["typescript", "javascript", "python", "rust", "go"],
      {
        provideHover: (model, position) => {
          const path = model.uri.path;
          // 用同步触发 + 异步返回的方式（Monaco 支持 Thenable）
          return new Promise((resolve) => {
            if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
            hoverTimerRef.current = setTimeout(async () => {
              try {
                const hover = await lspHover(
                  path,
                  position.lineNumber - 1,
                  position.column - 1,
                );
                if (!hover) {
                  resolve(null);
                  return;
                }
                // 把 LSP Hover contents 转换为 Monaco hover contents
                const contents = Array.isArray(hover.contents)
                  ? hover.contents
                  : [hover.contents];
                const monacoContents = contents.map((c) => {
                  if (typeof c === "string") {
                    return { value: c };
                  }
                  return {
                    value: c.kind === "markdown" ? c.value : `\`\`\`\n${c.value}\n\`\`\``,
                  };
                });
                resolve({
                  range: hover.range
                    ? {
                        startLineNumber: hover.range.start.line + 1,
                        startColumn: hover.range.start.character + 1,
                        endLineNumber: hover.range.end.line + 1,
                        endColumn: hover.range.end.character + 1,
                      }
                    : undefined,
                  contents: monacoContents,
                });
              } catch {
                resolve(null);
              }
            }, HOVER_DELAY_MS);
          });
        },
      },
    );

    // ===== Definition Provider =====
    const definitionProvider = languages.registerDefinitionProvider(
      ["typescript", "javascript", "python", "rust", "go"],
      {
        provideDefinition: async (model, position) => {
          const path = model.uri.path;
          try {
            const locations = await lspGotoDefinition(
              path,
              position.lineNumber - 1,
              position.column - 1,
            );
            return locations.map((loc) => {
              const converted = lspLocationToMonaco(loc);
              return {
                uri: monaco.Uri.parse(`file://${converted.uri.path}`),
                range: converted.range,
              };
            });
          } catch {
            return null;
          }
        },
      },
    );

    // ===== References Provider =====
    const referencesProvider = languages.registerReferenceProvider(
      ["typescript", "javascript", "python", "rust", "go"],
      {
        provideReferences: async (model, position) => {
          const path = model.uri.path;
          try {
            const locations = await lspReferences(
              path,
              position.lineNumber - 1,
              position.column - 1,
              true,
            );
            return locations.map((loc) => {
              const converted = lspLocationToMonaco(loc);
              return {
                uri: monaco.Uri.parse(`file://${converted.uri.path}`),
                range: converted.range,
              };
            });
          } catch {
            return null;
          }
        },
      },
    );

    // ===== Rename Provider =====
    const renameProvider = languages.registerRenameProvider(
      ["typescript", "javascript", "python", "rust", "go"],
      {
        provideRenameEdits: async (model, position, newName) => {
          const path = model.uri.path;
          try {
            const edit = await lspRename(
              path,
              position.lineNumber - 1,
              position.column - 1,
              newName,
            );
            if (!edit) return null;

            // 把 LSP WorkspaceEdit 转换为 Monaco IWorkspaceEdit
            const edits: MonacoLanguagesNS.IWorkspaceTextEdit[] = [];
            if (edit.changes) {
              for (const [uri, ranges] of Object.entries(edit.changes)) {
                const monacoUri = monaco.Uri.parse(uri);
                for (const range of ranges) {
                  edits.push({
                    resource: monacoUri,
                    textEdit: {
                      range: {
                        startLineNumber: range.start.line + 1,
                        startColumn: range.start.character + 1,
                        endLineNumber: range.end.line + 1,
                        endColumn: range.end.character + 1,
                      },
                      text: newName,
                    },
                    versionId: undefined,
                  });
                }
              }
            }
            return { edits };
          } catch {
            return null;
          }
        },
      },
    );

    // ===== Completion Provider =====
    const completionProvider = languages.registerCompletionItemProvider(
      ["typescript", "javascript", "python", "rust", "go"],
      {
        triggerCharacters: [".", "/", ":", "<", '"', "'", "`"],
        provideCompletionItems: async (model, position) => {
          const path = model.uri.path;
          try {
            const items = await lspCompletion(
              path,
              position.lineNumber - 1,
              position.column - 1,
            );
            const word = model.getWordUntilPosition(position);
            const range = {
              startLineNumber: position.lineNumber,
              endLineNumber: position.lineNumber,
              startColumn: word.startColumn,
              endColumn: word.endColumn,
            };
            return {
              suggestions: items.map((item) => ({
                label: item.label,
                kind: item.kind ?? 1, // Text fallback
                detail: item.detail,
                documentation: typeof item.documentation === "string"
                  ? item.documentation
                  : item.documentation?.value,
                insertText: item.insertText ?? item.label,
                insertTextFormat: item.insertTextFormat ?? 1,
                sortText: item.sortText,
                filterText: item.filterText,
                range,
              })),
            };
          } catch {
            return { suggestions: [] };
          }
        },
      },
    );

    // ===== Code Action Provider =====
    const codeActionProvider = languages.registerCodeActionProvider(
      ["typescript", "javascript", "python", "rust", "go"],
      {
        provideCodeActions: async (model, range, context) => {
          const path = model.uri.path;
          try {
            const actions = await lspCodeAction(
              path,
              range.startLineNumber - 1,
              range.startColumn - 1,
              range.endLineNumber - 1,
              range.endColumn - 1,
            );
            // 把 LSP CodeAction 转换为 Monaco CodeAction
            const monacoActions: MonacoLanguagesNS.CodeAction[] = actions.map((a) => {
              const result: MonacoLanguagesNS.CodeAction = {
                title: a.title,
                kind: a.kind,
                isPreferred: a.isPreferred,
                // 提供 diagnostics 上下文（取自 Monaco 当前 markers）
                diagnostics: context.markers,
              };
              if (a.edit) {
                // 把 LSP WorkspaceEdit 转换为 Monaco IWorkspaceEdit
                const edits: MonacoLanguagesNS.IWorkspaceTextEdit[] = [];
                if (a.edit.changes) {
                  for (const [uri, ranges] of Object.entries(a.edit.changes)) {
                    const monacoUri = monaco.Uri.parse(uri);
                    for (const r of ranges) {
                      edits.push({
                        resource: monacoUri,
                        textEdit: {
                          range: {
                            startLineNumber: r.start.line + 1,
                            startColumn: r.start.character + 1,
                            endLineNumber: r.end.line + 1,
                            endColumn: r.end.character + 1,
                          },
                          text: "",
                        },
                        versionId: undefined,
                      });
                    }
                  }
                }
                if (a.edit.documentChanges) {
                  for (const dc of a.edit.documentChanges) {
                    const monacoUri = monaco.Uri.parse(dc.textDocument.uri);
                    for (const e of dc.edits) {
                      edits.push({
                        resource: monacoUri,
                        textEdit: {
                          range: {
                            startLineNumber: e.range.start.line + 1,
                            startColumn: e.range.start.character + 1,
                            endLineNumber: e.range.end.line + 1,
                            endColumn: e.range.end.character + 1,
                          },
                          text: e.newText,
                        },
                        versionId: undefined,
                      });
                    }
                  }
                }
                result.edit = { edits };
              }
              if (a.command) {
                result.command = {
                  id: a.command.command,
                  title: a.command.title,
                  arguments: a.command.arguments,
                };
              }
              return result;
            });
            return { actions: monacoActions, dispose: () => {} };
          } catch {
            return { actions: [], dispose: () => {} };
          }
        },
      },
    );

    // ===== Signature Help Provider =====
    const signatureHelpProvider = languages.registerSignatureHelpProvider(
      ["typescript", "javascript", "python", "rust", "go"],
      {
        signatureHelpTriggerCharacters: ["(", ","],
        provideSignatureHelp: async (model, position) => {
          const path = model.uri.path;
          try {
            const help = await lspSignatureHelp(
              path,
              position.lineNumber - 1,
              position.column - 1,
            );
            if (!help) return null;
            // 把 LSP SignatureHelp 转换为 Monaco SignatureHelp
            return {
              value: {
                signatures: help.signatures.map((sig) => ({
                  label: sig.label,
                  documentation:
                    typeof sig.documentation === "string"
                      ? sig.documentation
                      : sig.documentation
                        ? { value: sig.documentation.value }
                        : undefined,
                  parameters: (sig.parameters ?? []).map((p) => ({
                    label: p.label,
                    documentation: p.documentation,
                  })),
                })),
                activeSignature: help.activeSignature ?? 0,
                activeParameter: help.activeParameter ?? 0,
              },
              dispose: () => {},
            };
          } catch {
            return null;
          }
        },
      },
    );

    // ===== Document Formatting Edit Provider =====
    const formattingProvider = languages.registerDocumentFormattingEditProvider(
      ["typescript", "javascript", "python", "rust", "go", "java", "csharp", "cpp", "c"],
      {
        provideDocumentFormattingEdits: async (model, options) => {
          const path = model.uri.path;
          try {
            const edits = await lspFormatting(
              path,
              options.tabSize,
              options.insertSpaces,
            );
            // 把 LSP TextEdit 转换为 Monaco TextEdit
            return edits.map((e) => ({
              range: {
                startLineNumber: e.range.start.line + 1,
                startColumn: e.range.start.character + 1,
                endLineNumber: e.range.end.line + 1,
                endColumn: e.range.end.character + 1,
              },
              text: e.newText,
            }));
          } catch {
            return [];
          }
        },
      },
    );

    disposablesRef.current.push(
      hoverProvider,
      definitionProvider,
      referencesProvider,
      renameProvider,
      completionProvider,
      codeActionProvider,
      signatureHelpProvider,
      formattingProvider,
    );

    return () => {
      disposeAll();
    };
  }, [monaco, editor, disposeAll]);

  // 监听内容变更 → 防抖 didChange
  useEffect(() => {
    if (!editor || !filePath) return;
    const monacoLangId = detectLanguageId(filePath);
    const backendLangId = MONACO_TO_LANGUAGE_ID[monacoLangId];
    if (!backendLangId) return;

    const subscription = editor.onDidChangeModelContent(() => {
      if (didChangeTimerRef.current) {
        clearTimeout(didChangeTimerRef.current);
      }
      didChangeTimerRef.current = setTimeout(async () => {
        const model = editor.getModel();
        if (!model) return;
        versionRef.current += 1;
        try {
          await lspDidChange(filePath, versionRef.current, model.getValue());
          // didChange 后拉取 diagnostics
          void refreshDiagnostics(filePath, model);
        } catch {
          // 静默
        }
      }, DID_CHANGE_DEBOUNCE_MS);
    });

    return () => {
      subscription.dispose();
      if (didChangeTimerRef.current) {
        clearTimeout(didChangeTimerRef.current);
        didChangeTimerRef.current = null;
      }
    };
  }, [editor, filePath, refreshDiagnostics]);

  return { status, error, diagnosticsCount };
}
