/**
 * @file 代码编辑器面板
 * @description 包含文件树侧栏 + 多 tab + Monaco 编辑器的完整面板。
 *              集成到 WorkspaceView，让用户可以在 Code 模式下直接浏览和编辑文件。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { GoFile, GoFileDirectory, GoChevronDown, GoChevronRight, GoX, GoFold, GoBug } from "react-icons/go";

import { CodeEditor } from "./CodeEditor";
import { DebugPanel } from "../DebugPanel";
import { readNativeApi } from "~/nativeApi";
import { useMessages } from "~/i18n/I18nContext";
import { cn } from "~/lib/utils";
import type { ProjectFileSystemEntry } from "~/contracts/project";

interface CodeEditorPanelProps {
  /** 工作区根目录（cwd） */
  cwd: string;
  /** 外部 className */
  className?: string;
}

/**
 * 把路径相对于 cwd 显示为简短形式。
 */
function relativePath(cwd: string, fullPath: string): string {
  if (fullPath.startsWith(cwd)) {
    const rel = fullPath.slice(cwd.length).replace(/^[\\/]+/, "");
    return rel || fullPath;
  }
  return fullPath;
}

export function CodeEditorPanel({ cwd, className }: CodeEditorPanelProps) {
  const messages = useMessages();
  const [treeByParent, setTreeByParent] = useState<Readonly<Record<string, ProjectFileSystemEntry[]>>>({});
  const [expandedDirs, setExpandedDirs] = useState<ReadonlySet<string>>(() => new Set([""]));
  const [loadingDirs, setLoadingDirs] = useState<ReadonlySet<string>>(() => new Set());
  const [openFiles, setOpenFiles] = useState<string[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [showDebugPanel, setShowDebugPanel] = useState(false);

  const rootEntries = useMemo(() => treeByParent[""] ?? [], [treeByParent]);

  const loadDirectory = useCallback(
    async (relativePath: string) => {
      const api = readNativeApi();
      if (!api || !cwd) return;
      if (treeByParent[relativePath]) return;

      setLoadingDirs((cur) => new Set(cur).add(relativePath));
      setTreeError(null);
      try {
        const result = await api.projects.listDirectories({
          cwd,
          includeFiles: true,
          ...(relativePath ? { relativePath } : {}),
        });
        // 排序：目录在前，文件在后，各自按名称排序
        const sorted = [...result.entries].sort((a, b) => {
          if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
        setTreeByParent((cur) => ({ ...cur, [relativePath]: sorted }));
      } catch (error) {
        setTreeError(error instanceof Error ? error.message : String(error));
      } finally {
        setLoadingDirs((cur) => {
          const next = new Set(cur);
          next.delete(relativePath);
          return next;
        });
      }
    },
    [cwd, treeByParent],
  );

  // 初始加载根目录
  useEffect(() => {
    if (rootEntries.length === 0 && !loadingDirs.has("")) {
      void loadDirectory("");
    }
  }, [loadDirectory, loadingDirs, rootEntries.length]);

  const toggleDir = useCallback(
    (entry: ProjectFileSystemEntry) => {
      setExpandedDirs((cur) => {
        const next = new Set(cur);
        if (next.has(entry.path)) {
          next.delete(entry.path);
        } else {
          next.add(entry.path);
        }
        return next;
      });
      if (entry.kind === "directory" && entry.hasChildren && !treeByParent[entry.path]) {
        void loadDirectory(entry.path);
      }
    },
    [loadDirectory, treeByParent],
  );

  const openFile = useCallback((filePath: string) => {
    setOpenFiles((cur) => (cur.includes(filePath) ? cur : [...cur, filePath]));
    setActiveFile(filePath);
  }, []);

  const closeFile = useCallback(
    (filePath: string) => {
      setOpenFiles((cur) => {
        const next = cur.filter((f) => f !== filePath);
        if (activeFile === filePath) {
          setActiveFile(next[next.length - 1] ?? null);
        }
        return next;
      });
    },
    [activeFile],
  );

  const renderTree = useCallback(
    (entries: readonly ProjectFileSystemEntry[], depth: number): React.ReactNode[] => {
      return entries.flatMap((entry) => {
        const expanded = expandedDirs.has(entry.path);
        const children = treeByParent[entry.path] ?? [];
        const isLoading = loadingDirs.has(entry.path);
        const isDir = entry.kind === "directory";

        const node = (
          <div
            key={entry.path}
            role="treeitem"
            aria-expanded={isDir ? expanded : undefined}
            className="flex min-w-0 items-center gap-1 rounded px-1 py-0.5 text-[13px] transition-colors hover:bg-muted/50"
            style={{ paddingLeft: `${4 + depth * 14}px` }}
          >
            <button
              type="button"
              className="inline-flex size-4 shrink-0 items-center justify-center text-muted-foreground/60"
              onClick={() => isDir && toggleDir(entry)}
              tabIndex={-1}
            >
              {isDir && entry.hasChildren ? (
                expanded ? (
                  <GoChevronDown className="size-3.5" />
                ) : (
                  <GoChevronRight className="size-3.5" />
                )
              ) : null}
            </button>
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
              onClick={() => (isDir ? toggleDir(entry) : openFile(entry.path))}
              title={entry.path}
            >
              {isDir ? (
                <GoFileDirectory className="size-3.5 shrink-0 text-sky-500/80" />
              ) : (
                <GoFile className="size-3.5 shrink-0 text-muted-foreground/70" />
              )}
              <span className="truncate">{entry.name}</span>
            </button>
          </div>
        );

        if (isDir && expanded && isLoading && children.length === 0) {
          return [
            node,
            <div
              key={`${entry.path}-loading`}
              className="px-2 py-0.5 text-[11px] text-muted-foreground/50"
              style={{ paddingLeft: `${8 + (depth + 1) * 14}px` }}
            >
              {messages.codeEditor.loading}
            </div>,
          ];
        }

        if (isDir && expanded && children.length > 0) {
          return [node, ...renderTree(children, depth + 1)];
        }

        return [node];
      });
    },
    [expandedDirs, loadingDirs, messages.codeEditor.loading, openFile, toggleDir, treeByParent],
  );

  const activeFileName = useMemo(
    () => (activeFile ? activeFile.split(/[\\/]/).pop() ?? activeFile : null),
    [activeFile],
  );

  return (
    <div
      className={cn("flex h-full min-h-0", className)}
      data-testid="code-editor-panel"
      data-cwd={cwd}
    >
      {/* 文件树侧栏 */}
      <aside
        className="flex w-56 shrink-0 flex-col border-r border-border/60 bg-background/60"
        data-testid="code-editor-file-tree"
      >
        <div className="flex items-center gap-1.5 border-b border-border/40 px-3 py-2">
          <GoFold className="size-3.5 text-muted-foreground/70" />
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
            {messages.codeEditor.files}
          </span>
          <button
            type="button"
            onClick={() => void loadDirectory("")}
            className="ml-auto rounded px-1 text-[11px] text-muted-foreground/60 hover:bg-muted hover:text-foreground"
            title={messages.codeEditor.refresh}
          >
            ↻
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto py-1">
          {treeError ? (
            <div className="px-3 py-2 text-[11px] text-destructive">{treeError}</div>
          ) : rootEntries.length === 0 && loadingDirs.has("") ? (
            <div className="px-3 py-2 text-[11px] text-muted-foreground/50">
              {messages.codeEditor.loading}
            </div>
          ) : (
            renderTree(rootEntries, 0)
          )}
        </div>
      </aside>

      {/* 编辑器主区域 */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Tab 栏 */}
        <div className="flex items-center gap-0.5 border-b border-border/60 bg-background/40 px-1">
          {openFiles.length === 0 ? (
            <span className="px-3 py-1.5 text-[11px] text-muted-foreground/50">
              {messages.codeEditor.noFileOpen}
            </span>
          ) : (
            openFiles.map((filePath) => {
              const name = filePath.split(/[\\/]/).pop() ?? filePath;
              const isActive = filePath === activeFile;
              return (
                <div
                  key={filePath}
                  className={cn(
                    "group flex items-center gap-1 rounded-t px-2 py-1.5 text-[12px] transition-colors",
                    isActive
                      ? "bg-background text-foreground"
                      : "text-muted-foreground/70 hover:bg-muted/30 hover:text-foreground",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setActiveFile(filePath)}
                    className="max-w-[180px] truncate"
                    title={relativePath(cwd, filePath)}
                  >
                    {name}
                  </button>
                  <button
                    type="button"
                    onClick={() => closeFile(filePath)}
                    className="inline-flex size-4 items-center justify-center rounded text-muted-foreground/50 opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
                    aria-label={messages.codeEditor.closeTab}
                  >
                    <GoX className="size-3" />
                  </button>
                </div>
              );
            })
          )}
          {/* 调试器切换按钮 */}
          <button
            type="button"
            onClick={() => setShowDebugPanel((v) => !v)}
            className={cn(
              "ml-auto inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-colors",
              showDebugPanel
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground/60 hover:bg-muted hover:text-foreground",
            )}
            title={showDebugPanel ? "隐藏调试器" : "显示调试器"}
            aria-label={showDebugPanel ? "隐藏调试器" : "显示调试器"}
            aria-pressed={showDebugPanel}
            data-testid="toggle-debug-panel"
          >
            <GoBug className="size-3.5" />
            <span>调试</span>
          </button>
        </div>

        {/* 编辑器 */}
        <div className="min-h-0 flex-1">
          <CodeEditor
            filePath={activeFile}
            workspaceRoot={cwd}
            onSave={(path) => {
              // 保存后可在此触发通知或事件
              void path;
            }}
          />
        </div>

        {/* 状态栏 */}
        <div className="flex items-center gap-3 border-t border-border/40 bg-background/40 px-3 py-1 text-[10px] text-muted-foreground/60">
          {activeFile ? (
            <>
              <span className="truncate" title={activeFile}>
                {relativePath(cwd, activeFile)}
              </span>
              <span className="ml-auto">{activeFileName}</span>
            </>
          ) : (
            <span>{messages.codeEditor.noFileOpen}</span>
          )}
        </div>
      </div>

      {/* 调试器侧栏 */}
      {showDebugPanel && (
        <aside
          className="flex w-72 shrink-0 flex-col border-l border-border/60 bg-background/60"
          data-testid="code-editor-debug-sidebar"
        >
          <DebugPanel
            workspaceRoot={cwd}
            activeFilePath={activeFile}
            className="h-full"
          />
        </aside>
      )}
    </div>
  );
}
