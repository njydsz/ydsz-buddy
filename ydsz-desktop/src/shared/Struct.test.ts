/**
 * @file Struct.ts 单元测试
 *
 * 覆盖深度合并工具：
 * 1. deepMerge - 深度合并 base + patch
 * 2. 边界条件：undefined patch、嵌套对象、数组、非 plain 对象
 */

import { describe, expect, it } from "vitest";

import { deepMerge, type DeepPartial } from "./Struct";

describe("Struct", () => {
  describe("deepMerge", () => {
    it("合并基本字段", () => {
      const result = deepMerge({ a: 1, b: 2 } as { a: number; b: number }, { b: 3 });
      expect(result).toEqual({ a: 1, b: 3 });
    });

    it("patch 的 undefined 字段被忽略", () => {
      const result = deepMerge({ a: 1 }, { a: undefined });
      expect(result).toEqual({ a: 1 });
    });

    it("嵌套对象递归合并", () => {
      const base = { outer: { a: 1, b: 2 } };
      const patch: DeepPartial<typeof base> = { outer: { b: 20, c: 30 } };
      const result = deepMerge(base, patch);
      expect(result).toEqual({ outer: { a: 1, b: 20, c: 30 } });
    });

    it("嵌套对象完全覆盖（非 plain 时）", () => {
      const base = { outer: { a: 1 } };
      const patch = { outer: "replaced" };
      const result = deepMerge(base, patch);
      expect(result).toEqual({ outer: "replaced" });
    });

    it("数组不递归合并（patch 整体覆盖）", () => {
      const base = { tags: [1, 2, 3] };
      const patch = { tags: [4, 5] };
      const result = deepMerge(base, patch);
      expect(result).toEqual({ tags: [4, 5] });
    });

    it("base 非 plain 对象时返回 patch", () => {
      const result = deepMerge(null, { a: 1 });
      expect(result).toEqual({ a: 1 });
    });

    it("patch 非 plain 对象时返回 patch", () => {
      const result = deepMerge({ a: 1 }, null);
      expect(result).toBeNull();
    });

    it("不修改原对象", () => {
      const base = { a: { b: 1 } };
      const baseClone = JSON.parse(JSON.stringify(base));
      deepMerge(base, { a: { c: 2 } });
      expect(base).toEqual(baseClone);
    });

    it("多层级嵌套合并", () => {
      const base = { a: { b: { c: { d: 1 } } } };
      const patch: DeepPartial<typeof base> = { a: { b: { c: { d: 2, e: 3 } } } };
      const result = deepMerge(base, patch);
      expect(result).toEqual({ a: { b: { c: { d: 2, e: 3 } } } });
    });
  });
});
