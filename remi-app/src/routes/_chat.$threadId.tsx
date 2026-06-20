/**
 * @file 聊天线程路由容器模块
 * @description 将活跃的线程路由解析为单聊天界面或持久化的分割视图
 * @layer 路由容器层
 * @depends ChatView, splitViewStore, splitView.logic, ChatPaneDropOverlay, 以及面板作用域的浏览器/差异对比面板
 */

import {
  type ProviderKind,
  type ProjectId,
  ThreadId,
  type ThreadId as ThreadIdType,
  type TurnId,
} from "@remi-code/contracts";
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
/** 差异对比内联布局的媒体查询断点：当视口宽度 ≤ 1180px 时，差异面板以 Sheet 形式展示 */
const DIFF_INLINE_LAYOUT_MEDIA_QUERY = "(max-width: 1180px)";
/** 差异面板内联宽度：固定左侧边栏后，取视口 50% 并限制在 28rem ~ 44rem 之间 */
const DIFF_INLINE_DEFAULT_WIDTH = "clamp(28rem, calc(50vw - 8rem), 44rem)";
/** 浏览器面板内联默认宽度：占父容器 50% */
const BROWSER_INLINE_DEFAULT_WIDTH = "50%";
/** 分割视图中面板默认宽度（22rem，以 px 计） */
const SPLIT_PANE_PANEL_DEFAULT_WIDTH_PX = 22 * 16;
/** 分割视图中浏览器面板默认宽度（30rem，以 px 计） */
const BROWSER_SPLIT_PANE_PANEL_DEFAULT_WIDTH_PX = 30 * 16;
/** 分割视图中聊天区域最小宽度（20rem），面板扩展时不得侵占此空间 */
const SPLIT_PANE_CHAT_MIN_WIDTH = 20 * 16;
/** 单聊模式下右侧面板最小宽度（26rem） */
const SINGLE_PANEL_MIN_WIDTH = 26 * 16;
/** 浏览器面板最小宽度（21rem） */
const BROWSER_PANEL_MIN_WIDTH = 21 * 16;
/** 输入框紧凑模式下左侧控件最小宽度，用于判断面板是否导致溢出 */
const COMPOSER_COMPACT_MIN_LEFT_CONTROLS_WIDTH_PX = 208;
/** 右侧面板宽度持久化到 localStorage 的键名前缀 */
const RIGHT_PANEL_SIDEBAR_WIDTH_STORAGE_KEY = "chat_right_panel_width";
/** 面板拖拽调整大小时用于跨 iframe/WebView 同步的自定义事件名 */
const PANEL_RESIZE_OVERLAY_SYNC_EVENT = "remicode:panel-resize-overlay-sync";
/** 分割比例下限（25%），防止某侧被压缩到不可见 */
const SPLIT_RATIO_MIN = 0.25;
/** 分割比例上限（75%），防止某侧被压缩到不可见 */
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
 * 差异面板懒加载的加载占位组件
 * @description 在 DiffPanel 代码块加载完成前展示骨架屏
 * @param props.mode - 面板模式（sidebar / sheet）
 */
const DiffLoadingFallback = (props: { mode: DiffPanelMode }) => {
  return (
    <DiffPanelShell mode={props.mode} header={<DiffPanelHeaderSkeleton />}>
      <DiffPanelLoadingState label="Loading diff viewer..." />
    </DiffPanelShell>
  );
};

/**
 * 懒加载的差异面板组件
 * @description 包裹 DiffWorkerPoolProvider 和 Suspense，实现差异面板的按需加载
 * @param props.mode - 面板展示模式（sidebar / sheet）
 * @param props.threadId - 当前线程 ID
 * @param props.panelState - 面板状态（面板类型、差异轮次、文件路径）
 * @param props.onUpdatePanelState - 面板状态更新回调
 * @param props.onClosePanel - 关闭面板回调
 * @param props.liveRefreshEnabled - 是否启用实时刷新
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
 * 检查输入框是否能处理指定的面板宽度
 * @description 通过临时调整宽度并检测是否溢出，判断面板宽度是否可行
 * @param input.nextWidth - 目标宽度（像素）
 * @param input.paneScopeId - 面板作用域 ID（用于定位特定输入框）
 * @param input.applyWidth - 应用宽度的回调
 * @param input.resetWidth - 重置宽度的回调
 * @returns 如果输入框可以处理该宽度则返回 true，否则返回 false
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
 * 创建面板调整大小的全屏覆盖层
 * @description Tauri <webview> 在拖拽时可能会吞掉 pointermove 事件；此覆盖层确保 React 层能持续接收事件
 * @returns 创建的覆盖层 DOM 元素
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
 * 移除面板调整大小的覆盖层
 * @param overlay - 要移除的覆盖层元素
 */
