/**
 * @file 标题截断工具测试
 *
 * 验证 truncateTitle 在不同输入下的行为：空字符串、短文本、
 * 等长文本、超长文本以及首尾空白。
 */

import { describe, expect, it } from "vitest";

import { truncateTitle } from "./truncateTitle";

describe("truncateTitle", () => {
  it("returns the same string when shorter than maxLength", () => {
    expect(truncateTitle("Short", 10)).toBe("Short");
  });

  it("returns the trimmed string when at exact maxLength", () => {
    const text = "12345";
    expect(truncateTitle(text, 5)).toBe("12345");
  });

  it("truncates with ellipsis when exceeding maxLength", () => {
    expect(truncateTitle("This is a long title", 10)).toBe("This is a ...");
  });

  it("trims leading and trailing whitespace before checking length", () => {
    expect(truncateTitle("  hello  ", 5)).toBe("hello");
  });

  it("uses the default maxLength of 50", () => {
    const long = "a".repeat(60);
    const result = truncateTitle(long);
    expect(result.length).toBe(53); // 50 chars + "..."
    expect(result.endsWith("...")).toBe(true);
  });

  it("returns empty string for empty input", () => {
    expect(truncateTitle("", 5)).toBe("");
  });
});
