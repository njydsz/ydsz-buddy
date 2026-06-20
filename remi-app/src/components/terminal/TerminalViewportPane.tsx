/**
 * @file TerminalViewportPane.tsx
 * @description 终端视口面板组件，渲染活跃终端面板树，支持嵌套分屏和面板内标签栏。
 * 属于终端展示组件层，通过外部传入的 renderViewport 回调渲染 xterm 视口，
 * 使 xterm 生命周期管理保持在外部。
 */

import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";

import type { ResolvedTerminalVisualIdentity } from "~/shared/terminalThreads";

import {
  Maximize2,
  Minimize2,
  Plus,
  SquareSplitHorizontal,
  SquareSplitVertical,
  TerminalSquareIcon,
  Trash2,
  XIcon,
} from "~/lib/icons";
import { cn } from "~/lib/utils";

import type {
  ThreadTerminalLayoutNode,
  ThreadTerminalPresentationMode,
  ThreadTerminalSplitNode,
} from "../../types";
import TerminalActivityIndicator from "./TerminalActivityIndicator";
import TerminalIdentityIcon from "./TerminalIdentityIcon";

/** 终端面板最小尺寸（像素），防止面板被拖拽到过小 */
const MIN_TERMINAL_PANE_SIZE_PX = 180;

/**
 * 终端视口面板组件的 Props 接口。
 */
interface TerminalViewportPaneProps {
  /** 所属分组 ID */
  groupId: string;
  /** 面板布局节点树 */
  layout: ThreadTerminalLayoutNode;
  /** 当前活跃的终端 ID */
  resolvedActiveTerminalId: string;
  /** 终端 ID 到视觉标识的映射 */
  terminalVisualIdentityById: ReadonlyMap<string, ResolvedTerminalVisualIdentity>;
  /** 切换活跃终端的回调 */
  onActiveTerminalChange: (terminalId: string) => void;
  /** 分屏权重调整回调 */
  onResizeSplit: (groupId: string, splitId: string, weights: number[]) => void;
  /** 终端视口渲染回调，由外部提供以解耦 xterm 生命周期 */
  renderViewport: (
    terminalId: string,
    options: { autoFocus: boolean; isVisible: boolean },
  ) => ReactNode;
  /** 向右分屏回调 */
  onSplitTerminalRight?: ((terminalId: string) => void) | undefined;
  /** 向下分屏回调 */
  onSplitTerminalDown?: ((terminalId: string) => void) | undefined;
  /** 新建终端标签页回调 */
  onNewTerminalTab?: ((terminalId: string) => void) | undefined;
  /** 将终端移至独立分组回调 */
  onMoveTerminalToGroup?: ((terminalId: string) => void) | undefined;
  /** 关闭终端回调 */
  onCloseTerminal?: ((terminalId: string) => void) | undefined;
  /** 终端展示模式 */
  presentationMode: ThreadTerminalPresentationMode;
  /** 切换展示模式回调 */
  onTogglePresentationMode?: (() => void) | undefined;
}

/**
 * 归一化分屏权重数组，将无效值（非有限数或非正数）替换为 1。
 *
 * @param weights - 原始权重数组
 * @returns 归一化后的权重数组
 */
function normalizeWeights(weights: number[]): number[] {
  return weights.map((weight) => (Number.isFinite(weight) && weight > 0 ? weight : 1));
}

/**
 * 根据分屏方向返回分割手柄的样式类名。
 *
 * @param direction - 分屏方向（horizontal/vertical）
 * @returns 对应方向的 CSS 类名字符串
 */
function splitHandleClassName(direction: ThreadTerminalSplitNode["direction"]): string {
  return direction === "horizontal"
    ? "shrink-0 w-px cursor-col-resize bg-border/70 hover:bg-[var(--sidebar-accent)]"
    : "shrink-0 h-px cursor-row-resize bg-border/70 hover:bg-[var(--sidebar-accent)]";
}

/**
 * 判断指定终端是否可以移至独立分组。
 * 当终端所在面板包含多个终端标签时，该终端可移出。
 *
 * @param node - 布局节点树
 * @param terminalId - 待判断的终端 ID
 * @returns 是否可以移至独立分组
 */
function canMoveTerminalToOwnGroup(node: ThreadTerminalLayoutNode, terminalId: string): boolean {
  if (node.type === "terminal") {
    return node.activeTerminalId === terminalId && node.terminalIds.length > 1;
  }

  return node.children.some((child) => {
    if (child.type === "terminal") {
      return child.terminalIds.includes(terminalId);
    }
    return canMoveTerminalToOwnGroup(child, terminalId);
  });
}

/**
 * 面板操作按钮组件，用于渲染标签栏和工具栏中的小型图标按钮。
 *
 * @param props.label - 按钮的 aria-label 和 title 文本
 * @param props.onClick - 点击回调
 * @param props.children - 按钮内容，通常为图标
 * @param props.className - 自定义样式类名
 */
