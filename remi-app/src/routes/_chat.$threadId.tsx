/**
 * @file 閼卞﹤銇夌痪璺ㄢ柤鐠侯垳鏁辩€圭懓娅掑Ο鈥虫健
 * @description 鐏忓棙妞跨捄鍐畱缁捐法鈻肩捄顖滄暠鐟欙絾鐎芥稉鍝勫礋閼卞﹤銇夐悾宀勬桨閹存牗瀵旀稊鍛閻ㄥ嫬鍨庨崜鑼额潒閸? * @layer 鐠侯垳鏁辩€圭懓娅掔??? * @depends ChatView, splitViewStore, splitView.logic, ChatPaneDropOverlay, 娴犮儱寮烽棃銏℃緲娴ｆ粎鏁ら崺鐔烘畱濞村繗顫嶉崳?瀹割喖绱撶€佃鐦棃銏℃緲
 */

import {
  type ProviderKind,
  type ProjectId,
  ThreadId,
  type ThreadId as ThreadIdType,
  type TurnId,
} from "~/contracts";
import { tauriBridge } from "../lib/tauri-bridge";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Suspense,
  lazy,
  startTransition,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Schema } from "effect";

import ChatView from "../components/ChatView";
import BrowserPanel from "../components/BrowserPanel";
import { ProviderIcon } from "../components/ProviderIcon";
import { ChatPaneDropOverlay } from "../components/chat-drop-overlay/ChatPaneDropOverlay";
import { DiffWorkerPoolProvider } from "../components/DiffWorkerPoolProvider";
import {
  DiffPanelHeaderSkeleton,
  DiffPanelLoadingState,
  DiffPanelShell,
  type DiffPanelMode,
} from "../components/DiffPanelShell";
import { useComposerDraftStore } from "../composerDraftStore";
import {
  type ChatRightPanel,
  type DiffRouteSearch,
  parseDiffRouteSearch,
  stripDiffSearchParams,
} from "../diffRouteSearch";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { useHandleNewChat } from "../hooks/useHandleNewChat";
import { resolveActiveSplitView, isSplitRoute } from "../splitViewRoute";
import { canSubdividePane, collectLeaves, findLeafPaneById } from "../splitView.logic";
import {
  resolveSplitViewFocusedThreadId,
  resolveSplitViewPaneIdForThread,
  resolveSplitViewThreadIds,
  selectSplitView,
  type LeafPane,
  type Pane,
  type PaneId,
  type SplitDirection,
  type SplitDropSide,
  type SplitView,
  type SplitViewId,
  type SplitViewPanePanelState,
  useSplitViewStore,
} from "../splitViewStore";
import { selectSingleChatPanelState, useSingleChatPanelStore } from "../singleChatPanelStore";
import { useStore } from "../store";
import {
  createAllThreadsSelector,
  createThreadExistsSelector,
  createThreadProjectIdSelector,
} from "../storeSelectors";
import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../components/ui/dialog";
import { Sheet, SheetPopup } from "../components/ui/sheet";
import {
  resolveRoutePanelBootstrap,
  resolveSplitPaneCloseDecision,
  resolveSplitPaneMaximizeDecision,
  resolveThreadPickerTitle,
  resolveToggledChatPanelPatch,
} from "./-chatThreadRoute.logic";
import { getLocalStorageItem, setLocalStorageItem } from "~/hooks/useLocalStorage";
import { cn } from "~/lib/utils";
import { Sidebar, SidebarInset, SidebarProvider, SidebarRail } from "~/components/ui/sidebar";

const DiffPanel = lazy(() => import("../components/DiffPanel"));
/** 瀹割喖绱撶€佃鐦崘鍛颁粓鐢啫鐪惃鍕崯娴ｆ挻鐓＄拠銏℃焽閻愮櫢绱拌ぐ鎾诡潒閸欙絽顔旀??????1180px 閺冭绱濆顔肩磽闂堛垺婢樻???Sheet 瑜般垹绱＄仦鏇犮???*/
const DIFF_INLINE_LAYOUT_MEDIA_QUERY = "(max-width: 1180px)";
/** 瀹割喖绱撻棃銏℃緲閸愬懓浠堢€硅棄瀹抽敍姘祼鐎规艾涔忔笟褑绔熼弽蹇撴倵閿涘苯褰囩憴鍡楀???50% 楠炲爼妾洪崚璺烘???28rem ~ 44rem 娑斿妫?*/
const DIFF_INLINE_DEFAULT_WIDTH = "clamp(28rem, calc(50vw - 8rem), 44rem)";
/** 濞村繗顫嶉崳銊╂桨閺夊灝鍞撮懕鏃堢帛鐠併倕顔旀惔锔肩窗閸楃姷鍩楃€圭懓???50% */
const BROWSER_INLINE_DEFAULT_WIDTH = "50%";
/** 閸掑棗澹婄憴鍡楁禈娑擃參娼伴弶鍧楃帛鐠併倕顔旀惔锔肩礄22rem閿涘奔浜?px 鐠佲槄绱?*/
const SPLIT_PANE_PANEL_DEFAULT_WIDTH_PX = 22 * 16;
/** 閸掑棗澹婄憴鍡楁禈娑擃厽绁荤憴鍫濇珤闂堛垺婢樻妯款吇鐎硅棄瀹抽???0rem閿涘奔浜?px 鐠佲槄绱?*/
const BROWSER_SPLIT_PANE_PANEL_DEFAULT_WIDTH_PX = 30 * 16;
/** 閸掑棗澹婄憴鍡楁禈娑擃叀浜版径鈺佸隘閸╃喐娓剁亸蹇擃啍鎼达讣???0rem閿涘绱濋棃銏℃緲閹碘晛鐫嶉弮鏈电瑝瀵版ぞ闀滈崡鐘愁劃缁屾椽???*/
const SPLIT_PANE_CHAT_MIN_WIDTH = 20 * 16;
/** 閸楁洝浜板Ο鈥崇础娑撳褰告笟褔娼伴弶鎸庢付鐏忓繐顔旀惔锔肩礄26rem???*/
const SINGLE_PANEL_MIN_WIDTH = 26 * 16;
/** 濞村繗顫嶉崳銊╂桨閺夋寧娓剁亸蹇擃啍鎼达讣绱?1rem???*/
const BROWSER_PANEL_MIN_WIDTH = 21 * 16;
/** 鏉堟挸鍙嗗鍡欐彛閸戞垶膩瀵繋绗呭锔挎櫠閹貉傛閺堚偓鐏忓繐顔旀惔锔肩礉閻劋绨崚銈嗘焽闂堛垺婢橀弰顖氭儊鐎佃壈鍤у┃銏犲毉 */
const COMPOSER_COMPACT_MIN_LEFT_CONTROLS_WIDTH_PX = 208;
/** 閸欏厖鏅堕棃銏℃緲鐎硅棄瀹抽幐浣风畽閸栨牕鍩?localStorage 閻ㄥ嫰鏁崥宥呭缂傗偓 */
const RIGHT_PANEL_SIDEBAR_WIDTH_STORAGE_KEY = "chat_right_panel_width";
/** 闂堛垺婢橀幏鏍ㄥ鐠嬪啯鏆ｆ径褍鐨弮鍓佹暏娴滃氦???iframe/WebView 閸氬本顒為惃鍕殰鐎规矮绠熸禍瀣╂閸?*/
const PANEL_RESIZE_OVERLAY_SYNC_EVENT = "remi-claw:panel-resize-overlay-sync";
/** 閸掑棗澹婂В鏂剧伐娑撳妾洪敍?5%閿涘绱濋梼鍙夘剾閺屾劒鏅剁悮顐㈠竾缂傗晛鍩屾稉宥呭讲???*/
const SPLIT_RATIO_MIN = 0.25;
/** 閸掑棗澹婂В鏂剧伐娑撳﹪妾洪敍?5%閿涘绱濋梼鍙夘剾閺屾劒鏅剁悮顐㈠竾缂傗晛鍩屾稉宥呭讲???*/
const SPLIT_RATIO_MAX = 0.75;

const allowAnySplitDirection = (_direction: SplitDirection) => true;
const noop = () => {};

function clampSplitRatio(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(SPLIT_RATIO_MAX, Math.max(SPLIT_RATIO_MIN, value));
}

const RightPanelSheet = (props: {
  children: ReactNode;
  panelOpen: boolean;
  onClosePanel: () => void;
}) => {
  return (
    <Sheet
      open={props.panelOpen}
      onOpenChange={(open) => {
        if (!open) {
          props.onClosePanel();
        }
      }}
    >
      <SheetPopup
        side="right"
        showCloseButton={false}
        keepMounted
        className="h-full min-h-0 w-[min(88vw,820px)] max-w-[820px] p-0"
      >
        {props.children}
      </SheetPopup>
    </Sheet>
  );
};

/**
 * 瀹割喖绱撻棃銏℃緲閹虫帒濮炴潪鐣屾畱閸旂姾娴囬崡鐘辩秴缂佸嫪??? * @description ???DiffPanel 娴狅絿鐖滈崸妤€濮炴潪钘夌暚閹存劕澧犵仦鏇犮仛妤犮劍鐏︾??? * @param props.mode - 闂堛垺婢樺Ο鈥崇础閿涘澃idebar / sheet??? */
const DiffLoadingFallback = (props: { mode: DiffPanelMode }) => {
  return (
    <DiffPanelShell mode={props.mode} header={<DiffPanelHeaderSkeleton />}>
      <DiffPanelLoadingState label="Loading diff viewer..." />
    </DiffPanelShell>
  );
};

/**
 * 閹虫帒濮炴潪鐣屾畱瀹割喖绱撻棃銏℃緲缂佸嫪??? * @description 閸栧懓锛?DiffWorkerPoolProvider ???Suspense閿涘苯鐤勯悳鏉挎▕瀵倿娼伴弶璺ㄦ畱閹稿娓堕崝鐘烘祰
 * @param props.mode - 闂堛垺婢樼仦鏇犮仛濡€崇础閿涘澃idebar / sheet??? * @param props.threadId - 瑜版挸澧犵痪璺ㄢ???ID
 * @param props.panelState - 闂堛垺婢橀悩鑸碘偓渚婄礄闂堛垺婢樼猾璇茬€烽妴浣告▕瀵倽鐤嗗▎掳鈧焦鏋冩禒鎯扮熅瀵板嫸绱? * @param props.onUpdatePanelState - 闂堛垺婢橀悩鑸碘偓浣规纯閺傛澘娲栫??? * @param props.onClosePanel - 閸忔娊妫撮棃銏℃緲閸ョ偠??? * @param props.liveRefreshEnabled - 閺勵垰鎯侀崥顖滄暏鐎圭偞妞傞崚閿嬫煀
 */
