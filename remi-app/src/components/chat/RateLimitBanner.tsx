/**
 * @file RateLimitBanner
 * @description æ˜¾ç¤ºå½“å‰è´¦æˆ·çš„é€ŸçŽ‡é™åˆ¶çŠ¶æ€æ¨ªå¹…ï¼ŒåŒ…æ‹¬å·²è¾¾é™åˆ¶å’ŒæŽ¥è¿‘é™åˆ¶ä¸¤ç§çŠ¶æ€ï¼Œ
 *              æ”¯æŒæ˜¾ç¤ºé‡ç½®å€’è®¡æ—¶å’Œåˆ©ç”¨çŽ‡ç™¾åˆ†æ¯”ï¼Œå¹¶æä¾›å…³é—­æ“ä½œã€‚
 */

import { memo } from "react";
import type { OrchestrationThreadActivity } from "~/contracts";
import { Alert, AlertAction, AlertDescription } from "../ui/alert";
import { Button } from "../ui/button";
import { CircleAlertIcon, XIcon } from "~/lib/icons";

/** é€ŸçŽ‡é™åˆ¶çŠ¶æ€ï¼Œæè¿°å½“å‰è´¦æˆ·çš„è¯·æ±‚é¢‘çŽ‡é™åˆ¶æƒ…å†µ */
export type RateLimitStatus = {
  /** é™åˆ¶çŠ¶æ€ï¼šrejected è¡¨ç¤ºè¯·æ±‚è¢«æ‹’ç»ï¼Œallowed_warning è¡¨ç¤ºæŽ¥è¿‘é™åˆ¶ */
  status: "rejected" | "allowed_warning";
  /** é™åˆ¶é‡ç½®æ—¶é—´ï¼ˆISO 8601 æ ¼å¼ï¼‰ */
  resetsAt?: string;
  /** å½“å‰åˆ©ç”¨çŽ‡ï¼ˆ0-1 ä¹‹é—´çš„å°æ•°ï¼‰ */
  utilization?: number;
};

/**
 * å°†æœªçŸ¥å€¼å®‰å…¨è½¬æ¢ä¸ºæ™®é€šå¯¹è±¡ã€‚
 *
 * @param value - å¾…è½¬æ¢çš„å€¼
 * @returns è½¬æ¢åŽçš„æ™®é€šå¯¹è±¡ï¼Œè‹¥éžå¯¹è±¡åˆ™è¿”å›ž null
 */
function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

/**
 * ä»Žçº¿ç¨‹æ´»åŠ¨åˆ—è¡¨ä¸­æŽ¨å¯¼å‡ºæœ€æ–°çš„é€ŸçŽ‡é™åˆ¶çŠ¶æ€ã€‚
 * ä»Žæœ€æ–°æ´»åŠ¨å‘å‰éåŽ†ï¼Œè·³è¿‡å·²è¿‡æœŸçš„é™åˆ¶è®°å½•ã€‚
 *
 * @param activities - çº¿ç¨‹æ´»åŠ¨åˆ—è¡¨
 * @returns æœ€æ–°çš„é€ŸçŽ‡é™åˆ¶çŠ¶æ€ï¼Œè‹¥æ— æœ‰æ•ˆè®°å½•åˆ™è¿”å›ž null
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
    // If resetsAt is in the past, the limit has expired ï¿½?skip
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
 * æ ¼å¼åŒ–é™åˆ¶é‡ç½®æ—¶é—´ä¸ºå¯è¯»çš„å€’è®¡æ—¶æ–‡æœ¬ã€‚
 *
 * @param resetsAt - ISO 8601 æ ¼å¼çš„é‡ç½®æ—¶é—´
 * @returns æ ¼å¼åŒ–åŽçš„å€’è®¡æ—¶å­—ç¬¦ä¸²ï¼Œå¦‚ " Resets in 5s." æˆ– " Resets in 2m."
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
 * é€ŸçŽ‡é™åˆ¶æ¨ªå¹…ç»„ä»¶ã€‚
 * æ ¹æ®é€ŸçŽ‡é™åˆ¶çŠ¶æ€æ˜¾ç¤ºé”™è¯¯æˆ–è­¦å‘Šæç¤ºï¼ŒåŒ…å«é™åˆ¶æè¿°ã€é‡ç½®å€’è®¡æ—¶å’Œå…³é—­æŒ‰é’®ã€‚
 *
 * @param props.onDismiss - å…³é—­æ¨ªå¹…çš„å›žè°ƒå‡½æ•°
 * @param props.rateLimitStatus - å½“å‰çš„é€ŸçŽ‡é™åˆ¶çŠ¶æ€ï¼Œä¸º null æ—¶ä¸æ¸²æŸ“
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
