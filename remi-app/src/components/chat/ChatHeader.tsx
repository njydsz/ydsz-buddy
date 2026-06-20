/**
 * @file ChatHeader.tsx
 * @description 聊天界面顶部栏组件，包含项目操作、面板切换、Git 操作、线程导航和 Handoff 等控制项。
 * 支持紧凑模式（宽度不足时自动折叠部分控件到菜单中）。
 */

import {
  type EditorId,
  type ProjectScript,
  PROVIDER_DISPLAY_NAMES,
  type ProviderKind,
  type ResolvedKeybindingsConfig,
  type ThreadId,
} from "~/contracts";
import { isGenericChatThreadTitle } from "~/shared/chatThreads";
import { useQuery } from "@tanstack/react-query";
import React, { memo, useEffect, useRef, useState } from "react";
import { BsLayoutSplit, BsTerminal } from "react-icons/bs";
import { FiGitBranch } from "react-icons/fi";
import { HiMiniArrowsPointingOut } from "react-icons/hi2";
import { TbExchange, TbLayoutSidebarRight } from "react-icons/tb";
import type { ThreadPrimarySurface } from "../../types";
import GitActionsControl from "../GitActionsControl";
import { AppsIcon, ArrowRightIcon, GlobeIcon, PlusIcon, TerminalIcon, XIcon } from "~/lib/icons";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "../ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { SidebarHeaderNavigationControls } from "../SidebarHeaderNavigationControls";
import ProjectScriptsControl, { type NewProjectScriptInput } from "../ProjectScriptsControl";
import { Toggle } from "../ui/toggle";
import { useSidebar } from "../ui/sidebar";
import { isDesktop } from "~/env";
import { cn } from "~/lib/utils";
import { readNativeApi } from "~/nativeApi";
import { resolveEditorIcon } from "../../editorMetadata";
import { usePreferredEditor } from "../../editorPreferences";
import { useIsDisposableThread } from "~/hooks/useIsDisposableThread";
import { ProviderIcon } from "../ProviderIcon";
import { gitWorkingTreeDiffQueryOptions } from "~/lib/gitReactQuery";
import { summarizePatchStats } from "~/lib/diffRendering";
import { useRepoDiffScopeStore } from "~/repoDiffScopeStore";

/** 宽度阈值（像素），低于此值时头部控件折叠到省略号菜单中 */
const HEADER_COMPACT_BREAKPOINT = 480;

/**
 * ChatHeader 组件的属性接口
 */
