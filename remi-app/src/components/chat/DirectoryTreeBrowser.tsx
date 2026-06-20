/**
 * @file DirectoryTreeBrowser
 * @description 渲染一个懒加载、可递归展开的本地目录浏览器。
 *              支持按层级延迟加载目录内容，提供搜索过滤和文件/文件夹选择功能。
 */

import type { ProjectDirectoryEntry, ProjectFileSystemEntry } from "~/contracts";
import type { ReactNode } from "react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDownIcon, ChevronRightIcon, FileIcon, FolderIcon } from "~/lib/icons";
import { readNativeApi } from "~/nativeApi";
import { cn } from "~/lib/utils";

/** DirectoryTreeBrowser 组件的属性接口 */
interface DirectoryTreeBrowserProps {
  /** 目录树的根路径，为 null 时显示不可用提示 */
  rootPath: string | null;
  /** 无条目时的空状态提示文本 */
  emptyLabel?: string;
  /** 根路径不可用时的提示文本 */
  unavailableLabel?: string;
  /** 加载中的提示文本 */
  loadingLabel?: string;
  /** 自定义 CSS 类名 */
  className?: string;
  /** 是否在浏览中包含文件（默认仅显示文件夹） */
  includeFiles?: boolean;
  /** 搜索过滤关键词 */
  query?: string;
  /** 选中条目的回调，接收绝对路径和文件系统条目信息 */
  onSelectEntry: (absolutePath: string, entry: ProjectFileSystemEntry) => Promise<void> | void;
}

/** 按父路径分组的目录条目映射 */
type DirectoryEntriesByParent = Record<string, readonly ProjectFileSystemEntry[] | undefined>;

/**
 * 将根路径和相对路径拼接为完整路径，自动检测路径分隔符。
 *
 * @param rootPath - 根路径
 * @param relativePath - 相对路径
 * @returns 拼接后的完整路径
 */
function joinDirectoryPath(rootPath: string, relativePath: string): string {
  if (!relativePath) return rootPath;
  const separator = rootPath.includes("\\") ? "\\" : "/";
  const normalizedRoot = rootPath.endsWith(separator) ? rootPath.slice(0, -1) : rootPath;
  const normalizedRelative = relativePath.split(/[\\/]+/).join(separator);
  return `${normalizedRoot}${separator}${normalizedRelative}`;
}

/**
 * 目录树浏览器组件。
 * 提供懒加载、可递归展开的本地文件系统浏览功能，支持搜索过滤。
 *
 * @param props.rootPath - 目录树的根路径
 * @param props.emptyLabel - 空状态提示
 * @param props.unavailableLabel - 不可用提示
 * @param props.loadingLabel - 加载中提示
 * @param props.className - 自定义类名
 * @param props.includeFiles - 是否包含文件
 * @param props.query - 搜索关键词
 * @param props.onSelectEntry - 选中条目的回调
 */
