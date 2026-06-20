/**
 * @file ChatView.logic.ts
 * @description ChatView 缁勪欢鐨勭函閫昏緫灞傦紝鍖呭惈瀵硅瘽绾跨▼鏋勫缓銆佽闊宠緭鍏ュ鐞嗐€佹秷鎭檮浠剁鐞嗐€? *              鍙戦€佺姸鎬佹帹瀵笺€佺粓绔笂涓嬫枃杩囨护绛変笌 UI 娓叉煋鏃犲叧鐨勪笟鍔￠€昏緫鍑芥暟銆? *              鎵€鏈夊嚱鏁板潎涓虹函鍑芥暟鎴栨棤鍓綔鐢ㄧ殑宸ュ叿鍑芥暟锛屼究浜庡崟鍏冩祴璇曘€? */

import {
  ThreadId,
  type ModelSelection,
  type ModelSlug,
  type ProviderKind,
  type ServerProviderAuthStatus,
  type ThreadId as ThreadIdType,
} from "~/contracts";
import { normalizeModelSlug } from "~/shared/model";
import { buildRemicodeBranchName } from "~/shared/git";
import { isGenericChatThreadTitle } from "~/shared/chatThreads";
import { isGenericTerminalThreadTitle } from "~/shared/terminalThreads";
import {
  type ChatAssistantSelectionAttachment,
  type ChatMessage,
  type SessionPhase,
  type Thread,
  type ThreadPrimarySurface,
} from "../types";
import { type ComposerImageAttachment, type DraftThreadState } from "../composerDraftStore";
import { Schema } from "effect";
import {
  filterTerminalContextsWithText,
  stripInlineTerminalContextPlaceholders,
  type TerminalContextDraft,
} from "../lib/terminalContext";
import {
  humanizeSubagentStatus,
  resolveSubagentPresentationForThread,
} from "../lib/subagentPresentation";
import { hasLiveTurnTailWork, type WorkLogEntry } from "../session-logic";
import { localSubagentThreadId } from "./ChatView.selectors";
import type { ProviderModelOption } from "../providerModelOptions";

/** localStorage 閿細鎸夐」鐩褰曚笂娆¤皟鐢ㄧ殑鑴氭湰 */
export const LAST_INVOKED_SCRIPT_BY_PROJECT_KEY = "remicode:last-invoked-script-by-project";
/** localStorage 閿細宸插叧闂殑 Provider 鍋ュ悍鍛婅鏍囪瘑鍒楄〃 */
export const DISMISSED_PROVIDER_HEALTH_BANNERS_KEY = "remicode:dismissed-provider-health-banners";

/** 鎸夐」鐩褰曚笂娆¤皟鐢ㄨ剼鏈殑 Schema锛岀敤浜?localStorage 鏁版嵁鏍￠獙 */
export const LastInvokedScriptByProjectSchema = Schema.Record({ key: Schema.String, value: Schema.String });
/** 宸插叧闂殑 Provider 鍋ュ悍鍛婅 Schema锛岀敤浜?localStorage 鏁版嵁鏍￠獙 */
export const DismissedProviderHealthBannersSchema = Schema.Array(Schema.String);

/**
 * 鏍规嵁鏈湴鑽夌ǹ鐘舵€佹瀯寤轰竴涓湰鍦?Thread 瀵硅薄锛岀敤浜庡湪鏈嶅姟绔嚎绋嬪皻鏈垱寤烘椂鎻愪緵 UI 娓叉煋鎵€闇€鐨勬暟鎹粨鏋勩€? * @param threadId - 鏈湴鐢熸垚鐨勭嚎绋?ID
 * @param draftThread - 鏈湴鑽夌ǹ绾跨▼鐘舵€? * @param fallbackModelSelection - 褰撹崏绋挎湭鎸囧畾妯″瀷鏃剁殑鍥為€€妯″瀷閫夋嫨
 * @param error - 鍙€夌殑閿欒淇℃伅锛岀敤浜庡睍绀哄垱寤哄け璐ョ姸鎬? * @returns 鏋勫缓瀹屾垚鐨?Thread 瀵硅薄锛屽寘鍚┖鐨勬秷鎭垪琛ㄥ拰浼氳瘽
 */
