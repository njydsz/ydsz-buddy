/**
 * @file 鑱婂ぉ绾跨▼璺敱瀹瑰櫒妯″潡
 * @description 灏嗘椿璺冪殑绾跨▼璺敱瑙ｆ瀽涓哄崟鑱婂ぉ鐣岄潰鎴栨寔涔呭寲鐨勫垎鍓茶鍥? * @layer 璺敱瀹瑰櫒灞? * @depends ChatView, splitViewStore, splitView.logic, ChatPaneDropOverlay, 浠ュ強闈㈡澘浣滅敤鍩熺殑娴忚鍣?宸紓瀵规瘮闈㈡澘
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
/** 宸紓瀵规瘮鍐呰仈甯冨眬鐨勫獟浣撴煡璇㈡柇鐐癸細褰撹鍙ｅ搴?鈮?1180px 鏃讹紝宸紓闈㈡澘浠?Sheet 褰㈠紡灞曠ず */
const DIFF_INLINE_LAYOUT_MEDIA_QUERY = "(max-width: 1180px)";
/** 宸紓闈㈡澘鍐呰仈瀹藉害锛氬浐瀹氬乏渚ц竟鏍忓悗锛屽彇瑙嗗彛 50% 骞堕檺鍒跺湪 28rem ~ 44rem 涔嬮棿 */
const DIFF_INLINE_DEFAULT_WIDTH = "clamp(28rem, calc(50vw - 8rem), 44rem)";
/** 娴忚鍣ㄩ潰鏉垮唴鑱旈粯璁ゅ搴︼細鍗犵埗瀹瑰櫒 50% */
const BROWSER_INLINE_DEFAULT_WIDTH = "50%";
/** 鍒嗗壊瑙嗗浘涓潰鏉块粯璁ゅ搴︼紙22rem锛屼互 px 璁★級 */
const SPLIT_PANE_PANEL_DEFAULT_WIDTH_PX = 22 * 16;
/** 鍒嗗壊瑙嗗浘涓祻瑙堝櫒闈㈡澘榛樿瀹藉害锛?0rem锛屼互 px 璁★級 */
const BROWSER_SPLIT_PANE_PANEL_DEFAULT_WIDTH_PX = 30 * 16;
/** 鍒嗗壊瑙嗗浘涓亰澶╁尯鍩熸渶灏忓搴︼紙20rem锛夛紝闈㈡澘鎵╁睍鏃朵笉寰椾镜鍗犳绌洪棿 */
const SPLIT_PANE_CHAT_MIN_WIDTH = 20 * 16;
/** 鍗曡亰妯″紡涓嬪彸渚ч潰鏉挎渶灏忓搴︼紙26rem锛?*/
const SINGLE_PANEL_MIN_WIDTH = 26 * 16;
/** 娴忚鍣ㄩ潰鏉挎渶灏忓搴︼紙21rem锛?*/
const BROWSER_PANEL_MIN_WIDTH = 21 * 16;
/** 杈撳叆妗嗙揣鍑戞ā寮忎笅宸︿晶鎺т欢鏈€灏忓搴︼紝鐢ㄤ簬鍒ゆ柇闈㈡澘鏄惁瀵艰嚧婧㈠嚭 */
const COMPOSER_COMPACT_MIN_LEFT_CONTROLS_WIDTH_PX = 208;
/** 鍙充晶闈㈡澘瀹藉害鎸佷箙鍖栧埌 localStorage 鐨勯敭鍚嶅墠缂€ */
const RIGHT_PANEL_SIDEBAR_WIDTH_STORAGE_KEY = "chat_right_panel_width";
/** 闈㈡澘鎷栨嫿璋冩暣澶у皬鏃剁敤浜庤法 iframe/WebView 鍚屾鐨勮嚜瀹氫箟浜嬩欢鍚?*/
const PANEL_RESIZE_OVERLAY_SYNC_EVENT = "remicode:panel-resize-overlay-sync";
/** 鍒嗗壊姣斾緥涓嬮檺锛?5%锛夛紝闃叉鏌愪晶琚帇缂╁埌涓嶅彲瑙?*/
const SPLIT_RATIO_MIN = 0.25;
/** 鍒嗗壊姣斾緥涓婇檺锛?5%锛夛紝闃叉鏌愪晶琚帇缂╁埌涓嶅彲瑙?*/
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
 * 宸紓闈㈡澘鎳掑姞杞界殑鍔犺浇鍗犱綅缁勪欢
 * @description 鍦?DiffPanel 浠ｇ爜鍧楀姞杞藉畬鎴愬墠灞曠ず楠ㄦ灦灞? * @param props.mode - 闈㈡澘妯″紡锛坰idebar / sheet锛? */
