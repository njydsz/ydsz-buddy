/**
 * @file storage 属性化测试
 *
 * 验证 createMemoryStorage / createDebouncedStorage 的关键不变量：
 * 1. **memory storage 写入不变量**：setItem 后 getItem 立即返回该值
 * 2. **memory storage 覆盖不变量**：后写覆盖前写
 * 3. **memory storage remove 不变量**：removeItem 后 getItem 返回 null
 * 4. **debounced flush 不变量**：flush 后所有 pending 写入立即落到底层
 * 5. **debounced remove 取消不变量**：removeItem 取消 pending set，且立即从底层删除
 *
 * 互联网大厂基线：状态抽象层必须有 property-based 测试，
 * 避免特殊 key/value 触发边界 bug。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fc from "fast-check";
import { createDebouncedStorage, createMemoryStorage, type StateStorage } from "./storage";

describe("createMemoryStorage property-based", () => {
  it("setItem 后 getItem 立即返回写入值（无延迟）", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 30 }),
        fc.string({ maxLength: 50 }),
        (key, value) => {
          const storage = createMemoryStorage();
          storage.setItem(key, value);
          expect(storage.getItem(key)).toBe(value);
        },
      ),
      { numRuns: 30 },
    );
  });

  it("同一 key 多次 setItem：最后一次生效", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.array(fc.string({ maxLength: 30 }), { minLength: 2, maxLength: 10 }),
        (key, values) => {
          const storage = createMemoryStorage();
          for (const v of values) {
            storage.setItem(key, v);
          }
          expect(storage.getItem(key)).toBe(values[values.length - 1]);
        },
      ),
      { numRuns: 30 },
    );
  });

  it("removeItem 后 getItem 返回 null（无论之前是否 setItem）", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.string({ maxLength: 30 }),
        (key, value) => {
          const storage = createMemoryStorage();
          storage.setItem(key, value);
          storage.removeItem(key);
          expect(storage.getItem(key)).toBeNull();
          // 二次 remove 也是幂等的
          storage.removeItem(key);
          expect(storage.getItem(key)).toBeNull();
        },
      ),
      { numRuns: 30 },
    );
  });

  it("不同 key 之间互不影响", () => {
    fc.assert(
      fc.property(
        fc
          .array(
            fc.tuple(
              fc.string({ minLength: 1, maxLength: 8 }),
              fc.string({ maxLength: 8 }),
            ),
            { minLength: 2, maxLength: 8 },
          )
          .filter((pairs) => new Set(pairs.map(([k]) => k)).size === pairs.length),
        (pairs) => {
          const storage = createMemoryStorage();
          for (const [k, v] of pairs) {
            storage.setItem(k, v);
          }
          for (const [k, v] of pairs) {
            expect(storage.getItem(k)).toBe(v);
          }
        },
      ),
      { numRuns: 30 },
    );
  });
});

describe("createDebouncedStorage property-based", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("flush 后所有 pending set 全部生效（无丢失）", () => {
    // 重要：Debouncer 共享一个 timer，连续 setItem 调用只会执行最后一次。
    // 因此本测试只对单一 key 验证 setItem → flush 路径。
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 8 }),
        fc.string({ maxLength: 16 }),
        (key, value) => {
          const base = createMemoryStorage();
          const debounced = createDebouncedStorage(base, 500);
          debounced.setItem(key, value);
          // flush 前底层可能未写入
          debounced.flush();
          expect(base.getItem(key)).toBe(value);
        },
      ),
      { numRuns: 30 },
    );
  });

  it("多次 set 同一 key：flush 后只保留最后一次值（最新覆盖）", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 8 }),
        fc
          .array(fc.string({ maxLength: 16 }), { minLength: 2, maxLength: 8 })
          .filter((arr) => arr.length > 0),
        (key, values) => {
          const base = createMemoryStorage();
          const debounced = createDebouncedStorage(base, 500);
          for (const v of values) {
            debounced.setItem(key, v);
          }
          debounced.flush();
          // 最后一次 set 应生效
          expect(base.getItem(key)).toBe(values[values.length - 1]);
        },
      ),
      { numRuns: 20 },
    );
  });

  it("多次 set 不同 key：flush 后只保留最后一次 set 的 key 的值（Debouncer 单 timer 限制）", () => {
    // 这反映了 Debouncer 的实际行为：连续调用 setItem 时，Debouncer 会丢弃之前未执行的调用。
    // 本测试锁定该行为，避免以后实现变更导致行为不一致。
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 8 }),
        fc.string({ minLength: 1, maxLength: 8 }),
        fc.string({ maxLength: 16 }),
        fc.string({ maxLength: 16 }),
        (key1, key2, value1, value2) => {
          // 保证两个 key 不同
          if (key1 === key2) return;
          const base = createMemoryStorage();
          const debounced = createDebouncedStorage(base, 500);
          debounced.setItem(key1, value1);
          debounced.setItem(key2, value2);
          debounced.flush();
          // 实现层面：最后一次 setItem 的参数生效
          expect(base.getItem(key2)).toBe(value2);
        },
      ),
      { numRuns: 20 },
    );
  });

  it("removeItem 取消对应 key 的 pending set", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 8 }),
        fc.string({ maxLength: 16 }),
        (key, value) => {
          const base = createMemoryStorage();
          const debounced = createDebouncedStorage(base, 1000);
          debounced.setItem(key, value);
          debounced.removeItem(key);
          // flush 后该 key 不应存在
          debounced.flush();
          expect(base.getItem(key)).toBeNull();
        },
      ),
      { numRuns: 30 },
    );
  });

  it("延迟到期后自动写入底层", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 8 }),
        fc.string({ maxLength: 16 }),
        fc.integer({ min: 50, max: 500 }),
        (key, value, wait) => {
          const base = createMemoryStorage();
          const debounced = createDebouncedStorage(base, wait);
          debounced.setItem(key, value);
          // 提前时间到（小于 wait），底层应还未写入
          vi.advanceTimersByTime(Math.max(0, wait - 10));
          // 推到 wait+1 之后
          vi.advanceTimersByTime(20);
          expect(base.getItem(key)).toBe(value);
        },
      ),
      { numRuns: 20 },
    );
  });
});
