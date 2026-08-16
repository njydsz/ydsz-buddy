/**
 * @file FontSizeSlider 测试
 * @description 验证 W5-D-10 任务：高对比度主题配套 - 字号 80%-150% 滑块
 *   - 范围合法（80% - 150%，步长 5%）
 *   - 规范化到合法范围
 *   - DOM CSS 变量更新
 *   - 键盘导航
 *   - 持久化
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  FontSizeSlider,
  FONT_SIZE_PERCENT_DEFAULT,
  FONT_SIZE_PERCENT_MAX,
  FONT_SIZE_PERCENT_MIN,
  FONT_SIZE_PERCENT_STORAGE_KEY,
  applyFontSizePercentToDom,
  normalizeFontSizePercent,
} from "./FontSizeSlider";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function dispatchInputEvent(element: HTMLInputElement, value: string): void {
  // 设置 value 并派发 input + change 事件
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function dispatchKeyEvent(element: HTMLElement, key: string): void {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
  });
  element.dispatchEvent(event);
}

function renderSlider(props: {
  percent?: number;
  onChange?: (v: number) => void;
  onReset?: () => void;
}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: Root | null = null;
  let captured = { percent: props.percent ?? 100, onChange: props.onChange, onReset: props.onReset };

  function TestComponent() {
    return createElement(FontSizeSlider, {
      percent: captured.percent,
      onChange: (v: number) => {
        captured.percent = v;
        captured.onChange?.(v);
      },
      onReset: captured.onReset,
    });
  }

  act(() => {
    root = createRoot(container);
    root.render(createElement(TestComponent));
  });

  return {
    container,
    getPercent: () => captured.percent,
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
  document.documentElement.removeAttribute("data-font-size-percent");
  document.documentElement.style.removeProperty("--app-font-size-percent");
});

afterEach(() => {
  localStorage.clear();
});

describe("W5-D-10 FontSizeSlider - 范围与规范化", () => {
  it("默认值 100%", () => {
    expect(FONT_SIZE_PERCENT_DEFAULT).toBe(100);
    expect(FONT_SIZE_PERCENT_MIN).toBe(80);
    expect(FONT_SIZE_PERCENT_MAX).toBe(150);
  });

  it("normalizeFontSizePercent 把超界值裁剪到合法范围", () => {
    expect(normalizeFontSizePercent(50)).toBe(80);
    expect(normalizeFontSizePercent(200)).toBe(150);
    expect(normalizeFontSizePercent(100)).toBe(100);
  });

  it("normalizeFontSizePercent 吸附到 5% 步长", () => {
    expect(normalizeFontSizePercent(103)).toBe(105);
    expect(normalizeFontSizePercent(107)).toBe(105);
    expect(normalizeFontSizePercent(108)).toBe(110);
  });

  it("normalizeFontSizePercent 处理非法值", () => {
    // "abc" → NaN → 默认 100
    expect(normalizeFontSizePercent("abc")).toBe(100);
    // undefined → NaN → 默认 100
    expect(normalizeFontSizePercent(undefined)).toBe(100);
    // NaN → 默认 100
    expect(normalizeFontSizePercent(NaN)).toBe(100);
    // null → 0 → 裁剪到 80
    expect(normalizeFontSizePercent(null)).toBe(80);
    // 空字符串 → 0 → 裁剪到 80
    expect(normalizeFontSizePercent("")).toBe(80);
  });
});

describe("W5-D-10 FontSizeSlider - DOM 同步", () => {
  it("applyFontSizePercentToDom 设置 CSS 变量和 data 属性", () => {
    applyFontSizePercentToDom(120);
    expect(document.documentElement.style.getPropertyValue("--app-font-size-percent")).toBe(
      "120%",
    );
    expect(document.documentElement.getAttribute("data-font-size-percent")).toBe("120");
  });

  it("applyFontSizePercentToDom 裁剪非法值", () => {
    applyFontSizePercentToDom(300);
    expect(document.documentElement.style.getPropertyValue("--app-font-size-percent")).toBe(
      "150%",
    );
  });
});

describe("W5-D-10 FontSizeSlider - 组件渲染", () => {
  it("渲染滑块并显示当前百分比", () => {
    const { container, unmount } = renderSlider({ percent: 110 });
    const slider = container.querySelector('[data-testid="font-size-slider"]') as HTMLInputElement;
    expect(slider).toBeTruthy();
    expect(slider?.value).toBe("110");
    expect(container.textContent).toContain("110%");
    unmount();
  });

  it("滑块 min/max 属性正确", () => {
    const { container, unmount } = renderSlider({ percent: 100 });
    const slider = container.querySelector('[data-testid="font-size-slider"]') as HTMLInputElement;
    expect(slider?.min).toBe("80");
    expect(slider?.max).toBe("150");
    expect(slider?.step).toBe("5");
    unmount();
  });

  it("默认百分比时（100%）不显示重置按钮", () => {
    const onReset = vi.fn();
    const { container, unmount } = renderSlider({ percent: 100, onReset });
    const resetBtn = container.querySelector('button[aria-label*="重置"]');
    expect(resetBtn).toBeFalsy();
    unmount();
  });

  it("非默认百分比时显示重置按钮", () => {
    const onReset = vi.fn();
    const { container, unmount } = renderSlider({ percent: 120, onReset });
    const resetBtn = container.querySelector('button[aria-label*="重置"]');
    expect(resetBtn).toBeTruthy();
    unmount();
  });
});

describe("W5-D-10 FontSizeSlider - 交互", () => {
  it("拖动滑块触发 onChange", () => {
    const onChange = vi.fn();
    const { container, getPercent, unmount } = renderSlider({ percent: 100, onChange });
    const slider = container.querySelector('[data-testid="font-size-slider"]') as HTMLInputElement;

    act(() => {
      dispatchInputEvent(slider, "125");
    });

    expect(onChange).toHaveBeenCalledWith(125);
    expect(getPercent()).toBe(125);
    unmount();
  });

  it("点击重置按钮触发 onReset", () => {
    const onReset = vi.fn();
    const { container, unmount } = renderSlider({ percent: 130, onReset });
    const resetBtn = container.querySelector('button[aria-label*="重置"]') as HTMLButtonElement;
    if (resetBtn) {
      act(() => {
        resetBtn.click();
      });
    }
    expect(onReset).toHaveBeenCalledTimes(1);
    unmount();
  });
});

describe("W5-D-10 FontSizeSlider - 键盘导航", () => {
  it("ArrowRight 增加 5%", () => {
    const onChange = vi.fn();
    const { container, unmount } = renderSlider({ percent: 100, onChange });
    const slider = container.querySelector('[data-testid="font-size-slider"]') as HTMLElement;

    act(() => {
      dispatchKeyEvent(slider, "ArrowRight");
    });

    expect(onChange).toHaveBeenCalledWith(105);
    unmount();
  });

  it("ArrowLeft 减少 5%", () => {
    const onChange = vi.fn();
    const { container, unmount } = renderSlider({ percent: 100, onChange });
    const slider = container.querySelector('[data-testid="font-size-slider"]') as HTMLElement;

    act(() => {
      dispatchKeyEvent(slider, "ArrowLeft");
    });

    expect(onChange).toHaveBeenCalledWith(95);
    unmount();
  });

  it("PageUp 增加 10%", () => {
    const onChange = vi.fn();
    const { container, unmount } = renderSlider({ percent: 100, onChange });
    const slider = container.querySelector('[data-testid="font-size-slider"]') as HTMLElement;

    act(() => {
      dispatchKeyEvent(slider, "PageUp");
    });

    expect(onChange).toHaveBeenCalledWith(110);
    unmount();
  });

  it("Home 跳到最小值", () => {
    const onChange = vi.fn();
    const { container, unmount } = renderSlider({ percent: 100, onChange });
    const slider = container.querySelector('[data-testid="font-size-slider"]') as HTMLElement;

    act(() => {
      dispatchKeyEvent(slider, "Home");
    });

    expect(onChange).toHaveBeenCalledWith(80);
    unmount();
  });

  it("End 跳到最大值", () => {
    const onChange = vi.fn();
    const { container, unmount } = renderSlider({ percent: 100, onChange });
    const slider = container.querySelector('[data-testid="font-size-slider"]') as HTMLElement;

    act(() => {
      dispatchKeyEvent(slider, "End");
    });

    expect(onChange).toHaveBeenCalledWith(150);
    unmount();
  });

  it("键盘事件不会超过边界", () => {
    const onChange = vi.fn();
    const { container, unmount } = renderSlider({ percent: 150, onChange });
    const slider = container.querySelector('[data-testid="font-size-slider"]') as HTMLElement;

    act(() => {
      dispatchKeyEvent(slider, "ArrowRight");
    });

    expect(onChange).toHaveBeenCalledWith(150); // 不超过 150
    unmount();
  });
});

describe("W5-D-10 FontSizeSlider - 持久化", () => {
  it("从 localStorage 读取持久化的值", () => {
    localStorage.setItem(FONT_SIZE_PERCENT_STORAGE_KEY, JSON.stringify(130));
    // 重新读取
    const value = JSON.parse(localStorage.getItem(FONT_SIZE_PERCENT_STORAGE_KEY) ?? "null");
    expect(normalizeFontSizePercent(value)).toBe(130);
  });

  it("持久化时把值规范化到合法范围", () => {
    localStorage.setItem(FONT_SIZE_PERCENT_STORAGE_KEY, JSON.stringify(500));
    const value = JSON.parse(localStorage.getItem(FONT_SIZE_PERCENT_STORAGE_KEY) ?? "null");
    expect(normalizeFontSizePercent(value)).toBe(150);
  });
});

describe("W5-D-10 FontSizeSlider - a11y", () => {
  it("aria-valuenow 反映当前百分比", () => {
    const { container, unmount } = renderSlider({ percent: 115 });
    const slider = container.querySelector('[data-testid="font-size-slider"]') as HTMLInputElement;
    expect(slider?.getAttribute("aria-valuenow")).toBe("115");
    expect(slider?.getAttribute("aria-valuemin")).toBe("80");
    expect(slider?.getAttribute("aria-valuemax")).toBe("150");
    unmount();
  });

  it("百分比值区域有 aria-live", () => {
    const { container, unmount } = renderSlider({ percent: 100 });
    const valueSpan = container.querySelector('[data-testid="font-size-percent-value"]') as HTMLElement;
    expect(valueSpan?.getAttribute("aria-live")).toBe("polite");
    unmount();
  });
});