const LazyDiffPanel = (props: {
  mode: DiffPanelMode;
  threadId?: ThreadIdType | null;
  panelState?: Pick<SplitViewPanePanelState, "panel" | "diffTurnId" | "diffFilePath">;
  onUpdatePanelState?: (
    patch: Partial<Pick<SplitViewPanePanelState, "panel" | "diffTurnId" | "diffFilePath">>,
  ) => void;
  onClosePanel?: () => void;
  liveRefreshEnabled?: boolean;
}) => {
  return (
    <DiffWorkerPoolProvider>
      <Suspense fallback={<DiffLoadingFallback mode={props.mode} />}>
        <DiffPanel
          mode={props.mode}
          {...(props.threadId !== undefined ? { threadId: props.threadId } : {})}
          {...(props.panelState ? { panelState: props.panelState } : {})}
          {...(props.onUpdatePanelState ? { onUpdatePanelState: props.onUpdatePanelState } : {})}
          {...(props.onClosePanel ? { onClosePanel: props.onClosePanel } : {})}
          {...(props.liveRefreshEnabled !== undefined
            ? { liveRefreshEnabled: props.liveRefreshEnabled }
            : {})}
        />
      </Suspense>
    </DiffWorkerPoolProvider>
  );
};

/**
 * 濡偓閺屻儴绶崗銉︻攱閺勵垰鎯侀懗钘夘槱閻炲棙瀵氱€规氨娈戦棃銏℃緲鐎硅棄??? * @description 闁俺绻冩稉瀛樻鐠嬪啯鏆ｇ€硅棄瀹抽獮鑸殿梾濞村妲搁崥锔藉閸戠尨绱濋崚銈嗘焽闂堛垺婢樼€硅棄瀹抽弰顖氭儊閸欘垵顢? * @param input.nextWidth - 閻╊喗鐖ｇ€硅棄瀹抽敍鍫濆剼缁辩媴绱? * @param input.paneScopeId - 闂堛垺婢樻担婊呮暏閸?ID閿涘牏鏁ゆ禍搴＄暰娴ｅ秶澹掔€规俺绶崗銉︻攱閿? * @param input.applyWidth - 鎼存梻鏁ょ€硅棄瀹抽惃鍕礀??? * @param input.resetWidth - 闁插秶鐤嗙€硅棄瀹抽惃鍕礀??? * @returns 婵″倹鐏夋潏鎾冲弳濡楀棗褰叉禒銉ヮ槱閻炲棜顕氱€硅棄瀹抽崚娆掔箲???true閿涘苯鎯侀崚娆掔箲???false
 */
function canComposerHandlePanelWidth(input: {
  nextWidth: number;
  paneScopeId?: string;
  applyWidth: (width: number) => void;
  resetWidth: () => void;
}) {
  const scopeSelector = input.paneScopeId
    ? `[data-chat-composer-form='true'][data-chat-pane-scope='${input.paneScopeId}']`
    : "[data-chat-composer-form='true']";
  const composerForm = document.querySelector<HTMLElement>(scopeSelector);
  if (!composerForm) return true;

  const composerViewport = composerForm.parentElement;
  if (!composerViewport) return true;

  input.applyWidth(input.nextWidth);

  const viewportStyle = window.getComputedStyle(composerViewport);
  const viewportPaddingLeft = Number.parseFloat(viewportStyle.paddingLeft) || 0;
  const viewportPaddingRight = Number.parseFloat(viewportStyle.paddingRight) || 0;
  const viewportContentWidth = Math.max(
    0,
    composerViewport.clientWidth - viewportPaddingLeft - viewportPaddingRight,
  );
  const formRect = composerForm.getBoundingClientRect();
  const composerFooter = composerForm.querySelector<HTMLElement>(
    "[data-chat-composer-footer='true']",
  );
  const composerRightActions = composerForm.querySelector<HTMLElement>(
    "[data-chat-composer-actions='right']",
  );
  const composerRightActionsWidth = composerRightActions?.getBoundingClientRect().width ?? 0;
  const composerFooterGap = composerFooter
    ? Number.parseFloat(window.getComputedStyle(composerFooter).columnGap) ||
      Number.parseFloat(window.getComputedStyle(composerFooter).gap) ||
      0
    : 0;
  const minimumComposerWidth =
    COMPOSER_COMPACT_MIN_LEFT_CONTROLS_WIDTH_PX + composerRightActionsWidth + composerFooterGap;
  const hasComposerOverflow = composerForm.scrollWidth > composerForm.clientWidth + 0.5;
  const overflowsViewport = formRect.width > viewportContentWidth + 0.5;
  const violatesMinimumComposerWidth = composerForm.clientWidth + 0.5 < minimumComposerWidth;

  input.resetWidth();

  return !hasComposerOverflow && !overflowsViewport && !violatesMinimumComposerWidth;
}

/**
 * 閸掓稑缂撻棃銏℃緲鐠嬪啯鏆ｆ径褍鐨惃鍕弿鐏炲繗顩惄鏍х湴
 * @description Tauri <webview> 閸︺劍瀚嬮幏鑺ユ閸欘垵鍏樻导姘偠閹?pointermove 娴滃娆㈤敍娑欘劃鐟曞棛娲婄仦鍌溾€樻穱?React 鐏炲倽鍏橀幐浣虹敾閹恒儲鏁规禍瀣╂??? * @returns 閸掓稑缂撻惃鍕洬閻╂牕???DOM 閸忓啰绀? */
function createPanelResizeOverlay(): HTMLDivElement {
  const overlay = document.createElement("div");
  overlay.setAttribute("data-panel-resize-overlay", "true");
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.zIndex = "2147483647";
  overlay.style.cursor = "col-resize";
  overlay.style.background = "transparent";
  document.body.append(overlay);
  window.dispatchEvent(new Event(PANEL_RESIZE_OVERLAY_SYNC_EVENT));
  return overlay;
}

/**
 * 缁夊娅庨棃銏℃緲鐠嬪啯鏆ｆ径褍鐨惃鍕洬閻╂牕鐪? * @param overlay - 鐟曚胶些闂勩倗娈戠憰鍡欐磰鐏炲倸鍘撶槐? */
function removePanelResizeOverlay(overlay: HTMLDivElement): void {
  overlay.remove();
  window.dispatchEvent(new Event(PANEL_RESIZE_OVERLAY_SYNC_EVENT));
}

/**
 * 闂堛垺婢橀崘鍛颁粓娓氀嗙珶閺嶅繒绮嶆禒? * @description 閸︺劌宕熼懕濠兡佸蹇庣瑓鐏炴洜銇氬顔肩磽鐎佃鐦幋鏍ㄧセ鐟欏牆娅掗棃銏℃緲閻ㄥ嫬鍞撮懕鏂炬櫠鏉堣鐖敍灞炬暜閹镐焦瀚嬮幏鍊熺殶閺佹潙顔旀??? * @param props.panelOpen - 闂堛垺婢橀弰顖氭儊閹垫挸绱? * @param props.onClosePanel - 閸忔娊妫撮棃銏℃緲閸ョ偠??? * @param props.onOpenPanel - 閹垫挸绱戦棃銏℃緲閸ョ偠??? * @param props.renderPanelContent - 閺勵垰鎯佸〒鍙夌厠闂堛垺婢橀崘鍛啇
 * @param props.panel - 闂堛垺婢樼猾璇茬€烽敍鍧唕owser / diff / null??? * @param props.threadId - 瑜版挸澧犵痪璺ㄢ???ID
 * @param props.paneScopeId - 闂堛垺婢樻担婊呮暏閸?ID
 * @param props.panelState - 闂堛垺婢橀悩鑸碘偓? * @param props.onUpdatePanelState - 闂堛垺婢橀悩鑸碘偓浣规纯閺傛澘娲栫??? */
