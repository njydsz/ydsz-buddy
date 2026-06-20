/**
 * @file 濞村繗顫嶉崳銊﹀絹缁€楦跨槤娑撳﹣绗呴弬鍥ь槱閻炲棙膩閸? * @description 濡偓濞村鏁ら幋閿嬪絹缁€楦跨槤閺勵垰鎯佸☉澶婂挤閸愬懘鍎村ù蹇氼潔閸ｃ劋鎹㈤崝鈽呯礉楠炴儼鍤滈崝銊╂閸旂姵绁荤憴鍫濇珤閹搭亜娴樻担婊€璐熸稉濠佺瑓閺傚洢鈧? */

import {
  PROVIDER_SEND_TURN_MAX_IMAGE_BYTES,
  type BrowserCaptureScreenshotResult,
  type NativeApi,
  type ThreadId,
} from "~/contracts";

import type { ComposerImageAttachment } from "../composerDraftStore";

/** 閺勬儳绱＄拠閿嬬湴鐠侊紕鐣婚張杞板▏閻劎娈戦崗鎶芥暛鐠囧秵膩瀵?*/
const EXPLICIT_COMPUTER_USE_PATTERNS = [
  "computer use",
  "computer-use",
  "@computer-use",
  "@computer use",
  "mcp__computer_use__",
];

/** 閸愬懘鍎村ù蹇氼潔閸ｃ劏瀵栭崶瀵告祲閸忓磭娈戦崗鎶芥暛鐠囧秵膩瀵骏绱欓弨顖涘瘮婢舵俺顕㈢懛鈧敍?*/
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

/** 閸愬懘鍎村ù蹇氼潔閸ｃ劌濮╂担婊呮祲閸忓磭娈戦崗鎶芥暛鐠囧秵膩瀵骏绱欓弨顖涘瘮婢舵俺顕㈢懛鈧敍?*/
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
 * 鐟欏嫯瀵栭崠鏍ㄥ絹缁€楦跨槤閺傚洦婀伴悽銊ょ艾閸忔娊鏁拠宥呭爱闁? * @param prompt - 閸樼喎顫愰幓鎰仛鐠? * @returns 鐟欏嫯瀵栭崠鏍ф倵閻ㄥ嫭鏋冮張顒婄礄鐏忓繐鍟撻妴浣告値楠炲墎鈹栭惂鏂ょ礆
 */
