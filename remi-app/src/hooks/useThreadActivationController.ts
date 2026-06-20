/**
 * @file useThreadActivationController.ts
 * @description 缁捐法鈻煎┑鈧ú缁樺付閸掕泛娅?Hook - 闂嗗棔鑵戠粻锛勬倞娓氀嗙珶閺嶅繒鍤庣粙瀣负濞茶崵娈戦崜顖欑稊閻劑鎽? * @module hooks/useThreadActivationController
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
 * 缁捐法鈻煎┑鈧ú缁樺付閸掕泛娅掓潏鎾冲弳閸欏倹鏆熺猾璇茬€? */
export type ThreadActivationControllerInput = {
  /** 瑜版挸澧犲ú璇插З閻ㄥ嫬鍨庣仦蹇氼潒閸?*/
  activeSplitView: SplitView | null;
  /** 濞撳懘娅庤ぐ鎾冲闁瀚?*/
  clearSelection: () => void;
  /** 鐠侯垳鏁辩€佃壈鍩呴崙鑺ユ殶 */
  navigate: Navigate;
  /** 閹垫挸绱戦懕濠傘亯缁捐法鈻兼い鐢告桨 */
  openChatThreadPage: (threadId: ThreadId) => void;
  /** 閹垫挸绱戞笟褑绔熼懕濠傘亯閸掑棗鐫?*/
  openSidechatSplit: (input: {
    sidechatThreadId: ThreadId;
    sourceThreadId: ThreadId;
    ownerProjectId: ProjectId;
  }) => SplitViewId;
  /** 閹垫挸绱戠紒鍫㈩伂缁捐法鈻兼い鐢告桨 */
  openTerminalThreadPage: (threadId: ThreadId) => void;
  /** 妫板嫮鍎圭痪璺ㄢ柤鐠囷附鍎忛敍鍫熷絹閸撳秴濮炴潪鑺ユ殶閹诡噯绱?*/
  prewarmThreadDetailForIntent: (threadId: ThreadId) => void;
  /** 鐠侀缍囨稉濠佺濞嗭紕娈戠捄顖滄暠娣団剝浼?*/
  rememberLastThreadRouteNow: (nextLastThreadRoute: LastThreadRoute) => void;
  /** 鐠侯垳鏁辨稉顓犳畱閸掑棗鐫嗙憴鍡楁禈 ID */
  routeSplitViewId: string | null | undefined;
  /** 鐠侯垳鏁辨稉顓犳畱缁捐法鈻?ID */
  routeThreadId: ThreadId | null | undefined;
  /** 瑜版挸澧犻柅澶夎厬閻ㄥ嫮鍤庣粙瀣殶闁?*/
  selectedThreadCount: number;
  /** 娑旀劘顫囩拋鍓х枂濞茶濮╃痪璺ㄢ柤 ID */
  setOptimisticActiveThreadId: (threadId: ThreadId) => void;
  /** 鐠佸墽鐤嗛柅澶嬪闁挎氨鍋?*/
  setSelectionAnchor: (threadId: ThreadId) => void;
  /** 鐠佸墽鐤嗛崚鍡楃潌閼辨氨鍔嶉棃銏℃緲 */
  setSplitFocusedPane: (splitViewId: SplitViewId, paneId: PaneId) => void;
  /** 娓氀嗙珶閺嶅繒鍤庣粙瀣喅鐟曚焦妲х亸?*/
  sidebarThreadSummaryById: Readonly<Partial<Record<ThreadId, SidebarThreadActivationSummary>>>;
  /** 閸掑棗鐫嗙憴鍡楁禈閺勭姴鐨?*/
  splitViewsById: Record<SplitViewId, SplitView | undefined>;
  /** 缂佸牏顏悩鑸碘偓浣规Ё鐏?*/
  terminalStateByThreadId: ThreadTerminalStateById;
};

