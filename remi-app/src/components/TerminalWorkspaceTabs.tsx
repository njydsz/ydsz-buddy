// FILE: TerminalWorkspaceTabs.tsx
// Purpose: Renders the top-level workspace switcher between terminal and chat surfaces.
// Layer: Chat workspace chrome
// Depends on: terminal workspace store layout state and shared className helpers.
/**
 * @file 终端工作区标签
 *
 * 顶部"Terminal / Chat"工作区切换标签：
 *
 * - **标签切换**：在终端与聊天两个主要 surface 间切换
 * - **活动指示**：终端面板有运行活动时展示 spinner
 * - **布局感知**：根据 `workspaceLayout` 渲染不同样式
 *
 * ## 核心导出
 *
 * - `TerminalWorkspaceTabs`（默认导出）：主组件
 *
 * ## 使用场景
 *
 * - ChatView 顶部 chrome
 *
 * ## 注意事项
 *
 * - `terminalCount` 决定标签徽标
 * - 切换时由 `onSelectTab` 通知父组件
 */
import { cn } from "~/lib/utils";

import TerminalActivityIndicator from "./terminal/TerminalActivityIndicator";
import { type ThreadTerminalWorkspaceLayout, type ThreadTerminalWorkspaceTab } from "../types";

interface TerminalWorkspaceTabsProps {
  activeTab: ThreadTerminalWorkspaceTab;
  isWorking: boolean;
  terminalHasRunningActivity: boolean;
  terminalCount: number;
  workspaceLayout: ThreadTerminalWorkspaceLayout;
  onSelectTab: (tab: ThreadTerminalWorkspaceTab) => void;
}

export default function TerminalWorkspaceTabs({
  activeTab,
  isWorking,
  terminalHasRunningActivity,
  terminalCount,
  workspaceLayout,
  onSelectTab,
}: TerminalWorkspaceTabsProps) {
  // Terminal-only workspaces already expose the per-terminal tab strip below,
  // so the chat/terminal switcher would only duplicate chrome and reintroduce chat.
  if (terminalCount <= 1 || workspaceLayout === "terminal-only") {
    return null;
  }

  const tabClassName =
    "group relative -mb-px inline-flex h-7 shrink-0 items-center rounded-t-[10px] border border-b-0 px-3 text-xs transition-colors";

  return (
    <div className="relative border-b border-border/70 bg-muted/10 px-3 sm:px-5">
      <div className="flex min-w-0 items-end gap-1.5 overflow-x-auto pt-1.5 scrollbar-none [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          className={cn(
            tabClassName,
            activeTab === "terminal"
              ? "z-1 border-border/70 bg-(--composer-surface) text-foreground"
              : "border-transparent bg-transparent text-muted-foreground hover:bg-background/55 hover:text-foreground",
          )}
          onClick={() => {
            onSelectTab("terminal");
          }}
        >
          <span className="font-mono tracking-wide">Terminal</span>
          <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">
            {terminalCount}
          </span>
          {terminalHasRunningActivity ? (
            <TerminalActivityIndicator className="ml-1.5 text-foreground/75" />
          ) : null}
        </button>
        <button
          type="button"
          className={cn(
            tabClassName,
            activeTab === "chat"
              ? "z-1 border-border/70 bg-(--composer-surface) text-foreground"
              : "border-transparent bg-transparent text-muted-foreground hover:bg-background/55 hover:text-foreground",
          )}
          onClick={() => {
            onSelectTab("chat");
          }}
        >
          <span className="font-mono tracking-wide">Chat</span>
          {isWorking ? (
            <span className="ml-1.5 inline-flex size-1.5 rounded-full bg-emerald-500/80" />
          ) : null}
        </button>
      </div>
    </div>
  );
}
