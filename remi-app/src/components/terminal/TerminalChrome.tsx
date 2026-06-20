/**
 * @file TerminalChrome.tsx
 * @description 终端外壳（Chrome）可复用的 UI 原语，用于渲染终端标签栏、侧边栏和工具栏操作按钮。
 * 包含终端标签页栏、侧边栏列表、操作按钮组等核心 UI 组件。
 */

import type { ReactNode } from "react";

import type {
  ResolvedTerminalVisualIdentity,
  TerminalVisualState,
} from "~/shared/terminalThreads";

import { Popover, PopoverPopup, PopoverTrigger } from "~/components/ui/popover";
import { XIcon } from "~/lib/icons";
import { cn } from "~/lib/utils";

import type { ResolvedTerminalGroupLayout } from "./TerminalLayout";
import TerminalActivityIndicator from "./TerminalActivityIndicator";
import TerminalIdentityIcon from "./TerminalIdentityIcon";

/**
 * 根据终端视觉状态返回优先级数值，数值越大优先级越高。
 * 用于在标签栏中决定显示哪个终端的状态指示器。
 *
 * @param state - 终端视觉状态
 * @returns 优先级数值（1-4）
 */
function terminalVisualStatePriority(state: TerminalVisualState): number {
  switch (state) {
    case "attention":
      return 4;
    case "running":
      return 3;
    case "review":
      return 2;
    case "idle":
      return 1;
  }
}

/**
 * 终端工具栏操作项配置，描述一个可点击的操作按钮。
 */
export interface TerminalChromeActionItem {
  /** 是否禁用该操作 */
  disabled?: boolean;
  /** 操作的文本标签，同时作为 tooltip 展示 */
  label: string;
  /** 点击时的回调函数 */
  onClick: () => void;
  /** 按钮内容，通常为图标 */
  children: ReactNode;
}

/**
 * 终端操作按钮的内部 props，封装了带 tooltip 的按钮交互。
 */
interface TerminalActionButtonProps {
  /** 按钮的 aria-label 和 tooltip 文本 */
  label: string;
  /** 自定义样式类名 */
  className: string;
  /** 点击回调 */
  onClick: () => void;
  /** 按钮内容，通常为图标 */
  children: ReactNode;
}

/**
 * 终端操作按钮组件，在 hover 时展示 tooltip 提示。
 * 内部使用 Popover 实现 hover 触发的 tooltip 效果。
 */
function TerminalActionButton({ label, className, onClick, children }: TerminalActionButtonProps) {
  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        render={<button type="button" className={className} onClick={onClick} aria-label={label} />}
      >
        {children}
      </PopoverTrigger>
      <PopoverPopup
        tooltipStyle
        side="bottom"
        sideOffset={6}
        align="center"
        className="pointer-events-none select-none"
      >
        {label}
      </PopoverPopup>
    </Popover>
  );
}

/**
 * 终端工具栏操作按钮组，根据不同变体（compact/workspace/sidebar）渲染操作按钮列表。
 * compact 模式下按钮之间使用竖线分隔，workspace/sidebar 模式下使用边框分隔。
 *
 * @param props.actions - 操作项列表
 * @param props.variant - 布局变体，影响按钮的间距和分隔样式
 */
export function TerminalChromeActions(props: {
  actions: ReadonlyArray<TerminalChromeActionItem>;
  variant: "compact" | "workspace" | "sidebar";
}) {
  const itemClassName =
    props.variant === "workspace"
      ? "inline-flex h-full items-center bg-background px-2 text-foreground/90 transition-colors hover:bg-(--sidebar-accent)"
      : props.variant === "sidebar"
        ? "inline-flex h-full items-center bg-background px-1 text-foreground/90 transition-colors hover:bg-(--sidebar-accent)"
        : "bg-background p-1 text-foreground/90 transition-colors hover:bg-(--sidebar-accent)";

  return (
    <div
      className={cn(
        "inline-flex items-center",
        props.variant === "compact"
          ? "overflow-hidden border border-border/80 bg-background shadow-sm"
          : "h-full items-stretch border border-border/70 bg-background shadow-sm",
      )}
    >
      {props.actions.map((action, index) => {
        const shouldRenderDivider = props.variant === "compact" && index > 0;
        return (
          <div key={action.label} className={cn(props.variant === "workspace" ? "" : "contents")}>
            {shouldRenderDivider ? <div className="h-4 w-px bg-border/80" /> : null}
            <TerminalActionButton
              className={cn(
                itemClassName,
                props.variant === "workspace" && index > 0 ? "border-l border-border/70" : "",
                props.variant === "sidebar" && index > 0 ? "border-l border-border/70" : "",
                action.disabled ? "cursor-not-allowed opacity-45 hover:bg-transparent" : "",
              )}
              onClick={() => {
                if (action.disabled) return;
                action.onClick();
              }}
              label={action.label}
            >
              {action.children}
            </TerminalActionButton>
          </div>
        );
      })}
    </div>
  );
}

