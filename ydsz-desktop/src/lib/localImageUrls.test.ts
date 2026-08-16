/**
 * @file localImageUrls.ts 单元测试
 *
 * 覆盖：
 * - isLocalImageMarkdownSrc：URL scheme / Windows 路径 / 相对路径 / 不支持扩展
 * - buildLocalImageUrl：携带 path/cwd/download 参数
 * - localImageFileName：路径分隔符
 */

import { describe, expect, it } from "vitest";
import {
  buildLocalImageUrl,
  isLocalImageMarkdownSrc,
  localImageFileName,
} from "./localImageUrls";

describe("isLocalImageMarkdownSrc", () => {
  it("undefined/空字符串 → false", () => {
    expect(isLocalImageMarkdownSrc(undefined)).toBe(false);
    expect(isLocalImageMarkdownSrc("")).toBe(false);
  });

  it(".png 绝对路径（Unix） → true", () => {
    expect(isLocalImageMarkdownSrc("/tmp/foo.png")).toBe(true);
  });

  it(".jpg 相对路径 → true", () => {
    expect(isLocalImageMarkdownSrc("./images/a.jpg")).toBe(true);
  });

  it(".gif 父相对路径 → true", () => {
    expect(isLocalImageMarkdownSrc("../img/b.gif")).toBe(true);
  });

  it("无扩展名 → false", () => {
    expect(isLocalImageMarkdownSrc("/tmp/foo")).toBe(false);
  });

  it("不支持的扩展名（.txt） → false", () => {
    expect(isLocalImageMarkdownSrc("/tmp/foo.txt")).toBe(false);
  });

  it("远程 URL（http://...png） → false", () => {
    expect(isLocalImageMarkdownSrc("https://example.com/foo.png")).toBe(false);
  });

  it("Windows 绝对路径 → true", () => {
    expect(isLocalImageMarkdownSrc("C:\\Users\\me\\image.png")).toBe(true);
  });

  it("file:// 协议 → true", () => {
    expect(isLocalImageMarkdownSrc("file:///tmp/foo.png")).toBe(true);
  });
});

describe("buildLocalImageUrl", () => {
  it("包含 path 参数", () => {
    const url = buildLocalImageUrl({ src: "/tmp/foo.png", cwd: undefined });
    expect(url).toContain("path=");
    expect(decodeURIComponent(url)).toContain("/tmp/foo.png");
  });

  it("包含 cwd 参数", () => {
    const url = buildLocalImageUrl({ src: "/tmp/foo.png", cwd: "/workspace" });
    expect(decodeURIComponent(url)).toContain("cwd=/workspace");
  });

  it("download=true 时包含 download=1", () => {
    const url = buildLocalImageUrl({
      src: "/tmp/foo.png",
      cwd: undefined,
      download: true,
    });
    expect(url).toContain("download=1");
  });

  it("download=false 时不包含 download 参数", () => {
    const url = buildLocalImageUrl({
      src: "/tmp/foo.png",
      cwd: undefined,
      download: false,
    });
    expect(url).not.toContain("download=");
  });
});

describe("localImageFileName", () => {
  it("Unix 路径取最后一段", () => {
    expect(localImageFileName("/tmp/foo/bar.png")).toBe("bar.png");
  });

  it("Windows 路径取最后一段", () => {
    expect(localImageFileName("C:\\Users\\me\\image.png")).toBe("image.png");
  });

  it("纯文件名直接返回", () => {
    expect(localImageFileName("image.png")).toBe("image.png");
  });

  it("file:// 协议去除后取末段", () => {
    expect(localImageFileName("file:///tmp/foo.png")).toBe("foo.png");
  });
});
