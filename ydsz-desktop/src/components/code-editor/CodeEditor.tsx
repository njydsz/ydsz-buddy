/**
 * @file Monaco 代码编辑器组件
 * @description 内置代码编辑器，支持打开/编辑/保存文件、语法高亮、
 *              Cmd/Ctrl+S 保存、脏状态指示、只读模式切换、LSP 集成
 *              （hover/定义/引用/重命名/补全/诊断）。
 *              离线打包（不依赖 CDN），适配 Tauri 桌面端。
 */

import { Editor, type OnMount, type BeforeMount } from "@monaco-editor/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { detectLanguageId, isBinaryFile } from "./languageDetection";
import { useCodeEditorInlineCompletion } from "./useCodeEditorInlineCompletion";
import { useCodeEditorLsp } from "./useCodeEditorLsp";
import { setupMonaco, type MonacoEditor, type MonacoNamespace } from "~/lib/monacoSetup";
import { tauriBridge } from "~/lib/tauri-bridge";
import { useMessages } from "~/i18n/I18nContext";
import { lspDidSave } from "~/contracts/lsp";
import { cn } from "~/lib/utils";

// 确保 Monaco worker 配置只执行一次（模块副作用）
setupMonaco();

export interface CodeEditorProps {
  /** 文件绝对路径 */
  filePath: string | null;
  /** 工作区根目录（用于 LSP 启动；不传则不启用 LSP） */
  workspaceRoot?: string;
  /** 编辑器初始是否只读 */
  initialReadOnly?: boolean;
  /** 主题：跟随系统 / 浅色 / 深色 */
  theme?: "vs" | "vs-dark" | "hc-black" | "hc-light";
  /** 字号缩放（1.0 = 默认 14px） */
  fontScale?: number;
  /** 外部 className */
  className?: string;
  /** 文件内容变更回调（实时） */
  onContentChange?: (filePath: string, content: string) => void;
  /** 保存回调（Cmd/Ctrl+S 或按钮触发） */
  onSave?: (filePath: string, content: string) => void | Promise<void>;
}

interface FileState {
  content: string;
  originalContent: string;
  loading: boolean;
  error: string | null;
  readOnly: boolean;
  isBinary: boolean;
}

const EMPTY_STATE: FileState = {
  content: "",
  originalContent: "",
  loading: false,
  error: null,
  readOnly: true,
  isBinary: false,
};

/**
 * 读取文件内容。优先使用 Tauri fs 插件（桌面端），
 * 回退到 projects.readFile RPC（WS 模式，如可用）。
 */
async function readFileContent(filePath: string): Promise<string> {
  if (typeof window !== "undefined" && window.nativeApi) {
    // 桌面端优先走 Tauri fs 插件
    try {
      return await tauriBridge.fs.readTextFile(filePath);
    } catch (error) {
      // 回退到 RPC（如有）
      const api = window.nativeApi as unknown as {
        projects?: { readFile?: (input: { path: string }) => Promise<{ content: string }> };
      };
      if (api.projects?.readFile) {
        const result = await api.projects.readFile({ path: filePath });
        return result.content;
      }
      throw error;
    }
  }
  throw new Error("File reading is only available in the desktop environment.");
}

async function writeFileContent(filePath: string, content: string): Promise<void> {
  await tauriBridge.fs.writeTextFile(filePath, content);
}