export function buildLocalDraftThread(
  threadId: ThreadId,
  draftThread: DraftThreadState,
  fallbackModelSelection: ModelSelection,
  error: string | null,
): Thread {
  return {
    id: threadId,
    codexThreadId: null,
    projectId: draftThread.projectId,
    title: draftThread.entryPoint === "terminal" ? "New terminal" : "New thread",
    modelSelection: fallbackModelSelection,
    runtimeMode: draftThread.runtimeMode,
    interactionMode: draftThread.interactionMode,
    session: null,
    messages: [],
    error,
    createdAt: draftThread.createdAt,
    latestTurn: null,
    lastVisitedAt: draftThread.createdAt,
    envMode: draftThread.envMode,
    branch: draftThread.branch,
    worktreePath: draftThread.worktreePath,
    lastKnownPr: draftThread.lastKnownPr ?? null,
    handoff: null,
    turnDiffSummaries: [],
    activities: [],
    proposedPlans: [],
  };
}

/**
 * 瑙ｆ瀽褰撳墠娲昏穬绾跨▼鐨勬樉绀烘爣棰橈紝浼樺厛浣跨敤瀛愪唬鐞嗘爣棰橈紝瀵圭┖鐧界殑 Home Chat 浣跨敤 "New Chat"銆? * @param input.title - 绾跨▼鍘熷鏍囬
 * @param input.subagentTitle - 瀛愪唬鐞嗘爣棰橈紙濡傛湁锛? * @param input.isHomeChat - 鏄惁涓?Home Chat 瀹瑰櫒
 * @param input.isEmpty - 绾跨▼鏄惁涓虹┖锛堟棤娑堟伅锛? * @returns 鏈€缁堝睍绀虹粰鐢ㄦ埛鐨勬爣棰樻枃鏈? */
export function resolveActiveThreadTitle(input: {
  title: string;
  subagentTitle: string | null;
  isHomeChat: boolean;
  isEmpty: boolean;
}): string {
  if (input.subagentTitle) {
    return input.subagentTitle;
  }
  if (input.isHomeChat && input.isEmpty && isGenericChatThreadTitle(input.title)) {
    return "New Chat";
  }
  return input.title;
}

// 鏃佽亰锛坰idechat锛夋惡甯︿簡浠?fork 瀵煎叆鐨勫巻鍙叉秷鎭敤浜?Provider 涓婁笅鏂囷紝浣嗗叾瀵硅瘽闈㈡澘搴斿彧灞曠ず
// 鏂扮殑鏃佽亰娑堟伅锛屽洜姝ら渶瑕佽繃婊ゆ帀 fork-import 鏉ユ簮鐨勬秷鎭€?/**
 * 杩囨护鏃佽亰娑堟伅鍒楄〃锛岀Щ闄や粠 fork 瀵煎叆鐨勫巻鍙叉秷鎭紝浠呬繚鐣欐梺鑱婅嚜韬骇鐢熺殑鏂版秷鎭€? * @param messages - 鍘熷娑堟伅鍒楄〃
 * @param isSidechat - 鏄惁涓烘梺鑱婄嚎绋? * @returns 杩囨护鍚庣殑娑堟伅鍒楄〃
 */
export function filterSidechatTranscriptMessages(
  messages: readonly ChatMessage[],
  isSidechat: boolean,
): ChatMessage[] {
  return isSidechat
    ? messages.filter((message) => message.source !== "fork-import")
    : [...messages];
}

/** 閲婃斁 blob: 棰勮 URL锛岄槻姝㈠唴瀛樻硠婕忋€備粎瀵?blob: 鍗忚鐨?URL 鎵ц revokeObjectURL銆?*/
export function revokeBlobPreviewUrl(previewUrl: string | undefined): void {
  if (!previewUrl || typeof URL === "undefined" || !previewUrl.startsWith("blob:")) {
    return;
  }
  URL.revokeObjectURL(previewUrl);
}

