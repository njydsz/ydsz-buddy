/**
 * @file useOcrRecognize 单元测试
 *
 * 覆盖目标：
 * - 挂载时拉取 ocr_list_providers
 * - recognize 调 ocr_recognize_text 并更新 state
 * - 错误路径 → state=error,error 字符串
 * - reset 清空 result / error
 * - busy 标志位联动 loading / recognizing
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

// 在 mock 之后导入 hook
import { useOcrRecognize } from "./useOcrRecognize";

const PROVIDER_INFO = {
  active: "tesseract" as const,
  platform: "linux",
  tesseractInstalled: true,
  tesseractPath: "/usr/bin/tesseract",
  swiftAvailable: false,
  powershellAvailable: false,
  available: ["tesseract"] as const,
};

const SAMPLE_RESULT = {
  text: "Hello\nWorld",
  provider: "tesseract",
  confidence: 0,
  lines: [
    { text: "Hello", confidence: 0 },
    { text: "World", confidence: 0 },
  ],
  elapsedMs: 100,
};

beforeEach(() => {
  mockInvoke.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useOcrRecognize - 挂载", () => {
  it("挂载时调用 ocr_list_providers", async () => {
    mockInvoke.mockResolvedValueOnce(PROVIDER_INFO);
    const { result } = renderHook(() => useOcrRecognize());
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("ocr_list_providers");
    });
    expect(result.current.providerInfo?.active).toBe("tesseract");
    expect(result.current.state).toBe("idle");
    expect(result.current.busy).toBe(false);
  });

  it("provider 拉取失败时进入 error", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("ipc down"));
    const { result } = renderHook(() => useOcrRecognize());
    await waitFor(() => {
      expect(result.current.state).toBe("error");
    });
    expect(result.current.error).toMatch(/ipc down/);
  });
});

describe("useOcrRecognize - recognize", () => {
  it("调 ocr_recognize_text 并更新 result", async () => {
    mockInvoke
      .mockResolvedValueOnce(PROVIDER_INFO)
      .mockResolvedValueOnce(SAMPLE_RESULT);
    const onComplete = vi.fn();
    const { result } = renderHook(() => useOcrRecognize({ onComplete }));
    await waitFor(() => expect(result.current.providerInfo).not.toBeNull());

    await act(async () => {
      const r = await result.current.recognize({ kind: "base64", data: "Zm9v" });
      expect(r?.text).toBe("Hello\nWorld");
    });

    expect(mockInvoke).toHaveBeenCalledWith(
      "ocr_recognize_text",
      expect.objectContaining({
        input: expect.objectContaining({
          source: { kind: "base64", data: "Zm9v" },
        }),
      }),
    );
    expect(result.current.state).toBe("done");
    expect(result.current.result?.text).toBe("Hello\nWorld");
    expect(onComplete).toHaveBeenCalledWith(SAMPLE_RESULT);
  });

  it("识别失败时进入 error 并保留字符串错误", async () => {
    mockInvoke
      .mockResolvedValueOnce(PROVIDER_INFO)
      .mockRejectedValueOnce("tesseract not installed");
    const onError = vi.fn();
    const { result } = renderHook(() => useOcrRecognize({ onError }));
    await waitFor(() => expect(result.current.providerInfo).not.toBeNull());

    let returned: unknown = "marker";
    await act(async () => {
      returned = await result.current.recognize({ kind: "path", path: "/tmp/a.png" });
    });
    expect(returned).toBeNull();
    expect(result.current.state).toBe("error");
    expect(result.current.error).toBe("tesseract not installed");
    expect(onError).toHaveBeenCalledWith("tesseract not installed");
  });

  it("recognize 时 busy=true", async () => {
    let resolveRecognize: (v: unknown) => void = () => {};
    mockInvoke
      .mockResolvedValueOnce(PROVIDER_INFO)
      .mockImplementationOnce(
        () => new Promise((resolve) => (resolveRecognize = resolve)),
      );
    const { result } = renderHook(() => useOcrRecognize());
    await waitFor(() => expect(result.current.providerInfo).not.toBeNull());

    let promise: Promise<unknown>;
    act(() => {
      promise = result.current.recognize({ kind: "path", path: "/tmp/a.png" });
    });
    await waitFor(() => expect(result.current.busy).toBe(true));

    await act(async () => {
      resolveRecognize(SAMPLE_RESULT);
      await promise;
    });
    expect(result.current.busy).toBe(false);
    expect(result.current.state).toBe("done");
  });
});

describe("useOcrRecognize - reset", () => {
  it("清空 result / error / 回到 idle", async () => {
    mockInvoke
      .mockResolvedValueOnce(PROVIDER_INFO)
      .mockRejectedValueOnce("boom");
    const { result } = renderHook(() => useOcrRecognize());
    await waitFor(() => expect(result.current.providerInfo).not.toBeNull());

    await act(async () => {
      await result.current.recognize({ kind: "path", path: "/x" });
    });
    expect(result.current.error).toBe("boom");

    act(() => {
      result.current.reset();
    });
    expect(result.current.error).toBeNull();
    expect(result.current.result).toBeNull();
    expect(result.current.state).toBe("idle");
  });
});

describe("useOcrRecognize - refreshProvider", () => {
  it("主动刷新时再次 invoke ocr_list_providers", async () => {
    mockInvoke.mockResolvedValueOnce(PROVIDER_INFO).mockResolvedValueOnce({
      ...PROVIDER_INFO,
      active: "macos_vision",
    });
    const { result } = renderHook(() => useOcrRecognize());
    await waitFor(() => expect(result.current.providerInfo).not.toBeNull());

    await act(async () => {
      await result.current.refreshProvider();
    });
    expect(result.current.providerInfo?.active).toBe("macos_vision");
  });
});
