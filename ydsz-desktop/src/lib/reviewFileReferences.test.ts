/**
 * @file reviewFileReferences 单元测试
 *
 * 覆盖：相对/绝对路径、行列号、行范围、反引号包裹、误识别排除等。
 */

import { describe, expect, it } from "vitest";
import {
  buildEditorTargetPath,
  parseReviewReferences,
  splitTextWithReviewReferences,
  type ParsedReviewReference,
} from "./reviewFileReferences";

const CWD = "/repo";

describe("parseReviewReferences", () => {
  it("解析简单相对路径", () => {
    const refs = parseReviewReferences("see src/foo.ts:42 for details", CWD);
    expect(refs).toHaveLength(1);
    expect(refs[0].path).toBe("/repo/src/foo.ts");
    expect(refs[0].line).toBe(42);
  });

  it("解析带行范围的相对路径", () => {
    const refs = parseReviewReferences("check src/foo.ts:10-20 now", CWD);
    expect(refs).toHaveLength(1);
    expect(refs[0].path).toBe("/repo/src/foo.ts");
    expect(refs[0].line).toBe(10);
    expect(refs[0].endLine).toBe(20);
  });

  it("解析带列号的相对路径", () => {
    const refs = parseReviewReferences("at src/foo.ts:42:5", CWD);
    expect(refs).toHaveLength(1);
    expect(refs[0].line).toBe(42);
    expect(refs[0].column).toBe(5);
  });

  it("解析 ../ 相对路径", () => {
    // 从 /repo 出发 ../shared 即为 /shared（POSIX 归一化）
    const refs = parseReviewReferences("see ../shared/types.ts:10", CWD);
    expect(refs).toHaveLength(1);
    expect(refs[0].path).toBe("/shared/types.ts");
    expect(refs[0].line).toBe(10);
  });

  it("解析 ./ 相对路径（POSIX 归一化去除 ./）", () => {
    const refs = parseReviewReferences("see ./src/foo.ts:42", CWD);
    expect(refs).toHaveLength(1);
    expect(refs[0].path).toBe("/repo/src/foo.ts");
  });

  it("解析绝对 POSIX 路径", () => {
    const refs = parseReviewReferences("file /Users/x/code/foo.ts:42 exists", CWD);
    expect(refs).toHaveLength(1);
    expect(refs[0].path).toBe("/Users/x/code/foo.ts");
  });

  it("解析 Windows 盘符路径（反斜杠）", () => {
    const refs = parseReviewReferences("C:\\code\\foo.ts:42 broken", CWD);
    expect(refs).toHaveLength(1);
    expect(refs[0].path).toBe("C:\\code\\foo.ts");
  });

  it("解析多个引用", () => {
    const refs = parseReviewReferences("a.ts:1 and b.ts:2", CWD);
    expect(refs).toHaveLength(2);
    expect(refs[0].path).toBe("/repo/a.ts");
    expect(refs[0].line).toBe(1);
    expect(refs[1].path).toBe("/repo/b.ts");
    expect(refs[1].line).toBe(2);
  });

  it("识别反引号包裹的引用", () => {
    const refs = parseReviewReferences("see `src/foo.ts:42` ok", CWD);
    expect(refs).toHaveLength(1);
    expect(refs[0].backticked).toBe(true);
  });

  it("反引号包裹时 end 应包含结尾反引号", () => {
    const text = "see `src/foo.ts:42` ok";
    const refs = parseReviewReferences(text, CWD);
    expect(refs).toHaveLength(1);
    // end 应指向第二个反引号之后（位置 19）
    expect(refs[0].start).toBe(text.indexOf("`"));
    expect(refs[0].end).toBe(text.indexOf("`", text.indexOf("`") + 1) + 1);
  });

  it("只有起始反引号时不算 backticked", () => {
    const refs = parseReviewReferences("see `src/foo.ts:42 broken", CWD);
    expect(refs).toHaveLength(1);
    expect(refs[0].backticked).toBe(false);
  });

  it("只有结尾反引号时也不算 backticked", () => {
    const refs = parseReviewReferences("see src/foo.ts:42` broken", CWD);
    expect(refs).toHaveLength(1);
    expect(refs[0].backticked).toBe(false);
  });

  it("splitTextWithReviewReferences 在反引号包裹时不输出反引号", () => {
    const segs = splitTextWithReviewReferences("see `src/foo.ts:42` end", CWD);
    // 期望: text "see ", reference, text " end"
    expect(segs).toHaveLength(3);
    expect(segs[0]).toEqual({ kind: "text", text: "see " });
    expect(segs[1].kind).toBe("reference");
    expect(segs[2]).toEqual({ kind: "text", text: " end" });
  });

  it("字符串末尾的反引号包裹", () => {
    const text = "src/foo.ts:42`";
    const refs = parseReviewReferences(text, CWD);
    expect(refs).toHaveLength(1);
    // 没有起始反引号
    expect(refs[0].backticked).toBe(false);
  });

  it("忽略明显过大的行号（> 100000）", () => {
    const refs = parseReviewReferences("src/foo.ts:999999", CWD);
    expect(refs).toHaveLength(0);
  });

  it("忽略行号 0", () => {
    const refs = parseReviewReferences("src/foo.ts:0", CWD);
    expect(refs).toHaveLength(0);
  });

  it("忽略 http URL 中的端口号", () => {
    const refs = parseReviewReferences("see http://example.com:8080/path", CWD);
    expect(refs).toHaveLength(0);
  });

  it("不识别普通英文词（无扩展名）", () => {
    const refs = parseReviewReferences("version 1.2:5 of lib", CWD);
    expect(refs).toHaveLength(0);
  });

  it("不识别无扩展名相对路径", () => {
    const refs = parseReviewReferences("see src/foo:42 but no ext", CWD);
    expect(refs).toHaveLength(0);
  });

  it("空字符串返回空数组", () => {
    expect(parseReviewReferences("", CWD)).toEqual([]);
  });
});

