/**
 * @file wsHttpUrl.ts 单元测试
 *
 * 覆盖：
 * - toAttachmentPreviewUrl：绝对 URL 直接返回
 * - toAttachmentPreviewUrl：相对 URL 通过 resolveWsHttpUrl 转换
 *
 * 注：resolveWsHttpUrl 在 happy-dom 中 window 存在，依赖 tauriBridge 缓存与
 * import.meta.env，需要单独通过全局 mock 验证桥逻辑。当前测试只覆盖
 * toAttachmentPreviewUrl 的纯分支逻辑。
 */

import { afterEach, describe, expect, it, vi } from "vitest";

const originalTauriBridge = (globalThis as { __TAURI_BRIDGE__?: unknown }).__TAURI_BRIDGE__;

afterEach(() => {
  vi.restoreAllMocks();
  if (originalTauriBridge === undefined) {
    delete (globalThis as { __TAURI_BRIDGE__?: unknown }).__TAURI_BRIDGE__;
  } else {
    (globalThis as { __TAURI_BRIDGE__?: unknown }).__TAURI_BRIDGE__ = originalTauriBridge;
  }
});

describe("toAttachmentPreviewUrl", () => {
  it("绝对 URL（http://）直接返回", async () => {
    const { toAttachmentPreviewUrl } = await import("./wsHttpUrl");
    expect(toAttachmentPreviewUrl("https://cdn.example.com/file.png")).toBe(
      "https://cdn.example.com/file.png",
    );
    expect(toAttachmentPreviewUrl("http://localhost:3000/x.png")).toBe(
      "http://localhost:3000/x.png",
    );
  });

  it("data: URL 直接返回", async () => {
    const { toAttachmentPreviewUrl } = await import("./wsHttpUrl");
    expect(toAttachmentPreviewUrl("data:image/png;base64,xxx")).toBe(
      "data:image/png;base64,xxx",
    );
  });

  it("/ 开头的相对路径走 resolveWsHttpUrl", async () => {
    const { toAttachmentPreviewUrl } = await import("./wsHttpUrl");
    // 在 happy-dom 中，window.location.origin 存在，相对路径会被 URL 解析
    const result = toAttachmentPreviewUrl("/api/attachments/abc");
    expect(result).toMatch(/^https?:\/\//);
  });

  it("不以 / 开头但不是绝对 URL 时按原样返回", async () => {
    const { toAttachmentPreviewUrl } = await import("./wsHttpUrl");
    expect(toAttachmentPreviewUrl("relative/path.png")).toBe("relative/path.png");
  });
});
