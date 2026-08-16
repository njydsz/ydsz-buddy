/**
 * @file 目录拖入确认 hook
 *
 * C-6 文件夹拖入支持:把"包含 Y 个文件,是否全部提及?"确认逻辑封装为一个
 * 状态机,方便上层应用(ChatView / Composer)直接接入。
 *
 * ## 状态机
 *
 * ```
 *   idle  ──(onDirectoriesDetected)──▶  confirming
 *   confirming  ──(expandAll)──▶  expanding  ──▶ idle + onResolved(files)
 *   confirming  ──(folderOnly)──▶ idle + onResolved(folderMentions)
 *   confirming  ──(cancel)──▶ idle
 * ```
 *
 * ## 使用模式
 *
 * ```tsx
 * function ChatView() {
 *   const directoryDrop = useDirectoryDropConfirmation({
 *     directoryReader: tauriBridge.fs.readDir,
 *     onResolved: (files, kind) => {
 *       if (kind === "expanded") {
 *         addComposerImages(files);
 *       } else {
 *         addComposerMentions(files.map(f => ({ name: f.name, path: f.name })));
 *       }
 *     },
 *   });
 *
 *   return (
 *     <>
 *       <Composer onFilesDrop={directoryDrop.handleInitialDrop} />
 *       <DirectoryConfirmDialog
 *         isOpen={directoryDrop.isOpen}
 *         directories={directoryDrop.summary}
 *         onExpandAll={directoryDrop.handleExpandAll}
 *         onMentionFolderOnly={directoryDrop.handleMentionFolderOnly}
 *         onCancel={directoryDrop.handleCancel}
 *       />
 *     </>
 *   );
 * }
 * ```
 */

import { useCallback, useState } from "react";

import {
  type DirectoryReader,
  type DirectorySummary,
  type FileInfo,
  expandDirectoryEntries,
  mergeExpandedDirectoryEntries,
} from "~/lib/fileUtils";

/**
 * 用户选择的结果种类
 */
export type DirectoryResolutionKind = "expanded" | "folder-only" | "cancelled";

export interface UseDirectoryDropConfirmationOptions {
  /**
   * 读目录实现(由调用方注入 tauriBridge.fs.readDir)
   */
  directoryReader: DirectoryReader;
  /**
   * 解析完成回调:无论用户选了什么,都会触发,让上层应用把结果投递到 composer
   */
  onResolved: (files: FileInfo[], kind: DirectoryResolutionKind) => void;
  /**
   * 默认展开深度
   */
  defaultDepth?: "top" | "recursive";
}

/**
 * 等待用户确认的状态
 */
interface PendingDirectories {
  /** 原始拖拽文件列表(含目录占位) */
  original: FileInfo[];
  /** 拖入的目录名(用于 UI 展示) */
  summary: DirectorySummary;
}

export interface UseDirectoryDropConfirmationResult {
  /** 对话框是否打开 */
  isOpen: boolean;
  /** 目录汇总信息 */
  summary: DirectorySummary;
  /** 拖拽事件处理器(给 Composer 的 onFilesDrop 回调) */
  handleInitialDrop: (files: FileInfo[]) => void;
  /** 用户点击"全部展开并提及" */
  handleExpandAll: (depth: "top" | "recursive") => void | Promise<void>;
  /** 用户点击"仅目录名" */
  handleMentionFolderOnly: () => void;
  /** 用户点击"取消" */
  handleCancel: () => void;
  /** 正在展开中(loading 态) */
  isExpanding: boolean;
}

const EMPTY_SUMMARY: DirectorySummary = { count: 0, names: [] };

/**
 * 目录拖入确认 hook
 */
export function useDirectoryDropConfirmation(
  options: UseDirectoryDropConfirmationOptions,
): UseDirectoryDropConfirmationResult {
  const { directoryReader, onResolved, defaultDepth = "top" } = options;
  const [pending, setPending] = useState<PendingDirectories | null>(null);
  const [isExpanding, setIsExpanding] = useState(false);

  const handleInitialDrop = useCallback((files: FileInfo[]) => {
    // 分离目录条目和普通文件
    const directories: FileInfo[] = [];
    const regularFiles: FileInfo[] = [];
    for (const file of files) {
      if (file.size === 0 && file.type === "") {
        directories.push(file);
      } else {
        regularFiles.push(file);
      }
    }

    if (directories.length === 0) {
      // 没有目录,直接投递
      onResolved(regularFiles, "expanded");
      return;
    }

    // 有目录,弹确认
    setPending({
      original: files,
      summary: {
        count: directories.length,
        names: directories.map((d) => d.name),
      },
    });
  }, [onResolved]);

  const handleExpandAll = useCallback(
    async (depth: "top" | "recursive") => {
      if (!pending) return;
      setIsExpanding(true);
      try {
        const maxDepth = depth === "recursive" ? 10 : 1;
        // 收集要展开的目录名(从原始列表中)
        const dirNames = pending.original
          .filter((f) => f.size === 0 && f.type === "")
          .map((f) => f.name);
        // 启发式:从原始 FileInfo 中,size=0+type='' 是目录占位
        // 但 DataTransfer DOM 拖拽只能拿到 name,拿不到 path
        // 真正的目录展开需要 path,因此这里的实现是有限制的:
        // - 如果有 Tauri 原生 onDragDropEvent 提供的 path,可在这里扩展
        // - 否则只能基于 name 模拟展开
        // 实际生产:在 Tauri 环境下应通过 onDragDropEvent 拿到 path
        const allExpanded: FileInfo[] = [];
        for (const dirName of dirNames) {
          // 尝试用 dirName 作为 path 调用 readDir
          // 失败时跳过(非阻塞)
          try {
            const result = await expandDirectoryEntries([dirName], directoryReader, {
              maxDepth,
            });
            for (const file of result.files) {
              allExpanded.push({
                ...file,
                name: `${dirName}/${file.name}`,
              });
            }
          } catch {
            // 跳过不可读的目录
          }
        }
        const merged = mergeExpandedDirectoryEntries(pending.original, allExpanded);
        setPending(null);
        onResolved(merged, "expanded");
      } finally {
        setIsExpanding(false);
      }
    },
    [pending, directoryReader, onResolved],
  );

  const handleMentionFolderOnly = useCallback(() => {
    if (!pending) return;
    // 把目录名作为 mentions 返回
    const folderMentions = pending.original.filter(
      (f) => f.size === 0 && f.type === "",
    );
    setPending(null);
    onResolved(folderMentions, "folder-only");
    // 抑制 defaultDepth 未使用的告警
    void defaultDepth;
  }, [pending, onResolved, defaultDepth]);

  const handleCancel = useCallback(() => {
    setPending(null);
    onResolved([], "cancelled");
  }, [onResolved]);

  return {
    isOpen: pending !== null,
    summary: pending?.summary ?? EMPTY_SUMMARY,
    handleInitialDrop,
    handleExpandAll,
    handleMentionFolderOnly,
    handleCancel,
    isExpanding,
  };
}
