/**
 * @file LRUCache 属性化测试
 *
 * 使用 fast-check 对 LRU 缓存的关键不变量进行随机化验证：
 * 1. **容量不变量**：缓存条目数永远不超过 maxEntries
 * 2. **内存不变量**：缓存总内存永远不超过 maxMemoryBytes
 * 3. **最近性不变量**：被访问过的 key 在淘汰序列中排在未访问的 key 之后
 * 4. **更新不变量**：覆盖 set 已存在 key 时，旧值被原子替换（无残留）
 * 5. **clear 不变量**：clear 后所有 key 都不存在
 * 6. **包含不变量**：已 set 的 key 在无淘汰时一定可 get
 *
 * 互联网大厂基线：核心数据结构必须有 property-based 兜底，
 * 避免 example-based 漏掉的边界。
 */
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { LRUCache } from "./lruCache";

interface Op {
  kind: "set" | "get" | "clear";
  key?: string;
  value?: string;
  size?: number;
}

const opArb = (keyspace: number, valueMaxLen: number, sizeMax: number) =>
  fc.oneof(
    fc.record({
      kind: fc.constant("set" as const),
      key: fc.integer({ min: 0, max: keyspace - 1 }).map((n) => `k${n}`),
      value: fc.string({ maxLength: valueMaxLen }),
      size: fc.integer({ min: 1, max: sizeMax }),
    }),
    fc.record({
      kind: fc.constant("get" as const),
      key: fc.integer({ min: 0, max: keyspace - 1 }).map((n) => `k${n}`),
    }),
    fc.record({ kind: fc.constant("clear" as const) }),
  );

describe("LRUCache property-based", () => {
  it("容量不变量：cache size 永远 <= maxEntries", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        fc.integer({ min: 1, max: 1024 }),
        fc.array(opArb(8, 4, 32), { minLength: 0, maxLength: 60 }),
        (maxEntries, maxMemory, ops) => {
          const cache = new LRUCache<string>(maxEntries, maxMemory);
          for (const op of ops) {
            if (op.kind === "set") {
              cache.set(op.key!, op.value!, op.size!);
              expect(cache["cache"].size).toBeLessThanOrEqual(maxEntries);
            } else if (op.kind === "clear") {
              cache.clear();
              expect(cache["cache"].size).toBe(0);
            }
          }
        },
      ),
      { numRuns: 50 },
    );
  });

  it("内存不变量：totalSize 永远 <= maxMemoryBytes（不超额）", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 50, max: 200 }),
        fc.array(opArb(6, 4, 16), { minLength: 0, maxLength: 30 }),
        (maxMemory, ops) => {
          const cache = new LRUCache<string>(1000, maxMemory);
          for (const op of ops) {
            if (op.kind === "set") {
              cache.set(op.key!, op.value!, op.size!);
              // 内部 totalSize 字段不应超过 maxMemory（仅在 set 时校验）
              expect(cache["totalSize"]).toBeLessThanOrEqual(maxMemory);
            }
          }
        },
      ),
      { numRuns: 50 },
    );
  });

  it("更新不变量：覆盖已存在 key 后，totalSize 不应包含旧 size", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        fc.integer({ min: 1, max: 30 }),
        fc.integer({ min: 1, max: 30 }),
        (size1, size2, size3) => {
          const cache = new LRUCache<string>(10, 1000);
          cache.set("k", "v1", size1);
          expect(cache["totalSize"]).toBe(size1);
          cache.set("k", "v2", size2);
          // 覆盖后总大小应只剩 size2
          expect(cache["totalSize"]).toBe(size2);
          expect(cache.get("k")).toBe("v2");
          // 再覆盖一次
          cache.set("k", "v3", size3);
          expect(cache["totalSize"]).toBe(size3);
          expect(cache.get("k")).toBe("v3");
        },
      ),
      { numRuns: 50 },
    );
  });

  it("get 不变量：get 已 set 的 key（未被淘汰）应返回原值", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            key: fc.string({ minLength: 1, maxLength: 10 }),
            value: fc.string({ maxLength: 8 }),
            size: fc.integer({ min: 1, max: 4 }),
          }),
          { minLength: 1, maxLength: 5 },
        ),
        (entries) => {
          // 用足够大的容量，确保不发生淘汰
          const cache = new LRUCache<string>(1000, 10000);
          for (const e of entries) {
            cache.set(e.key, e.value, e.size);
          }
          // 同一 key 多次 set 时,缓存中保留的是最后一个 value
          // 按"最后一次出现的 key→value"展开期望,避免 set 覆盖后用旧 value 断言
          const latestByKey = new Map<string, string>();
          for (const e of entries) {
            latestByKey.set(e.key, e.value);
          }
          for (const [key, value] of latestByKey) {
            expect(cache.get(key)).toBe(value);
          }
        },
      ),
      { numRuns: 50 },
    );
  });

  it("clear 不变量：clear 后所有先前 set 的 key 都返回 null", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            key: fc.string({ minLength: 1, maxLength: 8 }),
            value: fc.string({ maxLength: 6 }),
            size: fc.integer({ min: 1, max: 8 }),
          }),
          { minLength: 1, maxLength: 10 },
        ),
        (entries) => {
          const cache = new LRUCache<string>(100, 1000);
          for (const e of entries) {
            cache.set(e.key, e.value, e.size);
          }
          cache.clear();
          for (const e of entries) {
            expect(cache.get(e.key)).toBeNull();
          }
          expect(cache["totalSize"]).toBe(0);
        },
      ),
      { numRuns: 50 },
    );
  });

  it("最近性不变量：get 提升 key 后，插入新 key 不会淘汰刚访问的 key", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 6 }), {
          minLength: 3,
          maxLength: 6,
        }),
        (keys) => {
          // 容量恰好 2：先 set k0,k1，再 get k0（提升），再 set k2 -> 应淘汰 k1
          const cache = new LRUCache<string>(2, 1000);
          cache.set(keys[0], "v0", 1);
          cache.set(keys[1], "v1", 1);
          // 此时 keys[0] 是最旧，keys[1] 是最新
          expect(cache.get(keys[0])).toBe("v0"); // 提升 keys[0] 到最新
          cache.set(keys[2], "v2", 1);
          // keys[0] 不应被淘汰
          expect(cache.get(keys[0])).toBe("v0");
          // keys[1] 应被淘汰
          expect(cache.get(keys[1])).toBeNull();
        },
      ),
      { numRuns: 30 },
    );
  });
});