interface ChatHeaderProps {
  /** 当前活跃的线程 ID */
  activeThreadId: ThreadId;
  /** 当前活跃的线程标题 */
  activeThreadTitle: string;
  /** 当前线程的入口界面类型 */
  activeThreadEntryPoint: ThreadPrimarySurface;
  /** 当前活跃的提供者类型 */
  activeProvider: ProviderKind;
  /** 当前活跃的项目名称 */
  activeProjectName: string | undefined;
  /** 线程面包屑导航 */
  threadBreadcrumbs: ReadonlyArray<{
    threadId: ThreadId;
    title: string;
  }>;
  /** 是否隐藏 Handoff 控件 */
  hideHandoffControls?: boolean;
  /** 当前项目是否为 Git 仓库 */
  isGitRepo: boolean;
  /** 在当前工作目录中打开的路径 */
  openInCwd: string | null;
  /** 当前项目的脚本列表 */
  activeProjectScripts: ProjectScript[] | undefined;
  /** 首选脚本 ID */
  preferredScriptId: string | null;
  /** 快捷键配置 */
  keybindings: ResolvedKeybindingsConfig;
  /** 可用的编辑器 ID 列表 */
  availableEditors: ReadonlyArray<EditorId>;
  /** 终端是否可用 */
  terminalAvailable: boolean;
  /** 终端是否已打开 */
  terminalOpen: boolean;
  /** 终端切换快捷键标签 */
  terminalToggleShortcutLabel: string | null;
  /** 浏览器切换快捷键标签 */
  browserToggleShortcutLabel: string | null;
  /** Diff 面板切换快捷键标签 */
  diffToggleShortcutLabel: string | null;
  /** Handoff 徽章标签 */
  handoffBadgeLabel: string | null;
  /** Handoff 操作标签 */
  handoffActionLabel: string;
  /** Handoff 是否被禁用 */
  handoffDisabled: boolean;
  /** Handoff 目标提供者列表 */
  handoffActionTargetProviders: ReadonlyArray<ProviderKind>;
  /** Handoff 徽章来源提供者 */
  handoffBadgeSourceProvider: ProviderKind | null;
  /** Handoff 徽章目标提供者 */
  handoffBadgeTargetProvider: ProviderKind | null;
  /** 浏览器是否已打开 */
  browserOpen: boolean;
  /** Git 工作目录 */
  gitCwd: string | null;
  /** Diff 徽章刷新间隔（毫秒），false 表示不刷新 */
  diffBadgeRefreshIntervalMs?: number | false;
  /** 是否显示 Git 操作控件 */
  showGitActions?: boolean;
  /** Diff 面板是否已打开 */
  diffOpen: boolean;
  /** Diff 面板禁用原因 */
  diffDisabledReason?: string | null;
  /** 界面模式（单面板/分屏） */
  surfaceMode?: "single" | "split";
  /** 是否为侧边聊天 */
  isSidechat?: boolean;
  /** 聊天布局操作（分屏/最大化） */
  chatLayoutAction?: {
    kind: "split" | "maximize";
    label: string;
    shortcutLabel: string | null;
    onClick: () => void;
  } | null;
  /** 切换线程操作 */
  changeThreadAction?: {
    label: string;
    onClick: () => void;
  } | null;
  /** 运行项目脚本回调 */
  onRunProjectScript: (script: ProjectScript) => void;
  /** 添加项目脚本回调 */
  onAddProjectScript: (input: NewProjectScriptInput) => Promise<void>;
  /** 更新项目脚本回调 */
  onUpdateProjectScript: (scriptId: string, input: NewProjectScriptInput) => Promise<void>;
  /** 删除项目脚本回调 */
  onDeleteProjectScript: (scriptId: string) => Promise<void>;
  /** 切换终端回调 */
  onToggleTerminal: () => void;
  /** 切换 Diff 面板回调 */
  onToggleDiff: () => void;
  /** 切换浏览器回调 */
  onToggleBrowser: () => void;
  /** 创建 Handoff 回调 */
  onCreateHandoff: (targetProvider: ProviderKind) => void;
  /** 导航到指定线程回调 */
  onNavigateToThread: (threadId: ThreadId) => void;
  /** 重命名线程回调 */
  onRenameThread: () => void;
  /** 关闭线程面板回调 */
  onCloseThreadPane?: () => void;
}

/**
 * 聊天头部线程图标类型：无图标、提供者图标或终端图标
 */
export type ChatHeaderThreadIconKind = "none" | "provider" | "terminal";

/**
 * 根据线程入口类型和标题解析头部图标类型
 * @param entryPoint - 线程入口界面类型
 * @param title - 线程标题（可选）
 * @returns 图标类型
 */
export function resolveChatHeaderThreadIconKind(
  entryPoint: ThreadPrimarySurface,
  title?: string,
): ChatHeaderThreadIconKind {
  if (entryPoint === "chat" && isGenericChatThreadTitle(title)) {
    return "none";
  }
  return entryPoint === "terminal" ? "terminal" : "provider";
}

/**
 * ChatHeader 组件
 * @description 聊天界面顶部栏，包含项目操作、面板切换、Git 操作、线程导航和 Handoff 等控制项。
 * 支持紧凑模式（宽度不足时自动折叠部分控件到菜单中）。
 */
