/**
 * @file ProjectPicker
 * @description 新聊天编辑器下方的项目文件夹选择器，将活跃文件夹和主目录文件夹分组展示，
 *              始终在共享的 Chats 容器中创建聊天行。
 */

import { memo, useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { type ProjectDirectoryEntry } from "~/contracts";
import { readNativeApi } from "../../nativeApi";
import { useStore } from "../../store";
import { createSidebarDisplayThreadsSelector } from "../../storeSelectors";
import { PlusIcon, XIcon } from "~/lib/icons";
import { cn } from "~/lib/utils";
import { FolderClosed } from "../FolderClosed";
import { PickerTriggerButton } from "./PickerTriggerButton";
import { PickerPanelShell } from "./PickerPanelShell";
import {
  Combobox,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxGroupLabel,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
  ComboboxSeparator,
  ComboboxTrigger,
} from "../ui/combobox";
import { useWorkspaceStore } from "../../workspaceStore";

/** ProjectPicker 组件的属性接口 */
interface ProjectPickerProps {
  /** 弹出面板的对齐方式 */
  align?: "start" | "center" | "end";
  /** 弹出面板的放置方向 */
  side?: "top" | "bottom";
  /** 是否显示"重置为主目录"按钮 */
  showResetToHome?: boolean;
  /** 当前选中的工作区根路径 */
  selectedWorkspaceRoot?: string | null;
  /** 选择工作区根路径的回调 */
  onSelectWorkspaceRoot?: ((workspaceRoot: string) => void) | undefined;
  /** 重置为主目录的回调 */
  onResetToHome?: (() => void) | undefined;
}

/** 活跃文件夹选项，包含路径和显示标签 */
interface ActiveFolderOption {
  /** 文件夹的绝对路径 */
  cwd: string;
  /** 主显示标签（项目名称或文件夹名） */
  primaryLabel: string;
  /** 副显示标签（文件夹名，当与主标签不同时显示） */
  secondaryLabel: string | null;
}

/**
 * 提取路径的最后一部分作为文件名。
 *
 * @param value - 文件路径
 * @returns 路径的基准名称，若路径为空则返回 null
 */
function basenameOfPath(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.replace(/[\\/]+$/, "");
  const separatorIndex = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
  const basename = separatorIndex === -1 ? normalized : normalized.slice(separatorIndex + 1);
  return basename.length > 0 ? basename : null;
}

/**
 * 构建目录条目的搜索用文本，将名称和路径拼接为小写字符串。
 *
 * @param entry - 项目目录条目
 * @returns 用于搜索匹配的小写字符串
 */
function directorySearchHaystack(entry: ProjectDirectoryEntry): string {
  return [entry.name, entry.path].join(" ").toLowerCase();
}

/**
 * 将根路径和相对路径拼接为完整的目录路径，自动检测路径分隔符。
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
 * 项目文件夹选择器组件。
 * 以组合框形式展示活跃文件夹和主目录下的文件夹，支持搜索过滤和添加新项目。
 *
 * @param props.align - 弹出面板的对齐方式
 * @param props.side - 弹出面板的放置方向
 * @param props.showResetToHome - 是否显示重置为主目录按钮
 * @param props.selectedWorkspaceRoot - 当前选中的工作区根路径
 * @param props.onSelectWorkspaceRoot - 选择工作区根路径的回调
 * @param props.onResetToHome - 重置为主目录的回调
 */
export const ProjectPicker = memo(function ProjectPicker({
  align = "start",
  side = "bottom",
  showResetToHome = false,
  selectedWorkspaceRoot = null,
  onSelectWorkspaceRoot,
  onResetToHome,
}: ProjectPickerProps) {
  const projects = useStore((state) => state.projects);
  const sidebarThreads = useStore(useMemo(() => createSidebarDisplayThreadsSelector(), []));
  const homeDir = useWorkspaceStore((state) => state.homeDir);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [isPicking, setIsPicking] = useState(false);
  const [isLoadingDirectories, setIsLoadingDirectories] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [directoryEntries, setDirectoryEntries] = useState<readonly ProjectDirectoryEntry[]>([]);

  const activeFolderOptions = useMemo(() => {
    const seen = new Set<string>();
    const nextOptions: ActiveFolderOption[] = [];

    for (const project of projects.filter((project) => project.kind === "project")) {
      const folderName = basenameOfPath(project.cwd) ?? project.folderName ?? project.name;
      if (!folderName || folderName.startsWith(".") || seen.has(project.cwd)) {
        continue;
      }
      seen.add(project.cwd);
      const primaryLabel = project.localName?.trim() || folderName;
      const secondaryLabel =
        project.localName?.trim() && project.localName.trim() !== folderName ? folderName : null;
      nextOptions.push({ cwd: project.cwd, primaryLabel, secondaryLabel });
    }

    for (const thread of sidebarThreads) {
      const workspaceRoot = thread.worktreePath ?? null;
      const folderName = basenameOfPath(workspaceRoot);
      if (!workspaceRoot || !folderName || folderName.startsWith(".") || seen.has(workspaceRoot)) {
        continue;
      }
      seen.add(workspaceRoot);
      nextOptions.push({
        cwd: workspaceRoot,
        primaryLabel: folderName,
        secondaryLabel: null,
      });
    }

    const selectedFolderName = basenameOfPath(selectedWorkspaceRoot);
    if (
      selectedWorkspaceRoot &&
      selectedFolderName &&
      !selectedFolderName.startsWith(".") &&
      !seen.has(selectedWorkspaceRoot)
    ) {
      nextOptions.unshift({
        cwd: selectedWorkspaceRoot,
        primaryLabel: selectedFolderName,
        secondaryLabel: null,
      });
    }

    return nextOptions;
  }, [projects, selectedWorkspaceRoot, sidebarThreads]);
  const activeFolderPathSet = useMemo(
    () => new Set(activeFolderOptions.map((entry) => entry.cwd)),
    [activeFolderOptions],
  );
  const macFolderOptions = useMemo(
    () =>
      directoryEntries
        .filter((entry) => !entry.name.startsWith("."))
        .map((entry) => ({
          absolutePath: homeDir ? joinDirectoryPath(homeDir, entry.path) : entry.path,
          entry,
        }))
        .filter((entry) => !activeFolderPathSet.has(entry.absolutePath)),
    [activeFolderPathSet, directoryEntries, homeDir],
  );

  const normalizedQuery = deferredQuery.trim().toLowerCase();
  const filteredActiveFolderOptions = useMemo(() => {
    if (normalizedQuery.length === 0) return activeFolderOptions;
    return activeFolderOptions.filter((entry) =>
      [entry.primaryLabel, entry.secondaryLabel, entry.cwd]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [activeFolderOptions, normalizedQuery]);
  const filteredMacFolderOptions = useMemo(() => {
    if (normalizedQuery.length === 0) return macFolderOptions;
    return macFolderOptions.filter(({ entry }) =>
      directorySearchHaystack(entry).includes(normalizedQuery),
    );
  }, [macFolderOptions, normalizedQuery]);

  const selectableDirectoryPaths = useMemo(
    () => [
      ...activeFolderOptions.map((entry) => entry.cwd),
      ...macFolderOptions.map((entry) => entry.absolutePath),
    ],
    [activeFolderOptions, macFolderOptions],
  );
  const filteredDirectoryPaths = useMemo(
    () => [
      ...filteredActiveFolderOptions.map((entry) => entry.cwd),
      ...filteredMacFolderOptions.map((entry) => entry.absolutePath),
    ],
    [filteredActiveFolderOptions, filteredMacFolderOptions],
  );
  const selectedFolderOption = useMemo(() => {
    if (!selectedWorkspaceRoot) return null;
    return (
      activeFolderOptions.find((entry) => entry.cwd === selectedWorkspaceRoot) ??
      macFolderOptions
        .filter(({ absolutePath }) => absolutePath === selectedWorkspaceRoot)
        .map(({ entry, absolutePath }) => ({
          cwd: absolutePath,
          primaryLabel: entry.name,
          secondaryLabel: null,
        }))[0] ??
      null
    );
  }, [activeFolderOptions, macFolderOptions, selectedWorkspaceRoot]);
  const triggerLabel = selectedFolderOption ? (
    <span className="flex min-w-0 items-baseline gap-1.5">
      <span className="min-w-0 truncate">{selectedFolderOption.primaryLabel}</span>
      {selectedFolderOption.secondaryLabel ? (
        <span className="min-w-0 truncate text-muted-foreground/60 text-xs">
          {selectedFolderOption.secondaryLabel}
        </span>
      ) : null}
    </span>
  ) : (
    "Work in a project"
  );

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setQuery("");
      setErrorMessage(null);
    }
  }, []);

  useEffect(() => {
    if (!open || !homeDir || directoryEntries.length > 0 || isLoadingDirectories) {
      return;
    }
    const api = readNativeApi();
    if (!api) {
      setErrorMessage("App is still connecting. Try again in a moment.");
      return;
    }

    setIsLoadingDirectories(true);
    setErrorMessage(null);
    void api.projects
      .listDirectories({ cwd: homeDir })
      .then((result) => {
        setDirectoryEntries(
          result.entries.flatMap((entry) =>
            entry.kind === "directory"
              ? [
                  {
                    path: entry.path,
                    name: entry.name,
                    hasChildren: entry.hasChildren ?? false,
                    ...(entry.parentPath ? { parentPath: entry.parentPath } : {}),
                  } satisfies ProjectDirectoryEntry,
                ]
              : [],
          ),
        );
      })
      .catch((error) => {
        setErrorMessage(error instanceof Error ? error.message : "Unable to load folders.");
      })
      .finally(() => {
        setIsLoadingDirectories(false);
      });
  }, [directoryEntries.length, homeDir, isLoadingDirectories, open]);

  const handleAddNewProject = useCallback(async () => {
    if (isPicking) return;
    const api = readNativeApi();
    if (!api) {
      setErrorMessage("App is still connecting. Try again in a moment.");
      return;
    }

    setIsPicking(true);
    setErrorMessage(null);
    try {
      const pickedPath = await api.dialogs.pickFolder();
      setIsPicking(false);
      if (!pickedPath) {
        return;
      }
      onSelectWorkspaceRoot?.(pickedPath);
      setOpen(false);
    } catch (error) {
      setIsPicking(false);
      setErrorMessage(error instanceof Error ? error.message : "Unable to open the folder picker.");
    }
  }, [isPicking, onSelectWorkspaceRoot]);

  return (
    <Combobox
      items={selectableDirectoryPaths}
      filteredItems={filteredDirectoryPaths}
      autoHighlight
      onOpenChange={handleOpenChange}
      open={open}
    >
      <ComboboxTrigger
        render={
          <PickerTriggerButton icon={<FolderClosed className="size-3.5" />} label={triggerLabel} />
        }
      />
      <ComboboxPopup align={align} side={side} className="p-0">
        <PickerPanelShell
          searchPlaceholder="Search projects"
          query={query}
          onQueryChange={setQuery}
          footer={
            <>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm transition-colors hover:bg-(--color-background-elevated-secondary) hover:text-(--color-text-foreground) disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => void handleAddNewProject()}
                disabled={isPicking}
              >
                <PlusIcon className="size-3.5 shrink-0 text-muted-foreground/70" />
                <span className="truncate">
                  {isPicking ? "Opening folder picker\u2026" : "Add new project"}
                </span>
              </button>
              {showResetToHome ? (
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm transition-colors hover:bg-(--color-background-elevated-secondary) hover:text-(--color-text-foreground)"
                  onClick={() => {
                    onResetToHome?.();
                    setOpen(false);
                  }}
                >
                  <XIcon className="size-3.5 shrink-0 text-muted-foreground/70" />
                  <span className="truncate">Don&apos;t work in a project</span>
                </button>
              ) : null}
              {errorMessage ? (
                <div className="px-2 pb-1 text-destructive text-xs">{errorMessage}</div>
              ) : null}
            </>
          }
        >
          <ComboboxEmpty>
            {isLoadingDirectories
              ? "Loading folders�?
              : activeFolderOptions.length === 0 && macFolderOptions.length === 0
                ? "No folders found"
                : "No matches"}
          </ComboboxEmpty>
          <ComboboxList className="max-h-64">
            {filteredActiveFolderOptions.length > 0 ? (
              <ComboboxGroup>
                <ComboboxGroupLabel>Active folders</ComboboxGroupLabel>
                {filteredActiveFolderOptions.map((folder, index) => (
                  <ComboboxItem
                    hideIndicator={folder.cwd !== selectedWorkspaceRoot}
                    key={folder.cwd}
                    index={index}
                    value={folder.cwd}
                    onClick={() => {
                      onSelectWorkspaceRoot?.(folder.cwd);
                      setOpen(false);
                    }}
                    className={cn(
                      folder.cwd === selectedWorkspaceRoot &&
                        "bg-(--color-background-elevated-secondary) text-(--color-text-foreground)",
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <FolderClosed className="size-3.5 shrink-0 text-muted-foreground/70" />
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-baseline gap-1.5">
                          <span className="min-w-0 truncate">{folder.primaryLabel}</span>
                          {folder.secondaryLabel ? (
                            <span className="min-w-0 truncate text-muted-foreground/60 text-xs">
                              {folder.secondaryLabel}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </ComboboxItem>
                ))}
              </ComboboxGroup>
            ) : null}
            {filteredActiveFolderOptions.length > 0 && filteredMacFolderOptions.length > 0 ? (
              <ComboboxSeparator />
            ) : null}
            {filteredMacFolderOptions.length > 0 ? (
              <ComboboxGroup>
                <ComboboxGroupLabel>Folders on this Mac</ComboboxGroupLabel>
                {filteredMacFolderOptions.map(({ absolutePath, entry }, index) => (
                  <ComboboxItem
                    hideIndicator={absolutePath !== selectedWorkspaceRoot}
                    key={absolutePath}
                    index={filteredActiveFolderOptions.length + index}
                    value={absolutePath}
                    onClick={() => {
                      onSelectWorkspaceRoot?.(absolutePath);
                      setOpen(false);
                    }}
                    className={cn(
                      absolutePath === selectedWorkspaceRoot &&
                        "bg-(--color-background-elevated-secondary) text-(--color-text-foreground)",
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <FolderClosed className="size-3.5 shrink-0 text-muted-foreground/70" />
                      <span className="truncate">{entry.name}</span>
                    </div>
                  </ComboboxItem>
                ))}
              </ComboboxGroup>
            ) : null}
          </ComboboxList>
        </PickerPanelShell>
      </ComboboxPopup>
    </Combobox>
  );
});
