/**
 * @file appSettings 单元测试
 *
 * 当前仅覆盖纯函数 `normalizeMarketplaceUrl`，避免在 localStorage 环境下
 * 触发 `useAppSettings` 带来的复杂度。后续 P2 阶段会补 settings store 测试。
 */

import { describe, expect, it } from "vitest";
import { normalizeMarketplaceUrl } from "./appSettings";

describe("normalizeMarketplaceUrl", () => {
  describe("空值 / 非字符串", () => {
    it("undefined → 空串", () => {
      expect(normalizeMarketplaceUrl(undefined)).toBe("");
    });
    it("null → 空串", () => {
      expect(normalizeMarketplaceUrl(null)).toBe("");
    });
    it("空串 → 空串", () => {
      expect(normalizeMarketplaceUrl("")).toBe("");
    });
    it("仅空白 → 空串", () => {
      expect(normalizeMarketplaceUrl("   ")).toBe("");
      expect(normalizeMarketplaceUrl("\t\n  ")).toBe("");
    });
    it("数字 / 对象 / boolean → 空串（typeof 检查）", () => {
      expect(normalizeMarketplaceUrl(123 as unknown as string)).toBe("");
      expect(normalizeMarketplaceUrl({} as unknown as string)).toBe("");
      expect(normalizeMarketplaceUrl(true as unknown as string)).toBe("");
    });
  });

  describe("合法 http(s) URL", () => {
    it("https://example.com → 原样返回", () => {
      expect(normalizeMarketplaceUrl("https://example.com")).toBe("https://example.com");
    });
    it("http://example.com → 原样返回", () => {
      expect(normalizeMarketplaceUrl("http://example.com")).toBe("http://example.com");
    });
    it("带路径 / 查询参数 → 原样返回", () => {
      expect(normalizeMarketplaceUrl("https://marketplace.njydsz.com/index.json")).toBe(
        "https://marketplace.njydsz.com/index.json",
      );
      expect(normalizeMarketplaceUrl("https://example.com/index.json?v=1")).toBe(
        "https://example.com/index.json?v=1",
      );
    });
    it("大写 Https 也接受（不区分大小写）", () => {
      expect(normalizeMarketplaceUrl("HTTPS://example.com")).toBe("HTTPS://example.com");
    });
    it("带端口号 → 原样返回", () => {
      expect(normalizeMarketplaceUrl("https://localhost:8443/index.json")).toBe(
        "https://localhost:8443/index.json",
      );
    });
    it("末尾斜杠保留（JSON URL 兼容）", () => {
      expect(normalizeMarketplaceUrl("https://example.com/")).toBe("https://example.com/");
    });
  });

  describe("非法协议 / 路径", () => {
    it.each([
      "ftp://example.com",
      "javascript:alert(1)",
      "file:///etc/passwd",
      "data:text/plain,hello",
      "ws://example.com",
      "//example.com",
      "example.com",
      "/path/to/index.json",
      "./relative",
    ])("拒绝 %s", (input) => {
      expect(normalizeMarketplaceUrl(input)).toBe("");
    });
  });

  describe("空白处理", () => {
    it("合法 URL 前后空白被 trim", () => {
      expect(normalizeMarketplaceUrl("  https://example.com  ")).toBe("https://example.com");
      expect(normalizeMarketplaceUrl("\thttps://example.com\n")).toBe("https://example.com");
    });
  });
});
