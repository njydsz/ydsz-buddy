/**
 * @file taskCompletion.logic.ts
 * @description 绾跨▼鐢熷懡鍛ㄦ湡閫氱煡妫€娴嬩笌閫氱煡鏂囨鏋勫缓閫昏緫灞傘€? * 璐熻矗璇嗗埆绾跨▼/缁堢鐨勫畬鎴愭€佷笌闇€鍏虫敞鎬佸彉鏇达紝骞剁敓鎴愬搴旂殑閫氱煡鏂囨銆? * 鏈ā鍧椾负绾€昏緫灞傦紝涓嶅寘鍚?UI 鐩稿叧浠ｇ爜銆? */

import {
  defaultTerminalTitleForCliKind,
  type TerminalCliKind,
  type TerminalVisualState,
} from "~/shared/terminalThreads";
import type { Thread, ThreadSession } from "../types";
import {
  derivePendingApprovals,
  derivePendingUserInputs,
  hasLiveLatestTurn,
} from "../session-logic";

/**
 * 宸插畬鎴愮殑绾跨▼鍊欓€夐」锛岀敤浜庣敓鎴愪换鍔″畬鎴愰€氱煡銆? */
export interface CompletedThreadCandidate {
  /** 绾跨▼鍞竴鏍囪瘑 */
  threadId: Thread["id"];
  /** 鎵€灞為」鐩敮涓€鏍囪瘑 */
  projectId: Thread["projectId"];
  /** 绾跨▼鏍囬 */
  title: string;
  /** 浠诲姟瀹屾垚鏃堕棿鎴筹紙ISO 8601 鏍煎紡锛?*/
  completedAt: string;
  /** 鍔╂墜鏈€鏂版秷鎭殑鎽樿鏂囨湰锛岃嫢鏃犲垯涓?null */
  assistantSummary: string | null;
}

/**
 * 绾跨▼闇€瑕佺敤鎴峰叧娉ㄧ殑鍊欓€夐」锛岀敤浜庣敓鎴?闇€瑕佽緭鍏?绫婚€氱煡銆? */
export interface ThreadAttentionCandidate {
  /** 鍏虫敞绫诲瀷锛歛pproval锛堝鎵硅姹傦級鎴?user-input锛堢敤鎴疯緭鍏ヨ姹傦級 */
  kind: "approval" | "user-input";
  /** 绾跨▼鍞竴鏍囪瘑 */
  threadId: Thread["id"];
  /** 鎵€灞為」鐩敮涓€鏍囪瘑 */
  projectId: Thread["projectId"];
  /** 绾跨▼鏍囬 */
  title: string;
  /** 璇锋眰鍞竴鏍囪瘑锛堝鎵硅姹傛垨鐢ㄦ埛杈撳叆璇锋眰鐨?ID锛?*/
  requestId: string;
  /** 璇锋眰鍒涘缓鏃堕棿鎴筹紙ISO 8601 鏍煎紡锛?*/
  createdAt: string;
  /** 瀹℃壒璇锋眰鐨勫瓙绫诲瀷锛氬懡浠ゆ墽琛屻€佹枃浠惰鍙栨垨鏂囦欢鍙樻洿 */
  requestKind?: "command" | "file-read" | "file-change";
  /** 鍙€夌殑璇锋眰鎽樿淇℃伅 */
  summary?: string;
}

/**
 * 缁堢閫氱煡鎵€闇€鐨勭嚎绋嬬姸鎬佸揩鐓э紝鍖呭惈绾跨▼涓嬫墍鏈夌粓绔殑杩愯鐘舵€佷笌鍏冧俊鎭€? */
interface TerminalNotificationThreadState {
  /** 褰撳墠姝ｅ湪杩愯鐨勭粓绔?ID 鍒楄〃 */
  runningTerminalIds: string[];
  /** 鍚勭粓绔殑鍏虫敞鐘舵€佹槧灏勶紙attention=闇€绔嬪嵆鍏虫敞, review=寰呭鏌ワ級 */
  terminalAttentionStatesById: Record<string, "attention" | "review">;
  /** 鍚勭粓绔殑 CLI 绫诲瀷鏄犲皠锛堝 bash銆乸owershell 绛夛級 */
  terminalCliKindsById: Record<string, TerminalCliKind>;
  /** 绾跨▼涓嬫墍鏈夌粓绔?ID 鍒楄〃 */
  terminalIds: string[];
  /** 鍚勭粓绔殑鐢ㄦ埛鑷畾涔夋爣绛炬槧灏?*/
  terminalLabelsById: Record<string, string>;
  /** 鍚勭粓绔殑鏍囬瑕嗙洊鍊兼槧灏勶紙浼樺厛绾ч珮浜庨粯璁ゆ爣棰樺拰鏍囩锛?*/
  terminalTitleOverridesById: Record<string, string>;
}