const PanePanelInlineSidebar = (props: {
  panelOpen: boolean;
  onClosePanel: () => void;
  onOpenPanel: () => void;
  renderPanelContent: boolean;
  panel: ChatRightPanel | null | undefined;
  threadId: ThreadIdType | null;
  paneScopeId?: string;
  panelState?: Pick<SplitViewPanePanelState, "panel" | "diffTurnId" | "diffFilePath">;
  onUpdatePanelState?: (
    patch: Partial<Pick<SplitViewPanePanelState, "panel" | "diffTurnId" | "diffFilePath">>,
  ) => void;
}) => {
  const {
    panelOpen,
    onClosePanel,
    onOpenPanel,
    renderPanelContent,
    panel,
    threadId,
    paneScopeId,
    panelState,
    onUpdatePanelState,
  } = props;
  const inlineWrapperRef = useRef<HTMLDivElement>(null);
  const inlineSidebarWidth =
    panel === "browser" ? BROWSER_INLINE_DEFAULT_WIDTH : DIFF_INLINE_DEFAULT_WIDTH;
  const inlineSidebarMinWidth =
    panel === "browser" ? BROWSER_PANEL_MIN_WIDTH : SINGLE_PANEL_MIN_WIDTH;
  const inlineSidebarStorageKey =
    panel === "browser"
      ? `${RIGHT_PANEL_SIDEBAR_WIDTH_STORAGE_KEY}:browser`
      : `${RIGHT_PANEL_SIDEBAR_WIDTH_STORAGE_KEY}:diff`;
  const onOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        onOpenPanel();
        return;
      }
      onClosePanel();
    },
    [onClosePanel, onOpenPanel],
  );
  const shouldAcceptInlineSidebarWidth = useCallback(
    ({ nextWidth, wrapper }: { nextWidth: number; wrapper: HTMLElement }) => {
      const previousSidebarWidth = wrapper.style.getPropertyValue("--sidebar-width");
      return canComposerHandlePanelWidth({
        nextWidth,
        applyWidth: (width) => {
          wrapper.style.setProperty("--sidebar-width", `${width}px`);
        },
        resetWidth: () => {
          if (previousSidebarWidth.length > 0) {
            wrapper.style.setProperty("--sidebar-width", previousSidebarWidth);
          } else {
            wrapper.style.removeProperty("--sidebar-width");
          }
        },
        ...(paneScopeId ? { paneScopeId } : {}),
      });
    },
    [paneScopeId],
  );

  if (panel === "browser") {
    const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
      const wrapper = inlineWrapperRef.current;
      const parent = wrapper?.parentElement;
      if (!wrapper || !parent) return;

      event.preventDefault();
      event.stopPropagation();
      const startX = event.clientX;
      const startWidth = wrapper.getBoundingClientRect().width;
      const maxWidth = Math.max(
        inlineSidebarMinWidth,
        parent.clientWidth - SPLIT_PANE_CHAT_MIN_WIDTH,
      );
      const resizeOverlay = createPanelResizeOverlay();

      const onPointerMove = (moveEvent: PointerEvent) => {
        const delta = startX - moveEvent.clientX;
        const nextWidth = Math.max(inlineSidebarMinWidth, Math.min(maxWidth, startWidth + delta));
        if (
          !canComposerHandlePanelWidth({
            nextWidth,
            applyWidth: (width) => {
              wrapper.style.width = `${width}px`;
            },
            resetWidth: () => {
              wrapper.style.width = `${startWidth}px`;
            },
            ...(paneScopeId ? { paneScopeId } : {}),
          })
        ) {
          return;
        }
        wrapper.style.width = `${nextWidth}px`;
        setLocalStorageItem(inlineSidebarStorageKey, nextWidth, Schema.Finite);
      };

      const onPointerUp = () => {
        removePanelResizeOverlay(resizeOverlay);
        document.body.style.removeProperty("cursor");
        document.body.style.removeProperty("user-select");
        resizeOverlay.removeEventListener("pointermove", onPointerMove);
        resizeOverlay.removeEventListener("pointerup", onPointerUp);
        resizeOverlay.removeEventListener("pointercancel", onPointerUp);
      };

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      resizeOverlay.addEventListener("pointermove", onPointerMove);
      resizeOverlay.addEventListener("pointerup", onPointerUp);
      resizeOverlay.addEventListener("pointercancel", onPointerUp);
    };
    const storedWidth = getLocalStorageItem(inlineSidebarStorageKey, Schema.Finite);

    if (!panelOpen) {
      return null;
    }

    return (
      <div
        ref={inlineWrapperRef}
        data-native-browser-surface="true"
        className="relative flex h-dvh min-h-0 min-w-0 flex-none border-l border-sidebar-border bg-card text-foreground"
        style={
          {
            width:
              storedWidth === null
                ? inlineSidebarWidth
                : `min(${storedWidth}px, calc(100% - ${SPLIT_PANE_CHAT_MIN_WIDTH}px))`,
            maxWidth: `calc(100% - ${SPLIT_PANE_CHAT_MIN_WIDTH}px)`,
            minWidth: inlineSidebarMinWidth,
          } as CSSProperties
        }
      >
        <div
          className="absolute inset-y-0 left-0 z-20 w-2 -translate-x-1/2 cursor-col-resize bg-transparent before:absolute before:inset-y-0 before:left-1/2 before:w-px before:-translate-x-1/2 before:bg-sidebar-border"
          onPointerDown={startResize}
        />
        {renderPanelContent && threadId ? (
          <BrowserPanel mode="sidebar" threadId={threadId} onClosePanel={onClosePanel} />
        ) : null}
      </div>
    );
  }

  return (
    <SidebarProvider
      defaultOpen={false}
      open={panelOpen}
      onOpenChange={onOpenChange}
      className="w-auto min-h-0 flex-none bg-transparent"
      style={{ "--sidebar-width": inlineSidebarWidth } as CSSProperties}
    >
      <Sidebar
        side="right"
        collapsible="offcanvas"
        className="border-l border-sidebar-border bg-card text-foreground"
        resizable={{
          minWidth: inlineSidebarMinWidth,
          shouldAcceptWidth: shouldAcceptInlineSidebarWidth,
          storageKey: inlineSidebarStorageKey,
        }}
      >
        {renderPanelContent && threadId ? (
          <LazyDiffPanel
            mode="sidebar"
            threadId={threadId}
            onClosePanel={onClosePanel}
            {...(panelState ? { panelState } : {})}
            {...(onUpdatePanelState ? { onUpdatePanelState } : {})}
          />
        ) : null}
        <SidebarRail />
      </Sidebar>
    </SidebarProvider>
  );
};

/**
 * 閸掑棗澹婄憴鍡楁禈娑擃厼绁甸崗銉ф畱闂堛垺婢樼紒鍕
 * @description 閸掑棗澹婇棃銏℃緲閺冪姵纭舵径宥囨暏濡楀矂娼伴悧?Sidebar 閸樼喕顕㈤敍鍫濇礈娑撳搫鐣犻惄绋款嚠娴滃氦顫嬮崣锝呯暰娴ｅ稄绱氶敍灞绢劃缂佸嫪娆㈢亸鍡樼セ鐟欏牆???瀹割喖绱撻崘鍛啇闁挎艾鐣鹃崚鏉垮徔娴ｆ挾鐛ラ弽? * @param props.splitViewId - 閸掑棗澹婄憴鍡楁???ID
 * @param props.paneId - 缁愭鐗?ID
 * @param props.paneScopeId - 缁愭鐗告担婊呮暏閸?ID
 * @param props.panelOpen - 闂堛垺婢橀弰顖氭儊閹垫挸绱? * @param props.panel - 闂堛垺婢樼猾璇茬??? * @param props.threadId - 瑜版挸澧犵痪璺ㄢ???ID
 * @param props.onClosePanel - 閸忔娊妫撮棃銏℃緲閸ョ偠??? * @param props.panelState - 闂堛垺婢橀悩鑸碘偓? * @param props.isFocused - 閺勵垰鎯侀懕姘卞妽
 * @param props.onUpdatePanelState - 闂堛垺婢橀悩鑸碘偓浣规纯閺傛澘娲栫??? */
function SplitPaneEmbeddedPanel(props: {
  splitViewId: SplitViewId;
  paneId: PaneId;
  paneScopeId: string;
  panelOpen: boolean;
  panel: ChatRightPanel | null | undefined;
  threadId: ThreadIdType | null;
  onClosePanel: () => void;
  panelState: Pick<SplitViewPanePanelState, "panel" | "diffTurnId" | "diffFilePath">;
  isFocused: boolean;
  onUpdatePanelState: (
    patch: Partial<Pick<SplitViewPanePanelState, "panel" | "diffTurnId" | "diffFilePath">>,
  ) => void;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const panelWidthStorageKey =
    props.panel === "browser" ? "browser" : props.panel === "diff" ? "diff" : "panel";
  const storageKey = `${RIGHT_PANEL_SIDEBAR_WIDTH_STORAGE_KEY}:${props.splitViewId}:${props.paneId}:${panelWidthStorageKey}`;
  const defaultPanelWidth =
    props.panel === "browser"
      ? BROWSER_SPLIT_PANE_PANEL_DEFAULT_WIDTH_PX
      : SPLIT_PANE_PANEL_DEFAULT_WIDTH_PX;
  const minPanelWidth =
    props.panel === "browser" ? BROWSER_PANEL_MIN_WIDTH : SINGLE_PANEL_MIN_WIDTH;
  const [panelWidth, setPanelWidth] = useState<number>(() => {
    return getLocalStorageItem(storageKey, Schema.Finite) ?? defaultPanelWidth;
  });

  useEffect(() => {
    setPanelWidth(getLocalStorageItem(storageKey, Schema.Finite) ?? defaultPanelWidth);
  }, [defaultPanelWidth, storageKey]);

  const shouldAcceptEmbeddedWidth = useCallback(
    (nextWidth: number) => {
      const wrapper = wrapperRef.current;
      if (!wrapper) return true;
      return canComposerHandlePanelWidth({
        nextWidth,
        paneScopeId: props.paneScopeId,
        applyWidth: (width) => {
          wrapper.style.width = `${width}px`;
        },
        resetWidth: () => {
          wrapper.style.width = `${panelWidth}px`;
        },
      });
    },
    [panelWidth, props.paneScopeId],
  );

  const startResize = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const wrapper = wrapperRef.current;
      const parent = wrapper?.parentElement;
      if (!wrapper || !parent) return;

      event.preventDefault();
      event.stopPropagation();
      const startX = event.clientX;
      const startWidth = wrapper.getBoundingClientRect().width;
      const maxWidth = Math.max(minPanelWidth, parent.clientWidth - SPLIT_PANE_CHAT_MIN_WIDTH);
      const resizeOverlay = createPanelResizeOverlay();

      const onPointerMove = (moveEvent: PointerEvent) => {
        const delta = startX - moveEvent.clientX;
        const nextWidth = Math.max(minPanelWidth, Math.min(maxWidth, startWidth + delta));
        if (!shouldAcceptEmbeddedWidth(nextWidth)) {
          return;
        }
        setPanelWidth(nextWidth);
        setLocalStorageItem(storageKey, nextWidth, Schema.Finite);
      };

      const onPointerUp = () => {
        removePanelResizeOverlay(resizeOverlay);
        document.body.style.removeProperty("cursor");
        document.body.style.removeProperty("user-select");
        resizeOverlay.removeEventListener("pointermove", onPointerMove);
        resizeOverlay.removeEventListener("pointerup", onPointerUp);
        resizeOverlay.removeEventListener("pointercancel", onPointerUp);
      };

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      resizeOverlay.addEventListener("pointermove", onPointerMove);
      resizeOverlay.addEventListener("pointerup", onPointerUp);
      resizeOverlay.addEventListener("pointercancel", onPointerUp);
    },
    [minPanelWidth, panelWidth, shouldAcceptEmbeddedWidth, storageKey],
  );

  if (!props.panelOpen || !props.threadId) {
    return null;
  }

  return (
    <div
      ref={wrapperRef}
      data-native-browser-surface={props.panel === "browser" ? "true" : undefined}
      className="relative flex h-full min-h-0 min-w-0 flex-none border-l border-sidebar-border bg-card text-foreground"
      style={
        {
          width: `${panelWidth}px`,
          maxWidth: `calc(100% - ${SPLIT_PANE_CHAT_MIN_WIDTH}px)`,
          minWidth: minPanelWidth,
        } as CSSProperties
      }
    >
      <div
        className="absolute inset-y-0 left-0 z-20 w-2 -translate-x-1/2 cursor-col-resize bg-transparent before:absolute before:inset-y-0 before:left-1/2 before:w-px before:-translate-x-1/2 before:bg-sidebar-border"
        onPointerDown={startResize}
      />
      {props.panel === "browser" ? (
        <BrowserPanel mode="sidebar" threadId={props.threadId} onClosePanel={props.onClosePanel} />
      ) : (
        <LazyDiffPanel
          mode="sidebar"
          threadId={props.threadId}
          onClosePanel={props.onClosePanel}
          panelState={props.panelState}
          liveRefreshEnabled={props.isFocused}
          onUpdatePanelState={props.onUpdatePanelState}
        />
      )}
    </div>
  );
}

/**
 * 鐟欙絾鐎介崡鏇氱妞ゅ湱???ID
 * @description 娴兼ê鍘涙潻鏂挎礀缁捐法鈻奸崗瀹犱粓閻ㄥ嫰銆嶉???ID閿涘苯鍙惧▎陇绻戦崶鐐跺磸缁嬪潡銆嶉???ID
 * @param input.threadProjectId - 缁捐法鈻奸崗瀹犱粓閻ㄥ嫰銆嶉???ID
 * @param input.draftProjectId - 閼藉枪妞ゅ湱娲?ID
 * @returns 鐟欙絾鐎介崥搴ｆ畱妞ゅ湱???ID閿涘矁瀚㈤弮鐘插灟鏉╂柨娲?null
 */
