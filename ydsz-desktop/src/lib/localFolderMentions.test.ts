/**
 * @file localFolderMentions 单元测试
 */

import { describe, expect, it } from "vitest";

import {
  expandLocalFolderPath,
  getLocalFolderBrowseRootPath,
  isLocalFolderMentionQuery,
  LOCAL_FOLDER_MENTION_NAME,
  matchesLocalFolderMentionShortcut,
} from "./localFolderMentions";

describe("localFolderMentions", () => {
  describe("LOCAL_FOLDER_MENTION_NAME", () => {
    it("为 'local'", () => {
      expect(LOCAL_FOLDER_MENTION_NAME).toBe("local");
    });
  });

  describe("matchesLocalFolderMentionShortcut", () => {
    it("空字符串返回 true(显示候选项)", () => {
      expect(matchesLocalFolderMentionShortcut("")).toBe(true);
    });

    it("纯空白返回 true", () => {
      expect(matchesLocalFolderMentionShortcut("   ")).toBe(true);
    });

    it("'l' 前缀匹配 'local'", () => {
      expect(matchesLocalFolderMentionShortcut("l")).toBe(true);
      expect(matchesLocalFolderMentionShortcut("lo")).toBe(true);
      expect(matchesLocalFolderMentionShortcut("loc")).toBe(true);
    });

    it("'local' 完全匹配", () => {
      expect(matchesLocalFolderMentionShortcut("local")).toBe(true);
    });

    it("大小写不敏感", () => {
      expect(matchesLocalFolderMentionShortcut("L")).toBe(true);
      expect(matchesLocalFolderMentionShortcut("LOCAL")).toBe(true);
    });

    it("不匹配的前缀返回 false", () => {
      expect(matchesLocalFolderMentionShortcut("x")).toBe(false);
      expect(matchesLocalFolderMentionShortcut("home")).toBe(false);
    });
  });

  describe("isLocalFolderMentionQuery", () => {
    it("/ 开头", () => {
      expect(isLocalFolderMentionQuery("/path")).toBe(true);
      expect(isLocalFolderMentionQuery("/")).toBe(true);
    });

    it("盘符路径(C:/ D:\\)", () => {
      expect(isLocalFolderMentionQuery("C:/Users")).toBe(true);
      expect(isLocalFolderMentionQuery("D:\\path")).toBe(true);
      expect(isLocalFolderMentionQuery("c:/users")).toBe(true);
    });

    it("~ 开头", () => {
      expect(isLocalFolderMentionQuery("~/Documents")).toBe(true);
      expect(isLocalFolderMentionQuery("~\\Documents")).toBe(true);
    });

    it("不以 /、盘符、~ 开头", () => {
      expect(isLocalFolderMentionQuery("Documents")).toBe(false);
      expect(isLocalFolderMentionQuery("foo/bar")).toBe(false);
    });

    it("带前后空白", () => {
      expect(isLocalFolderMentionQuery("  /path  ")).toBe(true);
    });
  });

  describe("getLocalFolderBrowseRootPath", () => {
    it("homeDir 为空时返回 null", () => {
      expect(getLocalFolderBrowseRootPath(null, false)).toBeNull();
      expect(getLocalFolderBrowseRootPath("", true)).toBeNull();
      expect(getLocalFolderBrowseRootPath("   ", false)).toBeNull();
    });

    it("preferFilesystemRoot=false 时直接返回 homeDir", () => {
      expect(getLocalFolderBrowseRootPath("/home/user", false)).toBe("/home/user");
    });

    it("Windows 盘符 + preferFilesystemRoot=true 返回盘符根", () => {
      const result = getLocalFolderBrowseRootPath("C:/Users/foo", true);
      expect(result).toBe("C:\\");
    });

    it("Unix 路径 + preferFilesystemRoot=true 返回 /", () => {
      expect(getLocalFolderBrowseRootPath("/home/user", true)).toBe("/");
    });

    it("非盘符非 Unix 路径 + preferFilesystemRoot=true 返回原 homeDir", () => {
      expect(getLocalFolderBrowseRootPath("home/user", true)).toBe("home/user");
    });
  });

  describe("expandLocalFolderPath", () => {
    it("空 value 返回 value", () => {
      expect(expandLocalFolderPath("", "/home")).toBe("");
    });

    it("无 homeDir 返回原 value", () => {
      expect(expandLocalFolderPath("~/foo", null)).toBe("~/foo");
      expect(expandLocalFolderPath("~/foo", "")).toBe("~/foo");
    });

    it("单独的 ~ 展开为 homeDir", () => {
      expect(expandLocalFolderPath("~", "/home/user")).toBe("/home/user");
    });

    it("~/path 展开为 homeDir/path", () => {
      expect(expandLocalFolderPath("~/Documents", "/home/user")).toBe(
        "/home/user/Documents",
      );
    });

    it("~\\path 展开为 homeDir\\path(Windows)", () => {
      expect(expandLocalFolderPath("~\\Documents", "C:\\Users\\foo")).toBe(
        "C:\\Users\\foo\\Documents",
      );
    });

    it("homeDir 末尾带分隔符时不再追加", () => {
      expect(expandLocalFolderPath("~/foo", "/home/user/")).toBe("/home/user/foo");
    });

    it("无 ~ 前缀返回原 value", () => {
      expect(expandLocalFolderPath("/abs/path", "/home")).toBe("/abs/path");
    });
  });
});
