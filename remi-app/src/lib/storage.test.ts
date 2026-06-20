/**
 * @file 内存与防抖存储测试
 *
 * 验证 createMemoryStorage 的基本行为以及 createDebouncedStorage
 * 的延迟写入语义。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDebouncedStorage, createMemoryStorage, type StateStorage } from "./storage";

describe("createMemoryStorage", () => {
  it("returns null for unknown keys", () => {
    const storage = createMemoryStorage();
    expect(storage.getItem("missing")).toBeNull();
  });

  it("stores and retrieves values", () => {
    const storage = createMemoryStorage();
    storage.setItem("k", "v");
    expect(storage.getItem("k")).toBe("v");
  });

  it("removes a key", () => {
    const storage = createMemoryStorage();
    storage.setItem("k", "v");
    storage.removeItem("k");
    expect(storage.getItem("k")).toBeNull();
  });

  it("overwrites an existing value", () => {
    const storage = createMemoryStorage();
    storage.setItem("k", "v1");
    storage.setItem("k", "v2");
    expect(storage.getItem("k")).toBe("v2");
  });
});

describe("createDebouncedStorage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("delays the underlying setItem", () => {
    const base: StateStorage = createMemoryStorage();
    const debounced = createDebouncedStorage(base, 200);
    debounced.setItem("k", "v");
    // 在延迟结束前，底层仍无值
    expect(base.getItem("k")).toBeNull();
    vi.advanceTimersByTime(250);
    expect(base.getItem("k")).toBe("v");
  });

  it("flush writes immediately", () => {
    const base: StateStorage = createMemoryStorage();
    const debounced = createDebouncedStorage(base, 1000);
    debounced.setItem("k", "v");
    debounced.flush();
    expect(base.getItem("k")).toBe("v");
  });

  it("removeItem cancels pending writes and removes immediately", () => {
    const base: StateStorage = createMemoryStorage();
    const debounced = createDebouncedStorage(base, 500);
    debounced.setItem("k", "v");
    debounced.removeItem("k");
    vi.advanceTimersByTime(1000);
    // 底层不应有 k，因为 removeItem 取消了待写入任务
    expect(base.getItem("k")).toBeNull();
  });

  it("getItem delegates to base storage", () => {
    const base: StateStorage = createMemoryStorage();
    base.setItem("k", "preset");
    const debounced = createDebouncedStorage(base, 100);
    expect(debounced.getItem("k")).toBe("preset");
  });
});