/**
 * 终端工作区标签栏组件，以水平标签页形式展示终端分组。
 * 每个标签页显示终端图标、标题、活动状态指示器和关闭按钮。
 * 标签页会自动选择该分组中优先级最高的终端状态作为预览状态。
 *
 * @param props.terminalGroups - 已解析的终端分组布局列表
 * @param props.activeGroupId - 当前活跃的分组 ID
 * @param props.terminalVisualIdentityById - 终端 ID 到视觉标识的映射
 * @param props.actions - 工具栏操作项列表
 * @param props.onActiveGroupChange - 切换活跃分组的回调
 * @param props.onCloseGroup - 关闭分组的回调
 */
export function TerminalWorkspaceTabBar(props: {
  terminalGroups: ResolvedTerminalGroupLayout[];
  activeGroupId: string;
  terminalVisualIdentityById: ReadonlyMap<string, ResolvedTerminalVisualIdentity>;
  actions: ReadonlyArray<TerminalChromeActionItem>;
  onActiveGroupChange: (groupId: string) => void;
  onCloseGroup: (groupId: string) => void;
}) {
  return (
    <div className="flex min-w-0 items-stretch justify-between bg-background">
      <div className="flex min-w-0 items-stretch overflow-x-auto scrollbar-none [&::-webkit-scrollbar]:hidden">
        {props.terminalGroups.map((terminalGroup) => {
          const isActive = terminalGroup.id === props.activeGroupId;
          const previewTerminalId =
            terminalGroup.terminalIds.reduce<string | null>((bestTerminalId, terminalId) => {
              const bestPriority = terminalVisualStatePriority(
                props.terminalVisualIdentityById.get(
                  bestTerminalId ?? terminalGroup.activeTerminalId,
                )?.state ?? "idle",
              );
              const nextPriority = terminalVisualStatePriority(
                props.terminalVisualIdentityById.get(terminalId)?.state ?? "idle",
              );
              return nextPriority > bestPriority ? terminalId : bestTerminalId;
            }, null) ?? terminalGroup.activeTerminalId;
          const visualIdentity = props.terminalVisualIdentityById.get(previewTerminalId);
          const closeTabLabel = `Close ${visualIdentity?.title ?? "Terminal tab"}`;
          return (
            <div
              key={terminalGroup.id}
              className={cn(
                "group relative flex h-8 shrink-0 items-center gap-2 border-r border-border/70 px-2.5 transition-colors first:border-l first:border-l-border/70",
                isActive
                  ? "shadow-[inset_0_1px_0_var(--color-text-foreground)] bg-background text-foreground"
                  : "border-b border-border/70 bg-transparent text-muted-foreground hover:bg-(--sidebar-accent) hover:text-foreground",
              )}
            >
              <button
                type="button"
                className="flex min-w-0 items-center gap-2 text-left"
                onClick={() => props.onActiveGroupChange(terminalGroup.id)}
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
                <span className="truncate text-[12px] leading-4 text-current/90">
                  {visualIdentity?.title ?? "Terminal"}
                </span>
                {terminalGroup.terminalIds.length > 1 ? (
                  <span className="shrink-0 text-[10px] text-current/55">
                    {terminalGroup.terminalIds.length}
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                className={cn(
                  "inline-flex size-4 shrink-0 items-center justify-center text-muted-foreground/80 transition hover:bg-background/55 hover:text-foreground",
                  props.terminalGroups.length <= 1 ? "hidden" : "",
                )}
                onClick={(event) => {
                  event.stopPropagation();
                  props.onCloseGroup(terminalGroup.id);
                }}
                aria-label={closeTabLabel}
              >
                <XIcon className="size-2.75" />
              </button>
            </div>
          );
        })}
        <div className="min-w-0 flex-1 border-b border-border/70" />
      </div>
      <div className="shrink-0 border-b border-l border-border/70">
        <TerminalChromeActions actions={props.actions} variant="workspace" />
      </div>
    </div>
  );
}

/**
 * 终端侧边栏组件，以垂直列表形式展示终端分组和终端实例。
 * 支持分组标题折叠展示、终端图标和状态指示器、关闭按钮等交互。
 * 适用于终端数量较多需要分组管理的场景。
 *
 * @param props.terminalIds - 所有终端 ID 列表
 * @param props.terminalGroups - 已解析的终端分组布局列表
 * @param props.activeTerminalId - 当前活跃的终端 ID
 * @param props.activeGroupId - 当前活跃的分组 ID
 * @param props.showGroupHeaders - 是否显示分组标题
 * @param props.closeShortcutLabel - 关闭快捷键的标签文本
 * @param props.terminalVisualIdentityById - 终端 ID 到视觉标识的映射
 * @param props.actions - 工具栏操作项列表
 * @param props.onActiveTerminalChange - 切换活跃终端的回调
 * @param props.onCloseTerminal - 关闭终端的回调
 */
export function TerminalSidebar(props: {
  terminalIds: string[];
  terminalGroups: ResolvedTerminalGroupLayout[];
  activeTerminalId: string;
  activeGroupId: string;
  showGroupHeaders: boolean;
  closeShortcutLabel?: string | undefined;
  terminalVisualIdentityById: ReadonlyMap<string, ResolvedTerminalVisualIdentity>;
  actions: ReadonlyArray<TerminalChromeActionItem>;
  onActiveTerminalChange: (terminalId: string) => void;
  onCloseTerminal: (terminalId: string) => void;
}) {
  return (
    <aside className="flex w-36 min-w-36 flex-col border border-border/70 bg-background">
      <div className="flex h-[22px] items-stretch justify-end border-b border-border/70">
        <TerminalChromeActions actions={props.actions} variant="sidebar" />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1 py-1">
        {props.terminalGroups.map((terminalGroup, groupIndex) => {
          const isGroupActive = terminalGroup.id === props.activeGroupId;
          const groupActiveTerminalId = isGroupActive
            ? props.activeTerminalId
            : terminalGroup.activeTerminalId;
          const groupVisualIdentity = props.terminalVisualIdentityById.get(groupActiveTerminalId);

          return (
            <div key={terminalGroup.id} className="pb-0.5">
              {props.showGroupHeaders && (
                <button
                  type="button"
                  className={`flex w-full items-center px-1 py-0.5 text-[10px] uppercase tracking-[0.08em] ${
                    isGroupActive
                      ? "bg-(--sidebar-accent) text-foreground"
                      : "text-muted-foreground hover:bg-(--sidebar-accent) hover:text-foreground"
                  }`}
                  onClick={() => props.onActiveTerminalChange(groupActiveTerminalId)}
                >
                  {groupVisualIdentity?.title ?? `Terminal ${groupIndex + 1}`}
                  {terminalGroup.terminalIds.length > 1
                    ? ` (${terminalGroup.terminalIds.length})`
                    : ""}
                </button>
              )}

              <div
                className={props.showGroupHeaders ? "ml-1 border-l border-border/60 pl-1.5" : ""}
              >
                {terminalGroup.terminalIds.map((terminalId) => {
                  const isActive = terminalId === props.activeTerminalId;
                  const visualIdentity = props.terminalVisualIdentityById.get(terminalId);
                  const closeTerminalLabel = `Close ${
                    visualIdentity?.title ?? "terminal"
                  }${isActive && props.closeShortcutLabel ? ` (${props.closeShortcutLabel})` : ""}`;
                  return (
                    <div
                      key={terminalId}
                      className={`group flex items-center gap-1 px-1 py-0.5 text-[11px] ${
                        isActive
                          ? "bg-(--sidebar-accent) text-foreground"
                          : "text-muted-foreground hover:bg-(--sidebar-accent) hover:text-foreground"
                      }`}
                    >
                      {props.showGroupHeaders && (
                        <span className="text-[10px] text-muted-foreground/80">·</span>
                      )}
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-1 text-left"
                        onClick={() => props.onActiveTerminalChange(terminalId)}
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
                        <span className="truncate">{visualIdentity?.title ?? "Terminal"}</span>
                      </button>
                      {props.terminalIds.length > 1 && (
                        <Popover>
                          <PopoverTrigger
                            openOnHover
                            render={
                              <button
                                type="button"
                                className="inline-flex size-3.5 items-center justify-center rounded text-xs font-medium leading-none text-muted-foreground opacity-0 transition hover:bg-(--sidebar-accent) hover:text-foreground group-hover:opacity-100"
                                onClick={() => props.onCloseTerminal(terminalId)}
                                aria-label={closeTerminalLabel}
                              />
                            }
                          >
                            <XIcon className="size-2.5" />
                          </PopoverTrigger>
                          <PopoverPopup
                            tooltipStyle
                            side="bottom"
                            sideOffset={6}
                            align="center"
                            className="pointer-events-none select-none"
                          >
                            {closeTerminalLabel}
                          </PopoverPopup>
                        </Popover>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