/**
 * 娴犲簼鏅舵潏瑙勭埉閹板繐娴樺┑鈧ú鑽ゅ殠缁? *
 * @description
 * 閹笛嗩攽鐎瑰本鏆ｉ惃鍕櫠鏉堣鐖痪璺ㄢ柤濠碘偓濞茶澹囨担婊呮暏闁句勘鈧倸顦╅悶鍡涒偓鏄忕帆閿? * 1. 绾喖鐣炬＃鏍偓澶婂瀻鐏炲繗顫嬮崶鎾呯礄濞茶濮╅崚鍡楃潌娴兼ê鍘涢敍? * 2. 鐟欙絾鐎藉┑鈧ú鑽よ閸ㄥ绱欒箛鐣屾殣/閸楁洟銆?閸掑棗鐫嗛敍? * 3. 婢跺嫮鎮婃笟褑绔熼懕濠傘亯閻ㄥ嫮澹掑▓濠傚瀻鐏炲繘鈧槒绶? * 4. 閹笛嗩攽鐎佃壈鍩呴崪宀€濮搁幀浣规纯閺? *
 * @param input - 閹貉冨煑閸ｃ劏绶崗銉ュ棘閺? * @param threadId - 鐟曚焦绺哄ú鑽ゆ畱缁捐法鈻?ID
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

  // 濞茶濮╅崚鍡楃潌娴兼ê鍘涢敍娑樻儊閸掓瑦鐦℃稉顏呭瘮娑斿懎瀵查惃鍕瀻鐏炲繐娼￠柈钘夊讲娴犮儳鈥樼€规碍鈧冩勾閹垹顦?  const preferredSplit = resolvePreferredSplitForCommand({
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

  // 濡偓閺屻儲妲搁崥锔胯礋娓氀嗙珶閼卞﹤銇夐崚鍡楃潌濠碘偓濞?  const sidechatSplitActivation = resolveSidechatSplitActivation(input, {
    threadId,
    targetThread,
  });
  if (sidechatSplitActivation && activation.kind !== "split") {
    activateSidechatSplit(input, sidechatSplitActivation);
    return;
  }

  // 韫囩晫鏆愮拠銉︾负濞叉槒顕Ч?  if (activation.kind === "ignore") {
    return;
  }

  // 閸楁洟銆夊┑鈧ú缁樐佸?  if (activation.kind === "single") {
    activateThreadSingle(input, activation.threadId);
    return;
  }

  // 婵″倹鐏夊鑼病閸︺劎娲伴弽鍥︾秴缂冾噯绱濋弮鐘绘付鐎佃壈鍩?  if (routeThreadId === activation.threadId && routeSplitViewId === activation.splitViewId) {
    return;
  }

  // 閹笛嗩攽鐎瑰本鏆ｉ惃鍕负濞茬粯绁︾粙?  prewarmThreadDetailForIntent(activation.threadId);
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
 * 鐟欙絾鐎芥笟褑绔熼懕濠傘亯閸掑棗鐫嗗┑鈧ú缁樻蒋娴? *
 * @description
 * 瑜版挾娲伴弽鍥╁殠缁嬪妲告笟褑绔熼懕濠傘亯娑撴梹婀佸┃鎰殠缁嬪绱濇稉鏂跨秼閸撳秵鐥呴張澶婂瀻鐏炲繗鐭鹃悽杈ㄦ閿涘矁绻戦崶鐐寸负濞茶淇婇幁? */
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
 * 濠碘偓濞茶鏅舵潏纭呬喊婢垛晛鍨庣仦? *
 * @description
 * 瑜版挻鐥呴張澶婂瀻鐏炲繗鐭鹃悽杈ㄧ负濞茬粯妞傞敍灞兼櫠鏉堢浜版径鈺勵攽闁插秵鏌婇幍鎾崇磻娑?濠ф劗鍤庣粙瀣躬瀹?+ 娓氀嗙珶閼卞﹤銇夐崷銊ュ礁"閻ㄥ嫬绔风仦鈧? */
function activateSidechatSplit(
  input: ThreadActivationControllerInput,
  activation: {
    threadId: ThreadId;
    sourceThreadId: ThreadId;
    ownerProjectId: ProjectId;
  },
): void {
  // 妫板嫮鍎规稉銈勯嚋缁捐法鈻奸惃鍕嚊閹?  input.prewarmThreadDetailForIntent(activation.sourceThreadId);
  input.prewarmThreadDetailForIntent(activation.threadId);
  input.setOptimisticActiveThreadId(activation.threadId);
  if (input.selectedThreadCount > 0) {
    input.clearSelection();
  }
  input.setSelectionAnchor(activation.threadId);

  // 閹垫挸绱戞笟褑绔熼懕濠傘亯閸掑棗鐫?  const splitViewId = input.openSidechatSplit({
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
 * 娴犮儱宕熸い鍨佸蹇旂负濞茶崵鍤庣粙? *
 * @description
 * 鐏忓棛娲伴弽鍥︾稊娑撳搫宕熸稉顏囦喊婢垛晜澧﹀鈧敍灞芥倱閺冩湹绻氶悾娆掍喊婢?vs 缂佸牏顏惃鍕弳閸欙絿鍋ｉ柅澶嬪
 */
function activateThreadSingle(input: ThreadActivationControllerInput, threadId: ThreadId): void {
  if (!input.sidebarThreadSummaryById[threadId]) return;

  input.prewarmThreadDetailForIntent(threadId);
  input.setOptimisticActiveThreadId(threadId);
  if (input.selectedThreadCount > 0) {
    input.clearSelection();
  }
  input.setSelectionAnchor(threadId);

  // 閺嶈宓侀崗銉ュ經閻愬湱琚崹瀣ⅵ瀵偓鐎电懓绨叉い鐢告桨
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
 * 缁捐法鈻煎┑鈧ú缁樺付閸掕泛娅?Hook
 *
 * @description
 * 闂嗗棔鑵戠粻锛勬倞娓氀嗙珶閺嶅繒鍤庣粙瀣负濞茶崵娈戦崜顖欑稊閻劑鎽奸妴? * 鐏忓棛鍑藉┑鈧ú鑽ょ摜閻ｃ儰绗?React 閸擃垯缍旈悽銊х拨鐎规艾婀稉鈧挧鏋偓? *
 * @param input - 閹貉冨煑閸ｃ劏绶崗銉ュ棘閺? * @returns 閸栧懎鎯堝┑鈧ú缁樻煙濞夋洜娈戠€电钖? *
 * @example
 * ```tsx
 * const { activateThreadFromSidebarIntent } = useThreadActivationController({
 *   activeSplitView,
 *   navigate,
 *   // ... 閸忔湹绮崣鍌涙殶
 * });
 *
 * // 濠碘偓濞茬粯鐓囨稉顏嗗殠缁? * activateThreadFromSidebarIntent(threadId);
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