export const DirectoryTreeBrowser = memo(function DirectoryTreeBrowser({
  rootPath,
  emptyLabel = "No folders found",
  unavailableLabel = "Home directory unavailable.",
  loadingLabel = "Loading folders\u2026",
  className,
  includeFiles = false,
  query = "",
  onSelectEntry,
}: DirectoryTreeBrowserProps) {
  const [entriesByParent, setEntriesByParent] = useState<DirectoryEntriesByParent>({});
  const [expandedPaths, setExpandedPaths] = useState<ReadonlySet<string>>(() => new Set());
  const [loadingPaths, setLoadingPaths] = useState<ReadonlySet<string>>(() => new Set());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const rootEntries = useMemo(() => entriesByParent[""] ?? [], [entriesByParent]);

  // Lazily loads one directory level at a time so deep local browsing stays responsive.
  const loadDirectory = useCallback(
    async (relativePath = "") => {
      const api = readNativeApi();
      if (!api || !rootPath) {
        return;
      }
      if (entriesByParent[relativePath]) {
        return;
      }

      setLoadingPaths((current) => new Set(current).add(relativePath));
      setErrorMessage(null);
      try {
        const result = await api.projects.listDirectories({
          cwd: rootPath,
          ...(includeFiles ? { includeFiles: true } : {}),
          ...(relativePath ? { relativePath } : {}),
        });
        setEntriesByParent((current) => ({
          ...current,
          [relativePath]: result.entries,
        }));
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Unable to load folders.");
      } finally {
        setLoadingPaths((current) => {
          const next = new Set(current);
          next.delete(relativePath);
          return next;
        });
      }
    },
    [entriesByParent, includeFiles, rootPath],
  );

  const handleEnsureRootLoaded = useCallback(() => {
    if (rootEntries.length === 0 && !loadingPaths.has("")) {
      void loadDirectory();
    }
  }, [loadDirectory, loadingPaths, rootEntries.length]);

  useEffect(() => {
    handleEnsureRootLoaded();
  }, [handleEnsureRootLoaded]);

  const toggleDirectory = useCallback(
    (entry: ProjectDirectoryEntry) => {
      setExpandedPaths((current) => {
        const next = new Set(current);
        if (next.has(entry.path)) {
          next.delete(entry.path);
          return next;
        }
        next.add(entry.path);
        return next;
      });
      if (entry.hasChildren && !entriesByParent[entry.path]) {
        void loadDirectory(entry.path);
      }
    },
    [entriesByParent, loadDirectory],
  );

  const renderedTree = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const renderEntries = (
      entries: readonly ProjectFileSystemEntry[],
      depth: number,
    ): ReactNode[] =>
      entries.flatMap((entry) => {
        const expanded = expandedPaths.has(entry.path);
        const children = entriesByParent[entry.path] ?? [];
        const isLoadingChildren = loadingPaths.has(entry.path);
        const isDirectory = entry.kind === "directory";
        const matchesSelf =
          normalizedQuery.length === 0 ||
          entry.name.toLowerCase().includes(normalizedQuery) ||
          entry.path.toLowerCase().includes(normalizedQuery);
        const renderedChildren =
          isDirectory && expanded && children.length > 0 ? renderEntries(children, depth + 1) : [];

        if (!matchesSelf && renderedChildren.length === 0) {
          return [];
        }

        return [
          <div
            key={entry.path}
            className="flex min-w-0 items-center gap-1 rounded-lg px-2 py-1 text-sm transition-colors hover:bg-(--color-background-button-secondary-hover)"
            style={{ paddingLeft: `${8 + depth * 16}px` }}
          >
            <button
              type="button"
              aria-label={expanded ? `Collapse ${entry.name}` : `Expand ${entry.name}`}
              className={cn(
                "inline-flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-(--color-background-button-secondary) hover:text-foreground",
                (!isDirectory || !entry.hasChildren) && "opacity-35",
              )}
              onClick={() => {
                if (isDirectory && entry.hasChildren) {
                  toggleDirectory(entry as ProjectDirectoryEntry);
                }
              }}
            >
              {isDirectory && entry.hasChildren ? (
                expanded ? (
                  <ChevronDownIcon className="size-3.5" />
                ) : (
                  <ChevronRightIcon className="size-3.5" />
                )
              ) : null}
            </button>
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-2 rounded-md py-1 text-left"
              onClick={() => {
                if (!rootPath) return;
                void onSelectEntry(joinDirectoryPath(rootPath, entry.path), entry);
              }}
            >
              {isDirectory ? (
                <FolderIcon className="size-4 shrink-0 text-muted-foreground/70" />
              ) : (
                <FileIcon className="size-4 shrink-0 text-muted-foreground/60" />
              )}
              <span className="truncate text-foreground/95">{entry.name}</span>
            </button>
            {isDirectory && isLoadingChildren ? (
              <span className="shrink-0 text-[11px] text-muted-foreground/45">Loading\u2026</span>
            ) : null}
          </div>,
          ...renderedChildren,
        ];
      });

    return renderEntries(rootEntries, 0);
  }, [
    entriesByParent,
    expandedPaths,
    loadingPaths,
    onSelectEntry,
    query,
    rootEntries,
    rootPath,
    toggleDirectory,
  ]);

  return (
    <div className={className} onMouseEnter={handleEnsureRootLoaded}>
      {!rootPath ? (
        <div className="px-2 py-8 text-center text-sm text-muted-foreground/60">
          {unavailableLabel}
        </div>
      ) : loadingPaths.has("") && rootEntries.length === 0 ? (
        <div className="px-2 py-8 text-center text-sm text-muted-foreground/60">{loadingLabel}</div>
      ) : renderedTree.length > 0 ? (
        renderedTree
      ) : (
        <div className="px-2 py-8 text-center text-sm text-muted-foreground/60">{emptyLabel}</div>
      )}
      {errorMessage ? <div className="px-2 pt-2 text-xs text-red-400">{errorMessage}</div> : null}
    </div>
  );
});
