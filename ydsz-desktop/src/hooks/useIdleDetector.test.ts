/**
 * @file useIdleDetector Hook 单元测试
 *
 * 覆盖：
 * - 默认监听 6 种活动事件
 * - 自定义 events 生效
 * - paused=true 时不挂载 listener
 * - 卸载时清理 listener
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useIdleDetector } from "./useIdleDetector";

const originalAdd = window.addEventListener;
const originalRemove = window.removeEventListener;

let addSpy: ReturnType<typeof vi.spyOn>;
let removeSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  addSpy = vi.spyOn(window, "addEventListener");
  removeSpy = vi.spyOn(window, "removeEventListener");
});

afterEach(() => {
  addSpy.mockRestore();
  removeSpy.mockRestore();
  window.addEventListener = originalAdd;
  window.removeEventListener = originalRemove;
});

describe("useIdleDetector - 默认事件", () => {
  it("挂载时注册 mousemove / keydown / pointerdown / wheel / touchstart / click", () => {
    const onActivity = vi.fn();
    renderHook(() => useIdleDetector({ onActivity }));
    const registered = addSpy.mock.calls.map((c) => c[0]);
    expect(registered).toEqual(
      expect.arrayContaining([
        "mousemove",
        "keydown",
        "pointerdown",
        "wheel",
        "touchstart",
        "click",
      ]),
    );
  });
});

describe("useIdleDetector - 自定义事件", () => {
  it("events 字段覆盖默认列表", () => {
    const onActivity = vi.fn();
    renderHook(() =>
      useIdleDetector({ onActivity, events: ["mousemove", "keydown"] }),
    );
    const registered = addSpy.mock.calls.map((c) => c[0]);
    expect(registered).toContain("mousemove");
    expect(registered).toContain("keydown");
    expect(registered).not.toContain("click");
  });
});

describe("useIdleDetector - paused 行为", () => {
  it("paused=true 时不挂载 listener", () => {
    const onActivity = vi.fn();
    renderHook(() => useIdleDetector({ onActivity, paused: true }));
    expect(addSpy).not.toHaveBeenCalled();
  });

  it("paused 切到 false 时开始挂载", () => {
    const onActivity = vi.fn();
    const { rerender } = renderHook(
    ({ paused }: { paused: boolean }) =>
      useIdleDetector({ onActivity, paused }),
    { initialProps: { paused: true } },
  );
    expect(addSpy).not.toHaveBeenCalled();
    rerender({ paused: false });
    expect(addSpy).toHaveBeenCalled();
  });
});

describe("useIdleDetector - 事件回调", () => {
  it("mousemove 触发 onActivity", () => {
    const onActivity = vi.fn();
    renderHook(() => useIdleDetector({ onActivity }));
    window.dispatchEvent(new Event("mousemove"));
    window.dispatchEvent(new Event("keydown"));
    expect(onActivity).toHaveBeenCalledWith("mousemove");
    expect(onActivity).toHaveBeenCalledWith("keydown");
    expect(onActivity).toHaveBeenCalledTimes(2);
  });
});

describe("useIdleDetector - 清理", () => {
  it("卸载时移除所有 listener", () => {
    const onActivity = vi.fn();
    const { unmount } = renderHook(() => useIdleDetector({ onActivity }));
    const beforeRemoveCount = removeSpy.mock.calls.length;
    unmount();
    const afterRemoveCount = removeSpy.mock.calls.length;
    expect(afterRemoveCount - beforeRemoveCount).toBeGreaterThanOrEqual(6);
  });
});