export const ChatHeader = memo(function ChatHeader({
  activeThreadId,
  activeThreadTitle,
  activeThreadEntryPoint,
  activeProvider,
  activeProjectName,
  threadBreadcrumbs,
  hideHandoffControls = false,
  isGitRepo,
  openInCwd,
  activeProjectScripts,
  preferredScriptId,
  keybindings,
  availableEditors,
  terminalAvailable,
  terminalOpen,
  terminalToggleShortcutLabel,
  browserToggleShortcutLabel,
  diffToggleShortcutLabel,
  handoffBadgeLabel,
  handoffActionLabel,
  handoffDisabled,
  handoffActionTargetProviders,
  handoffBadgeSourceProvider,
  handoffBadgeTargetProvider,
  browserOpen,
  gitCwd,
  diffBadgeRefreshIntervalMs = false,
  showGitActions = true,
  diffOpen,
  diffDisabledReason = null,
  surfaceMode = "single",
  isSidechat = false,
  chatLayoutAction = null,
  changeThreadAction = null,
  onRunProjectScript,
  onAddProjectScript,
  onUpdateProjectScript,
  onDeleteProjectScript,
  onToggleTerminal,
  onToggleDiff,
  onToggleBrowser,
  onCreateHandoff,
  onNavigateToThread,
  onRenameThread,
  onCloseThreadPane,
}: ChatHeaderProps) {
  const { isMobile, state } = useSidebar();
  const headerRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  const [openAddActionNonce, setOpenAddActionNonce] = useState(0);
  const [preferredEditor] = usePreferredEditor(availableEditors);
  const EditorIcon = preferredEditor ? resolveEditorIcon(preferredEditor) : null;
  const repoDiffScope = useRepoDiffScopeStore((store) => store.scope);
  // Match the Diff panel source selector so the sidebar badge shows the selected scope.
  const { data: selectedRepoDiff = null } = useQuery(
    gitWorkingTreeDiffQueryOptions({
      cwd: gitCwd,
      scope: repoDiffScope,
      enabled: isGitRepo,
      refetchInterval: diffBadgeRefreshIntervalMs,
    }),
  );
  const diffTotals = summarizePatchStats(selectedRepoDiff?.patch);
  const showDiffTotals = (diffTotals?.additions ?? 0) > 0 || (diffTotals?.deletions ?? 0) > 0;
  const isDisposableThread = useIsDisposableThread(activeThreadId);

  const isSplitPane = surfaceMode === "split";
  const inlineChatLayoutAction = chatLayoutAction?.kind === "maximize" ? chatLayoutAction : null;
  const menuChatLayoutAction = inlineChatLayoutAction ? null : chatLayoutAction;
  const threadIconKind = resolveChatHeaderThreadIconKind(activeThreadEntryPoint, activeThreadTitle);
  const showSidechatTitleChip = isSidechat && compact;

  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const measure = () => setCompact(isSplitPane || el.clientWidth < HEADER_COMPACT_BREAKPOINT);
    measure();
    const observer = new ResizeObserver(() => measure());
    observer.observe(el);
    return () => observer.disconnect();
  }, [isSplitPane]);

  const renderProviderIcon = (provider: ProviderKind | null, className: string) => {
    return (
      <ProviderIcon
        provider={provider}
        tone="header"
        className={className}
        fallback={<FiGitBranch className={className} />}
      />
    );
  };

  return (
    <div ref={headerRef} className="flex min-w-0 flex-1 items-center gap-2">
      <div
        className={cn(
          "flex min-w-0 flex-1 items-center overflow-hidden",
          !isMobile && state === "collapsed" ? "gap-4" : "gap-2 sm:gap-3",
        )}
      >
        <SidebarHeaderNavigationControls />
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex min-w-0 flex-1 flex-col">
            {threadBreadcrumbs.length > 0 ? (
              <div className="flex min-w-0 items-center gap-1 overflow-hidden text-[11px] text-muted-foreground/55">
                {threadBreadcrumbs.map((breadcrumb, index) => (
                  <React.Fragment key={breadcrumb.threadId}>
                    {index > 0 ? (
                      <span className="shrink-0 text-muted-foreground/35">/</span>
                    ) : null}
                    <button
                      type="button"
                      className="min-w-0 truncate transition-colors hover:text-foreground/80"
                      title={breadcrumb.title}
                      onClick={() => onNavigateToThread(breadcrumb.threadId)}
                    >
                      {breadcrumb.title}
                    </button>
                  </React.Fragment>
                ))}
              </div>
            ) : null}
            <div className="flex min-w-0 items-center gap-2">
              <div
                className={cn(
                  "flex min-w-0 items-center gap-2",
                  showSidechatTitleChip &&
                    "rounded-lg bg-secondary py-1 pl-2 pr-1 text-secondary-foreground",
                )}
              >
                {threadIconKind === "none" ? null : (
                  <span
                    className="inline-flex size-3.5 shrink-0 items-center justify-center"
                    title={
                      threadIconKind === "terminal"
                        ? "Terminal"
                        : PROVIDER_DISPLAY_NAMES[activeProvider]
                    }
                  >
                    {threadIconKind === "terminal" ? (
                      <TerminalIcon className="size-3.5 text-teal-600/85" />
                    ) : (
                      renderProviderIcon(activeProvider, "size-3.5")
                    )}
                  </span>
                )}
                <h2
                  className="max-w-[clamp(12rem,42vw,36rem)] truncate text-sm font-medium text-foreground"
                  title={activeThreadTitle}
                  onDoubleClick={() => onRenameThread()}
                >
                  {activeThreadTitle}
                </h2>
                {showSidechatTitleChip && onCloseThreadPane ? (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <button
                          type="button"
                          className="inline-flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background/55 hover:text-foreground [-webkit-app-region:no-drag]"
                          aria-label="Close selected sidechat"
                          onClick={(event) => {
                            event.stopPropagation();
                            onCloseThreadPane();
                          }}
                        >
                          <XIcon className="size-3" />
                        </button>
                      }
                    />
                    <TooltipPopup side="bottom">Close selected sidechat</TooltipPopup>
                  </Tooltip>
                ) : null}
              </div>
              {!hideHandoffControls && handoffBadgeLabel ? (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Badge
                        variant="outline"
                        className="hidden h-6! shrink-0 items-center justify-center gap-1 rounded-md px-1.5 text-[10px] sm:inline-flex"
                      >
                        <span className="inline-flex size-4 shrink-0 items-center justify-center">
                          {renderProviderIcon(handoffBadgeSourceProvider, "size-3")}
                        </span>
                        <ArrowRightIcon className="size-2.5 shrink-0 opacity-45" />
                        <span className="inline-flex size-4 shrink-0 items-center justify-center">
                          {renderProviderIcon(handoffBadgeTargetProvider, "size-3")}
                        </span>
                      </Badge>
                    }
                  />
                  <TooltipPopup side="bottom">{handoffBadgeLabel}</TooltipPopup>
                </Tooltip>
              ) : null}
            </div>
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 [-webkit-app-region:no-drag]">
        {!isDisposableThread && !hideHandoffControls ? (
          <Menu modal={false}>
            <Tooltip>
              <TooltipTrigger
                render={
                  <MenuTrigger
                    render={
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        className={cn(
                          "shrink-0 bg-transparent not-disabled:before:shadow-none dark:not-disabled:before:shadow-none [:hover,[data-pressed]]:bg-(--sidebar-accent) dark:[:hover,[data-pressed]]:bg-(--sidebar-accent)",
                          compact ? "gap-1" : "gap-1.5",
                        )}
                        aria-label={handoffActionLabel}
                        disabled={handoffDisabled || handoffActionTargetProviders.length === 0}
                      />
                    }
                  >
                    <FiGitBranch className="size-3.5 shrink-0" />
                    {!compact ? <span className="truncate font-normal">Hand off</span> : null}
                  </MenuTrigger>
                }
              />
              <TooltipPopup side="bottom">{handoffActionLabel}</TooltipPopup>
            </Tooltip>
            <MenuPopup align="end" side="bottom" className="w-48">
              {handoffActionTargetProviders.map((provider) => (
                <MenuItem key={provider} onClick={() => onCreateHandoff(provider)}>
                  {renderProviderIcon(provider, "size-3.5 shrink-0")}
                  <span>Handoff to {PROVIDER_DISPLAY_NAMES[provider]}</span>
                </MenuItem>
              ))}
            </MenuPopup>
          </Menu>
        ) : null}
        {/* Keep one shared project-actions controller mounted so both inline and
            compact header menus open the same dialog/state machine. */}
        {!isDisposableThread && activeProjectScripts ? (
          <ProjectScriptsControl
            scripts={activeProjectScripts}
            keybindings={keybindings}
            preferredScriptId={preferredScriptId}
            showInlineControls={!compact}
            openAddActionNonce={openAddActionNonce}
            onRunScript={onRunProjectScript}
            onAddScript={onAddProjectScript}
            onUpdateScript={onUpdateProjectScript}
            onDeleteScript={onDeleteProjectScript}
          />
        ) : null}

        {!isDisposableThread && inlineChatLayoutAction ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  size="icon-xs"
                  variant="outline"
                  className="shrink-0 bg-transparent not-disabled:before:shadow-none dark:not-disabled:before:shadow-none [:hover,[data-pressed]]:bg-(--sidebar-accent) dark:[:hover,[data-pressed]]:bg-(--sidebar-accent)"
                  aria-label={inlineChatLayoutAction.label}
                  onClick={inlineChatLayoutAction.onClick}
                >
                  <HiMiniArrowsPointingOut className="size-3.5" />
                </Button>
              }
            />
            <TooltipPopup side="bottom">{inlineChatLayoutAction.label}</TooltipPopup>
          </Tooltip>
        ) : null}

        {/* Panel toggles menu — editor, terminal, browser, split chat. */}
        {!isDisposableThread &&
        (terminalAvailable ||
          activeProjectName ||
          menuChatLayoutAction ||
          changeThreadAction ||
          isDesktop) ? (
          <Menu modal={false}>
            <MenuTrigger
              render={
                <Button
                  size="icon-xs"
                  variant="outline"
                  className="shrink-0 bg-transparent not-disabled:before:shadow-none dark:not-disabled:before:shadow-none [:hover,[data-pressed]]:bg-(--sidebar-accent) dark:[:hover,[data-pressed]]:bg-(--sidebar-accent)"
                  aria-label="Panel toggles"
                />
              }
            >
              <AppsIcon className="size-3.5" />
            </MenuTrigger>
            <MenuPopup
              align="end"
              side="bottom"
              className="w-50 rounded-lg border-(--color-border) bg-(--composer-surface) shadow-lg"
            >
              {activeProjectName ? (
                <MenuItem
                  onClick={() => {
                    const api = readNativeApi();
                    if (api && openInCwd && preferredEditor) {
                      void api.shell.openInEditor(openInCwd, preferredEditor);
                    }
                  }}
                  disabled={!preferredEditor || !openInCwd}
                >
                  {EditorIcon ? (
                    <EditorIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  ) : null}
                  <span>Open in editor</span>
                </MenuItem>
              ) : null}
              <MenuItem onClick={onToggleTerminal} disabled={!terminalAvailable}>
                <BsTerminal className="size-3.5 shrink-0" />
                <span>{terminalOpen ? "Hide terminal" : "Show terminal"}</span>
                {terminalToggleShortcutLabel && (
                  <span className="ml-auto text-[11px] opacity-60">
                    {terminalToggleShortcutLabel}
                  </span>
                )}
              </MenuItem>
              {isDesktop ? (
                <MenuItem onClick={onToggleBrowser}>
                  <GlobeIcon className="size-3.5 shrink-0" />
                  <span>{browserOpen ? "Hide browser" : "Show browser"}</span>
                  {browserToggleShortcutLabel && (
                    <span className="ml-auto text-[11px] opacity-60">
                      {browserToggleShortcutLabel}
                    </span>
                  )}
                </MenuItem>
              ) : null}
              {menuChatLayoutAction ? (
                <MenuItem onClick={menuChatLayoutAction.onClick}>
                  {menuChatLayoutAction.kind === "split" ? (
                    <BsLayoutSplit className="size-3.5 shrink-0" />
                  ) : (
                    <HiMiniArrowsPointingOut className="size-3.5 shrink-0" />
                  )}
                  <span>{menuChatLayoutAction.label}</span>
                  {menuChatLayoutAction.shortcutLabel && (
                    <span className="ml-auto text-[11px] opacity-60">
                      {menuChatLayoutAction.shortcutLabel}
                    </span>
                  )}
                </MenuItem>
              ) : null}
              {changeThreadAction ? (
                <MenuItem onClick={changeThreadAction.onClick}>
                  <TbExchange className="size-3.5 shrink-0" />
                  <span>{changeThreadAction.label}</span>
                </MenuItem>
              ) : null}
              {activeProjectScripts ? (
                <>
                  <MenuSeparator className="mx-1" />
                  <MenuItem onClick={() => setOpenAddActionNonce((current) => current + 1)}>
                    <PlusIcon className="size-3.5 shrink-0" />
                    <span>Add action</span>
                  </MenuItem>
                </>
              ) : null}
            </MenuPopup>
          </Menu>
        ) : null}

        {!isDisposableThread && activeProjectName && showGitActions ? (
          <GitActionsControl
            gitCwd={gitCwd}
            activeThreadId={activeThreadId}
            hideQuickActionLabel={compact}
          />
        ) : null}
        <Tooltip>
          <TooltipTrigger
            render={
              <Toggle
                className={cn(
                  "shrink-0 border-0",
                  showDiffTotals
                    ? "gap-2 px-1.5 text-(length:--app-font-size-ui-sm,11px)"
                    : "",
                )}
                pressed={diffOpen}
                onPressedChange={onToggleDiff}
                aria-label="Toggle diff panel"
                variant="default"
                size="xs"
                disabled={!isGitRepo || (diffDisabledReason !== null && !diffOpen)}
              >
                {showDiffTotals ? (
                  <span className="inline-flex items-center gap-1">
                    <span className="font-system-ui text-(length:--app-font-size-ui-sm,11px) sm:text-(length:--app-font-size-ui-xs,10px) font-normal tracking-normal tabular-nums text-success">
                      +{diffTotals?.additions ?? 0}
                    </span>
                    <span className="font-system-ui text-(length:--app-font-size-ui-sm,11px) sm:text-(length:--app-font-size-ui-xs,10px) font-normal tracking-normal tabular-nums text-destructive">
                      -{diffTotals?.deletions ?? 0}
                    </span>
                  </span>
                ) : null}
                <TbLayoutSidebarRight className="size-3.5" />
              </Toggle>
            }
          />
          <TooltipPopup side="bottom">
            {!isGitRepo
              ? "Diff panel is unavailable because this project is not a git repository."
              : diffDisabledReason && !diffOpen
                ? diffDisabledReason
                : diffToggleShortcutLabel
                  ? `Toggle diff panel (${diffToggleShortcutLabel})`
                  : "Toggle diff panel"}
          </TooltipPopup>
        </Tooltip>
      </div>
    </div>
  );
});