/** 閲婃斁鐢ㄦ埛娑堟伅涓墍鏈夊浘鐗囬檮浠剁殑 blob: 棰勮 URL锛岄槻姝㈠唴瀛樻硠婕?*/
export function revokeUserMessagePreviewUrls(message: ChatMessage): void {
  if (message.role !== "user" || !message.attachments) {
    return;
  }
  for (const attachment of message.attachments) {
    if (attachment.type !== "image") {
      continue;
    }
    revokeBlobPreviewUrl(attachment.previewUrl);
  }
}

/** 鏀堕泦鐢ㄦ埛娑堟伅涓墍鏈夊浘鐗囬檮浠剁殑 blob: 棰勮 URL锛岀敤浜庢壒閲忛噴鏀?*/
export function collectUserMessageBlobPreviewUrls(message: ChatMessage): string[] {
  if (message.role !== "user" || !message.attachments) {
    return [];
  }
  const previewUrls: string[] = [];
  for (const attachment of message.attachments) {
    if (attachment.type !== "image") continue;
    if (!attachment.previewUrl || !attachment.previewUrl.startsWith("blob:")) continue;
    previewUrls.push(attachment.previewUrl);
  }
  return previewUrls;
}

/**
 * 灏嗚闊宠浆褰曟枃鏈拷鍔犲埌褰撳墠鎻愮ず璇嶆湯灏撅紝鐢ㄦ崲琛岀鍒嗛殧銆? * @param currentPrompt - 褰撳墠杈撳叆妗嗕腑鐨勬彁绀鸿瘝
 * @param transcript - 璇煶杞綍鏂囨湰
 * @returns 鍚堝苟鍚庣殑鎻愮ず璇嶏紱鑻ヨ浆褰曚负绌哄垯杩斿洖 null 琛ㄧず鏃犻渶杩藉姞
 */
export function appendVoiceTranscriptToPrompt(
  currentPrompt: string,
  transcript: string,
): string | null {
  const trimmedTranscript = transcript.trim();
  if (trimmedTranscript.length === 0) {
    return null;
  }
  return currentPrompt.trim().length === 0
    ? trimmedTranscript
    : `${currentPrompt.replace(/\s+$/, "")}\n${trimmedTranscript}`;
}

/**
 * 娓呮礂璇煶杈撳叆閿欒淇℃伅锛岀Щ闄ゅ爢鏍堣窡韪拰閲嶅鐨?Error 鍓嶇紑锛岃繑鍥炵敤鎴峰弸濂界殑閿欒鎻忚堪銆? * @param message - 鍘熷閿欒娑堟伅
 * @returns 娓呮礂鍚庣殑閿欒娑堟伅锛涜嫢娓呮礂鍚庝负绌哄垯杩斿洖榛樿鎻愮ず
 */
export function sanitizeVoiceErrorMessage(message: string): string {
  const normalized = message.trim();
  if (normalized.length === 0) {
    return "The voice note could not be transcribed.";
  }

  const firstLine = normalized.split("\n")[0]?.trim() ?? normalized;
  const withoutInlineStack = firstLine.replace(/\s+at file:\/\/.*$/s, "").trim();
  const withoutRemoteMethodPrefix = withoutInlineStack.replace(
    /^Error invoking remote method ['"][^'"]+['"]:\s*/i,
    "",
  );
  const withoutRepeatedErrorPrefix = withoutRemoteMethodPrefix.replace(/^(Error:\s*)+/i, "").trim();

  return withoutRepeatedErrorPrefix.length > 0
    ? withoutRepeatedErrorPrefix
    : "The voice note could not be transcribed.";
}