function normalizePromptForMatching(prompt: string): string {
  return prompt.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * 濡偓濞村褰佺粈楦跨槤閺勵垰鎯侀弰鎯х础鐠囬攱鐪扮拋锛勭暬閺堣桨濞囬悽銊ュ閼? * @param prompt - 閻劍鍩涢幓鎰仛鐠? * @returns 閺勵垰鎯侀崠鍛儓鐠侊紕鐣婚張杞板▏閻劎娴夐崗鍐插彠闁款喛鐦? */
export function promptRequestsExplicitComputerUse(prompt: string): boolean {
  const normalized = normalizePromptForMatching(prompt);
  return EXPLICIT_COMPUTER_USE_PATTERNS.some((pattern) => normalized.includes(pattern));
}

/**
 * 濡偓濞村褰佺粈楦跨槤閺勵垰鎯侀惇瀣崳閺夈儲妲搁崘鍛村劥濞村繗顫嶉崳銊ゆ崲閸? * 闂団偓鐟曚礁鎮撻弮璺哄爱闁板秵绁荤憴鍫濇珤閼煎啫娲块崗鎶芥暛鐠囧秴鎷伴崝銊ょ稊閸忔娊鏁拠? * @param prompt - 閻劍鍩涢幓鎰仛鐠? * @returns 閺勵垰鎯侀崠褰掑帳閸愬懘鍎村ù蹇氼潔閸ｃ劋鎹㈤崝鈩兡佸? */
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
 * 娑撶儤绁荤憴鍫濇珤閹搭亜娴橀悽鐔稿灇闂勫嫪娆㈤崥宥囆? * @param input - 濞村繗顫嶉崳銊﹀焻閸ュ墽绮ㄩ弸? * @returns 閹搭亜娴橀弬鍥︽閸氬稄绱濇俊鍌涚亯閸樼喎鎮曟稉铏光敄閸掓瑤濞囬悽銊╃帛鐠併倕鎳￠崥? */
export function screenshotAttachmentName(input: BrowserCaptureScreenshotResult): string {
  return input.name.trim().length > 0 ? input.name : `browser-${Date.now()}.png`;
}

/**
 * 娴犲孩绁荤憴鍫濇珤閹搭亜娴橀崚娑樼紦 File 鐎电钖勯敍鍫濆敶闁劌鍤遍弫甯礆
 * @param screenshot - 濞村繗顫嶉崳銊﹀焻閸ュ墽绮ㄩ弸? * @returns File 鐎电钖? * @throws 瑜版挻鍩呴崶鐐殶閹诡喕璐熺粚鐑樻閹舵稑鍤柨娆掝嚖
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
 * 娴犲孩绁荤憴鍫濇珤閹搭亜娴橀崚娑樼紦缂傛牞绶崳銊ユ禈閻楀洭妾禒? * @param screenshot - 濞村繗顫嶉崳銊﹀焻閸ュ墽绮ㄩ弸? * @returns 缂傛牞绶崳銊ユ禈閻楀洭妾禒璺侯嚠鐠炩槄绱濋崠鍛儓妫板嫯顫峌RL閸滃本鏋冩禒璺侯嚠鐠? */
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
 * 濞村繗顫嶉崳銊﹀絹缁€楦跨槤闂勫嫪娆㈢憴锝嗙€界紒鎾寸亯閹恒儱褰? */
export interface BrowserPromptAttachmentResolution {
  /** 閺勵垰鎯佺拠閿嬬湴娴滃棙绁荤憴鍫濇珤闂勫嫪娆?*/
  requested: boolean;
  /** 鐟欙絾鐎介崙铏规畱閸ュ墽澧栭梽鍕閿涘苯顩ч弸婊喰掗弸鎰亼鐠愩儱鍨稉?null */
  image: ComposerImageAttachment | null;
  /** 鐟欙絾鐎芥径杈Е閻ㄥ嫬甯崶?*/
  reason?: "no-open-browser" | "no-active-tab" | "attachment-too-large";
}

/**
 * 鐏忔繆鐦憴锝嗙€藉ù蹇氼潔閸ｃ劍褰佺粈楦跨槤闂勫嫪娆? * 瑜版挻褰佺粈楦跨槤閸栧綊鍘ら崘鍛村劥濞村繗顫嶉崳銊ゆ崲閸斺剝妞傞敍宀冨殰閸斻劍鍩呴崣鏍х秼閸撳秵绁荤憴鍫濇珤閺嶅洨顒锋い鐢垫畱閹搭亜娴樻担婊€璐熼梽鍕
 * @param input - 閸栧懎鎯?API閵嗕胶鍤庣粙濠璂閸滃本褰佺粈楦跨槤閻ㄥ嫯绶崗銉ヮ嚠鐠? * @returns 濞村繗顫嶉崳銊╂娴犳儼袙閺嬫劗绮ㄩ弸? */
export async function maybeResolveBrowserPromptAttachment(input: {
  api: NativeApi;
  threadId: ThreadId;
  prompt: string;
}): Promise<BrowserPromptAttachmentResolution> {
  // 婵″倹鐏夐弰鎯х础鐠囬攱鐪扮拋锛勭暬閺堣桨濞囬悽銊﹀灗娑撳秴灏柊宥嗙セ鐟欏牆娅掓禒璇插濡€崇础閿涘苯鍨稉宥咁槱閻?  if (
    promptRequestsExplicitComputerUse(input.prompt) ||
    !promptLooksLikeInternalBrowserTask(input.prompt)
  ) {
    return { requested: false, image: null };
  }

  // 閼惧嘲褰囧ù蹇氼潔閸ｃ劎濮搁幀?  const browserState = await input.api.browser.getState({
    threadId: input.threadId,
  });
  if (!browserState.open) {
    return { requested: true, image: null, reason: "no-open-browser" };
  }

  // 閺屻儲澹樺ú璇插З閺嶅洨顒锋い?  const activeTab =
    browserState.tabs.find((tab) => tab.id === browserState.activeTabId) ??
    browserState.tabs[0] ??
    null;
  if (!activeTab) {
    return { requested: true, image: null, reason: "no-active-tab" };
  }

  // 閹搭亜褰囪ぐ鎾冲閺嶅洨顒锋い鍨焻閸?  const screenshot = await input.api.browser.captureScreenshot({
    threadId: input.threadId,
    tabId: activeTab.id,
  });
  // 濡偓閺屻儲鍩呴崶鎯с亣鐏忓繑妲搁崥锕佺Т鏉╁洭妾洪崚?  if (screenshot.sizeBytes > PROVIDER_SEND_TURN_MAX_IMAGE_BYTES) {
    return { requested: true, image: null, reason: "attachment-too-large" };
  }

  return {
    requested: true,
    image: composerImageFromBrowserScreenshot(screenshot),
  };
}
