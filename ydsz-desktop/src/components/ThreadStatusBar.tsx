/**
 * @file ThreadStatusBar 组件
 *
 * ChatView 顶部常驻状态栏（ChatHeader 下方），展示当前 Thread 的核心状态：
 *
 * - **RuntimeMode + InteractionMode**：当前生效模式（与 ModeSwitcher 同步）
 * - **Provider**：当前 Provider 名称 + 在线/离线指示
 * - **Model**：当前 Model slug（短显示）
 * - **网络状态**：在线 / 降级 / 离线（与 NetworkStatusIndicator 联动）
 * - **离线草稿数**：当存在离线草稿时显示徽标
 * - **Provider 不可用**：providerStatus.available === false 时显示红点
 * - **AI 生产占比**：线程级 AI 归属行数占比（P0-P1 新增）
 *
 * 设计原则（参考互联网大厂基线）：
 *
 * - **常驻可见**：Sidebar 折叠也保持显示
 * - **轻量交互**：纯展示，点击行为委托给父组件
 * - **性能优先**：选择器最小化，避免不必要 re-render
 * - **不打扰**：网络正常 + Provider 可用 + 无草稿 + 无 AI 改动时，仅显示 mode 标签
 */

import { memo, useMemo } from "react";
import { PiCircleFill } from "react-icons/pi";
import { TbCloud, TbCloudOff, TbDatabase, TbPlugConnected, TbRobot } from "react-icons/tb";
import { PROVIDER_DISPLAY_NAMES, type ProviderKind } from "~/contracts";
import { PROVIDER_ICON_COMPONENT_BY_PROVIDER } from "./ProviderIcon";
import { useNetworkStatus } from "~/hooks/useNetworkStatus";
import { useOfflineDraftStore } from "~/offlineDraftStore";
import { useMessages } from "~/i18n/I18nContext";
import { cn } from "~/lib/utils";
import type { TurnAiShareStats } from "~/lib/turnAiShare";
import { formatAiSharePercent } from "~/lib/turnAiShare";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";
import { formatTokenCount } from "~/lib/formatTokenCount";

interface ThreadStatusBarProps {
  /** RuntimeMode 标签，如 "Code" / "Work" */
  runtimeModeLabel: string;
  /** InteractionMode 标签，如 "Agent" / "Review" */
  interactionModeLabel: string;
  /** 当前 Provider */
  provider: ProviderKind;
  /** Provider 是否可用（false 时显示红点） */
  providerAvailable: boolean;
  /** 当前 Model slug */
  model: string;
  /** 任务列表标签/数量(可选,仅在有任务时显示) */
  activeTaskCount?: number;
  /** AI 生产占比(可选,空态 / undefined 时不显示徽标) */
  aiShare?: TurnAiShareStats;
  /** 自定义 className */
  className?: string;
}

/**
 * 状态颜色配置 - 互联网大厂基线
 */
const NETWORK_STATUS_STYLES = {
  online: {
    color: "text-emerald-500/80",
    label: "在线",
    icon: TbCloud,
  },
  degraded: {
    color: "text-amber-500/80",
    label: "降级",
    icon: TbPlugConnected,
  },
  offline: {
    color: "text-rose-500/80",
    label: "离线",
    icon: TbCloudOff,
  },
} as const;

/**
 * AI 占比颜色 - 大厂基线
 * - < 30%   灰(以用户输入为主)
 * - 30%~70% 紫(混合协作)
 * - >= 70%  绿(AI 主导)
 */
function aiShareColor(share: number | null): string {
  if (share === null) return "text-muted-foreground/70";
  if (share < 0.3) return "text-muted-foreground/85";
  if (share < 0.7) return "text-violet-500/85";
  return "text-emerald-500/85";
}

