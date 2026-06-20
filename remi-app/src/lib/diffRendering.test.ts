/**
 * @file 差异渲染工具测试
 *
 * 验证 fnv1a32 哈希、buildPatchCacheKey 缓存键生成、
 * resolveDiffCopyText 文本提取以及 resolveDiffThemeName 主题解析。
 */

import { describe, expect, it } from "vitest";

import {
  buildPatchCacheKey,
  DIFF_THEME_NAMES,
  fnv1a32,
  resolveDiffCopyText,
  resolveDiffThemeName,
} from "./diffRendering";

describe("fnv1a32", () => {
  it("returns the seed for empty input", () => {
    // 0 xor = seed (no iteration)
    expect(fnv1a32("")).toBe(0x811c9dc5);
  });

  it("is deterministic for same input", () => {
    const a = fnv1a32("hello");
    const b = fnv1a32("hello");
    expect(a).toBe(b);
  });

  it("produces different hashes for different inputs", () => {
    expect(fnv1a32("foo")).not.toBe(fnv1a32("bar"));
  });

  it("respects custom seed and multiplier", () => {
    const custom = fnv1a32("x", 0x12345678, 0xdeadbeef);
    const defaultHash = fnv1a32("x");
    expect(custom).not.toBe(defaultHash);
  });

  it("returns 32-bit unsigned values", () => {
    const result = fnv1a32("a long string with many characters ".repeat(100));
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(0xffffffff);
    expect(Number.isInteger(result)).toBe(true);
  });
});

describe("buildPatchCacheKey", () => {
  it("is deterministic for same patch", () => {
    expect(buildPatchCacheKey("a\nb\n")).toBe(buildPatchCacheKey("a\nb\n"));
  });

  it("trims whitespace before hashing", () => {
    expect(buildPatchCacheKey("  a\nb\n  ")).toBe(buildPatchCacheKey("a\nb\n"));
  });

  it("uses the default scope when not provided", () => {
    const a = buildPatchCacheKey("x");
    expect(a.startsWith("diff-panel:")).toBe(true);
  });

  it("honors custom scope", () => {
    const a = buildPatchCacheKey("x", "my-scope");
    expect(a.startsWith("my-scope:")).toBe(true);
  });

  it("encodes patch length in the key", () => {
    const a = buildPatchCacheKey("a");
    const b = buildPatchCacheKey("aa");
    expect(a).not.toBe(b);
  });
});

describe("resolveDiffCopyText", () => {
  it("returns null for undefined", () => {
    expect(resolveDiffCopyText(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(resolveDiffCopyText("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(resolveDiffCopyText("   \n\t ")).toBeNull();
  });

  it("returns the patch for non-empty input", () => {
    expect(resolveDiffCopyText("diff --git a/foo b/foo")).toBe("diff --git a/foo b/foo");
  });
});

describe("resolveDiffThemeName", () => {
  it("maps dark to dark theme", () => {
    expect(resolveDiffThemeName("dark")).toBe(DIFF_THEME_NAMES.dark);
  });

  it("maps light to light theme", () => {
    expect(resolveDiffThemeName("light")).toBe(DIFF_THEME_NAMES.light);
  });
});
