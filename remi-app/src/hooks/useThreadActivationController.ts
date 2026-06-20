/**
 * @file useThreadActivationController.ts
 * @description 绾跨▼婵€娲绘帶鍒跺櫒 Hook - 闆嗕腑绠＄悊渚ц竟鏍忕嚎绋嬫縺娲荤殑鍓綔鐢ㄩ摼
 * @module hooks/useThreadActivationController
 */

import { useCallback } from "react";
import type { useNavigate } from "@tanstack/react-router";
import type { ProjectId, ThreadId } from "~/contracts";
import type { LastThreadRoute } from "../chatRouteRestore";
import { type PaneId, type SplitView, type SplitViewId } from "../splitViewStore";
import { selectThreadTerminalState } from "../terminalStateStore";
import type { SidebarThreadSummary } from "../types";
import {
  resolvePreferredSplitForCommand,
  resolveThreadCommandActivation,
} from "../threadActivation.logic";

type Navigate = ReturnType<typeof useNavigate>;
type ThreadTerminalStateById = Parameters<typeof selectThreadTerminalState>[0];
type SidebarThreadActivationSummary = Pick<
  SidebarThreadSummary,
  "id" | "projectId" | "sidechatSourceThreadId"
>;

/**
 * 绾跨▼婵€娲绘帶鍒跺櫒杈撳叆鍙傛暟绫诲瀷
 */
export type ThreadActivationControllerInput = {
  /** 褰撳墠娲诲姩鐨勫垎灞忚鍥?*/
  activeSplitView: SplitView | null;
  /** 娓呴櫎褰撳墠閫夋嫨 */
  clearSelection: () => void;
  /** 璺敱瀵艰埅鍑芥暟 */
  navigate: Navigate;
  /** 鎵撳紑鑱婂ぉ绾跨▼椤甸潰 */
  openChatThreadPage: (threadId: ThreadId) => void;
  /** 鎵撳紑渚ц竟鑱婂ぉ鍒嗗睆 */
  openSidechatSplit: (input: {
    sidechatThreadId: ThreadId;
    sourceThreadId: ThreadId;
    ownerProjectId: ProjectId;
  }) => SplitViewId;
  /** 鎵撳紑缁堢绾跨▼椤甸潰 */
  openTerminalThreadPage: (threadId: ThreadId) => void;
  /** 棰勭儹绾跨▼璇︽儏锛堟彁鍓嶅姞杞芥暟鎹級 */
  prewarmThreadDetailForIntent: (threadId: ThreadId) => void;
  /** 璁颁綇涓婁竴娆＄殑璺敱淇℃伅 */
  rememberLastThreadRouteNow: (nextLastThreadRoute: LastThreadRoute) => void;
  /** 璺敱涓殑鍒嗗睆瑙嗗浘 ID */
  routeSplitViewId: string | null | undefined;
  /** 璺敱涓殑绾跨▼ ID */
  routeThreadId: ThreadId | null | undefined;
  /** 褰撳墠閫変腑鐨勭嚎绋嬫暟閲?*/
  selectedThreadCount: number;
  /** 涔愯璁剧疆娲诲姩绾跨▼ ID */
  setOptimisticActiveThreadId: (threadId: ThreadId) => void;
  /** 璁剧疆閫夋嫨閿氱偣 */
  setSelectionAnchor: (threadId: ThreadId) => void;
  /** 璁剧疆鍒嗗睆鑱氱劍闈㈡澘 */
  setSplitFocusedPane: (splitViewId: SplitViewId, paneId: PaneId) => void;
  /** 渚ц竟鏍忕嚎绋嬫憳瑕佹槧灏?*/
  sidebarThreadSummaryById: Readonly<Partial<Record<ThreadId, SidebarThreadActivationSummary>>>;
  /** 鍒嗗睆瑙嗗浘鏄犲皠 */
  splitViewsById: Record<SplitViewId, SplitView | undefined>;
  /** 缁堢鐘舵€佹槧灏?*/
  terminalStateByThreadId: ThreadTerminalStateById;
};

/**
 * 浠庝晶杈规爮鎰忓浘婵€娲荤嚎绋? *
 * @description
 * 鎵ц瀹屾暣鐨勪晶杈规爮绾跨▼婵€娲诲壇浣滅敤閾俱€傚鐞嗛€昏緫锛? * 1. 纭畾棣栭€夊垎灞忚鍥撅紙娲诲姩鍒嗗睆浼樺厛锛? * 2. 瑙ｆ瀽婵€娲荤被鍨嬶紙蹇界暐/鍗曢〉/鍒嗗睆锛? * 3. 澶勭悊渚ц竟鑱婂ぉ鐨勭壒娈婂垎灞忛€昏緫
 * 4. 鎵ц瀵艰埅鍜岀姸鎬佹洿鏂? *
 * @param input - 鎺у埗鍣ㄨ緭鍏ュ弬鏁? * @param threadId - 瑕佹縺娲荤殑绾跨▼ ID
 */