const DiffLoadingFallback = (props: { mode: DiffPanelMode }) => {
  return (
    <DiffPanelShell mode={props.mode} header={<DiffPanelHeaderSkeleton />}>
      <DiffPanelLoadingState label="Loading diff viewer..." />
    </DiffPanelShell>
  );
};

/**
 * 鎳掑姞杞界殑宸紓闈㈡澘缁勪欢
 * @description 鍖呰９ DiffWorkerPoolProvider 鍜?Suspense锛屽疄鐜板樊寮傞潰鏉跨殑鎸夐渶鍔犺浇
 * @param props.mode - 闈㈡澘灞曠ず妯″紡锛坰idebar / sheet锛? * @param props.threadId - 褰撳墠绾跨▼ ID
 * @param props.panelState - 闈㈡澘鐘舵€侊紙闈㈡澘绫诲瀷銆佸樊寮傝疆娆°€佹枃浠惰矾寰勶級
 * @param props.onUpdatePanelState - 闈㈡澘鐘舵€佹洿鏂板洖璋? * @param props.onClosePanel - 鍏抽棴闈㈡澘鍥炶皟
 * @param props.liveRefreshEnabled - 鏄惁鍚敤瀹炴椂鍒锋柊
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
 * 妫€鏌ヨ緭鍏ユ鏄惁鑳藉鐞嗘寚瀹氱殑闈㈡澘瀹藉害
 * @description 閫氳繃涓存椂璋冩暣瀹藉害骞舵娴嬫槸鍚︽孩鍑猴紝鍒ゆ柇闈㈡澘瀹藉害鏄惁鍙
 * @param input.nextWidth - 鐩爣瀹藉害锛堝儚绱狅級
 * @param input.paneScopeId - 闈㈡澘浣滅敤鍩?ID锛堢敤浜庡畾浣嶇壒瀹氳緭鍏ユ锛? * @param input.applyWidth - 搴旂敤瀹藉害鐨勫洖璋? * @param input.resetWidth - 閲嶇疆瀹藉害鐨勫洖璋? * @returns 濡傛灉杈撳叆妗嗗彲浠ュ鐞嗚瀹藉害鍒欒繑鍥?true锛屽惁鍒欒繑鍥?false
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
 * 鍒涘缓闈㈡澘璋冩暣澶у皬鐨勫叏灞忚鐩栧眰
 * @description Tauri <webview> 鍦ㄦ嫋鎷芥椂鍙兘浼氬悶鎺?pointermove 浜嬩欢锛涙瑕嗙洊灞傜‘淇?React 灞傝兘鎸佺画鎺ユ敹浜嬩欢
 * @returns 鍒涘缓鐨勮鐩栧眰 DOM 鍏冪礌
 */
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
 * 绉婚櫎闈㈡澘璋冩暣澶у皬鐨勮鐩栧眰
 * @param overlay - 瑕佺Щ闄ょ殑瑕嗙洊灞傚厓绱? */
function removePanelResizeOverlay(overlay: HTMLDivElement): void {
  overlay.remove();
  window.dispatchEvent(new Event(PANEL_RESIZE_OVERLAY_SYNC_EVENT));
}