function resolveSingleProjectId(input: {
  threadProjectId: ProjectId | null;
  draftProjectId: ProjectId | null;
}): ProjectId | null {
  return input.threadProjectId ?? input.draftProjectId ?? null;
}

/**
 * 鐏忓棝娼伴弶璺ㄥЦ閹焦鐖ｉ崙鍡楀娑撻缚鐭鹃悽杈ㄦ偝缁便垹寮弫? * @description 鐏忓棝娼伴弶璺ㄥЦ閹浇娴嗛幑顫???URL 閺屻儴顕楅崣鍌涙殶閺嶇厧??? * @param panelState - 闂堛垺婢橀悩鑸碘偓? * @returns 鐠侯垳鏁遍幖婊呭偍閸欏倹鏆熺€电??? */
function normalizeSingleSearchFromPane(
  panelState: Pick<SplitViewPanePanelState, "panel" | "diffTurnId" | "diffFilePath">,
): DiffRouteSearch {
  if (panelState.panel === "browser") {
    return { panel: "browser" };
  }
  if (panelState.panel === "diff") {
    return {
      panel: "diff",
      diff: "1",
      ...(panelState.diffTurnId ? { diffTurnId: panelState.diffTurnId } : {}),
      ...(panelState.diffTurnId && panelState.diffFilePath
        ? { diffFilePath: panelState.diffFilePath }
        : {}),
    };
  }
  return {};
}

/**
 * 閸掑棗澹婄憴鍡楁禈缁岃櫣濮搁幀浣虹矋娴? * @description 瑜版挸鍨庨崜鑼崶閺嶉棿鑵戝▽鈩冩箒缁捐法鈻奸弮璺虹潔缁€铏规畱闁瀚ㄩ崳銊ф櫕闂? * @param props.isFocused - 閺勵垰鎯侀懕姘卞妽
 * @param props.onFocus - 閼辨氨鍔嶉崶鐐剁??? * @param props.threads - 閸欘垶鈧鍤庣粙瀣灙鐞? * @param props.projects - 妞ゅ湱娲伴崚妤勩??? * @param props.excludedThreadIds - 瀹稿弶甯撻梽銈囨畱缁捐法???ID 闂嗗棗鎮? * @param props.onSelectThread - 闁瀚ㄧ痪璺ㄢ柤閸ョ偠鐨? */
