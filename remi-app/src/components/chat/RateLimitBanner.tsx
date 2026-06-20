/**
 * @file RateLimitBanner
 * @description 显示当前账户的速率限制状态横幅，包括已达限制和接近限制两种状态，
 *              支持显示重置倒计时和利用率百分比，并提供关闭操作。
 */

import { memo } from "react";
import type { OrchestrationThreadActivity } from "~/contracts";
import { Alert, AlertAction, AlertDescription } from "../ui/alert";
import { Button } from "../ui/button";
import { CircleAlertIcon, XIcon } from "~/lib/icons";

/** 速率限制状态，描述当前账户的请求频率限制情况 */
export type RateLimitStatus = {
  /** 限制状态：rejected 表示请求被拒绝，allowed_warning 表示接近限制 */
  status: "rejected" | "allowed_warning";
  /** 限制重置时间（ISO 8601 格式） */
  resetsAt?: string;
  /** 当前利用率（0-1 之间的小数） */
  utilization?: number;
};

/**
 * 将未知值安全转换为普通对象。
 *
 * @param value - 待转换的值
 * @returns 转换后的普通对象，若非对象则返回 null
 */
function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

/**
 * 从线程活动列表中推导出最新的速率限制状态。
 * 从最新活动向前遍历，跳过已过期的限制记录。
 *
 * @param activities - 线程活动列表
 * @returns 最新的速率限制状态，若无有效记录则返回 null
 */
export function deriveLatestRateLimitStatus(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
): RateLimitStatus | null {
  const now = Date.now();
  for (let i = activities.length - 1; i >= 0; i--) {
    const activity = activities[i];
    if (!activity || activity.kind !== "account.rate-limited") continue;
    const payload = asRecord(activity.payload);
    if (!payload) continue;
    const status = payload.status;
    if (status !== "rejected" && status !== "allowed_warning") continue;
    // If resetsAt is in the past, the limit has expired �?skip
    if (typeof payload.resetsAt === "string") {
      const resetsAtMs = Date.parse(payload.resetsAt);
      if (!Number.isNaN(resetsAtMs) && resetsAtMs < now) continue;
    }
    return {
      status,
      ...(typeof payload.resetsAt === "string" ? { resetsAt: payload.resetsAt } : {}),
      ...(typeof payload.utilization === "number" ? { utilization: payload.utilization } : {}),
    };
  }
  return null;
}

/**
 * 格式化限制重置时间为可读的倒计时文本。
 *
 * @param resetsAt - ISO 8601 格式的重置时间
 * @returns 格式化后的倒计时字符串，如 " Resets in 5s." 或 " Resets in 2m."
 */
function formatResetsAt(resetsAt: string): string {
  const ms = Date.parse(resetsAt);
  if (Number.isNaN(ms)) return "";
  const secondsLeft = Math.max(0, Math.ceil((ms - Date.now()) / 1000));
  if (secondsLeft < 60) return ` Resets in ${secondsLeft}s.`;
  const minutesLeft = Math.ceil(secondsLeft / 60);
  return ` Resets in ${minutesLeft}m.`;
}

/**
 * 速率限制横幅组件。
 * 根据速率限制状态显示错误或警告提示，包含限制描述、重置倒计时和关闭按钮。
 *
 * @param props.onDismiss - 关闭横幅的回调函数
 * @param props.rateLimitStatus - 当前的速率限制状态，为 null 时不渲染
 */
export const RateLimitBanner = memo(function RateLimitBanner({
  onDismiss,
  rateLimitStatus,
}: {
  onDismiss?: () => void;
  rateLimitStatus: RateLimitStatus | null;
}) {
  if (!rateLimitStatus) return null;

  const { status, resetsAt, utilization } = rateLimitStatus;
  const isRejected = status === "rejected";

  const message = isRejected
    ? `Rate limit reached.${resetsAt ? formatResetsAt(resetsAt) : ""}`
    : `Approaching rate limit${utilization !== undefined ? ` (${Math.round(utilization * 100)}% used)` : ""}.${resetsAt ? formatResetsAt(resetsAt) : ""}`;

  return (
    <div className="pt-3 mx-auto max-w-3xl px-4">
      <Alert variant={isRejected ? "error" : "warning"}>
        <CircleAlertIcon />
        <AlertDescription>{message}</AlertDescription>
        {onDismiss ? (
          <AlertAction>
            <Button
              aria-label="Dismiss rate limit status"
              size="icon-xs"
              title="Dismiss rate limit status"
              variant="ghost"
              onClick={onDismiss}
            >
              <XIcon className="size-3.5" />
            </Button>
          </AlertAction>
        ) : null}
      </Alert>
    </div>
  );
});