/**
 * 闈㈡澘鍐呰仈渚ц竟鏍忕粍浠? * @description 鍦ㄥ崟鑱婃ā寮忎笅灞曠ず宸紓瀵规瘮鎴栨祻瑙堝櫒闈㈡澘鐨勫唴鑱斾晶杈规爮锛屾敮鎸佹嫋鎷借皟鏁村搴? * @param props.panelOpen - 闈㈡澘鏄惁鎵撳紑
 * @param props.onClosePanel - 鍏抽棴闈㈡澘鍥炶皟
 * @param props.onOpenPanel - 鎵撳紑闈㈡澘鍥炶皟
 * @param props.renderPanelContent - 鏄惁娓叉煋闈㈡澘鍐呭
 * @param props.panel - 闈㈡澘绫诲瀷锛坆rowser / diff / null锛? * @param props.threadId - 褰撳墠绾跨▼ ID
 * @param props.paneScopeId - 闈㈡澘浣滅敤鍩?ID
 * @param props.panelState - 闈㈡澘鐘舵€? * @param props.onUpdatePanelState - 闈㈡澘鐘舵€佹洿鏂板洖璋? */
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
 * 鍒嗗壊瑙嗗浘涓祵鍏ョ殑闈㈡澘缁勪欢
 * @description 鍒嗗壊闈㈡澘鏃犳硶澶嶇敤妗岄潰鐗?Sidebar 鍘熻锛堝洜涓哄畠鐩稿浜庤鍙ｅ畾浣嶏級锛屾缁勪欢灏嗘祻瑙堝櫒/宸紓鍐呭閿氬畾鍒板叿浣撶獥鏍? * @param props.splitViewId - 鍒嗗壊瑙嗗浘 ID
 * @param props.paneId - 绐楁牸 ID
 * @param props.paneScopeId - 绐楁牸浣滅敤鍩?ID
 * @param props.panelOpen - 闈㈡澘鏄惁鎵撳紑
 * @param props.panel - 闈㈡澘绫诲瀷
 * @param props.threadId - 褰撳墠绾跨▼ ID
 * @param props.onClosePanel - 鍏抽棴闈㈡澘鍥炶皟
 * @param props.panelState - 闈㈡澘鐘舵€? * @param props.isFocused - 鏄惁鑱氱劍
 * @param props.onUpdatePanelState - 闈㈡澘鐘舵€佹洿鏂板洖璋? */
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
 * 瑙ｆ瀽鍗曚竴椤圭洰 ID
 * @description 浼樺厛杩斿洖绾跨▼鍏宠仈鐨勯」鐩?ID锛屽叾娆¤繑鍥炶崏绋块」鐩?ID
 * @param input.threadProjectId - 绾跨▼鍏宠仈鐨勯」鐩?ID
 * @param input.draftProjectId - 鑽夌ǹ椤圭洰 ID
 * @returns 瑙ｆ瀽鍚庣殑椤圭洰 ID锛岃嫢鏃犲垯杩斿洖 null
 */
function resolveSingleProjectId(input: {
  threadProjectId: ProjectId | null;
  draftProjectId: ProjectId | null;
}): ProjectId | null {
  return input.threadProjectId ?? input.draftProjectId ?? null;
}

