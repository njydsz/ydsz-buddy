/**
 * @file DirectoryConfirmDialog 单元测试
 * @description 验证 D-7 任务:目录拖入确认对话框
 *   - 渲染/不渲染边界
 *   - 目录列表预览 + "等 N 个"
 *   - 展开深度切换 (top / recursive)
 *   - 全部展开 / 仅目录名 / 取消 三个按钮交互
 *   - isSubmitting 期间禁用所有按钮
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, createElement, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DirectoryConfirmDialog } from "./DirectoryConfirmDialog";
import type { DirectorySummary } from "~/lib/fileUtils";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function clickElement(element: Element): void {
  const event = new MouseEvent("click", { bubbles: true, cancelable: true });
  element.dispatchEvent(event);
}

function findButtonByTestId(
  container: HTMLElement,
  testId: string,
): HTMLButtonElement | undefined {
  return container.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`);
}

function renderDialog(
  props: Partial<ComponentProps<typeof DirectoryConfirmDialog>> = {},
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: Root | null = null;

  const summary: DirectorySummary = props.directories ?? {
    count: 2,
    names: ["src", "docs"],
  };

  act(() => {
    root = createRoot(container);
    root.render(
      createElement(DirectoryConfirmDialog, {
        isOpen: true,
        directories: summary,
        onExpandAll: () => {},
        onMentionFolderOnly: () => {},
        onCancel: () => {},
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

beforeEach(() => {
  localStorage.clear();
});

describe("D-7 DirectoryConfirmDialog - 渲染边界", () => {
  it("isOpen=false 时不渲染", () => {
    const { container } = renderDialog({ isOpen: false });
    expect(container.querySelector('[data-testid="directory-confirm-dialog"]')).toBeNull();
  });

  it("directories.count === 0 时不渲染", () => {
    const { container } = renderDialog({
      directories: { count: 0, names: [] },
    });
    expect(container.querySelector('[data-testid="directory-confirm-dialog"]')).toBeNull();
  });

  it("正常打开时渲染对话框 + 目录计数", () => {
    const { container } = renderDialog({
      directories: { count: 2, names: ["src", "docs"] },
    });
    const dialog = container.querySelector('[data-testid="directory-confirm-dialog"]');
    expect(dialog).toBeTruthy();
    expect(dialog?.getAttribute("data-directory-count")).toBe("2");
    expect(container.textContent).toContain("检测到 2 个文件夹");
  });
});

describe("D-7 DirectoryConfirmDialog - 目录列表预览", () => {
  it("展示所有目录名 (≤ 3 个)", () => {
    const { container } = renderDialog({
      directories: { count: 2, names: ["src", "docs"] },
    });
    const list = container.querySelector('[data-testid="directory-confirm-list"]');
    expect(list?.textContent).toContain("src");
    expect(list?.textContent).toContain("docs");
  });

  it("超过 3 个时显示 '等 N 个' 徽标", () => {
    const { container } = renderDialog({
      directories: {
        count: 5,
        names: ["a", "b", "c", "d", "e"],
      },
    });
    expect(container.textContent).toContain("等 2 个");
  });
});

describe("D-7 DirectoryConfirmDialog - 深度切换", () => {
  it("默认深度为 'top'", () => {
    const { container } = renderDialog();
    const depthControl = container.querySelector(
      '[data-testid="directory-confirm-depth"]',
    );
    expect(depthControl?.getAttribute("data-depth")).toBe("top");
  });

  it("点击 '递归' 切换 depth 为 'recursive'", () => {
    const { container } = renderDialog();
    const depthButtons = container.querySelectorAll(
      '[data-testid="directory-confirm-depth"] button',
    );
    const recursiveBtn = depthButtons[1] as HTMLButtonElement | undefined;
    expect(recursiveBtn).toBeTruthy();
    act(() => clickElement(recursiveBtn!));
    const depthControl = container.querySelector(
      '[data-testid="directory-confirm-depth"]',
    );
    expect(depthControl?.getAttribute("data-depth")).toBe("recursive");
  });
});

describe("D-7 DirectoryConfirmDialog - 按钮交互", () => {
  it("点击 '全部展开' 触发 onExpandAll 并传入当前 depth", async () => {
    const onExpandAll = vi.fn().mockResolvedValue(undefined);
    const { container } = renderDialog({ onExpandAll });

    const expandBtn = findButtonByTestId(container, "directory-confirm-expand");
    expect(expandBtn).toBeTruthy();
    await act(async () => {
      clickElement(expandBtn!);
      // 等待 microtask 完成
      await Promise.resolve();
    });
    expect(onExpandAll).toHaveBeenCalledWith("top");
  });

  it("点击 '仅目录名' 触发 onMentionFolderOnly", () => {
    const onMentionFolderOnly = vi.fn();
    const { container } = renderDialog({ onMentionFolderOnly });

    const btn = findButtonByTestId(container, "directory-confirm-folder-only");
    expect(btn).toBeTruthy();
    act(() => clickElement(btn!));
    expect(onMentionFolderOnly).toHaveBeenCalledTimes(1);
  });

  it("点击 '取消' 触发 onCancel", () => {
    const onCancel = vi.fn();
    const { container } = renderDialog({ onCancel });

    const btn = findButtonByTestId(container, "directory-confirm-cancel");
    expect(btn).toBeTruthy();
    act(() => clickElement(btn!));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("isSubmitting 期间禁用所有按钮", async () => {
    let resolveExpand: (() => void) | null = null;
    const onExpandAll = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveExpand = resolve;
        }),
    );
    const { container } = renderDialog({ onExpandAll });

    const expandBtn = findButtonByTestId(container, "directory-confirm-expand");
    act(() => clickElement(expandBtn!));

    // 等待 setIsSubmitting(true) 生效
    await act(async () => {
      await Promise.resolve();
    });

    const expandBtnAfter = findButtonByTestId(container, "directory-confirm-expand");
    expect(expandBtnAfter?.disabled).toBe(true);

    const folderOnlyBtn = findButtonByTestId(container, "directory-confirm-folder-only");
    expect(folderOnlyBtn?.disabled).toBe(true);

    const cancelBtn = findButtonByTestId(container, "directory-confirm-cancel");
    expect(cancelBtn?.disabled).toBe(true);

    // 完成 promise,确保测试清理
    await act(async () => {
      resolveExpand?.();
      await Promise.resolve();
    });
  });
});

describe("D-7 DirectoryConfirmDialog - 切换 depth 后展开", () => {
  it("点击 '递归' 后再点 '全部展开' 传入 'recursive'", async () => {
    const onExpandAll = vi.fn().mockResolvedValue(undefined);
    const { container } = renderDialog({ onExpandAll });

    const depthButtons = container.querySelectorAll(
      '[data-testid="directory-confirm-depth"] button',
    );
    const recursiveBtn = depthButtons[1] as HTMLButtonElement | undefined;
    act(() => clickElement(recursiveBtn!));

    const expandBtn = findButtonByTestId(container, "directory-confirm-expand");
    await act(async () => {
      clickElement(expandBtn!);
      await Promise.resolve();
    });
    expect(onExpandAll).toHaveBeenCalledWith("recursive");
  });
});
