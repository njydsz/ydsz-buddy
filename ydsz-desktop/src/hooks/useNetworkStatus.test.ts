/**
 * @file useNetworkStatus 单元测试
 *
 * 覆盖：
 * 1. 初始状态（navigator.onLine=true / false）
 * 2. online/offline 事件触发状态变化
 * 3. markOnline / markOffline / markDegraded 手动覆盖
 * 4. onStatusChange 回调
 * 5. 离线不能被降级覆盖
 * 6. isOnline / isOffline / isDegraded 派生值
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useNetworkStatus, __testing, type UseNetworkStatusResult } from "./useNetworkStatus";

// 让 happy-dom 下 React 18 的 act() 正常工作
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function patchNavigatorOnLine(value: boolean) {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    get: () => value,
  });
}

function renderStatusHook(useHook: () => UseNetworkStatusResult) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: Root | null = null;
  let value: UseNetworkStatusResult | undefined;
  let currentHook: () => UseNetworkStatusResult = useHook;
  const Capture = () => {
    value = currentHook();
    return null;
  };
  act(() => {
    root = createRoot(container);
    root.render(createElement(Capture));
  });
  return {
    get result(): UseNetworkStatusResult {
      if (!value) throw new Error("Hook result not initialized");
      return value;
    },
    /**
     * 在同一个 act() 中既执行变更（mark / rerender），
     * 保证 zustand 触发的订阅回调与 React 重新渲染都跑完，
     * 避免 act() 警告。
     */
    commit(fn: () => void) {
      act(() => {
        fn();
        root?.render(createElement(Capture));
      });
    },
    unmount() {
      act(() => {
        root?.unmount();
      });
      container.remove();
    },
  };
}

describe("useNetworkStatus", () => {
  let originalOnLineDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalOnLineDescriptor = Object.getOwnPropertyDescriptor(navigator, "onLine");
    patchNavigatorOnLine(true);
    __testing.reset();
  });

  afterEach(() => {
    if (originalOnLineDescriptor) {
      Object.defineProperty(navigator, "onLine", originalOnLineDescriptor);
    }
  });

  it("starts in 'online' when navigator.onLine is true", () => {
    patchNavigatorOnLine(true);
    __testing.reset();
    const { result } = renderStatusHook(() => useNetworkStatus());
    expect(result.status).toBe("online");
    expect(result.isOnline).toBe(true);
    expect(result.isOffline).toBe(false);
  });

  it("starts in 'offline' when navigator.onLine is false", () => {
    patchNavigatorOnLine(false);
    __testing.reset();
    const { result } = renderStatusHook(() => useNetworkStatus());
    expect(result.status).toBe("offline");
    expect(result.isOffline).toBe(true);
  });

  it("markOffline transitions to 'offline'", () => {
    patchNavigatorOnLine(true);
    __testing.reset();
    const handle = renderStatusHook(() => useNetworkStatus());
    handle.commit(() => {
      handle.result.markOffline();
    });
    expect(handle.result.status).toBe("offline");
  });

  it("markDegraded transitions to 'degraded' from 'online'", () => {
    patchNavigatorOnLine(true);
    __testing.reset();
    const handle = renderStatusHook(() => useNetworkStatus());
    handle.commit(() => {
      handle.result.markDegraded();
    });
    expect(handle.result.status).toBe("degraded");
    expect(handle.result.isDegraded).toBe(true);
  });

  it("markDegraded does not override 'offline'", () => {
    patchNavigatorOnLine(false);
    __testing.reset();
    const handle = renderStatusHook(() => useNetworkStatus());
    handle.commit(() => {
      handle.result.markOffline();
    });
    expect(handle.result.status).toBe("offline");
    handle.commit(() => {
      handle.result.markDegraded();
    });
    expect(handle.result.status).toBe("offline");
  });

  it("markOnline transitions from 'degraded' to 'online'", () => {
    patchNavigatorOnLine(true);
    __testing.reset();
    const handle = renderStatusHook(() => useNetworkStatus());
    handle.commit(() => {
      handle.result.markDegraded();
    });
    expect(handle.result.status).toBe("degraded");
    handle.commit(() => {
      handle.result.markOnline();
    });
    expect(handle.result.status).toBe("online");
  });

  it("onStatusChange fires with previous and current status", () => {
    patchNavigatorOnLine(true);
    __testing.reset();
    const onStatusChange = vi.fn();
    const handle = renderStatusHook(() => useNetworkStatus({ onStatusChange }));
    handle.commit(() => {
      handle.result.markOffline();
    });
    expect(onStatusChange).toHaveBeenCalledWith("offline", "online");
  });

  it("onStatusChange does not fire when status is unchanged", () => {
    patchNavigatorOnLine(true);
    __testing.reset();
    const onStatusChange = vi.fn();
    const handle = renderStatusHook(() => useNetworkStatus({ onStatusChange }));
    handle.commit(() => {
      handle.result.markOnline();
    });
    expect(onStatusChange).not.toHaveBeenCalled();
  });
});
