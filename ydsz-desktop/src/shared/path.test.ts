/**
 * @file path.ts 单元测试
 *
 * 覆盖纯函数路径类型识别：
 * 1. isWindowsDrivePath - 盘符路径
 * 2. isUncPath - UNC 路径
 * 3. isWindowsAbsolutePath - Windows 绝对路径
 * 4. isExplicitRelativePath - 显式相对路径
 */

import { describe, expect, it } from "vitest";

import {
  isExplicitRelativePath,
  isUncPath,
  isWindowsAbsolutePath,
  isWindowsDrivePath,
} from "./path";

describe("path", () => {
  describe("isWindowsDrivePath", () => {
    it("识别单字母盘符+反斜杠", () => {
      expect(isWindowsDrivePath("C:\\Users")).toBe(true);
      expect(isWindowsDrivePath("D:\\")).toBe(true);
    });

    it("识别单字母盘符+正斜杠", () => {
      expect(isWindowsDrivePath("D:/documents")).toBe(true);
      expect(isWindowsDrivePath("c:/")).toBe(true);
    });

    it("裸盘符不识别（无斜杠）", () => {
      expect(isWindowsDrivePath("C:")).toBe(false);
    });

    it("非盘符路径不识别", () => {
      expect(isWindowsDrivePath("/home/user")).toBe(false);
      expect(isWindowsDrivePath("./relative")).toBe(false);
      expect(isWindowsDrivePath("")).toBe(false);
    });

    it("多字母前缀不识别", () => {
      expect(isWindowsDrivePath("AB:/foo")).toBe(false);
    });
  });

  describe("isUncPath", () => {
    it("识别双反斜杠开头", () => {
      expect(isUncPath("\\\\server\\share")).toBe(true);
      expect(isUncPath("\\\\localhost\\c$")).toBe(true);
    });

    it("单反斜杠不识别", () => {
      expect(isUncPath("\\server\\share")).toBe(false);
    });

    it("盘符路径不识别", () => {
      expect(isUncPath("C:\\Users")).toBe(false);
    });

    it("空字符串不识别", () => {
      expect(isUncPath("")).toBe(false);
    });
  });

  describe("isWindowsAbsolutePath", () => {
    it("盘符路径是 Windows 绝对路径", () => {
      expect(isWindowsAbsolutePath("C:\\Users\\name")).toBe(true);
      expect(isWindowsAbsolutePath("D:/documents")).toBe(true);
    });

    it("UNC 路径是 Windows 绝对路径", () => {
      expect(isWindowsAbsolutePath("\\\\server\\share")).toBe(true);
    });

    it("相对路径不是 Windows 绝对路径", () => {
      expect(isWindowsAbsolutePath("./relative")).toBe(false);
      expect(isWindowsAbsolutePath("../parent")).toBe(false);
    });

    it("Unix 绝对路径不是 Windows 绝对路径", () => {
      expect(isWindowsAbsolutePath("/home/user")).toBe(false);
    });

    it("空字符串不是 Windows 绝对路径", () => {
      expect(isWindowsAbsolutePath("")).toBe(false);
    });
  });

  describe("isExplicitRelativePath", () => {
    it("识别单点", () => {
      expect(isExplicitRelativePath(".")).toBe(true);
    });

    it("识别双点", () => {
      expect(isExplicitRelativePath("..")).toBe(true);
    });

    it("识别 ./ 开头", () => {
      expect(isExplicitRelativePath("./foo")).toBe(true);
    });

    it("识别 ../ 开头", () => {
      expect(isExplicitRelativePath("../bar")).toBe(true);
    });

    it("识别 .\\ 开头", () => {
      expect(isExplicitRelativePath(".\\windows-path")).toBe(true);
    });

    it("识别 ..\\ 开头", () => {
      expect(isExplicitRelativePath("..\\parent")).toBe(true);
    });

    it("不识别普通文件名", () => {
      expect(isExplicitRelativePath("foo/bar")).toBe(false);
      expect(isExplicitRelativePath("README.md")).toBe(false);
    });

    it("不识别绝对路径", () => {
      expect(isExplicitRelativePath("/home/user")).toBe(false);
      expect(isExplicitRelativePath("C:\\Users")).toBe(false);
    });

    it("不识别空字符串", () => {
      expect(isExplicitRelativePath("")).toBe(false);
    });
  });
});