/**
 * 宸插畬鎴愮殑缁堢浠诲姟鍊欓€夐」锛岀敤浜庣敓鎴愮粓绔换鍔″畬鎴愰€氱煡銆? */
export interface CompletedTerminalCandidate {
  /** 缁堢 CLI 绫诲瀷锛屾棤娉曠‘瀹氭椂涓?null */
  cliKind: TerminalCliKind | null;
  /** 缁堢鍞竴鏍囪瘑 */
  terminalId: string;
  /** 鎵€灞炵嚎绋嬪敮涓€鏍囪瘑 */
  threadId: Thread["id"];
  /** 缁堢鏄剧ず鏍囬 */
  title: string;
}

/**
 * 缁堢闇€瑕佺敤鎴峰叧娉ㄧ殑鍊欓€夐」锛岀敤浜庣敓鎴愮粓绔?闇€瑕佸叧娉?绫婚€氱煡銆? */
export interface TerminalAttentionCandidate {
  /** 缁堢 CLI 绫诲瀷锛屾棤娉曠‘瀹氭椂涓?null */
  cliKind: TerminalCliKind | null;
  /** 缁堢鍞竴鏍囪瘑 */
  terminalId: string;
  /** 鎵€灞炵嚎绋嬪敮涓€鏍囪瘑 */
  threadId: Thread["id"];
  /** 缁堢鏄剧ず鏍囬 */
  title: string;
}

/** 绾跨▼浼氳瘽鐘舵€佺被鍨嬶紝澶嶇敤 ThreadSession 鐨?status 瀛楁绫诲瀷 */
type ThreadSessionStatus = ThreadSession["status"];

/**
 * 鍒ゆ柇鏄惁搴旀樉绀虹嚎绋嬪畬鎴愰€氱煡鐨?Toast 鎻愮ず銆? * 浠呭湪鐩爣绾跨▼褰撳墠涓嶅彲瑙佹椂鎵嶆樉绀洪€氱煡锛岄伩鍏嶅宸插睍绀哄湪灞忓箷涓婄殑绾跨▼閲嶅鎻愰啋銆? *
 * @param input.threadId - 寰呭垽鏂殑绾跨▼ ID
 * @param input.visibleThreadIds - 褰撳墠灞忓箷涓婂彲瑙佺殑绾跨▼ ID 闆嗗悎
 * @returns 鑻ョ嚎绋嬩笉鍙鍒欒繑鍥?true锛岃〃绀哄簲鏄剧ず Toast
 */
export function shouldShowThreadNotificationToast(input: {
  threadId: Thread["id"];
  visibleThreadIds: ReadonlySet<Thread["id"]>;
}): boolean {
  return !input.visibleThreadIds.has(input.threadId);
}

/**
 * 鍒ゆ柇绾跨▼浼氳瘽鐘舵€佹槸鍚﹀睘浜?杩愯涓?銆? * 灏?"running"锛堣繍琛屼腑锛夊拰 "connecting"锛堣繛鎺ヤ腑锛夊潎瑙嗕负杩愯鎬併€? *
 * @param status - 绾跨▼浼氳瘽鐘舵€佸€? * @returns 鑻ヤ负杩愯涓垨杩炴帴涓姸鎬佸垯杩斿洖 true
 */
function isRunningStatus(status: ThreadSessionStatus | null | undefined): boolean {
  return status === "running" || status === "connecting";
}

/**
 * 浠庣嚎绋嬫秷鎭垪琛ㄤ腑鎻愬彇鏈€鍚庝竴鏉″姪鎵嬫秷鎭殑鎽樿銆? * 鎽樿浼氬幓闄ゅ浣欑┖鐧藉瓧绗﹀苟鎴柇鑷?140 瀛楃浠ュ唴锛岄伩鍏嶅湪绯荤粺閫氱煡涓睍绀鸿繃闀垮唴瀹广€? *
 * @param thread - 绾跨▼瀵硅薄锛屽寘鍚畬鏁寸殑娑堟伅鍒楄〃
 * @returns 鍔╂墜娑堟伅鎽樿鏂囨湰锛堟渶闀?140 瀛楃锛夛紝鑻ユ棤鍔╂墜娑堟伅鍒欒繑鍥?null
 */