describe("splitTextWithReviewReferences", () => {
  it("无引用时返回单个 text 段", () => {
    const segs = splitTextWithReviewReferences("hello world", CWD);
    expect(segs).toEqual([{ kind: "text", text: "hello world" }]);
  });

  it("首部引用 + 尾部文本", () => {
    const segs = splitTextWithReviewReferences("src/foo.ts:42 is broken", CWD);
    expect(segs).toHaveLength(2);
    expect(segs[0].kind).toBe("reference");
    expect(segs[1]).toEqual({ kind: "text", text: " is broken" });
  });

  it("首部文本 + 尾部引用", () => {
    const segs = splitTextWithReviewReferences("see src/foo.ts:42", CWD);
    expect(segs).toHaveLength(2);
    expect(segs[0]?.kind).toBe("text");
    if (segs[0]?.kind === "text") {
      expect(segs[0].text).toBe("see ");
    }
    expect(segs[1]?.kind).toBe("reference");
  });

  it("中间引用 + 前后文本", () => {
    const segs = splitTextWithReviewReferences("before src/foo.ts:42 after", CWD);
    expect(segs).toHaveLength(3);
    expect(segs[0]).toEqual({ kind: "text", text: "before " });
    expect(segs[1].kind).toBe("reference");
    expect(segs[2]).toEqual({ kind: "text", text: " after" });
  });

  it("多个引用交替", () => {
    const segs = splitTextWithReviewReferences("a.ts:1 + b.ts:2 done", CWD);
    const referenceCount = segs.filter((s) => s.kind === "reference").length;
    expect(referenceCount).toBe(2);
  });
});

describe("buildEditorTargetPath", () => {
  it("仅行号", () => {
    const ref: ParsedReviewReference = {
      start: 0,
      end: 5,
      path: "/repo/a.ts",
      line: 42,
      backticked: false,
    };
    expect(buildEditorTargetPath(ref)).toBe("/repo/a.ts:42");
  });

  it("行号 + 列号", () => {
    const ref: ParsedReviewReference = {
      start: 0,
      end: 5,
      path: "/repo/a.ts",
      line: 42,
      column: 5,
      backticked: false,
    };
    expect(buildEditorTargetPath(ref)).toBe("/repo/a.ts:42:5");
  });

  it("行范围", () => {
    const ref: ParsedReviewReference = {
      start: 0,
      end: 5,
      path: "/repo/a.ts",
      line: 10,
      endLine: 20,
      backticked: false,
    };
    expect(buildEditorTargetPath(ref)).toBe("/repo/a.ts:10");
  });
});