export const ThreadStatusBar = memo(function ThreadStatusBar({
  runtimeModeLabel,
  interactionModeLabel,
  provider,
  providerAvailable,
  model,
  activeTaskCount = 0,
  aiShare,
  className,
}: ThreadStatusBarProps) {
  const networkStatusValue = useNetworkStatus();
  const networkStatus = networkStatusValue.status;
  const offlineDraftCount = useOfflineDraftStore((state) => {
    const map = state.draftsByThreadId;
    let total = 0;
    for (const list of Object.values(map)) {
      total += list.length;
    }
    return total;
  });
  const messages = useMessages();

  const networkStyle = NETWORK_STATUS_STYLES[networkStatus];
  const NetworkIcon = networkStyle.icon;
  const providerLabel = useMemo(
    () => PROVIDER_DISPLAY_NAMES[provider] ?? provider,
    [provider],
  );
  const ProviderIconComponent = PROVIDER_ICON_COMPONENT_BY_PROVIDER[provider] ?? null;
  const modelShort = useMemo(() => {
    if (!model) return "—";
    // 截断长 model 名称（如 "claude-3-5-sonnet-20241022" → "claude-3-5-sonnet…"）
    return model.length > 24 ? `${model.slice(0, 22)}…` : model;
  }, [model]);

  // AI 占比徽标只在线程有 turn diff 数据时出现(避免空态噪声)
  const showAiShare = !!aiShare && !aiShare.isEmpty && aiShare.aiShare !== null;
  const aiSharePercentText = formatAiSharePercent(aiShare?.aiShare ?? null);

  const aiShareTooltipTitle = useMemo(() => {
    if (!aiShare) return "";
    return messages.turnAiShare.badge.tooltipBreakdown(
      formatTokenCount(aiShare.aiLines),
      formatTokenCount(aiShare.humanLines),
      formatTokenCount(aiShare.mixedLines),
      formatTokenCount(aiShare.totalAuthoredLines),
    );
  }, [aiShare, messages.turnAiShare.badge]);

  return (
    <div
      data-testid="thread-status-bar"
      className={cn(
        "flex h-7 items-center gap-3 border-b border-border/60 bg-muted/25 px-3 text-[11px] text-muted-foreground",
        "select-none",
        className,
      )}
      role="status"
      aria-label="线程状态栏"
    >
      {/* Mode 标签 */}
      <div className="flex shrink-0 items-center gap-1" data-no-drag>
        <span className="font-medium text-foreground/85">
          {runtimeModeLabel}
        </span>
        <PiCircleFill className="size-1.5 opacity-40" aria-hidden="true" />
        <span className="text-foreground/75">{interactionModeLabel}</span>
      </div>

      {/* 分隔符 */}
      <div className="h-3 w-px shrink-0 bg-border/60" aria-hidden="true" />

      {/* Provider */}
      <div className="flex shrink-0 items-center gap-1" data-no-drag>
        {ProviderIconComponent ? (
          <ProviderIconComponent className="size-3 shrink-0" aria-hidden="true" />
        ) : null}
        <span className="text-foreground/75">{providerLabel}</span>
        {!providerAvailable ? (
          <span
            className="size-1.5 shrink-0 rounded-full bg-destructive"
            title="Provider 当前不可用"
            aria-label="Provider 当前不可用"
          />
        ) : null}
      </div>

      {/* 分隔符 */}
      <div className="h-3 w-px shrink-0 bg-border/60" aria-hidden="true" />

      {/* Model */}
      <div
        className="flex min-w-0 shrink items-center gap-1"
        data-no-drag
        title={model}
      >
        <TbDatabase className="size-3 shrink-0 opacity-70" aria-hidden="true" />
        <span className="truncate text-foreground/75">{modelShort}</span>
      </div>

      {/* 右侧：AI 占比徽标 + 网络状态 + 离线草稿数 + 任务数 */}
      <div className="ml-auto flex shrink-0 items-center gap-3">
        {showAiShare ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <div
                  className={cn(
                    "flex items-center gap-1 rounded-sm px-1.5 py-0.5 transition-colors hover:bg-muted/40",
                    aiShareColor(aiShare?.aiShare ?? null),
                  )}
                  data-testid="status-bar-ai-share"
                  data-ai-share={aiSharePercentText}
                  data-ai-lines={aiShare?.aiLines ?? 0}
                  data-ai-total={aiShare?.totalAuthoredLines ?? 0}
                  aria-label={messages.turnAiShare.badge.a11yLabel(aiSharePercentText)}
                />
              }
            >
              <TbRobot className="size-3 shrink-0" aria-hidden="true" />
              <span className="text-[10px] font-medium tabular-nums">
                {messages.turnAiShare.badge.label.replace("{percent}", aiSharePercentText)}
              </span>
            </TooltipTrigger>
            <TooltipPopup side="bottom">{aiShareTooltipTitle}</TooltipPopup>
          </Tooltip>
        ) : null}
        {offlineDraftCount > 0 ? (
          <div
            className="flex items-center gap-1 rounded-sm bg-amber-500/15 px-1.5 py-0.5 text-amber-600 dark:text-amber-400"
            title={`${offlineDraftCount} 条离线草稿待发`}
            data-testid="status-bar-offline-drafts"
          >
            <TbCloudOff className="size-3 shrink-0" aria-hidden="true" />
            <span className="text-[10px] font-medium">
              {offlineDraftCount} 草稿
            </span>
          </div>
        ) : null}
        <div
          className={cn("flex items-center gap-1", networkStyle.color)}
          data-testid="status-bar-network"
          data-network-status={networkStatus}
          title={`网络：${networkStyle.label}`}
        >
          <NetworkIcon className="size-3 shrink-0" aria-hidden="true" />
          <span className="text-[10px] font-medium">{networkStyle.label}</span>
        </div>
        {activeTaskCount > 0 ? (
          <div
            className="flex items-center gap-1 text-foreground/70"
            title={`${activeTaskCount} 个活跃任务`}
          >
            <span className="text-[10px] font-medium">{activeTaskCount}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
});
