/**
 * @file project 契约测试
 *
 * 互联网大厂基线：
 * - 输入参数边界（maxLength、PositiveInt 上限）
 * - 输出结构稳定
 * - 拒绝非法 cwd / path
 */
import { describe, it, expect } from "vitest";
import { Schema } from "effect";
import {
  ProjectKind,
  ProjectEntry,
  ProjectSearchEntriesInput,
  ProjectSearchEntriesResult,
  ProjectListDirectoriesInput,
  ProjectListDirectoriesResult,
  ProjectSearchLocalEntriesInput,
  ProjectSearchLocalEntriesResult,
  ProjectWriteFileInput,
  ProjectWriteFileResult,
} from "./project";

const decode = <A, I>(schema: Schema.Schema<A, I>, input: unknown) =>
  Schema.decodeUnknownSync(schema)(input);

describe("project contracts", () => {
  describe("ProjectKind", () => {
    it("接受 'project'", () => {
      expect(decode(ProjectKind, "project")).toBe("project");
    });

    it("接受 'chat'", () => {
      expect(decode(ProjectKind, "chat")).toBe("chat");
    });

    it("拒绝未知 kind", () => {
      expect(() => decode(ProjectKind, "other")).toThrow();
    });
  });

  describe("ProjectEntry", () => {
    it("接受 file entry", () => {
      const entry = decode(ProjectEntry, {
        path: "/home/user/file.ts",
        kind: "file",
      });
      expect(entry).toEqual({
        path: "/home/user/file.ts",
        kind: "file",
      });
    });

    it("接受 directory entry", () => {
      const entry = decode(ProjectEntry, {
        path: "/home/user/dir",
        kind: "directory",
      });
      expect(entry.kind).toBe("directory");
    });

    it("接受可选 parentPath", () => {
      const entry = decode(ProjectEntry, {
        path: "/home/user/file.ts",
        kind: "file",
        parentPath: "/home/user",
      });
      expect(entry.parentPath).toBe("/home/user");
    });

    it("拒绝空 path", () => {
      expect(() =>
        decode(ProjectEntry, { path: "", kind: "file" }),
      ).toThrow();
    });

    it("拒绝未知 kind", () => {
      expect(() =>
        decode(ProjectEntry, { path: "/x", kind: "symlink" }),
      ).toThrow();
    });
  });

  describe("ProjectSearchEntriesInput", () => {
    it("接受合法 input", () => {
      const input = decode(ProjectSearchEntriesInput, {
        cwd: "/home/user",
        query: "foo",
        limit: 50,
      });
      expect(input).toEqual({
        cwd: "/home/user",
        query: "foo",
        limit: 50,
      });
    });

    it("拒绝空 cwd", () => {
      expect(() =>
        decode(ProjectSearchEntriesInput, { cwd: "", query: "x", limit: 1 }),
      ).toThrow();
    });

    it("拒绝空 query", () => {
      expect(() =>
        decode(ProjectSearchEntriesInput, { cwd: "/x", query: "", limit: 1 }),
      ).toThrow();
    });

    it("拒绝超长 query（> 256）", () => {
      expect(() =>
        decode(ProjectSearchEntriesInput, {
          cwd: "/x",
          query: "a".repeat(257),
          limit: 1,
        }),
      ).toThrow();
    });

    it("接受边界 query（= 256）", () => {
      const input = decode(ProjectSearchEntriesInput, {
        cwd: "/x",
        query: "a".repeat(256),
        limit: 1,
      });
      expect(input.query.length).toBe(256);
    });

    it("拒绝 limit = 0", () => {
      expect(() =>
        decode(ProjectSearchEntriesInput, { cwd: "/x", query: "x", limit: 0 }),
      ).toThrow();
    });

    it("拒绝 limit 超过 200", () => {
      expect(() =>
        decode(ProjectSearchEntriesInput, {
          cwd: "/x",
          query: "x",
          limit: 201,
        }),
      ).toThrow();
    });

    it("接受 limit = 200（边界）", () => {
      const input = decode(ProjectSearchEntriesInput, {
        cwd: "/x",
        query: "x",
        limit: 200,
      });
      expect(input.limit).toBe(200);
    });
  });

  describe("ProjectSearchEntriesResult", () => {
    it("接受空 entries", () => {
      const result = decode(ProjectSearchEntriesResult, {
        entries: [],
        truncated: false,
      });
      expect(result.entries).toEqual([]);
      expect(result.truncated).toBe(false);
    });

    it("接受 truncated=true", () => {
      const result = decode(ProjectSearchEntriesResult, {
        entries: [{ path: "/a", kind: "file" }],
        truncated: true,
      });
      expect(result.truncated).toBe(true);
    });

    it("拒绝缺 truncated 字段", () => {
      expect(() =>
        decode(ProjectSearchEntriesResult, { entries: [] }),
      ).toThrow();
    });
  });

  describe("ProjectListDirectoriesInput", () => {
    it("接受最小 input", () => {
      const input = decode(ProjectListDirectoriesInput, {
        cwd: "/home/user",
      });
      expect(input.cwd).toBe("/home/user");
      expect(input.depth).toBeUndefined();
    });

    it("接受完整 input", () => {
      const input = decode(ProjectListDirectoriesInput, {
        cwd: "/home/user",
        relativePath: "src",
        depth: 3,
        includeFiles: true,
      });
      expect(input.relativePath).toBe("src");
      expect(input.depth).toBe(3);
      expect(input.includeFiles).toBe(true);
    });

    it("拒绝 depth = 0", () => {
      expect(() =>
        decode(ProjectListDirectoriesInput, { cwd: "/x", depth: 0 }),
      ).toThrow();
    });

    it("拒绝 depth 超过 32", () => {
      expect(() =>
        decode(ProjectListDirectoriesInput, { cwd: "/x", depth: 33 }),
      ).toThrow();
    });
  });

  describe("ProjectListDirectoriesResult", () => {
    it("接受空 entries", () => {
      const result = decode(ProjectListDirectoriesResult, { entries: [] });
      expect(result.entries).toEqual([]);
    });

    it("接受 fileSystemEntry", () => {
      const result = decode(ProjectListDirectoriesResult, {
        entries: [
          { path: "/a", name: "a", kind: "file", hasChildren: false },
          { path: "/b", name: "b", kind: "directory", hasChildren: true },
        ],
      });
      expect(result.entries.length).toBe(2);
    });
  });

  describe("ProjectSearchLocalEntriesInput", () => {
    it("接受 rootPath + query", () => {
      const input = decode(ProjectSearchLocalEntriesInput, {
        rootPath: "/home/user",
        query: "foo",
      });
      expect(input.rootPath).toBe("/home/user");
      expect(input.limit).toBeUndefined();
    });

    it("接受可选 limit (1-100)", () => {
      const input = decode(ProjectSearchLocalEntriesInput, {
        rootPath: "/x",
        query: "x",
        limit: 50,
      });
      expect(input.limit).toBe(50);
    });

    it("拒绝 limit > 100", () => {
      expect(() =>
        decode(ProjectSearchLocalEntriesInput, {
          rootPath: "/x",
          query: "x",
          limit: 101,
        }),
      ).toThrow();
    });
  });

  describe("ProjectWriteFileInput", () => {
    it("接受合法 input", () => {
      const input = decode(ProjectWriteFileInput, {
        cwd: "/home/user",
        relativePath: "src/main.ts",
        contents: "export const x = 1;",
      });
      expect(input.contents).toBe("export const x = 1;");
    });

    it("接受空 contents", () => {
      const input = decode(ProjectWriteFileInput, {
        cwd: "/x",
        relativePath: "empty.txt",
        contents: "",
      });
      expect(input.contents).toBe("");
    });

    it("拒绝超长 relativePath (> 512)", () => {
      expect(() =>
        decode(ProjectWriteFileInput, {
          cwd: "/x",
          relativePath: "a".repeat(513),
          contents: "",
        }),
      ).toThrow();
    });
  });

  describe("ProjectWriteFileResult", () => {
    it("接受 relativePath", () => {
      const result = decode(ProjectWriteFileResult, {
        relativePath: "src/main.ts",
      });
      expect(result.relativePath).toBe("src/main.ts");
    });
  });

  describe("ProjectSearchLocalEntriesResult", () => {
    it("接受 entries + truncated", () => {
      const result = decode(ProjectSearchLocalEntriesResult, {
        entries: [],
        truncated: true,
      });
      expect(result.truncated).toBe(true);
    });
  });
});