function summarizeLatestAssistantMessage(thread: Thread): string | null {
  // 浠庢秷鎭垪琛ㄦ湯灏惧悜鍓嶉亶鍘嗭紝鎵惧埌鏈€鍚庝竴鏉″姪鎵嬭鑹茬殑娑堟伅
  for (let index = thread.messages.length - 1; index >= 0; index -= 1) {
    const message = thread.messages[index];
    if (!message || message.role !== "assistant") {
      continue;
    }
    // 鍘婚櫎棣栧熬绌虹櫧骞跺皢杩炵画绌虹櫧瀛楃鍘嬬缉涓哄崟涓┖鏍?    const trimmed = message.text.trim().replace(/\s+/g, " ");
    if (trimmed.length === 0) {
      continue;
    }
    // 瓒呰繃 140 瀛楃鏃舵埅鏂苟娣诲姞鐪佺暐鍙?    return trimmed.length <= 140 ? trimmed : `${trimmed.slice(0, 137)}...`;
  }
  return null;
}

/**
 * 鍒ゆ柇绾跨▼鏄惁瀛樺湪鏈畬鎴愮殑杞锛坱urn锛夈€? * 婊¤冻浠ヤ笅浠讳竴鏉′欢鍗宠涓哄瓨鍦ㄦ湭瀹屾垚杞锛? * 1. 鏈€鏂拌疆娆′粛澶勪簬娲昏穬鐘舵€侊紙鏈夊疄鏃朵氦浜掞級
 * 2. 鏈€鏂拌疆娆℃病鏈夊畬鎴愭椂闂存埑锛屼笖浼氳瘽澶勪簬杩愯涓姸鎬? *
 * @param thread - 绾跨▼瀵硅薄
 * @returns 鑻ュ瓨鍦ㄦ湭瀹屾垚杞鍒欒繑鍥?true
 */
function hadUnsettledTurn(thread: Thread | undefined): boolean {
  if (!thread) {
    return false;
  }
  // 妫€鏌ユ渶鏂拌疆娆℃槸鍚︿粛鏈夊疄鏃朵氦浜?  if (hasLiveLatestTurn(thread.latestTurn, thread.session)) {
    return true;
  }
  // 杞鏈畬鎴愪笖浼氳瘽浠嶅湪杩愯
  return !thread.latestTurn?.completedAt && isRunningStatus(thread.session?.status);
}

/**
 * 鍒ゆ柇绾跨▼鐨勫畬鎴愰€氱煡鏄惁宸茬ǔ瀹氾紙settled锛夈€? * 绋冲畾鐨勬潯浠讹細鏈€鏂拌疆娆℃湁寮€濮嬪拰瀹屾垚鏃堕棿鎴筹紝涓斾細璇濈殑缂栨帓鐘舵€佷笉鏄?"running"銆? *
 * @param thread - 绾跨▼瀵硅薄
 * @returns 鑻ラ€氱煡鐘舵€佸凡绋冲畾锛堝彲浠ュ畨鍏ㄥ彂鍑哄畬鎴愰€氱煡锛夊垯杩斿洖 true
 */
function isCompletionNotificationSettled(thread: Thread | undefined): boolean {
  // 蹇呴』鏈夎疆娆＄殑寮€濮嬪拰瀹屾垚鏃堕棿鎴?  if (!thread?.latestTurn?.startedAt || !thread.latestTurn.completedAt) {
    return false;
  }
  // 娌℃湁浼氳瘽淇℃伅鏃惰涓哄凡绋冲畾
  if (!thread.session) {
    return true;
  }
  // 缂栨帓鐘舵€佷笉鍐嶆槸杩愯涓紝璇存槑宸插畬鍏ㄧ粨鏉?  return thread.session.orchestrationStatus !== "running";
}

/**
 * 瀵规瘮鍓嶅悗涓ゆ绾跨▼蹇収锛屾敹闆嗘柊浜х敓鐨勫凡瀹屾垚绾跨▼鍊欓€夐」銆? * 閫氳繃姣旇緝杩炵画蹇収涓殑鐘舵€佸彉鍖栵紝浠呭湪妫€娴嬪埌浠?鏈畬鎴?鍒?宸插畬鎴?鐨勮浆鎹㈡椂鎵嶇敓鎴愬€欓€夐」锛? * 鍗充娇浼氳瘽鐘舵€佺洿鎺ヤ粠杩愯鎬佽烦鑷冲氨缁€佷篃鑳芥纭崟鑾枫€? *
 * @param previousThreads - 涓婁竴娆″揩鐓т腑鐨勭嚎绋嬪垪琛? * @param nextThreads - 褰撳墠蹇収涓殑绾跨▼鍒楄〃
 * @returns 鏂颁骇鐢熺殑宸插畬鎴愮嚎绋嬪€欓€夐」鏁扮粍
 */
