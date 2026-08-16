/**
 * @file SkillFavoritesSection 单元测试
 *
 * 覆盖：
 * - 收藏为空时整个区域不渲染
 * - 收藏非空时渲染列表、清空按钮、卡片
 * - 卡片展示 name / description / sourceLabel
 * - 点击清空按钮后区域消失
 * - resolveFavorite 查不到的 path 被过滤
 */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SkillFavoritesSection, type FavoriteSkillDescriptor } from "./SkillFavoritesSection";
import { SKILL_FAVORITES_STORAGE_KEY } from "~/hooks/useSkillFavorites";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PATH_A = "/skills/a/SKILL.md";
const PATH_B = "/skills/b/SKILL.md";
const PATH_C = "/skills/c/SKILL.md";

const DESCRIPTORS: Record<string, FavoriteSkillDescriptor> = {
  [PATH_A]: { path: PATH_A, name: "Skill A", description: "alpha", sourceLabel: "claude" },
  [PATH_B]: { path: PATH_B, name: "Skill B", description: "beta", sourceLabel: "codex" },
  [PATH_C]: { path: PATH_C, name: "Skill C", sourceLabel: "agents" },
};

function setup(initialPaths: string[]) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  // 必须先写 storage，再挂载组件，否则 hook 读取到的是空状态
  if (initialPaths.length > 0) {
    window.localStorage.setItem(
      SKILL_FAVORITES_STORAGE_KEY,
      JSON.stringify({ orderedPaths: initialPaths }),
    );
  } else {
    window.localStorage.removeItem(SKILL_FAVORITES_STORAGE_KEY);
  }
  const root: Root = createRoot(container);
  act(() => {
    root.render(
      createElement(SkillFavoritesSection, {
        resolveFavorite: (path) => DESCRIPTORS[path],
      }),
    );
  });
  return {
    root,
    container,
    rerender: () => {
      act(() => {
        root.render(
          createElement(SkillFavoritesSection, {
            resolveFavorite: (path) => DESCRIPTORS[path],
          }),
        );
      });
    },
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function clearStorage() {
  window.localStorage.clear();
}

function click(el: Element) {
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("SkillFavoritesSection", () => {
  beforeEach(() => {
    clearStorage();
  });

  afterEach(() => {
    clearStorage();
  });

  it("renders nothing when no favorites exist", () => {
    const h = setup([]);
    expect(h.container.querySelector('[data-testid="skill-favorites-section"]')).toBeNull();
    h.unmount();
  });

  it("renders one card per stored favorite path", () => {
    const h = setup([PATH_A, PATH_B]);
    const list = h.container.querySelector('[data-testid="skill-favorites-list"]');
    expect(list).toBeTruthy();
    // 每个卡片上会有 handle / remove 子按钮，因此只统计 data-testid 含 "sortable-skill-" 但不含 "handle" / "remove" 的 li
    const cards = h.container.querySelectorAll(
      '[data-testid^="sortable-skill-"]:not([data-testid*="-handle-"]):not([data-testid*="-remove-"])',
    );
    expect(cards.length).toBe(2);
    expect(h.container.textContent).toContain("Skill A");
    expect(h.container.textContent).toContain("Skill B");
    h.unmount();
  });

  it("filters out favorites whose resolveFavorite returns undefined", () => {
    const h = setup([PATH_A, "/missing/SKILL.md", PATH_B]);
    const cards = h.container.querySelectorAll(
      '[data-testid^="sortable-skill-"]:not([data-testid*="-handle-"]):not([data-testid*="-remove-"])',
    );
    expect(cards.length).toBe(2);
    h.unmount();
  });

  it("renders the clear-all button with the right label", () => {
    const h = setup([PATH_A]);
    const clear = h.container.querySelector('[data-testid="skill-favorites-clear"]');
    expect(clear).toBeTruthy();
    expect(clear!.getAttribute("aria-label")).toBe("清空所有收藏");
    h.unmount();
  });

  it("clicking clear empties storage and re-renders with no section", () => {
    const h = setup([PATH_A, PATH_B]);
    expect(h.container.querySelector('[data-testid="skill-favorites-list"]')).toBeTruthy();
    const clear = h.container.querySelector('[data-testid="skill-favorites-clear"]') as HTMLElement;
    click(clear);
    h.rerender();
    expect(h.container.querySelector('[data-testid="skill-favorites-section"]')).toBeNull();
    expect(window.localStorage.getItem(SKILL_FAVORITES_STORAGE_KEY)).toBe(
      JSON.stringify({ orderedPaths: [] }),
    );
    h.unmount();
  });

  it("exposes drag handle and remove button on each card", () => {
    const h = setup([PATH_A]);
    expect(
      h.container.querySelector(`[data-testid="sortable-skill-handle-${PATH_A}"]`),
    ).toBeTruthy();
    expect(
      h.container.querySelector(`[data-testid="sortable-skill-remove-${PATH_A}"]`),
    ).toBeTruthy();
    h.unmount();
  });

  it("removes a single card when its remove button is clicked", () => {
    const h = setup([PATH_A, PATH_B]);
    const cardSelector =
      '[data-testid^="sortable-skill-"]:not([data-testid*="-handle-"]):not([data-testid*="-remove-"])';
    expect(h.container.querySelectorAll(cardSelector).length).toBe(2);
    const remove = h.container.querySelector(
      `[data-testid="sortable-skill-remove-${PATH_A}"]`,
    ) as HTMLElement;
    click(remove);
    h.rerender();
    expect(h.container.querySelectorAll(cardSelector).length).toBe(1);
    h.unmount();
  });
});