export function CodeEditor({
  filePath,
  workspaceRoot,
  initialReadOnly = false,
  theme = "vs-dark",
  fontScale = 1,
  className,
  onContentChange,
  onSave,
}: CodeEditorProps) {
  const messages = useMessages();
  const editorRef = useRef<MonacoEditor | null>(null);
  const monacoRef = useRef<MonacoNamespace | null>(null);
  const [fileState, setFileState] = useState<FileState>(EMPTY_STATE);
  const [readOnly, setReadOnly] = useState(initialReadOnly);

  const languageId = useMemo(
    () => (filePath ? detectLanguageId(filePath) : "plaintext"),
    [filePath],
  );

  // LSP 集成（仅当 workspaceRoot 提供时启用）
  const lsp = useCodeEditorLsp({
    workspaceRoot: workspaceRoot ?? "",
    filePath,
    editor: editorRef.current,
    monaco: monacoRef.current,
  });

  // Inline Completion（Ghost Text / Tab 补全，复用 LSP completion 结果）
  useCodeEditorInlineCompletion({
    workspaceRoot: workspaceRoot ?? "",
    filePath,
    editor: editorRef.current,
    monaco: monacoRef.current,
  });

  // 文件切换时加载内容
  useEffect(() => {
    if (!filePath) {
      setFileState(EMPTY_STATE);
      return;
    }

    if (isBinaryFile(filePath)) {
      setFileState({
        ...EMPTY_STATE,
        isBinary: true,
        readOnly: true,
      });
      return;
    }

    let cancelled = false;
    setFileState((prev) => ({
      ...EMPTY_STATE,
      loading: true,
      readOnly: prev.readOnly,
    }));

    readFileContent(filePath)
      .then((content) => {
        if (cancelled) return;
        setFileState({
          content,
          originalContent: content,
          loading: false,
          error: null,
          readOnly: initialReadOnly,
          isBinary: false,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : String(error);
        setFileState({
          ...EMPTY_STATE,
          loading: false,
          error: message,
          readOnly: true,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [filePath, initialReadOnly]);

  const isDirty = fileState.content !== fileState.originalContent;

  const handleEditorMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    // 把 monaco namespace 缓存到 window，供 severityToMonaco 等工具函数访问
    if (typeof window !== "undefined") {
      (window as unknown as { __monacoNamespace?: MonacoNamespace }).__monacoNamespace = monaco;
    }

    // Cmd/Ctrl+S 保存
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      const current = editor.getValue();
      const path = filePath;
      if (path && onSave) {
        void onSave(path, current);
      }
    });
  }, [filePath, onSave]);

  const handleBeforeMount: BeforeMount = useCallback((monaco) => {
    // 注册主题以适配高对比度模式
    monaco.editor.defineTheme("ydsz-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [],
      colors: {
        "editor.background": "#0d1117",
        "editorGutter.background": "#0d1117",
      },
    });
    monaco.editor.defineTheme("ydsz-light", {
      base: "vs",
      inherit: true,
      rules: [],
      colors: {
        "editor.background": "#ffffff",
      },
    });
  }, []);

  const handleChange = useCallback(
    (value: string | undefined) => {
      const next = value ?? "";
      setFileState((prev) => ({ ...prev, content: next }));
      if (filePath && onContentChange) {
        onContentChange(filePath, next);
      }
    },
    [filePath, onContentChange],
  );

  const handleSave = useCallback(async () => {
    if (!filePath || !isDirty) return;
    try {
      await writeFileContent(filePath, fileState.content);
      setFileState((prev) => ({ ...prev, originalContent: prev.content }));
      // 通知 LSP 服务器保存
      if (workspaceRoot) {
        try {
          await lspDidSave(filePath, fileState.content);
        } catch {
          // 静默
        }
      }
      if (onSave) {
        await onSave(filePath, fileState.content);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setFileState((prev) => ({ ...prev, error: message }));
    }
  }, [filePath, fileState.content, isDirty, onSave, workspaceRoot]);

  // 无文件选中
  if (!filePath) {
    return (
      <div
        className={cn(
          "flex h-full items-center justify-center text-sm text-muted-foreground",
          className,
        )}
        data-testid="code-editor-empty"
      >
        {messages.codeEditor.noFileOpen}
      </div>
    );
  }

  // 加载中
  if (fileState.loading) {
    return (
      <div
        className={cn(
          "flex h-full items-center justify-center text-sm text-muted-foreground",
          className,
        )}
        data-testid="code-editor-loading"
      >
        {messages.codeEditor.loading}
      </div>
    );
  }

  // 错误
  if (fileState.error) {
    return (
      <div
        className={cn("flex h-full flex-col items-center justify-center gap-2 p-4", className)}
        data-testid="code-editor-error"
      >
        <p className="text-sm font-medium text-destructive">{messages.codeEditor.loadError}</p>
        <p className="max-w-md text-center text-xs text-muted-foreground">{fileState.error}</p>
      </div>
    );
  }

  // 二进制文件
  if (fileState.isBinary) {
    return (
      <div
        className={cn(
          "flex h-full flex-col items-center justify-center gap-2 p-4",
          className,
        )}
        data-testid="code-editor-binary"
      >
        <p className="text-sm text-muted-foreground">{messages.codeEditor.binaryFile}</p>
        <p className="text-xs text-muted-foreground/70">{filePath}</p>
      </div>
    );
  }

  const effectiveTheme = theme === "vs" ? "ydsz-light" : theme === "vs-dark" ? "ydsz-dark" : theme;

  // LSP 状态徽章
  const lspBadge = workspaceRoot
    ? lsp.status === "ready"
      ? `LSP ✓ ${lsp.diagnosticsCount}⚠`
      : lsp.status === "starting"
        ? "LSP …"
        : lsp.status === "failed"
          ? "LSP ✗"
          : null
    : null;

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)} data-testid="code-editor">
      {/* 编辑器工具栏 */}
      <div className="flex items-center gap-2 border-b border-border/60 bg-background/80 px-3 py-1.5">
        <span className="truncate text-xs text-muted-foreground" title={filePath}>
          {filePath.split(/[\\/]/).pop()}
          {isDirty && <span className="ml-1 text-amber-500">●</span>}
        </span>
        {lspBadge && (
          <span
            className="text-[10px] text-muted-foreground/60"
            data-testid="code-editor-lsp-status"
            title={lsp.error ?? undefined}
          >
            {lspBadge}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setReadOnly((v) => !v)}
            className="rounded px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
            title={readOnly ? messages.codeEditor.enableEdit : messages.codeEditor.readOnly}
          >
            {readOnly ? messages.codeEditor.enableEdit : messages.codeEditor.readOnly}
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!isDirty || readOnly}
            className={cn(
              "rounded px-2 py-0.5 text-[11px] transition-colors",
              isDirty && !readOnly
                ? "bg-primary/10 text-primary hover:bg-primary/20"
                : "cursor-not-allowed text-muted-foreground/50",
            )}
          >
            {messages.codeEditor.save}
          </button>
        </div>
      </div>

      {/* Monaco 编辑器 */}
      <div className="min-h-0 flex-1">
        <Editor
          height="100%"
          path={filePath}
          language={languageId}
          value={fileState.content}
          theme={effectiveTheme}
          beforeMount={handleBeforeMount}
          onMount={handleEditorMount}
          onChange={handleChange}
          loading={messages.codeEditor.loading}
          options={{
            readOnly: readOnly || fileState.readOnly,
            fontSize: Math.round(14 * fontScale),
            lineNumbers: "on",
            minimap: { enabled: true, scale: 1 },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            wordWrap: "on",
            renderWhitespace: "selection",
            bracketPairColorization: { enabled: true },
            guides: { bracketPairs: "active", indentation: true },
            stickyScroll: { enabled: true },
            smoothScrolling: true,
            cursorBlinking: "smooth",
            cursorSmoothCaretAnimation: "on",
            fontFamily:
              "'JetBrains Mono Variable', 'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, Monaco, 'Courier New', monospace",
            fontLigatures: true,
            padding: { top: 8, bottom: 8 },
            inlineSuggest: { enabled: true },
          }}
        />
      </div>
    </div>
  );
}
