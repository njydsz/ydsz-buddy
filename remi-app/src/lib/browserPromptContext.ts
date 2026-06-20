/**
 * @file 娴忚鍣ㄦ彁绀鸿瘝涓婁笅鏂囧鐞嗘ā鍧? * @description 妫€娴嬬敤鎴锋彁绀鸿瘝鏄惁娑夊強鍐呴儴娴忚鍣ㄤ换鍔★紝骞惰嚜鍔ㄩ檮鍔犳祻瑙堝櫒鎴浘浣滀负涓婁笅鏂囥€? */

import {
  PROVIDER_SEND_TURN_MAX_IMAGE_BYTES,
  type BrowserCaptureScreenshotResult,
  type NativeApi,
  type ThreadId,
} from "~/contracts";

import type { ComposerImageAttachment } from "../composerDraftStore";

/** 鏄惧紡璇锋眰璁＄畻鏈轰娇鐢ㄧ殑鍏抽敭璇嶆ā寮?*/
const EXPLICIT_COMPUTER_USE_PATTERNS = [
  "computer use",
  "computer-use",
  "@computer-use",
  "@computer use",
  "mcp__computer_use__",
];

/** 鍐呴儴娴忚鍣ㄨ寖鍥寸浉鍏崇殑鍏抽敭璇嶆ā寮忥紙鏀寔澶氳瑷€锛?*/
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

/** 鍐呴儴娴忚鍣ㄥ姩浣滅浉鍏崇殑鍏抽敭璇嶆ā寮忥紙鏀寔澶氳瑷€锛?*/
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
 * 瑙勮寖鍖栨彁绀鸿瘝鏂囨湰鐢ㄤ簬鍏抽敭璇嶅尮閰? * @param prompt - 鍘熷鎻愮ず璇? * @returns 瑙勮寖鍖栧悗鐨勬枃鏈紙灏忓啓銆佸悎骞剁┖鐧斤級
 */
function normalizePromptForMatching(prompt: string): string {
  return prompt.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * 妫€娴嬫彁绀鸿瘝鏄惁鏄惧紡璇锋眰璁＄畻鏈轰娇鐢ㄥ姛鑳? * @param prompt - 鐢ㄦ埛鎻愮ず璇? * @returns 鏄惁鍖呭惈璁＄畻鏈轰娇鐢ㄧ浉鍏冲叧閿瘝
 */
export function promptRequestsExplicitComputerUse(prompt: string): boolean {
  const normalized = normalizePromptForMatching(prompt);
  return EXPLICIT_COMPUTER_USE_PATTERNS.some((pattern) => normalized.includes(pattern));
}

/**
 * 妫€娴嬫彁绀鸿瘝鏄惁鐪嬭捣鏉ユ槸鍐呴儴娴忚鍣ㄤ换鍔? * 闇€瑕佸悓鏃跺尮閰嶆祻瑙堝櫒鑼冨洿鍏抽敭璇嶅拰鍔ㄤ綔鍏抽敭璇? * @param prompt - 鐢ㄦ埛鎻愮ず璇? * @returns 鏄惁鍖归厤鍐呴儴娴忚鍣ㄤ换鍔℃ā寮? */
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
 * 涓烘祻瑙堝櫒鎴浘鐢熸垚闄勪欢鍚嶇О
 * @param input - 娴忚鍣ㄦ埅鍥剧粨鏋? * @returns 鎴浘鏂囦欢鍚嶏紝濡傛灉鍘熷悕涓虹┖鍒欎娇鐢ㄩ粯璁ゅ懡鍚? */
export function screenshotAttachmentName(input: BrowserCaptureScreenshotResult): string {
  return input.name.trim().length > 0 ? input.name : `browser-${Date.now()}.png`;
}

/**
 * 浠庢祻瑙堝櫒鎴浘鍒涘缓 File 瀵硅薄锛堝唴閮ㄥ嚱鏁帮級
 * @param screenshot - 娴忚鍣ㄦ埅鍥剧粨鏋? * @returns File 瀵硅薄
 * @throws 褰撴埅鍥炬暟鎹负绌烘椂鎶涘嚭閿欒
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
 * 浠庢祻瑙堝櫒鎴浘鍒涘缓缂栬緫鍣ㄥ浘鐗囬檮浠? * @param screenshot - 娴忚鍣ㄦ埅鍥剧粨鏋? * @returns 缂栬緫鍣ㄥ浘鐗囬檮浠跺璞★紝鍖呭惈棰勮URL鍜屾枃浠跺璞? */
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
 * 娴忚鍣ㄦ彁绀鸿瘝闄勪欢瑙ｆ瀽缁撴灉鎺ュ彛
 */
export interface BrowserPromptAttachmentResolution {
  /** 鏄惁璇锋眰浜嗘祻瑙堝櫒闄勪欢 */
  requested: boolean;
  /** 瑙ｆ瀽鍑虹殑鍥剧墖闄勪欢锛屽鏋滆В鏋愬け璐ュ垯涓?null */
  image: ComposerImageAttachment | null;
  /** 瑙ｆ瀽澶辫触鐨勫師鍥?*/
  reason?: "no-open-browser" | "no-active-tab" | "attachment-too-large";
}

/**
 * 灏濊瘯瑙ｆ瀽娴忚鍣ㄦ彁绀鸿瘝闄勪欢
 * 褰撴彁绀鸿瘝鍖归厤鍐呴儴娴忚鍣ㄤ换鍔℃椂锛岃嚜鍔ㄦ埅鍙栧綋鍓嶆祻瑙堝櫒鏍囩椤电殑鎴浘浣滀负闄勪欢
 * @param input - 鍖呭惈 API銆佺嚎绋婭D鍜屾彁绀鸿瘝鐨勮緭鍏ュ璞? * @returns 娴忚鍣ㄩ檮浠惰В鏋愮粨鏋? */
export async function maybeResolveBrowserPromptAttachment(input: {
  api: NativeApi;
  threadId: ThreadId;
  prompt: string;
}): Promise<BrowserPromptAttachmentResolution> {
  // 濡傛灉鏄惧紡璇锋眰璁＄畻鏈轰娇鐢ㄦ垨涓嶅尮閰嶆祻瑙堝櫒浠诲姟妯″紡锛屽垯涓嶅鐞?  if (
    promptRequestsExplicitComputerUse(input.prompt) ||
    !promptLooksLikeInternalBrowserTask(input.prompt)
  ) {
    return { requested: false, image: null };
  }

  // 鑾峰彇娴忚鍣ㄧ姸鎬?  const browserState = await input.api.browser.getState({
    threadId: input.threadId,
  });
  if (!browserState.open) {
    return { requested: true, image: null, reason: "no-open-browser" };
  }

  // 鏌ユ壘娲诲姩鏍囩椤?  const activeTab =
    browserState.tabs.find((tab) => tab.id === browserState.activeTabId) ??
    browserState.tabs[0] ??
    null;
  if (!activeTab) {
    return { requested: true, image: null, reason: "no-active-tab" };
  }

  // 鎴彇褰撳墠鏍囩椤垫埅鍥?  const screenshot = await input.api.browser.captureScreenshot({
    threadId: input.threadId,
    tabId: activeTab.id,
  });
  // 妫€鏌ユ埅鍥惧ぇ灏忔槸鍚﹁秴杩囬檺鍒?  if (screenshot.sizeBytes > PROVIDER_SEND_TURN_MAX_IMAGE_BYTES) {
    return { requested: true, image: null, reason: "attachment-too-large" };
  }

  return {
    requested: true,
    image: composerImageFromBrowserScreenshot(screenshot),
  };
}