/**
 * 灏嗛潰鏉跨姸鎬佹爣鍑嗗寲涓鸿矾鐢辨悳绱㈠弬鏁? * @description 灏嗛潰鏉跨姸鎬佽浆鎹负 URL 鏌ヨ鍙傛暟鏍煎紡
 * @param panelState - 闈㈡澘鐘舵€? * @returns 璺敱鎼滅储鍙傛暟瀵硅薄
 */
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
 * 鍒嗗壊瑙嗗浘绌虹姸鎬佺粍浠? * @description 褰撳垎鍓茬獥鏍间腑娌℃湁绾跨▼鏃跺睍绀虹殑閫夋嫨鍣ㄧ晫闈? * @param props.isFocused - 鏄惁鑱氱劍
 * @param props.onFocus - 鑱氱劍鍥炶皟
 * @param props.threads - 鍙€夌嚎绋嬪垪琛? * @param props.projects - 椤圭洰鍒楄〃
 * @param props.excludedThreadIds - 宸叉帓闄ょ殑绾跨▼ ID 闆嗗悎
 * @param props.onSelectThread - 閫夋嫨绾跨▼鍥炶皟
 */
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
 * 鍒嗗壊绾跨粍浠? * @description 鍙嫋鎷界殑鍒嗗壊绾匡紝鏀寔姘村钩鍜屽瀭鐩存柟鍚戯紝鎷栨嫿鏃舵樉绀鸿瑙夊紩瀵肩嚎
 * @param props.splitNodeId - 鍒嗗壊鑺傜偣 ID
 * @param props.direction - 鍒嗗壊鏂瑰悜锛坔orizontal / vertical锛? * @param props.onSetRatio - 璁剧疆鍒嗗壊姣斾緥鐨勫洖璋? */
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
 * 绐楁牸娓叉煋鍣ㄧ粍浠? * @description 閫掑綊娓叉煋鍒嗗壊瑙嗗浘鐨勬爲褰㈢粨鏋勶紝澶勭悊鍙跺瓙鑺傜偣鍜屽垎鍓茶妭鐐? * @param props.pane - 褰撳墠绐楁牸鑺傜偣
 * @param props.splitView - 鍒嗗壊瑙嗗浘瀵硅薄
 * @param props.renderLeaf - 鍙跺瓙鑺傜偣娓叉煋鍑芥暟
 * @param props.onSetRatio - 璁剧疆鍒嗗壊姣斾緥鐨勫洖璋? */
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
 * 鑱婂ぉ鐣岄潰鎸傝浇楠ㄦ灦灞忕粍浠? * @description 鍦?ChatView 缁勪欢鎸傝浇鏈熼棿灞曠ず鍗犱綅 UI锛屾ā鎷熺湡瀹炶亰澶╃晫闈㈢殑甯冨眬缁撴瀯
 */