/** 鍒ゆ柇璇煶閿欒娑堟伅鏄惁琛ㄧず璁よ瘉宸茶繃鏈燂紝闇€瑕佺敤鎴烽噸鏂扮櫥褰?*/
export function isVoiceAuthExpiredMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("chatgpt login has expired") || normalized.includes("sign in again");
}

/**
 * 鏍规嵁楹﹀厠椋庡惎鍔ㄩ敊璇被鍨嬬敓鎴愮敤鎴峰弸濂界殑閿欒鎻忚堪锛岃鐩栨潈闄愭嫆缁濄€佽澶囨湭鎵惧埌銆佽澶囩箒蹇欑瓑甯歌鍦烘櫙銆? * @param error - 鎹曡幏鍒扮殑閿欒瀵硅薄
 * @returns 闈㈠悜鐢ㄦ埛鐨勯敊璇彁绀烘枃鏈? */
export function describeVoiceRecordingStartError(error: unknown): string {
  if (!(error instanceof Error)) {
    return "The microphone could not be opened.";
  }

  const normalizedMessage = error.message.trim();
  const errorName = typeof error.name === "string" ? error.name : "";

  if (errorName === "NotAllowedError" || errorName === "PermissionDeniedError") {
    return "Microphone access was denied. Enable it in macOS Privacy & Security > Microphone for Remi Code, then try again.";
  }
  if (errorName === "NotFoundError" || errorName === "DevicesNotFoundError") {
    return "No microphone was found. Connect one and try again.";
  }
  if (errorName === "NotReadableError" || errorName === "TrackStartError") {
    return "The microphone is busy or unavailable right now. Close other audio apps and try again.";
  }
  if (errorName === "SecurityError") {
    return "Microphone access is blocked in this environment.";
  }
  if (normalizedMessage.length > 0) {
    return sanitizeVoiceErrorMessage(normalizedMessage);
  }

  return "The microphone could not be opened.";
}

/**
 * 鎺ㄥ璇煶绗旇鍔熻兘鐨?UI 鐘舵€侊紝鍒ゆ柇鏄惁鍙覆鏌撱€佸彲鍚姩璇煶绗旇锛屼互鍙婃槸鍚︽樉绀烘帶鍒舵寜閽€? * @param input.authStatus - 鏈嶅姟绔璇佺姸鎬? * @param input.voiceTranscriptionAvailable - 璇煶杞綍鏄惁鍙敤
 * @param input.isRecording - 鏄惁姝ｅ湪褰曢煶
 * @param input.isTranscribing - 鏄惁姝ｅ湪杞綍
 * @returns 璇煶绗旇 UI 鐘舵€侊細canRenderVoiceNotes / canStartVoiceNotes / showVoiceNotesControl
 */
export function deriveComposerVoiceState(input: {
  authStatus: ServerProviderAuthStatus | null | undefined;
  voiceTranscriptionAvailable: boolean | undefined;
  isRecording: boolean;
  isTranscribing: boolean;
}): {
  canRenderVoiceNotes: boolean;
  canStartVoiceNotes: boolean;
  showVoiceNotesControl: boolean;
} {
  const canRenderVoiceNotes = input.authStatus !== "unauthenticated";
  const canStartVoiceNotes = canRenderVoiceNotes && input.voiceTranscriptionAvailable !== false;

  return {
    canRenderVoiceNotes,
    canStartVoiceNotes,
    showVoiceNotesControl: canRenderVoiceNotes || input.isRecording || input.isTranscribing,
  };
}

/**
 * 鍒ゆ柇 Composer 妯″瀷閫夋嫨鍣ㄦ槸鍚﹀簲鏄剧ず楠ㄦ灦灞忓姞杞界姸鎬併€? * 褰?Provider 闇€瑕佸姩鎬佸彂鐜版ā鍨嬪垪琛ㄤ笖浠嶅湪鍔犺浇涓紝鎴栨寔涔呭寲鐨勬ā鍨嬮€夋嫨涓庡綋鍓嶉€夋嫨涓嶄竴鑷存椂鏄剧ず楠ㄦ灦灞忋€? * @param input - 鍖呭惈褰撳墠閫変腑鐨?Provider/妯″瀷銆佹寔涔呭寲/鑽夌ǹ妯″瀷閫夋嫨銆佸姞杞界姸鎬佺瓑
 * @returns 鏄惁搴旀樉绀洪鏋跺睆
 */
