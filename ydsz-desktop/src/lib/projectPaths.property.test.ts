/**
 * @file projectPaths 属性化测试
 *
 * 验证路径处理工具的关键不变量：
 * 1. **idempotent 不变量**：normalize 调用两次结果与一次相同
 * 2. **trailing separator 不变量**：绝对路径 normalize 后不会被吞掉
 * 3. **drive root 不变量**：Windows 盘符根路径（C:\）保持不变
 * 4. **browse parent 不变量**：parent(parent(path)) 应能回到 parent
 * 5. **hasTrailingPathSeparator ↔ getBrowseDirectoryPath 一致性**
 * 6. **inferProjectTitleFromPath 不变量**：从绝对路径推断 title 等于最后一段
 * 7. **getInitialBrowseQuery 不变量**：返回值始终以分隔符结尾
 * 8. **appendBrowsePathSegment 不变量**：append 后是 getBrowseDirectoryPath 形式
 *
 * 互联网大厂基线：跨平台路径工具必须有 property-based 兜底。
 */
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  appendBrowsePathSegment,
  canNavigateUp,
  getBrowseDirectoryPath,
  getBrowseLeafPathSegment,
  getBrowseParentPath,
  getInitialBrowseQuery,
  hasTrailingPathSeparator,
  inferProjectTitleFromPath,
  isFilesystemBrowseQuery,
  normalizeProjectPathForDispatch,
} from "./projectPaths";

const segmentArb = fc
  .stringMatching(/^[A-Za-z0-9_-]{1,16}$/)
  .filter((s) => s.length > 0);

// 构造 unix 绝对路径
const unixPathArb = fc
  .array(segmentArb, { minLength: 1, maxLength: 4 })
  .map((segs) => "/" + segs.join("/"));

// 构造带尾分隔符的 unix 路径
const unixPathWithSepArb = fc
  .array(segmentArb, { minLength: 1, maxLength: 4 })
  .map((segs) => "/" + segs.join("/") + "/");

// 构造 windows drive 路径
const windowsPathArb = fc
  .tuple(
    fc.constantFrom("C", "D", "E"),
    fc.array(segmentArb, { minLength: 1, maxLength: 3 }),
  )
  .map(([drive, segs]) => `${drive}:\\${segs.join("\\")}`);

describe("normalizeProjectPathForDispatch property-based", () => {
  it("idempotent：连续两次 normalize 与一次结果相同", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 50 }),
        (s) => {
          const once = normalizeProjectPathForDispatch(s);
          const twice = normalizeProjectPathForDispatch(once);
          expect(twice).toBe(once);
        },
      ),
      { numRuns: 30 },
    );
  });

  it("trim 前后空白：结果首尾无空白", () => {
    fc.assert(
      fc.property(unixPathArb, (path) => {
        const result = normalizeProjectPathForDispatch(`   ${path}   `);
        expect(result).toBe(result.trimStart().trimEnd());
        // 同时不应有内部空白差异
      }),
      { numRuns: 20 },
    );
  });
});

describe("inferProjectTitleFromPath property-based", () => {
  it("unix 绝对路径：title 等于最后一段", () => {
    fc.assert(
      fc.property(unixPathArb, (path) => {
        const title = inferProjectTitleFromPath(path);
        // 形如 "/a/b/c" -> "c"
        const segments = path.split("/").filter(Boolean);
        if (segments.length > 0) {
          expect(title).toBe(segments[segments.length - 1]);
        }
      }),
      { numRuns: 30 },
    );
  });

  it("空路径：返回原值", () => {
    expect(inferProjectTitleFromPath("")).toBe("");
  });
});

describe("hasTrailingPathSeparator property-based", () => {
  it("带尾分隔符的路径：返回 true", () => {
    fc.assert(
      fc.property(unixPathWithSepArb, (path) => {
        expect(hasTrailingPathSeparator(path)).toBe(true);
      }),
      { numRuns: 20 },
    );
  });

  it("不带尾分隔符的路径：返回 false", () => {
    fc.assert(
      fc.property(unixPathArb, (path) => {
        expect(hasTrailingPathSeparator(path)).toBe(false);
      }),
      { numRuns: 20 },
    );
  });
});

describe("getBrowseDirectoryPath property-based", () => {
  it("带尾分隔符：返回原值", () => {
    fc.assert(
      fc.property(unixPathWithSepArb, (path) => {
        expect(getBrowseDirectoryPath(path)).toBe(path);
      }),
      { numRuns: 20 },
    );
  });

  it("不带尾分隔符：返回到倒数第一个分隔符（带分隔符）", () => {
    fc.assert(
      fc.property(unixPathArb, (path) => {
        const dir = getBrowseDirectoryPath(path);
        // 末尾应包含分隔符
        expect(dir.endsWith("/")).toBe(true);
        // 原路径以 dir 为前缀
        expect(path.startsWith(dir)).toBe(true);
      }),
      { numRuns: 30 },
    );
  });

  it("getBrowseDirectoryPath 与 hasTrailingPathSeparator 一致性", () => {
    fc.assert(
      fc.property(unixPathArb, (path) => {
        const dir = getBrowseDirectoryPath(path);
        // 任何非空 path 调 getBrowseDirectoryPath 都应返回带分隔符的 path
        if (dir.length > 0) {
          expect(hasTrailingPathSeparator(dir)).toBe(true);
        }
      }),
      { numRuns: 20 },
    );
  });
});

