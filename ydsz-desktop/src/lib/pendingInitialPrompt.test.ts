/**
 * @file pendingInitialPrompt 单元测试
 */

import { afterEach, describe, expect, it } from "vitest";

import {
  consumePendingInitialPrompt,
  setPendingInitialPrompt,
} from "./pendingInitialPrompt";

describe("pendingInitialPrompt", () => {
  afterEach(() => {
    // 重置模块状态
    setPendingInitialPrompt(null);
  });

  it("初始无 prompt 时 consume 返回 null", () => {
    setPendingInitialPrompt(null);
    expect(consumePendingInitialPrompt()).toBeNull();
  });

  it("set 后 consume 返回值", () => {
    setPendingInitialPrompt("hello world");
    expect(consumePendingInitialPrompt()).toBe("hello world");
  });

  it("consume 后值被清空,二次 consume 返回 null", () => {
    setPendingInitialPrompt("first");
    expect(consumePendingInitialPrompt()).toBe("first");
    expect(consumePendingInitialPrompt()).toBeNull();
  });

  it("set(null) 主动清空", () => {
    setPendingInitialPrompt("to be cleared");
    setPendingInitialPrompt(null);
    expect(consumePendingInitialPrompt()).toBeNull();
  });

  it("set 后再次 set 覆盖", () => {
    setPendingInitialPrompt("first");
    setPendingInitialPrompt("second");
    expect(consumePendingInitialPrompt()).toBe("second");
  });
});