export function activateThreadFromSidebarIntent(
  input: ThreadActivationControllerInput,
  threadId: ThreadId,
): void {
  const {
    activeSplitView,
    clearSelection,
    navigate,
    openChatThreadPage,
    openTerminalThreadPage,
    prewarmThreadDetailForIntent,
    rememberLastThreadRouteNow,
    routeSplitViewId,
    routeThreadId,
    selectedThreadCount,
    setOptimisticActiveThreadId,
    setSelectionAnchor,
    setSplitFocusedPane,
    sidebarThreadSummaryById,
    splitViewsById,
    terminalStateByThreadId,
  } = input;

  // 娲诲姩鍒嗗睆浼樺厛锛涘惁鍒欐瘡涓寔涔呭寲鐨勫垎灞忓潡閮藉彲浠ョ‘瀹氭€у湴鎭㈠
  const preferredSplit = resolvePreferredSplitForCommand({
    activeSplitView,
    splitViewsById,
    threadId,
  });
  const targetThread = sidebarThreadSummaryById[threadId];
  const activation = resolveThreadCommandActivation({
    threadId,
    threadExists: targetThread !== undefined,
    activeSidebarThreadId: routeThreadId,
    preferredSplitViewId: preferredSplit?.splitViewId ?? null,
    splitPaneId: preferredSplit?.paneId ?? null,
  });

  // 妫€鏌ユ槸鍚︿负渚ц竟鑱婂ぉ鍒嗗睆婵€娲?  const sidechatSplitActivation = resolveSidechatSplitActivation(input, {
    threadId,
    targetThread,
  });
  if (sidechatSplitActivation && activation.kind !== "split") {
    activateSidechatSplit(input, sidechatSplitActivation);
    return;
  }

  // 蹇界暐璇ユ縺娲昏姹?  if (activation.kind === "ignore") {
    return;
  }

  // 鍗曢〉婵€娲绘ā寮?  if (activation.kind === "single") {
    activateThreadSingle(input, activation.threadId);
    return;
  }

  // 濡傛灉宸茬粡鍦ㄧ洰鏍囦綅缃紝鏃犻渶瀵艰埅
  if (routeThreadId === activation.threadId && routeSplitViewId === activation.splitViewId) {
    return;
  }

  // 鎵ц瀹屾暣鐨勬縺娲绘祦绋?  prewarmThreadDetailForIntent(activation.threadId);
  setOptimisticActiveThreadId(activation.threadId);
  if (selectedThreadCount > 0) {
    clearSelection();
  }
  setSelectionAnchor(activation.threadId);
  setSplitFocusedPane(activation.splitViewId, activation.paneId);
  rememberLastThreadRouteNow({
    threadId: activation.threadId,
    splitViewId: activation.splitViewId,
  });
  void navigate({
    to: "/$threadId",
    params: { threadId: activation.threadId },
    search: (previous) => ({
      ...previous,
      splitViewId: activation.splitViewId,
    }),
  });
}

/**
 * 瑙ｆ瀽渚ц竟鑱婂ぉ鍒嗗睆婵€娲绘潯浠? *
 * @description
 * 褰撶洰鏍囩嚎绋嬫槸渚ц竟鑱婂ぉ涓旀湁婧愮嚎绋嬶紝涓斿綋鍓嶆病鏈夊垎灞忚矾鐢辨椂锛岃繑鍥炴縺娲讳俊鎭? */
function resolveSidechatSplitActivation(
  input: ThreadActivationControllerInput,
  options: {
    threadId: ThreadId;
    targetThread: SidebarThreadActivationSummary | undefined;
  },
): { threadId: ThreadId; sourceThreadId: ThreadId; ownerProjectId: ProjectId } | null {
  if (!options.targetThread?.sidechatSourceThreadId) {
    return null;
  }
  const sourceThread = input.sidebarThreadSummaryById[options.targetThread.sidechatSourceThreadId];
  if (!sourceThread || input.routeSplitViewId) {
    return null;
  }
  return {
    threadId: options.threadId,
    sourceThreadId: options.targetThread.sidechatSourceThreadId,
    ownerProjectId: sourceThread.projectId,
  };
}

/**
 * 婵€娲讳晶杈硅亰澶╁垎灞? *
 * @description
 * 褰撴病鏈夊垎灞忚矾鐢辨縺娲绘椂锛屼晶杈硅亰澶╄閲嶆柊鎵撳紑涓?婧愮嚎绋嬪湪宸?+ 渚ц竟鑱婂ぉ鍦ㄥ彸"鐨勫竷灞€
 */
