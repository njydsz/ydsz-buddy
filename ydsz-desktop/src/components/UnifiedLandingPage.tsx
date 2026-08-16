/**
 * @file 统一落地页组件
 *
 * 合并原 AppLandingPage 和 ChatLandingPage，提供统一的 Work/Code 模式落地页：
 *
 * - **模式徽标**：顶部彩色 chip 标识当前模式（Work 琥珀色 / Code 天蓝色）
 * - **标题 + 副标题**：居中展示模式定位文案
 * - **Composer 插槽**：可选的输入区域（有线程时传入，无线程时为 null）
 * - **快捷操作**：4 个 chip 按钮，点击通过回调通知父组件（不再直接路由跳转）
 * - **底部提示**：引导用户按快捷键开启新会话
 * - **加载态**：loading=true 时显示脉冲动画
 *
 * ## 核心导出
 *
 * - `UnifiedLandingPage`：主组件
 * - `LandingPageMode`：模式枚举（work | code）
 * - `LandingQuickAction`：快捷操作数据结构
 *
 * ## 使用场景
 *
 * - ChatView 中无线程 / 有线程但无消息时的居中落地页
 * - _chat.index 路由的启动加载态
 * - _chat.workspace.index 路由的工作区空态
 *
 * ## 与旧组件的差异
 *
 * - 快捷操作不再内置路由跳转，改为 `onQuickAction` 回调，由父组件决定行为
 * - 统一了 AppLandingPage 和 ChatLandingPage 的两套快捷操作文案
 * - 支持通过 `composerSection` 插槽嵌入 Composer 输入区域
 */
import { type FC, useMemo } from "react";
import {
  GoBook,
  GoBrowser,
  GoBug,
  GoCode,
  GoDatabase,
  GoFile,
  GoGitBranch,
  GoRocket,
  GoSearch,
  GoTerminal,
} from "react-icons/go";

import { cn } from "~/lib/utils";
import { useMessages } from "~/i18n/I18nContext";

export type LandingPageMode = "work" | "code";

export interface LandingQuickAction {
  id: string;
  icon: FC<{ className?: string }>;
  label: string;
}

interface UnifiedLandingPageProps {
  mode: LandingPageMode;
  /** 可选的 Composer 输入区域。有活跃线程时传入完整 composer，无线程时可传入 LandingComposer */
  composerSection?: React.ReactNode;
  /** 快捷操作点击回调。父组件负责决定行为（预填 composer / 创建新线程等） */
  onQuickAction?: (actionId: string) => void;
  /** 加载态脉冲动画 */
  loading?: boolean;
  className?: string;
}

const modeConfig: Record<
  LandingPageMode,
  {
    icon: FC<{ className?: string }>;
    titleKey: "workTitle" | "codeTitle";
    subtitleKey: "workSubtitle" | "codeSubtitle";
    badgeKey: "workBadge" | "codeBadge";
    hintKey: "workHint" | "codeHint";
    badgeClass: string;
  }
> = {
  work: {
    icon: GoRocket,
    titleKey: "workTitle",
    subtitleKey: "workSubtitle",
    badgeKey: "workBadge",
    hintKey: "workHint",
    badgeClass: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  code: {
    icon: GoTerminal,
    titleKey: "codeTitle",
    subtitleKey: "codeSubtitle",
    badgeKey: "codeBadge",
    hintKey: "codeHint",
    badgeClass: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  },
};

/**
 * 根据模式返回快捷操作列表。
 * Work 模式：网页读取、调研分析、数据挖掘、文件管理
 * Code 模式：应用开发、项目理解、调试修复、代码审查
 */
function getQuickActions(messages: ReturnType<typeof useMessages>): LandingQuickAction[] {
  return [
    { id: "webRead", icon: GoBrowser, label: messages.landing.quickActionWebRead },
    { id: "research", icon: GoBook, label: messages.landing.quickActionResearch },
    { id: "dataMining", icon: GoDatabase, label: messages.landing.quickActionDataMining },
    { id: "fileManager", icon: GoFile, label: messages.landing.quickActionFileManager },
  ];
}

function getCodeQuickActions(messages: ReturnType<typeof useMessages>): LandingQuickAction[] {
  return [
    { id: "appDev", icon: GoCode, label: messages.landing.quickActionAppDev },
    { id: "projectInsight", icon: GoSearch, label: messages.landing.quickActionProjectInsight },
    { id: "debugFix", icon: GoBug, label: messages.landing.quickActionDebugFix },
    { id: "codeReview", icon: GoGitBranch, label: messages.landing.quickActionCodeReview },
  ];
}

export function UnifiedLandingPage({
  mode,
  composerSection,
  onQuickAction,
  loading = false,
  className,
}: UnifiedLandingPageProps) {
  const messages = useMessages();
  const config = modeConfig[mode];
  const Icon = config.icon;

  const quickActions = useMemo(
    () => (mode === "work" ? getQuickActions(messages) : getCodeQuickActions(messages)),
    [mode, messages],
  );

  return (
    <div
      className={cn(
        "relative flex min-h-0 min-w-0 flex-1 items-center justify-center bg-background px-3 sm:px-5",
        "chat-pane-enter",
        className,
      )}
    >
      <div className="flex w-full max-w-3xl flex-col items-center select-none">
        {/* Mode badge */}
        <span
          className={cn(
            "mb-5 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium tracking-wide",
            config.badgeClass,
          )}
        >
          <Icon className="size-3.5" />
          {messages.landing[config.badgeKey]}
        </span>

        {/* Title */}
        <h1 className="text-center text-[28px] font-semibold tracking-[-0.02em] text-foreground/95 sm:text-[34px]">
          {messages.landing[config.titleKey]}
        </h1>
        <p className="mt-3 max-w-xl text-center text-[13px] leading-relaxed text-muted-foreground/75">
          {messages.landing[config.subtitleKey]}
        </p>

        {/* Composer section */}
        {composerSection ? <div className="mt-8 w-full">{composerSection}</div> : null}

        {/* Quick actions */}
        <div className={cn("mt-8 flex w-full flex-col items-center", composerSection ? "mt-6" : "mt-8")}>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {quickActions.map((action) => {
              const ActionIcon = action.icon;
              return (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => onQuickAction?.(action.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[13px] font-normal transition-all duration-150",
                    "border-border/60 bg-background/80 text-foreground/80",
                    "hover:scale-[1.02] hover:border-border hover:bg-muted/50 hover:text-foreground",
                    "active:scale-[0.98]",
                  )}
                >
                  <ActionIcon className="size-3.5 shrink-0" />
                  <span>{action.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Hint */}
        <div className="mt-10 flex items-center gap-1.5 text-[12px] text-muted-foreground/65">
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground/55" />
              <span>{messages.landing[config.hintKey]}</span>
            </span>
          ) : (
            <span>{messages.landing[config.hintKey]}</span>
          )}
        </div>
      </div>
    </div>
  );
}
