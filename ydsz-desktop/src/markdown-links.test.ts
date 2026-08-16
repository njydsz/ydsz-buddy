/**
 * @file Markdown 文件链接解析测试
 */

import { resolveMarkdownFileLinkTarget, rewriteMarkdownFileUriHref } from "./markdown-links";

describe("rewriteMarkdownFileUriHref", () => {
  it("returns null for empty/undefined input", () => {
    expect(rewriteMarkdownFileUriHref(undefined)).toBeNull();
    expect(rewriteMarkdownFileUriHref("")).toBeNull();
  });

  it("returns null for non-file scheme", () => {
    expect(rewriteMarkdownFileUriHref("https://example.com/foo")).toBeNull();
  });

  it("rewrites a file:// URL to its path", () => {
    expect(rewriteMarkdownFileUriHref("file:///Users/me/file.ts")).toBe(
      "/Users/me/file.ts",
    );
  });

  it("preserves hash fragment", () => {
    expect(rewriteMarkdownFileUriHref("file:///Users/me/file.ts#L10")).toBe(
      "/Users/me/file.ts#L10",
    );
  });
});

describe("resolveMarkdownFileLinkTarget", () => {
  const cwd = "/Users/me/project";

  it("returns null for empty/undefined href", () => {
    expect(resolveMarkdownFileLinkTarget(undefined)).toBeNull();
    expect(resolveMarkdownFileLinkTarget("")).toBeNull();
  });

  it("returns null for fragment-only hrefs", () => {
    expect(resolveMarkdownFileLinkTarget("#section")).toBeNull();
  });

  it("returns null for external schemes", () => {
    expect(resolveMarkdownFileLinkTarget("https://example.com/foo", cwd)).toBeNull();
    expect(resolveMarkdownFileLinkTarget("mailto:a@b.com", cwd)).toBeNull();
  });

  it("resolves a POSIX absolute path", () => {
    expect(resolveMarkdownFileLinkTarget("/Users/me/foo.ts", cwd)).toBe(
      "/Users/me/foo.ts",
    );
  });

  it("resolves a Windows drive path", () => {
    expect(resolveMarkdownFileLinkTarget("C:\\Users\\me\\foo.ts")).toBe(
      "C:\\Users\\me\\foo.ts",
    );
  });

  it("appends line number from hash", () => {
    expect(resolveMarkdownFileLinkTarget("/Users/me/foo.ts#L42", cwd)).toBe(
      "/Users/me/foo.ts:42",
    );
  });

  it("appends line and column from hash", () => {
    expect(resolveMarkdownFileLinkTarget("/Users/me/foo.ts#L42C8", cwd)).toBe(
      "/Users/me/foo.ts:42:8",
    );
  });

  it("does not duplicate position when path already has it", () => {
    expect(resolveMarkdownFileLinkTarget("/Users/me/foo.ts:10:5#L42", cwd)).toBe(
      "/Users/me/foo.ts:10:5",
    );
  });

  it("returns null for pure line number", () => {
    // "10:5" 不是路径候选
    expect(resolveMarkdownFileLinkTarget("10:5", cwd)).toBeNull();
  });

  it("resolves file:// URL to local path", () => {
    expect(resolveMarkdownFileLinkTarget("file:///Users/me/foo.ts", cwd)).toBe(
      "/Users/me/foo.ts",
    );
  });
});