function activateSidechatSplit(
  input: ThreadActivationControllerInput,
  activation: {
    threadId: ThreadId;
    sourceThreadId: ThreadId;
    ownerProjectId: ProjectId;
  },
): void {
  // 棰勭儹涓や釜绾跨▼鐨勮鎯?  input.prewarmThreadDetailForIntent(activation.sourceThreadId);
  input.prewarmThreadDetailForIntent(activation.threadId);
  input.setOptimisticActiveThreadId(activation.threadId);
  if (input.selectedThreadCount > 0) {
    input.clearSelection();
  }
  input.setSelectionAnchor(activation.threadId);

  // 鎵撳紑渚ц竟鑱婂ぉ鍒嗗睆
  const splitViewId = input.openSidechatSplit({
    sourceThreadId: activation.sourceThreadId,
    ownerProjectId: activation.ownerProjectId,
    sidechatThreadId: activation.threadId,
  });
  input.rememberLastThreadRouteNow({
    threadId: activation.threadId,
    splitViewId,
  });
  void input.navigate({
    to: "/$threadId",
    params: { threadId: activation.threadId },
    search: (previous) => ({
      ...previous,
      splitViewId,
    }),
  });
}

/**
 * 浠ュ崟椤垫ā寮忔縺娲荤嚎绋? *
 * @description
 * 灏嗙洰鏍囦綔涓哄崟涓亰澶╂墦寮€锛屽悓鏃朵繚鐣欒亰澶?vs 缁堢鐨勫叆鍙ｇ偣閫夋嫨
 */
function activateThreadSingle(input: ThreadActivationControllerInput, threadId: ThreadId): void {
  if (!input.sidebarThreadSummaryById[threadId]) return;

  input.prewarmThreadDetailForIntent(threadId);
  input.setOptimisticActiveThreadId(threadId);
  if (input.selectedThreadCount > 0) {
    input.clearSelection();
  }
  input.setSelectionAnchor(threadId);

  // 鏍规嵁鍏ュ彛鐐圭被鍨嬫墦寮€瀵瑰簲椤甸潰
  const threadEntryPoint = selectThreadTerminalState(
    input.terminalStateByThreadId,
    threadId,
  ).entryPoint;
  if (threadEntryPoint === "terminal") {
    input.openTerminalThreadPage(threadId);
  } else {
    input.openChatThreadPage(threadId);
  }

  void input.navigate({
    to: "/$threadId",
    params: { threadId },
    search: (previous) => ({
      ...previous,
      splitViewId: undefined,
    }),
  });
}

/**
 * 绾跨▼婵€娲绘帶鍒跺櫒 Hook
 *
 * @description
 * 闆嗕腑绠＄悊渚ц竟鏍忕嚎绋嬫縺娲荤殑鍓綔鐢ㄩ摼銆? * 灏嗙函婵€娲荤瓥鐣ヤ笌 React 鍓綔鐢ㄧ粦瀹氬湪涓€璧枫€? *
 * @param input - 鎺у埗鍣ㄨ緭鍏ュ弬鏁? * @returns 鍖呭惈婵€娲绘柟娉曠殑瀵硅薄
 *
 * @example
 * ```tsx
 * const { activateThreadFromSidebarIntent } = useThreadActivationController({
 *   activeSplitView,
 *   navigate,
 *   // ... 鍏朵粬鍙傛暟
 * });
 *
 * // 婵€娲绘煇涓嚎绋? * activateThreadFromSidebarIntent(threadId);
 * ```
 */
export function useThreadActivationController(input: ThreadActivationControllerInput): {
  activateThreadFromSidebarIntent: (threadId: ThreadId) => void;
} {
  const {
    activeSplitView,
    clearSelection,
    navigate,
    openChatThreadPage,
    openSidechatSplit,
    openTerminalThreadPage,
    prewarmThreadDetailForIntent,
    rememberLastThreadRouteNow,
    routeSplitViewId,
    routeThreadId,
    selectedThreadCount,
    setOptimisticActiveThreadId,
    setSelectionAnchor,
    setSplitFocusedPane,
    sidebarThreadSummaryById,
    splitViewsById,
    terminalStateByThreadId,
  } = input;

  const activateThread = useCallback(
    (threadId: ThreadId) => {
      activateThreadFromSidebarIntent(
        {
          activeSplitView,
          clearSelection,
          navigate,
          openChatThreadPage,
          openSidechatSplit,
          openTerminalThreadPage,
          prewarmThreadDetailForIntent,
          rememberLastThreadRouteNow,
          routeSplitViewId,
          routeThreadId,
          selectedThreadCount,
          setOptimisticActiveThreadId,
          setSelectionAnchor,
          setSplitFocusedPane,
          sidebarThreadSummaryById,
          splitViewsById,
          terminalStateByThreadId,
        },
        threadId,
      );
    },
    [
      activeSplitView,
      clearSelection,
      navigate,
      openChatThreadPage,
      openSidechatSplit,
      openTerminalThreadPage,
      prewarmThreadDetailForIntent,
      rememberLastThreadRouteNow,
      routeSplitViewId,
      routeThreadId,
      selectedThreadCount,
      setOptimisticActiveThreadId,
      setSelectionAnchor,
      setSplitFocusedPane,
      sidebarThreadSummaryById,
      splitViewsById,
      terminalStateByThreadId,
    ],
  );

  return { activateThreadFromSidebarIntent: activateThread };
}
