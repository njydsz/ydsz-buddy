/**
 * @file 目录拖入端到端集成测试
 *
 * @description 验证完整流程:
 * 1. useEnhancedDragDrop 检测到目录条目(size=0+type='')
 * 2. 调用 onDirectoriesDetected 回调(而非 onFilesDrop)
 * 3. DirectoryConfirmDialog 渲染并显示目录名
 * 4. 用户点击"全部展开并提及"→ onExpandAll 触发
 * 5. 父组件用 useDirectoryDropConfirmation 把结果 resolve
 * 6. 验证最终投递到 composer 的文件列表正确
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, beforeEach } from "vitest";
import { act, createElement, useRef, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";

import { DragDropOverlay } from "../components/DragDropOverlay";
import { DirectoryConfirmDialog, type DirectoryExpandDepth } from "../components/DirectoryConfirmDialog";
import { useEnhancedDragDrop, type UseEnhancedDragDropResult } from "../hooks/useEnhancedDragDrop";
import { useDirectoryDropConfirmation, type DirectoryResolutionKind } from "../hooks/useDirectoryDropConfirmation";
import type { DirectoryReader, FileInfo } from "../lib/fileUtils";

interface MountedHandle {
  container: HTMLDivElement;
  root: Root;
}

function mountInDocument(): MountedHandle {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  return { container, root };
}

function unmount(handle: MountedHandle): void {
  handle.root.unmount();
  handle.container.remove();
}

// =============================================================================
// 工具:模拟拖拽事件
// =============================================================================

function makeMockDataTransfer(opts: {
  files?: Array<{ name: string; size: number; type: string }>;
  text?: string;
}): DataTransfer {
  const dt: Partial<DataTransfer> = {
    files: [] as unknown as FileList,
    getData: (format: string) => {
      if (format === "text/plain" || format === "text/uri-list") {
        return opts.text ?? "";
      }
      return "";
    },
    setData: () => undefined,
    clearData: () => undefined,
    items: [] as unknown as DataTransferItemList,
    types: [],
    dropEffect: "none",
    effectAllowed: "all",
  };
  if (opts.files && opts.files.length > 0) {
    const files = opts.files;
    (dt as { files: unknown }).files = {
      length: files.length,
      item: (i: number) => files[i],
      ...files,
    };
    dt.types = ["Files"];
  }
  return dt as DataTransfer;
}

function makeMockDragEvent(opts: {
  type: "dragenter" | "drop";
  dataTransfer: DataTransfer;
}): {
  type: string;
  dataTransfer: DataTransfer;
  preventDefault: () => void;
  stopPropagation: () => void;
} {
  return {
    type: opts.type,
    dataTransfer: opts.dataTransfer,
    preventDefault: () => undefined,
    stopPropagation: () => undefined,
  };
}

beforeEach(() => {
  localStorage.clear();
});

// =============================================================================
// 1. 完整流程:目录拖入 → 弹窗 → 全部展开
// =============================================================================

describe("C-6 目录拖入端到端流程", () => {
  it("拖入目录 → 弹窗 → 点击「全部展开」→ 投递展开后的子文件", async () => {
    const directoryReader: DirectoryReader = async (path: string) => {
      if (path === "src") {
        return [
          { name: "index.ts", isDirectory: false },
          { name: "util.ts", isDirectory: false },
        ];
      }
      throw new Error(`ENOENT: ${path}`);
    };

    const resolvedFiles: Array<{ files: FileInfo[]; kind: DirectoryResolutionKind }> = [];
    let dragDrop: UseEnhancedDragDropResult | null = null;

    function Page() {
      const directoryDrop = useDirectoryDropConfirmation({
        directoryReader,
        onResolved: (files, kind) => {
          resolvedFiles.push({ files, kind });
        },
      });

      const localDragDrop = useEnhancedDragDrop({
        onDirectoriesDetected: (summary, allFiles) => {
          directoryDrop.handleInitialDrop(allFiles);
          // 仅在测试中持有 summary 以防空值警告
          void summary;
        },
        onFilesDrop: (files) => {
          directoryDrop.handleInitialDrop(files);
        },
      });
      dragDrop = localDragDrop;

      return createElement(
        "div",
        null,
        createElement(DragDropOverlay, { dragState: localDragDrop.dragState }),
        createElement(DirectoryConfirmDialog, {
          isOpen: directoryDrop.isOpen,
          directories: directoryDrop.summary,
          onExpandAll: (depth: DirectoryExpandDepth) => directoryDrop.handleExpandAll(depth),
          onMentionFolderOnly: directoryDrop.handleMentionFolderOnly,
          onCancel: directoryDrop.handleCancel,
        }),
      );
    }

    const handle = mountInDocument();
    await act(async () => {
      handle.root.render(createElement(Page));
    });

    // 步骤 1: 拖入含目录的 DataTransfer
    const dt = makeMockDataTransfer({
      files: [
        { name: "src", size: 0, type: "" },
        { name: "README.md", size: 100, type: "text/markdown" },
      ],
    });
    await act(async () => {
      dragDrop!.handleDrop(
        makeMockDragEvent({ type: "drop", dataTransfer: dt }) as unknown as Parameters<UseEnhancedDragDropResult["handleDrop"]>[0],
      );
    });

    expect(resolvedFiles).toHaveLength(0);
    const dialog = document.querySelector('[data-testid="directory-confirm-dialog"]');
    expect(dialog).toBeTruthy();
    expect(dialog?.getAttribute("data-directory-count")).toBe("1");

    // 步骤 2: 用户点击"全部展开并提及"
    const expandBtn = document.querySelector(
      '[data-testid="directory-confirm-expand"]',
    ) as HTMLButtonElement;
    await act(async () => {
      expandBtn.click();
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(resolvedFiles).toHaveLength(1);
    expect(resolvedFiles[0]!.kind).toBe("expanded");
    const merged = resolvedFiles[0]!.files.map((f) => f.name);
    expect(merged).toEqual(["src/index.ts", "src/util.ts", "README.md"]);

    expect(document.querySelector('[data-testid="directory-confirm-dialog"]')).toBeNull();

    unmount(handle);
  });

  it("拖入目录 → 弹窗 → 点击「仅目录名」→ 投递目录名作为 mentions", async () => {
    const directoryReader: DirectoryReader = async () => [];
    const resolvedFiles: Array<{ files: FileInfo[]; kind: DirectoryResolutionKind }> = [];
    let dragDrop: UseEnhancedDragDropResult | null = null;

    function Page() {
      const directoryDrop = useDirectoryDropConfirmation({
        directoryReader,
        onResolved: (files, kind) => {
          resolvedFiles.push({ files, kind });
        },
      });

      const localDragDrop = useEnhancedDragDrop({
        onDirectoriesDetected: (summary, allFiles) => {
          directoryDrop.handleInitialDrop(allFiles);
          void summary;
        },
        onFilesDrop: (files) => directoryDrop.handleInitialDrop(files),
      });
      dragDrop = localDragDrop;

      return createElement(
        "div",
        null,
        createElement(DirectoryConfirmDialog, {
          isOpen: directoryDrop.isOpen,
          directories: directoryDrop.summary,
          onExpandAll: (depth: DirectoryExpandDepth) => directoryDrop.handleExpandAll(depth),
          onMentionFolderOnly: directoryDrop.handleMentionFolderOnly,
          onCancel: directoryDrop.handleCancel,
        }),
      );
    }

    const handle = mountInDocument();
    await act(async () => {
      handle.root.render(createElement(Page));
    });

    const dt = makeMockDataTransfer({
      files: [
        { name: "docs", size: 0, type: "" },
        { name: "images", size: 0, type: "" },
      ],
    });
    await act(async () => {
      dragDrop!.handleDrop(
        makeMockDragEvent({ type: "drop", dataTransfer: dt }) as unknown as Parameters<UseEnhancedDragDropResult["handleDrop"]>[0],
      );
    });

    const folderOnlyBtn = document.querySelector(
      '[data-testid="directory-confirm-folder-only"]',
    ) as HTMLButtonElement;
    await act(async () => {
      folderOnlyBtn.click();
    });

    expect(resolvedFiles).toHaveLength(1);
    expect(resolvedFiles[0]!.kind).toBe("folder-only");
    expect(resolvedFiles[0]!.files.map((f) => f.name)).toEqual(["docs", "images"]);

    unmount(handle);
  });

  it("拖入目录 → 弹窗 → 点击「取消」→ 不投递任何内容", async () => {
    const directoryReader: DirectoryReader = async () => [];
    const resolvedFiles: Array<{ files: FileInfo[]; kind: DirectoryResolutionKind }> = [];
    let dragDrop: UseEnhancedDragDropResult | null = null;

    function Page() {
      const directoryDrop = useDirectoryDropConfirmation({
        directoryReader,
        onResolved: (files, kind) => {
          resolvedFiles.push({ files, kind });
        },
      });

      const localDragDrop = useEnhancedDragDrop({
        onDirectoriesDetected: (summary, allFiles) => {
          directoryDrop.handleInitialDrop(allFiles);
          void summary;
        },
        onFilesDrop: (files) => directoryDrop.handleInitialDrop(files),
      });
      dragDrop = localDragDrop;

      return createElement(
        "div",
        null,
        createElement(DirectoryConfirmDialog, {
          isOpen: directoryDrop.isOpen,
          directories: directoryDrop.summary,
          onExpandAll: (depth: DirectoryExpandDepth) => directoryDrop.handleExpandAll(depth),
          onMentionFolderOnly: directoryDrop.handleMentionFolderOnly,
          onCancel: directoryDrop.handleCancel,
        }),
      );
    }

    const handle = mountInDocument();
    await act(async () => {
      handle.root.render(createElement(Page));
    });

    const dt = makeMockDataTransfer({
      files: [{ name: "docs", size: 0, type: "" }],
    });
    await act(async () => {
      dragDrop!.handleDrop(
        makeMockDragEvent({ type: "drop", dataTransfer: dt }) as unknown as Parameters<UseEnhancedDragDropResult["handleDrop"]>[0],
      );
    });

    const cancelBtn = document.querySelector(
      '[data-testid="directory-confirm-cancel"]',
    ) as HTMLButtonElement;
    await act(async () => {
      cancelBtn.click();
    });

    expect(resolvedFiles).toHaveLength(1);
    expect(resolvedFiles[0]!.kind).toBe("cancelled");
    expect(resolvedFiles[0]!.files).toEqual([]);

    unmount(handle);
  });

  it("拖入纯文件(无目录)→ 不弹窗,直接投递", async () => {
    const directoryReader: DirectoryReader = async () => [];
    const resolvedFiles: Array<{ files: FileInfo[]; kind: DirectoryResolutionKind }> = [];
    let dragDrop: UseEnhancedDragDropResult | null = null;

    function Page() {
      const directoryDrop = useDirectoryDropConfirmation({
        directoryReader,
        onResolved: (files, kind) => {
          resolvedFiles.push({ files, kind });
        },
      });

      const localDragDrop = useEnhancedDragDrop({
        onFilesDrop: (files) => directoryDrop.handleInitialDrop(files),
      });
      dragDrop = localDragDrop;

      return createElement(
        "div",
        null,
        createElement(DirectoryConfirmDialog, {
          isOpen: directoryDrop.isOpen,
          directories: directoryDrop.summary,
          onExpandAll: (depth: DirectoryExpandDepth) => directoryDrop.handleExpandAll(depth),
          onMentionFolderOnly: directoryDrop.handleMentionFolderOnly,
          onCancel: directoryDrop.handleCancel,
        }),
      );
    }

    const handle = mountInDocument();
    await act(async () => {
      handle.root.render(createElement(Page));
    });

    const dt = makeMockDataTransfer({
      files: [
        { name: "a.png", size: 1024, type: "image/png" },
        { name: "b.txt", size: 50, type: "text/plain" },
      ],
    });
    await act(async () => {
      dragDrop!.handleDrop(
        makeMockDragEvent({ type: "drop", dataTransfer: dt }) as unknown as Parameters<UseEnhancedDragDropResult["handleDrop"]>[0],
      );
    });

    expect(document.querySelector('[data-testid="directory-confirm-dialog"]')).toBeNull();
    expect(resolvedFiles).toHaveLength(1);
    expect(resolvedFiles[0]!.kind).toBe("expanded");
    expect(resolvedFiles[0]!.files.map((f) => f.name)).toEqual(["a.png", "b.txt"]);

    unmount(handle);
  });

  it("dragenter 阶段 DragDropOverlay 已显示目录提示", async () => {
    let captured: UseEnhancedDragDropResult | null = null;

    function Page() {
      const dragDrop = useEnhancedDragDrop({});
      captured = dragDrop;
      return createElement(DragDropOverlay, { dragState: dragDrop.dragState });
    }

    const handle = mountInDocument();
    await act(async () => {
      handle.root.render(createElement(Page));
    });

    const dt = makeMockDataTransfer({
      files: [
        { name: "docs", size: 0, type: "" },
        { name: "a.png", size: 1024, type: "image/png" },
      ],
    });
    await act(async () => {
      captured!.handleDragEnter(
        makeMockDragEvent({ type: "dragenter", dataTransfer: dt }) as unknown as Parameters<UseEnhancedDragDropResult["handleDragEnter"]>[0],
      );
    });

    const hint = document.querySelector('[data-testid="drag-drop-directory-hint"]');
    expect(hint).toBeTruthy();
    expect(hint?.getAttribute("data-directory-count")).toBe("1");

    unmount(handle);
  });
});