function PaneActionButton(props: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  className?: string | undefined;
}) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center bg-background text-foreground/80 transition-colors hover:bg-[var(--sidebar-accent)] hover:text-foreground",
        props.className,
      )}
      onClick={(event) => {
        event.stopPropagation();
        props.onClick();
      }}
      aria-label={props.label}
      title={props.label}
    >
      {props.children}
    </button>
  );
}

/**
 * 终端视口面板组件。递归渲染终端布局节点树，支持嵌套分屏和面板内标签栏。
 * 每个终端面板包含标签栏（图标、标题、关闭按钮）和终端视口区域，
 * 分屏节点通过可拖拽的分割手柄支持实时调整权重。
 *
 * @param props - 终端视口面板组件的属性
 */
export default function TerminalViewportPane({
  groupId,
  layout,
  resolvedActiveTerminalId,
  terminalVisualIdentityById,
  onActiveTerminalChange,
  onResizeSplit,
  renderViewport,
  onSplitTerminalRight,
  onSplitTerminalDown,
  onNewTerminalTab,
  onMoveTerminalToGroup,
  onCloseTerminal,
  presentationMode,
  onTogglePresentationMode,
}: TerminalViewportPaneProps) {
  const renderNode = (node: ThreadTerminalLayoutNode): ReactNode => {
    if (node.type === "terminal") {
      const activePaneTerminalId = node.terminalIds.includes(node.activeTerminalId)
        ? node.activeTerminalId
        : (node.terminalIds[0] ?? resolvedActiveTerminalId);
      const isFocusedPane = activePaneTerminalId === resolvedActiveTerminalId;
      const canMoveActiveTerminalToGroup =
        !!onMoveTerminalToGroup && canMoveTerminalToOwnGroup(layout, activePaneTerminalId);
      const moveActiveTerminalToGroup = () => {
        if (!onMoveTerminalToGroup) return;
        onMoveTerminalToGroup(activePaneTerminalId);
      };

      return (
        <div
          key={node.paneId}
          className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background"
          onMouseDown={() => {
            if (!isFocusedPane) {
              onActiveTerminalChange(activePaneTerminalId);
            }
          }}
        >
          <div className="flex h-8 min-h-8 items-stretch bg-background">
            <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {node.terminalIds.map((terminalId, index) => {
                const visualIdentity = terminalVisualIdentityById.get(terminalId);
                const isActiveTab = terminalId === activePaneTerminalId;
                const closeTabLabel = `Close ${visualIdentity?.title ?? "terminal"}`;

                return (
                  <div
                    key={terminalId}
                    className={cn(
                      "group/tab relative flex h-full shrink-0 items-stretch border-r border-border/70",
                      index === 0 ? "border-l-0" : "",
                      isActiveTab && isFocusedPane
                        ? "shadow-[inset_0_1px_0_var(--color-text-foreground)] bg-background text-foreground"
                        : isActiveTab
                          ? "shadow-[inset_0_1px_0_color-mix(in_srgb,var(--color-text-foreground)_35%,transparent)] bg-background text-foreground"
                          : "border-b border-border/70 bg-muted/25 text-muted-foreground hover:bg-[var(--sidebar-accent)] hover:text-foreground",
                    )}
                  >
                    <button
                      type="button"
                      className="flex min-w-0 items-center gap-1.5 px-2 text-left"
                      onClick={(event) => {
                        event.stopPropagation();
                        onActiveTerminalChange(terminalId);
                      }}
                    >
                      <TerminalIdentityIcon
                        className="size-3 shrink-0"
                        iconKey={visualIdentity?.iconKey ?? "terminal"}
                      />
                      {visualIdentity && visualIdentity.state !== "idle" ? (
                        <TerminalActivityIndicator
                          className="text-foreground/70"
                          state={visualIdentity.state}
                        />
                      ) : null}
                      <span className="max-w-40 truncate text-[11px] leading-4">
                        {visualIdentity?.title ?? "Terminal"}
                      </span>
                    </button>
                    {onCloseTerminal ? (
                      <button
                        type="button"
                        className="inline-flex w-6 items-center justify-center text-muted-foreground/80 transition-colors hover:bg-background/60 hover:text-foreground"
                        onClick={(event) => {
                          event.stopPropagation();
                          onCloseTerminal(terminalId);
                        }}
                        aria-label={closeTabLabel}
                        title={closeTabLabel}
                      >
                        <XIcon className="size-3" />
                      </button>
                    ) : null}
                  </div>
                );
              })}

              {onNewTerminalTab ? (
                <PaneActionButton
                  label="New terminal tab"
                  onClick={() => onNewTerminalTab(activePaneTerminalId)}
                  className="h-full shrink-0 border-b border-r border-border/70"
                >
                  <Plus className="size-3.25" />
                </PaneActionButton>
              ) : null}
              <div className="min-w-0 flex-1 border-b border-border/70" />
            </div>

            <div className="flex shrink-0 items-stretch divide-x divide-border/70 border-b border-l border-border/70">
              {canMoveActiveTerminalToGroup ? (
                <PaneActionButton
                  label="Move to its own terminal tab"
                  onClick={moveActiveTerminalToGroup}
                >
                  <TerminalSquareIcon className="size-3.25" />
                </PaneActionButton>
              ) : null}
              {onTogglePresentationMode ? (
                <PaneActionButton
                  label={
                    presentationMode === "workspace"
                      ? "Collapse terminal into chat drawer"
                      : "Expand terminal into workspace"
                  }
                  onClick={onTogglePresentationMode}
                >
                  {presentationMode === "workspace" ? (
                    <Minimize2 className="size-3.25" />
                  ) : (
                    <Maximize2 className="size-3.25" />
                  )}
                </PaneActionButton>
              ) : null}
              {onSplitTerminalRight ? (
                <PaneActionButton
                  label="Split right"
                  onClick={() => onSplitTerminalRight(activePaneTerminalId)}
                >
                  <SquareSplitHorizontal className="size-3.25" />
                </PaneActionButton>
              ) : null}
              {onSplitTerminalDown ? (
                <PaneActionButton
                  label="Split down"
                  onClick={() => onSplitTerminalDown(activePaneTerminalId)}
                >
                  <SquareSplitVertical className="size-3.25" />
                </PaneActionButton>
              ) : null}
              {onCloseTerminal ? (
                <PaneActionButton
                  label="Close active terminal tab"
                  onClick={() => onCloseTerminal(activePaneTerminalId)}
                >
                  <Trash2 className="size-3.25" />
                </PaneActionButton>
              ) : null}
            </div>
          </div>

          <div className="relative min-h-0 min-w-0 flex-1 bg-background">
            {node.terminalIds.map((terminalId) => {
              const isActiveTab = terminalId === activePaneTerminalId;
              return (
                <div
                  key={terminalId}
                  className={cn(
                    "absolute inset-0 min-h-0 min-w-0 transition-opacity",
                    isActiveTab ? "z-[1] opacity-100" : "pointer-events-none z-0 opacity-0",
                  )}
                >
                  {renderViewport(terminalId, {
                    autoFocus: isFocusedPane && isActiveTab,
                    isVisible: isActiveTab,
                  })}
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    const weights = normalizeWeights(node.weights);
    const totalWeight =
      weights.reduce((sum, weight) => sum + weight, 0) || node.children.length || 1;

    const beginResize = (
      splitNode: ThreadTerminalSplitNode,
      handleIndex: number,
      event: ReactPointerEvent<HTMLDivElement>,
    ) => {
      event.preventDefault();
      event.stopPropagation();
      const container = event.currentTarget.parentElement;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const totalSize = splitNode.direction === "horizontal" ? rect.width : rect.height;
      if (totalSize <= 0) return;

      const startCoordinate = splitNode.direction === "horizontal" ? event.clientX : event.clientY;
      const startWeights = normalizeWeights(splitNode.weights);
      const currentWeight = startWeights[handleIndex] ?? 1;
      const nextWeight = startWeights[handleIndex + 1] ?? 1;
      const pairWeight = currentWeight + nextWeight;
      const minWeight = Math.max((pairWeight * MIN_TERMINAL_PANE_SIZE_PX) / totalSize, 0.1);

      const onPointerMove = (moveEvent: PointerEvent) => {
        const currentCoordinate =
          splitNode.direction === "horizontal" ? moveEvent.clientX : moveEvent.clientY;
        const delta = currentCoordinate - startCoordinate;
        const deltaWeight = (delta / totalSize) * totalWeight;
        const resizedCurrent = Math.min(
          Math.max(currentWeight + deltaWeight, minWeight),
          pairWeight - minWeight,
        );
        const resizedNext = pairWeight - resizedCurrent;
        const nextWeights = [...startWeights];
        nextWeights[handleIndex] = resizedCurrent;
        nextWeights[handleIndex + 1] = resizedNext;
        onResizeSplit(groupId, splitNode.id, nextWeights);
      };

      const onPointerUp = () => {
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
      };

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp, { once: true });
    };

    return (
      <div
        key={node.id}
        className={cn(
          "flex h-full min-h-0 min-w-0 gap-0 overflow-hidden bg-background",
          node.direction === "horizontal" ? "flex-row" : "flex-col",
        )}
      >
        {node.children.map((child, index) => {
          const childWeight = weights[index] ?? 1;
          return (
            <div key={child.type === "split" ? child.id : child.paneId} className="contents">
              <div
                className="h-full min-h-0 min-w-0"
                style={{
                  flexGrow: childWeight,
                  flexBasis: 0,
                }}
              >
                {renderNode(child)}
              </div>
              {index < node.children.length - 1 ? (
                <div
                  className={splitHandleClassName(node.direction)}
                  onPointerDown={(event) => beginResize(node, index, event)}
                  onDoubleClick={() =>
                    onResizeSplit(
                      groupId,
                      node.id,
                      node.children.map(() => 1),
                    )
                  }
                />
              ) : null}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="h-full min-h-0 min-w-0 overflow-hidden bg-background">{renderNode(layout)}</div>
  );
}