function removePanelResizeOverlay(overlay: HTMLDivElement): void {
  overlay.remove();
  window.dispatchEvent(new Event(PANEL_RESIZE_OVERLAY_SYNC_EVENT));
}

/**
 * 面板内联侧边栏组件
 * @description 在单聊模式下展示差异对比或浏览器面板的内联侧边栏，支持拖拽调整宽度
 * @param props.panelOpen - 面板是否打开
 * @param props.onClosePanel - 关闭面板回调
 * @param props.onOpenPanel - 打开面板回调
 * @param props.renderPanelContent - 是否渲染面板内容
 * @param props.panel - 面板类型（browser / diff / null）
 * @param props.threadId - 当前线程 ID
 * @param props.paneScopeId - 面板作用域 ID
 * @param props.panelState - 面板状态
 * @param props.onUpdatePanelState - 面板状态更新回调
 */
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
 * 分割视图中嵌入的面板组件
 * @description 分割面板无法复用桌面版 Sidebar 原语（因为它相对于视口定位），此组件将浏览器/差异内容锚定到具体窗格
 * @param props.splitViewId - 分割视图 ID
 * @param props.paneId - 窗格 ID
 * @param props.paneScopeId - 窗格作用域 ID
 * @param props.panelOpen - 面板是否打开
 * @param props.panel - 面板类型
 * @param props.threadId - 当前线程 ID
 * @param props.onClosePanel - 关闭面板回调
 * @param props.panelState - 面板状态
 * @param props.isFocused - 是否聚焦
 * @param props.onUpdatePanelState - 面板状态更新回调
 */
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
 * 解析单一项目 ID
 * @description 优先返回线程关联的项目 ID，其次返回草稿项目 ID
 * @param input.threadProjectId - 线程关联的项目 ID
 * @param input.draftProjectId - 草稿项目 ID
 * @returns 解析后的项目 ID，若无则返回 null
 */
function resolveSingleProjectId(input: {
  threadProjectId: ProjectId | null;
  draftProjectId: ProjectId | null;
}): ProjectId | null {
  return input.threadProjectId ?? input.draftProjectId ?? null;
}

/**
 * 将面板状态标准化为路由搜索参数
 * @description 将面板状态转换为 URL 查询参数格式
 * @param panelState - 面板状态
 * @returns 路由搜索参数对象
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
 * 分割视图空状态组件
 * @description 当分割窗格中没有线程时展示的选择器界面
 * @param props.isFocused - 是否聚焦
 * @param props.onFocus - 聚焦回调
 * @param props.threads - 可选线程列表
 * @param props.projects - 项目列表
 * @param props.excludedThreadIds - 已排除的线程 ID 集合
 * @param props.onSelectThread - 选择线程回调
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
                    : "border-[color:var(--color-border-light)] hover:bg-[var(--sidebar-accent)]",
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
 * 分割线组件
 * @description 可拖拽的分割线，支持水平和垂直方向，拖拽时显示视觉引导线
 * @param props.splitNodeId - 分割节点 ID
 * @param props.direction - 分割方向（horizontal / vertical）
 * @param props.onSetRatio - 设置分割比例的回调
 */
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
 * 窗格渲染器组件
 * @description 递归渲染分割视图的树形结构，处理叶子节点和分割节点
 * @param props.pane - 当前窗格节点
 * @param props.splitView - 分割视图对象
 * @param props.renderLeaf - 叶子节点渲染函数
 * @param props.onSetRatio - 设置分割比例的回调
 */
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
 * 聊天界面挂载骨架屏组件
 * @description 在 ChatView 组件挂载期间展示占位 UI，模拟真实聊天界面的布局结构
 */
