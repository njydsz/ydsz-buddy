/**
 * @file ChatView.logic.ts
 * @description ChatView 缂佸嫪娆㈤惃鍕嚱闁槒绶仦鍌︾礉閸栧懎鎯堢€电鐦界痪璺ㄢ柤閺嬪嫬缂撻妴浣筋嚔闂婂疇绶崗銉ヮ槱閻炲棎鈧焦绉烽幁顖炴娴犲墎顓搁悶鍡愨偓? *              閸欐垿鈧胶濮搁幀浣瑰腹鐎电鈧胶绮撶粩顖欑瑐娑撳鏋冩潻鍥ㄦ姢缁涘绗?UI 濞撳弶鐓嬮弮鐘插彠閻ㄥ嫪绗熼崝锟犫偓鏄忕帆閸戣姤鏆熼妴? *              閹碘偓閺堝鍤遍弫鏉挎綆娑撹櫣鍑介崙鑺ユ殶閹存牗妫ら崜顖欑稊閻劎娈戝銉ュ徔閸戣姤鏆熼敍灞肩┒娴滃骸宕熼崗鍐╃ゴ鐠囨洏鈧? */

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

/** localStorage 闁款噯绱伴幐澶愩€嶉惄顔款唶瑜版洑绗傚▎陇鐨熼悽銊ф畱閼存碍婀?*/
export const LAST_INVOKED_SCRIPT_BY_PROJECT_KEY = "remicode:last-invoked-script-by-project";
/** localStorage 闁款噯绱板鎻掑彠闂傤厾娈?Provider 閸嬨儱鎮嶉崨濠咁劅閺嶅洩鐦戦崚妤勩€?*/
export const DISMISSED_PROVIDER_HEALTH_BANNERS_KEY = "remicode:dismissed-provider-health-banners";

/** 閹稿銆嶉惄顔款唶瑜版洑绗傚▎陇鐨熼悽銊ㄥ壖閺堫剛娈?Schema閿涘瞼鏁ゆ禍?localStorage 閺佺増宓侀弽锟犵崣 */
export const LastInvokedScriptByProjectSchema = Schema.Record({ key: Schema.String, value: Schema.String });
/** 瀹告彃鍙ч梻顓犳畱 Provider 閸嬨儱鎮嶉崨濠咁劅 Schema閿涘瞼鏁ゆ禍?localStorage 閺佺増宓侀弽锟犵崣 */
export const DismissedProviderHealthBannersSchema = Schema.Array(Schema.String);

/**
 * 閺嶈宓侀張顒€婀撮懡澶屒归悩鑸碘偓浣圭€杞扮娑擃亝婀伴崷?Thread 鐎电钖勯敍宀€鏁ゆ禍搴℃躬閺堝秴濮熺粩顖滃殠缁嬪鐨婚張顏勫灡瀵ょ儤妞傞幓鎰返 UI 濞撳弶鐓嬮幍鈧棁鈧惃鍕殶閹诡喚绮ㄩ弸鍕┾偓? * @param threadId - 閺堫剙婀撮悽鐔稿灇閻ㄥ嫮鍤庣粙?ID
 * @param draftThread - 閺堫剙婀撮懡澶屒圭痪璺ㄢ柤閻樿埖鈧? * @param fallbackModelSelection - 瑜版捁宕忕粙鎸庢弓閹稿洤鐣惧Ο鈥崇€烽弮鍓佹畱閸ョ偤鈧偓濡€崇€烽柅澶嬪
 * @param error - 閸欘垶鈧娈戦柨娆掝嚖娣団剝浼呴敍宀€鏁ゆ禍搴＄潔缁€鍝勫灡瀵ゅ搫銇戠拹銉уЦ閹? * @returns 閺嬪嫬缂撶€瑰本鍨氶惃?Thread 鐎电钖勯敍灞藉瘶閸氼偆鈹栭惃鍕Х閹垰鍨悰銊ユ嫲娴兼俺鐦? */
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
 * 鐟欙絾鐎借ぐ鎾冲濞叉槒绌痪璺ㄢ柤閻ㄥ嫭妯夌粈鐑樼垼妫版﹫绱濇导妯哄帥娴ｈ法鏁ょ€涙劒鍞悶鍡樼垼妫版﹫绱濈€靛湱鈹栭惂鐣屾畱 Home Chat 娴ｈ法鏁?"New Chat"閵? * @param input.title - 缁捐法鈻奸崢鐔奉潗閺嶅洭顣? * @param input.subagentTitle - 鐎涙劒鍞悶鍡樼垼妫版﹫绱欐俊鍌涙箒閿? * @param input.isHomeChat - 閺勵垰鎯佹稉?Home Chat 鐎圭懓娅? * @param input.isEmpty - 缁捐法鈻奸弰顖氭儊娑撹櫣鈹栭敍鍫熸￥濞戝牊浼呴敍? * @returns 閺堚偓缂佸牆鐫嶇粈铏圭舶閻劍鍩涢惃鍕垼妫版ɑ鏋冮張? */
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