export function collectCompletedThreadCandidates(
  previousThreads: readonly Thread[],
  nextThreads: readonly Thread[],
): CompletedThreadCandidate[] {
  // 灏嗕笂涓€娆″揩鐓ф寜绾跨▼ ID 寤虹珛绱㈠紩锛屼究浜庡揩閫熸煡鎵?  const previousById = new Map(previousThreads.map((thread) => [thread.id, thread] as const));
  const candidates: CompletedThreadCandidate[] = [];

  for (const thread of nextThreads) {
    const previousThread = previousById.get(thread.id);
    // 鏂板鐨勭嚎绋嬶紙涓婁竴娆″揩鐓т腑涓嶅瓨鍦級璺宠繃锛屼笉浜х敓閫氱煡
    if (!previousThread) {
      continue;
    }

    const completedAt = thread.latestTurn?.completedAt;
    // 褰撳墠杞灏氭湭瀹屾垚锛岃烦杩?    if (!completedAt) {
      continue;
    }
    // 閫氱煡鐘舵€佸皻鏈ǔ瀹氾紙濡傜紪鎺掍粛鍦ㄨ繍琛岋級锛岃烦杩?    if (!isCompletionNotificationSettled(thread)) {
      continue;
    }
    // 涓婁竴娆″揩鐓т腑鏃㈡病鏈変細璇濅俊鎭紝杞涔熸湭瀹屾垚鈥斺€旇鏄庤繖鏄娆″嚭鐜帮紝璺宠繃
    if (!previousThread.session && !previousThread.latestTurn?.completedAt) {
      continue;
    }
    // 涓婁竴娆″揩鐓т腑璇ョ嚎绋嬪凡澶勪簬绋冲畾瀹屾垚鎬佷笖娌℃湁鏈畬鎴愯疆娆★紝璇存槑閫氱煡宸插彂杩囷紝璺宠繃
    if (!hadUnsettledTurn(previousThread) && !previousThread.latestTurn?.completedAt) {
      continue;
    }
    // 鍚屼竴涓疆娆?ID 涓斾笂涓€娆″凡绋冲畾锛岃鏄庢槸閲嶅閫氱煡锛岃烦杩?    if (
      previousThread.latestTurn?.turnId === thread.latestTurn?.turnId &&
      isCompletionNotificationSettled(previousThread)
    ) {
      continue;
    }

    // 閫氳繃浠ヤ笂鎵€鏈夎繃婊ゆ潯浠讹紝纭涓烘柊浜х敓鐨勫畬鎴愪簨浠?    candidates.push({
      threadId: thread.id,
      projectId: thread.projectId,
      title: thread.title,
      completedAt,
      assistantSummary: summarizeLatestAssistantMessage(thread),
    });
  }

  return candidates;
}

/**
 * 瑙ｆ瀽鎸囧畾缁堢鍦ㄥ綋鍓嶇嚎绋嬬姸鎬佷笅鐨勫彲瑙嗗寲鐘舵€併€? * 浼樺厛绾э細attention锛堥渶绔嬪嵆鍏虫敞锛? running锛堣繍琛屼腑锛? review锛堝緟瀹℃煡锛? idle锛堢┖闂诧級銆? *
 * @param threadState - 绾跨▼鐨勭粓绔€氱煡鐘舵€佸揩鐓э紝鍙兘涓?undefined
 * @param terminalId - 鐩爣缁堢 ID
 * @returns 缁堢鐨勫彲瑙嗗寲鐘舵€? */
function resolveTerminalNotificationState(
  threadState: TerminalNotificationThreadState | undefined,
  terminalId: string,
): TerminalVisualState {
  if (!threadState) {
    return "idle";
  }
  // "attention" 浼樺厛绾ф渶楂橈紝琛ㄧず缁堢闇€瑕佺敤鎴风珛鍗冲叧娉?  if (threadState.terminalAttentionStatesById?.[terminalId] === "attention") {
    return "attention";
  }
  // 缁堢姝ｅ湪杩愯鍛戒护
  if ((threadState.runningTerminalIds ?? []).includes(terminalId)) {
    return "running";
  }
  // 缁堢鍛戒护宸插畬鎴愶紝绛夊緟鐢ㄦ埛瀹℃煡杈撳嚭缁撴灉
  if (threadState.terminalAttentionStatesById?.[terminalId] === "review") {
    return "review";
  }
  return "idle";
}

/**
 * 瑙ｆ瀽鎸囧畾缁堢鐨勯€氱煡鏄剧ず鏍囬鍜?CLI 绫诲瀷銆? * 鏍囬浼樺厛绾э細鏍囬瑕嗙洊鍊?> 鐢ㄦ埛鏍囩 > CLI 绫诲瀷榛樿鏍囬 > "Terminal"銆? *
 * @param threadState - 绾跨▼鐨勭粓绔€氱煡鐘舵€佸揩鐓э紝鍙兘涓?undefined
 * @param terminalId - 鐩爣缁堢 ID
 * @returns 鍖呭惈 CLI 绫诲瀷鍜屾樉绀烘爣棰樼殑瀵硅薄
 */
