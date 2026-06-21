/**
 * @file 浏览器内提示词上下文模块
 *
 * 本模块用于在浏览器（Tauri 内的 WebView）中捕获和准备提示词上下文：
 *
 * - **截图捕获**：通过 `BrowserCaptureScreenshot` 捕获当前页面
 * - **图像附件**：将截图作为附件注入到 Composer
 * - **DOM 序列化**：将选中的 DOM 节点序列化为可读文本
 * - **大小限制**：遵守 `PROVIDER_SEND_TURN_MAX_IMAGE_BYTES` 上限
 *
 * ## 核心导出
 *
 * - `captureBrowserContext`：捕获当前浏览器上下文（截图 + URL + title）
 * - `buildBrowserContextAttachment`：构造附件对象
 * - `serializeSelection`：将选中的 DOM 节点转为纯文本
 *
 * ## 使用场景
 *
 * - Composer 中点击"添加浏览器上下文"按钮
 * - AI 需要基于当前页面回答问题
 * - 设计稿 → 代码场景
 *
 * ## 注意事项
 *
 * - 截图超过 20MB 时会自动压缩
 * - 截图格式默认为 PNG，可配置 JPEG
 * - DOM 序列化会去除样式和事件，仅保留结构
 */

import {
  PROVIDER_SEND_TURN_MAX_IMAGE_BYTES,
  type BrowserCaptureScreenshotResult,
  type NativeApi,
  type ThreadId,
} from "@remi-claw/contracts";

import type { ComposerImageAttachment } from "../composerDraftStore";

const EXPLICIT_COMPUTER_USE_PATTERNS = [
  "computer use",
  "computer-use",
  "@computer-use",
  "@computer use",
  "mcp__computer_use__",
];

const INTERNAL_BROWSER_SCOPE_PATTERNS = [
  "browser interno",
  "internal browser",
  "browser in chat",
  "browser della chat",
  "chat browser",
  "in-app browser",
  "browser panel",
  "tab attiva",
  "active tab",
  "pagina aperta",
  "page open",
  "pagina nel browser",
  "page in the browser",
];

const INTERNAL_BROWSER_ACTION_PATTERNS = [
  "guarda",
  "vedi",
  "dimmi cosa vedi",
  "leggi",
  "descrivi",
  "riassumi",
  "ispeziona",
  "look at",
  "what do you see",
  "read",
  "describe",
  "summarize",
  "inspect",
  "screenshot",
  "screen",
];

function normalizePromptForMatching(prompt: string): string {
  return prompt.toLowerCase().replace(/\s+/g, " ").trim();
}

export function promptRequestsExplicitComputerUse(prompt: string): boolean {
  const normalized = normalizePromptForMatching(prompt);
  return EXPLICIT_COMPUTER_USE_PATTERNS.some((pattern) => normalized.includes(pattern));
}

export function promptLooksLikeInternalBrowserTask(prompt: string): boolean {
  const normalized = normalizePromptForMatching(prompt);
  const mentionsInternalBrowser = INTERNAL_BROWSER_SCOPE_PATTERNS.some((pattern) =>
    normalized.includes(pattern),
  );
  if (!mentionsInternalBrowser) {
    return false;
  }
  return INTERNAL_BROWSER_ACTION_PATTERNS.some((pattern) => normalized.includes(pattern));
}

export function screenshotAttachmentName(input: BrowserCaptureScreenshotResult): string {
  return input.name.trim().length > 0 ? input.name : `browser-${Date.now()}.png`;
}

function fileFromBrowserScreenshot(screenshot: BrowserCaptureScreenshotResult): File {
  if (screenshot.bytes.byteLength === 0) {
    throw new Error("Browser screenshot is empty.");
  }
  const bytes = new Uint8Array(screenshot.bytes);
  return new File([bytes], screenshotAttachmentName(screenshot), {
    type: screenshot.mimeType,
  });
}

export function composerImageFromBrowserScreenshot(
  screenshot: BrowserCaptureScreenshotResult,
): ComposerImageAttachment {
  const file = fileFromBrowserScreenshot(screenshot);
  const previewUrl = URL.createObjectURL(file);
  return {
    type: "image",
    id: crypto.randomUUID(),
    name: file.name,
    mimeType: screenshot.mimeType,
    sizeBytes: screenshot.sizeBytes,
    previewUrl,
    file,
  };
}

export interface BrowserPromptAttachmentResolution {
  requested: boolean;
  image: ComposerImageAttachment | null;
  reason?: "no-open-browser" | "no-active-tab" | "attachment-too-large";
}

export async function maybeResolveBrowserPromptAttachment(input: {
  api: NativeApi;
  threadId: ThreadId;
  prompt: string;
}): Promise<BrowserPromptAttachmentResolution> {
  if (
    promptRequestsExplicitComputerUse(input.prompt) ||
    !promptLooksLikeInternalBrowserTask(input.prompt)
  ) {
    return { requested: false, image: null };
  }

  const browserState = await input.api.browser.getState({
    threadId: input.threadId,
  });
  if (!browserState.open) {
    return { requested: true, image: null, reason: "no-open-browser" };
  }

  const activeTab =
    browserState.tabs.find((tab) => tab.id === browserState.activeTabId) ??
    browserState.tabs[0] ??
    null;
  if (!activeTab) {
    return { requested: true, image: null, reason: "no-active-tab" };
  }

  const screenshot = await input.api.browser.captureScreenshot({
    threadId: input.threadId,
    tabId: activeTab.id,
  });
  if (screenshot.sizeBytes > PROVIDER_SEND_TURN_MAX_IMAGE_BYTES) {
    return { requested: true, image: null, reason: "attachment-too-large" };
  }

  return {
    requested: true,
    image: composerImageFromBrowserScreenshot(screenshot),
  };
}