// 閺冧浇浜伴敍鍧癷dechat閿涘鎯＄敮锔跨啊娴?fork 鐎电厧鍙嗛惃鍕坊閸欏弶绉烽幁顖滄暏娴?Provider 娑撳﹣绗呴弬鍥风礉娴ｅ棗鍙剧€电鐦介棃銏℃緲鎼存柨褰х仦鏇犮仛
// 閺傛壆娈戦弮浣戒喊濞戝牊浼呴敍灞芥礈濮濄倝娓剁憰浣界箖濠娿倖甯€ fork-import 閺夈儲绨惃鍕Х閹垬鈧?/**
 * 鏉╁洦鎶ら弮浣戒喊濞戝牊浼呴崚妤勩€冮敍宀€些闂勩倓绮?fork 鐎电厧鍙嗛惃鍕坊閸欏弶绉烽幁顖ょ礉娴犲懍绻氶悾娆愭⒑閼卞﹨鍤滈煬顐￠獓閻㈢喓娈戦弬鐗堢Х閹垬鈧? * @param messages - 閸樼喎顫愬☉鍫熶紖閸掓銆? * @param isSidechat - 閺勵垰鎯佹稉鐑樻⒑閼卞﹦鍤庣粙? * @returns 鏉╁洦鎶ら崥搴ｆ畱濞戝牊浼呴崚妤勩€? */
export function filterSidechatTranscriptMessages(
  messages: readonly ChatMessage[],
  isSidechat: boolean,
): ChatMessage[] {
  return isSidechat
    ? messages.filter((message) => message.source !== "fork-import")
    : [...messages];
}

/** 闁插﹥鏂?blob: 妫板嫯顫?URL閿涘矂妲诲銏犲敶鐎涙ɑ纭犲蹇嬧偓鍌欑矌鐎?blob: 閸楀繗顔呴惃?URL 閹笛嗩攽 revokeObjectURL閵?*/
export function revokeBlobPreviewUrl(previewUrl: string | undefined): void {
  if (!previewUrl || typeof URL === "undefined" || !previewUrl.startsWith("blob:")) {
    return;
  }
  URL.revokeObjectURL(previewUrl);
}

/** 闁插﹥鏂侀悽銊﹀煕濞戝牊浼呮稉顓熷閺堝娴橀悧鍥娴犲墎娈?blob: 妫板嫯顫?URL閿涘矂妲诲銏犲敶鐎涙ɑ纭犲?*/
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

/** 閺€鍫曟肠閻劍鍩涘☉鍫熶紖娑擃厽澧嶉張澶婃禈閻楀洭妾禒鍓佹畱 blob: 妫板嫯顫?URL閿涘瞼鏁ゆ禍搴㈠闁插繘鍣撮弨?*/
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
 * 鐏忓棜顕㈤棅瀹犳祮瑜版洘鏋冮張顒冩嫹閸旂姴鍩岃ぐ鎾冲閹绘劗銇氱拠宥嗘汞鐏忔拝绱濋悽銊﹀床鐞涘瞼顑侀崚鍡涙閵? * @param currentPrompt - 瑜版挸澧犳潏鎾冲弳濡楀棔鑵戦惃鍕絹缁€楦跨槤
 * @param transcript - 鐠囶參鐓舵潪顒€缍嶉弬鍥ㄦ拱
 * @returns 閸氬牆鑻熼崥搴ｆ畱閹绘劗銇氱拠宥忕幢閼汇儴娴嗚ぐ鏇氳礋缁屽搫鍨潻鏂挎礀 null 鐞涖劎銇氶弮鐘绘付鏉╄棄濮? */
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
 * 濞撳懏绀傜拠顓㈢叾鏉堟挸鍙嗛柨娆掝嚖娣団剝浼呴敍宀€些闂勩倕鐖㈤弽鍫ｇ闊亜鎷伴柌宥咁槻閻?Error 閸撳秶绱戦敍宀冪箲閸ョ偟鏁ら幋宄板几婵傜晫娈戦柨娆掝嚖閹诲繗鍫妴? * @param message - 閸樼喎顫愰柨娆掝嚖濞戝牊浼? * @returns 濞撳懏绀傞崥搴ｆ畱闁挎瑨顕ゅ☉鍫熶紖閿涙稖瀚㈠〒鍛閸氬簼璐熺粚鍝勫灟鏉╂柨娲栨妯款吇閹绘劗銇? */
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

