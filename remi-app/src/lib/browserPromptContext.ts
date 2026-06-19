/**
 * @file 浏览器提示词上下文处理模块
 * @description 检测用户提示词是否涉及内部浏览器任务，并自动附加浏览器截图作为上下文。
 */

import {
  PROVIDER_SEND_TURN_MAX_IMAGE_BYTES,
  type BrowserCaptureScreenshotResult,
  type NativeApi,
  type ThreadId,
} from "@remi-code/contracts";

import type { ComposerImageAttachment } from "../composerDraftStore";

/** 显式请求计算机使用的关键词模式 */
const EXPLICIT_COMPUTER_USE_PATTERNS = [
  "computer use",
  "computer-use",
  "@computer-use",
  "@computer use",
  "mcp__computer_use__",
];

/** 内部浏览器范围相关的关键词模式（支持多语言） */
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

/** 内部浏览器动作相关的关键词模式（支持多语言） */
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

/**
 * 规范化提示词文本用于关键词匹配
 * @param prompt - 原始提示词
 * @returns 规范化后的文本（小写、合并空白）
 */
function normalizePromptForMatching(prompt: string): string {
  return prompt.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * 检测提示词是否显式请求计算机使用功能
 * @param prompt - 用户提示词
 * @returns 是否包含计算机使用相关关键词
 */
export function promptRequestsExplicitComputerUse(prompt: string): boolean {
  const normalized = normalizePromptForMatching(prompt);
  return EXPLICIT_COMPUTER_USE_PATTERNS.some((pattern) => normalized.includes(pattern));
}

/**
 * 检测提示词是否看起来是内部浏览器任务
 * 需要同时匹配浏览器范围关键词和动作关键词
 * @param prompt - 用户提示词
 * @returns 是否匹配内部浏览器任务模式
 */
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

/**
 * 为浏览器截图生成附件名称
 * @param input - 浏览器截图结果
 * @returns 截图文件名，如果原名为空则使用默认命名
 */
export function screenshotAttachmentName(input: BrowserCaptureScreenshotResult): string {
  return input.name.trim().length > 0 ? input.name : `browser-${Date.now()}.png`;
}

/**
 * 从浏览器截图创建 File 对象（内部函数）
 * @param screenshot - 浏览器截图结果
 * @returns File 对象
 * @throws 当截图数据为空时抛出错误
 */
function fileFromBrowserScreenshot(screenshot: BrowserCaptureScreenshotResult): File {
  if (screenshot.bytes.byteLength === 0) {
    throw new Error("Browser screenshot is empty.");
  }
  const bytes = new Uint8Array(screenshot.bytes);
  return new File([bytes], screenshotAttachmentName(screenshot), {
    type: screenshot.mimeType,
  });
}

/**
 * 从浏览器截图创建编辑器图片附件
 * @param screenshot - 浏览器截图结果
 * @returns 编辑器图片附件对象，包含预览URL和文件对象
 */
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

/**
 * 浏览器提示词附件解析结果接口
 */
export interface BrowserPromptAttachmentResolution {
  /** 是否请求了浏览器附件 */
  requested: boolean;
  /** 解析出的图片附件，如果解析失败则为 null */
  image: ComposerImageAttachment | null;
  /** 解析失败的原因 */
  reason?: "no-open-browser" | "no-active-tab" | "attachment-too-large";
}

/**
 * 尝试解析浏览器提示词附件
 * 当提示词匹配内部浏览器任务时，自动截取当前浏览器标签页的截图作为附件
 * @param input - 包含 API、线程ID和提示词的输入对象
 * @returns 浏览器附件解析结果
 */
export async function maybeResolveBrowserPromptAttachment(input: {
  api: NativeApi;
  threadId: ThreadId;
  prompt: string;
}): Promise<BrowserPromptAttachmentResolution> {
  // 如果显式请求计算机使用或不匹配浏览器任务模式，则不处理
  if (
    promptRequestsExplicitComputerUse(input.prompt) ||
    !promptLooksLikeInternalBrowserTask(input.prompt)
  ) {
    return { requested: false, image: null };
  }

  // 获取浏览器状态
  const browserState = await input.api.browser.getState({
    threadId: input.threadId,
  });
  if (!browserState.open) {
    return { requested: true, image: null, reason: "no-open-browser" };
  }

  // 查找活动标签页
  const activeTab =
    browserState.tabs.find((tab) => tab.id === browserState.activeTabId) ??
    browserState.tabs[0] ??
    null;
  if (!activeTab) {
    return { requested: true, image: null, reason: "no-active-tab" };
  }

  // 截取当前标签页截图
  const screenshot = await input.api.browser.captureScreenshot({
    threadId: input.threadId,
    tabId: activeTab.id,
  });
  // 检查截图大小是否超过限制
  if (screenshot.sizeBytes > PROVIDER_SEND_TURN_MAX_IMAGE_BYTES) {
    return { requested: true, image: null, reason: "attachment-too-large" };
  }

  return {
    requested: true,
    image: composerImageFromBrowserScreenshot(screenshot),
  };
}
