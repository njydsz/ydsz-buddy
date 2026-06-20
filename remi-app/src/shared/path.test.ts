/**
 * @file 共享路径类型检测测试
 */

import { describe, expect, it } from "vitest";

import {
  isExplicitRelativePath,
  isUncPath,
  isWindowsAbsolutePath,
  isWindowsDrivePath,
} from "./path";

describe("isWindowsDrivePath", () => {
  it("detects drive path with backslash", () => {
    expect(isWindowsDrivePath("C:\\Users\\admin")).toBe(true);
  });

  it("detects drive path with forward slash", () => {
    expect(isWindowsDrivePath("D:/projects")).toBe(true);
  });

  it("detects bare drive letter", () => {
    expect(isWindowsDrivePath("C:")).toBe(true);
  });

  it("rejects unix path", () => {
    expect(isWindowsDrivePath("/home/user")).toBe(false);
  });

  it("rejects lowercase drive", () => {
    expect(isWindowsDrivePath("c:\\foo")).toBe(true);
  });
});

describe("isUncPath", () => {
  it("detects double backslash prefix", () => {
    expect(isUncPath("\\\\server\\share")).toBe(true);
  });

  it("rejects regular windows path", () => {
    expect(isUncPath("C:\\Users")).toBe(false);
  });

  it("rejects unix path", () => {
    expect(isUncPath("/home/user")).toBe(false);
  });
});

describe("isWindowsAbsolutePath", () => {
  it("detects drive path", () => {
    expect(isWindowsAbsolutePath("C:\\Users")).toBe(true);
  });

  it("detects UNC path", () => {
    expect(isWindowsAbsolutePath("\\\\server\\share")).toBe(true);
  });

  it("rejects unix path", () => {
    expect(isWindowsAbsolutePath("/home/user")).toBe(false);
  });
});

describe("isExplicitRelativePath", () => {
  it("accepts ./ prefix", () => {
    expect(isExplicitRelativePath("./src")).toBe(true);
  });

  it("accepts ../ prefix", () => {
    expect(isExplicitRelativePath("../lib")).toBe(true);
  });

  it("accepts windows-style relative prefix", () => {
    expect(isExplicitRelativePath(".\\src")).toBe(true);
    expect(isExplicitRelativePath("..\\lib")).toBe(true);
  });

  it("accepts bare . and ..", () => {
    expect(isExplicitRelativePath(".")).toBe(true);
    expect(isExplicitRelativePath("..")).toBe(true);
  });

  it("rejects implicit relative path", () => {
    expect(isExplicitRelativePath("src/index.ts")).toBe(false);
  });

  it("rejects absolute path", () => {
    expect(isExplicitRelativePath("/absolute/path")).toBe(false);
    expect(isExplicitRelativePath("C:\\path")).toBe(false);
  });
});
