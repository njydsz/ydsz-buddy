/**
 * @file 重试状态横幅组件
 *
 * 本组件展示智能重试的进度与状态：
 *
 * - **重试进度**：显示"正在重试 (2/5)..."
 * - **取消操作**：提供"取消重试"按钮
 * - **故障转移**：显示"切换到备用 Provider"选项
 * - **历史记录**：展示重试历史详情
 *
 * ## 核心导出
 *
 * - `RetryStatusBanner`：重试状态横幅组件
 *
 * ## 使用场景
 *
 * - Composer 顶部
 * - 聊天界面状态提示
 *
 * ## 注意事项
 *
 * - 仅在重试状态非 idle 时显示
 * - 提供用户控制权（取消、切换 Provider）
 * - 可展开查看重试历史
 */

import { memo, useState } from "react";
import type { ProviderKind } from "~/contracts";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "./ui/alert";
import { Button } from "./ui/button";
import { CircleAlertIcon, XIcon, ChevronDownIcon, ChevronUpIcon } from "~/lib/icons";
import type { RetryStatus, RetryHistoryEntry } from "~/hooks/useSmartRetry";
import type { FailoverStatus } from "~/hooks/useProviderFailover";

// ─── 类型定义 ─────────────────────────────────────────────────────────────────

/** 重试状态横幅 Props */
export interface RetryStatusBannerProps {
  /** 当前重试状态 */
  retryStatus: RetryStatus;
  /** 当前尝试次数 */
  currentAttempt: number;
  /** 最大重试次数 */
  maxRetries: number;
  /** 剩余等待毫秒 */
  remainingDelayMs: number;
  /** 重试历史 */
  history: ReadonlyArray<RetryHistoryEntry>;
  /** 故障转移状态 */
  failoverStatus?: FailoverStatus;
  /** 当前活跃 Provider */
  activeProvider?: ProviderKind;
  /** 推荐的备用 Provider */
  recommendedFallback?: ProviderKind | null;
  /** 取消重试回调 */
  onCancel?: () => void;
  /** 切换到备用 Provider 回调 */
  onSwitchProvider?: (target: ProviderKind) => void;
  /** 关闭横幅回调 */
  onDismiss?: () => void;
}

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

/**
 * 格式化毫秒为人类可读的字符串。
 *
 * @param ms - 毫秒数
 * @returns 格式化后的字符串（如 "2.5s", "30s"）
 */