export function shouldShowComposerModelBootstrapSkeleton(input: {
  selectedProvider: ProviderKind;
  selectedModel: string | null | undefined;
  persistedModelSelection: ModelSelection | null | undefined;
  draftModelSelection: ModelSelection | null | undefined;
  providerModelsLoading: boolean;
  requiresDiscoveredModels?: boolean;
}): boolean {
  if (input.requiresDiscoveredModels === true && input.providerModelsLoading) {
    return true;
  }

  const draftSelection = input.draftModelSelection;
  if (draftSelection && draftSelection.provider === input.selectedProvider) {
    return false;
  }

  const persistedSelection = input.persistedModelSelection;
  if (!persistedSelection) {
    return false;
  }

  if (persistedSelection.provider !== input.selectedProvider) {
    return true;
  }

  if (!input.providerModelsLoading) {
    return false;
  }

  const normalizedSelectedModel =
    normalizeModelSlug(input.selectedModel, input.selectedProvider) ?? input.selectedModel;
  const normalizedPersistedModel =
    normalizeModelSlug(persistedSelection.model, persistedSelection.provider) ??
    persistedSelection.model;

  return normalizedSelectedModel !== normalizedPersistedModel;
}

/**
 * 瑙ｆ瀽鏈€缁堟彁浜ょ粰 Provider 鐨勬ā鍨嬫爣璇嗭紝浼樺厛鍖归厤杩愯鏃跺彲鐢ㄩ€夐」鍒楄〃涓殑 slug锛屽惁鍒欎娇鐢ㄥ洖閫€鍊笺€? * @param input.selectedModel - 鐢ㄦ埛閫夋嫨鐨勬ā鍨?slug
 * @param input.availableOptions - 褰撳墠鍙敤鐨勬ā鍨嬮€夐」鍒楄〃
 * @param input.fallback - 褰撴棤娉曞尮閰嶆椂鐨勫洖閫€鍑芥暟
 * @returns 鏈€缁堜娇鐢ㄧ殑妯″瀷 slug
 */
export function resolveCommittedProviderModel(input: {
  selectedModel: ModelSlug;
  availableOptions: ReadonlyArray<ProviderModelOption>;
  fallback: () => string;
}): string {
  const directRuntimeOption = input.availableOptions.find(
    (option) => option.slug === input.selectedModel,
  );
  return directRuntimeOption?.slug ?? input.fallback();
}

// Lets a pending custom binary path re-check a session that was already observed ready.
export function shouldConsumePendingCustomBinaryConfirmation(input: {
  sessionAlreadyChecked: boolean;
  pendingCustomBinaryPath: string | null | undefined;
}): boolean {
  return !input.sessionAlreadyChecked || Boolean(input.pendingCustomBinaryPath);
}

export interface PullRequestDialogState {
  initialReference: string | null;
  key: number;
}

export interface LocalDispatchSnapshot {
  startedAt: string;
  preparingWorktree: boolean;
  latestTurnTurnId: Thread["latestTurn"] extends infer T
    ? T extends { turnId: infer U }
      ? U | null
      : null
    : null;
  latestTurnRequestedAt: string | null;
  latestTurnStartedAt: string | null;
  latestTurnCompletedAt: string | null;
  sessionOrchestrationStatus: Thread["session"] extends infer T
    ? T extends { orchestrationStatus: infer U }
      ? U | null
      : null
    : null;
  sessionUpdatedAt: string | null;
}

