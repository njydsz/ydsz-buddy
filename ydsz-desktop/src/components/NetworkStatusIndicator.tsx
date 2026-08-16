/**
 * @file NetworkStatusIndicator
 * @description 顶栏网络状态指示器
 *
 * 显示当前网络状态、Provider 降级状态和离线草稿数量。
 * 点击展开可看到详情：最近一次状态变化、自动故障转移历史。
 *
 * ## 视觉状态
 *
 * - **online**：默认不显示
 * - **degraded**：黄色徽章 + "Provider 不可达" 文案
 * - **offline**：红色徽章 + "已离线 · N 条草稿已保存"
 */

import { memo, useMemo } from "react";
import { FiWifiOff, FiAlertTriangle } from "react-icons/fi";
import { useNetworkStatus } from "~/hooks/useNetworkStatus";
import { useComposerOfflineDrafts } from "~/hooks/useComposerOfflineDrafts";
import type { ThreadId } from "~/contracts";

interface NetworkStatusIndicatorProps {
  threadId: ThreadId | null;
  /** 是否启用紧凑模式（仅图标，不显示文案） */
  compact?: boolean;
}

export const NetworkStatusIndicator = memo(function NetworkStatusIndicator({
  threadId,
  compact = false,
}: NetworkStatusIndicatorProps) {
  const { status, isOffline, isDegraded, lastChangeAt } = useNetworkStatus();
  const { totalCount } = useComposerOfflineDrafts(threadId);

  const indicator = useMemo(() => {
    if (isOffline) {
      return {
        icon: FiWifiOff,
        className: "text-rose-500 bg-rose-500/10 border-rose-500/30",
        label: "Offline",
        description: "Composer 草稿已自动暂存到本地",
        ariaLabel: "网络离线",
      };
    }
    if (isDegraded) {
      return {
        icon: FiAlertTriangle,
        className: "text-amber-500 bg-amber-500/10 border-amber-500/30",
        label: "Degraded",
        description: "Provider 不可达，发送可能失败",
        ariaLabel: "网络降级",
      };
    }
    return null;
  }, [isDegraded, isOffline]);

  if (!indicator) {
    return null;
  }

  const Icon = indicator.icon;
  const lastChange = lastChangeAt
    ? new Date(lastChangeAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "刚刚";

  return (
    <div
      role="status"
      aria-label={indicator.ariaLabel}
      title={`${indicator.description}（${lastChange}）`}
      data-status={status}
      className={[
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        indicator.className,
      ].join(" ")}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {!compact && (
        <>
          <span>{indicator.label}</span>
          {isOffline && totalCount > 0 && (
            <span className="rounded-full bg-rose-500/20 px-1.5 text-[10px] tabular-nums">
              {totalCount}
            </span>
          )}
        </>
      )}
    </div>
  );
});