function ChatMountSkeleton() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background text-foreground contain-[layout_style_paint]">
      {/* Mirrors the real chat shell so route changes paint immediately while ChatView mounts
          on the next frames. */}
      <div className="flex h-[52px] shrink-0 items-center gap-3 border-b border-(--color-border-light) px-4">
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
 * 寤惰繜鎸傝浇鐨勮亰澶╄鍥剧粍浠? * @description 閫氳繃鍙?requestAnimationFrame 寤惰繜鎸傝浇锛岄伩鍏嶈矾鐢卞垏鎹㈡椂鐨勫崱椤? * @param props.threadId - 绾跨▼ ID
 * @param props.paneScopeId - 绐楁牸浣滅敤鍩?ID
 * @param props.deferMount - 鏄惁寤惰繜鎸傝浇
 * @param props.surfaceMode - 琛ㄩ潰妯″紡锛坰ingle / split锛? * @param props.isFocusedPane - 鏄惁鑱氱劍绐楁牸
 * @param props.panelState - 闈㈡澘鐘舵€? * @param props.onToggleDiff - 鍒囨崲宸紓闈㈡澘鍥炶皟
 * @param props.onToggleBrowser - 鍒囨崲娴忚鍣ㄩ潰鏉垮洖璋? * @param props.onOpenTurnDiff - 鎵撳紑杞宸紓鍥炶皟
 * @param props.onSplitSurface - 鍒嗗壊琛ㄩ潰鍥炶皟
 * @param props.onMaximize - 鏈€澶у寲鍥炶皟
 * @param props.onChangeThread - 鍒囨崲绾跨▼鍥炶皟
 * @param props.onCloseThreadPane - 鍏抽棴绾跨▼闈㈡澘鍥炶皟
 * @param props.onMounted - 鎸傝浇瀹屾垚鍥炶皟
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
 * 鍒嗗壊瑙嗗浘绐楁牸琛ㄩ潰缁勪欢
 * @description 鍗曚釜鍒嗗壊绐楁牸鐨勫畬鏁村鍣紝鍖呭惈鑱婂ぉ瑙嗗浘銆侀潰鏉裤€佹嫋鏀捐鐩栧眰绛? * @param props.splitView - 鍒嗗壊瑙嗗浘瀵硅薄
 * @param props.paneId - 绐楁牸 ID
 * @param props.threadId - 绾跨▼ ID
 * @param props.panelState - 闈㈡澘鐘舵€? * @param props.isFocused - 鏄惁鑱氱劍
 * @param props.deferChatMount - 鏄惁寤惰繜鎸傝浇鑱婂ぉ瑙嗗浘
 * @param props.canDropInDirection - 鍒ゆ柇鏄惁鍙湪鎸囧畾鏂瑰悜鎷栨斁
 * @param props.excludedThreadIds - 宸叉帓闄ょ殑绾跨▼ ID 闆嗗悎
 * @param props.threads - 鍙€夌嚎绋嬪垪琛? * @param props.projects - 椤圭洰鍒楄〃
 * @param props.onFocus - 鑱氱劍鍥炶皟
 * @param props.onToggleDiff - 鍒囨崲宸紓闈㈡澘鍥炶皟
 * @param props.onToggleBrowser - 鍒囨崲娴忚鍣ㄩ潰鏉垮洖璋? * @param props.onOpenTurnDiff - 鎵撳紑杞宸紓鍥炶皟
 * @param props.onClosePanel - 鍏抽棴闈㈡澘鍥炶皟
 * @param props.onUpdatePanelState - 闈㈡澘鐘舵€佹洿鏂板洖璋? * @param props.onMaximize - 鏈€澶у寲鍥炶皟
 * @param props.onCloseThreadPane - 鍏抽棴绾跨▼闈㈡澘鍥炶皟
 * @param props.onChooseThread - 閫夋嫨绾跨▼鍥炶皟
 * @param props.onSelectThread - 閫夋嫨绾跨▼鍥炶皟
 * @param props.onChatMounted - 鑱婂ぉ鎸傝浇瀹屾垚鍥炶皟
 * @param props.onDropThread - 鎷栨斁绾跨▼鍥炶皟
 */
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
 * 鍒嗗壊鑱婂ぉ琛ㄩ潰缁勪欢
 * @description 绠＄悊鏁翠釜鍒嗗壊瑙嗗浘鐨勭敓鍛藉懆鏈熷拰浜や簰锛屽寘鎷獥鏍艰仛鐒︺€佺嚎绋嬪垏鎹€€侀潰鏉挎帶鍒剁瓑
 * @param props.splitViewId - 鍒嗗壊瑙嗗浘 ID
 * @param props.routeThreadId - 璺敱涓殑绾跨▼ ID
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
 * 鍗曡亰琛ㄩ潰缁勪欢
 * @description 绠＄悊鍗曡亰妯″紡涓嬬殑鑱婂ぉ瑙嗗浘銆佸彸渚ч潰鏉裤€佸垎鍓茶鍥惧垱寤虹瓑
 * @param props.threadId - 绾跨▼ ID
 * @param props.search - 璺敱鎼滅储鍙傛暟
 * @param props.projectId - 椤圭洰 ID
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
 * 鑱婂ぉ绾跨▼璺敱瑙嗗浘缁勪欢
 * @description 璺敱瀹瑰櫒鐨勪富缁勪欢锛屾牴鎹矾鐢卞弬鏁板喅瀹氭覆鏌撳崟鑱婅繕鏄垎鍓茶鍥? */
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
 * 鑱婂ぉ绾跨▼璺敱瀹氫箟
 * @description 瀹氫箟 /_chat/$threadId 璺敱锛屾敮鎸佸樊寮傞潰鏉跨浉鍏崇殑鎼滅储鍙傛暟楠岃瘉
 */
export const Route = createFileRoute("/_chat/$threadId")({
  validateSearch: (search) => parseDiffRouteSearch(search),
  component: ChatThreadRouteView,
});
