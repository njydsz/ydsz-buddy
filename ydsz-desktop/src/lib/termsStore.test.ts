/**
 * @file termsStore.test.ts
 * @description P0-6 验收测试:条款接受状态 Store 的持久化与响应式读取。
 *
 * 覆盖:
 * - 默认状态:termsAcceptedAt === null
 * - acceptTerms() 写入 ISO 时间戳
 * - resetTermsAcceptance() 清空
 * - hasAcceptedTerms() 同步判断
 * - localStorage 持久化与跨标签页 storage 事件同步
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  acceptTerms,
  getTermsState,
  hasAcceptedTerms,
  resetTermsAcceptance,
} from "./termsStore";

beforeEach(() => {
  localStorage.clear();
  resetTermsAcceptance();
});

afterEach(() => {
  localStorage.clear();
  resetTermsAcceptance();
});

describe("P0-6 termsStore", () => {
  it("默认状态:termsAcceptedAt 为 null", () => {
    expect(getTermsState().termsAcceptedAt).toBeNull();
    expect(hasAcceptedTerms()).toBe(false);
  });

  it("acceptTerms() 写入非空 ISO 时间戳", () => {
    const before = Date.now();
    acceptTerms();
    const after = Date.now();

    const state = getTermsState();
    expect(state.termsAcceptedAt).not.toBeNull();
    expect(hasAcceptedTerms()).toBe(true);

    const ts = Date.parse(state.termsAcceptedAt!);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it("acceptTerms() 写入的值持久化到 localStorage", () => {
    acceptTerms();
    const raw = localStorage.getItem("ydsz-buddy:terms-accepted");
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.termsAcceptedAt).not.toBeNull();
    expect(typeof parsed.termsAcceptedAt).toBe("string");
  });

  it("resetTermsAcceptance() 清空状态", () => {
    acceptTerms();
    expect(hasAcceptedTerms()).toBe(true);

    resetTermsAcceptance();
    expect(getTermsState().termsAcceptedAt).toBeNull();
    expect(hasAcceptedTerms()).toBe(false);

    const raw = localStorage.getItem("ydsz-buddy:terms-accepted");
    expect(JSON.parse(raw!).termsAcceptedAt).toBeNull();
  });

  it("从 localStorage 恢复状态(模拟跨 session)", () => {
    const fixedTs = "2026-07-09T10:00:00.000Z";
    localStorage.setItem(
      "ydsz-buddy:terms-accepted",
      JSON.stringify({ termsAcceptedAt: fixedTs }),
    );

    // 触发重新读取(通过重置缓存:重新 import 不现实,改用 storage 事件)
    // 这里通过 hasAcceptedTerms() 间接验证:localStorage 已写入合法值时,
    // 下一次 readTermsState() 会读取到。
    // 由于 termsStore 内部有缓存,需要通过 storage 事件重置缓存。
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "ydsz-buddy:terms-accepted",
        newValue: JSON.stringify({ termsAcceptedAt: fixedTs }),
      }),
    );
    expect(hasAcceptedTerms()).toBe(true);
    expect(getTermsState().termsAcceptedAt).toBe(fixedTs);
  });

  it("非法 localStorage 值回退到默认状态", () => {
    localStorage.setItem("ydsz-buddy:terms-accepted", "not-json{");
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "ydsz-buddy:terms-accepted",
        newValue: "not-json{",
      }),
    );
    expect(hasAcceptedTerms()).toBe(false);
    expect(getTermsState().termsAcceptedAt).toBeNull();
  });

  it("非字符串 termsAcceptedAt 被标准化为 null", () => {
    localStorage.setItem(
      "ydsz-buddy:terms-accepted",
      JSON.stringify({ termsAcceptedAt: 12345 }),
    );
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "ydsz-buddy:terms-accepted",
        newValue: JSON.stringify({ termsAcceptedAt: 12345 }),
      }),
    );
    expect(getTermsState().termsAcceptedAt).toBeNull();
    expect(hasAcceptedTerms()).toBe(false);
  });
});