export function createLocalDispatchSnapshot(
  activeThread: Thread | undefined,
  options?: { preparingWorktree?: boolean },
): LocalDispatchSnapshot {
  const latestTurn = activeThread?.latestTurn ?? null;
  const session = activeThread?.session ?? null;
  return {
    startedAt: new Date().toISOString(),
    preparingWorktree: Boolean(options?.preparingWorktree),
    latestTurnTurnId: latestTurn?.turnId ?? null,
    latestTurnRequestedAt: latestTurn?.requestedAt ?? null,
    latestTurnStartedAt: latestTurn?.startedAt ?? null,
    latestTurnCompletedAt: latestTurn?.completedAt ?? null,
    sessionOrchestrationStatus: session?.orchestrationStatus ?? null,
    sessionUpdatedAt: session?.updatedAt ?? null,
  };
}

export function hasServerAcknowledgedLocalDispatch(input: {
  localDispatch: LocalDispatchSnapshot | null;
  phase: SessionPhase;
  latestTurn: Thread["latestTurn"] | null;
  session: Thread["session"] | null;
  hasPendingApproval: boolean;
  hasPendingUserInput: boolean;
  threadError: string | null | undefined;
}): boolean {
  if (!input.localDispatch) {
    return false;
  }
  if (
    input.phase === "running" ||
    input.hasPendingApproval ||
    input.hasPendingUserInput ||
    Boolean(input.threadError)
  ) {
    return true;
  }

  const latestTurn = input.latestTurn ?? null;
  const session = input.session ?? null;
  const nextSessionOrchestrationStatus = session?.orchestrationStatus ?? null;
  const latestTurnChanged =
    input.localDispatch.latestTurnTurnId !== (latestTurn?.turnId ?? null) ||
    input.localDispatch.latestTurnRequestedAt !== (latestTurn?.requestedAt ?? null) ||
    input.localDispatch.latestTurnStartedAt !== (latestTurn?.startedAt ?? null) ||
    input.localDispatch.latestTurnCompletedAt !== (latestTurn?.completedAt ?? null);

  if (latestTurnChanged) {
    return true;
  }

  if (input.localDispatch.sessionOrchestrationStatus !== nextSessionOrchestrationStatus) {
    if (
      input.localDispatch.sessionOrchestrationStatus === null &&
      nextSessionOrchestrationStatus === "ready"
    ) {
      return false;
    }
    return true;
  }

  return false;
}

export const ACTIVE_TURN_LAYOUT_SETTLE_DELAY_MS = 180;

export function shouldStartActiveTurnLayoutGrace(options: {
  previousTurnLayoutLive: boolean;
  currentTurnLayoutLive: boolean;
  latestTurnStartedAt: string | null;
}): boolean {
  return (
    options.previousTurnLayoutLive &&
    !options.currentTurnLayoutLive &&
    options.latestTurnStartedAt !== null
  );
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Could not read image data."));
    });
    reader.addEventListener("error", () => {
      reject(reader.error ?? new Error("Failed to read image."));
    });
    reader.readAsDataURL(file);
  });
}

export function buildSuggestedWorktreeName(input: {
  associatedWorktreeBranch?: string | null;
  title?: string | null;
}): string {
  return buildRemicodeBranchName(input.associatedWorktreeBranch ?? input.title);
}

export function cloneComposerImageForRetry(
  image: ComposerImageAttachment,
): ComposerImageAttachment {
  if (typeof URL === "undefined" || !image.previewUrl.startsWith("blob:")) {
    return image;
  }
  try {
    return {
      ...image,
      previewUrl: URL.createObjectURL(image.file),
    };
  } catch {
    return image;
  }
}

