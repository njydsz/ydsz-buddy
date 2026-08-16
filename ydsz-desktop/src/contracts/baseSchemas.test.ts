/**
 * @file baseSchemas 契约测试
 *
 * 互联网大厂基线：
 * - 双向 encode/decode（schema 应该是 round-trip 稳定的）
 * - 边界值（空串、超长、特殊字符）
 * - 拒绝非法输入（保证 branded type 不被绕过）
 */
import { describe, it, expect } from "vitest";
import { Schema } from "effect";
import {
  ProviderKind,
  ThreadId,
  ProjectId,
  MessageId,
  TurnId,
  EventId,
  CommandId,
  TrimmedString,
  TrimmedNonEmptyString,
  NonNegativeInt,
  PositiveInt,
  IsoDateTime,
} from "./baseSchemas";

/** 解码辅助 */
const decode = <A, I>(schema: Schema.Schema<A, I>, input: unknown) =>
  Schema.decodeUnknownSync(schema)(input);

const encode = <A, I>(schema: Schema.Schema<A, I>, value: A) =>
  Schema.encodeSync(schema)(value);

describe("baseSchemas", () => {
  describe("TrimmedString / TrimmedNonEmptyString", () => {
    it("TrimmedString 接受正常字符串", () => {
      const result = decode(TrimmedString, "hello");
      expect(result).toBe("hello");
    });

    it("TrimmedString 自动 trim 首尾空白", () => {
      const result = decode(TrimmedString, "  hello world  ");
      expect(result).toBe("hello world");
    });

    it("TrimmedString 拒绝非字符串", () => {
      expect(() => decode(TrimmedString, 123)).toThrow();
    });

    it("TrimmedNonEmptyString 拒绝空串", () => {
      expect(() => decode(TrimmedNonEmptyString, "")).toThrow();
    });

    it("TrimmedNonEmptyString 拒绝纯空白", () => {
      expect(() => decode(TrimmedNonEmptyString, "   ")).toThrow();
    });

    it("TrimmedNonEmptyString 接受 trim 后非空", () => {
      const result = decode(TrimmedNonEmptyString, "  value  ");
      expect(result).toBe("value");
    });
  });

  describe("NonNegativeInt / PositiveInt", () => {
    it("NonNegativeInt 接受 0", () => {
      expect(decode(NonNegativeInt, 0)).toBe(0);
    });

    it("NonNegativeInt 接受正数", () => {
      expect(decode(NonNegativeInt, 42)).toBe(42);
    });

    it("NonNegativeInt 拒绝负数", () => {
      expect(() => decode(NonNegativeInt, -1)).toThrow();
    });

    it("NonNegativeInt 拒绝小数", () => {
      expect(() => decode(NonNegativeInt, 1.5)).toThrow();
    });

    it("PositiveInt 拒绝 0", () => {
      expect(() => decode(PositiveInt, 0)).toThrow();
    });

    it("PositiveInt 接受 1", () => {
      expect(decode(PositiveInt, 1)).toBe(1);
    });
  });

  describe("ProviderKind", () => {
    it.each([
      "codex",
      "claudeAgent",
      "cursor",
      "gemini",
      "grok",
      "kilo",
      "opencode",
      "pi",
    ] as const)("接受合法 ProviderKind: %s", (kind) => {
      expect(decode(ProviderKind, kind)).toBe(kind);
    });

    it("拒绝未知 Provider", () => {
      expect(() => decode(ProviderKind, "unknown-provider")).toThrow();
    });

    it("拒绝空字符串", () => {
      expect(() => decode(ProviderKind, "")).toThrow();
    });
  });

  describe("Branded EntityId（ThreadId / ProjectId / MessageId / TurnId）", () => {
    it("ThreadId 接受非空字符串", () => {
      const id = decode(ThreadId, "thread-123");
      expect(id).toBe("thread-123");
    });

    it("ThreadId 拒绝空字符串", () => {
      expect(() => decode(ThreadId, "")).toThrow();
    });

    it("ThreadId 拒绝纯空白", () => {
      expect(() => decode(ThreadId, "   ")).toThrow();
    });

    it("ThreadId 拒绝数字", () => {
      expect(() => decode(ThreadId, 123)).toThrow();
    });

    it("ProjectId 接受非空字符串", () => {
      const id = decode(ProjectId, "proj-1");
      expect(id).toBe("proj-1");
    });

    it("MessageId 接受非空字符串", () => {
      const id = decode(MessageId, "msg-abc");
      expect(id).toBe("msg-abc");
    });

    it("TurnId 接受非空字符串", () => {
      const id = decode(TurnId, "turn-xyz");
      expect(id).toBe("turn-xyz");
    });

    it("EventId 接受非空字符串", () => {
      const id = decode(EventId, "event-1");
      expect(id).toBe("event-1");
    });

    it("CommandId 接受非空字符串", () => {
      const id = decode(CommandId, "cmd-1");
      expect(id).toBe("cmd-1");
    });
  });

  describe("IsoDateTime", () => {
    it("接受 ISO 字符串", () => {
      expect(decode(IsoDateTime, "2026-06-24T10:00:00Z")).toBe("2026-06-24T10:00:00Z");
    });

    it("接受任意字符串（schema 仅声明为 string）", () => {
      // IsoDateTime 当前是 String 的别名，不强制 ISO 格式
      expect(decode(IsoDateTime, "any string")).toBe("any string");
    });
  });

  describe("Round-trip encode/decode", () => {
    it("TrimmedNonEmptyString round-trip", () => {
      const original = "hello";
      const encoded = encode(TrimmedNonEmptyString, original);
      const decoded = decode(TrimmedNonEmptyString, encoded);
      expect(decoded).toBe(original);
    });

    it("ProviderKind round-trip", () => {
      const original = "codex" as const;
      const encoded = encode(ProviderKind, original);
      const decoded = decode(ProviderKind, encoded);
      expect(decoded).toBe(original);
    });

    it("ThreadId round-trip", () => {
      const original = "thread-abc";
      const encoded = encode(ThreadId, original);
      const decoded = decode(ThreadId, encoded);
      expect(decoded).toBe(original);
    });
  });
});