function SplitPaneEmptyState(props: {
  isFocused: boolean;
  onFocus: () => void;
  threads: readonly {
    id: ThreadIdType;
    title: string | null;
    projectId: ProjectId;
    modelSelection: { provider: ProviderKind };
  }[];
  projects: readonly { id: ProjectId; name: string }[];
  excludedThreadIds: ReadonlySet<ThreadIdType>;
  onSelectThread: (threadId: ThreadIdType) => void;
}) {
  return (
    <div
      className={cn(
        "flex min-h-0 min-w-0 flex-1 flex-col items-center bg-background px-6 pt-16",
        props.isFocused ? "ring-2 ring-inset ring-primary/70" : "",
      )}
      onMouseDown={props.onFocus}
    >
      <div className="w-full max-w-sm space-y-4">
        <p className="text-center text-sm font-medium text-foreground/70">Select a chat</p>
        <div className="max-h-[60vh] space-y-1 overflow-y-auto">
          {props.threads.map((thread) => {
            const isUsed = props.excludedThreadIds.has(thread.id);
            const projectName =
              props.projects.find((p) => p.id === thread.projectId)?.name ?? "Project";
            return (
              <button
                key={thread.id}
                type="button"
                disabled={isUsed}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
                  isUsed
                    ? "cursor-default border-border/30 opacity-35"
                    : "border-(--color-border-light) hover:bg-(--sidebar-accent)",
                )}
                onClick={() => {
                  if (!isUsed) props.onSelectThread(thread.id);
                }}
              >
                <ProviderIcon
                  provider={thread.modelSelection.provider}
                  className="size-4 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">
                    {resolveThreadPickerTitle(thread.title)}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{projectName}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * 閸掑棗澹婄痪璺ㄧ矋娴? * @description 閸欘垱瀚嬮幏鐣屾畱閸掑棗澹婄痪鍖＄礉閺€顖涘瘮濮樻潙閽╅崪灞界€惄瀛樻煙閸氭埊绱濋幏鏍ㄥ閺冭埖妯夌粈楦款潒鐟欏绱╃€佃偐鍤? * @param props.splitNodeId - 閸掑棗澹婇懞鍌滃???ID
 * @param props.direction - 閸掑棗澹婇弬鐟版倻閿涘潝orizontal / vertical??? * @param props.onSetRatio - 鐠佸墽鐤嗛崚鍡楀濮ｆ柧绶ラ惃鍕礀??? */
function SplitDivider(props: {
  splitNodeId: PaneId;
  direction: SplitDirection;
  onSetRatio: (nodeId: PaneId, ratio: number) => void;
}) {
  const { onSetRatio, splitNodeId, direction } = props;
  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const target = event.currentTarget;
      const parent = target.parentElement as HTMLElement | null;
      if (!parent) return;
      event.preventDefault();
      const rect = parent.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const computeRatio = (clientX: number, clientY: number) =>
        clampSplitRatio(
          direction === "horizontal"
            ? (clientX - rect.left) / rect.width
            : (clientY - rect.top) / rect.height,
        );

      let latestRatio = computeRatio(event.clientX, event.clientY);
      let frameId = 0;
      const previousParentPosition = parent.style.position;
      const previousBodyCursor = document.body.style.cursor;
      const previousBodyUserSelect = document.body.style.userSelect;
      if (getComputedStyle(parent).position === "static") {
        parent.style.position = "relative";
      }
      const resizeGuide = document.createElement("div");
      resizeGuide.setAttribute("data-split-resize-guide", "true");
      Object.assign(resizeGuide.style, {
        position: "absolute",
        zIndex: "50",
        pointerEvents: "none",
        borderRadius: "999px",
        background: "var(--info)",
        opacity: "0.75",
        boxShadow: "0 0 0 1px color-mix(in srgb, var(--info) 70%, transparent)",
      });
      if (direction === "horizontal") {
        Object.assign(resizeGuide.style, {
          top: "0",
          bottom: "0",
          left: "0",
          width: "2px",
        });
      } else {
        Object.assign(resizeGuide.style, {
          top: "0",
          left: "0",
          right: "0",
          height: "2px",
        });
      }
      parent.append(resizeGuide);

      const applyGuide = () => {
        frameId = 0;
        const offsetPx =
          direction === "horizontal" ? rect.width * latestRatio : rect.height * latestRatio;
        resizeGuide.style.transform =
          direction === "horizontal"
            ? `translateX(${Math.round(offsetPx)}px)`
            : `translateY(${Math.round(offsetPx)}px)`;
      };

      const onPointerMove = (moveEvent: PointerEvent) => {
        latestRatio = computeRatio(moveEvent.clientX, moveEvent.clientY);
        if (frameId === 0) {
          frameId = window.requestAnimationFrame(applyGuide);
        }
      };
      const onPointerUp = () => {
        if (frameId !== 0) {
          window.cancelAnimationFrame(frameId);
          applyGuide();
        }
        document.body.style.userSelect = previousBodyUserSelect;
        document.body.style.cursor = previousBodyCursor;
        parent.style.position = previousParentPosition;
        resizeGuide.remove();
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("pointercancel", onPointerUp);
        onSetRatio(splitNodeId, latestRatio);
      };

      document.body.style.userSelect = "none";
      document.body.style.cursor = direction === "horizontal" ? "col-resize" : "row-resize";
      applyGuide();
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerUp);
    },
    [direction, onSetRatio, splitNodeId],
  );

  return (
    <div
      data-split-divider="true"
      data-split-node-id={splitNodeId}
      data-split-direction={direction}
      className={cn(
        "relative z-10 shrink-0 bg-border/70",
        direction === "horizontal"
          ? "w-px cursor-col-resize before:absolute before:inset-y-0 before:-left-1 before:w-2 before:bg-transparent"
          : "h-px cursor-row-resize before:absolute before:inset-x-0 before:-top-1 before:h-2 before:bg-transparent",
      )}
      onPointerDown={handlePointerDown}
    />
  );
}

/**
 * 缁愭鐗稿〒鍙夌厠閸ｃ劎绮嶆禒? * @description 闁帒缍婂〒鍙夌厠閸掑棗澹婄憴鍡楁禈閻ㄥ嫭鐖茶ぐ銏㈢波閺嬪嫸绱濇径鍕倞閸欒泛鐡欓懞鍌滃仯閸滃苯鍨庨崜鑼跺Ν??? * @param props.pane - 瑜版挸澧犵粣妤佺壐閼哄倻鍋? * @param props.splitView - 閸掑棗澹婄憴鍡楁禈鐎电??? * @param props.renderLeaf - 閸欒泛鐡欓懞鍌滃仯濞撳弶鐓嬮崙鑺ユ殶
 * @param props.onSetRatio - 鐠佸墽鐤嗛崚鍡楀濮ｆ柧绶ラ惃鍕礀??? */
function PaneRenderer(props: {
  pane: Pane;
  splitView: SplitView;
  renderLeaf: (input: { leaf: LeafPane }) => ReactNode;
  onSetRatio: (nodeId: PaneId, ratio: number) => void;
}) {
  if (props.pane.kind === "leaf") {
    return <>{props.renderLeaf({ leaf: props.pane })}</>;
  }
  const node = props.pane;
  const isRow = node.direction === "horizontal";
  const firstBasis = `${node.ratio * 100}%`;
  return (
    <div
      data-split-container="true"
      data-split-direction={node.direction}
      className={cn("flex min-h-0 min-w-0 flex-1 overflow-hidden", isRow ? "flex-row" : "flex-col")}
    >
      <div
        className="flex min-h-0 min-w-0 overflow-hidden"
        style={{ flexBasis: firstBasis, flexGrow: 0, flexShrink: 1 }}
      >
        <PaneRenderer
          pane={node.first}
          splitView={props.splitView}
          renderLeaf={props.renderLeaf}
          onSetRatio={props.onSetRatio}
        />
      </div>
      <SplitDivider
        splitNodeId={node.id}
        direction={node.direction}
        onSetRatio={props.onSetRatio}
      />
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <PaneRenderer
          pane={node.second}
          splitView={props.splitView}
          renderLeaf={props.renderLeaf}
          onSetRatio={props.onSetRatio}
        />
      </div>
    </div>
  );
}

/**
 * 閼卞﹤銇夐悾宀勬桨閹稿倽娴囨銊︾仸鐏炲繒绮嶆??? * @description ???ChatView 缂佸嫪娆㈤幐鍌濇祰閺堢喖妫跨仦鏇犮仛閸楃姳缍?UI閿涘本膩閹风喓婀＄€圭偠浜版径鈺冩櫕闂堛垻娈戠敮鍐ㄧ湰缂佹挻??? */
function ChatMountSkeleton() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background text-foreground contain-[layout_style_paint]">
      {/* Mirrors the real chat shell so route changes paint immediately while ChatView mounts
          on the next frames. */}
      <div className="drag-region flex h-[44px] shrink-0 items-center gap-3 border-b border-(--color-border-light) px-4">
        <div className="size-5 rounded-full bg-muted" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="h-3.5 w-44 max-w-[48%] rounded-full bg-muted" />
          <div className="h-2 w-24 max-w-[32%] rounded-full bg-muted/65" />
        </div>
        <div className="hidden items-center gap-1.5 sm:flex">
          <div className="size-7 rounded-md border border-(--color-border-light) bg-muted/35" />
          <div className="size-7 rounded-md border border-(--color-border-light) bg-muted/35" />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col justify-end gap-3 px-5 py-4">
        <div className="max-w-[82%] space-y-2 rounded-2xl border border-(--color-border-light) bg-muted/22 p-3">
          <div className="h-2.5 w-11/12 rounded-full bg-muted/75" />
          <div className="h-2.5 w-7/12 rounded-full bg-muted/60" />
        </div>
        <div className="ml-auto max-w-[70%] space-y-2 rounded-2xl bg-muted/45 p-3">
          <div className="h-2.5 w-48 max-w-full rounded-full bg-muted-foreground/14" />
          <div className="h-2.5 w-32 max-w-[78%] rounded-full bg-muted-foreground/12" />
        </div>
        <div className="max-w-[88%] space-y-2 rounded-2xl border border-(--color-border-light) bg-muted/22 p-3">
          <div className="h-2.5 w-full rounded-full bg-muted/75" />
          <div className="h-2.5 w-10/12 rounded-full bg-muted/60" />
          <div className="h-2.5 w-5/12 rounded-full bg-muted/50" />
        </div>
      </div>
      <div className="shrink-0 border-t border-(--color-border-light) p-3">
        <div className="rounded-2xl border border-(--color-border-light) bg-background p-3 shadow-xs">
          <div className="h-3 w-40 max-w-[50%] rounded-full bg-muted" />
          <div className="mt-8 flex items-center justify-between">
            <div className="h-2.5 w-24 rounded-full bg-muted/65" />
            <div className="size-7 rounded-full bg-muted" />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 瀵ゆ儼绻滈幐鍌濇祰閻ㄥ嫯浜版径鈺勵潒閸ュ墽绮嶆禒? * @description 闁俺绻冮崣?requestAnimationFrame 瀵ゆ儼绻滈幐鍌濇祰閿涘矂浼╅崗宥堢熅閻㈠崬鍨忛幑銏℃閻ㄥ嫬宕辨??? * @param props.threadId - 缁捐法鈻?ID
 * @param props.paneScopeId - 缁愭鐗告担婊呮暏閸?ID
 * @param props.deferMount - 閺勵垰鎯佸鎯扮箿閹稿倽娴? * @param props.surfaceMode - 鐞涖劑娼板Ο鈥崇础閿涘澃ingle / split??? * @param props.isFocusedPane - 閺勵垰鎯侀懕姘卞妽缁愭鐗? * @param props.panelState - 闂堛垺婢橀悩鑸碘偓? * @param props.onToggleDiff - 閸掑洦宕插顔肩磽闂堛垺婢橀崶鐐剁殶
 * @param props.onToggleBrowser - 閸掑洦宕插ù蹇氼潔閸ｃ劑娼伴弶鍨礀??? * @param props.onOpenTurnDiff - 閹垫挸绱戞潪顔筋偧瀹割喖绱撻崶鐐剁??? * @param props.onSplitSurface - 閸掑棗澹婄悰銊╂桨閸ョ偠??? * @param props.onMaximize - 閺堚偓婢堆冨閸ョ偠??? * @param props.onChangeThread - 閸掑洦宕茬痪璺ㄢ柤閸ョ偠??? * @param props.onCloseThreadPane - 閸忔娊妫寸痪璺ㄢ柤闂堛垺婢橀崶鐐剁殶
 * @param props.onMounted - 閹稿倽娴囩€瑰本鍨氶崶鐐剁殶
 */
function DeferredChatView(props: {
  threadId: ThreadIdType;
  paneScopeId: string;
  deferMount: boolean;
  surfaceMode: "single" | "split";
  isFocusedPane: boolean;
  panelState: SplitViewPanePanelState;
  onToggleDiff: () => void;
  onToggleBrowser: () => void;
  onOpenTurnDiff: (turnId: TurnId, filePath?: string) => void;
  onSplitSurface?: () => void;
  onMaximize?: () => void;
  onChangeThread?: () => void;
  onCloseThreadPane?: () => void;
  onMounted?: () => void;
}) {
  const onMounted = props.onMounted ?? noop;
  const mountKey = `${props.paneScopeId}:${props.threadId}`;
  const [readyMountKey, setReadyMountKey] = useState<string | null>(() =>
    props.deferMount ? null : mountKey,
  );
  const canMountChatView = !props.deferMount || readyMountKey === mountKey;

  useEffect(() => {
    if (!props.deferMount) {
      return;
    }
    setReadyMountKey(null);
    let firstFrame = 0;
    let secondFrame = 0;
    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => setReadyMountKey(mountKey));
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [mountKey, props.deferMount]);

  useEffect(() => {
    if (canMountChatView) {
      onMounted();
    }
  }, [canMountChatView, onMounted]);

  if (!canMountChatView) {
    return <ChatMountSkeleton />;
  }

  return (
    <ChatView
      key={props.paneScopeId}
      threadId={props.threadId}
      paneScopeId={props.paneScopeId}
      surfaceMode={props.surfaceMode}
      isFocusedPane={props.isFocusedPane}
      panelState={props.panelState}
      onToggleDiffPanel={props.onToggleDiff}
      onToggleBrowserPanel={props.onToggleBrowser}
      onOpenTurnDiffPanel={props.onOpenTurnDiff}
      {...(props.onSplitSurface ? { onSplitSurface: props.onSplitSurface } : {})}
      {...(props.onMaximize ? { onMaximizeSurface: props.onMaximize } : {})}
      {...(props.onChangeThread ? { onChangeThreadInSplitPane: props.onChangeThread } : {})}
      {...(props.onCloseThreadPane ? { onCloseThreadPane: props.onCloseThreadPane } : {})}
    />
  );
}

/**
 * 閸掑棗澹婄憴鍡楁禈缁愭鐗哥悰銊╂桨缂佸嫪娆? * @description 閸楁洑閲滈崚鍡楀缁愭鐗搁惃鍕暚閺佹潙顔愰崳顭掔礉閸栧懎鎯堥懕濠傘亯鐟欏棗娴橀妴渚€娼伴弶瑁も偓浣瑰珛閺€鎹愵洬閻╂牕鐪扮??? * @param props.splitView - 閸掑棗澹婄憴鍡楁禈鐎电??? * @param props.paneId - 缁愭鐗?ID
 * @param props.threadId - 缁捐法鈻?ID
 * @param props.panelState - 闂堛垺婢橀悩鑸碘偓? * @param props.isFocused - 閺勵垰鎯侀懕姘卞妽
 * @param props.deferChatMount - 閺勵垰鎯佸鎯扮箿閹稿倽娴囬懕濠傘亯鐟欏棗??? * @param props.canDropInDirection - 閸掋倖鏌囬弰顖氭儊閸欘垰婀幐鍥х暰閺傜懓鎮滈幏鏍ㄦ??? * @param props.excludedThreadIds - 瀹稿弶甯撻梽銈囨畱缁捐法???ID 闂嗗棗鎮? * @param props.threads - 閸欘垶鈧鍤庣粙瀣灙鐞? * @param props.projects - 妞ゅ湱娲伴崚妤勩??? * @param props.onFocus - 閼辨氨鍔嶉崶鐐剁??? * @param props.onToggleDiff - 閸掑洦宕插顔肩磽闂堛垺婢橀崶鐐剁殶
 * @param props.onToggleBrowser - 閸掑洦宕插ù蹇氼潔閸ｃ劑娼伴弶鍨礀??? * @param props.onOpenTurnDiff - 閹垫挸绱戞潪顔筋偧瀹割喖绱撻崶鐐剁??? * @param props.onClosePanel - 閸忔娊妫撮棃銏℃緲閸ョ偠??? * @param props.onUpdatePanelState - 闂堛垺婢橀悩鑸碘偓浣规纯閺傛澘娲栫??? * @param props.onMaximize - 閺堚偓婢堆冨閸ョ偠??? * @param props.onCloseThreadPane - 閸忔娊妫寸痪璺ㄢ柤闂堛垺婢橀崶鐐剁殶
 * @param props.onChooseThread - 闁瀚ㄧ痪璺ㄢ柤閸ョ偠鐨? * @param props.onSelectThread - 闁瀚ㄧ痪璺ㄢ柤閸ョ偠鐨? * @param props.onChatMounted - 閼卞﹤銇夐幐鍌濇祰鐎瑰本鍨氶崶鐐剁殶
 * @param props.onDropThread - 閹锋牗鏂佺痪璺ㄢ柤閸ョ偠??? */
function SplitPaneSurface(props: {
  splitView: SplitView;
  paneId: PaneId;
  threadId: ThreadIdType | null;
  panelState: SplitViewPanePanelState;
  isFocused: boolean;
  deferChatMount: boolean;
  canDropInDirection: (direction: SplitDirection) => boolean;
  excludedThreadIds: ReadonlySet<ThreadIdType>;
  threads: readonly {
    id: ThreadIdType;
    title: string | null;
    projectId: ProjectId;
    modelSelection: { provider: ProviderKind };
  }[];
  projects: readonly { id: ProjectId; name: string }[];
  onFocus: () => void;
  onToggleDiff: () => void;
  onToggleBrowser: () => void;
  onOpenTurnDiff: (turnId: TurnId, filePath?: string) => void;
  onClosePanel: () => void;
  onUpdatePanelState: (
    patch: Partial<Pick<SplitViewPanePanelState, "panel" | "diffTurnId" | "diffFilePath">>,
  ) => void;
  onMaximize: () => void;
  onCloseThreadPane: () => void;
  onChooseThread: () => void;
  onSelectThread: (threadId: ThreadIdType) => void;
  onChatMounted: () => void;
  onDropThread: (payload: {
    droppedThreadId: ThreadIdType;
    direction: SplitDirection;
    side: SplitDropSide;
  }) => void;
}) {
  const paneScopeId = `${props.splitView.id}:${props.paneId}`;
  const panelOpen = props.panelState.panel !== null;
  const shouldRenderPanelContent = panelOpen || props.panelState.hasOpenedPanel;

  const onDropThread = props.onDropThread;
  const handleDrop = useCallback(
    (payload: { threadId: ThreadIdType; direction: SplitDirection; side: SplitDropSide }) => {
      onDropThread({
        droppedThreadId: payload.threadId,
        direction: payload.direction,
        side: payload.side,
      });
    },
    [onDropThread],
  );

  return (
    <div
      className={cn(
        "group relative flex min-h-0 min-w-0 flex-1 bg-background contain-[layout_style_paint]",
      )}
    >
      <ChatPaneDropOverlay
        paneScopeId={paneScopeId}
        canDropInDirection={props.canDropInDirection}
        excludedThreadIds={props.excludedThreadIds}
        onDrop={handleDrop}
        className="flex min-h-0 min-w-0 flex-1"
      >
        <SidebarInset
          className={cn(
            "min-h-0 min-w-0 overflow-hidden overscroll-y-none text-foreground transition-shadow",
            props.isFocused ? "ring-2 ring-inset ring-primary/70" : "",
          )}
          onMouseDown={props.onFocus}
        >
          {props.threadId ? (
            <DeferredChatView
              threadId={props.threadId}
              paneScopeId={paneScopeId}
              deferMount={props.deferChatMount}
              surfaceMode="split"
              isFocusedPane={props.isFocused}
              panelState={props.panelState}
              onToggleDiff={props.onToggleDiff}
              onToggleBrowser={props.onToggleBrowser}
              onOpenTurnDiff={props.onOpenTurnDiff}
              onMaximize={props.onMaximize}
              onChangeThread={props.onChooseThread}
              onCloseThreadPane={props.onCloseThreadPane}
              onMounted={props.onChatMounted}
            />
          ) : (
            <SplitPaneEmptyState
              isFocused={props.isFocused}
              onFocus={props.onFocus}
              threads={props.threads}
              projects={props.projects}
              excludedThreadIds={props.excludedThreadIds}
              onSelectThread={props.onSelectThread}
            />
          )}
        </SidebarInset>
      </ChatPaneDropOverlay>
      <SplitPaneEmbeddedPanel
        splitViewId={props.splitView.id}
        paneId={props.paneId}
        paneScopeId={paneScopeId}
        panelOpen={panelOpen && shouldRenderPanelContent}
        panel={props.panelState.panel}
        threadId={props.threadId}
        onClosePanel={props.onClosePanel}
        panelState={props.panelState}
        isFocused={props.isFocused}
        onUpdatePanelState={props.onUpdatePanelState}
      />
      {props.isFocused ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-[0.9px] z-20 border border-[color-mix(in_srgb,var(--info)_45%,transparent)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--info)_12%,transparent)] transition-opacity duration-150"
        />
      ) : null}
      {!props.isFocused ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10 bg-foreground/6 transition-opacity duration-150"
        />
      ) : null}
    </div>
  );
}

