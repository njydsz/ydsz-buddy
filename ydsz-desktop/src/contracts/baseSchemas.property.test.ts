/**
 * @file baseSchemas 属性化测试
 *
 * 验证 Effect Schema 的关键不变量（基于 fast-check）：
 * 1. **round-trip 不变量**：合法输入 encode 后 decode 应等于原值
 * 2. **拒绝不变量**：schema 拒绝的输入 decode 必须抛错
 * 3. **trim 不变量**：TrimmedNonEmptyString 拒绝 trim 后为空的串
 * 4. **范围不变量**：PositiveInt 拒绝 0 和负数，NonNegativeInt 拒绝负数
 * 5. **Literal 不变量**：ProviderKind 只能接受 8 个固定值
 *
 * 互联网大厂基线：所有公共 schema 必须有 property-based 兜底，
 * 因为手工 example 难以覆盖所有 unicode 边界。
 */
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { Schema } from "effect";
import {
  ProviderKind,
  ThreadId,
  ProjectId,
  MessageId,
  NonNegativeInt,
  PositiveInt,
  TrimmedNonEmptyString,
} from "./baseSchemas";

const decode = <A, I>(schema: Schema.Schema<A, I>, input: unknown) =>
  Schema.decodeUnknownSync(schema)(input);

const encode = <A, I>(schema: Schema.Schema<A, I>, value: A) =>
  Schema.encodeSync(schema)(value);

describe("baseSchemas property-based", () => {
  describe("TrimmedNonEmptyString", () => {
    it("round-trip：合法非空字符串 encode/decode 等价", () => {
      fc.assert(
        fc.property(
          fc
            .string({ minLength: 1, maxLength: 100 })
            .filter((s) => s.trim().length > 0)
            // 跳过两端有空白：trim 后值变化，round-trip 后值不等
            .filter((s) => s === s.trim()),
          (s) => {
            const decoded = decode(TrimmedNonEmptyString, s);
            const encoded = encode(TrimmedNonEmptyString, decoded);
            const decodedAgain = decode(TrimmedNonEmptyString, encoded);
            expect(decodedAgain).toBe(decoded);
          },
        ),
        { numRuns: 50 },
      );
    });

    it("拒绝 trim 后为空的字符串（全空白）", () => {
      fc.assert(
        fc.property(
          fc
            .string({ minLength: 1, maxLength: 10 })
            .filter((s) => s.trim().length === 0),
          (s) => {
            expect(() => decode(TrimmedNonEmptyString, s)).toThrow();
          },
        ),
        { numRuns: 20 },
      );
    });

    it("拒绝空串", () => {
      expect(() => decode(TrimmedNonEmptyString, "")).toThrow();
    });
  });

  describe("NonNegativeInt / PositiveInt", () => {
    it("NonNegativeInt 拒绝所有负数", () => {
      fc.assert(
        fc.property(fc.integer({ max: -1 }), (n) => {
          expect(() => decode(NonNegativeInt, n)).toThrow();
        }),
        { numRuns: 30 },
      );
    });

    it("NonNegativeInt round-trip：所有 >= 0 的整数", () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 100000 }), (n) => {
          const decoded = decode(NonNegativeInt, n);
          expect(decoded).toBe(n);
        }),
        { numRuns: 30 },
      );
    });

    it("PositiveInt 拒绝 0 和负数", () => {
      fc.assert(
        fc.property(fc.integer({ max: 0 }), (n) => {
          expect(() => decode(PositiveInt, n)).toThrow();
        }),
        { numRuns: 20 },
      );
    });

    it("PositiveInt round-trip：所有 >= 1 的整数", () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 100000 }), (n) => {
          const decoded = decode(PositiveInt, n);
          expect(decoded).toBe(n);
        }),
        { numRuns: 30 },
      );
    });
  });

  describe("ProviderKind", () => {
    const validKinds = [
      "codex",
      "claudeAgent",
      "cursor",
      "gemini",
      "grok",
      "kilo",
      "opencode",
      "pi",
      "glm",
      "deepseek",
      "moonshot",
      "qwen",
      "mimo",
      "MiniMax",
      "doubao",
      "ernie",
      "hunyuan",
    ] as const;

    it("17 个合法值均能 round-trip", () => {
      fc.assert(
        fc.property(fc.constantFrom(...validKinds), (kind) => {
          const decoded = decode(ProviderKind, kind);
          expect(decoded).toBe(kind);
          const encoded = encode(ProviderKind, decoded);
          expect(encoded).toBe(kind);
        }),
      );
    });

    it("随机非合法字符串必须被拒绝", () => {
      fc.assert(
        fc.property(
          fc
            .string({ minLength: 1, maxLength: 20 })
            .filter((s) => !(validKinds as readonly string[]).includes(s)),
          (s) => {
            expect(() => decode(ProviderKind, s)).toThrow();
          },
        ),
        { numRuns: 30 },
      );
    });
  });

  describe("Branded EntityId", () => {
    it("ThreadId round-trip：合法非空字符串", () => {
      fc.assert(
        fc.property(
          fc
            .string({ minLength: 1, maxLength: 50 })
            .filter((s) => s.trim().length > 0)
            // 避免两端有空白：trim 后的值与原值不等会导致 round-trip 失败
            .filter((s) => s === s.trim()),
          (s) => {
            const decoded = decode(ThreadId, s);
            expect(decoded).toBe(s);
          },
        ),
        { numRuns: 30 },
      );
    });

    it("ThreadId 拒绝 trim 后为空的字符串", () => {
      fc.assert(
        fc.property(
          fc
            .string({ minLength: 1, maxLength: 10 })
            .filter((s) => s.trim().length === 0),
          (s) => {
            expect(() => decode(ThreadId, s)).toThrow();
          },
        ),
        { numRuns: 20 },
      );
    });

    it("ProjectId / MessageId 同样拒绝非字符串", () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.integer(),
            fc.boolean(),
            fc.constant(null),
            fc.constant(undefined),
            fc.array(fc.anything(), { maxLength: 3 }),
          ),
          (bad) => {
            expect(() => decode(ProjectId, bad)).toThrow();
            expect(() => decode(MessageId, bad)).toThrow();
          },
        ),
        { numRuns: 30 },
      );
    });
  });
});
