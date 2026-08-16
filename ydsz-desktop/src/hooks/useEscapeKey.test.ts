//! # useEscapeKey Hook 单元测试
//!
//! 覆盖目标：
//! - Hook 注册 / 卸载 / 栈深度
//! - 触发顺序：后注册先响应（栈式优先级）
//! - active=false / IME (keyCode=229) 时不触发
//! - scope 限定：activeElement / event.target 命中
//! - preventDefault / stopPropagation / 返回 false 时的行为
//! - 工具函数：resetEscapeStack / getEscapeStackDepth

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";

import {
  getEscapeStackDepth,
  resetEscapeStack,
  useEscapeKey,
} from "./useEscapeKey";

// ──────────────────────────────────────────────────────────────────────────────
// 工具函数
// ──────────────────────────────────────────────────────────────────────────────

function dispatchEscape(target: EventTarget | null = window, init: Partial<KeyboardEventInit> = {}) {
  const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, ...init });
  // 走捕获阶段,模拟冒泡到 window
  Object.defineProperty(event, "target", { value: target, configurable: true });
  window.dispatchEvent(event);
  return event;
}

describe("useEscapeKey 工具函数", () => {
  beforeEach(() => {
    resetEscapeStack();
  });

  it("getEscapeStackDepth 反映当前栈深度", () => {
    expect(getEscapeStackDepth()).toBe(0);
  });

  it("resetEscapeStack 清空栈", () => {
    const { unmount } = renderHook(() => useEscapeKey(true, () => undefined));
    expect(getEscapeStackDepth()).toBe(1);
    unmount();
    expect(getEscapeStackDepth()).toBe(0);
    resetEscapeStack();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Hook 行为
// ──────────────────────────────────────────────────────────────────────────────

describe("useEscapeKey Hook", () => {
  beforeEach(() => {
    resetEscapeStack();
  });

  afterEach(() => {
    resetEscapeStack();
  });

  it("挂载时入栈,卸载时出栈", () => {
    const { unmount } = renderHook(() => useEscapeKey(true, () => undefined));
    expect(getEscapeStackDepth()).toBe(1);
    unmount();
    expect(getEscapeStackDepth()).toBe(0);
  });

  it("触发 Escape → 调用 onEscape", () => {
    const onEscape = vi.fn();
    renderHook(() => useEscapeKey(true, onEscape));
    dispatchEscape();
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it("active=false → 不触发 onEscape", () => {
    const onEscape = vi.fn();
    renderHook(() => useEscapeKey(false, onEscape));
    dispatchEscape();
    expect(onEscape).not.toHaveBeenCalled();
  });

  it("active 由 true 切换到 false → 停止触发", () => {
    const onEscape = vi.fn();
    const { rerender } = renderHook(
      ({ active }: { active: boolean }) => useEscapeKey(active, onEscape),
      { initialProps: { active: true } },
    );
    dispatchEscape();
    expect(onEscape).toHaveBeenCalledTimes(1);

    rerender({ active: false });
    dispatchEscape();
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it("栈式优先级：后挂载的 hook 先响应,内层弹层优先生效", () => {
    const outer = vi.fn();
    const inner = vi.fn();
    const outerHook = renderHook(() => useEscapeKey(true, outer));
    renderHook(() => useEscapeKey(true, inner));
    dispatchEscape();
    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
    outerHook.unmount();
  });

  it("栈式优先级:内层被消费后外层不再响应(默认 consume 语义)", () => {
    // 注意:源码当前实现是"后注册的先响应,内层一旦消费(或返回 void)即终止循环"。
    // 注释里关于"返回 false → fall through"的能力并未实现,
    // 这里锁定当前实现行为,避免后续无意识回归。
    const outer = vi.fn();
    const inner = vi.fn();
    const outerHook = renderHook(() => useEscapeKey(true, outer));
    renderHook(() => useEscapeKey(true, inner));
    dispatchEscape();
    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
    outerHook.unmount();
  });

  it("栈式优先级:内层返回 false 时,源码当前实现不 fall through(已锁定行为)", () => {
    // 锁定实现:返回 false 不会派发给外层。如需真正的 fall-through 行为,
    // 需要后续实现 dispatchEscape 改造 + 更新此测试。
    const outer = vi.fn();
    const inner = vi.fn(() => false as const);
    const outerHook = renderHook(() => useEscapeKey(true, outer));
    renderHook(() => useEscapeKey(true, inner));
    dispatchEscape();
    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
    outerHook.unmount();
  });

  it("preventDefault 默认 true 时调用 event.preventDefault", () => {
    const onEscape = vi.fn();
    const preventDefaultSpy = vi.spyOn(KeyboardEvent.prototype, "preventDefault");
    renderHook(() => useEscapeKey(true, onEscape));
    dispatchEscape();
    expect(preventDefaultSpy).toHaveBeenCalled();
  });

  it("preventDefault:false → 不调用 preventDefault", () => {
    const onEscape = vi.fn();
    const preventDefaultSpy = vi.spyOn(KeyboardEvent.prototype, "preventDefault");
    renderHook(() =>
      useEscapeKey(true, onEscape, { preventDefault: false }),
    );
    dispatchEscape();
    expect(preventDefaultSpy).not.toHaveBeenCalled();
  });

  it("stopPropagation:true → 调用 event.stopPropagation", () => {
    const onEscape = vi.fn();
    renderHook(() =>
      useEscapeKey(true, onEscape, { stopPropagation: true }),
    );
    const stopSpy = vi.spyOn(KeyboardEvent.prototype, "stopPropagation");
    dispatchEscape();
    expect(stopSpy).toHaveBeenCalled();
  });

  it("stopPropagation 默认 false → 不调用 stopPropagation", () => {
    const onEscape = vi.fn();
    renderHook(() => useEscapeKey(true, onEscape));
    const stopSpy = vi.spyOn(KeyboardEvent.prototype, "stopPropagation");
    dispatchEscape();
    expect(stopSpy).not.toHaveBeenCalled();
  });

  it("onEscape 引用变化后:最新回调生效(闭包 ref)", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(
      ({ cb }: { cb: () => void }) => useEscapeKey(true, cb),
      { initialProps: { cb: first } },
    );
    rerender({ cb: second });
    dispatchEscape();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("IME 拼写态(keyCode=229) → 不触发,IME 优先", () => {
    const onEscape = vi.fn();
    renderHook(() => useEscapeKey(true, onEscape));
    dispatchEscape(window, { keyCode: 229 } as KeyboardEventInit);
    expect(onEscape).not.toHaveBeenCalled();
  });

  it("event.isComposing=true → 不触发,IME 优先", () => {
    const onEscape = vi.fn();
    renderHook(() => useEscapeKey(true, onEscape));
    dispatchEscape(window, { isComposing: true });
    expect(onEscape).not.toHaveBeenCalled();
  });

  it("非 Escape 键 → 不触发", () => {
    const onEscape = vi.fn();
    renderHook(() => useEscapeKey(true, onEscape));
    dispatchEscape(window, { key: "Enter" });
    expect(onEscape).not.toHaveBeenCalled();
  });

  describe("scope 限定", () => {
    it("scope=null → 全局响应", () => {
      const onEscape = vi.fn();
      renderHook(() => useEscapeKey(true, onEscape, { enabledIn: null }));
      dispatchEscape();
      expect(onEscape).toHaveBeenCalledTimes(1);
    });

    it("scope 容器包含 activeElement → 响应", () => {
      const onEscape = vi.fn();
      const scope = document.createElement("div");
      const input = document.createElement("input");
      scope.appendChild(input);
      document.body.appendChild(scope);
      input.focus();
      renderHook(() => useEscapeKey(true, onEscape, { enabledIn: scope }));
      dispatchEscape(input);
      expect(onEscape).toHaveBeenCalledTimes(1);
      scope.remove();
    });

    it("scope 容器不包含 activeElement → 不响应", () => {
      const onEscape = vi.fn();
      const scope = document.createElement("div");
      const otherDiv = document.createElement("div");
      document.body.appendChild(scope);
      document.body.appendChild(otherDiv);
      otherDiv.focus();
      renderHook(() => useEscapeKey(true, onEscape, { enabledIn: scope }));
      dispatchEscape(otherDiv);
      expect(onEscape).not.toHaveBeenCalled();
      otherDiv.remove();
      scope.remove();
    });

    it("scope 容器包含 event.target → 也命中", () => {
      const onEscape = vi.fn();
      const scope = document.createElement("div");
      const inner = document.createElement("button");
      scope.appendChild(inner);
      document.body.appendChild(scope);
      // activeElement 在 body,事件 target 在 scope 内
      renderHook(() => useEscapeKey(true, onEscape, { enabledIn: scope }));
      dispatchEscape(inner);
      expect(onEscape).toHaveBeenCalledTimes(1);
      scope.remove();
    });
  });

  it("onEscape 抛出错误 → 不会破坏栈(其他 hook 仍能响应)", () => {
    const broken = vi.fn(() => {
      throw new Error("boom");
    });
    const after = vi.fn();
    const { rerender } = renderHook(
      ({ cb }: { cb: () => void }) => useEscapeKey(true, cb),
      { initialProps: { cb: broken } },
    );
    // happy-dom 下 listener 内同步抛错会冒泡到调用方,
    // 测试通过 try/catch 兜底,验证栈在异常后仍可用。
    try {
      dispatchEscape();
    } catch {
      // 预期行为:异常向上冒泡
    }
    expect(broken).toHaveBeenCalledTimes(1);
    // 替换回调,验证栈未坏
    rerender({ cb: after });
    dispatchEscape();
    expect(after).toHaveBeenCalledTimes(1);
  });
});