/**
 * 閸掑棗澹婇懕濠傘亯鐞涖劑娼扮紒鍕
 * @description 缁狅紕鎮婇弫缈犻嚋閸掑棗澹婄憴鍡楁禈閻ㄥ嫮鏁撻崨钘夋噯閺堢喎鎷版禍銈勭鞍閿涘苯瀵橀幏顒傜崶閺嶈壈浠涢悞锔衡偓浣哄殠缁嬪鍨忛幑鈧偓渚€娼伴弶鎸庡付閸掑墎??? * @param props.splitViewId - 閸掑棗澹婄憴鍡楁???ID
 * @param props.routeThreadId - 鐠侯垳鏁辨稉顓犳畱缁捐法???ID
 */
function SplitChatSurface(props: { splitViewId: SplitViewId; routeThreadId: ThreadIdType }) {
  const navigate = useNavigate();
  const { handleNewChat } = useHandleNewChat();
  const selectAllThreads = useMemo(() => createAllThreadsSelector(), []);
  const threads = useStore(selectAllThreads);
  const projects = useStore((store) => store.projects);
  const splitView = useSplitViewStore(selectSplitView(props.splitViewId));
  const setFocusedPane = useSplitViewStore((store) => store.setFocusedPane);
  const setRatioForNode = useSplitViewStore((store) => store.setRatioForNode);
  const setPanePanelState = useSplitViewStore((store) => store.setPanePanelState);
  const replacePaneThread = useSplitViewStore((store) => store.replacePaneThread);
  const dropThreadOnPane = useSplitViewStore((store) => store.dropThreadOnPane);
  const removeSplitView = useSplitViewStore((store) => store.removeSplitView);
  const removePaneFromSplitView = useSplitViewStore((store) => store.removePaneFromSplitView);
  const [threadPickerPaneId, setThreadPickerPaneId] = useState<PaneId | null>(null);
  const { splitView: activeSplitView, routePaneId } = resolveActiveSplitView({
    splitView,
    routeThreadId: props.routeThreadId,
  });

  useEffect(() => {
    if (!activeSplitView) {
      void navigate({
        to: "/$threadId",
        params: { threadId: props.routeThreadId },
        replace: true,
        search: (previous) => ({ ...stripDiffSearchParams(previous), splitViewId: undefined }),
      });
      return;
    }

    // Single-leaf split views collapse back to the single chat surface.
    const leaves = collectLeaves(activeSplitView.root);
    if (leaves.length <= 1) {
      const onlyThreadId = leaves[0]?.threadId ?? null;
      removeSplitView(activeSplitView.id);
      const fallbackThreadId = onlyThreadId ?? props.routeThreadId;
      if (!fallbackThreadId) {
        void handleNewChat({ fresh: true });
        return;
      }
      void navigate({
        to: "/$threadId",
        params: { threadId: fallbackThreadId },
        replace: true,
        search: (previous) => ({ ...stripDiffSearchParams(previous), splitViewId: undefined }),
      });
      return;
    }

    // If the route threadId targets a non-focused pane, switch focus to that pane.
    const focusedLeaf = findLeafPaneById(activeSplitView.root, activeSplitView.focusedPaneId);
    if (
      routePaneId &&
      routePaneId !== activeSplitView.focusedPaneId &&
      focusedLeaf?.threadId !== null &&
      focusedLeaf?.threadId !== undefined
    ) {
      setFocusedPane(activeSplitView.id, routePaneId);
      return;
    }

    // Sync the route threadId with the focused leaf's thread.
    const normalizedFocusedThreadId = resolveSplitViewFocusedThreadId(activeSplitView);
    if (normalizedFocusedThreadId && props.routeThreadId !== normalizedFocusedThreadId) {
      void navigate({
        to: "/$threadId",
        params: { threadId: normalizedFocusedThreadId },
        replace: true,
        search: (previous) => ({
          ...stripDiffSearchParams(previous),
          splitViewId: activeSplitView.id,
        }),
      });
    }
  }, [
    activeSplitView,
    handleNewChat,
    navigate,
    props.routeThreadId,
    removeSplitView,
    routePaneId,
    setFocusedPane,
  ]);

  const setPaneFocus = useCallback(
    (paneId: PaneId) => {
      if (!activeSplitView) return;
      const leaf = findLeafPaneById(activeSplitView.root, paneId);
      const nextThreadId = leaf?.threadId ?? resolveSplitViewFocusedThreadId(activeSplitView);
      setFocusedPane(activeSplitView.id, paneId);
      if (!nextThreadId || nextThreadId === props.routeThreadId) {
        return;
      }
      void navigate({
        to: "/$threadId",
        params: { threadId: nextThreadId },
        replace: true,
        search: (previous) => ({
          ...stripDiffSearchParams(previous),
          splitViewId: activeSplitView.id,
        }),
      });
    },
    [activeSplitView, navigate, props.routeThreadId, setFocusedPane],
  );

  const updatePanePanelState = useCallback(
    (
      paneId: PaneId,
      patch: Partial<Pick<SplitViewPanePanelState, "panel" | "diffTurnId" | "diffFilePath">>,
    ) => {
      if (!activeSplitView) return;
      const leaf = findLeafPaneById(activeSplitView.root, paneId);
      if (!leaf) return;
      const nextPanel = patch.panel ?? leaf.panel.panel;
      setPanePanelState(activeSplitView.id, paneId, {
        ...patch,
        hasOpenedPanel: leaf.panel.hasOpenedPanel || nextPanel !== null,
        lastOpenPanel:
          patch.panel === "browser" || patch.panel === "diff"
            ? patch.panel
            : leaf.panel.lastOpenPanel,
      });
    },
    [activeSplitView, setPanePanelState],
  );

  const togglePanePanel = useCallback(
    (paneId: PaneId, panel: ChatRightPanel) => {
      if (!activeSplitView) return;
      const leaf = findLeafPaneById(activeSplitView.root, paneId);
      if (!leaf?.threadId) {
        return;
      }
      updatePanePanelState(paneId, resolveToggledChatPanelPatch(leaf.panel, panel));
    },
    [activeSplitView, updatePanePanelState],
  );

  useEffect(() => {
    const onMenuAction = tauriBridge.onMenuAction;
    if (typeof onMenuAction !== "function" || !activeSplitView) {
      return;
    }

    const unsubscribe = onMenuAction((action) => {
      if (action !== "toggle-browser") return;
      togglePanePanel(activeSplitView.focusedPaneId, "browser");
    });

    return () => {
      unsubscribe?.();
    };
  }, [activeSplitView, togglePanePanel]);

  useEffect(() => {
    const onOpenBrowserPanelRequest = tauriBridge.browser.onBrowserUseOpenPanelRequest;
    if (typeof onOpenBrowserPanelRequest !== "function" || !activeSplitView) {
      return;
    }

    const unsubscribe = onOpenBrowserPanelRequest(() => {
      updatePanePanelState(activeSplitView.focusedPaneId, { panel: "browser" });
    });

    return () => {
      unsubscribe?.();
    };
  }, [activeSplitView, updatePanePanelState]);

  const closePanePanel = useCallback(
    (paneId: PaneId) => {
      updatePanePanelState(paneId, { panel: null });
    },
    [updatePanePanelState],
  );

  const openPaneTurnDiff = useCallback(
    (paneId: PaneId, turnId: TurnId, filePath?: string) => {
      updatePanePanelState(paneId, {
        panel: "diff",
        diffTurnId: turnId,
        diffFilePath: filePath ?? null,
      });
    },
    [updatePanePanelState],
  );

  const maximizeFocusedPane = useCallback(() => {
    if (!activeSplitView) return;
    const focusedLeaf = findLeafPaneById(activeSplitView.root, activeSplitView.focusedPaneId);
    const decision = resolveSplitPaneMaximizeDecision({
      splitViewId: activeSplitView.id,
      focusedThreadId: focusedLeaf?.threadId ?? null,
      focusedPanelState: focusedLeaf?.panel ?? null,
    });

    if (decision) {
      removeSplitView(decision.splitViewIdToRemove);
      void navigate({
        to: "/$threadId",
        params: { threadId: decision.threadId },
        replace: true,
        search: () =>
          decision.panelState ? normalizeSingleSearchFromPane(decision.panelState) : {},
      });
      return;
    }

    removeSplitView(activeSplitView.id);
    void handleNewChat({ fresh: true });
  }, [activeSplitView, handleNewChat, navigate, removeSplitView]);

  const closePaneThread = useCallback(
    (paneId: PaneId) => {
      if (!activeSplitView) return;
      const closingLeaf = findLeafPaneById(activeSplitView.root, paneId);
      const closingThread = closingLeaf?.threadId
        ? threads.find((thread) => thread.id === closingLeaf.threadId)
        : null;

      if (closingThread?.sidechatSourceThreadId) {
        const decision = resolveSplitPaneCloseDecision({
          splitViewId: activeSplitView.id,
          sourceThreadId: activeSplitView.sourceThreadId,
          closingThreadId: closingLeaf?.threadId ?? null,
          closingSidechatSourceThreadId: closingThread.sidechatSourceThreadId,
          nextFocusedThreadId: null,
          nextLeafCount: 0,
        });
        if (decision.kind !== "single-thread") return;
        void navigate({
          to: "/$threadId",
          params: { threadId: decision.threadId },
          replace: true,
          search: (previous) => ({
            ...stripDiffSearchParams(previous),
            splitViewId: undefined,
          }),
        }).then(() => {
          removeSplitView(decision.splitViewIdToRemove);
        });
        return;
      }

      const closed = removePaneFromSplitView({ splitViewId: activeSplitView.id, paneId });
      if (!closed) return;

      const nextSplitView = useSplitViewStore.getState().splitViewsById[activeSplitView.id];
      const nextThreadId = nextSplitView ? resolveSplitViewFocusedThreadId(nextSplitView) : null;
      const decision = resolveSplitPaneCloseDecision({
        splitViewId: activeSplitView.id,
        sourceThreadId: activeSplitView.sourceThreadId,
        closingThreadId: closingLeaf?.threadId ?? null,
        closingSidechatSourceThreadId: null,
        nextFocusedThreadId: nextThreadId,
        nextLeafCount: nextSplitView ? collectLeaves(nextSplitView.root).length : 0,
      });

      if (decision.kind === "single-thread") {
        removeSplitView(decision.splitViewIdToRemove);
        void navigate({
          to: "/$threadId",
          params: { threadId: decision.threadId },
          replace: true,
          search: (previous) => ({
            ...stripDiffSearchParams(previous),
            splitViewId: undefined,
          }),
        });
        return;
      }

      if (decision.kind === "split-thread") {
        void navigate({
          to: "/$threadId",
          params: { threadId: decision.threadId },
          replace: true,
          search: (previous) => ({
            ...stripDiffSearchParams(previous),
            splitViewId: decision.splitViewId,
          }),
        });
        return;
      }

      void handleNewChat({ fresh: true });
    },
    [activeSplitView, handleNewChat, navigate, removePaneFromSplitView, removeSplitView, threads],
  );

  const handleSetRatio = useCallback(
    (nodeId: PaneId, ratio: number) => {
      if (!activeSplitView) return;
      setRatioForNode(activeSplitView.id, nodeId, ratio);
    },
    [activeSplitView, setRatioForNode],
  );

  const handleDropThreadOnPane = useCallback(
    (
      paneId: PaneId,
      payload: {
        droppedThreadId: ThreadIdType;
        direction: SplitDirection;
        side: SplitDropSide;
      },
    ) => {
      if (!activeSplitView) return;
      const ok = dropThreadOnPane({
        splitViewId: activeSplitView.id,
        targetPaneId: paneId,
        direction: payload.direction,
        side: payload.side,
        threadId: payload.droppedThreadId,
      });
      if (!ok) return;
      startTransition(() => {
        void navigate({
          to: "/$threadId",
          params: { threadId: payload.droppedThreadId },
          replace: true,
          search: () => ({ splitViewId: activeSplitView.id }),
        });
      });
    },
    [activeSplitView, dropThreadOnPane, navigate],
  );

  const selectableThreads = useMemo(
    () =>
      threads.toSorted(
        (left, right) =>
          Date.parse(right.updatedAt ?? right.createdAt) -
          Date.parse(left.updatedAt ?? left.createdAt),
      ),
    [threads],
  );
  const splitThreadIds = useMemo(
    () => new Set(activeSplitView ? resolveSplitViewThreadIds(activeSplitView) : []),
    [activeSplitView],
  );

  if (!activeSplitView) {
    return <ChatMountSkeleton />;
  }

  const chooseThreadForPane = (threadId: ThreadIdType, paneOverride?: PaneId) => {
    const paneId = paneOverride ?? threadPickerPaneId;
    if (!paneId) {
      return;
    }
    setThreadPickerPaneId(null);

    const existingPaneIdForThread = resolveSplitViewPaneIdForThread(activeSplitView, threadId);
    if (existingPaneIdForThread && existingPaneIdForThread !== paneId) {
      setPaneFocus(existingPaneIdForThread);
      return;
    }

    const leaf = findLeafPaneById(activeSplitView.root, paneId);
    setFocusedPane(activeSplitView.id, paneId);
    if (leaf && leaf.threadId !== threadId) {
      replacePaneThread(activeSplitView.id, paneId, threadId);
      setPanePanelState(activeSplitView.id, paneId, {
        diffTurnId: null,
        diffFilePath: null,
      });
    }

    void navigate({
      to: "/$threadId",
      params: { threadId },
      replace: true,
      search: (previous) => ({
        ...stripDiffSearchParams(previous),
        splitViewId: activeSplitView.id,
      }),
    });
  };

  const renderLeaf = ({ leaf }: { leaf: LeafPane }): ReactNode => {
    const isFocused = leaf.id === activeSplitView.focusedPaneId;
    const excluded = new Set<ThreadIdType>(splitThreadIds);
    return (
      <SplitPaneSurface
        key={leaf.id}
        splitView={activeSplitView}
        paneId={leaf.id}
        threadId={leaf.threadId}
        panelState={leaf.panel}
        isFocused={isFocused}
        deferChatMount={false}
        canDropInDirection={(direction) =>
          canSubdividePane(activeSplitView.root, leaf.id, direction)
        }
        excludedThreadIds={excluded}
        threads={selectableThreads}
        projects={projects}
        onFocus={() => setPaneFocus(leaf.id)}
        onToggleDiff={() => togglePanePanel(leaf.id, "diff")}
        onToggleBrowser={() => togglePanePanel(leaf.id, "browser")}
        onOpenTurnDiff={(turnId, filePath) => openPaneTurnDiff(leaf.id, turnId, filePath)}
        onClosePanel={() => closePanePanel(leaf.id)}
        onUpdatePanelState={(patch) => updatePanePanelState(leaf.id, patch)}
        onMaximize={maximizeFocusedPane}
        onCloseThreadPane={() => closePaneThread(leaf.id)}
        onChooseThread={() => {
          setPaneFocus(leaf.id);
          setThreadPickerPaneId(leaf.id);
        }}
        onSelectThread={(threadId) => chooseThreadForPane(threadId, leaf.id)}
        onChatMounted={noop}
        onDropThread={(payload) => handleDropThreadOnPane(leaf.id, payload)}
      />
    );
  };

  const pickerLeaf = threadPickerPaneId
    ? findLeafPaneById(activeSplitView.root, threadPickerPaneId)
    : null;

  return (
    <>
      <div className="flex h-dvh min-h-0 min-w-0 flex-1 overflow-hidden bg-background">
        <PaneRenderer
          pane={activeSplitView.root}
          splitView={activeSplitView}
          renderLeaf={renderLeaf}
          onSetRatio={handleSetRatio}
        />
      </div>
      <Dialog
        open={threadPickerPaneId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setThreadPickerPaneId(null);
          }
        }}
      >
        <DialogPopup className="max-w-lg">
          <DialogHeader className="items-center text-center">
            <DialogTitle>Choose Chat</DialogTitle>
            <DialogDescription className="max-w-sm text-center">
              Pick which chat should appear in the focused split pane.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="space-y-3">
            <div className="max-h-[56vh] space-y-1 overflow-y-auto">
              {selectableThreads.map((thread) => {
                const projectName =
                  projects.find((project) => project.id === thread.projectId)?.name ?? "Project";
                const isSelected = pickerLeaf?.threadId === thread.id;
                return (
                  <button
                    key={thread.id}
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
                      isSelected
                        ? "border-(--color-border) bg-(--sidebar-accent)"
                        : "border-(--color-border-light) hover:bg-(--sidebar-accent)",
                    )}
                    onClick={() => chooseThreadForPane(thread.id)}
                  >
                    <ProviderIcon
                      provider={thread.modelSelection.provider}
                      className="size-4 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-foreground">
                        {resolveThreadPickerTitle(thread.title)}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">{projectName}</div>
                    </div>
                  </button>
                );
              })}
            </div>
            <DialogFooter variant="bare">
              <Button type="button" variant="outline" onClick={() => setThreadPickerPaneId(null)}>
                Cancel
              </Button>
            </DialogFooter>
          </DialogPanel>
        </DialogPopup>
      </Dialog>
    </>
  );
}