function resolveTerminalNotificationTitle(
  threadState: TerminalNotificationThreadState | undefined,
  terminalId: string,
): { cliKind: TerminalCliKind | null; title: string } {
  const cliKind = threadState?.terminalCliKindsById?.[terminalId] ?? null;
  // 鎸変紭鍏堢骇渚濇灏濊瘯鑾峰彇鏍囬锛氳鐩栨爣棰?鈫?鐢ㄦ埛鏍囩 鈫?CLI 榛樿鏍囬 鈫?鍏滃簳鍊?  const title =
    threadState?.terminalTitleOverridesById?.[terminalId]?.trim() ||
    threadState?.terminalLabelsById?.[terminalId]?.trim() ||
    (cliKind ? defaultTerminalTitleForCliKind(cliKind) : "Terminal");
  return { cliKind, title };
}

/**
 * 瀵规瘮鍓嶅悗涓ゆ缁堢鐘舵€佸揩鐓э紝鏀堕泦鏂颁骇鐢熺殑宸插畬鎴愮粓绔换鍔″€欓€夐」銆? * 浠呭綋缁堢鐘舵€佷粠闈?"review" 鍙樹负 "review" 鏃讹紝鎵嶈涓轰换鍔″畬鎴愬苟鐢熸垚鍊欓€夐」銆? *
 * @param previousByThreadId - 涓婁竴娆″揩鐓т腑鎸夌嚎绋?ID 绱㈠紩鐨勭粓绔姸鎬? * @param nextByThreadId - 褰撳墠蹇収涓寜绾跨▼ ID 绱㈠紩鐨勭粓绔姸鎬? * @returns 鏂颁骇鐢熺殑宸插畬鎴愮粓绔换鍔″€欓€夐」鏁扮粍
 */
export function collectCompletedTerminalCandidates(
  previousByThreadId: Record<string, TerminalNotificationThreadState>,
  nextByThreadId: Record<string, TerminalNotificationThreadState>,
): CompletedTerminalCandidate[] {
  // 鍚堝苟鍓嶅悗涓ゆ蹇収鐨勬墍鏈夌嚎绋?ID锛岀‘淇濅笉閬楁紡
  const threadIds = new Set([...Object.keys(previousByThreadId), ...Object.keys(nextByThreadId)]);
  const candidates: CompletedTerminalCandidate[] = [];

  for (const threadId of threadIds) {
    const previousThreadState = previousByThreadId[threadId];
    const nextThreadState = nextByThreadId[threadId];
    // 鍚堝苟璇ョ嚎绋嬩笅鍓嶅悗涓ゆ蹇収鐨勬墍鏈夌粓绔?ID
    const terminalIds = new Set([
      ...(previousThreadState?.terminalIds ?? []),
      ...(nextThreadState?.terminalIds ?? []),
    ]);

    for (const terminalId of terminalIds) {
      const previousState = resolveTerminalNotificationState(previousThreadState, terminalId);
      const nextState = resolveTerminalNotificationState(nextThreadState, terminalId);
      // 浠呭綋鐘舵€佸彉涓?"review" 涓斾箣鍓嶄笉鏄?"review" 鏃讹紝鎵嶈涓烘柊瀹屾垚鐨勪换鍔?      if (nextState !== "review" || previousState === "review") {
        continue;
      }
      const { cliKind, title } = resolveTerminalNotificationTitle(nextThreadState, terminalId);
      candidates.push({
        threadId: threadId as Thread["id"],
        terminalId,
        cliKind,
        title,
      });
    }
  }

  return candidates;
}

/**
 * 鏍规嵁瀹℃壒璇锋眰绫诲瀷鐢熸垚瀵瑰簲鐨勬憳瑕佹弿杩版枃鏈€? *
 * @param requestKind - 瀹℃壒璇锋眰绫诲瀷
 * @returns 浜虹被鍙鐨勫鎵规憳瑕佹枃鏈? */
function approvalSummary(requestKind: "command" | "file-read" | "file-change"): string {
  switch (requestKind) {
    case "command":
      return "Command approval requested.";
    case "file-read":
      return "File-read approval requested.";
    case "file-change":
      return "File-change approval requested.";
  }
}

/**
 * 瀵规瘮鍓嶅悗涓ゆ绾跨▼蹇収锛屾敹闆嗘柊浜х敓鐨勯渶瑕佺敤鎴峰叧娉ㄧ殑绾跨▼鍊欓€夐」銆? * 鍖呮嫭鏂板嚭鐜扮殑瀹℃壒璇锋眰鍜岀敤鎴疯緭鍏ヨ姹傦紝閫氳繃姣斿璇锋眰 ID 鍘婚噸锛屼粎淇濈暀鏂板椤广€? * 缁撴灉鎸夊垱寤烘椂闂村崌搴忔帓鍒椼€? *
 * @param previousThreads - 涓婁竴娆″揩鐓т腑鐨勭嚎绋嬪垪琛? * @param nextThreads - 褰撳墠蹇収涓殑绾跨▼鍒楄〃
 * @returns 鏂颁骇鐢熺殑闇€鍏虫敞绾跨▼鍊欓€夐」鏁扮粍锛屾寜鍒涘缓鏃堕棿鍗囧簭鎺掑垪
 */
