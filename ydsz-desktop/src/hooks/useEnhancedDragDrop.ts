/**
 * @file 增强拖拽逻辑 Hook
 *
 * 本模块提供增强的拖拽处理能力：
 *
 * - **文件信息提取**：从拖拽事件中提取文件详细信息
 * - **URL 检测**：检测拖拽或粘贴的文本中的 URL
 * - **拖拽状态管理**：管理拖拽悬停状态
 * - **多文件支持**：支持多文件拖拽
 * - **文件类型验证**：检测不支持的文件类型
 *
 * ## 核心导出
 *
 * - `useEnhancedDragDrop(options)`: 增强拖拽 Hook
 *
 * ## 使用场景
 *
 * - Composer 输入框的文件拖拽
 * - 拖拽文件显示预览信息
 * - 拖拽 URL 显示预览卡片
 *
 * ## 注意事项
 *
 * - 需要配合 DragDropOverlay 组件使用
 * - 文件信息在 dragenter 时提取，drop 时处理
 * - URL 检测支持从文本和拖拽数据中提取
 */

import { useCallback, useRef, useState, type DragEvent, type ClipboardEvent } from "react";
import {
  type FileInfo,
  type DirectorySummary,
  expandDirectoryEntries,
  extractFilesFromDataTransfer,
  extractUrls,
  hasUnsupportedFiles,
  getUnsupportedFiles,
  calculateTotalFileSize,
  containsUrl,
  mergeExpandedDirectoryEntries,
  summarizeDirectoryEntries,
  type DirectoryReader,
} from "~/lib/fileUtils";

/**
 * 拖拽类型
 */
export type DragType = "files" | "url" | "text" | null;

/**
 * 拖拽状态
 */
export interface DragState {
  /** 是否正在拖拽悬停 */
  isDragging: boolean;
  /** 拖拽类型 */
  dragType: DragType;
  /** 文件信息列表 */
  files: FileInfo[];
  /** URL 列表 */
  urls: string[];
  /** 是否有不支持的文件 */
  hasUnsupported: boolean;
  /** 不支持的文件列表 */
  unsupportedFiles: FileInfo[];
  /** 总文件大小 */
  totalSize: number;
  /**
   * C-6: 拖入条目中疑似目录的汇总。
   * - 浏览器 DOM 拖拽:基于 size=0 + type='' 启发式识别
   * - Tauri 原生拖拽:依赖 onDragDropEvent 提供的 path 列表
   */
  directorySummary: DirectorySummary;
}

/**
 * 拖拽回调选项
 */
export interface UseEnhancedDragDropOptions {
  /** 文件拖拽回调 */
  onFilesDrop?: (files: FileInfo[]) => void;
  /** URL 拖拽回调 */
  onUrlDrop?: (urls: string[]) => void;
  /** 文本拖拽回调 */
  onTextDrop?: (text: string) => void;
  /** 粘贴回调（用于检测粘贴的 URL） */
  onPaste?: (urls: string[]) => void;
  /**
   * C-6: 目录拖入确认回调。
   * 当 drop 事件包含疑似目录条目时,触发该回调让上层应用弹出"包含 Y 个文件,
   * 是否全部提及?"对话框。用户确认后上层应用调用 `expandDirectories(paths)`
   * 展开目录并把结果通过 `onFilesDrop` 投递。
   */
  onDirectoriesDetected?: (directories: DirectorySummary, allFiles: FileInfo[]) => void;
  /**
   * C-6: 读目录实现(由上层应用注入 tauriBridge.fs.readDir)。
   * 注入后可调用 `expandDirectories(paths)` 异步展开。
   */
  directoryReader?: DirectoryReader;
  /** 是否启用文件拖拽，默认 true */
  enableFiles?: boolean;
  /** 是否启用 URL 拖拽，默认 true */
  enableUrls?: boolean;
  /** 是否启用文本拖拽，默认 false */
  enableText?: boolean;
}

/**
 * 初始拖拽状态
 */
const INITIAL_DRAG_STATE: DragState = {
  isDragging: false,
  dragType: null,
  files: [],
  urls: [],
  hasUnsupported: false,
  unsupportedFiles: [],
  totalSize: 0,
  directorySummary: { count: 0, names: [] },
};

/**
 * 增强拖拽 Hook 返回值类型
 */
