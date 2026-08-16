/**
 * @file logging.ts 单元测试
 *
 * 覆盖：
 * 1. RotatingFileSink - 轮转文件接收器（构造、写入、轮转、清理）
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RotatingFileSink } from "./logging";

const tempRoots: string[] = [];

function createTempDir(prefix: string): string {
  const root = join(
    tmpdir(),
    `logging-test-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  mkdirSync(root, { recursive: true });
  tempRoots.push(root);
  return root;
}

function readUtf8(path: string): string {
  return readFileSync(path, "utf8");
}

describe("logging", () => {
  describe("RotatingFileSink", () => {
    let root: string;

    beforeEach(() => {
      root = createTempDir("rotating");
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("构造时创建父目录", () => {
      const target = join(root, "nested", "deep", "app.log");
      // 故意不创建父目录
      expect(existsSync(join(root, "nested"))).toBe(false);

      const sink = new RotatingFileSink({
        filePath: target,
        maxBytes: 1024,
        maxFiles: 3,
      });

      expect(existsSync(join(root, "nested", "deep"))).toBe(true);
      sink.write("hello\n");
      expect(readUtf8(target)).toBe("hello\n");
    });

    it("空 chunk 写入被忽略", () => {
      const target = join(root, "app.log");
      const sink = new RotatingFileSink({
        filePath: target,
        maxBytes: 1024,
        maxFiles: 3,
      });

      sink.write("");
      sink.write(Buffer.alloc(0));
      // 第一次写入会让 currentSize = 0，append 不会创建文件
      expect(existsSync(target)).toBe(false);
    });

    it("超过 maxBytes 时触发轮转", () => {
      const target = join(root, "app.log");
      const sink = new RotatingFileSink({
        filePath: target,
        maxBytes: 5,
        maxFiles: 3,
      });

      sink.write("AAAAA"); // 5 字节，不轮转
      expect(readUtf8(target)).toBe("AAAAA");
      expect(existsSync(`${target}.1`)).toBe(false);

      sink.write("B"); // 累计 6 字节，超出 maxBytes 5，轮转
      expect(readUtf8(target)).toBe("B");
      expect(readUtf8(`${target}.1`)).toBe("AAAAA");
    });

    it("轮转时旧文件按 .N 编号迁移并裁剪历史", () => {
      const target = join(root, "app.log");
      const sink = new RotatingFileSink({
        filePath: target,
        maxBytes: 1,
        maxFiles: 2,
      });

      // maxBytes=1 时每次写入都会触发轮转
      sink.write("A"); // 写入 A，currentSize=1，不 > 1
      sink.write("B"); // currentSize(1) + 1 = 2 > 1 → rotate 后写入 B
      sink.write("C"); // 再次 rotate 后写入 C
      sink.write("D"); // 再次 rotate 后写入 D

      // 当前文件
      expect(readUtf8(target)).toBe("D");
      // 最近一次轮转的备份
      expect(readUtf8(`${target}.1`)).toBe("C");
      // 上上次
      expect(readUtf8(`${target}.2`)).toBe("B");
      // maxFiles=2 不会保留 .3
      expect(existsSync(`${target}.3`)).toBe(false);
    });

    it("启动时清理超过 maxFiles 的历史备份", () => {
      const target = join(root, "app.log");

      // 预先放置 5 个历史备份
      writeFileSync(target, "current\n");
      writeFileSync(`${target}.1`, "1\n");
      writeFileSync(`${target}.2`, "2\n");
      writeFileSync(`${target}.3`, "3\n");
      writeFileSync(`${target}.4`, "4\n");
      writeFileSync(`${target}.5`, "5\n");

      const sink = new RotatingFileSink({
        filePath: target,
        maxBytes: 100,
        maxFiles: 2,
      });

      // maxFiles=2，预期 .3 .4 .5 被删除
      const remaining = readdirSync(root).filter((f) => f.startsWith("app.log"));
      expect(remaining.sort()).toEqual(["app.log", "app.log.1", "app.log.2"]);

      // currentSize 应当反映文件实际大小（去掉换行 1 字节 -> 8 字节）
      sink.write("more\n");
      expect(readUtf8(target)).toBe("current\nmore\n");
    });

    it("写入失败时回滚 currentSize 且不抛出（throwOnError=false）", () => {
      const target = join(root, "app.log");
      const sink = new RotatingFileSink({
        filePath: target,
        maxBytes: 10,
        maxFiles: 2,
        throwOnError: false,
      });

      // 模拟 appendFileSync 抛错
      const appendSpy = vi
        .spyOn(require("node:fs"), "appendFileSync")
        .mockImplementation(() => {
          throw new Error("disk full");
        });

      expect(() => sink.write("hello")).not.toThrow();

      appendSpy.mockRestore();
    });

    it("写入失败且 throwOnError=true 时抛出", () => {
      const target = join(root, "app.log");
      const sink = new RotatingFileSink({
        filePath: target,
        maxBytes: 10,
        maxFiles: 2,
        throwOnError: true,
      });

      const appendSpy = vi
        .spyOn(require("node:fs"), "appendFileSync")
        .mockImplementation(() => {
          throw new Error("disk full");
        });

      expect(() => sink.write("hello")).toThrow(/Failed to write log chunk/);

      appendSpy.mockRestore();
    });

    it("maxBytes < 1 抛出", () => {
      expect(
        () =>
          new RotatingFileSink({
            filePath: join(root, "app.log"),
            maxBytes: 0,
            maxFiles: 1,
          }),
      ).toThrow(/maxBytes must be >= 1/);
    });

    it("maxFiles < 1 抛出", () => {
      expect(
        () =>
          new RotatingFileSink({
            filePath: join(root, "app.log"),
            maxBytes: 1,
            maxFiles: 0,
          }),
      ).toThrow(/maxFiles must be >= 1/);
    });

    it("接受 Buffer 类型的 chunk", () => {
      const target = join(root, "app.log");
      const sink = new RotatingFileSink({
        filePath: target,
        maxBytes: 1024,
        maxFiles: 2,
      });

      sink.write(Buffer.from("buffer content\n", "utf8"));
      expect(readUtf8(target)).toBe("buffer content\n");
    });

    it("轮转后写入的 currentSize 正确清零", () => {
      const target = join(root, "app.log");
      const sink = new RotatingFileSink({
        filePath: target,
        maxBytes: 3,
        maxFiles: 1,
      });

      sink.write("AAAA"); // 4 字节 -> 轮转
      sink.write("B"); // 1 字节，currentSize 应为 1
      expect(readUtf8(target)).toBe("B");
      expect(existsSync(`${target}.1`)).toBe(true);
    });

    it("轮转失败时不抛出（throwOnError=false）", () => {
      const target = join(root, "app.log");
      const sink = new RotatingFileSink({
        filePath: target,
        maxBytes: 3,
        maxFiles: 1,
        throwOnError: false,
      });

      sink.write("AAAA"); // 写入 + 触发轮转

      // 强制 readdir 失败
      const readdirSpy = vi
        .spyOn(require("node:fs"), "readdirSync")
        .mockImplementation(() => {
          throw new Error("permission denied");
        });

      // 再次写入触发轮转但目录读失败
      expect(() => sink.write("BBBB")).not.toThrow();
      readdirSpy.mockRestore();
    });

    it("轮转失败且 throwOnError=true 时抛出", () => {
      const target = join(root, "app.log");
      const sink = new RotatingFileSink({
        filePath: target,
        maxBytes: 3,
        maxFiles: 1,
        throwOnError: true,
      });

      sink.write("AAAA"); // 4 字节 > 3 触发 rotate 成功

      const renameSpy = vi
        .spyOn(require("node:fs"), "renameSync")
        .mockImplementation(() => {
          throw new Error("rename failed");
        });

      // rotate 抛错会被外层 write 的 catch 重新包装为 "Failed to write log chunk"
      expect(() => sink.write("BBBB")).toThrow(/Failed to write log chunk|Failed to rotate/);
      renameSpy.mockRestore();
    });

    it("启动时 readdir 失败且 throwOnError=true 时抛出", () => {
      const target = join(root, "app.log");
      const readdirSpy = vi
        .spyOn(require("node:fs"), "readdirSync")
        .mockImplementation(() => {
          throw new Error("readdir failed");
        });

      expect(
        () =>
          new RotatingFileSink({
            filePath: target,
            maxBytes: 10,
            maxFiles: 1,
            throwOnError: true,
          }),
      ).toThrow(/Failed to prune log backups/);
      readdirSpy.mockRestore();
    });
  });
});

// 清理所有临时目录
afterEach(() => {
  for (const r of tempRoots.splice(0)) {
    try {
      rmSync(r, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
});
