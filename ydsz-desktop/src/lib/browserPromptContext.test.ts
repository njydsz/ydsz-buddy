/**
 * @file browserPromptContext 单元测试
 *
 * 覆盖：
 * - promptRequestsExplicitComputerUse：英文/中文/特殊 pattern 命中
 * - promptLooksLikeInternalBrowserTask：必须同时命中 scope + action
 * - screenshotAttachmentName：空名 → 用 fallback
 * - composerImageFromBrowserScreenshot：构造 attachment + preview URL
 * - maybeResolveBrowserPromptAttachment：
 *   - 显式 computer use → requested=false
 *   - 非 internal browser task → requested=false
 *   - browser 未开 → no-open-browser
 *   - 无 active tab → no-active-tab
 *   - 截图过大 → attachment-too-large
 *   - 成功路径 → 构造 image
 *
 * 策略：mock crypto.randomUUID / URL.createObjectURL。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserCaptureScreenshotResult, NativeApi, ThreadId } from "@ydsz-buddy/contracts";

// =============================================================================
// Mock 状态
// =============================================================================

const { mockState } = vi.hoisted(() => {
  const state = {
    api: null as null | {
      browser: {
        getState: ReturnType<typeof vi.fn>;
        captureScreenshot: ReturnType<typeof vi.fn>;
      };
    },
  };
  return { mockState: state };
});

vi.mock("../nativeApi", () => ({
  readNativeApi: () => mockState.api,
}));

import {
  promptRequestsExplicitComputerUse,
  promptLooksLikeInternalBrowserTask,
  screenshotAttachmentName,
  composerImageFromBrowserScreenshot,
  maybeResolveBrowserPromptAttachment,
} from "./browserPromptContext";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const TID = "thread-1" as ThreadId;

function resetMocks() {
  mockState.api = null;
}

function makeApi(opts: {
  open?: boolean;
  activeTabId?: string;
  tabs?: Array<{ id: string }>;
  screenshot?: BrowserCaptureScreenshotResult | null;
}) {
  return {
    browser: {
      getState: vi.fn(async () => ({
        open: opts.open ?? true,
        activeTabId: opts.activeTabId ?? "tab-1",
        tabs: opts.tabs ?? [{ id: "tab-1" }],
      })),
      captureScreenshot: vi.fn(async () =>
        opts.screenshot === undefined
          ? {
              name: "shot.png",
              mimeType: "image/png",
              bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
              sizeBytes: 1024,
            }
          : opts.screenshot,
      ),
    },
  };
}

function makeScreenshot(name = "shot.png", sizeBytes = 1024): BrowserCaptureScreenshotResult {
  return {
    name,
    mimeType: "image/png",
    bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    sizeBytes,
  };
}

// =============================================================================
// 1. promptRequestsExplicitComputerUse
// =============================================================================

describe("promptRequestsExplicitComputerUse", () => {
  it("'computer use' → true", () => {
    expect(promptRequestsExplicitComputerUse("please use computer use")).toBe(true);
  });

  it("'computer-use' → true", () => {
    expect(promptRequestsExplicitComputerUse("computer-use this")).toBe(true);
  });

  it("'@computer-use' → true", () => {
    expect(promptRequestsExplicitComputerUse("@computer-use task")).toBe(true);
  });

  it("'mcp__computer_use__' → true", () => {
    expect(promptRequestsExplicitComputerUse("call mcp__computer_use__screenshot")).toBe(true);
  });

  it("大小写不敏感", () => {
    expect(promptRequestsExplicitComputerUse("COMPUTER USE")).toBe(true);
  });

  it("无关 prompt → false", () => {
    expect(promptRequestsExplicitComputerUse("write a function")).toBe(false);
  });
});

// =============================================================================
// 2. promptLooksLikeInternalBrowserTask
// =============================================================================

describe("promptLooksLikeInternalBrowserTask", () => {
  it("scope + action 同时命中 → true", () => {
    expect(promptLooksLikeInternalBrowserTask("look at the active tab in browser")).toBe(true);
  });

  it("只有 scope → false", () => {
    expect(promptLooksLikeInternalBrowserTask("what about the active tab")).toBe(false);
  });

  it("只有 action → false", () => {
    expect(promptLooksLikeInternalBrowserTask("describe the screen")).toBe(false);
  });

  it("英文 scope + action → true", () => {
    expect(promptLooksLikeInternalBrowserTask("summarize the active tab")).toBe(true);
  });

  it("意大利语 scope + action → true", () => {
    expect(promptLooksLikeInternalBrowserTask("descrivi la tab attiva")).toBe(true);
  });

  it("完全无关 → false", () => {
    expect(promptLooksLikeInternalBrowserTask("refactor this code")).toBe(false);
  });
});

// =============================================================================
// 3. screenshotAttachmentName
// =============================================================================

describe("screenshotAttachmentName", () => {
  it("name 非空 → 用原 name", () => {
    expect(screenshotAttachmentName(makeScreenshot("my-shot.png"))).toBe("my-shot.png");
  });

  it("name 仅空格 → 用 fallback 'browser-<timestamp>.png'", () => {
    const name = screenshotAttachmentName(makeScreenshot("   "));
    expect(name).toMatch(/^browser-\d+\.png$/);
  });

  it("name 为空字符串 → 用 fallback", () => {
    const name = screenshotAttachmentName(makeScreenshot(""));
    expect(name).toMatch(/^browser-\d+\.png$/);
  });
});

// =============================================================================
// 4. composerImageFromBrowserScreenshot
// =============================================================================

describe("composerImageFromBrowserScreenshot", () => {
  beforeEach(() => {
    if (!("createObjectURL" in URL)) {
      Object.defineProperty(URL, "createObjectURL", {
        value: vi.fn(() => "blob:mock-url"),
        writable: true,
      });
    }
  });

  it("空 bytes → 抛错", () => {
    expect(() =>
      composerImageFromBrowserScreenshot({
        name: "x.png",
        mimeType: "image/png",
        bytes: new Uint8Array(0),
        sizeBytes: 0,
      }),
    ).toThrow(/empty/i);
  });

  it("正常截图 → 构造 attachment", () => {
    const attachment = composerImageFromBrowserScreenshot(makeScreenshot("shot.png", 2048));
    expect(attachment.type).toBe("image");
    expect(attachment.name).toBe("shot.png");
    expect(attachment.mimeType).toBe("image/png");
    expect(attachment.sizeBytes).toBe(2048);
    expect(attachment.id).toBeDefined();
    expect(attachment.previewUrl).toBeDefined();
  });
});

// =============================================================================
// 5. maybeResolveBrowserPromptAttachment
// =============================================================================

describe("maybeResolveBrowserPromptAttachment", () => {
  beforeEach(resetMocks);
  afterEach(resetMocks);

  it("显式 computer use → requested=false, image=null", async () => {
    mockState.api = makeApi({ screenshot: makeScreenshot() });
    const result = await maybeResolveBrowserPromptAttachment({
      api: mockState.api as unknown as NativeApi,
      threadId: TID,
      prompt: "use computer use",
    });
    expect(result.requested).toBe(false);
    expect(result.image).toBeNull();
  });

  it("非 internal browser task → requested=false", async () => {
    mockState.api = makeApi({ screenshot: makeScreenshot() });
    const result = await maybeResolveBrowserPromptAttachment({
      api: mockState.api as unknown as NativeApi,
      threadId: TID,
      prompt: "refactor this",
    });
    expect(result.requested).toBe(false);
  });

  it("browser 未开 → no-open-browser", async () => {
    mockState.api = makeApi({ open: false });
    const result = await maybeResolveBrowserPromptAttachment({
      api: mockState.api as unknown as NativeApi,
      threadId: TID,
      prompt: "look at the active tab",
    });
    expect(result.requested).toBe(true);
    expect(result.reason).toBe("no-open-browser");
    expect(result.image).toBeNull();
  });

  it("无 active tab → no-active-tab", async () => {
    mockState.api = makeApi({ open: true, tabs: [], activeTabId: "" });
    const result = await maybeResolveBrowserPromptAttachment({
      api: mockState.api as unknown as NativeApi,
      threadId: TID,
      prompt: "look at the active tab",
    });
    expect(result.reason).toBe("no-active-tab");
  });

  it("activeTabId 不存在 → fallback 到第一个 tab", async () => {
    mockState.api = makeApi({
      open: true,
      tabs: [{ id: "tab-fallback" }],
      activeTabId: "non-existent",
      screenshot: makeScreenshot(),
    });
    if (!("createObjectURL" in URL)) {
      Object.defineProperty(URL, "createObjectURL", {
        value: vi.fn(() => "blob:mock-url"),
        writable: true,
      });
    }
    const result = await maybeResolveBrowserPromptAttachment({
      api: mockState.api as unknown as NativeApi,
      threadId: TID,
      prompt: "look at the active tab",
    });
    expect(result.requested).toBe(true);
    expect(result.image).not.toBeNull();
  });

  it("截图过大 → attachment-too-large", async () => {
    // 100 MB - 超过限制
    mockState.api = makeApi({ screenshot: makeScreenshot("big.png", 100 * 1024 * 1024) });
    const result = await maybeResolveBrowserPromptAttachment({
      api: mockState.api as unknown as NativeApi,
      threadId: TID,
      prompt: "look at the active tab",
    });
    expect(result.reason).toBe("attachment-too-large");
    expect(result.image).toBeNull();
  });

  it("成功路径 → 构造 image", async () => {
    if (!("createObjectURL" in URL)) {
      Object.defineProperty(URL, "createObjectURL", {
        value: vi.fn(() => "blob:mock-url"),
        writable: true,
      });
    }
    mockState.api = makeApi({ screenshot: makeScreenshot("ok.png", 4096) });
    const result = await maybeResolveBrowserPromptAttachment({
      api: mockState.api as unknown as NativeApi,
      threadId: TID,
      prompt: "describe the active tab",
    });
    expect(result.requested).toBe(true);
    expect(result.reason).toBeUndefined();
    expect(result.image).not.toBeNull();
    expect(result.image?.name).toBe("ok.png");
  });
});
