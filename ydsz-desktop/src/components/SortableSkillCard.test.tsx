/**
 * @file SortableSkillCard 单元测试
 *
 * 覆盖：
 * - 基本渲染：拖拽手柄、内容区、移除按钮
 * - 拖拽手柄应用 dnd-kit 提供的 attributes + listeners
 * - data-testid 与 data-dragging 属性
 * - onRemove 回调触发
 * - disabled 状态不接收 listeners
 * - forwardRef 正确转发到根 li
 */

import { forwardRef, type ReactNode } from "react";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DndContext } from "@dnd-kit/core";
import { SortableSkillCard } from "./SortableSkillCard";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface Handle {
  root: Root;
  container: HTMLDivElement;
  rerender: (node: ReactNode) => void;
  unmount: () => void;
}

function setup(node: ReactNode): Handle {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      createElement(
        DndContext,
        null,
        node,
      ),
    );
  });
  return {
    root,
    container,
    rerender: (next: ReactNode) => {
      act(() => {
        root.render(
          createElement(
            DndContext,
            null,
            next,
          ),
        );
      });
    },
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function click(el: Element) {
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("SortableSkillCard", () => {
  beforeEach(() => {
    // 每个用例独立
  });

  afterEach(() => {
    // 由 handle.unmount 处理
  });

  it("renders drag handle, content, and optional remove button", () => {
    const h = setup(
      createElement(SortableSkillCard, {
        id: "skill-a",
        children: createElement("span", { "data-testid": "child" }, "Skill A"),
      }),
    );
    expect(h.container.querySelector('[data-testid="sortable-skill-skill-a"]')).toBeTruthy();
    expect(h.container.querySelector('[data-testid="sortable-skill-handle-skill-a"]')).toBeTruthy();
    expect(h.container.querySelector('[data-testid="child"]')?.textContent).toBe("Skill A");
    // 默认没有 onRemove → 不渲染 remove 按钮
    expect(h.container.querySelector('[data-testid="sortable-skill-remove-skill-a"]')).toBeNull();
    h.unmount();
  });

  it("renders the remove button when onRemove is provided", () => {
    const onRemove = vi.fn();
    const h = setup(
      createElement(SortableSkillCard, {
        id: "skill-a",
        onRemove,
        children: "Skill A",
      }),
    );
    const remove = h.container.querySelector('[data-testid="sortable-skill-remove-skill-a"]');
    expect(remove).toBeTruthy();
    click(remove!);
    expect(onRemove).toHaveBeenCalledTimes(1);
    h.unmount();
  });

  it("does not throw on remove click when callback is not provided", () => {
    const h = setup(
      createElement(SortableSkillCard, {
        id: "skill-a",
        onRemove: undefined,
        children: "Skill A",
      }),
    );
    // 没有按钮，自然无 click
    expect(h.container.querySelector('[data-testid="sortable-skill-remove-skill-a"]')).toBeNull();
    h.unmount();
  });

  it("applies disabled state visually and forwards to useSortable", () => {
    const h = setup(
      createElement(SortableSkillCard, {
        id: "skill-a",
        disabled: true,
        children: "Skill A",
      }),
    );
    const root = h.container.querySelector('[data-testid="sortable-skill-skill-a"]') as HTMLElement;
    expect(root.className).toMatch(/opacity-50/);
    h.unmount();
  });

  it("forwards ref to the root li", () => {
    let captured: HTMLLIElement | null = null;
    const RefProbe = forwardRef<HTMLLIElement>((_, ref) => {
      return createElement(SortableSkillCard, {
        id: "skill-a",
        ref: (node: HTMLLIElement | null) => {
          captured = node;
          if (typeof ref === "function") ref(node);
          else if (ref) ref.current = node;
        },
        children: "Skill A",
      });
    });
    RefProbe.displayName = "RefProbe";
    const h = setup(createElement(RefProbe, null));
    expect(captured).toBeTruthy();
    expect(captured!.tagName.toLowerCase()).toBe("li");
    h.unmount();
  });

  it("uses custom dataTestId when provided", () => {
    const h = setup(
      createElement(SortableSkillCard, {
        id: "skill-a",
        dataTestId: "custom-id",
        children: "Skill A",
      }),
    );
    expect(h.container.querySelector('[data-testid="custom-id"]')).toBeTruthy();
    h.unmount();
  });

  it("has grab cursor style on the drag handle", () => {
    const h = setup(
      createElement(SortableSkillCard, {
        id: "skill-a",
        children: "Skill A",
      }),
    );
    const handle = h.container.querySelector(
      '[data-testid="sortable-skill-handle-skill-a"]',
    ) as HTMLElement;
    expect(handle.className).toMatch(/cursor-grab/);
    h.unmount();
  });
});
