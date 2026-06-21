// FILE: ChatLandingPage.tsx
// Purpose: Render the centered landing page for empty chat state,
//          showing "Work with Remi" or "Code with Remi" based on envMode.
// Layer: Chat presentation

import { type FC, memo, useCallback } from "react";
import { GoBook, GoCode } from "react-icons/go";
import { cn } from "~/lib/utils";

export type LandingPageMode = "work" | "code";

interface QuickAction {
  icon: FC<{ className?: string }>;
  label: string;
  onClick?: () => void;
}

interface ChatLandingPageProps {
  mode: LandingPageMode;
  composerSection: React.ReactNode;
  onQuickAction?: (action: string) => void;
}

const workQuickActions: QuickAction[] = [
  { icon: GoBook, label: "网页读取" },
  { icon: GoBook, label: "调研分析" },
  { icon: GoBook, label: "数据挖掘" },
  { icon: GoBook, label: "文件管理" },
];

const codeQuickActions: QuickAction[] = [
  { icon: GoCode, label: "应用开发" },
  { icon: GoCode, label: "项目理解" },
  { icon: GoCode, label: "游戏创意" },
  { icon: GoCode, label: "工具脚本" },
];

export const ChatLandingPage = memo(function ChatLandingPage({
  mode,
  composerSection,
  onQuickAction,
}: ChatLandingPageProps) {
  const isWork = mode === "work";
  const quickActions = isWork ? workQuickActions : codeQuickActions;

  const handleQuickAction = useCallback(
    (label: string) => {
      onQuickAction?.(label);
    },
    [onQuickAction],
  );

  return (
    <div className="chat-pane-enter flex flex-1 flex-col items-center justify-center px-3 sm:px-5">
      <div className="flex w-full max-w-3xl flex-col items-center">
        {/* Title */}
        <div className="mb-8 flex flex-col items-center gap-3 select-none">
          <div className="flex items-center gap-3">
            {isWork ? (
              <GoBook className="size-8 text-foreground/80" />
            ) : (
              <GoCode className="size-8 text-foreground/80" />
            )}
            <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-foreground/95 sm:text-[32px]">
              {isWork ? "Work with Remi" : "Code with Remi"}
            </h1>
          </div>
        </div>

        {/* Composer */}
        <div className="w-full">
          {composerSection}
        </div>

        {/* Quick actions */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.label}
                type="button"
                onClick={() => handleQuickAction(action.label)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/80 px-3.5 py-2 text-[13px] font-normal text-foreground/80 transition-colors",
                  "hover:border-border hover:bg-accent/50 hover:text-foreground",
                )}
              >
                <Icon className="size-3.5 shrink-0" />
                <span>{action.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
});
