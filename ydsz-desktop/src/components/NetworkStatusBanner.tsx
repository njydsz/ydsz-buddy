/**
 * @file 网络状态横幅组件
 *
 * 本组件在页面顶部显示网络状态提示，当离线或降级时展示警告信息。
 *
 * ## 核心功能
 *
 * - **离线提示**：显示"已断开网络连接"并显示暂存草稿数量 + 重试按钮
 * - **降级提示**：显示"连接不稳定"并提供诊断信息
 * - **自动恢复**：网络恢复后自动隐藏
 *
 * ## 使用场景
 *
 * - ChatView 顶部横幅
 * - 全局网络状态指示
 *
 * ## 注意事项
 *
 * - 离线状态下不阻断发送（消息会被暂存为离线草稿，联网后自动补发）
 * - 降级状态下显示警告但不阻断操作
 * - 支持手动重试连接
 */

import { memo } from "react";
import { PiWifiSlash, PiWarning, PiX } from "react-icons/pi";
import { Button } from "./ui/button";
import { cn } from "~/lib/utils";
import type { NetworkStatus } from "~/hooks/useNetworkStatus";
import { useMessages } from "../i18n";

interface NetworkStatusBannerProps {
  /** 网络状态 */
  status: NetworkStatus;
  /** 当前线程的离线草稿数量（可选，用于显示"已暂存 N 条"） */
  offlineDraftCount?: number;
  /** 关闭回调 */
  onDismiss?: () => void;
  /** 重试回调 */
  onRetry?: () => void;
  /** 立即发送所有草稿回调 */
  onFlushDrafts?: () => void;
}

export const NetworkStatusBanner = memo(function NetworkStatusBanner({
  status,
  offlineDraftCount = 0,
  onDismiss,
  onRetry,
  onFlushDrafts,
}: NetworkStatusBannerProps) {
  const messages = useMessages();
  const t = messages.networkStatus;

  if (status === "online") return null;

  const isOffline = status === "offline";
  const isDegraded = status === "degraded";

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center gap-3 border-b px-4 py-2 text-sm",
        isOffline && "bg-red-500/10 border-red-500/20 text-red-700 dark:text-red-400",
        isDegraded && "bg-yellow-500/10 border-yellow-500/20 text-yellow-700 dark:text-yellow-400",
      )}
    >
      {isOffline ? (
        <PiWifiSlash className="size-4 shrink-0" aria-hidden />
      ) : (
        <PiWarning className="size-4 shrink-0" aria-hidden />
      )}

      <div className="flex-1">
        {isOffline
          ? offlineDraftCount > 0
            ? t.offlineMessageWithCount(offlineDraftCount)
            : t.offlineMessage
          : t.degradedMessage}
      </div>

      {isOffline && onFlushDrafts && offlineDraftCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onFlushDrafts}
          className="h-7 px-2 text-xs"
          aria-label={t.flushAllButton}
        >
          {t.flushAllButton}
        </Button>
      )}

      {isOffline && onRetry && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onRetry}
          className="h-7 px-2 text-xs"
        >
          {messages.common.retry}
        </Button>
      )}

      {onDismiss && (
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onDismiss}
          aria-label={t.dismissAria}
        >
          <PiX className="size-3" />
        </Button>
      )}
    </div>
  );
});