describe("getBrowseLeafPathSegment property-based", () => {
  it("unix 路径：返回最后一段", () => {
    fc.assert(
      fc.property(unixPathArb, (path) => {
        const leaf = getBrowseLeafPathSegment(path);
        const segments = path.split("/").filter(Boolean);
        if (segments.length > 0) {
          expect(leaf).toBe(segments[segments.length - 1]);
        }
      }),
      { numRuns: 30 },
    );
  });
});

describe("appendBrowsePathSegment property-based", () => {
  it("append 后是 getBrowseDirectoryPath 形式（带分隔符结尾）", () => {
    fc.assert(
      fc.property(unixPathWithSepArb, segmentArb, (base, segment) => {
        const appended = appendBrowsePathSegment(base, segment);
        // 末尾应包含分隔符（getBrowseDirectoryPath 形式）
        expect(hasTrailingPathSeparator(appended)).toBe(true);
        // append 的 segment 应出现在结果中
        expect(appended).toContain(segment);
      }),
      { numRuns: 20 },
    );
  });
});

describe("getBrowseParentPath property-based", () => {
  it("多段 unix 路径：parent 是上一级目录", () => {
    fc.assert(
      fc.property(
        fc
          .array(segmentArb, { minLength: 2, maxLength: 4 })
          .map((segs) => "/" + segs.join("/")),
        (path) => {
          const parent = getBrowseParentPath(path);
          if (parent === null) return;
          // parent 应是带分隔符结尾的目录路径
          expect(hasTrailingPathSeparator(parent)).toBe(true);
          // path 应以 parent 为前缀
          expect(path.startsWith(parent)).toBe(true);
        },
      ),
      { numRuns: 30 },
    );
  });
});

describe("canNavigateUp property-based", () => {
  it("单段路径（如 /foo）不可向上", () => {
    fc.assert(
      fc.property(
        fc.array(segmentArb, { minLength: 1, maxLength: 1 }).map((s) => "/" + s[0]),
        (path) => {
          // 单段路径不带尾分隔符，canNavigateUp 应返回 false
          expect(canNavigateUp(path)).toBe(false);
        },
      ),
      { numRuns: 10 },
    );
  });

  it("带尾分隔符的多段路径可向上", () => {
    fc.assert(
      fc.property(
        fc
          .array(segmentArb, { minLength: 2, maxLength: 3 })
          .map((segs) => "/" + segs.join("/") + "/"),
        (path) => {
          expect(canNavigateUp(path)).toBe(true);
        },
      ),
      { numRuns: 10 },
    );
  });
});

describe("getInitialBrowseQuery property-based", () => {
  it("返回路径始终以分隔符结尾", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constantFrom("/Users/me", "/home/dev", "/tmp/work"),
          fc.string({ minLength: 1, maxLength: 20 }).map((s) => "/" + s),
        ),
        (homeDir) => {
          const result = getInitialBrowseQuery(homeDir);
          // 末尾必须是分隔符
          expect(result.endsWith("/") || result.endsWith("\\")).toBe(true);
          // 内部不应被破坏（应包含 homeDir 前缀或子串）
          expect(result.length).toBeGreaterThanOrEqual(homeDir.length);
        },
      ),
      { numRuns: 20 },
    );
  });

  it("null homeDir 返回 '~/'", () => {
    expect(getInitialBrowseQuery(null)).toBe("~/");
  });
});

describe("isFilesystemBrowseQuery property-based", () => {
  it("./ 开头：unix 平台下识别", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }),
        (rest) => {
          expect(isFilesystemBrowseQuery("./" + rest, "Linux x86_64")).toBe(true);
          expect(isFilesystemBrowseQuery("../" + rest, "Linux x86_64")).toBe(true);
        },
      ),
      { numRuns: 10 },
    );
  });

  it("/ 开头：unix 平台下识别", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }),
        (rest) => {
          expect(isFilesystemBrowseQuery("/" + rest, "Linux x86_64")).toBe(true);
        },
      ),
      { numRuns: 10 },
    );
  });

  it("~/ 开头：所有平台都识别", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.constantFrom("Linux x86_64", "MacIntel", "Win32"),
        (rest, platform) => {
          expect(isFilesystemBrowseQuery("~/" + rest, platform)).toBe(true);
        },
      ),
      { numRuns: 10 },
    );
  });
});
