/**
 * @file ReviewFileReferenceLink 组件测试
 *
 * 验证 path:line 引用渲染为可点击链接的行为：
 * - 普通 vs 反引号样式
 * - 点击调用 openInPreferredEditor
 * - title 包含完整路径和位置
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReviewFileReferenceLink } from "./ReviewFileReferenceLink";
import type { ParsedReviewReference } from "../../lib/reviewFileReferences";

const mockOpenInPreferredEditor = vi.fn();
const mockReadNativeApi = vi.fn();

vi.mock("../../editorPreferences", () => ({
  openInPreferredEditor: (...args: unknown[]) => mockOpenInPreferredEditor(...args),
}));

vi.mock("../../nativeApi", () => ({
  readNativeApi: () => mockReadNativeApi(),
}));

function makeRef(overrides: Partial<ParsedReviewReference> = {}): ParsedReviewReference {
  return {
    start: 0,
    end: 13,
    path: "/repo/src/foo.ts",
    line: 42,
    backticked: false,
    ...overrides,
  };
}

describe("ReviewFileReferenceLink", () => {
  beforeEach(() => {
    mockOpenInPreferredEditor.mockReset();
    mockReadNativeApi.mockReset();
  });

  it("渲染普通样式（无 backticked，无 inCodeContext）", () => {
    render(<ReviewFileReferenceLink reference={makeRef()} />);
    const link = screen.getByTestId("review-file-reference-link");
    expect(link).toBeTruthy();
    expect(link.textContent).toContain("foo.ts:42");
  });

  it("反引号包裹时只显示 file:line", () => {
    const ref = makeRef({ backticked: true });
    render(<ReviewFileReferenceLink reference={ref} />);
    const link = screen.getByTestId("review-file-reference-link");
    // 反引号样式只显示 basename + 行号
    expect(link.textContent).toContain("foo.ts:42");
  });

  it("inCodeContext 时显示带列号", () => {
    const ref = makeRef({ column: 5 });
    render(<ReviewFileReferenceLink reference={ref} inCodeContext />);
    const link = screen.getByTestId("review-file-reference-link");
    expect(link.textContent).toContain("foo.ts:42:5");
  });

  it("点击调用 native API 打开编辑器", () => {
    const api = { openInEditor: vi.fn() };
    mockReadNativeApi.mockReturnValue(api);
    mockOpenInPreferredEditor.mockResolvedValue(undefined);
    const ref = makeRef({ line: 100 });
    render(<ReviewFileReferenceLink reference={ref} />);
    fireEvent.click(screen.getByTestId("review-file-reference-link"));
    expect(mockOpenInPreferredEditor).toHaveBeenCalledWith(api, "/repo/src/foo.ts:100");
  });

  it("没有 native API 时点击不抛错（仅 console.warn）", () => {
    mockReadNativeApi.mockReturnValue(null);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const ref = makeRef();
    render(<ReviewFileReferenceLink reference={ref} />);
    fireEvent.click(screen.getByTestId("review-file-reference-link"));
    expect(warnSpy).toHaveBeenCalled();
    expect(mockOpenInPreferredEditor).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("包含完整路径作为 title 提示", () => {
    const ref = makeRef({ endLine: 50, column: 3 });
    render(<ReviewFileReferenceLink reference={ref} />);
    const link = screen.getByTestId("review-file-reference-link");
    expect(link.getAttribute("title")).toContain("/repo/src/foo.ts");
    expect(link.getAttribute("title")).toContain("42-50");
    expect(link.getAttribute("title")).toContain(":3");
  });
});