export interface UseEnhancedDragDropResult {
  dragState: DragState;
  handleDragEnter: (event: DragEvent<HTMLElement>) => void;
  handleDragOver: (event: DragEvent<HTMLElement>) => void;
  handleDragLeave: (event: DragEvent<HTMLElement>) => void;
  handleDrop: (event: DragEvent<HTMLElement>) => void;
  handlePaste: (event: ClipboardEvent<HTMLElement>) => void;
  resetDragState: () => void;
  expandDirectories: (
    originalFiles: ReadonlyArray<FileInfo>,
    directoryPaths: ReadonlyArray<string>,
  ) => Promise<FileInfo[]>;
}

/**
 * 增强拖拽 Hook
 *
 * @param options - 配置选项
 * @returns 拖拽状态和事件处理器
 *
 * @example
 * ```tsx
 * function Composer() {
 *   const { dragState, handleDragEnter, handleDragOver, handleDragLeave, handleDrop } =
 *     useEnhancedDragDrop({
 *       onFilesDrop: (files) => console.log("Files dropped:", files),
 *       onUrlDrop: (urls) => console.log("URLs dropped:", urls),
 *     });
 *
 *   return (
 *     <div
 *       onDragEnter={handleDragEnter}
 *       onDragOver={handleDragOver}
 *       onDragLeave={handleDragLeave}
 *       onDrop={handleDrop}
 *     >
 *       {dragState.isDragging && <DragOverlay files={dragState.files} />}
 *       <Editor />
 *     </div>
 *   );
 * }
 * ```
 */
