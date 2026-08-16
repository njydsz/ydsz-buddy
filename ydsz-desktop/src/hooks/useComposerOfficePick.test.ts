/**
 * @file useComposerOfficePick 单元测试
 *
 * 覆盖：
 * 1. trigger 为 null → items 为空数组,activeKind 为 null
 * 2. mention 触发器但非 @docx/@xlsx/@pdf → items 为空数组
 * 3. mention 触发器 = @docx → 显示 office-hint 提示选择文件
 * 4. mention 触发器 = @xlsx / @pdf → 同样显示 office-hint
 * 5. @documentation 等长前缀不会误匹配为 @docx
 * 6. triggerPick() 调用 → 弹对话框 → 选择文件 → invoke 提取成功 → 显示 office-result
 * 7. triggerPick() 用户取消选择文件 → 保持 hint
 * 8. triggerPick() invoke 抛错 → 显示 office-empty 错误
 * 9. kind 切换(@docx → @xlsx) → 自动清空旧 extractedFile
 * 10. reset() → 主动清空 hook 状态
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { ComposerTrigger } from "../composer-logic";

// Mock @tauri-apps/api/core 的 invoke
const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

// Mock @tauri-apps/plugin-dialog 的 open
const openMock = vi.fn();
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (...args: unknown[]) => openMock(...args),
}));

const { useComposerOfficePick, pickAndExtractOfficeFile } = await import(
  "./useComposerOfficePick"
);

function makeTrigger(query: string): ComposerTrigger {
  return { kind: "mention", query };
}

beforeEach(() => {
  invokeMock.mockReset();
  openMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useComposerOfficePick / trigger matching", () => {
  it("trigger 为 null 时 items 为空,activeKind 为 null", () => {
    const { result } = renderHook(() => useComposerOfficePick(null));
    expect(result.current.items).toEqual([]);
    expect(result.current.activeKind).toBeNull();
    expect(result.current.isPicking).toBe(false);
    expect(result.current.hasError).toBe(false);
  });

  it("mention 触发器但非 @docx/@xlsx/@pdf → items 为空", () => {
    const { result } = renderHook(() => useComposerOfficePick(makeTrigger("wiki foo")));
    expect(result.current.items).toEqual([]);
    expect(result.current.activeKind).toBeNull();
  });

  it("@docx 触发器 → 显示 office-hint 提示选择文件", () => {
    const { result } = renderHook(() => useComposerOfficePick(makeTrigger("docx")));
    expect(result.current.activeKind).toBe("docx");
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]?.type).toBe("office-hint");
    expect(result.current.items[0]?.officeKind).toBe("docx");
  });

  it("@xlsx 触发器 → 显示 office-hint 提示选择文件", () => {
    const { result } = renderHook(() => useComposerOfficePick(makeTrigger("xlsx")));
    expect(result.current.activeKind).toBe("xlsx");
    expect(result.current.items[0]?.type).toBe("office-hint");
    expect(result.current.items[0]?.officeKind).toBe("xlsx");
  });

  it("@pdf 触发器 → 显示 office-hint 提示选择文件", () => {
    const { result } = renderHook(() => useComposerOfficePick(makeTrigger("pdf")));
    expect(result.current.activeKind).toBe("pdf");
    expect(result.current.items[0]?.type).toBe("office-hint");
    expect(result.current.items[0]?.officeKind).toBe("pdf");
  });

  it("@documentation 等长前缀不会误匹配为 @docx", () => {
    const { result } = renderHook(() => useComposerOfficePick(makeTrigger("documentation")));
    expect(result.current.activeKind).toBeNull();
    expect(result.current.items).toEqual([]);
  });

  it("docx 后跟其他字符(query 包含空格)也不匹配", () => {
    const { result } = renderHook(() => useComposerOfficePick(makeTrigger("docx foo")));
    expect(result.current.activeKind).toBeNull();
  });
});

describe("useComposerOfficePick / triggerPick flow", () => {
  it("triggerPick() 选择文件 + docx 提取成功 → 显示 office-result", async () => {
    openMock.mockResolvedValueOnce("C:/docs/quarterly-report.docx");
    invokeMock.mockResolvedValueOnce([
      "项目概述",
      "本季度关键成果包括...",
      "下一季度计划",
    ]);

    const { result } = renderHook(() => useComposerOfficePick(makeTrigger("docx")));

    await act(async () => {
      await result.current.triggerPick();
    });

    expect(openMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith("office_docx_read", {
      path: "C:/docs/quarterly-report.docx",
    });
    expect(result.current.isPicking).toBe(false);
    expect(result.current.hasError).toBe(false);
    expect(result.current.extractedFile).not.toBeNull();
    expect(result.current.extractedFile?.filePath).toBe("C:/docs/quarterly-report.docx");

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]?.type).toBe("office-result");
    expect(result.current.items[0]?.file).toBe("C:/docs/quarterly-report.docx");
    expect(result.current.items[0]?.label).toBe("quarterly-report");
    expect(result.current.items[0]?.description).toContain("3 段");
  });

  it("triggerPick() 选择文件 + xlsx 提取成功 → 走 office_xlsx_read", async () => {
    openMock.mockResolvedValueOnce("/data/sales-2026Q1.xlsx");
    invokeMock.mockResolvedValueOnce([
      { sheetName: "Q1", rows: [["Region", "Sales"], ["APAC", "100"]] },
    ]);

    const { result } = renderHook(() => useComposerOfficePick(makeTrigger("xlsx")));

    await act(async () => {
      await result.current.triggerPick();
    });

    expect(invokeMock).toHaveBeenCalledWith("office_xlsx_read", {
      path: "/data/sales-2026Q1.xlsx",
    });
    expect(result.current.items[0]?.type).toBe("office-result");
    expect(result.current.items[0]?.description).toContain("1 sheet");
  });

  it("triggerPick() 选择文件 + pdf 提取成功 → 走 office_pdf_extract", async () => {
    openMock.mockResolvedValueOnce("/papers/transformer.pdf");
    invokeMock.mockResolvedValueOnce("Attention is all you need...");

    const { result } = renderHook(() => useComposerOfficePick(makeTrigger("pdf")));

    await act(async () => {
      await result.current.triggerPick();
    });

    expect(invokeMock).toHaveBeenCalledWith("office_pdf_extract", {
      path: "/papers/transformer.pdf",
    });
    expect(result.current.items[0]?.type).toBe("office-result");
  });

  it("triggerPick() 用户取消文件选择 → 保持 hint 状态", async () => {
    openMock.mockResolvedValueOnce(null);

    const { result } = renderHook(() => useComposerOfficePick(makeTrigger("docx")));

    await act(async () => {
      await result.current.triggerPick();
    });

    expect(invokeMock).not.toHaveBeenCalled();
    expect(result.current.isPicking).toBe(false);
    expect(result.current.hasError).toBe(false);
    expect(result.current.extractedFile).toBeNull();
    expect(result.current.items[0]?.type).toBe("office-hint");
  });

  it("triggerPick() invoke 抛错 → 显示 office-empty 错误", async () => {
    openMock.mockResolvedValueOnce("/docs/broken.docx");
    invokeMock.mockRejectedValueOnce(new Error("EISDIR: not a file"));

    const { result } = renderHook(() => useComposerOfficePick(makeTrigger("docx")));

    await act(async () => {
      await result.current.triggerPick();
    });

    expect(result.current.isPicking).toBe(false);
    expect(result.current.hasError).toBe(true);
    expect(result.current.extractedFile).toBeNull();
    expect(result.current.items[0]?.type).toBe("office-empty");
    expect(result.current.items[0]?.id).toBe("office-empty:docx:error");
  });
});

describe("useComposerOfficePick / state transitions", () => {
  it("kind 切换(@docx → @xlsx) → 自动清空旧 extractedFile", async () => {
    openMock.mockResolvedValueOnce("/docs/old.docx");
    invokeMock.mockResolvedValueOnce(["段落 1"]);

    const { result, rerender } = renderHook(
      ({ trigger }: { trigger: ComposerTrigger | null }) =>
        useComposerOfficePick(trigger),
      { initialProps: { trigger: makeTrigger("docx") as ComposerTrigger | null } },
    );

    await act(async () => {
      await result.current.triggerPick();
    });
    expect(result.current.extractedFile?.kind).toBe("docx");

    // 切换到 xlsx
    rerender({ trigger: makeTrigger("xlsx") });
    expect(result.current.activeKind).toBe("xlsx");
    expect(result.current.extractedFile).toBeNull();
    expect(result.current.items[0]?.type).toBe("office-hint");
    expect(result.current.items[0]?.officeKind).toBe("xlsx");
  });

  it("reset() → 主动清空 extractedFile / hasError / isPicking", async () => {
    openMock.mockResolvedValueOnce("/docs/test.docx");
    invokeMock.mockResolvedValueOnce(["段落 1"]);

    const { result } = renderHook(() => useComposerOfficePick(makeTrigger("docx")));

    await act(async () => {
      await result.current.triggerPick();
    });
    expect(result.current.extractedFile).not.toBeNull();

    act(() => {
      result.current.reset();
    });
    expect(result.current.extractedFile).toBeNull();
    expect(result.current.hasError).toBe(false);
    expect(result.current.isPicking).toBe(false);
  });

  it("trigger 由 null → @docx → null 切换 → 不残留状态", () => {
    const { result, rerender } = renderHook(
      ({ trigger }: { trigger: ComposerTrigger | null }) =>
        useComposerOfficePick(trigger),
      { initialProps: { trigger: null as ComposerTrigger | null } },
    );
    expect(result.current.activeKind).toBeNull();

    rerender({ trigger: makeTrigger("docx") });
    expect(result.current.activeKind).toBe("docx");

    rerender({ trigger: null });
    expect(result.current.activeKind).toBeNull();
    expect(result.current.items).toEqual([]);
  });
});

describe("pickAndExtractOfficeFile / standalone helper", () => {
  it("用户取消文件选择 → 返回 null", async () => {
    openMock.mockResolvedValueOnce(null);
    const result = await pickAndExtractOfficeFile("docx");
    expect(result).toBeNull();
  });

  it("成功选择 + 提取 → 返回 OfficeExtractedFile 快照", async () => {
    openMock.mockResolvedValueOnce("/docs/ok.docx");
    invokeMock.mockResolvedValueOnce(["段落 A"]);
    const result = await pickAndExtractOfficeFile("docx");
    expect(result).not.toBeNull();
    expect(result?.kind).toBe("docx");
    expect(result?.filePath).toBe("/docs/ok.docx");
    expect(result?.context).toContain("@docx 文档");
  });

  it("invoke 抛错 → 透传异常(由 hook 内部捕获并置 hasError)", async () => {
    openMock.mockResolvedValueOnce("/docs/bad.docx");
    invokeMock.mockRejectedValueOnce(new Error("corrupted file"));
    await expect(pickAndExtractOfficeFile("docx")).rejects.toThrow("corrupted file");
  });
});
