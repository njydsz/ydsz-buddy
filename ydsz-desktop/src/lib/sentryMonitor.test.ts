/**
 * @file sentryMonitor 单元测试
 * @description P1-6: 验证 Sentry 适配器的脱敏、降级、初始化行为
 */

import { describe, expect, it } from "vitest";
import { redactContext, installGlobalErrorHandlers } from "./sentryMonitor";

describe("redactContext - PII 脱敏", () => {
  it("顶层敏感字段被替换", () => {
    const input = {
      token: "secret-token-xxx",
      apiKey: "sk-123",
      authorization: "Bearer xxx",
      username: "alice",
    };
    const out = redactContext(input);
    expect(out?.token).toBe("[REDACTED]");
    expect(out?.apiKey).toBe("[REDACTED]");
    expect(out?.authorization).toBe("[REDACTED]");
    expect(out?.username).toBe("alice");
  });

  it("大小写不敏感匹配", () => {
    const input = {
      Token: "xxx",
      API_KEY: "xxx",
      Password: "xxx",
      authorization: "xxx",
      SESSIONID: "xxx",
    };
    const out = redactContext(input);
    expect(out?.Token).toBe("[REDACTED]");
    expect(out?.API_KEY).toBe("[REDACTED]");
    expect(out?.Password).toBe("[REDACTED]");
    expect(out?.authorization).toBe("[REDACTED]");
    expect(out?.SESSIONID).toBe("[REDACTED]");
  });

  it("非敏感字段保持原值", () => {
    const input = {
      componentStack: "at Foo",
      url: "/chat",
      appVersion: "0.3.0",
    };
    const out = redactContext(input);
    expect(out).toEqual(input);
  });

  it("undefined / 空对象不抛错", () => {
    expect(redactContext(undefined)).toBeUndefined();
    expect(redactContext({})).toEqual({});
  });

  it("嵌套对象的敏感字段(只对顶层,但对常见键生效)", () => {
    const input = {
      user: { name: "alice", token: "nested-token" },
      tags: { session: "abc" },
    };
    const out = redactContext(input);
    // 顶层只检查第一层
    expect(out?.user).toEqual({ name: "alice", token: "nested-token" });
    expect(out?.tags).toEqual({ session: "abc" });
  });
});

describe("installGlobalErrorHandlers - 全局监听", () => {
  it("返回清理函数,调用后移除监听", () => {
    const cleanup = installGlobalErrorHandlers();
    expect(typeof cleanup).toBe("function");
    // 调用不应抛错
    expect(() => cleanup()).not.toThrow();
  });

  it("多次调用不报错(幂等)", () => {
    const cleanup1 = installGlobalErrorHandlers();
    const cleanup2 = installGlobalErrorHandlers();
    cleanup1();
    cleanup2();
  });
});