export function deriveComposerSendState(options: {
  prompt: string;
  imageCount: number;
  assistantSelectionCount: number;
  terminalContexts: ReadonlyArray<TerminalContextDraft>;
}): {
  trimmedPrompt: string;
  sendableTerminalContexts: TerminalContextDraft[];
  expiredTerminalContextCount: number;
  hasSendableContent: boolean;
} {
  const trimmedPrompt = stripInlineTerminalContextPlaceholders(options.prompt).trim();
  const sendableTerminalContexts = filterTerminalContextsWithText(options.terminalContexts);
  const expiredTerminalContextCount =
    options.terminalContexts.length - sendableTerminalContexts.length;
  return {
    trimmedPrompt,
    sendableTerminalContexts,
    expiredTerminalContextCount,
    hasSendableContent:
      trimmedPrompt.length > 0 ||
      options.imageCount > 0 ||
      options.assistantSelectionCount > 0 ||
      sendableTerminalContexts.length > 0,
  };
}

export function collectUserMessageAssistantSelections(
  message: ChatMessage,
): ChatAssistantSelectionAttachment[] {
  if (message.role !== "user" || !message.attachments) {
    return [];
  }
  return message.attachments.filter(
    (attachment): attachment is ChatAssistantSelectionAttachment =>
      attachment.type === "assistant-selection",
  );
}

export function buildExpiredTerminalContextToastCopy(
  expiredTerminalContextCount: number,
  variant: "omitted" | "empty",
): { title: string; description: string } {
  const count = Math.max(1, Math.floor(expiredTerminalContextCount));
  const noun = count === 1 ? "Expired terminal context" : "Expired terminal contexts";
  if (variant === "empty") {
    return {
      title: `${noun} won't be sent`,
      description: "Remove it or re-add it to include terminal output.",
    };
  }
  return {
    title: `${noun} omitted from message`,
    description: "Re-add it if you want that terminal output included.",
  };
}

export function shouldRenderTerminalWorkspace(options: {
  activeProjectExists: boolean;
  presentationMode: "drawer" | "workspace";
  terminalOpen: boolean;
}): boolean {
  return (
    options.terminalOpen && options.presentationMode === "workspace" && options.activeProjectExists
  );
}

export function shouldAutoDeleteTerminalThreadOnLastClose(options: {
  isLastTerminal: boolean;
  isServerThread: boolean;
  terminalEntryPoint: ThreadPrimarySurface;
  thread:
    | Pick<Thread, "activities" | "latestTurn" | "messages" | "proposedPlans" | "session" | "title">
    | null
    | undefined;
}): boolean {
  const { thread } = options;
  if (
    !options.isLastTerminal ||
    !options.isServerThread ||
    options.terminalEntryPoint !== "terminal" ||
    !thread
  ) {
    return false;
  }
  return (
    isGenericTerminalThreadTitle(thread.title) &&
    thread.messages.length === 0 &&
    thread.latestTurn === null &&
    thread.session === null &&
    thread.activities.length === 0 &&
    thread.proposedPlans.length === 0
  );
}

export interface ThreadBreadcrumb {
  threadId: ThreadIdType;
  title: string;
}

export function buildThreadBreadcrumbs(
  threads: ReadonlyArray<Thread>,
  thread: Pick<Thread, "id" | "parentThreadId"> | null | undefined,
): ThreadBreadcrumb[] {
  if (!thread?.parentThreadId) {
    return [];
  }

  const threadById = new Map(threads.map((entry) => [entry.id, entry] as const));
  const breadcrumbs: ThreadBreadcrumb[] = [];
  const visited = new Set<ThreadIdType>();
  let currentParentId: ThreadIdType | null = thread.parentThreadId ?? null;

  while (currentParentId && !visited.has(currentParentId)) {
    visited.add(currentParentId);
    const parentThread = threadById.get(currentParentId);
    if (!parentThread) {
      break;
    }
    breadcrumbs.unshift({
      threadId: parentThread.id,
      title: parentThread.parentThreadId
        ? resolveSubagentPresentationForThread({ thread: parentThread, threads }).fullLabel
        : parentThread.title,
    });
    currentParentId = parentThread.parentThreadId ?? null;
  }

  return breadcrumbs;
}

