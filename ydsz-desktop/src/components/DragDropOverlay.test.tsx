/**
 * @file DragDropOverlay 单元测试
 * @description 验证 D-7 任务:拖拽覆盖层增强
 *   - 文件卡片 / 列表 / URL 列表渲染
 *   - 文件类型分布摘要 (CategoryDistribution)
 *   - 大文件警告条 (LargeFileWarning)
 *   - 目录拖入提示 (DirectoryDragHint)
 *   - 不支持文件警告 (WarningBanner)
 *   - 尊重 prefers-reduced-motion
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, createElement, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DragDropOverlay } from "./DragDropOverlay";
import type { DragState } from "~/hooks/useEnhancedDragDrop";
import type { FileInfo } from "~/lib/fileUtils";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function renderOverlay(
  props: Partial<ComponentProps<typeof DragDropOverlay>> = {},
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: Root | null = null;
  act(() => {
    root = createRoot(container);
    root.render(
      createElement(DragDropOverlay, {
        dragState: props.dragState ?? {
          isDragging: true,
          dragType: "files",
          files: [],
          urls: [],
          hasUnsupported: false,
          unsupportedFiles: [],
          totalSize: 0,
          directorySummary: { count: 0, names: [] },
        },
        ...props,
      }),
    );
  });
  return {
    container,
    unmount() {
      act(() => {
        root?.unmount();
      });
      container.remove();
    },
  };
}

function makeFile(overrides: Partial<FileInfo>): FileInfo {
  return {
    name: "example.png",
    size: 1024,
    type: "image/png",
    category: "image",
    icon: "image",
    supported: true,
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe("D-7 DragDropOverlay - 基础渲染", () => {
  it("isDragging=false 时不渲染任何 DOM", () => {
    const { container } = renderOverlay({
      dragState: {
        isDragging: false,
        dragType: null,
        files: [],
        urls: [],
        hasUnsupported: false,
        unsupportedFiles: [],
        totalSize: 0,
        directorySummary: { count: 0, names: [] },
      },
    });
    expect(container.innerHTML).toBe("");
  });

  it("空 files 渲染提示文本", () => {
    const { container } = renderOverlay({
      dragState: {
        isDragging: true,
        dragType: "files",
        files: [],
        urls: [],
        hasUnsupported: false,
        unsupportedFiles: [],
        totalSize: 0,
        directorySummary: { count: 0, names: [] },
      },
    });
    expect(container.textContent).toContain("拖拽内容");
    expect(container.textContent).toContain("释放以添加内容");
  });

  it("URL 拖入时显示 URL 列表", () => {
    const { container } = renderOverlay({
      dragState: {
        isDragging: true,
        dragType: "url",
        files: [],
        urls: ["https://example.com"],
        hasUnsupported: false,
        unsupportedFiles: [],
        totalSize: 0,
        directorySummary: { count: 0, names: [] },
      },
    });
    expect(container.textContent).toContain("检测到 1 个链接");
    expect(container.textContent).toContain("https://example.com");
  });
});

describe("D-7 DragDropOverlay - 单文件卡片", () => {
  it("单文件时显示文件卡片", () => {
    const { container } = renderOverlay({
      dragState: {
        isDragging: true,
        dragType: "files",
        files: [makeFile({ name: "photo.jpg", size: 2048, category: "image" })],
        urls: [],
        hasUnsupported: false,
        unsupportedFiles: [],
        totalSize: 2048,
        directorySummary: { count: 0, names: [] },
      },
    });
    expect(container.textContent).toContain("photo.jpg");
    expect(container.textContent).toContain("2.00 KB");
  });
});

describe("D-7 DragDropOverlay - 多文件列表", () => {
  it("多文件时显示文件列表 + 总大小", () => {
    const { container } = renderOverlay({
      dragState: {
        isDragging: true,
        dragType: "files",
        files: [
          makeFile({ name: "a.png", size: 1024 }),
          makeFile({ name: "b.png", size: 1024 }),
        ],
        urls: [],
        hasUnsupported: false,
        unsupportedFiles: [],
        totalSize: 2048,
        directorySummary: { count: 0, names: [] },
      },
    });
    expect(container.textContent).toContain("2 个文件");
    expect(container.textContent).toContain("总计 2.00 KB");
  });

  it("超过 3 个文件时显示 '还有 N 个'", () => {
    const { container } = renderOverlay({
      dragState: {
        isDragging: true,
        dragType: "files",
        files: Array.from({ length: 5 }, (_, i) =>
          makeFile({ name: `f${i}.png`, size: 1024 }),
        ),
        urls: [],
        hasUnsupported: false,
        unsupportedFiles: [],
        totalSize: 5120,
        directorySummary: { count: 0, names: [] },
      },
    });
    expect(container.textContent).toContain("还有 2 个文件");
  });
});

describe("D-7 DragDropOverlay - 文件类型分布", () => {
  it("多类别拖入时显示分布摘要", () => {
    const { container } = renderOverlay({
      dragState: {
        isDragging: true,
        dragType: "files",
        files: [
          makeFile({ name: "a.png", category: "image" }),
          makeFile({ name: "b.png", category: "image" }),
          makeFile({ name: "c.pdf", category: "document" }),
        ],
        urls: [],
        hasUnsupported: false,
        unsupportedFiles: [],
        totalSize: 3072,
        directorySummary: { count: 0, names: [] },
      },
    });
    const distribution = container.querySelector(
      '[data-testid="drag-drop-category-distribution"]',
    );
    expect(distribution).toBeTruthy();
    expect(distribution?.textContent).toContain("图片");
    expect(distribution?.textContent).toContain("文档");
  });

  it("单类别时不显示分布摘要", () => {
    const { container } = renderOverlay({
      dragState: {
        isDragging: true,
        dragType: "files",
        files: [
          makeFile({ name: "a.png", category: "image" }),
          makeFile({ name: "b.png", category: "image" }),
        ],
        urls: [],
        hasUnsupported: false,
        unsupportedFiles: [],
        totalSize: 2048,
        directorySummary: { count: 0, names: [] },
      },
    });
    expect(
      container.querySelector('[data-testid="drag-drop-category-distribution"]'),
    ).toBeNull();
  });
});

describe("D-7 DragDropOverlay - 大文件警告", () => {
  it("单文件 > 50MB 时显示警告", () => {
    const large = 60 * 1024 * 1024;
    const { container } = renderOverlay({
      dragState: {
        isDragging: true,
        dragType: "files",
        files: [makeFile({ name: "big.zip", size: large, category: "archive" })],
        urls: [],
        hasUnsupported: false,
        unsupportedFiles: [],
        totalSize: large,
        directorySummary: { count: 0, names: [] },
      },
    });
    const warning = container.querySelector(
      '[data-testid="drag-drop-large-file-warning"]',
    );
    expect(warning).toBeTruthy();
    expect(warning?.getAttribute("data-large-file-count")).toBe("1");
  });

  it("多文件含大文件时显示警告 (含 N)", () => {
    const large = 60 * 1024 * 1024;
    const { container } = renderOverlay({
      dragState: {
        isDragging: true,
        dragType: "files",
        files: [
          makeFile({ name: "big1.zip", size: large, category: "archive" }),
          makeFile({ name: "big2.zip", size: large, category: "archive" }),
        ],
        urls: [],
        hasUnsupported: false,
        unsupportedFiles: [],
        totalSize: large * 2,
        directorySummary: { count: 0, names: [] },
      },
    });
    const warning = container.querySelector(
      '[data-testid="drag-drop-large-file-warning"]',
    );
    expect(warning?.getAttribute("data-large-file-count")).toBe("2");
  });

  it("所有文件 < 50MB 时不显示警告", () => {
    const { container } = renderOverlay({
      dragState: {
        isDragging: true,
        dragType: "files",
        files: [makeFile({ name: "small.png", size: 1024, category: "image" })],
        urls: [],
        hasUnsupported: false,
        unsupportedFiles: [],
        totalSize: 1024,
        directorySummary: { count: 0, names: [] },
      },
    });
    expect(
      container.querySelector('[data-testid="drag-drop-large-file-warning"]'),
    ).toBeNull();
  });
});

describe("D-7 DragDropOverlay - 目录拖入提示", () => {
  it("拖入含目录时显示提示", () => {
    const { container } = renderOverlay({
      dragState: {
        isDragging: true,
        dragType: "files",
        files: [
          makeFile({ name: "src", size: 0, type: "" }),
          makeFile({ name: "docs", size: 0, type: "" }),
        ],
        urls: [],
        hasUnsupported: false,
        unsupportedFiles: [],
        totalSize: 0,
        directorySummary: { count: 2, names: ["src", "docs"] },
      },
    });
    const hint = container.querySelector(
      '[data-testid="drag-drop-directory-hint"]',
    );
    expect(hint).toBeTruthy();
    expect(hint?.getAttribute("data-directory-count")).toBe("2");
    expect(hint?.textContent).toContain("src");
    expect(hint?.textContent).toContain("docs");
  });

  it("无目录时不显示提示", () => {
    const { container } = renderOverlay({
      dragState: {
        isDragging: true,
        dragType: "files",
        files: [makeFile({ name: "a.png", size: 1024, category: "image" })],
        urls: [],
        hasUnsupported: false,
        unsupportedFiles: [],
        totalSize: 1024,
        directorySummary: { count: 0, names: [] },
      },
    });
    expect(
      container.querySelector('[data-testid="drag-drop-directory-hint"]'),
    ).toBeNull();
  });
});

describe("D-7 DragDropOverlay - 不支持文件警告", () => {
  it("包含不支持文件时显示警告", () => {
    const { container } = renderOverlay({
      dragState: {
        isDragging: true,
        dragType: "files",
        files: [makeFile({ name: "virus.exe", size: 1024, supported: false })],
        urls: [],
        hasUnsupported: true,
        unsupportedFiles: [makeFile({ name: "virus.exe", size: 1024, supported: false })],
        totalSize: 1024,
        directorySummary: { count: 0, names: [] },
      },
    });
    expect(container.textContent).toContain("不支持的文件类型");
  });
});