export function collectThreadAttentionCandidates(
  previousThreads: readonly Thread[],
  nextThreads: readonly Thread[],
): ThreadAttentionCandidate[] {
  // 灏嗕笂涓€娆″揩鐓ф寜绾跨▼ ID 寤虹珛绱㈠紩
  const previousById = new Map(previousThreads.map((thread) => [thread.id, thread] as const));
  const candidates: ThreadAttentionCandidate[] = [];

  for (const thread of nextThreads) {
    const previousThread = previousById.get(thread.id);
    // 鏂板绾跨▼璺宠繃锛屼笉浜х敓鍏虫敞閫氱煡
    if (!previousThread) {
      continue;
    }

    // 鏀堕泦涓婁竴娆″揩鐓т腑宸插瓨鍦ㄧ殑瀹℃壒璇锋眰 ID锛岀敤浜庡幓閲?    const previousApprovalIds = new Set(
      derivePendingApprovals(previousThread.activities).map((approval) => approval.requestId),
    );
    // 鏀堕泦涓婁竴娆″揩鐓т腑宸插瓨鍦ㄧ殑鐢ㄦ埛杈撳叆璇锋眰 ID锛岀敤浜庡幓閲?    const previousUserInputIds = new Set(
      derivePendingUserInputs(previousThread.activities).map((request) => request.requestId),
    );

    // 妫€鏌ュ綋鍓嶅揩鐓т腑鐨勫鎵硅姹傦紝绛涢€夊嚭鏂板椤?    for (const approval of derivePendingApprovals(thread.activities)) {
      if (previousApprovalIds.has(approval.requestId)) {
        continue;
      }
      candidates.push({
        kind: "approval",
        threadId: thread.id,
        projectId: thread.projectId,
        title: thread.title,
        requestId: approval.requestId,
        createdAt: approval.createdAt,
        requestKind: approval.requestKind,
      });
    }

    // 妫€鏌ュ綋鍓嶅揩鐓т腑鐨勭敤鎴疯緭鍏ヨ姹傦紝绛涢€夊嚭鏂板椤?    for (const request of derivePendingUserInputs(thread.activities)) {
      if (previousUserInputIds.has(request.requestId)) {
        continue;
      }
      candidates.push({
        kind: "user-input",
        threadId: thread.id,
        projectId: thread.projectId,
        title: thread.title,
        requestId: request.requestId,
        createdAt: request.createdAt,
      });
    }
  }

  // 鎸夊垱寤烘椂闂村崌搴忔帓鍒楋紝纭繚閫氱煡鎸夋椂闂撮『搴忓鐞?  return candidates.toSorted((left, right) => left.createdAt.localeCompare(right.createdAt));
}

/**
 * 瀵规瘮鍓嶅悗涓ゆ缁堢鐘舵€佸揩鐓э紝鏀堕泦鏂颁骇鐢熺殑闇€瑕佺敤鎴峰叧娉ㄧ殑缁堢鍊欓€夐」銆? * 浠呭綋缁堢鐘舵€佷粠闈?"attention" 鍙樹负 "attention" 鏃讹紝鎵嶈涓洪渶瑕佸叧娉ㄥ苟鐢熸垚鍊欓€夐」銆? *
 * @param previousByThreadId - 涓婁竴娆″揩鐓т腑鎸夌嚎绋?ID 绱㈠紩鐨勭粓绔姸鎬? * @param nextByThreadId - 褰撳墠蹇収涓寜绾跨▼ ID 绱㈠紩鐨勭粓绔姸鎬? * @returns 鏂颁骇鐢熺殑闇€鍏虫敞缁堢鍊欓€夐」鏁扮粍
 */