function ChatMountSkeleton() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background text-foreground [contain:layout_style_paint]">
      {/* Mirrors the real chat shell so route changes paint immediately while ChatView mounts
          on the next frames. */}
      <div className="flex h-[52px] shrink-0 items-center gap-3 border-b border-[color:var(--color-border-light)] px-4">
        <div className="size-5 rounded-full bg-muted" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="h-3.5 w-44 max-w-[48%] rounded-full bg-muted" />
          <div className="h-2 w-24 max-w-[32%] rounded-full bg-muted/65" />
        </div>
        <div className="hidden items-center gap-1.5 sm:flex">
          <div className="size-7 rounded-md border border-[color:var(--color-border-light)] bg-muted/35" />
          <div className="size-7 rounded-md border border-[color:var(--color-border-light)] bg-muted/35" />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col justify-end gap-3 px-5 py-4">
        <div className="max-w-[82%] space-y-2 rounded-2xl border border-[color:var(--color-border-light)] bg-muted/22 p-3">
          <div className="h-2.5 w-11/12 rounded-full bg-muted/75" />
          <div className="h-2.5 w-7/12 rounded-full bg-muted/60" />
        </div>
        <div className="ml-auto max-w-[70%] space-y-2 rounded-2xl bg-muted/45 p-3">
          <div className="h-2.5 w-48 max-w-full rounded-full bg-muted-foreground/14" />
          <div className="h-2.5 w-32 max-w-[78%] rounded-full bg-muted-foreground/12" />
        </div>
        <div className="max-w-[88%] space-y-2 rounded-2xl border border-[color:var(--color-border-light)] bg-muted/22 p-3">
          <div className="h-2.5 w-full rounded-full bg-muted/75" />
          <div className="h-2.5 w-10/12 rounded-full bg-muted/60" />
          <div className="h-2.5 w-5/12 rounded-full bg-muted/50" />
        </div>
      </div>
      <div className="shrink-0 border-t border-[color:var(--color-border-light)] p-3">
        <div className="rounded-2xl border border-[color:var(--color-border-light)] bg-background p-3 shadow-xs">
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
 * 延迟挂载的聊天视图组件
 * @description 通过双 requestAnimationFrame 延迟挂载，避免路由切换时的卡顿
 * @param props.threadId - 线程 ID
 * @param props.paneScopeId - 窗格作用域 ID
 * @param props.deferMount - 是否延迟挂载
 * @param props.surfaceMode - 表面模式（single / split）
 * @param props.isFocusedPane - 是否聚焦窗格
 * @param props.panelState - 面板状态
 * @param props.onToggleDiff - 切换差异面板回调
 * @param props.onToggleBrowser - 切换浏览器面板回调
 * @param props.onOpenTurnDiff - 打开轮次差异回调
 * @param props.onSplitSurface - 分割表面回调
 * @param props.onMaximize - 最大化回调
 * @param props.onChangeThread - 切换线程回调
 * @param props.onCloseThreadPane - 关闭线程面板回调
 * @param props.onMounted - 挂载完成回调
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
 * 分割视图窗格表面组件
 * @description 单个分割窗格的完整容器，包含聊天视图、面板、拖放覆盖层等
 * @param props.splitView - 分割视图对象
 * @param props.paneId - 窗格 ID
 * @param props.threadId - 线程 ID
 * @param props.panelState - 面板状态
 * @param props.isFocused - 是否聚焦
 * @param props.deferChatMount - 是否延迟挂载聊天视图
 * @param props.canDropInDirection - 判断是否可在指定方向拖放
 * @param props.excludedThreadIds - 已排除的线程 ID 集合
 * @param props.threads - 可选线程列表
 * @param props.projects - 项目列表
 * @param props.onFocus - 聚焦回调
 * @param props.onToggleDiff - 切换差异面板回调
 * @param props.onToggleBrowser - 切换浏览器面板回调
 * @param props.onOpenTurnDiff - 打开轮次差异回调
 * @param props.onClosePanel - 关闭面板回调
 * @param props.onUpdatePanelState - 面板状态更新回调
 * @param props.onMaximize - 最大化回调
 * @param props.onCloseThreadPane - 关闭线程面板回调
 * @param props.onChooseThread - 选择线程回调
 * @param props.onSelectThread - 选择线程回调
 * @param props.onChatMounted - 聊天挂载完成回调
 * @param props.onDropThread - 拖放线程回调
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
        "group relative flex min-h-0 min-w-0 flex-1 bg-background [contain:layout_style_paint]",
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
          className="pointer-events-none absolute inset-0 z-10 bg-foreground/[0.060] transition-opacity duration-150"
        />
      ) : null}
    </div>
  );
}

/**
 * 分割聊天表面组件
 * @description 管理整个分割视图的生命周期和交互，包括窗格聚焦、线程切换、面板控制等
 * @param props.splitViewId - 分割视图 ID
 * @param props.routeThreadId - 路由中的线程 ID
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
                        ? "border-[color:var(--color-border)] bg-[var(--sidebar-accent)]"
                        : "border-[color:var(--color-border-light)] hover:bg-[var(--sidebar-accent)]",
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
 * 单聊表面组件
 * @description 管理单聊模式下的聊天视图、右侧面板、分割视图创建等
 * @param props.threadId - 线程 ID
 * @param props.search - 路由搜索参数
 * @param props.projectId - 项目 ID
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
 * 聊天线程路由视图组件
 * @description 路由容器的主组件，根据路由参数决定渲染单聊还是分割视图
 */
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
 * 聊天线程路由定义
 * @description 定义 /_chat/$threadId 路由，支持差异面板相关的搜索参数验证
 */
export const Route = createFileRoute("/_chat/$threadId")({
  validateSearch: (search) => parseDiffRouteSearch(search),
  component: ChatThreadRouteView,
});
