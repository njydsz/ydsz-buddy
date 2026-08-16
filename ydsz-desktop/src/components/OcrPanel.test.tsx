/**
 * @file OcrPanel 单元测试
 *
 * 覆盖目标:
 * - trigger 点击后渲染 dialog
 * - provider badge 展示
 * - 选图后调用 recognize
 * - 错误展示
 * - insert 回调被调用
 * - 受控 / 非受控 open 都能用
 *
 * 通过 mock invoke 完全隔离后端。
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n/I18nContext";
import { OcrPanel } from "./OcrPanel";

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

const PROVIDER_INFO = {
  active: "tesseract",
  platform: "linux",
  tesseractInstalled: true,
  tesseractPath: "/usr/bin/tesseract",
  swiftAvailable: false,
  powershellAvailable: false,
  available: ["tesseract"],
};

const PROVIDER_NONE = {
  active: "none",
  platform: "linux",
  tesseractInstalled: false,
  tesseractPath: null,
  swiftAvailable: false,
  powershellAvailable: false,
  available: [],
};

const RECOGNIZE_RESULT = {
  text: "Hello\nWorld",
  provider: "tesseract",
  confidence: 0,
  lines: [{ text: "Hello", confidence: 0 }, { text: "World", confidence: 0 }],
  elapsedMs: 100,
};

function Wrapper({ children }: { children: React.ReactNode }) {
  return <I18nProvider language="en">{children}</I18nProvider>;
}

beforeEach(() => {
  mockInvoke.mockReset();
  // 默认 provider 拉取成功
  mockInvoke.mockResolvedValue(PROVIDER_INFO);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("OcrPanel - trigger", () => {
  it("点击 trigger 后打开弹窗", async () => {
    render(<OcrPanel />, { wrapper: Wrapper });
    const trigger = await screen.findByTestId("ocr-panel-trigger");
    fireEvent.click(trigger);
    expect(await screen.findByTestId("ocr-panel")).toBeTruthy();
  });

  it("受控 open 模式下由 props 控制", async () => {
    render(<OcrPanel open={true} onOpenChange={() => {}} />, { wrapper: Wrapper });
    expect(await screen.findByTestId("ocr-panel")).toBeTruthy();
  });

  it("Esc 关闭弹窗", async () => {
    render(<OcrPanel />, { wrapper: Wrapper });
    fireEvent.click(await screen.findByTestId("ocr-panel-trigger"));
    expect(await screen.findByTestId("ocr-panel")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByTestId("ocr-panel")).toBeNull();
    });
  });
});

describe("OcrPanel - provider", () => {
  it("显示当前 active provider", async () => {
    render(<OcrPanel />, { wrapper: Wrapper });
    fireEvent.click(await screen.findByTestId("ocr-panel-trigger"));
    const badge = await screen.findByTestId("ocr-panel-provider-badge");
    expect(badge.getAttribute("data-provider")).toBe("tesseract");
  });

  it("无 provider 时显示引导卡片", async () => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValueOnce(PROVIDER_NONE);
    render(<OcrPanel />, { wrapper: Wrapper });
    fireEvent.click(await screen.findByTestId("ocr-panel-trigger"));
    const alert = await screen.findByTestId("ocr-panel-no-provider");
    expect(alert.textContent).toMatch(/Tesseract/);
  });
});

describe("OcrPanel - 文件选择 & 识别", () => {
  it("选图后 base64 写入 + 调用 recognize", async () => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValueOnce(PROVIDER_INFO).mockResolvedValueOnce(RECOGNIZE_RESULT);

    render(<OcrPanel />, { wrapper: Wrapper });
    fireEvent.click(await screen.findByTestId("ocr-panel-trigger"));

    // mock File
    const fileBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]); // JPEG magic
    const file = new File([fileBytes], "test.jpg", { type: "image/jpeg" });
    const input = (await screen.findByTestId("ocr-panel-pick-file")) as HTMLInputElement;

    fireEvent.change(input, { target: { files: [file] } });

    // 等待 file 转 base64 完成
    await waitFor(() => {
      // recognize 按钮启用
      const btn = screen.getByTestId("ocr-panel-recognize") as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
    });

    fireEvent.click(screen.getByTestId("ocr-panel-recognize"));

    await waitFor(() => {
      expect(screen.queryByTestId("ocr-panel-result")).toBeTruthy();
    });
    const resultText = screen.getByTestId("ocr-panel-result-text");
    expect(resultText.textContent).toBe("Hello\nWorld");
  });
});

describe("OcrPanel - 错误展示", () => {
  it("provider 抛错时显示错误", async () => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValueOnce(PROVIDER_INFO).mockRejectedValueOnce("tesseract missing");
    render(<OcrPanel />, { wrapper: Wrapper });
    fireEvent.click(await screen.findByTestId("ocr-panel-trigger"));
    const file = new File([new Uint8Array([1, 2, 3])], "x.png", { type: "image/png" });
    const input = (await screen.findByTestId("ocr-panel-pick-file")) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(await screen.findByTestId("ocr-panel-recognize"));
    const errEl = await screen.findByTestId("ocr-panel-error");
    expect(errEl.textContent).toBe("tesseract missing");
  });
});

describe("OcrPanel - insert 回调", () => {
  it("提供 onInsert 时显示 insert 按钮并触发回调", async () => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValueOnce(PROVIDER_INFO).mockResolvedValueOnce(RECOGNIZE_RESULT);
    const onInsert = vi.fn();
    render(<OcrPanel onInsert={onInsert} />, { wrapper: Wrapper });
    fireEvent.click(await screen.findByTestId("ocr-panel-trigger"));
    // 等 provider 拉取完成(OcrPanelBody 挂载 + useEffect)
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("ocr_list_providers");
    });
    const file = new File([new Uint8Array([1, 2, 3])], "x.png", { type: "image/png" });
    fireEvent.change(await screen.findByTestId("ocr-panel-pick-file"), {
      target: { files: [file] },
    });
    // 等文件转 base64 完成,recognize 按钮启用
    await waitFor(() => {
      const btn = screen.getByTestId("ocr-panel-recognize") as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
    });
    fireEvent.click(screen.getByTestId("ocr-panel-recognize"));
    // 等结果出来 → insert 按钮出现
    await waitFor(() => {
      expect(screen.getByTestId("ocr-panel-insert")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("ocr-panel-insert"));
    expect(onInsert).toHaveBeenCalledWith(RECOGNIZE_RESULT);
  });
});