/**
 * 閸楁洝浜扮悰銊╂桨缂佸嫪??? * @description 缁狅紕鎮婇崡鏇′喊濡€崇础娑撳娈戦懕濠傘亯鐟欏棗娴橀妴浣稿礁娓氀囨桨閺夎￥鈧礁鍨庨崜鑼额潒閸ユ儳鍨卞铏圭??? * @param props.threadId - 缁捐法鈻?ID
 * @param props.search - 鐠侯垳鏁遍幖婊呭偍閸欏倹鏆? * @param props.projectId - 妞ゅ湱娲?ID
 */
function SingleChatSurface(props: {
  threadId: ThreadIdType;
  search: DiffRouteSearch;
  projectId: ProjectId | null;
}) {
  const navigate = useNavigate();
  const shouldUseDiffSheet = useMediaQuery(DIFF_INLINE_LAYOUT_MEDIA_QUERY);
  const createSplitView = useSplitViewStore((store) => store.createFromThread);
  const createSplitViewFromDrop = useSplitViewStore((store) => store.createFromDrop);
  const panelState = useSingleChatPanelStore(selectSingleChatPanelState(props.threadId));
  const setThreadPanelState = useSingleChatPanelStore((store) => store.setThreadPanelState);
  const activePanel = panelState.panel;
  const panelOpen = activePanel !== null;
  const lastAppliedRoutePanelSearchKeyRef = useRef<string | null>(null);
  const hasNormalizedAutoRestoredBrowserPanelRef = useRef(false);
  useEffect(() => {
    hasNormalizedAutoRestoredBrowserPanelRef.current = false;
  }, [props.threadId]);
  const updatePanelState = useCallback(
    (patch: Partial<Pick<SplitViewPanePanelState, "panel" | "diffTurnId" | "diffFilePath">>) => {
      const nextPanel = patch.panel ?? panelState.panel;
      setThreadPanelState(props.threadId, {
        ...patch,
        hasOpenedPanel: panelState.hasOpenedPanel || nextPanel !== null,
        lastOpenPanel:
          patch.panel === "browser" || patch.panel === "diff"
            ? patch.panel
            : panelState.lastOpenPanel,
      });
    },
    [
      panelState.hasOpenedPanel,
      panelState.lastOpenPanel,
      panelState.panel,
      props.threadId,
      setThreadPanelState,
    ],
  );
  const closePanel = useCallback(() => {
    updatePanelState({ panel: null });
  }, [updatePanelState]);
  const openPanel = useCallback(() => {
    updatePanelState({
      panel: panelState.lastOpenPanel,
      diffTurnId: panelState.lastOpenPanel === "diff" ? panelState.diffTurnId : null,
      diffFilePath: panelState.lastOpenPanel === "diff" ? panelState.diffFilePath : null,
    });
  }, [panelState.diffFilePath, panelState.diffTurnId, panelState.lastOpenPanel, updatePanelState]);
  const handleSplitSurface = useCallback(() => {
    if (!props.projectId) return;
    const splitViewId = createSplitView({
      sourceThreadId: props.threadId,
      ownerProjectId: props.projectId,
    });
    startTransition(() => {
      void navigate({
        to: "/$threadId",
        params: { threadId: props.threadId },
        replace: true,
        search: () => ({ splitViewId }),
      });
    });
  }, [createSplitView, navigate, props.projectId, props.threadId]);

  const handleDropThread = useCallback(
    (payload: { threadId: ThreadIdType; direction: SplitDirection; side: SplitDropSide }) => {
      if (!props.projectId) return;
      if (payload.threadId === props.threadId) return;
      const splitViewId = createSplitViewFromDrop({
        sourceThreadId: props.threadId,
        ownerProjectId: props.projectId,
        droppedThreadId: payload.threadId,
        direction: payload.direction,
        side: payload.side,
      });
      startTransition(() => {
        void navigate({
          to: "/$threadId",
          params: { threadId: payload.threadId },
          replace: true,
          search: () => ({ splitViewId }),
        });
      });
    },
    [createSplitViewFromDrop, navigate, props.projectId, props.threadId],
  );

  useEffect(() => {
    const { nextAppliedSearchKey, panelPatch } = resolveRoutePanelBootstrap({
      scopeId: props.threadId,
      search: props.search,
      lastAppliedSearchKey: lastAppliedRoutePanelSearchKeyRef.current,
    });

    lastAppliedRoutePanelSearchKeyRef.current = nextAppliedSearchKey;
    if (!panelPatch) {
      return;
    }

    updatePanelState(panelPatch);
    void navigate({
      to: "/$threadId",
      params: { threadId: props.threadId },
      replace: true,
      search: (previous) => stripDiffSearchParams(previous),
    });
  }, [navigate, props.search, props.threadId, updatePanelState]);

  useEffect(() => {
    const onMenuAction = tauriBridge.onMenuAction;
    if (typeof onMenuAction !== "function") {
      return;
    }

    const unsubscribe = onMenuAction((action) => {
      if (action !== "toggle-browser") return;
      updatePanelState(resolveToggledChatPanelPatch(panelState, "browser"));
    });

    return () => {
      unsubscribe?.();
    };
  }, [panelState, updatePanelState]);

  useEffect(() => {
    if (hasNormalizedAutoRestoredBrowserPanelRef.current) {
      return;
    }

    hasNormalizedAutoRestoredBrowserPanelRef.current = true;
    const routeExplicitlyRequestsBrowserPanel = props.search.panel === "browser";
    if (routeExplicitlyRequestsBrowserPanel || activePanel !== "browser") {
      return;
    }

    // Reopening the browser should be explicit: route search, user toggle, or browser-use request.
    updatePanelState({ panel: null });
  }, [activePanel, props.search.panel, updatePanelState]);

  useEffect(() => {
    const onOpenBrowserPanelRequest = tauriBridge.browser.onBrowserUseOpenPanelRequest;
    if (typeof onOpenBrowserPanelRequest !== "function") {
      return;
    }

    const unsubscribe = onOpenBrowserPanelRequest(() => {
      updatePanelState({ panel: "browser" });
    });

    return () => {
      unsubscribe?.();
    };
  }, [updatePanelState]);

  const shouldRenderPanelContent = activePanel !== null && (panelOpen || panelState.hasOpenedPanel);

  const excludedThreadIds = useMemo(
    () => new Set<ThreadIdType>([props.threadId]),
    [props.threadId],
  );

  if (!shouldUseDiffSheet || activePanel === "browser") {
    return (
      <div className="flex h-dvh min-h-0 min-w-0 flex-1 overflow-hidden bg-background">
        <ChatPaneDropOverlay
          canDropInDirection={allowAnySplitDirection}
          excludedThreadIds={excludedThreadIds}
          onDrop={handleDropThread}
          className="flex h-full min-h-0 min-w-0 flex-1"
        >
          <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none text-foreground">
            <DeferredChatView
              threadId={props.threadId}
              paneScopeId="single"
              deferMount={false}
              surfaceMode="single"
              isFocusedPane
              panelState={panelState}
              onToggleDiff={() =>
                updatePanelState(resolveToggledChatPanelPatch(panelState, "diff"))
              }
              onToggleBrowser={() =>
                updatePanelState(resolveToggledChatPanelPatch(panelState, "browser"))
              }
              onOpenTurnDiff={(turnId, filePath) =>
                updatePanelState({
                  panel: "diff",
                  diffTurnId: turnId,
                  diffFilePath: filePath ?? null,
                })
              }
              onSplitSurface={handleSplitSurface}
            />
          </SidebarInset>
        </ChatPaneDropOverlay>
        <PanePanelInlineSidebar
          panelOpen={panelOpen}
          onClosePanel={closePanel}
          onOpenPanel={openPanel}
          renderPanelContent={shouldRenderPanelContent}
          panel={activePanel}
          threadId={props.threadId}
          panelState={panelState}
          onUpdatePanelState={updatePanelState}
        />
      </div>
    );
  }

  return (
    <>
      <ChatPaneDropOverlay
        canDropInDirection={allowAnySplitDirection}
        excludedThreadIds={excludedThreadIds}
        onDrop={handleDropThread}
        className="flex h-dvh min-h-0 min-w-0 flex-1"
      >
        <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none text-foreground">
          <DeferredChatView
            threadId={props.threadId}
            paneScopeId="single"
            deferMount={false}
            surfaceMode="single"
            isFocusedPane
            panelState={panelState}
            onToggleDiff={() => updatePanelState(resolveToggledChatPanelPatch(panelState, "diff"))}
            onToggleBrowser={() =>
              updatePanelState(resolveToggledChatPanelPatch(panelState, "browser"))
            }
            onOpenTurnDiff={(turnId, filePath) =>
              updatePanelState({
                panel: "diff",
                diffTurnId: turnId,
                diffFilePath: filePath ?? null,
              })
            }
            onSplitSurface={handleSplitSurface}
          />
        </SidebarInset>
      </ChatPaneDropOverlay>
      <RightPanelSheet panelOpen={panelOpen} onClosePanel={closePanel}>
        {shouldRenderPanelContent ? (
          <LazyDiffPanel
            mode="sheet"
            threadId={props.threadId}
            panelState={panelState}
            onUpdatePanelState={updatePanelState}
            onClosePanel={closePanel}
          />
        ) : null}
      </RightPanelSheet>
    </>
  );
}