function deriveSubagentStatus(thread: Thread | undefined): {
  isActive: boolean;
  label: string | undefined;
} {
  if (!thread) {
    return {
      isActive: false,
      label: undefined,
    };
  }

  if (thread.error || thread.session?.status === "error") {
    return {
      isActive: false,
      label: "Error",
    };
  }
  if (thread.session?.status === "connecting") {
    return {
      isActive: true,
      label: "Connecting",
    };
  }
  if (
    thread.session?.status === "running" ||
    hasLiveTurnTailWork({
      latestTurn: thread.latestTurn,
      messages: thread.messages,
      activities: thread.activities,
      session: thread.session,
    })
  ) {
    return {
      isActive: true,
      label: "Running",
    };
  }
  if (thread.session?.status === "closed") {
    return {
      isActive: false,
      label: "Closed",
    };
  }

  return {
    isActive: false,
    label: thread.session ? "Idle" : undefined,
  };
}

function humanizeSubagentRawStatus(rawStatus: string | undefined): string | undefined {
  return humanizeSubagentStatus(rawStatus);
}

function resolveTimelineSubagentThread(input: {
  subagent: NonNullable<WorkLogEntry["subagents"]>[number];
  parentThreadId: ThreadIdType | null;
  threadById: ReadonlyMap<ThreadIdType, Thread>;
  threads: ReadonlyArray<Thread>;
}): Thread | undefined {
  const directThreadId = input.subagent.resolvedThreadId ?? input.subagent.threadId;
  if (directThreadId) {
    const directMatch = input.threadById.get(ThreadId.makeUnsafe(directThreadId));
    if (directMatch) {
      return directMatch;
    }
  }

  if (input.parentThreadId) {
    const providerThreadId = input.subagent.providerThreadId ?? input.subagent.threadId;
    const derivedLocalThreadId = localSubagentThreadId(input.parentThreadId, providerThreadId);
    const derivedLocalMatch = input.threadById.get(derivedLocalThreadId);
    if (derivedLocalMatch) {
      return derivedLocalMatch;
    }

    if (input.subagent.agentId) {
      const matchedByAgent = input.threads.find(
        (thread) =>
          thread.parentThreadId === input.parentThreadId &&
          thread.subagentAgentId === input.subagent.agentId,
      );
      if (matchedByAgent) {
        return matchedByAgent;
      }
    }
  }

  if (input.subagent.agentId) {
    return input.threads.find((thread) => thread.subagentAgentId === input.subagent.agentId);
  }

  return undefined;
}

export function enrichSubagentWorkEntries(
  workEntries: ReadonlyArray<WorkLogEntry>,
  threads: ReadonlyArray<Thread>,
  parentThreadId: ThreadIdType | null,
): WorkLogEntry[] {
  if (workEntries.length === 0) {
    return [];
  }

  const threadById = new Map(threads.map((thread) => [thread.id, thread] as const));

  return workEntries.map((entry) => {
    if ((entry.subagents?.length ?? 0) === 0) {
      return entry;
    }

    const subagents = entry.subagents!.map((subagent) => {
      const matchedThread = resolveTimelineSubagentThread({
        subagent,
        parentThreadId,
        threadById,
        threads,
      });
      const status = deriveSubagentStatus(matchedThread);
      const fallbackStatusLabel = humanizeSubagentRawStatus(subagent.rawStatus);
      const matchedPresentation =
        matchedThread !== undefined
          ? resolveSubagentPresentationForThread({ thread: matchedThread, threads })
          : null;
      const nextSubagent = Object.assign({}, subagent);
      if (matchedThread) {
        nextSubagent.resolvedThreadId = matchedThread.id;
      }
      if (matchedPresentation) {
        nextSubagent.title = matchedPresentation.fullLabel;
      }
      if (status.label ?? fallbackStatusLabel) {
        nextSubagent.statusLabel = status.label ?? fallbackStatusLabel;
      }
      if (status.isActive || fallbackStatusLabel === "Running") {
        nextSubagent.isActive = true;
      }
      return nextSubagent;
    });

    return {
      ...entry,
      subagents,
    };
  });
}
