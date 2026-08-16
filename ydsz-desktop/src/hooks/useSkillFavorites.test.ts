/**
 * @file useSkillFavorites 单元测试
 *
 * 覆盖：
 * - 初始空状态
 * - 写入后正确读出（去重保序）
 * - addFavorite / removeFavorite / toggleFavorite 行为
 * - reorderFavorites 边界（越界、同位、负数）
 * - clearFavorites 清空
 * - 损坏数据回落到空状态
 */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  SKILL_FAVORITES_STORAGE_KEY,
  useSkillFavorites,
  type UseSkillFavoritesResult,
} from "./useSkillFavorites";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const P = (s: string) => s;

interface Handle {
  result: UseSkillFavoritesResult;
  unmount: () => void;
}

function setup(): Handle {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  let captured: UseSkillFavoritesResult | null = null;
  const handle: Handle = {
    get result() {
      if (!captured) throw new Error("hook not yet rendered");
      return captured;
    },
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
  function Probe() {
    captured = useSkillFavorites();
    return null;
  }
  act(() => {
    root.render(createElement(Probe));
  });
  return handle;
}

function clearStorage() {
  window.localStorage.clear();
}

function getStorage(): { orderedPaths: string[] } | null {
  const raw = window.localStorage.getItem(SKILL_FAVORITES_STORAGE_KEY);
  return raw ? (JSON.parse(raw) as { orderedPaths: string[] }) : null;
}

describe("useSkillFavorites", () => {
  beforeEach(() => {
    clearStorage();
  });

  afterEach(() => {
    clearStorage();
  });

  it("starts empty when storage is empty", () => {
    const h = setup();
    expect(h.result.favorites).toEqual([]);
    expect(h.result.isFavorite("any")).toBe(false);
    h.unmount();
  });

  it("falls back to empty when stored JSON is invalid", () => {
    window.localStorage.setItem(SKILL_FAVORITES_STORAGE_KEY, "not json");
    const h = setup();
    expect(h.result.favorites).toEqual([]);
    h.unmount();
  });

  it("falls back to empty when orderedPaths is not a string array", () => {
    window.localStorage.setItem(
      SKILL_FAVORITES_STORAGE_KEY,
      JSON.stringify({ orderedPaths: [{ a: 1 }, null, 42] }),
    );
    const h = setup();
    expect(h.result.favorites).toEqual([]);
    h.unmount();
  });

  it("deduplicates while preserving order on read", () => {
    window.localStorage.setItem(
      SKILL_FAVORITES_STORAGE_KEY,
      JSON.stringify({ orderedPaths: ["a", "b", "a", "c", "b"] }),
    );
    const h = setup();
    expect(h.result.favorites).toEqual(["a", "b", "c"]);
    h.unmount();
  });

  it("addFavorite prepends a new path and writes to storage", () => {
    const h = setup();
    act(() => h.result.addFavorite(P("skill-a")));
    expect(h.result.favorites).toEqual(["skill-a"]);
    expect(getStorage()).toEqual({ orderedPaths: ["skill-a"] });

    act(() => h.result.addFavorite(P("skill-b")));
    expect(h.result.favorites).toEqual(["skill-b", "skill-a"]);
    expect(getStorage()).toEqual({ orderedPaths: ["skill-b", "skill-a"] });
    h.unmount();
  });

  it("addFavorite on existing path moves it to the head", () => {
    window.localStorage.setItem(
      SKILL_FAVORITES_STORAGE_KEY,
      JSON.stringify({ orderedPaths: ["a", "b", "c"] }),
    );
    const h = setup();
    expect(h.result.favorites).toEqual(["a", "b", "c"]);

    act(() => h.result.addFavorite(P("c")));
    expect(h.result.favorites).toEqual(["c", "a", "b"]);
    h.unmount();
  });

  it("addFavorite ignores empty path", () => {
    const h = setup();
    act(() => h.result.addFavorite(P("")));
    expect(h.result.favorites).toEqual([]);
    expect(getStorage()).toBeNull();
    h.unmount();
  });

  it("removeFavorite removes the path and persists", () => {
    window.localStorage.setItem(
      SKILL_FAVORITES_STORAGE_KEY,
      JSON.stringify({ orderedPaths: ["a", "b", "c"] }),
    );
    const h = setup();
    act(() => h.result.removeFavorite(P("b")));
    expect(h.result.favorites).toEqual(["a", "c"]);
    expect(getStorage()).toEqual({ orderedPaths: ["a", "c"] });
    h.unmount();
  });

  it("removeFavorite is a no-op when path is not present", () => {
    window.localStorage.setItem(
      SKILL_FAVORITES_STORAGE_KEY,
      JSON.stringify({ orderedPaths: ["a"] }),
    );
    const h = setup();
    act(() => h.result.removeFavorite(P("missing")));
    expect(h.result.favorites).toEqual(["a"]);
    h.unmount();
  });

  it("toggleFavorite adds when missing and removes when present", () => {
    const h = setup();
    act(() => h.result.toggleFavorite(P("skill-a")));
    expect(h.result.isFavorite("skill-a")).toBe(true);
    act(() => h.result.toggleFavorite(P("skill-a")));
    expect(h.result.isFavorite("skill-a")).toBe(false);
    h.unmount();
  });

  it("reorderFavorites moves an item forward", () => {
    window.localStorage.setItem(
      SKILL_FAVORITES_STORAGE_KEY,
      JSON.stringify({ orderedPaths: ["a", "b", "c", "d"] }),
    );
    const h = setup();
    act(() => h.result.reorderFavorites(0, 2));
    expect(h.result.favorites).toEqual(["b", "c", "a", "d"]);
    h.unmount();
  });

  it("reorderFavorites moves an item backward", () => {
    window.localStorage.setItem(
      SKILL_FAVORITES_STORAGE_KEY,
      JSON.stringify({ orderedPaths: ["a", "b", "c", "d"] }),
    );
    const h = setup();
    act(() => h.result.reorderFavorites(3, 1));
    expect(h.result.favorites).toEqual(["a", "d", "b", "c"]);
    h.unmount();
  });

  it("reorderFavorites ignores identical source/dest", () => {
    window.localStorage.setItem(
      SKILL_FAVORITES_STORAGE_KEY,
      JSON.stringify({ orderedPaths: ["a", "b", "c"] }),
    );
    const h = setup();
    const before = h.result.favorites;
    act(() => h.result.reorderFavorites(1, 1));
    expect(h.result.favorites).toEqual(before);
    h.unmount();
  });

  it("reorderFavorites rejects out-of-range indices", () => {
    window.localStorage.setItem(
      SKILL_FAVORITES_STORAGE_KEY,
      JSON.stringify({ orderedPaths: ["a", "b"] }),
    );
    const h = setup();
    act(() => h.result.reorderFavorites(-1, 0));
    expect(h.result.favorites).toEqual(["a", "b"]);
    act(() => h.result.reorderFavorites(0, 5));
    expect(h.result.favorites).toEqual(["a", "b"]);
    act(() => h.result.reorderFavorites(5, 0));
    expect(h.result.favorites).toEqual(["a", "b"]);
    h.unmount();
  });

  it("clearFavorites empties the list and storage", () => {
    window.localStorage.setItem(
      SKILL_FAVORITES_STORAGE_KEY,
      JSON.stringify({ orderedPaths: ["a", "b"] }),
    );
    const h = setup();
    act(() => h.result.clearFavorites());
    expect(h.result.favorites).toEqual([]);
    expect(getStorage()).toEqual({ orderedPaths: [] });
    h.unmount();
  });

  it("ignores malformed string entries on read (defensive)", () => {
    window.localStorage.setItem(
      SKILL_FAVORITES_STORAGE_KEY,
      JSON.stringify({ orderedPaths: ["ok", "", "ok2"] }),
    );
    const h = setup();
    // 空字符串会被过滤
    expect(h.result.favorites).toEqual(["ok", "ok2"]);
    h.unmount();
  });
});
