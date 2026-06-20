/**
 * @file LRUCache 测试
 *
 * 验证 LRU 缓存的 get/set/clear、按条目数淘汰、按内存字节淘汰
 * 以及访问时提升优先级的行为。
 */

import { describe, expect, it } from "vitest";

import { LRUCache } from "./lruCache";

describe("LRUCache", () => {
  it("returns null for missing keys", () => {
    const cache = new LRUCache<string>(10, 1024);
    expect(cache.get("nope")).toBeNull();
  });

  it("stores and retrieves values", () => {
    const cache = new LRUCache<string>(10, 1024);
    cache.set("a", "value-a", 10);
    expect(cache.get("a")).toBe("value-a");
  });

  it("clear removes all entries", () => {
    const cache = new LRUCache<string>(10, 1024);
    cache.set("a", "A", 1);
    cache.set("b", "B", 1);
    cache.clear();
    expect(cache.get("a")).toBeNull();
    expect(cache.get("b")).toBeNull();
  });

  it("evicts the oldest entry when maxEntries is exceeded", () => {
    const cache = new LRUCache<string>(2, 1024);
    cache.set("a", "A", 1);
    cache.set("b", "B", 1);
    cache.set("c", "C", 1);
    expect(cache.get("a")).toBeNull();
    expect(cache.get("b")).toBe("B");
    expect(cache.get("c")).toBe("C");
  });

  it("get promotes an entry to most recent", () => {
    const cache = new LRUCache<string>(2, 1024);
    cache.set("a", "A", 1);
    cache.set("b", "B", 1);
    // 访问 a 使其变为最新
    expect(cache.get("a")).toBe("A");
    // 再次插入 c 应淘汰 b（最旧）
    cache.set("c", "C", 1);
    expect(cache.get("b")).toBeNull();
    expect(cache.get("a")).toBe("A");
  });

  it("evicts entries to stay within maxMemoryBytes", () => {
    const cache = new LRUCache<string>(100, 10);
    cache.set("a", "A", 4);
    cache.set("b", "B", 4);
    // 第三个条目总大小 12 > 10，应淘汰最旧
    cache.set("c", "C", 4);
    expect(cache.get("a")).toBeNull();
    expect(cache.get("b")).toBe("B");
    expect(cache.get("c")).toBe("C");
  });

  it("updating an existing key replaces its size", () => {
    const cache = new LRUCache<string>(10, 100);
    cache.set("a", "A", 50);
    cache.set("a", "AA", 1);
    // 总大小应回落到 1
    cache.set("b", "B", 50);
    // 两次 set 总计 51, < 100，不应淘汰
    expect(cache.get("a")).toBe("AA");
    expect(cache.get("b")).toBe("B");
  });
});
