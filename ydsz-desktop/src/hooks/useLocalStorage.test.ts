//! # useLocalStorage Hook 单元测试
//!
//! 覆盖目标：
//! - 工具函数：`jsonCodec` / `getLocalStorageItem` / `setLocalStorageItem` / `removeLocalStorageItem`
//! - Hook 行为：初始值读取 / setValue 持久化 / 跨标签页 storage 事件同步 / 同标签页自定义事件同步 / key 变化时重新同步

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

import {
  getLocalStorageItem,
  jsonCodec,
  removeLocalStorageItem,
  setLocalStorageItem,
  useLocalStorage,
} from "./useLocalStorage";

const KEY = "test:useLocalStorage";

// ──────────────────────────────────────────────────────────────────────────────
// 工具函数
// ──────────────────────────────────────────────────────────────────────────────

describe("jsonCodec", () => {
  it("encode: 对象 → JSON 字符串", () => {
    const codec = jsonCodec<{ a: number }>();
    expect(codec.encode({ a: 1 })).toBe('{"a":1}');
  });

  it("decode: JSON 字符串 → 对象", () => {
    const codec = jsonCodec<{ a: number }>();
    expect(codec.decode('{"a":1}')).toEqual({ a: 1 });
  });

  it("decode: 数组 / 字符串 / 数字", () => {
    const codec = jsonCodec<unknown>();
    expect(codec.decode("[1,2,3]")).toEqual([1, 2, 3]);
    expect(codec.decode('"hi"')).toBe("hi");
    expect(codec.decode("42")).toBe(42);
  });
});

describe("getLocalStorageItem / setLocalStorageItem / removeLocalStorageItem", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("set + get 往返", () => {
    setLocalStorageItem(KEY, { foo: "bar" });
    expect(getLocalStorageItem<{ foo: string }>(KEY)).toEqual({ foo: "bar" });
  });

  it("get 不存在 key → null", () => {
    expect(getLocalStorageItem(KEY)).toBeNull();
  });

  it("set 后 remove → null", () => {
    setLocalStorageItem(KEY, "x");
    expect(getLocalStorageItem(KEY)).toBe("x");
    removeLocalStorageItem(KEY);
    expect(getLocalStorageItem(KEY)).toBeNull();
  });

  it("get 非法 JSON → null（不抛错）", () => {
    localStorage.setItem(KEY, "not json{");
    expect(getLocalStorageItem(KEY)).toBeNull();
  });

  it("set 字符串值（原始字符串）", () => {
    setLocalStorageItem(KEY, "raw-string");
    // JSON.parse('"raw-string"') === 'raw-string'
    expect(getLocalStorageItem(KEY)).toBe("raw-string");
  });

  it("set 数字", () => {
    setLocalStorageItem(KEY, 42);
    expect(getLocalStorageItem(KEY)).toBe(42);
  });

  it("set 布尔", () => {
    setLocalStorageItem(KEY, true);
    expect(getLocalStorageItem(KEY)).toBe(true);
  });

  it("set 数组", () => {
    setLocalStorageItem(KEY, [1, 2, 3]);
    expect(getLocalStorageItem<number[]>(KEY)).toEqual([1, 2, 3]);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Hook 行为
// ──────────────────────────────────────────────────────────────────────────────

describe("useLocalStorage Hook", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("初始值：localStorage 空时使用 initialValue", () => {
    const { result } = renderHook(() => useLocalStorage<number>(KEY, 0));
    expect(result.current[0]).toBe(0);
  });

  it("初始值：localStorage 已有值时使用存储值", () => {
    setLocalStorageItem(KEY, 100);
    const { result } = renderHook(() => useLocalStorage<number>(KEY, 0));
    expect(result.current[0]).toBe(100);
  });

  it("setValue 持久化到 localStorage", () => {
    const { result } = renderHook(() => useLocalStorage<string>(KEY, "init"));
    act(() => {
      result.current[1]("new value");
    });
    expect(result.current[0]).toBe("new value");
    expect(getLocalStorageItem<string>(KEY)).toBe("new value");
  });

  it("setValue 支持函数式更新", () => {
    const { result } = renderHook(() => useLocalStorage<number>(KEY, 1));
    act(() => {
      result.current[1]((prev) => prev + 10);
    });
    expect(result.current[0]).toBe(11);
  });

  it("setValue(null) 移除 localStorage 项", () => {
    setLocalStorageItem(KEY, "exists");
    const { result } = renderHook(() => useLocalStorage<string | null>(KEY, "init"));
    expect(result.current[0]).toBe("exists");
    act(() => {
      result.current[1](null);
    });
    expect(result.current[0]).toBeNull();
    expect(getLocalStorageItem(KEY)).toBeNull();
  });

  it("同标签页自定义事件：组件 B 感知组件 A 的 setValue", async () => {
    const { result: hookA } = renderHook(() => useLocalStorage<number>(KEY, 0));
    const { result: hookB } = renderHook(() => useLocalStorage<number>(KEY, 0));

    expect(hookB.current[0]).toBe(0);
    act(() => {
      hookA.current[1](99);
    });
    // 同标签页：派发 custom event，hookB 应在 useEffect 监听中更新
    await act(async () => {
      // 等待 microtask + listener
      await Promise.resolve();
    });
    expect(hookB.current[0]).toBe(99);
  });

  it("key 变化时重新从 localStorage 同步", () => {
    setLocalStorageItem("key-a", "value-a");
    setLocalStorageItem("key-b", "value-b");
    const { result, rerender } = renderHook(
      ({ k }: { k: string }) => useLocalStorage<string>(k, "default"),
      { initialProps: { k: "key-a" } },
    );
    expect(result.current[0]).toBe("value-a");
    rerender({ k: "key-b" });
    expect(result.current[0]).toBe("value-b");
  });

  it("跨标签页 storage 事件：模拟外部 storage 事件触发同步", () => {
    const { result } = renderHook(() => useLocalStorage<string>(KEY, "init"));
    expect(result.current[0]).toBe("init");

    // 模拟另一个标签页 setItem
    act(() => {
      localStorage.setItem(KEY, JSON.stringify("from-other-tab"));
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: KEY,
          newValue: JSON.stringify("from-other-tab"),
        }),
      );
    });
    expect(result.current[0]).toBe("from-other-tab");
  });

  it("跨标签页 storage 事件：其他 key 不应触发同步", () => {
    const { result } = renderHook(() => useLocalStorage<string>(KEY, "init"));
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "other-key",
          newValue: JSON.stringify("ignored"),
        }),
      );
    });
    expect(result.current[0]).toBe("init");
  });
});