export function collectTerminalAttentionCandidates(
  previousByThreadId: Record<string, TerminalNotificationThreadState>,
  nextByThreadId: Record<string, TerminalNotificationThreadState>,
): TerminalAttentionCandidate[] {
  // 鍚堝苟鍓嶅悗涓ゆ蹇収鐨勬墍鏈夌嚎绋?ID
  const threadIds = new Set([...Object.keys(previousByThreadId), ...Object.keys(nextByThreadId)]);
  const candidates: TerminalAttentionCandidate[] = [];

  for (const threadId of threadIds) {
    const previousThreadState = previousByThreadId[threadId];
    const nextThreadState = nextByThreadId[threadId];
    // 鍚堝苟璇ョ嚎绋嬩笅鍓嶅悗涓ゆ蹇収鐨勬墍鏈夌粓绔?ID
    const terminalIds = new Set([
      ...(previousThreadState?.terminalIds ?? []),
      ...(nextThreadState?.terminalIds ?? []),
    ]);

    for (const terminalId of terminalIds) {
      const previousState = resolveTerminalNotificationState(previousThreadState, terminalId);
      const nextState = resolveTerminalNotificationState(nextThreadState, terminalId);
      // 浠呭綋鐘舵€佸彉涓?"attention" 涓斾箣鍓嶄笉鏄?"attention" 鏃讹紝鎵嶈涓烘柊鐨勫叧娉ㄤ簨浠?      if (nextState !== "attention" || previousState === "attention") {
        continue;
      }
      const { cliKind, title } = resolveTerminalNotificationTitle(nextThreadState, terminalId);
      candidates.push({
        threadId: threadId as Thread["id"],
        terminalId,
        cliKind,
        title,
      });
    }
  }

  return candidates;
}

/**
 * 鏋勫缓绾跨▼浠诲姟瀹屾垚閫氱煡鐨勬樉绀烘枃妗堛€? * 纭繚娴忚鍣?Toast 鍜屾搷浣滅郴缁熼€氱煡浣跨敤涓€鑷寸殑鏂囨鍐呭銆? *
 * @param candidate - 宸插畬鎴愮殑绾跨▼鍊欓€夐」
 * @returns 鍖呭惈閫氱煡鏍囬鍜屾鏂囩殑瀵硅薄
 */
export function buildTaskCompletionCopy(candidate: CompletedThreadCandidate): {
  title: string;
  body: string;
} {
  const normalizedTitle = candidate.title.trim();
  // 鏍囬涓虹┖鏃朵娇鐢ㄩ粯璁ゆ枃妗?  const threadLabel = normalizedTitle.length > 0 ? normalizedTitle : "Untitled thread";

  return {
    title: threadLabel,
    // 浼樺厛浣跨敤鍔╂墜娑堟伅鎽樿锛屾棤鎽樿鏃朵娇鐢ㄩ粯璁ゅ畬鎴愭枃妗?    body: candidate.assistantSummary || "Finished working.",
  };
}

/**
 * 鏋勫缓绾跨▼闇€瑕佺敤鎴峰叧娉ㄦ椂鐨勯€氱煡鏄剧ず鏂囨銆? * 鍖呮嫭瀹℃壒璇锋眰鍜岀敤鎴疯緭鍏ヨ姹備袱绉嶅満鏅€? *
 * @param candidate - 闇€鍏虫敞鐨勭嚎绋嬪€欓€夐」
 * @returns 鍖呭惈閫氱煡鏍囬鍜屾鏂囩殑瀵硅薄
 */
export function buildThreadAttentionCopy(candidate: ThreadAttentionCandidate): {
  title: string;
  body: string;
} {
  const normalizedTitle = candidate.title.trim();
  // 鏍囬涓虹┖鏃朵娇鐢ㄩ粯璁ゆ枃妗?  const threadLabel = normalizedTitle.length > 0 ? normalizedTitle : "Untitled thread";
  // 浼樺厛浣跨敤鍊欓€夐」鑷甫鐨勬憳瑕侊紝鍚﹀垯鏍规嵁绫诲瀷鐢熸垚榛樿鎽樿
  const summary =
    candidate.summary ??
    (candidate.kind === "approval"
      ? approvalSummary(candidate.requestKind ?? "command")
      : "User input requested.");

  return {
    title: "Input needed",
    body: `${threadLabel}: ${summary}`,
  };
}

/**
 * 鏋勫缓缁堢浠诲姟瀹屾垚閫氱煡鐨勬樉绀烘枃妗堛€? *
 * @param candidate - 宸插畬鎴愮殑缁堢浠诲姟鍊欓€夐」
 * @returns 鍖呭惈閫氱煡鏍囬鍜屾鏂囩殑瀵硅薄
 */
export function buildTerminalCompletionCopy(candidate: CompletedTerminalCandidate): {
  title: string;
  body: string;
} {
  // 缁堢鏍囬涓虹┖鏃朵娇鐢ㄩ粯璁ゅ€?  const terminalLabel = candidate.title.trim() || "Terminal";
  return {
    title: "Terminal task completed",
    body: `${terminalLabel} finished working.`,
  };
}

/**
 * 鏋勫缓缁堢闇€瑕佺敤鎴峰叧娉ㄦ椂鐨勯€氱煡鏄剧ず鏂囨銆? *
 * @param candidate - 闇€鍏虫敞鐨勭粓绔€欓€夐」
 * @returns 鍖呭惈閫氱煡鏍囬鍜屾鏂囩殑瀵硅薄
 */
