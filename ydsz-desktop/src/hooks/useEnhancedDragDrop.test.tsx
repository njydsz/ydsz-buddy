/**
 * @file useEnhancedDragDrop 单元测试
 *
 * 覆盖：
 * - API 形状（dragState + 5 个 handler）
 * - handleDragEnter/handleDragOver/handleDragLeave/handleDrop 状态变更
 * - dragType: files / url / text / null
 * - 不支持的 files → hasUnsupported=true, dropEffect='none'
 * - handleDrop 调用 onFilesDrop / onUrlDrop / onTextDrop
 * - handlePaste 检测 URL
 * - resetDragState 重置
 * - 嵌套 dragenter/dragleave 通过 counter 维持稳定状态
 *
 * 策略：用 happy-dom 提供的 DataTransfer，构造受控的拖拽事件。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { DragEvent, ClipboardEvent } from "react";

// 必须在 mock 之后导入
import { useEnhancedDragDrop } from "./useEnhancedDragDrop";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// =============================================================================
// 测试工具
// =============================================================================

function makeDataTransfer(opts: {
  files?: Array<{ name: string; size?: number; type?: string }>;
  text?: string;
}): DataTransfer {
  const dt: Partial<DataTransfer> = {
    files: [] as unknown as FileList,
    getData: (format: string) => {
      if (format === "text/plain" || format === "text/uri-list") {
        return opts.text ?? "";
      }
      return "";
    },
    setData: () => undefined,
    clearData: () => undefined,
    items: [] as unknown as DataTransferItemList,
    types: opts.text ? ["text/plain"] : [],
    dropEffect: "none",
    effectAllowed: "all",
  };
  if (opts.files && opts.files.length > 0) {
    (dt as { files: unknown }).files = {
      length: opts.files.length,
      item: (i: number) => opts.files?.[i],
      ...opts.files,
    };
    dt.types = ["Files"];
  }
  return dt as DataTransfer;
}

function makeDragEvent(opts: {
  type: "dragenter" | "dragover" | "dragleave" | "drop";
  dataTransfer: DataTransfer;
}): DragEvent<HTMLElement> {
  let prevented = false;
  const event: Partial<DragEvent<HTMLElement>> = {
    type: opts.type,
    dataTransfer: opts.dataTransfer,
    preventDefault: () => {
      prevented = true;
    },
    stopPropagation: () => {
      // no-op
    },
    target: null,
  };
  return event as DragEvent<HTMLElement>;
}

function makeClipboardEvent(text: string): ClipboardEvent<HTMLElement> {
  return {
    clipboardData: {
      getData: (format: string) => (format === "text/plain" ? text : ""),
    } as unknown as DataTransfer,
  } as ClipboardEvent<HTMLElement>;
}

// =============================================================================
// 1. API 形状
// =============================================================================

describe("useEnhancedDragDrop - API 形状", () => {
  it("暴露 dragState 和 5 个 handler", () => {
    const { result } = renderHook(() => useEnhancedDragDrop());
    expect(result.current.dragState).toBeDefined();
    expect(result.current.dragState.isDragging).toBe(false);
    expect(typeof result.current.handleDragEnter).toBe("function");
    expect(typeof result.current.handleDragOver).toBe("function");
    expect(typeof result.current.handleDragLeave).toBe("function");
    expect(typeof result.current.handleDrop).toBe("function");
    expect(typeof result.current.handlePaste).toBe("function");
    expect(typeof result.current.resetDragState).toBe("function");
  });
});

// =============================================================================
// 2. dragType: files
// =============================================================================

describe("useEnhancedDragDrop - dragType=files", () => {
  it("dragenter 携带 files → dragType='files'", () => {
    const { result } = renderHook(() => useEnhancedDragDrop());
    const dt = makeDataTransfer({ files: [{ name: "a.png", size: 100, type: "image/png" }] });
    act(() => {
      result.current.handleDragEnter(makeDragEvent({ type: "dragenter", dataTransfer: dt }));
    });
    expect(result.current.dragState.isDragging).toBe(true);
    expect(result.current.dragState.dragType).toBe("files");
    expect(result.current.dragState.files.length).toBe(1);
  });

  it("不支持的文件 → hasUnsupported=true", () => {
    const { result } = renderHook(() => useEnhancedDragDrop());
    const dt = makeDataTransfer({ files: [{ name: "evil.exe", size: 100, type: "" }] });
    act(() => {
      result.current.handleDragEnter(makeDragEvent({ type: "dragenter", dataTransfer: dt }));
    });
    expect(result.current.dragState.hasUnsupported).toBe(true);
    expect(result.current.dragState.unsupportedFiles.length).toBeGreaterThan(0);
  });

  it("dragover 携带 unsupported → dropEffect='none'", () => {
    const { result } = renderHook(() => useEnhancedDragDrop());
    const dt = makeDataTransfer({ files: [{ name: "evil.exe", size: 100, type: "" }] });
    const event = makeDragEvent({ type: "dragover", dataTransfer: dt });
    act(() => {
      result.current.handleDragOver(event);
    });
    expect(dt.dropEffect).toBe("none");
  });

  it("dragover 携带支持文件 → dropEffect='copy'", () => {
    const { result } = renderHook(() => useEnhancedDragDrop());
    const dt = makeDataTransfer({ files: [{ name: "a.png", size: 100, type: "image/png" }] });
    act(() => {
      result.current.handleDragOver(makeDragEvent({ type: "dragover", dataTransfer: dt }));
    });
    expect(dt.dropEffect).toBe("copy");
  });

  it("drop files → 调用 onFilesDrop", () => {
    const onFilesDrop = vi.fn();
    const { result } = renderHook(() => useEnhancedDragDrop({ onFilesDrop }));
    const dt = makeDataTransfer({ files: [{ name: "a.png", size: 100, type: "image/png" }] });
    act(() => {
      result.current.handleDrop(makeDragEvent({ type: "drop", dataTransfer: dt }));
    });
    expect(onFilesDrop).toHaveBeenCalledTimes(1);
    expect(onFilesDrop.mock.calls[0]?.[0]?.[0]?.name).toBe("a.png");
    // 状态被重置
    expect(result.current.dragState.isDragging).toBe(false);
  });

  it("drop unsupported files → 不调用 onFilesDrop", () => {
    const onFilesDrop = vi.fn();
    const { result } = renderHook(() => useEnhancedDragDrop({ onFilesDrop }));
    const dt = makeDataTransfer({ files: [{ name: "evil.exe", size: 100, type: "" }] });
    act(() => {
      result.current.handleDrop(makeDragEvent({ type: "drop", dataTransfer: dt }));
    });
    expect(onFilesDrop).not.toHaveBeenCalled();
  });
});

// =============================================================================
// 3. dragType: url
// =============================================================================

describe("useEnhancedDragDrop - dragType=url", () => {
  it("dragenter 携带 url text → dragType='url'", () => {
    const { result } = renderHook(() => useEnhancedDragDrop());
    const dt = makeDataTransfer({ text: "https://example.com/foo" });
    act(() => {
      result.current.handleDragEnter(makeDragEvent({ type: "dragenter", dataTransfer: dt }));
    });
    expect(result.current.dragState.dragType).toBe("url");
    expect(result.current.dragState.urls).toContain("https://example.com/foo");
  });

  it("drop url → 调用 onUrlDrop", () => {
    const onUrlDrop = vi.fn();
    const { result } = renderHook(() => useEnhancedDragDrop({ onUrlDrop }));
    const dt = makeDataTransfer({ text: "https://example.com" });
    act(() => {
      result.current.handleDrop(makeDragEvent({ type: "drop", dataTransfer: dt }));
    });
    expect(onUrlDrop).toHaveBeenCalledTimes(1);
    expect(onUrlDrop.mock.calls[0]?.[0]).toContain("https://example.com");
  });

  it("enableUrls=false → url 不会被检测", () => {
    const { result } = renderHook(() => useEnhancedDragDrop({ enableUrls: false }));
    const dt = makeDataTransfer({ text: "https://example.com" });
    act(() => {
      result.current.handleDragEnter(makeDragEvent({ type: "dragenter", dataTransfer: dt }));
    });
    expect(result.current.dragState.dragType).not.toBe("url");
  });
});

// =============================================================================
// 4. dragType: text
// =============================================================================

describe("useEnhancedDragDrop - dragType=text", () => {
  it("enableText=true + 纯文本 → dragType='text'", () => {
    const { result } = renderHook(() => useEnhancedDragDrop({ enableText: true }));
    const dt = makeDataTransfer({ text: "hello world" });
    act(() => {
      result.current.handleDragEnter(makeDragEvent({ type: "dragenter", dataTransfer: dt }));
    });
    expect(result.current.dragState.dragType).toBe("text");
  });

  it("drop text → 调用 onTextDrop", () => {
    const onTextDrop = vi.fn();
    const { result } = renderHook(() => useEnhancedDragDrop({ onTextDrop, enableText: true }));
    const dt = makeDataTransfer({ text: "hello world" });
    act(() => {
      result.current.handleDrop(makeDragEvent({ type: "drop", dataTransfer: dt }));
    });
    expect(onTextDrop).toHaveBeenCalledWith("hello world");
  });
});

// =============================================================================
// 5. dragType: null
// =============================================================================

describe("useEnhancedDragDrop - 无类型", () => {
  it("无 file/url/text → dragType=null", () => {
    const { result } = renderHook(() => useEnhancedDragDrop({ enableText: false }));
    const dt = makeDataTransfer({});
    act(() => {
      result.current.handleDragEnter(makeDragEvent({ type: "dragenter", dataTransfer: dt }));
    });
    expect(result.current.dragState.dragType).toBeNull();
    // isDragging 仍为 true（hover 状态）
    expect(result.current.dragState.isDragging).toBe(true);
  });
});

// =============================================================================
// 6. dragenter / dragleave counter
// =============================================================================

describe("useEnhancedDragDrop - drag counter", () => {
  it("嵌套 dragenter 后 dragleave → 不重置（counter 未归零）", () => {
    const { result } = renderHook(() => useEnhancedDragDrop());
    const dt = makeDataTransfer({ text: "https://example.com" });

    // 第 1 次 enter
    act(() => {
      result.current.handleDragEnter(makeDragEvent({ type: "dragenter", dataTransfer: dt }));
    });
    expect(result.current.dragState.isDragging).toBe(true);

    // 第 2 次 enter（嵌套）
    act(() => {
      result.current.handleDragEnter(makeDragEvent({ type: "dragenter", dataTransfer: dt }));
    });

    // 第 1 次 leave（counter=1）
    act(() => {
      result.current.handleDragLeave(makeDragEvent({ type: "dragleave", dataTransfer: dt }));
    });
    expect(result.current.dragState.isDragging).toBe(true);

    // 第 2 次 leave（counter=0）→ 重置
    act(() => {
      result.current.handleDragLeave(makeDragEvent({ type: "dragleave", dataTransfer: dt }));
    });
    expect(result.current.dragState.isDragging).toBe(false);
  });
});

// =============================================================================
// 7. handlePaste
// =============================================================================

describe("useEnhancedDragDrop - handlePaste", () => {
  it("粘贴含 URL 的文本 → 调用 onPaste", () => {
    const onPaste = vi.fn();
    const { result } = renderHook(() => useEnhancedDragDrop({ onPaste }));
    act(() => {
      result.current.handlePaste(makeClipboardEvent("看 https://example.com 这个网站"));
    });
    expect(onPaste).toHaveBeenCalledTimes(1);
    expect(onPaste.mock.calls[0]?.[0]).toContain("https://example.com");
  });

  it("粘贴纯文本（无 URL）→ 不调用 onPaste", () => {
    const onPaste = vi.fn();
    const { result } = renderHook(() => useEnhancedDragDrop({ onPaste }));
    act(() => {
      result.current.handlePaste(makeClipboardEvent("just text"));
    });
    expect(onPaste).not.toHaveBeenCalled();
  });

  it("enableUrls=false → 不处理粘贴 URL", () => {
    const onPaste = vi.fn();
    const { result } = renderHook(() => useEnhancedDragDrop({ onPaste, enableUrls: false }));
    act(() => {
      result.current.handlePaste(makeClipboardEvent("https://example.com"));
    });
    expect(onPaste).not.toHaveBeenCalled();
  });

  it("无 onPaste → 静默忽略", () => {
    const { result } = renderHook(() => useEnhancedDragDrop());
    expect(() => {
      act(() => {
        result.current.handlePaste(makeClipboardEvent("https://example.com"));
      });
    }).not.toThrow();
  });
});

// =============================================================================
// 8. resetDragState
// =============================================================================

describe("useEnhancedDragDrop - resetDragState", () => {
  it("显式重置 → 状态清空", () => {
    const { result } = renderHook(() => useEnhancedDragDrop());
    const dt = makeDataTransfer({ text: "https://example.com" });
    act(() => {
      result.current.handleDragEnter(makeDragEvent({ type: "dragenter", dataTransfer: dt }));
    });
    expect(result.current.dragState.isDragging).toBe(true);

    act(() => {
      result.current.resetDragState();
    });
    expect(result.current.dragState.isDragging).toBe(false);
    expect(result.current.dragState.dragType).toBeNull();
  });
});