export function useEnhancedDragDrop(options: UseEnhancedDragDropOptions = {}) {
  const {
    onFilesDrop,
    onUrlDrop,
    onTextDrop,
    onPaste,
    onDirectoriesDetected,
    enableFiles = true,
    enableUrls = true,
    enableText = false,
  } = options;

  const [dragState, setDragState] = useState<DragState>(INITIAL_DRAG_STATE);
  const dragCounterRef = useRef(0);
  const dragEnteredRef = useRef(false);

  /**
   * 检测拖拽数据类型
   */
  const detectDragType = useCallback(
    (dataTransfer: DataTransfer): DragType => {
      // 检查是否有文件
      if (enableFiles && dataTransfer.files && dataTransfer.files.length > 0) {
        return "files";
      }

      // 检查是否有 URL
      if (enableUrls) {
        const text = dataTransfer.getData("text/plain") || dataTransfer.getData("text/uri-list");
        if (text && containsUrl(text)) {
          return "url";
        }
      }

      // 检查是否有文本
      if (enableText) {
        const text = dataTransfer.getData("text/plain");
        if (text) {
          return "text";
        }
      }

      return null;
    },
    [enableFiles, enableUrls, enableText],
  );

  /**
   * 提取拖拽数据
   */
  const extractDragData = useCallback(
    (dataTransfer: DataTransfer): Partial<DragState> => {
      const dragType = detectDragType(dataTransfer);

      if (dragType === "files") {
        const files = extractFilesFromDataTransfer(dataTransfer);
        // C-6: 顺便检测拖入条目中是否包含目录(Chromium webview 启发式)
        // 注意:此处不能直接调用 readDirectory,只能基于 size=0 + type='' 推断
        const rawFiles = dataTransfer.files
          ? Array.from(dataTransfer.files).map((f) => ({
              name: f.name,
              size: f.size,
              type: f.type,
            }))
          : [];
        const directorySummary = summarizeDirectoryEntries(rawFiles);
        return {
          dragType,
          files,
          hasUnsupported: hasUnsupportedFiles(files),
          unsupportedFiles: getUnsupportedFiles(files),
          totalSize: calculateTotalFileSize(files),
          directorySummary,
        };
      }

      if (dragType === "url") {
        const text = dataTransfer.getData("text/plain") || dataTransfer.getData("text/uri-list");
        const urls = extractUrls(text);
        return {
          dragType,
          urls,
          directorySummary: { count: 0, names: [] },
        };
      }

      return { dragType, directorySummary: { count: 0, names: [] } };
    },
    [detectDragType],
  );

  /**
   * 处理拖拽进入
   */
  const handleDragEnter = useCallback(
    (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();

      dragCounterRef.current += 1;

      if (dragCounterRef.current === 1) {
        dragEnteredRef.current = true;
        const dragData = extractDragData(event.dataTransfer);
        setDragState({
          isDragging: true,
          ...dragData,
        } as DragState);
      }
    },
    [extractDragData],
  );

  /**
   * 处理拖拽悬停
   */
  const handleDragOver = useCallback(
    (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();

      // 更新拖拽数据（可能在拖拽过程中变化）
      const dragData = extractDragData(event.dataTransfer);
      setDragState((prev) => ({
        ...prev,
        isDragging: true,
        ...dragData,
      }));

      // 设置拖拽效果
      if (dragData.dragType === "files" && dragData.hasUnsupported) {
        event.dataTransfer.dropEffect = "none";
      } else {
        event.dataTransfer.dropEffect = "copy";
      }
    },
    [extractDragData],
  );

  /**
   * 处理拖拽离开
   */
  const handleDragLeave = useCallback(
    (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();

      dragCounterRef.current -= 1;

      if (dragCounterRef.current === 0) {
        dragEnteredRef.current = false;
        setDragState(INITIAL_DRAG_STATE);
      }
    },
    [],
  );

  /**
   * 处理拖拽放置
   */
  const handleDrop = useCallback(
    (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();

      // 重置状态
      dragCounterRef.current = 0;
      dragEnteredRef.current = false;

      const dragData = extractDragData(event.dataTransfer);

      // 重置拖拽状态
      setDragState(INITIAL_DRAG_STATE);

      // 处理不同类型的拖拽
      if (dragData.dragType === "files" && dragData.files) {
        const directorySummary = dragData.directorySummary ?? { count: 0, names: [] };
        // C-6: 检测到目录时,先弹确认;由上层应用在用户确认后调用 onFilesDrop
        if (directorySummary.count > 0 && onDirectoriesDetected) {
          onDirectoriesDetected(directorySummary, dragData.files);
        } else if (!dragData.hasUnsupported && onFilesDrop) {
          onFilesDrop(dragData.files);
        }
      } else if (dragData.dragType === "url" && dragData.urls) {
        if (onUrlDrop) {
          onUrlDrop(dragData.urls);
        }
      } else if (dragData.dragType === "text") {
        const text = event.dataTransfer.getData("text/plain");
        if (onTextDrop && text) {
          onTextDrop(text);
        }
      }
    },
    [extractDragData, onFilesDrop, onUrlDrop, onTextDrop, onDirectoriesDetected],
  );

  /**
   * 处理粘贴事件（检测 URL）
   */
  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLElement>) => {
      if (!enableUrls || !onPaste) return;

      const text = event.clipboardData.getData("text/plain");
      if (!text) return;

      const urls = extractUrls(text);
      if (urls.length > 0) {
        onPaste(urls);
      }
    },
    [enableUrls, onPaste],
  );

  /**
   * 重置拖拽状态
   */
  const resetDragState = useCallback(() => {
    dragCounterRef.current = 0;
    dragEnteredRef.current = false;
    setDragState(INITIAL_DRAG_STATE);
  }, []);

  /**
   * C-6: 展开目录条目为子文件并合并到原始列表。
   *
   * 该函数由 `onDirectoriesDetected` 回调触发后,上层应用在用户确认"全部提及"
   * 时调用,返回合并后的完整文件列表。
   *
   * @param originalFiles - 拖拽时原始的 FileInfo 列表(含目录占位)
   * @param directoryPaths - 要展开的目录路径列表(顺序需与拖入顺序一致)
   * @returns 合并后的 FileInfo 列表
   */
  const expandDirectories = useCallback(
    async (
      originalFiles: ReadonlyArray<FileInfo>,
      directoryPaths: ReadonlyArray<string>,
    ): Promise<FileInfo[]> => {
      if (!options.directoryReader) {
        return [...originalFiles];
      }
      // 把每个路径分别展开,并把结果前缀化为 basename,以便 mergeExpandedDirectoryEntries 能定位
      const allExpanded: FileInfo[] = [];
      for (const path of directoryPaths) {
        const sep = path.includes("\\") ? "\\" : "/";
        const trimmed = path.endsWith(sep) ? path.slice(0, -1) : path;
        const basename = trimmed.split(/[\\/]/).pop() ?? trimmed;
        const result = await expandDirectoryEntries([path], options.directoryReader);
        for (const file of result.files) {
          // 给展开后的文件名前缀化 "basename/" 以匹配 merge 规则
          allExpanded.push({
            ...file,
            name: `${basename}/${file.name}`,
          });
        }
      }
      return mergeExpandedDirectoryEntries(originalFiles, allExpanded);
    },
    [options.directoryReader],
  );

  return {
    dragState,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handlePaste,
    resetDragState,
    expandDirectories,
  };
}