function formatDelay(ms: number): string {
  if (ms <= 0) return "0s";
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * 获取错误分类的显示名称。
 */
function getErrorClassLabel(errorClass: string): string {
  switch (errorClass) {
    case "network":
      return "网络错误";
    case "timeout":
      return "超时";
    case "rate-limit":
      return "速率限制";
    case "server-error":
      return "服务器错误";
    case "client-error":
      return "客户端错误";
    default:
      return "未知错误";
  }
}

/**
 * 获取重试状态的显示消息。
 */
function getRetryStatusMessage(
  status: RetryStatus,
  currentAttempt: number,
  maxRetries: number,
  remainingDelayMs: number,
): string {
  switch (status) {
    case "retrying":
      if (remainingDelayMs > 0) {
        return `正在重试 (${currentAttempt}/${maxRetries})... ${formatDelay(remainingDelayMs)} 后重试`;
      }
      return `正在重试 (${currentAttempt}/${maxRetries})...`;
    case "waiting-retry-after":
      return `等待速率限制重置... ${formatDelay(remainingDelayMs)}`;
    case "cancelled":
      return "重试已取消";
    case "exhausted":
      return `重试失败：已达最大重试次数 (${maxRetries})`;
    case "success":
      return "重试成功";
    default:
      return "";
  }
}

/**
 * 获取横幅的 variant。
 */
function getAlertVariant(status: RetryStatus): "warning" | "error" | "info" | "success" {
  switch (status) {
    case "retrying":
    case "waiting-retry-after":
      return "warning";
    case "cancelled":
    case "exhausted":
      return "error";
    case "success":
      return "success";
    default:
      return "info";
  }
}

// ─── 组件 ─────────────────────────────────────────────────────────────────────

/**
 * 重试历史记录条目组件。
 */
const RetryHistoryItem = memo(function RetryHistoryItem({
  entry,
}: {
  entry: RetryHistoryEntry;
}) {
  return (
    <div className="flex items-start gap-2 text-xs text-muted-foreground py-1 border-b border-border/50 last:border-b-0">
      <span className="font-mono text-foreground/70">#{entry.attempt}</span>
      <span className="font-medium">{getErrorClassLabel(entry.errorClass)}</span>
      <span className="flex-1 truncate" title={entry.errorMessage}>
        {entry.errorMessage}
      </span>
      <span className="text-muted-foreground/70">
        {entry.delayMs > 0 ? `等待 ${formatDelay(entry.delayMs)}` : "立即"}
      </span>
    </div>
  );
});

/**
 * 重试状态横幅组件。
 *
 * @example
 * ```tsx
 * <RetryStatusBanner
 *   retryStatus={retry.status}
 *   currentAttempt={retry.currentAttempt}
 *   maxRetries={retry.maxRetries}
 *   remainingDelayMs={retry.remainingDelayMs}
 *   history={retry.history}
 *   onCancel={retry.cancel}
 *   onSwitchProvider={(target) => failover.switchProvider(target)}
 * />
 * ```
 */
export const RetryStatusBanner = memo(function RetryStatusBanner({
  retryStatus,
  currentAttempt,
  maxRetries,
  remainingDelayMs,
  history,
  failoverStatus,
  activeProvider,
  recommendedFallback,
  onCancel,
  onSwitchProvider,
  onDismiss,
}: RetryStatusBannerProps) {
  const [showHistory, setShowHistory] = useState(false);

  // 仅在重试状态非 idle 时显示
  if (retryStatus === "idle") {
    return null;
  }

  const message = getRetryStatusMessage(
    retryStatus,
    currentAttempt,
    maxRetries,
    remainingDelayMs,
  );
  const variant = getAlertVariant(retryStatus);
  const isRetrying = retryStatus === "retrying" || retryStatus === "waiting-retry-after";
  const hasHistory = history.length > 0;
  const canSwitchProvider =
    isRetrying && recommendedFallback && onSwitchProvider && failoverStatus !== "no-fallback";

  return (
    <div className="pt-3 mx-auto max-w-3xl px-4">
      <Alert variant={variant}>
        <CircleAlertIcon />
        <AlertTitle className="flex items-center gap-2">
          <span>{message}</span>
          {isRetrying && (
            <span className="text-xs font-normal text-muted-foreground">
              ({currentAttempt}/{maxRetries})
            </span>
          )}
        </AlertTitle>

        <AlertDescription className="flex flex-col gap-2">
          {/* 操作按钮 */}
          <div className="flex items-center gap-2 flex-wrap">
            {isRetrying && onCancel && (
              <Button
                size="sm"
                variant="outline"
                onClick={onCancel}
                className="text-xs"
              >
                取消重试
              </Button>
            )}

            {canSwitchProvider && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onSwitchProvider(recommendedFallback)}
                className="text-xs"
              >
                切换到 {recommendedFallback}
              </Button>
            )}

            {hasHistory && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowHistory(!showHistory)}
                className="text-xs gap-1"
              >
                {showHistory ? (
                  <>
                    隐藏历史 <ChevronUpIcon className="size-3" />
                  </>
                ) : (
                  <>
                    查看历史 ({history.length}) <ChevronDownIcon className="size-3" />
                  </>
                )}
              </Button>
            )}
          </div>

          {/* 重试历史 */}
          {showHistory && hasHistory && (
            <div className="mt-2 rounded-md border border-border/50 bg-background/50 p-2 max-h-40 overflow-y-auto">
              {history.map((entry, index) => (
                <RetryHistoryItem key={index} entry={entry} />
              ))}
            </div>
          )}

          {/* 故障转移提示 */}
          {failoverStatus === "no-fallback" && (
            <div className="text-xs text-destructive mt-1">
              无可用的备用 Provider，请检查 Provider 配置
            </div>
          )}

          {failoverStatus === "switched" && activeProvider && (
            <div className="text-xs text-success mt-1">
              已切换到 {activeProvider}
            </div>
          )}
        </AlertDescription>

        {onDismiss && (
          <AlertAction>
            <Button
              aria-label="Dismiss retry status"
              size="icon-xs"
              title="Dismiss retry status"
              variant="ghost"
              onClick={onDismiss}
            >
              <XIcon className="size-3.5" />
            </Button>
          </AlertAction>
        )}
      </Alert>
    </div>
  );
});