/** 閸掋倖鏌囩拠顓㈢叾闁挎瑨顕ゅ☉鍫熶紖閺勵垰鎯佺悰銊с仛鐠併倛鐦夊鑼剁箖閺堢噦绱濋棁鈧憰浣烘暏閹寸兘鍣搁弬鎵瑜?*/
export function isVoiceAuthExpiredMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("chatgpt login has expired") || normalized.includes("sign in again");
}

/**
 * 閺嶈宓佹ス锕€鍘犳搴℃儙閸斻劑鏁婄拠顖滆閸ㄥ鏁撻幋鎰暏閹村嘲寮告總鐣屾畱闁挎瑨顕ら幓蹇氬牚閿涘矁顩惄鏍ㄦ綀闂勬劖瀚嗙紒婵勨偓浣筋啎婢跺洦婀幍鎯у煂閵嗕浇顔曟径鍥╃畳韫囨瑧鐡戠敮姝岊潌閸︾儤娅欓妴? * @param error - 閹规洝骞忛崚鎵畱闁挎瑨顕ょ€电钖? * @returns 闂堛垹鎮滈悽銊﹀煕閻ㄥ嫰鏁婄拠顖涘絹缁€鐑樻瀮閺? */
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
 * 閹恒劌顕辩拠顓㈢叾缁楁棁顔囬崝鐔诲厴閻?UI 閻樿埖鈧緤绱濋崚銈嗘焽閺勵垰鎯侀崣顖涜閺屾挶鈧礁褰查崥顖氬З鐠囶參鐓剁粭鏃囶唶閿涘奔浜掗崣濠冩Ц閸氾附妯夌粈鐑樺付閸掕埖瀵滈柦顔衡偓? * @param input.authStatus - 閺堝秴濮熺粩顖濐吇鐠囦胶濮搁幀? * @param input.voiceTranscriptionAvailable - 鐠囶參鐓舵潪顒€缍嶉弰顖氭儊閸欘垳鏁? * @param input.isRecording - 閺勵垰鎯佸锝呮躬瑜版洟鐓? * @param input.isTranscribing - 閺勵垰鎯佸锝呮躬鏉烆剙缍? * @returns 鐠囶參鐓剁粭鏃囶唶 UI 閻樿埖鈧緤绱癱anRenderVoiceNotes / canStartVoiceNotes / showVoiceNotesControl
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
 * 閸掋倖鏌?Composer 濡€崇€烽柅澶嬪閸ｃ劍妲搁崥锕€绨查弰鍓с仛妤犮劍鐏︾仦蹇撳鏉炵晫濮搁幀浣碘偓? * 瑜?Provider 闂団偓鐟曚礁濮╅幀浣稿絺閻滅増膩閸ㄥ鍨悰銊ょ瑬娴犲秴婀崝鐘烘祰娑擃叏绱濋幋鏍ㄥ瘮娑斿懎瀵查惃鍕侀崹瀣偓澶嬪娑撳骸缍嬮崜宥夆偓澶嬪娑撳秳绔撮懛瀛樻閺勫墽銇氭銊︾仸鐏炲繈鈧? * @param input - 閸栧懎鎯堣ぐ鎾冲闁鑵戦惃?Provider/濡€崇€烽妴浣瑰瘮娑斿懎瀵?閼藉枪濡€崇€烽柅澶嬪閵嗕礁濮炴潪鐣屽Ц閹胶鐡? * @returns 閺勵垰鎯佹惔鏃€妯夌粈娲€囬弸璺虹潌
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
 * 鐟欙絾鐎介張鈧紒鍫熷絹娴溿倗绮?Provider 閻ㄥ嫭膩閸ㄥ鐖ｇ拠鍡礉娴兼ê鍘涢崠褰掑帳鏉╂劘顢戦弮璺哄讲閻劑鈧銆嶉崚妤勩€冩稉顓犳畱 slug閿涘苯鎯侀崚娆庡▏閻劌娲栭柅鈧崐绗衡偓? * @param input.selectedModel - 閻劍鍩涢柅澶嬪閻ㄥ嫭膩閸?slug
 * @param input.availableOptions - 瑜版挸澧犻崣顖滄暏閻ㄥ嫭膩閸ㄥ鈧銆嶉崚妤勩€? * @param input.fallback - 瑜版挻妫ゅ▔鏇炲爱闁板秵妞傞惃鍕礀闁偓閸戣姤鏆? * @returns 閺堚偓缂佸牅濞囬悽銊ф畱濡€崇€?slug
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