export function buildTerminalAttentionCopy(candidate: TerminalAttentionCandidate): {
  title: string;
  body: string;
} {
  // 缁堢鏍囬涓虹┖鏃朵娇鐢ㄩ粯璁ゅ€?  const terminalLabel = candidate.title.trim() || "Terminal";
  return {
    title: "Terminal input needed",
    body: `${terminalLabel} needs your attention.`,
  };
}

/**
 * 鍒ゆ柇鏄惁搴旀姂鍒跺綋鍓嶅彲瑙佺嚎绋嬬殑閫氱煡銆? * 褰撳簲鐢ㄧ獥鍙ｅ浜庡墠鍙颁笖鐩爣绾跨▼姝ｅ湪鍙鍖哄煙鏃讹紝鎶戝埗閫氱煡浠ラ伩鍏嶆墦鎵扮敤鎴枫€? *
 * @param input.threadId - 寰呭垽鏂殑绾跨▼ ID
 * @param input.visibleThreadIds - 褰撳墠鍙鐨勭嚎绋?ID 闆嗗悎
 * @param input.windowForeground - 搴旂敤绐楀彛鏄惁澶勪簬鍓嶅彴
 * @returns 鑻ュ簲鎶戝埗閫氱煡鍒欒繑鍥?true
 */
export function shouldSuppressVisibleThreadNotification(input: {
  threadId: Thread["id"];
  visibleThreadIds: ReadonlySet<Thread["id"]>;
  windowForeground: boolean;
}): boolean {
  return input.windowForeground && input.visibleThreadIds.has(input.threadId);
}

/**
 * 鏀堕泦"闇€瑕佺敤鎴疯緭鍏?鐨勭嚎绋嬪€欓€夐」锛坈ollectThreadAttentionCandidates 鐨勫埆鍚嶏級銆? * 浣跨敤璇箟鍖栧懡鍚嶄互鎻愰珮璋冪敤鏂圭殑浠ｇ爜鍙鎬с€? */
export const collectInputNeededThreadCandidates = collectThreadAttentionCandidates;

/**
 * 鏋勫缓"闇€瑕佺敤鎴疯緭鍏?閫氱煡鏂囨锛坆uildThreadAttentionCopy 鐨勫埆鍚嶏級銆? * 浣跨敤璇箟鍖栧懡鍚嶄互鎻愰珮璋冪敤鏂圭殑浠ｇ爜鍙鎬с€? */
export const buildInputNeededCopy = buildThreadAttentionCopy;

/**
 * 鍒ゆ柇鍊欓€夋椂闂存埑鏄惁灞炰簬鏈閫氱煡杩愯鏃剁殑"鏂伴矞"浜嬩欢銆? * 姘村悎锛坔ydration锛夎繃绋嬪彲鑳戒細閲嶆斁鏃х嚎绋嬫暟鎹紝鍙湁鍦ㄦ湰閫氱煡杩愯鏃跺惎鍔ㄤ箣鍚庝骇鐢熺殑鏃堕棿鎴? * 鎵嶅簲琚涓哄疄鏃朵簨浠讹紝閬垮厤瀵瑰巻鍙叉暟鎹噸澶嶈Е鍙戦€氱煡銆? *
 * @param candidateTimestamp - 鍊欓€変簨浠剁殑鏃堕棿鎴筹紙ISO 8601 鏍煎紡瀛楃涓诧級
 * @param runtimeStartedAtMs - 閫氱煡杩愯鏃剁殑鍚姩鏃堕棿锛堟绉掔骇鏃堕棿鎴筹級
 * @returns 鑻ユ椂闂存埑鏅氫簬杩愯鏃跺惎鍔ㄦ椂闂村垯杩斿洖 true锛岃〃绀烘槸鏂伴矞浜嬩欢锛? *          鑻ヤ换涓€鍙傛暟鏃犳硶瑙ｆ瀽涓烘湁鏁堟暟瀛椾篃杩斿洖 true锛堜繚瀹堢瓥鐣ワ級
 */
export function isNotificationRuntimeFreshTimestamp(
  candidateTimestamp: string,
  runtimeStartedAtMs: number,
): boolean {
  const candidateMs = Date.parse(candidateTimestamp);
  // 鑻ユ椂闂存埑鏃犳硶瑙ｆ瀽锛岄噰鐢ㄤ繚瀹堢瓥鐣ヨ涓烘柊椴滀簨浠?  if (!Number.isFinite(candidateMs) || !Number.isFinite(runtimeStartedAtMs)) {
    return true;
  }
  return candidateMs > runtimeStartedAtMs;
}