/**
 * 閼卞﹤銇夌痪璺ㄢ柤鐠侯垳鏁辩憴鍡楁禈缂佸嫪娆? * @description 鐠侯垳鏁辩€圭懓娅掗惃鍕瘜缂佸嫪娆㈤敍灞剧壌閹诡喛鐭鹃悽鍗炲棘閺佹澘鍠呯€规碍瑕嗛弻鎾冲礋閼卞﹨绻曢弰顖氬瀻閸撹尪顫嬮??? */
function ChatThreadRouteView() {
  const threadsHydrated = useStore((store) => store.threadsHydrated);
  const threadId = Route.useParams({
    select: (params) => ThreadId.makeUnsafe(params.threadId),
  });
  const search = Route.useSearch();
  const threadProjectIdSelector = useMemo(
    () => createThreadProjectIdSelector(threadId),
    [threadId],
  );
  const threadExistsSelector = useMemo(() => createThreadExistsSelector(threadId), [threadId]);
  const threadProjectId: ProjectId | null = useStore(threadProjectIdSelector);
  const threadExists = useStore(threadExistsSelector);
  const draftThreadState = useComposerDraftStore(
    (store) => store.draftThreadsByThreadId[threadId] ?? null,
  );
  const draftThreadExists = draftThreadState !== null;
  const routeThreadExists = threadExists || draftThreadExists;
  const splitView = useSplitViewStore(selectSplitView(search.splitViewId ?? null));
  const splitViewsHydrated = useSplitViewStore((store) => store.hasHydrated);
  const activeProjectId = resolveSingleProjectId({
    threadProjectId,
    draftProjectId: draftThreadState?.projectId ?? null,
  });
  const navigate = useNavigate();

  useEffect(() => {
    if (!threadsHydrated || !splitViewsHydrated) {
      return;
    }

    if (isSplitRoute(search)) {
      if (!splitView) {
        void navigate({
          to: "/$threadId",
          params: { threadId },
          replace: true,
          search: (previous) => ({ ...stripDiffSearchParams(previous), splitViewId: undefined }),
        });
      }
      return;
    }

    if (!routeThreadExists) {
      void navigate({ to: "/", replace: true });
    }
  }, [
    navigate,
    routeThreadExists,
    search,
    splitView,
    splitViewsHydrated,
    threadId,
    threadsHydrated,
  ]);

  if (!threadsHydrated || !splitViewsHydrated) {
    return <ChatMountSkeleton />;
  }

  if (splitView && search.splitViewId) {
    return <SplitChatSurface splitViewId={search.splitViewId} routeThreadId={threadId} />;
  }

  if (!routeThreadExists) {
    return <ChatMountSkeleton />;
  }

  return <SingleChatSurface threadId={threadId} search={search} projectId={activeProjectId} />;
}

/**
 * 閼卞﹤銇夌痪璺ㄢ柤鐠侯垳鏁辩€规矮绠? * @description 鐎规矮绠?/_chat/$threadId 鐠侯垳鏁遍敍灞炬暜閹镐礁妯婂鍌炴桨閺夎法娴夐崗宕囨畱閹兼粎鍌ㄩ崣鍌涙殶妤犲矁鐦? */
export const Route = createFileRoute("/_chat/$threadId")({
  validateSearch: (search) => parseDiffRouteSearch(search),
  component: ChatThreadRouteView,
});
