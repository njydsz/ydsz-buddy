/**
 * @file ContextWindowBar.test.tsx
 * @description P1-6 验收测试:横向上下文窗口进度条组件。
 *
 * 覆盖:
 * - 无快照(maxTokens=null)时不渲染
 * - 无 token 消耗(usedTokens=0)时不渲染
 * - 有数据时渲染横向条 + 百分比
 * - 颜色阈值:< 50% 绿 / 50-80% 黄 / 80-100% 橙 / >= 100% 红
 * - compact 模式隐藏 token 数
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { ContextWindowBar } from "./ContextWindowBar";
import type { ContextWindowSnapshot } from "~/lib/contextWindow";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function makeSnapshot(overrides: Partial<ContextWindowSnapshot> = {}): ContextWindowSnapshot {
  const usedTokens = overrides.usedTokens ?? 1000;
  const maxTokens = overrides.maxTokens ?? 10000;
  // 默认从 usedTokens/maxTokens 推导 usedPercentage(对齐 deriveLatestUsageContextWindowSnapshot 逻辑)
  const defaultUsedPercentage =
    maxTokens > 0 ? Math.min(100, (usedTokens / maxTokens) * 100) : null;
  return {
    usedTokens,
    maxTokens,
    inputTokens: 800,
    outputTokens: 200,
    totalProcessedTokens: null,
    compactsAutomatically: false,
    hasReliableTokenRatio: true,
    usedPercent: defaultUsedPercentage,
    usedPercentage: defaultUsedPercentage,
    remainingTokens: maxTokens > 0 ? Math.max(0, maxTokens - usedTokens) : null,
    remainingPercentage: defaultUsedPercentage !== null ? Math.max(0, 100 - defaultUsedPercentage) : null,
    updatedAt: "2026-07-09T10:00:00.000Z",
    ...overrides,
  };
}

function renderBar(props: Parameters<typeof ContextWindowBar>[0]): {
  container: HTMLElement;
  unmount: () => void;
} {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: Root | null = null;
  act(() => {
    root = createRoot(container);
    root.render(createElement(ContextWindowBar, props));
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

describe("P1-6 ContextWindowBar", () => {
  it("maxTokens=null 时不渲染", () => {
    const { container, unmount } = renderBar({
      usage: makeSnapshot({ maxTokens: null }),
    });
    expect(container.querySelector('[data-testid="context-window-bar"]')).toBeNull();
    unmount();
  });

  it("usedTokens=0 时不渲染(避免空聊天页噪音)", () => {
    const { container, unmount } = renderBar({
      usage: makeSnapshot({ usedTokens: 0 }),
    });
    expect(container.querySelector('[data-testid="context-window-bar"]')).toBeNull();
    unmount();
  });

  it("有数据时渲染横向条 + 进度填充", () => {
    const { container, unmount } = renderBar({
      usage: makeSnapshot({ usedTokens: 5000, maxTokens: 10000 }),
    });
    const bar = container.querySelector('[data-testid="context-window-bar"]');
    expect(bar).not.toBeNull();
    const fill = container.querySelector('[data-testid="context-window-bar-fill"]') as HTMLElement;
    expect(fill).not.toBeNull();
    // 50% 使用率
    expect(fill.style.width).toBe("50%");
    unmount();
  });

  it("使用率 < 50% 填充为绿色", () => {
    const { container, unmount } = renderBar({
      usage: makeSnapshot({ usedTokens: 1000, maxTokens: 10000 }), // 10%
    });
    const fill = container.querySelector('[data-testid="context-window-bar-fill"]') as HTMLElement;
    expect(fill.className).toMatch(/bg-emerald-500/);
    unmount();
  });

  it("使用率 50-80% 填充为黄色", () => {
    const { container, unmount } = renderBar({
      usage: makeSnapshot({ usedTokens: 6000, maxTokens: 10000 }), // 60%
    });
    const fill = container.querySelector('[data-testid="context-window-bar-fill"]') as HTMLElement;
    expect(fill.className).toMatch(/bg-yellow-500/);
    unmount();
  });

  it("使用率 80-100% 填充为橙色", () => {
    const { container, unmount } = renderBar({
      usage: makeSnapshot({ usedTokens: 9000, maxTokens: 10000 }), // 90%
    });
    const fill = container.querySelector('[data-testid="context-window-bar-fill"]') as HTMLElement;
    expect(fill.className).toMatch(/bg-orange-500/);
    unmount();
  });

  it("使用率 >= 100% 填充为红色", () => {
    const { container, unmount } = renderBar({
      usage: makeSnapshot({ usedTokens: 12000, maxTokens: 10000 }), // 120%
    });
    const fill = container.querySelector('[data-testid="context-window-bar-fill"]') as HTMLElement;
    expect(fill.className).toMatch(/bg-red-500/);
    // 进度条宽度被钳制为 100%
    expect(fill.style.width).toBe("100%");
    unmount();
  });

  it("compact=true 时隐藏 token 数文字", () => {
    const { container, unmount } = renderBar({
      usage: makeSnapshot({ usedTokens: 5000, maxTokens: 10000 }),
      compact: true,
    });
    const label = container.querySelector('[data-testid="context-window-bar-label"]');
    expect(label).not.toBeNull();
    // compact 模式下只显示百分比,不显示 "5.0k/10k" token 数
    const spans = label?.querySelectorAll("span") ?? [];
    expect(spans.length).toBe(1);
    unmount();
  });

  it("compact=false 时显示 token 数文字", () => {
    const { container, unmount } = renderBar({
      usage: makeSnapshot({ usedTokens: 5000, maxTokens: 10000 }),
      compact: false,
    });
    const label = container.querySelector('[data-testid="context-window-bar-label"]');
    const spans = label?.querySelectorAll("span") ?? [];
    expect(spans.length).toBe(2); // 百分比 + token 数
    unmount();
  });

  it("aria-valuenow 反映当前使用百分比", () => {
    const { container, unmount } = renderBar({
      usage: makeSnapshot({ usedTokens: 7500, maxTokens: 10000 }), // 75%
    });
    const bar = container.querySelector('[data-testid="context-window-bar"]') as HTMLElement;
    expect(bar.getAttribute("aria-valuenow")).toBe("75");
    expect(bar.getAttribute("role")).toBe("meter");
    unmount();
  });
});
